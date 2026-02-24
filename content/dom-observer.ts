import type { ConversationMessage } from '../types/index';
import { PPV_PRICE_MAX } from '../utils/constants';

/**
 * Find the container that holds chat messages.
 *
 * Strategy: infer the container by walking up from a known message element.
 * [at-attr="chat_message"] is validated against real OF DOM (2026-02) and is
 * stable. Its parentElement is the scrollable message list regardless of what
 * CSS class OF assigns the wrapper — making this approach resilient to class
 * name changes.
 *
 * Class-name guesses (.b-chat__messages, .b-chat__messages-wrapper) are kept
 * as fast-path checks in case they ever resolve, but the at-attr walk-up is
 * the reliable fallback.
 *
 * [data-testid="chat-messages"] is the mock harness signal only.
 */
export function findChatContainer(): Element | null {
  const byClass = document.querySelector('.b-chat__messages');
  if (byClass) return byClass;

  const byWrapper = document.querySelector('.b-chat__messages-wrapper');
  if (byWrapper) return byWrapper;

  // Validated 2026-02: walk up from any known message element.
  // at-attr="chat_message" is stable; its parent is the scrollable list.
  const anyMessage = document.querySelector('[at-attr="chat_message"]');
  if (anyMessage?.parentElement) return anyMessage.parentElement;

  // Mock harness fallback
  const byTestId = document.querySelector('[data-testid="chat-messages"]');
  if (byTestId) return byTestId;

  return null;
}

/**
 * Determine if a message element is from the fan (incoming).
 *
 * Validated against real OF DOM (2025-02):
 * Fan messages contain a .g-avatar element (the fan's profile picture).
 * Creator messages do NOT contain .g-avatar.
 *
 * Mock harness uses data-from-fan="true" or class="from-fan" — checked first.
 */
function isFanMessage(el: Element): boolean {
  // Mock harness signals take priority
  if (
    el.getAttribute('data-from-fan') === 'true' ||
    el.classList.contains('from-fan')
  ) {
    return true;
  }

  // Real OF: fan (incoming) messages have an avatar, creator (outgoing) do not
  return !!el.querySelector('.g-avatar');
}

/**
 * Extract a ConversationMessage from a DOM node.
 *
 * Real OF structure (validated 2025-02):
 *   [at-attr="chat_message"] div.b-chat__message
 *     div.b-chat__message__content
 *       a.g-avatar          ← present only on fan messages
 *       div.b-chat__message__body
 *         [at-attr="message_text"] div.b-chat__message__text-wrapper
 *           div.b-chat__message__text   ← text lives here
 *
 * The added node from MutationObserver may be the message itself, a
 * b-chat__item-message wrapper (first in a group), or a deeper child,
 * so we resolve the nearest [at-attr="chat_message"] element.
 */
export function extractMessageFromNode(node: Node): ConversationMessage | null {
  if (!(node instanceof Element)) return null;

  // Mock harness: simple div with from-fan class added directly
  if (
    node.getAttribute('data-from-fan') === 'true' ||
    node.classList.contains('from-fan')
  ) {
    const text = (node.textContent ?? '').trim();
    if (!text) return null;
    return { role: 'fan', text };
  }

  // Real OF: resolve the message element from whatever node was added
  const messageEl: Element | null =
    node.getAttribute('at-attr') === 'chat_message'
      ? node
      : node.querySelector('[at-attr="chat_message"]') ??
        node.closest('[at-attr="chat_message"]');

  if (!messageEl) return null;

  if (!isFanMessage(messageEl)) return null;

  const textEl = messageEl.querySelector('.b-chat__message__text');
  const text = (textEl?.textContent ?? messageEl.textContent ?? '').trim();
  if (!text) return null;

  return { role: 'fan', text };
}

/**
 * Scrape the fan's display name from the current page.
 *
 * Primary source: document.title — OF sets it to "DisplayName | OnlyFans"
 * on individual chat pages, which is stable and requires no DOM traversal.
 * Fallbacks: BEM chat-header selectors (not yet validated on real OF DOM).
 */
export function scrapeFanName(): string | null {
  // Primary: page title — reliable, no DOM traversal needed
  const titleMatch = document.title.match(/^(.+?)\s*[|·—-]\s*OnlyFans/i);
  if (titleMatch?.[1]) {
    const name = titleMatch[1].trim();
    if (name && name.toLowerCase() !== 'onlyfans') return name;
  }
  // Fallback: chat header h1 — validated against real OF DOM (2026-02).
  // at-attr="page_title" is the stable attribute; g-page-title is the BEM class.
  const nameEl =
    document.querySelector<HTMLElement>('h1[at-attr="page_title"]') ??
    document.querySelector<HTMLElement>('[at-attr="chat_header"] .g-user-name') ??
    document.querySelector<HTMLElement>('.b-chat__header .g-user-name') ??
    document.querySelector<HTMLElement>('[class*="chat__user-name"]');
  return nameEl?.textContent?.trim() || null;
}

/**
 * Start observing the chat container for new incoming messages.
 *
 * Returns a cleanup function that disconnects the observer.
 */
export function observeChat(
  onNewMessage: (msg: ConversationMessage) => void
): () => void {
  const container = findChatContainer();
  if (!container) {
    console.warn('[OFC] Chat container not found — observer not started.');
    return () => {};
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;
      for (const node of Array.from(mutation.addedNodes)) {
        const msg = extractMessageFromNode(node);
        if (msg) {
          onNewMessage(msg);
        }
      }
    }
  });

  observer.observe(container, { childList: true, subtree: true });
  console.log('[OFC] Chat observer started.');

  return () => observer.disconnect();
}

/**
 * Scrape the visible conversation history.
 *
 * Real OF selectors (validated 2025-02):
 * - Messages:   [at-attr="chat_message"] (.b-chat__message elements)
 * - Text:       .b-chat__message__text
 * - Fan signal: presence of .g-avatar inside the message
 *
 * Mock harness: falls back to [data-from-fan] / .from-fan signals
 * on elements found via [class*="message"].
 */
/**
 * Detect whether the fan is currently shown as online in the chat header.
 *
 * Selectors are educated guesses based on OF BEM conventions (validated targets
 * for the online status indicator — verify in DevTools if status never shows).
 * Returns false silently when no indicator is found.
 */
export function detectFanOnlineStatus(): boolean {
  const ONLINE_SELECTORS = [
    '[class*="chat__header"] [class*="status--online"]',
    '[class*="chat__header"] [class*="online-status"]',
    '[class*="chat_header"] .g-avatar [class*="online"]',
    '[class*="b-chat__header"] [class*="online"]',
  ];
  return ONLINE_SELECTORS.some((sel) => !!document.querySelector(sel));
}

export function scrapeConversationHistory(): ConversationMessage[] {
  const container = findChatContainer();
  if (!container) return [];

  // Real OF uses at-attr="chat_message"; mock uses class="message from-fan"
  const messages = Array.from(
    container.querySelectorAll('[at-attr="chat_message"], [data-from-fan], .from-fan')
  );

  // Deduplicate (selectors may overlap)
  const unique = [...new Set(messages)];

  return unique.reduce<ConversationMessage[]>((acc, el) => {
    const textEl = el.querySelector('.b-chat__message__text');
    const text = (textEl?.textContent ?? el.textContent ?? '').trim();
    if (!text) return acc;

    const isFan = isFanMessage(el);
    acc.push({ role: isFan ? 'fan' : 'creator', text });
    return acc;
  }, []);
}

// ─── PPV Purchase Scraping ────────────────────────────────────────────────────

export interface ScrapedPpv {
  price: number;
  contentId: string; // stable key for deduplication against ppvHistory
}

/**
 * Scan the visible chat DOM for PPV messages the fan has purchased.
 *
 * OF renders a price badge on locked PPV content. After purchase the message
 * gains a "paid" / "purchased" / "unlocked" modifier class. We collect any
 * message element matching those signals and extract the $ amount.
 *
 * Selectors are best-effort BEM guesses based on OF conventions — validate
 * in DevTools if purchases are not being detected (look for the element that
 * wraps the price after a fan unlocks content and note its class/at-attr).
 *
 * Returns [] silently when nothing matches (no logs — called on every message).
 */
export function scrapePpvPurchases(): ScrapedPpv[] {
  const container = findChatContainer();
  if (!container) return [];

  const results: ScrapedPpv[] = [];
  const seen = new Set<string>();

  // Collect message elements that have a paid/purchased/unlocked indicator
  const candidates = new Set<Element>();
  const PAID_SELECTORS = [
    '[at-attr="chat_message"] [at-attr="message_media_price"]',
    '[at-attr="chat_message"] [class*="media--paid"]',
    '[at-attr="chat_message"] [class*="media--purchased"]',
    '[at-attr="chat_message"] [class*="media--unlocked"]',
    '.b-chat__message--paid',
    '[class*="b-chat__message--paid"]',
  ];
  for (const sel of PAID_SELECTORS) {
    container.querySelectorAll(sel).forEach((el) => {
      candidates.add(el.closest('[at-attr="chat_message"]') ?? el);
    });
  }

  candidates.forEach((msgEl) => {
    // Extract a $ price from any text inside the message element
    const text = msgEl.textContent ?? '';
    const match = text.match(/\$(\d+(?:\.\d{1,2})?)/);
    if (!match) return;
    const price = parseFloat(match[1]);
    if (price <= 0 || price > PPV_PRICE_MAX) return; // sanity bounds — ignore noise

    // Use a data attribute for the stable ID if available, otherwise derive one
    const dataId =
      msgEl.getAttribute('data-id') ??
      msgEl.getAttribute('data-message-id') ??
      msgEl.getAttribute('id');
    const contentId = dataId ?? `ppv_p${Math.round(price * 100)}_i${results.length}`;

    if (seen.has(contentId)) return;
    seen.add(contentId);
    results.push({ price, contentId });
  });

  return results;
}
