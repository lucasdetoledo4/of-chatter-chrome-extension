import type {
  ConversationMessage,
  FanProfile,
  CreatorProfile,
  CreatorAccount,
  BackgroundResponse,
  GetSuggestionsRequest,
  SuggestionMode,
} from '../types/index';
import {
  observeChat,
  scrapeConversationHistory,
  findChatContainer,
  scrapeFanName,
  detectFanOnlineStatus,
  scrapePpvPurchases,
} from './dom-observer';
import { UIOverlay } from './ui-overlay';
import {
  upsertFanProfile,
  getFanProfile,
  upsertCreatorProfile,
  getCreators,
} from '../utils/storage';
import { pickVariationHint } from '../utils/variation-hints';
import { scrapeCreatorProfile, scrapeCreatorFromNav, diagnoseProfileScraper } from './profile-scraper';
import { findAnchorElement, insertIntoChat } from './chat-input';
import { startInboxTagger, stopInboxTagger } from './inbox-tagger';
import {
  getCreatorId,
  getCreatorProfile,
  setCreatorProfile,
  setCreatorType,
  loadCreatorState,
  getActivePersona,
  normalizeCreatorName,
  inferPersonaType,
  triggerStyleAnalysisIfNeeded,
  fetchCreatorBio,
  upsertCreatorAccount,
} from './creator-state';
import {
  INJECT_RETRY_LIMIT,
  INJECT_RETRY_DELAY_MS,
  SPA_NAV_DEBOUNCE_MS,
  MESSAGE_DEBOUNCE_MS,
  ONLINE_POLL_MS,
  CHAT_URL_PATTERNS,
  TRIGGER_SELL_RE,
  StorageKey,
} from '../utils/constants';


// ─── Mock window ──────────────────────────────────────────────────────────────

const w = window as typeof window & {
  __OFC_MOCK__?: boolean;
  __OFC_MOCK_FAN_ID__?: string;
};

// ─── Module-level refs ────────────────────────────────────────────────────────

// Exposed refs so the storage change listener can update the active overlay
let overlay: UIOverlay | null = null;
let lastRequest: GetSuggestionsRequest | null = null;

// ─── Creator Switch Listener ───────────────────────────────────────────────────

// Reacts to popup changes (ACTIVE_CREATOR_ID or CREATORS) without requiring a page reload.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (!(StorageKey.ActiveCreatorId in changes || StorageKey.Creators in changes)) return;
  void loadCreatorState().then(async () => {
    const creators = await getCreators();
    overlay?.setCreators(creators, getCreatorId());
    if (lastRequest) {
      const req = {
        ...lastRequest,
        creatorPersona: getActivePersona(),
        creatorProfile: getCreatorProfile() ?? undefined,
      };
      lastRequest = req;
      overlay?.showLoading();
      void fireSuggestionsRequest(req, overlay!);
    }
  });
});

// ─── URL Helpers ──────────────────────────────────────────────────────────────

/**
 * Extract the fan/conversation ID from OF chat URLs.
 *
 * Observed URL formats (validated 2025-02):
 * - /my/chats/chat/{userId}   — individual conversation
 * - /my/chats/                — chat list (no fan ID, skip)
 * - /messages/{userId}        — alternate route
 *
 * The extra "chat" path segment before the numeric user ID is specific
 * to OF's router and must be skipped.
 */
function extractFanIdFromUrl(pathname: string): string | null {
  if (w.__OFC_MOCK__) return w.__OFC_MOCK_FAN_ID__ ?? 'mock-fan';

  // Handle /my/chats/chat/{userId}
  const chatMatch = pathname.match(/\/my\/chats\/chat\/([^/?#]+)/);
  if (chatMatch) return chatMatch[1];

  // Handle /messages/{userId}
  const msgMatch = pathname.match(/\/messages\/([^/?#]+)/);
  if (msgMatch) return msgMatch[1];

  return null;
}

function isOnChatPage(): boolean {
  if (w.__OFC_MOCK__) return true;
  return CHAT_URL_PATTERNS.some((p) => location.pathname.includes(p));
}

// ─── Suggestion Flow ──────────────────────────────────────────────────────────

async function requestSuggestions(
  request: GetSuggestionsRequest
): Promise<BackgroundResponse> {
  try {
    return await chrome.runtime.sendMessage<GetSuggestionsRequest, BackgroundResponse>(
      request
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Service worker error: ${message}` };
  }
}

async function handleNewMessage(
  msg: ConversationMessage,
  fanId: string,
  overlay: UIOverlay,
  onRequest: (req: GetSuggestionsRequest) => void
): Promise<void> {
  overlay.showLoading();
  try {
    await _handleNewMessageInner(msg, fanId, overlay, onRequest);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Unexpected error — please reload the page.';
    overlay.showError(errMsg);
  }
}

async function _handleNewMessageInner(
  msg: ConversationMessage,
  fanId: string,
  overlay: UIOverlay,
  onRequest: (req: GetSuggestionsRequest) => void
): Promise<void> {
  // Get or create fan profile
  let fanProfile = await getFanProfile(fanId);
  if (!fanProfile) {
    fanProfile = await upsertFanProfile(fanId, {
      displayName: fanId,
      lastSeen: new Date().toISOString(),
      messageCount: 1,
    });
  } else {
    fanProfile = await upsertFanProfile(fanId, {
      messageCount: fanProfile.messageCount + 1,
      lastSeen: new Date().toISOString(),
    });
  }

  // Enrich displayName from page if it's still the raw fanId
  const scrapedName = scrapeFanName();
  if (scrapedName && fanProfile.displayName === fanId) {
    fanProfile = await upsertFanProfile(fanId, { displayName: scrapedName });

  }

  // Auto-track PPV purchases visible in the current conversation
  const scrapedPpvs = scrapePpvPurchases();
  if (scrapedPpvs.length > 0) {
    const existingIds = new Set(fanProfile.ppvHistory.map((p) => p.contentId));
    const newPpvs = scrapedPpvs.filter((p) => !existingIds.has(p.contentId));
    if (newPpvs.length > 0) {
      const addedValue = newPpvs.reduce((sum, p) => sum + p.price, 0);
      fanProfile = await upsertFanProfile(fanId, {
        ppvHistory: [
          ...fanProfile.ppvHistory,
          ...newPpvs.map((p) => ({ contentId: p.contentId, price: p.price, date: new Date().toISOString() })),
        ],
        lifetimeValue: fanProfile.lifetimeValue + addedValue,
      });

    }
  }

  // Store fan message so the overlay can send it with translation requests
  overlay.setLastFanMessage(msg.text);

  // Show fan context strip immediately — persists through loading/suggestions/error
  overlay.showFanContext(fanProfile);

  // Surface online status if detectable in the chat header DOM
  overlay.setOnlineStatus(detectFanOnlineStatus());

  // Build conversation context (scraped history + new message appended)
  const history = scrapeConversationHistory();
  // Avoid duplicating the triggering message if it was already scraped
  const lastScraped = history[history.length - 1];
  const conversation: ConversationMessage[] =
    lastScraped?.text === msg.text ? history : [...history, msg];

  // Extract creator's own sent messages for persona grounding.
  // prompt-builder slices to the last 5 internally; no pre-slice here.
  const creatorRealMessages = conversation
    .filter((m) => m.role === 'creator')
    .map((m) => m.text);

  // Kick off style analysis in background if we have enough messages
  triggerStyleAnalysisIfNeeded(creatorRealMessages);

  // Auto-switch to Sell mode when the fan's message contains high-intent keywords.
  // Only fires if not already in Sell mode — never overrides a chatter's manual selection.
  if (msg.role === 'fan' && activeSuggestionMode !== 'sell') {
    const triggerMatch = msg.text.match(TRIGGER_SELL_RE);
    if (triggerMatch) {
      const keyword = triggerMatch[0].toLowerCase();
      activeSuggestionMode = 'sell';
      overlay.setMode('sell');
      overlay.showTriggerNotice(`"${keyword}" detected`);
      void chrome.storage.local.set({
        [StorageKey.SuggestionMode]: 'sell',
        [StorageKey.FanModePrefix + fanId]: 'sell',
      });

    }
  }

  const req: GetSuggestionsRequest = {
    type: 'GET_SUGGESTIONS',
    conversation,
    fanProfile,
    creatorPersona: getActivePersona(),
    creatorProfile: getCreatorProfile() ?? undefined,
    creatorRealMessages,
    mode: activeSuggestionMode,
  };

  // Expose the request so regenerate can replay it
  onRequest(req);

  await fireSuggestionsRequest(req, overlay);
}

async function fireSuggestionsRequest(
  req: GetSuggestionsRequest,
  overlay: UIOverlay
): Promise<void> {
  const gen = ++_suggestionGeneration;
  const response = await requestSuggestions(req);
  if (gen !== _suggestionGeneration) return; // superseded by a newer request
  if (response.success) {
    overlay.showSuggestions(response.suggestions);
  } else {
    overlay.showError(response.error);
  }
}

// ─── Initialization ───────────────────────────────────────────────────────────

// Module-level refs so we can tear down the previous instance on SPA re-navigation.
// Without these, navigating away and back creates duplicate panels and stale observers.
let _activeHostGuard: MutationObserver | null = null;
let _activeStopObserver: (() => void) | null = null;
let _onlineCheckInterval: ReturnType<typeof setInterval> | null = null;
let _messageDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingMessage: ConversationMessage | null = null;
let activeSuggestionMode: SuggestionMode = 'sell';
// Incremented on every new suggestion request. Responses from superseded
// requests are discarded, preventing races when fan messages arrive fast.
let _suggestionGeneration = 0;
// Incremented each time initializeChatAssistant() starts. tryInject and
// startObserver closures capture this and bail out if a newer init has
// superseded them — prevents retry loops from running after navigation.
let _initGeneration = 0;

async function initializeChatAssistant(): Promise<void> {
  // Tear down previous instance before starting fresh.
  // The UIOverlay.inject() also removes any stale DOM host, so together these
  // two guards eliminate the "two panels on SPA re-navigation" bug.
  _activeHostGuard?.disconnect();
  _activeHostGuard = null;
  _activeStopObserver?.();
  _activeStopObserver = null;
  if (_onlineCheckInterval) { clearInterval(_onlineCheckInterval); _onlineCheckInterval = null; }
  if (_messageDebounceTimer) { clearTimeout(_messageDebounceTimer); _messageDebounceTimer = null; }
  _pendingMessage = null;
  _suggestionGeneration = 0; // prevent stale gen values across re-navigations
  lastRequest = null;
  const myGen = ++_initGeneration; // cancel stale retry loops from previous init

  const fanId = extractFanIdFromUrl(location.pathname);
  if (!fanId) return;

  // Load creator state (multi-creator) and cached creator profile
  await loadCreatorState();

  // Restore suggestion mode: fan-specific key takes precedence over global fallback.
  // This lets chatters use different modes per fan without affecting other conversations.
  const fanModeKey = StorageKey.FanModePrefix + fanId;
  const modeResult = await chrome.storage.local.get([StorageKey.SuggestionMode, fanModeKey]);
  const fanSpecificMode = modeResult[fanModeKey] as SuggestionMode | undefined;
  const globalMode = modeResult[StorageKey.SuggestionMode] as SuggestionMode | undefined;
  activeSuggestionMode = fanSpecificMode ?? globalMode ?? 'sell';

  // Scrape creator identity from the sidebar nav — available on every page,
  // so we get the real name without requiring a profile page visit.
  // Guard: reject the result if it matches the chat partner's name. This prevents
  // the DOM selector from picking up the chat partner's name from the sidebar
  // conversation list instead of the logged-in user's nav identity.
  const chatPartnerName = scrapeFanName();
  const navCreator = scrapeCreatorFromNav();
  if (navCreator && navCreator.displayName !== chatPartnerName) {
    const scrapedName = navCreator.displayName;


    const allCreators = await getCreators();
    const normalizedScraped = normalizeCreatorName(scrapedName);

    // Find a stored creator whose name fuzzy-matches the scraped nav identity.
    // This lets the extension auto-switch when the chatter toggles between OF accounts.
    const match = allCreators.find(
      (c) => normalizeCreatorName(c.name) === normalizedScraped
    );

    if (match && match.id !== getCreatorId()) {
      // Nav identifies a different stored creator — auto-switch to it.

      await chrome.storage.sync.set({ [StorageKey.ActiveCreatorId]: match.id });
      await loadCreatorState(); // refresh state for matched creator
    } else if (!match) {
      // First time seeing this creator — auto-create from nav identity.
      // Type starts as 'woman' (default); the bio fetch below refines it asynchronously.
      const newId = `c_${Date.now()}`;
      const newCreator: CreatorAccount = {
        id: newId,
        name: scrapedName,
        type: 'woman',
        createdAt: new Date().toISOString(),
      };
      await upsertCreatorAccount(newCreator);
      await chrome.storage.sync.set({ [StorageKey.ActiveCreatorId]: newId });
      await loadCreatorState(); // refresh state for new creator

    }

    // Always sync the scraped display name to the creator profile.
    setCreatorProfile(await upsertCreatorProfile(getCreatorId(), { displayName: scrapedName }));
  } else if (navCreator) {
    console.warn(`[OFC] Nav selector returned chat partner's name ("${navCreator.displayName}") — skipping to avoid overwriting creator identity.`);
  }

  // If bio isn't cached yet, fetch it from the profile page to infer persona type.
  // Fire-and-forget: doesn't block overlay creation or the first suggestion request.
  // On completion it updates chrome.storage so the correct type is used from the
  // next request onward; cachedCreatorType is also patched in-memory for this session.
  const navUsername = navCreator?.username ?? null;
  if (!w.__OFC_MOCK__ && navUsername && !getCreatorProfile()?.bio) {
    void (async () => {
      const bio = await fetchCreatorBio(navUsername);
      if (!bio) return;

      setCreatorProfile(await upsertCreatorProfile(getCreatorId(), { bio }));


      // Only auto-update the persona type if the chatter hasn't set it manually
      // (i.e. it's still the default 'woman' assigned on creation).
      const creators = await getCreators();
      const creator = creators.find((c) => c.id === getCreatorId());
      if (creator && creator.type === 'woman') {
        const inferredType = inferPersonaType(bio, creator.name);
        if (inferredType !== 'woman') {
          await upsertCreatorAccount({ ...creator, type: inferredType });
          setCreatorType(inferredType); // patch in-memory so current session uses it

        }
      }
    })();
  }

  overlay = new UIOverlay();
  overlay.setMode(activeSuggestionMode); // apply persisted mode before first inject
  const currentOverlay = overlay;
  overlay.setInsertHandler((text) => {
    const result = insertIntoChat(text);
    if (result === 'clipboard') currentOverlay.showClipboardNotice();
    void (async () => {
      const p = await getFanProfile(fanId);
      const recent = (p?.usedSuggestions ?? []).slice(-9);
      await upsertFanProfile(fanId, { usedSuggestions: [...recent, text] });
    })();
  });
  overlay.setNotesSaveHandler((notes) => { void upsertFanProfile(fanId, { notes }); });

  overlay.setRegenerateHandler(() => {
    if (lastRequest) {
      overlay!.showRegenLoading();
      void fireSuggestionsRequest(
        { ...lastRequest, variationHint: pickVariationHint() },
        overlay!
      );
    }
  });

  overlay.setModeChangeHandler((mode) => {
    activeSuggestionMode = mode;
    // Write both global default and fan-specific key so:
    // - other fans see this as the new global default
    // - this fan always resumes with the mode set for them
    void chrome.storage.local.set({
      [StorageKey.SuggestionMode]: mode,
      [StorageKey.FanModePrefix + fanId]: mode,
    });
    if (lastRequest) {
      const req = { ...lastRequest, mode };
      lastRequest = req; // keep regen in sync with current mode
      overlay!.showLoading();
      void fireSuggestionsRequest(req, overlay!);
    }
  });

  // Wire creator switcher — sets ACTIVE_CREATOR_ID, which triggers the onChanged
  // listener to reload state and re-fire suggestions
  overlay.setCreatorSwitchHandler(async (id) => {
    await chrome.storage.sync.set({ [StorageKey.ActiveCreatorId]: id });
  });

  // Pass initial creator list to the overlay
  const creators = await getCreators();
  overlay.setCreators(creators, getCreatorId());

  // Poll for fan online status every ONLINE_POLL_MS (initial check happens in handleNewMessage)
  _onlineCheckInterval = setInterval(() => {
    overlay?.setOnlineStatus(detectFanOnlineStatus());
  }, ONLINE_POLL_MS);

  // Retry injection — OF Vue app may not have rendered the anchor yet
  let attempts = 0;
  const tryInject = (): void => {
    if (_initGeneration !== myGen) return; // superseded by newer navigation
    if (overlay!.isAttached()) return;

    const { el: anchor, pos } = findAnchorElement();
    overlay!.inject(anchor, pos);

    if (overlay!.isAttached()) {

      startObserver();
    } else if (attempts < INJECT_RETRY_LIMIT) {
      attempts++;
      setTimeout(tryInject, INJECT_RETRY_DELAY_MS);
    } else {
      console.warn('[OFC] Failed to inject suggestion panel after max retries.');
    }
  };

  // Retry the observer separately — the chat container (b-chat__messages) is
  // rendered by Vue asynchronously and may not exist when the overlay first attaches.
  let observerAttempts = 0;
  const startObserver = (): void => {
    if (_initGeneration !== myGen) return; // superseded by newer navigation
    _activeStopObserver?.();
    _activeStopObserver = null;
    if (!findChatContainer()) {
      if (observerAttempts < INJECT_RETRY_LIMIT) {
        observerAttempts++;
        setTimeout(startObserver, INJECT_RETRY_DELAY_MS);
      } else {
        console.warn('[OFC] Chat container never appeared — observer not started.');
      }
      return;
    }
    observerAttempts = 0;
    _activeStopObserver = observeChat((msg) => {
      // Debounce: if the fan sends several messages in quick succession, wait for
      // the burst to settle before firing an API call. Use the last message seen.
      _pendingMessage = msg;
      if (_messageDebounceTimer) clearTimeout(_messageDebounceTimer);
      _messageDebounceTimer = setTimeout(() => {
        _messageDebounceTimer = null;
        const pending = _pendingMessage;
        _pendingMessage = null;
        if (pending) void handleNewMessage(pending, fanId, overlay!, (req) => { lastRequest = req; });
      }, MESSAGE_DEBOUNCE_MS);
    });
  };

  tryInject();

  // Host-guard: React may unmount and recreate DOM nodes, wiping the injected panel.
  // Re-inject whenever the panel disappears from the document.
  const hostGuard = new MutationObserver(() => {
    if (!overlay?.isAttached()) {

      attempts = 0;
      tryInject();
    }
  });
  hostGuard.observe(document.body, { childList: true, subtree: true });
  _activeHostGuard = hostGuard;
}

// ─── SPA Navigation ───────────────────────────────────────────────────────────

let lastUrl = location.href;
let navDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const navObserver = new MutationObserver(() => {
  if (location.href === lastUrl) return;
  lastUrl = location.href;

  if (navDebounceTimer) clearTimeout(navDebounceTimer);

  navDebounceTimer = setTimeout(() => {
    if (isOnChatPage()) {
      const fanId = extractFanIdFromUrl(location.pathname);
      // Always keep inbox tagger running — left panel list stays visible in split view
      startInboxTagger();
      if (fanId) {

        void initializeChatAssistant();
      } else {
        // Inbox only — tear down any open chat panel
        overlay?.remove();
        overlay = null;
        lastRequest = null;

      }
    } else {
      // Navigated away from chats entirely — stop everything
      stopInboxTagger();
      overlay?.remove();
      overlay = null;
      lastRequest = null;

      // Opportunistically scrape creator profile data on profile pages
      const scraped = scrapeCreatorProfile();
      if (scraped) {
        void upsertCreatorProfile(getCreatorId(), {
          displayName: scraped.displayName,
          bio: scraped.bio,
          profilePhotoUrl: scraped.profilePhotoUrl,
          recentCaptions: scraped.recentCaptions,
          scrapedAt: new Date().toISOString(),
        }).then(async (profile) => {
          setCreatorProfile(profile);

          // Auto-update the creator account name + persona type from the scraped profile.
          if (profile.bio) {
            const creators = await getCreators();
            const creator = creators.find((c) => c.id === getCreatorId());
            if (creator) {
              const inferredType = inferPersonaType(profile.bio, profile.displayName);
              const nameChanged = profile.displayName && profile.displayName !== creator.name;
              const typeChanged = inferredType !== creator.type && creator.type === 'woman';
              if (nameChanged || typeChanged) {
                const updated: CreatorAccount = {
                  ...creator,
                  name: profile.displayName || creator.name,
                  type: typeChanged ? inferredType : creator.type,
                };
                await upsertCreatorAccount(updated);

                // onChanged fires → overlay creator name + panel update
              }
            }
          }
        });
      }
    }
  }, SPA_NAV_DEBOUNCE_MS);
});

navObserver.observe(document.body, { childList: true, subtree: true });

// Initial page load
if (isOnChatPage()) {
  // Always start inbox tagger — left panel list is visible on all chat pages
  startInboxTagger();
  const _initialFanId = extractFanIdFromUrl(location.pathname);
  if (_initialFanId) {
    void initializeChatAssistant();
  }
}

// ─── DevTools Diagnostic ──────────────────────────────────────────────────────
// Content scripts run in an isolated world — window.__OFC_* set here would be
// invisible to the DevTools console (which runs in the page's main world).
// Fix: inject thin shim functions into the main world that postMessage back to
// this isolated script, which retains full chrome.* API access.

// Inject via src (not inline) to satisfy OF's Content Security Policy.
// content/diag-bridge.js is declared in web_accessible_resources so the
// extension origin is trusted by OF's CSP allowlist.
const _diagBridge = document.createElement('script');
_diagBridge.src = chrome.runtime.getURL('content/diag-bridge.js');
_diagBridge.onload = () => _diagBridge.remove();
document.documentElement.appendChild(_diagBridge);

window.addEventListener('message', (e: MessageEvent) => {
  if (!e.data?.__ofc) return;

  if (e.data.fn === 'diagnoseProfile') {
    diagnoseProfileScraper();
    return;
  }

  if (e.data.fn !== 'diagnose') return;

  console.group('[OFC] Diagnostic report');

  // URL / routing
  console.group('Routing');
  console.log('pathname:', location.pathname);
  console.log('isOnChatPage:', isOnChatPage());
  console.log('fanId:', extractFanIdFromUrl(location.pathname));
  console.groupEnd();

  // Chat container
  console.group('Chat container (dom-observer.ts › findChatContainer)');
  const byTestId = document.querySelector('[data-testid="chat-messages"]');
  console.log('[data-testid="chat-messages"]:', byTestId ?? 'NOT FOUND');
  const byRole = document.querySelector('[role="main"]');
  console.log('[role="main"]:', byRole ?? 'NOT FOUND');
  if (byRole) {
    const scrollable = Array.from(byRole.children).find((el) => {
      const s = window.getComputedStyle(el);
      return s.overflowY === 'auto' || s.overflowY === 'scroll';
    });
    console.log('  first scrollable child of [role="main"]:', scrollable ?? 'NOT FOUND');
  }
  console.groupEnd();

  // Message nodes
  console.group('Message nodes (dom-observer.ts › extractMessageFromNode)');
  const container = byTestId ?? byRole;
  if (container) {
    const allMessages = Array.from(container.querySelectorAll('[class*="message"]'));
    console.log(`[class*="message"] nodes found: ${allMessages.length}`);
    const fanMessages = allMessages.filter(
      (n) => n.getAttribute('data-from-fan') === 'true' || n.classList.contains('from-fan')
    );
    console.log(`fan messages detected: ${fanMessages.length}`);
    if (allMessages.length > 0) {
      console.log('sample node classes:', allMessages[0]?.className);
    }
  } else {
    console.warn('No container found — cannot inspect message nodes');
  }
  console.groupEnd();

  // Anchor / chat input
  console.group('Anchor element (chat-input.ts › findAnchorElement)');
  const anchor = findAnchorElement();
  console.log('resolved anchor:', anchor);
  console.log('  via [data-testid="chat-input"]:', document.querySelector('[data-testid="chat-input"]') ?? 'NOT FOUND');
  console.log('  via [role="textbox"]:', document.querySelector('[role="textbox"]') ?? 'NOT FOUND');
  console.log('  via form:', document.querySelector('form') ?? 'NOT FOUND');
  console.groupEnd();

  // Chat input type (affects insertion strategy)
  console.group('Chat input type (chat-input.ts › insertIntoChat)');
  const input = document.querySelector<HTMLElement>('[data-testid="chat-input"]') ?? document.querySelector<HTMLElement>('[role="textbox"]');
  if (input) {
    console.log('element:', input);
    console.log('tag:', input.tagName);
    console.log('isContentEditable:', input.isContentEditable);
    console.log('type:', input instanceof HTMLInputElement ? input.type : 'n/a');
    console.log('insertion strategy:', input.isContentEditable ? 'execCommand' : 'native value setter');
  } else {
    console.warn('No chat input found — insertion will fall back to clipboard');
  }
  console.groupEnd();

  // Fan name scraping
  console.group('Fan name (dom-observer.ts › scrapeFanName)');
  console.log('document.title:', document.title);
  const titleMatch = document.title.match(/^(.+?)\s*[|·—-]\s*OnlyFans/i);
  console.log('title regex match:', titleMatch ?? 'NO MATCH');
  if (titleMatch?.[1]) {
    const candidate = titleMatch[1].trim();
    console.log('candidate name:', candidate, candidate.toLowerCase() === 'onlyfans' ? '← REJECTED' : '← OK');
  }
  const scrapedFanName = scrapeFanName();
  console.log('scrapeFanName() result:', scrapedFanName ?? 'null — falling back to fanId');
  if (!scrapedFanName) {
    const fallbackEls = [
      '[at-attr="chat_header"] .g-user-name',
      '.b-chat__header .g-user-name',
      '[class*="chat__user-name"]',
      '[data-testid="chat-partner-name"]',
    ];
    for (const sel of fallbackEls) {
      const el = document.querySelector(sel);
      console.log(`  ${el ? '✓' : '✗'} ${sel}`, el ?? '');
    }
  }
  console.groupEnd();

  // Creator identity (logged-in user — present on all pages via nav/sidebar)
  console.group('Creator identity from nav (candidate selectors)');
  const navCandidates: [string, Element | null][] = [
    ['[at-attr="nav_username"]',           document.querySelector('[at-attr="nav_username"]')],
    ['[at-attr="sidebar_username"]',       document.querySelector('[at-attr="sidebar_username"]')],
    ['.b-sidebar__user .g-user-name',      document.querySelector('.b-sidebar__user .g-user-name')],
    ['.b-nav__user .g-user-name',          document.querySelector('.b-nav__user .g-user-name')],
    ['.b-navigation .g-user-name',         document.querySelector('.b-navigation .g-user-name')],
    ['[class*="sidebar"] .g-user-name',    document.querySelector('[class*="sidebar"] .g-user-name')],
    ['[class*="sidebar"] .g-user-username',document.querySelector('[class*="sidebar"] .g-user-username')],
    ['[class*="nav__user"]',               document.querySelector('[class*="nav__user"]')],
  ];
  for (const [sel, el] of navCandidates) {
    console.log(`${el ? '✓' : '✗'} ${sel}`, el ?? '');
  }
  console.groupEnd();

  // Creator profile
  console.group('Creator profile (stored)');
  chrome.storage.local.get(`creator:${getCreatorId()}`)
    .then((r) => console.log(`[OFC] stored creator:${getCreatorId()}:`, r[`creator:${getCreatorId()}`] ?? 'nothing stored yet'))
    .catch(() => {});
  console.groupEnd();

  // Panel injection
  console.group('Panel (ui-overlay.ts)');
  const host = document.getElementById('ofc-suggestion-host');
  console.log('shadow host in DOM:', host ?? 'NOT FOUND (panel not injected)');
  console.groupEnd();

  console.groupEnd();
});
