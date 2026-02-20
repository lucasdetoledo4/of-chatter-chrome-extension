import type { ConversationMessage } from '../types/index';

/**
 * Find the container that holds chat messages.
 *
 * Validated against real OF DOM (2025-02):
 * - Primary:  .b-chat__messages      — outer scrollable div
 * - Secondary: .b-chat__messages-wrapper — inner wrapper (fallback)
 * - Tertiary: [data-testid="chat-messages"] — mock harness
 *
 * OF uses Vue.js. Class names follow BEM (.b- blocks, .m- modifiers)
 * and are stable across deploys. data-testid and [role="main"] are
 * NOT present in real OF DOM.
 */
export function findChatContainer(): Element | null {
  const byClass = document.querySelector('.b-chat__messages');
  if (byClass) return byClass;

  const byWrapper = document.querySelector('.b-chat__messages-wrapper');
  if (byWrapper) return byWrapper;

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
