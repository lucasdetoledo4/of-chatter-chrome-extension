import type {
  ConversationMessage,
  FanProfile,
  CreatorPersona,
  CreatorProfile,
  BackgroundResponse,
  GetSuggestionsRequest,
  AnalyzeCreatorStyleRequest,
  CreatorType,
  SuggestionMode,
} from '../types/index';
import { observeChat, scrapeConversationHistory, findChatContainer, scrapeFanName } from './dom-observer';
import { UIOverlay } from './ui-overlay';
import { upsertFanProfile, getFanProfile, getCreatorProfile, upsertCreatorProfile } from '../utils/storage';
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

// Cached creator type — loaded from chrome.storage.sync on init
let cachedCreatorType: CreatorType = 'woman';

// Cached creator profile — loaded from chrome.storage.local on init
let cachedCreatorProfile: CreatorProfile | null = null;

// Default persona — uses cached creator type set by popup
function getActivePersona(): CreatorPersona {
  const mockType = (window as typeof window & { __OFC_MOCK_PERSONA__?: string }).__OFC_MOCK_PERSONA__;
  if (mockType && mockType in CREATOR_PRESETS) {
    return CREATOR_PRESETS[mockType as keyof typeof CREATOR_PRESETS];
  }
  return { ...CREATOR_PRESETS[cachedCreatorType], name: cachedCreatorProfile?.displayName || CREATOR_PRESETS[cachedCreatorType].name };
}

async function loadCreatorState(): Promise<void> {
  // Load creator type from sync storage (set by popup)
  const syncResult = await chrome.storage.sync.get('CREATOR_TYPE');
  const savedType = syncResult.CREATOR_TYPE as CreatorType | undefined;
  if (savedType && savedType in CREATOR_PRESETS) {
    cachedCreatorType = savedType;
  }

  // Load creator profile from local storage
  cachedCreatorProfile = await getCreatorProfile('self');
}

/** Fire-and-forget style analysis when we have enough real messages. */
function triggerStyleAnalysisIfNeeded(creatorRealMessages: string[]): void {
  if (creatorRealMessages.length < 5 || cachedCreatorProfile?.writingStyle) return;

  const req: AnalyzeCreatorStyleRequest = {
    type: 'ANALYZE_CREATOR_STYLE',
    creatorMessages: creatorRealMessages,
  };
  console.log('[OFC] Style analysis triggered — analysing creator voice…');

  chrome.runtime.sendMessage<AnalyzeCreatorStyleRequest, BackgroundResponse>(req)
    .then(async (resp) => {
      if (resp.success && resp.writingStyle) {
        cachedCreatorProfile = await upsertCreatorProfile('self', { writingStyle: resp.writingStyle });
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

async function initializeChatAssistant(): Promise<void> {
  // Tear down previous instance before starting fresh.
  // The UIOverlay.inject() also removes any stale DOM host, so together these
  // two guards eliminate the "two panels on SPA re-navigation" bug.
  _activeHostGuard?.disconnect();
  _activeHostGuard = null;
  _activeStopObserver?.();
  _activeStopObserver = null;
  _suggestionGeneration = 0; // prevent stale gen values across re-navigations

  const fanId = extractFanIdFromUrl(location.pathname);
  if (!fanId) return;

  console.log(`[OFC] Chat assistant initializing for fan: ${fanId}`);

  // Load creator type (popup setting) and cached creator profile
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
    cachedCreatorProfile = await upsertCreatorProfile('self', { displayName: navCreator.displayName });
    console.log(`[OFC] Creator name from nav: "${navCreator.displayName}"`);
  } else if (navCreator) {
    console.warn(`[OFC] Nav selector returned chat partner's name ("${navCreator.displayName}") — skipping to avoid overwriting creator identity.`);
  }

  const overlay = new UIOverlay();
  overlay.setMode(activeSuggestionMode); // apply persisted mode before first inject
  overlay.setInsertHandler(insertIntoChat);
  overlay.setNotesSaveHandler((notes) => { void upsertFanProfile(fanId, { notes }); });

  // Last request is stored so regenerate can replay it
  let lastRequest: GetSuggestionsRequest | null = null;
  overlay.setRegenerateHandler(() => {
    if (lastRequest) {
      void fireSuggestionsRequest(
        { ...lastRequest, variationHint: pickVariationHint() },
        overlay
      );
    }
  });

  overlay.setModeChangeHandler((mode) => {
    activeSuggestionMode = mode;
    void chrome.storage.local.set({ OFC_SUGGESTION_MODE: mode });
    if (lastRequest) {
      const req = { ...lastRequest, mode };
      lastRequest = req;          // keep regen in sync with current mode
      overlay.showLoading();
      void fireSuggestionsRequest(req, overlay);
    }
  });

  // Retry injection — OF Vue app may not have rendered the anchor yet
  let attempts = 0;
  const tryInject = (): void => {
    if (overlay.isAttached()) return;

    const { el: anchor, pos } = findAnchorElement();
    overlay.inject(anchor, pos);

    if (overlay.isAttached()) {
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
      void handleNewMessage(msg, fanId, overlay, (req) => { lastRequest = req; });
    });
  };

  tryInject();

  // Host-guard: React may unmount and recreate DOM nodes, wiping the injected panel.
  // Re-inject whenever the panel disappears from the document.
  const hostGuard = new MutationObserver(() => {
    if (!overlay.isAttached()) {
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
        void upsertCreatorProfile('self', {
          displayName: scraped.displayName,
          bio: scraped.bio,
          profilePhotoUrl: scraped.profilePhotoUrl,
          recentCaptions: scraped.recentCaptions,
          scrapedAt: new Date().toISOString(),
        }).then((profile) => {
          cachedCreatorProfile = profile;
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
  chrome.storage.local.get('creator:self')
    .then((r) => console.log('[OFC] stored creator:self:', r['creator:self'] ?? 'nothing stored yet'))
    .catch(() => {});
  console.groupEnd();

  // Panel injection
  console.group('Panel (ui-overlay.ts)');
  const host = document.getElementById('ofc-suggestion-host');
  console.log('shadow host in DOM:', host ?? 'NOT FOUND (panel not injected)');
  console.groupEnd();

  console.groupEnd();
});
