import type {
  ConversationMessage,
  FanProfile,
  CreatorPersona,
  CreatorProfile,
  CreatorAccount,
  BackgroundResponse,
  GetSuggestionsRequest,
  AnalyzeCreatorStyleRequest,
  CreatorType,
  SuggestionMode,
} from '../types/index';
import { observeChat, scrapeConversationHistory, findChatContainer, scrapeFanName } from './dom-observer';
import { UIOverlay } from './ui-overlay';
import { upsertFanProfile, getFanProfile, getCreatorProfile, upsertCreatorProfile, getCreators, upsertCreatorAccount } from '../utils/storage';
import { CREATOR_PRESETS, pickVariationHint } from '../utils/prompt-builder';
import { scrapeCreatorProfile, scrapeCreatorFromNav, diagnoseProfileScraper } from './profile-scraper';

console.log('[OFC] Content script loaded.');

// ─── Constants ────────────────────────────────────────────────────────────────

const INJECT_RETRY_LIMIT = 10;
const INJECT_RETRY_DELAY_MS = 500;
const SPA_NAV_DEBOUNCE_MS = 300;

// Routes where the assistant should activate
const CHAT_URL_PATTERNS = ['/my/chats/', '/messages/'];

// Allow mock harness to bypass URL checks (set before this script loads)
const w = window as typeof window & {
  __OFC_MOCK__?: boolean;
  __OFC_MOCK_FAN_ID__?: string;
  __OFC_MOCK_ANCHOR_ID__?: string;
};

// Cached creator state — loaded from chrome.storage.sync on init
let cachedCreatorId: string = 'default';
let cachedCreatorType: CreatorType = 'woman';
let cachedCreatorProfile: CreatorProfile | null = null;

// Module-level refs so the storage change listener can update the active overlay
let overlay: UIOverlay | null = null;
let lastRequest: GetSuggestionsRequest | null = null;

// Default persona — uses cached creator type set by popup
function getActivePersona(): CreatorPersona {
  const mockType = (window as typeof window & { __OFC_MOCK_PERSONA__?: string }).__OFC_MOCK_PERSONA__;
  if (mockType && mockType in CREATOR_PRESETS) {
    return CREATOR_PRESETS[mockType as keyof typeof CREATOR_PRESETS];
  }
  return { ...CREATOR_PRESETS[cachedCreatorType], name: cachedCreatorProfile?.displayName || CREATOR_PRESETS[cachedCreatorType].name };
}

/**
 * Infer a creator persona type from their bio + display name using keyword heuristics.
 * This is a best-effort starting point — chatters always override in the popup.
 */
function inferPersonaType(bio: string, displayName: string): CreatorType {
  const text = `${bio} ${displayName}`.toLowerCase();
  if (/\bcouple\b|husband|wife|\bwe \b/.test(text)) return 'couple';
  if (/egirl|e-girl|\bgamer\b|streamer|anime|cosplay|kawaii/.test(text)) return 'egirl';
  if (/mature|milf|\bmom\b|\bmother\b|cougar/.test(text)) return 'mature_woman';
  if (/\bguy\b|\bman\b|\bmale\b|daddy|muscl|gym\b/.test(text)) return 'man';
  if (/\bvideo\b.*custom|\bcustom.*clips\b/.test(text)) return 'video_creator';
  if (/photos? only|pics only|picture sets?|photo sets?/.test(text)) return 'picture_only';
  return 'woman';
}

async function loadCreatorState(): Promise<void> {
  const syncData = await chrome.storage.sync.get(['ACTIVE_CREATOR_ID', 'CREATORS', 'CREATOR_TYPE']);
  let creators: CreatorAccount[] = (syncData['CREATORS'] as CreatorAccount[]) ?? [];

  // Migration: seed from logged-in OF profile if no CREATORS yet
  if (creators.length === 0) {
    // Start with legacy type if set, otherwise detect from existing profile bio
    let seedType: CreatorType = (syncData['CREATOR_TYPE'] as CreatorType) ?? 'woman';

    // Auto-detect display name from the sidebar nav
    let seedName = 'Creator 1';
    try {
      const nav = scrapeCreatorFromNav();
      if (nav?.displayName) seedName = nav.displayName;
    } catch { /* ignore scraping errors on non-OF pages */ }

    // Refine persona type from bio if a profile was previously stored
    try {
      const existingProfile = await getCreatorProfile('default');
      if (existingProfile?.bio) {
        seedType = inferPersonaType(existingProfile.bio, seedName);
      }
    } catch { /* ignore */ }

    const seed: CreatorAccount = {
      id: 'default',
      name: seedName,
      type: seedType,
      createdAt: new Date().toISOString(),
    };
    creators = [seed];
    await chrome.storage.sync.set({ CREATORS: creators, ACTIVE_CREATOR_ID: 'default' });
    console.log(`[OFC] Creator auto-detected: "${seedName}" / ${seedType}`);
  }

  const activeId = (syncData['ACTIVE_CREATOR_ID'] as string) ?? creators[0]!.id;
  const active = creators.find((c) => c.id === activeId) ?? creators[0]!;
  cachedCreatorId = active.id;
  cachedCreatorType = active.type;
  cachedCreatorProfile = await getCreatorProfile(cachedCreatorId);
}

const STYLE_REFRESH_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Creator Switch Listener ───────────────────────────────────────────────────

// Reacts to popup changes (ACTIVE_CREATOR_ID or CREATORS) without requiring a page reload.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (!('ACTIVE_CREATOR_ID' in changes || 'CREATORS' in changes)) return;
  void loadCreatorState().then(async () => {
    const creators = await getCreators();
    overlay?.setCreators(creators, cachedCreatorId);
    if (lastRequest) {
      const req = { ...lastRequest, creatorPersona: getActivePersona(), creatorProfile: cachedCreatorProfile ?? undefined };
      lastRequest = req;
      overlay?.showLoading();
      void fireSuggestionsRequest(req, overlay!);
    }
  });
});

/** Fire-and-forget style analysis when we have enough real messages. */
function triggerStyleAnalysisIfNeeded(creatorRealMessages: string[]): void {
  if (creatorRealMessages.length < 5) return;

  // Skip if a fresh style exists (analyzed within the last 7 days)
  const analyzedAt = cachedCreatorProfile?.styleAnalyzedAt;
  const isStale = !analyzedAt || Date.now() - new Date(analyzedAt).getTime() > STYLE_REFRESH_MS;
  if (cachedCreatorProfile?.writingStyle && !isStale) return;

  const req: AnalyzeCreatorStyleRequest = {
    type: 'ANALYZE_CREATOR_STYLE',
    creatorMessages: creatorRealMessages,
  };
  const reason = cachedCreatorProfile?.writingStyle ? 'refreshing stale style' : 'analysing creator voice';
  console.log(`[OFC] Style analysis triggered — ${reason}…`);

  chrome.runtime.sendMessage<AnalyzeCreatorStyleRequest, BackgroundResponse>(req)
    .then(async (resp) => {
      if (resp.success && resp.writingStyle) {
        cachedCreatorProfile = await upsertCreatorProfile(cachedCreatorId, {
          writingStyle: resp.writingStyle,
          styleAnalyzedAt: new Date().toISOString(),
        });
        console.log('[OFC] Style analysis complete — creator voice cached');
      }
    })
    .catch((err: unknown) => {
      console.warn('[OFC] Style analysis failed:', err);
    });
}

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

// ─── Chat Input Insertion ─────────────────────────────────────────────────────

/**
 * Find the chat input element (textarea or contenteditable div).
 * Mirrors findAnchorElement priority but returns the raw input, not the form.
 */
function findChatInput(): HTMLElement | null {
  // data-testid is the stable OF attribute; class names change per deploy
  const byTestId = document.querySelector<HTMLElement>('[data-testid="chat-input"]');
  if (byTestId) return byTestId;
  return document.querySelector<HTMLElement>('[role="textbox"]');
}

/**
 * Insert text into the OF chat input in a way React recognises.
 *
 * Two cases:
 * 1. <textarea> / <input> — React wraps the native value setter, so we call
 *    the original descriptor's set() then fire an 'input' event to trigger
 *    React's synthetic handler.
 * 2. contenteditable div — execCommand('insertText') is deprecated but still
 *    the most reliable way to make React's synthetic event system pick up the
 *    change in a contenteditable without reaching into React internals.
 *
 * Falls back to clipboard if no input is found.
 */
function insertIntoChat(text: string): void {
  const input = findChatInput();
  if (!input) {
    void navigator.clipboard.writeText(text);
    return;
  }

  input.focus();

  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    // Bypass React's wrapped setter so the value actually changes,
    // then fire a bubbling 'input' event so React syncs its state.
    const proto = Object.getPrototypeOf(input) as HTMLTextAreaElement | HTMLInputElement;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    descriptor?.set?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (input.isContentEditable) {
    document.execCommand('selectAll');
    document.execCommand('insertText', false, text);
  }
}

// ─── DOM Helpers ──────────────────────────────────────────────────────────────

/**
 * Find the best anchor element for panel injection.
 *
 * Returns { el, pos } where pos is the InsertPosition to use relative to el.
 * For real OF, the panel is injected BEFORE the chat footer (beforebegin) so it
 * sits between the message thread and the typing area — always in the viewport,
 * adjacent to where the chatter types. "afterend" of the footer risks placing
 * the panel below a sticky footer (off-screen) or to the right in flex-row parents.
 *
 * Priority:
 * 1. Mock harness anchor — designated right-pane container (uses appendChild)
 * 2. .b-page-content.m-chat-footer — real OF chat footer (validated 2025-02)
 * 3. .b-chat__btn-submit — send button parent as structural fallback
 * 4. [data-testid="chat-input"] — legacy guess, kept as fallback
 * 5. [role="textbox"] closest form — semantic fallback
 * 6. document.body — last resort (afterend)
 */
function findAnchorElement(): { el: Element; pos: InsertPosition } {
  // Mock harness: inject into the designated right-pane container (appendChild path)
  if (w.__OFC_MOCK_ANCHOR_ID__) {
    const mockAnchor = document.getElementById(w.__OFC_MOCK_ANCHOR_ID__);
    if (mockAnchor) return { el: mockAnchor, pos: 'afterend' }; // pos unused — uses appendChild
  }

  // Real OF: insert BEFORE the chat footer so panel sits above the input bar
  const chatFooter = document.querySelector('.b-page-content.m-chat-footer');
  if (chatFooter) return { el: chatFooter, pos: 'beforebegin' };

  const sendBtn = document.querySelector('.b-chat__btn-submit');
  if (sendBtn?.parentElement) return { el: sendBtn.parentElement, pos: 'beforebegin' };

  const byTestId = document.querySelector('[data-testid="chat-input"]');
  if (byTestId) return { el: byTestId, pos: 'beforebegin' };

  const textbox = document.querySelector('[role="textbox"]');
  if (textbox) {
    const form = textbox.closest('form');
    if (form) return { el: form, pos: 'beforebegin' };
    return { el: textbox, pos: 'beforebegin' };
  }

  const firstForm = document.querySelector('form');
  if (firstForm) return { el: firstForm, pos: 'beforebegin' };

  return { el: document.body, pos: 'afterend' };
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
    console.log(`[OFC] Fan name scraped: "${scrapedName}"`);
  }

  // Show fan context strip immediately — persists through loading/suggestions/error
  overlay.showFanContext(fanProfile);

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

  const req: GetSuggestionsRequest = {
    type: 'GET_SUGGESTIONS',
    conversation,
    fanProfile,
    creatorPersona: getActivePersona(),
    creatorProfile: cachedCreatorProfile ?? undefined,
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
let activeSuggestionMode: SuggestionMode = 'sell';
// Incremented on every new suggestion request. Responses from superseded
// requests are discarded, preventing races when fan messages arrive fast.
let _suggestionGeneration = 0;
// Track the current fanId for re-trigger after creator switch
let _activeFanId: string | null = null;

async function initializeChatAssistant(): Promise<void> {
  // Tear down previous instance before starting fresh.
  // The UIOverlay.inject() also removes any stale DOM host, so together these
  // two guards eliminate the "two panels on SPA re-navigation" bug.
  _activeHostGuard?.disconnect();
  _activeHostGuard = null;
  _activeStopObserver?.();
  _activeStopObserver = null;
  _suggestionGeneration = 0; // prevent stale gen values across re-navigations
  lastRequest = null;

  const fanId = extractFanIdFromUrl(location.pathname);
  if (!fanId) return;
  _activeFanId = fanId;

  console.log(`[OFC] Chat assistant initializing for fan: ${fanId}`);

  // Load creator state (multi-creator) and cached creator profile
  await loadCreatorState();

  // Restore persisted suggestion mode (survives page reloads and extension updates)
  const modeResult = await chrome.storage.local.get('OFC_SUGGESTION_MODE');
  const persistedMode = modeResult['OFC_SUGGESTION_MODE'] as SuggestionMode | undefined;
  if (persistedMode) activeSuggestionMode = persistedMode;

  // Scrape creator identity from the sidebar nav — available on every page,
  // so we get the real name without requiring a profile page visit.
  // Guard: reject the result if it matches the chat partner's name. This prevents
  // the DOM selector from picking up the chat partner's name from the sidebar
  // conversation list instead of the logged-in user's nav identity.
  const chatPartnerName = scrapeFanName();
  const navCreator = scrapeCreatorFromNav();
  if (navCreator && navCreator.displayName !== chatPartnerName) {
    cachedCreatorProfile = await upsertCreatorProfile(cachedCreatorId, { displayName: navCreator.displayName });
    console.log(`[OFC] Creator name from nav: "${navCreator.displayName}"`);

    // Sync the scraped name into the creator account so the panel header reflects it.
    // Only update when the account name is still the migration default ("Creator 1").
    const creators = await getCreators();
    const creator = creators.find((c) => c.id === cachedCreatorId);
    if (creator && creator.name === 'Creator 1') {
      await upsertCreatorAccount({ ...creator, name: navCreator.displayName });
    }
  } else if (navCreator) {
    console.warn(`[OFC] Nav selector returned chat partner's name ("${navCreator.displayName}") — skipping to avoid overwriting creator identity.`);
  }

  overlay = new UIOverlay();
  overlay.setMode(activeSuggestionMode); // apply persisted mode before first inject
  overlay.setInsertHandler(insertIntoChat);
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
    void chrome.storage.local.set({ OFC_SUGGESTION_MODE: mode });
    if (lastRequest) {
      const req = { ...lastRequest, mode };
      lastRequest = req;          // keep regen in sync with current mode
      overlay!.showLoading();
      void fireSuggestionsRequest(req, overlay!);
    }
  });

  // Wire creator switcher — sets ACTIVE_CREATOR_ID, which triggers the onChanged
  // listener to reload state and re-fire suggestions
  overlay.setCreatorSwitchHandler(async (id) => {
    await chrome.storage.sync.set({ ACTIVE_CREATOR_ID: id });
  });

  // Pass initial creator list to the overlay
  const creators = await getCreators();
  overlay.setCreators(creators, cachedCreatorId);

  // Retry injection — OF Vue app may not have rendered the anchor yet
  let attempts = 0;
  const tryInject = (): void => {
    if (overlay!.isAttached()) return;

    const { el: anchor, pos } = findAnchorElement();
    overlay!.inject(anchor, pos);

    if (overlay!.isAttached()) {
      console.log('[OFC] Chat assistant initialized.');
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
      void handleNewMessage(msg, fanId, overlay!, (req) => { lastRequest = req; });
    });
  };

  tryInject();

  // Host-guard: React may unmount and recreate DOM nodes, wiping the injected panel.
  // Re-inject whenever the panel disappears from the document.
  const hostGuard = new MutationObserver(() => {
    if (!overlay?.isAttached()) {
      console.log('[OFC] Panel removed by React — re-injecting.');
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
      console.log('[OFC] SPA navigation to chat page — re-initializing.');
      void initializeChatAssistant();
    } else {
      // Opportunistically scrape creator profile data on profile pages
      const scraped = scrapeCreatorProfile();
      if (scraped) {
        void upsertCreatorProfile(cachedCreatorId, {
          displayName: scraped.displayName,
          bio: scraped.bio,
          profilePhotoUrl: scraped.profilePhotoUrl,
          recentCaptions: scraped.recentCaptions,
          scrapedAt: new Date().toISOString(),
        }).then(async (profile) => {
          cachedCreatorProfile = profile;

          // Auto-update the creator account name + persona type from the scraped profile.
          // This refines the migration default without overriding manual popup edits —
          // we only update the name/type when the scraped values differ from what's stored.
          if (profile.bio) {
            const creators = await getCreators();
            const creator = creators.find((c) => c.id === cachedCreatorId);
            if (creator) {
              const inferredType = inferPersonaType(profile.bio, profile.displayName);
              const nameChanged = profile.displayName && profile.displayName !== creator.name;
              const typeChanged = inferredType !== creator.type && creator.type === 'woman'; // only auto-update from the default
              if (nameChanged || typeChanged) {
                const updated: CreatorAccount = {
                  ...creator,
                  name: profile.displayName || creator.name,
                  type: typeChanged ? inferredType : creator.type,
                };
                await upsertCreatorAccount(updated);
                console.log(`[OFC] Creator account updated from profile: name="${updated.name}" type="${updated.type}"`);
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
  void initializeChatAssistant();
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
  console.group('Anchor element (injector.ts › findAnchorElement)');
  const anchor = findAnchorElement();
  console.log('resolved anchor:', anchor);
  console.log('  via [data-testid="chat-input"]:', document.querySelector('[data-testid="chat-input"]') ?? 'NOT FOUND');
  console.log('  via [role="textbox"]:', document.querySelector('[role="textbox"]') ?? 'NOT FOUND');
  console.log('  via form:', document.querySelector('form') ?? 'NOT FOUND');
  console.groupEnd();

  // Chat input type (affects insertion strategy)
  console.group('Chat input type (injector.ts › insertIntoChat)');
  const input = findChatInput();
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
  chrome.storage.local.get(`creator:${cachedCreatorId}`)
    .then((r) => console.log(`[OFC] stored creator:${cachedCreatorId}:`, r[`creator:${cachedCreatorId}`] ?? 'nothing stored yet'))
    .catch(() => {});
  console.groupEnd();

  // Panel injection
  console.group('Panel (ui-overlay.ts)');
  const host = document.getElementById('ofc-suggestion-host');
  console.log('shadow host in DOM:', host ?? 'NOT FOUND (panel not injected)');
  console.groupEnd();

  console.groupEnd();
});
