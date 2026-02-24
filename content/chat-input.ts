// ─── Chat input helpers — pure DOM, no shared state ──────────────────────────

const w = window as typeof window & {
  __OFC_MOCK_ANCHOR_ID__?: string;
};

/**
 * Find the chat input element (textarea or contenteditable div).
 * Mirrors findAnchorElement priority but returns the raw input, not the form.
 */
export function findChatInput(): HTMLElement | null {
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
export function insertIntoChat(text: string): void {
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
export function findAnchorElement(): { el: Element; pos: InsertPosition } {
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
