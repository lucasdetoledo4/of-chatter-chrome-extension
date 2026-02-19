import type { ConversationMessage } from '../types/index';

/**
 * Find the container that holds chat messages.
 *
 * Strategy: prefer data-testid (stable OF attribute) over CSS classes
 * (which change frequently across OF deployments). Fall back to the
 * first scrollable child of [role="main"] as a structural heuristic.
 */
export function findChatContainer(): Element | null {
  // Primary: OF sometimes uses data-testid on the messages list
  const byTestId = document.querySelector('[data-testid="chat-messages"]');
  if (byTestId) return byTestId;

  // Secondary: role="main" is a semantic landmark that survives class renames.
  // We pick the first child that has overflow scroll/auto (the message scroller).
  const main = document.querySelector('[role="main"]');
  if (main) {
    const children = Array.from(main.children);
    const scrollable = children.find((el) => {
      const style = window.getComputedStyle(el);
      return (
        style.overflowY === 'auto' ||
        style.overflowY === 'scroll' ||
        style.overflow === 'auto' ||
        style.overflow === 'scroll'
      );
    });
    if (scrollable) return scrollable;
    // If no scrollable child, return main itself as best effort
    return main;
  }

  return null;
}

/**
 * Extract a ConversationMessage from a DOM node if it represents a fan message.
 *
 * We detect fan messages via:
 * 1. `data-from-fan="true"` — explicit attribute (used in mock harness + some OF builds)
 * 2. `class.contains('from-fan')` — class heuristic (OF internal naming pattern)
 *
 * We intentionally avoid relying on generated class hashes (e.g. `b_abc123`)
 * because OF's webpack output changes those on every deploy.
 */
export function extractMessageFromNode(node: Node): ConversationMessage | null {
  if (!(node instanceof Element)) return null;

  const isFanMessage =
    node.getAttribute('data-from-fan') === 'true' ||
    node.classList.contains('from-fan');

  if (!isFanMessage) return null;

  const text = (node.textContent ?? '').trim();
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
 * Scrape the last N messages from the visible chat history.
 *
 * We target `[class*="message"]` as a broad net — OF consistently includes
 * "message" in the class names of message bubbles even across class hash changes.
 * Role is inferred from the `from-fan` signals; everything else is creator.
 */
export function scrapeConversationHistory(
  limit = 20
): ConversationMessage[] {
  const container = findChatContainer();
  if (!container) return [];

  // `[class*="message"]` survives webpack class hashing because "message"
  // is a substring present in all OF message bubble class names.
  const nodes = Array.from(container.querySelectorAll('[class*="message"]'));

  // Take last `limit` nodes (most recent messages)
  const recentNodes = nodes.slice(-limit);

  return recentNodes.reduce<ConversationMessage[]>((acc, node) => {
    const isFan =
      node.getAttribute('data-from-fan') === 'true' ||
      node.classList.contains('from-fan');

    const text = (node.textContent ?? '').trim();
    if (!text) return acc;

    acc.push({ role: isFan ? 'fan' : 'creator', text });
    return acc;
  }, []);
}
