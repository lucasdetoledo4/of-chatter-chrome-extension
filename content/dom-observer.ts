import type { ConversationMessage } from '../types/index';

/**
 * Find the container that holds chat messages.
 *
 * Validated against real OF DOM (2025-02):
 * - Primary: `.b-chat__messages` — the scrollable messages div
 * - Fallback: `.b-chat__messages-wrapper` — inner wrapper
 *
 * OF uses Vue.js (not React). Class names follow a BEM-like pattern
 * (`b-` for blocks, `m-` for modifiers) and are stable across deploys.
 * `data-testid` and `[role="main"]` are NOT present in real OF DOM.
 */
export function findChatContainer(): Element | null {
  const byClass = document.querySelector('.b-chat__messages');
  if (byClass) return byClass;

  const byWrapper = document.querySelector('.b-chat__messages-wrapper');
  if (byWrapper) return byWrapper;

  return null;
}

/**
 * Determine if a `.b-chat__item-message` element is a fan (incoming) message.
 *
 * OF does not add a class or data attribute to distinguish fan vs creator
 * messages — validated against real DOM (2025-02). Direction is purely CSS.
 *
 * Strategy: fan messages are left-aligned, creator messages are right-aligned.
 * We check whether the horizontal midpoint of the element sits in the left
 * or right half of the viewport. Falls back to mock harness signals first.
 */
function isFanMessage(el: Element): boolean {
  // Mock harness: explicit attribute takes priority
  if (
    el.getAttribute('data-from-fan') === 'true' ||
    el.classList.contains('from-fan')
  ) {
    return true;
  }

  const rect = el.getBoundingClientRect();
  if (rect.width === 0) return false; // not yet rendered

  const messageMid = rect.left + rect.width / 2;
  return messageMid < window.innerWidth / 2;
}

/**
 * Extract a ConversationMessage from a DOM node.
 *
 * Real OF structure (validated 2025-02):
 *   div.b-chat__item-message
 *     div.b-chat__message[.m-text][.m-has-media]...
 *       div.b-chat__message__content
 *         div.b-chat__message__body
 *           div.b-chat__message__text   ← text lives here
 *
 * The added node may be the item wrapper itself or a deeper child,
 * so we walk up to find the nearest .b-chat__item-message ancestor.
 */
export function extractMessageFromNode(node: Node): ConversationMessage | null {
  if (!(node instanceof Element)) return null;

  // Find the message item — could be the node itself or an ancestor
  const item: Element | null = node.classList.contains('b-chat__item-message')
    ? node
    : node.closest('.b-chat__item-message');

  if (!item) return null;

  // Skip system/timeline messages (e.g. date separators)
  if (item.querySelector('.b-chat__message__system')) return null;

  if (!isFanMessage(item)) return null;

  const textEl = item.querySelector('.b-chat__message__text');
  const text = (textEl?.textContent ?? item.textContent ?? '').trim();
  if (!text) return null;

  return { role: 'fan', text };
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
 * - Message items: `.b-chat__item-message`
 * - Text content:  `.b-chat__message__text`
 * - Direction:     position-based (left = fan, right = creator)
 */
export function scrapeConversationHistory(): ConversationMessage[] {
  const container = findChatContainer();
  if (!container) return [];

  const items = Array.from(container.querySelectorAll('.b-chat__item-message'));

  return items.reduce<ConversationMessage[]>((acc, item) => {
    // Skip system/timeline entries
    if (item.querySelector('.b-chat__message__system')) return acc;

    const textEl = item.querySelector('.b-chat__message__text');
    const text = (textEl?.textContent ?? item.textContent ?? '').trim();
    if (!text) return acc;

    const isFan = isFanMessage(item);
    acc.push({ role: isFan ? 'fan' : 'creator', text });
    return acc;
  }, []);
}
