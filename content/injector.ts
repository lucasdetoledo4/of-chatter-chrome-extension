import type {
  ConversationMessage,
  FanProfile,
  CreatorPersona,
  BackgroundResponse,
  GetSuggestionsRequest,
} from '../types/index';
import { observeChat, scrapeConversationHistory } from './dom-observer';
import { UIOverlay } from './ui-overlay';
import { upsertFanProfile, getFanProfile } from '../utils/storage';

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

// Default persona used until popup settings are implemented
const DEFAULT_PERSONA: CreatorPersona = {
  name: 'Creator',
  description:
    'Friendly, playful, and authentic. Loves connecting with fans and creating exclusive content.',
};

// ─── URL Helpers ──────────────────────────────────────────────────────────────

/**
 * Extract the fan/conversation ID from OF chat URLs:
 * - /my/chats/:id
 * - /messages/:id
 */
function extractFanIdFromUrl(pathname: string): string | null {
  if (w.__OFC_MOCK__) return w.__OFC_MOCK_FAN_ID__ ?? 'mock-fan';
  const match = pathname.match(/(?:\/my\/chats\/|\/messages\/)([^/?#]+)/);
  return match?.[1] ?? null;
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
 * Find the best anchor element to inject the suggestion panel after.
 *
 * Priority:
 * 1. [data-testid="chat-input"] — stable OF attribute
 * 2. [role="textbox"] closest ancestor form — semantic fallback
 * 3. The first <form> on the page — structural fallback
 * 4. document.body — last resort (panel will appear at top)
 */
function findAnchorElement(): Element {
  // Mock harness: inject into the designated right-pane container
  if (w.__OFC_MOCK_ANCHOR_ID__) {
    const mockAnchor = document.getElementById(w.__OFC_MOCK_ANCHOR_ID__);
    if (mockAnchor) return mockAnchor;
  }

  const byTestId = document.querySelector('[data-testid="chat-input"]');
  if (byTestId) return byTestId;

  const textbox = document.querySelector('[role="textbox"]');
  if (textbox) {
    const form = textbox.closest('form');
    if (form) return form;
    return textbox;
  }

  const firstForm = document.querySelector('form');
  if (firstForm) return firstForm;

  return document.body;
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

  // Build conversation context (scraped history + new message appended)
  const history = scrapeConversationHistory();
  // Avoid duplicating the triggering message if it was already scraped
  const lastScraped = history[history.length - 1];
  const conversation: ConversationMessage[] =
    lastScraped?.text === msg.text ? history : [...history, msg];

  const req: GetSuggestionsRequest = {
    type: 'GET_SUGGESTIONS',
    conversation,
    fanProfile,
    creatorPersona: DEFAULT_PERSONA,
  };

  // Expose the request so regenerate can replay it
  onRequest(req);

  await fireSuggestionsRequest(req, overlay);
}

async function fireSuggestionsRequest(
  req: GetSuggestionsRequest,
  overlay: UIOverlay
): Promise<void> {
  const response = await requestSuggestions(req);
  if (response.success) {
    overlay.showSuggestions(response.suggestions);
  } else {
    overlay.showError(response.error);
  }
}

// ─── Initialization ───────────────────────────────────────────────────────────

async function initializeChatAssistant(): Promise<void> {
  const fanId = extractFanIdFromUrl(location.pathname);
  if (!fanId) return;

  console.log(`[OFC] Chat assistant initializing for fan: ${fanId}`);

  const overlay = new UIOverlay();
  overlay.setInsertHandler(insertIntoChat);

  // Last request is stored so regenerate can replay it
  let lastRequest: GetSuggestionsRequest | null = null;
  overlay.setRegenerateHandler(() => {
    if (lastRequest) void fireSuggestionsRequest(lastRequest, overlay);
  });

  let stopObserver: (() => void) | null = null;

  // Retry injection — OF React may not have rendered the anchor yet
  let attempts = 0;
  const tryInject = (): void => {
    if (overlay.isAttached()) return;

    const anchor = findAnchorElement();
    overlay.inject(anchor);

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

  const startObserver = (): void => {
    stopObserver?.();
    stopObserver = observeChat((msg) => {
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
    }
  }, SPA_NAV_DEBOUNCE_MS);
});

navObserver.observe(document.body, { childList: true, subtree: true });

// Initial page load
if (isOnChatPage()) {
  void initializeChatAssistant();
}
