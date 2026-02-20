import type { Suggestion, SuggestionType } from '../types/index';

const HOST_ID = 'ofc-suggestion-host';

const CARD_COLORS: Record<SuggestionType, { bg: string; border: string; label: string }> = {
  engage: {
    bg: '#f0fdf4',
    border: '#86efac',
    label: 'Engage',
  },
  soft_upsell: {
    bg: '#fff7ed',
    border: '#fdba74',
    label: 'Soft Upsell',
  },
  direct_upsell: {
    bg: '#fdf4ff',
    border: '#e879f9',
    label: 'Direct Upsell',
  },
};

const STYLES = `
  :host {
    display: block;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    color: #1a1a1a;
  }
  #ofc-panel {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 12px;
    margin: 8px 0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    min-width: 260px;
    max-width: 400px;
  }
  #ofc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  #ofc-header-left {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  #ofc-header span.dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #22c55e;
    display: inline-block;
  }
  #ofc-regenerate {
    background: none;
    border: 1px solid #e5e7eb;
    border-radius: 5px;
    padding: 3px 8px;
    font-size: 11px;
    color: #6b7280;
    cursor: pointer;
    display: none;
    align-items: center;
    gap: 4px;
    transition: background 0.1s, color 0.1s;
  }
  #ofc-regenerate:hover {
    background: #f3f4f6;
    color: #374151;
  }
  #ofc-regenerate.visible {
    display: flex;
  }
  #ofc-regenerate.spinning svg {
    animation: spin 0.7s linear infinite;
  }
  .ofc-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #9ca3af;
    padding: 8px 0;
  }
  .ofc-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid #e5e7eb;
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .ofc-error {
    color: #ef4444;
    font-size: 12px;
    padding: 6px 0;
  }
  .ofc-suggestions {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ofc-card {
    border-radius: 7px;
    padding: 9px 11px;
    border: 1px solid;
    cursor: pointer;
    transition: opacity 0.1s, transform 0.1s;
    position: relative;
  }
  .ofc-card:hover {
    opacity: 0.88;
    transform: translateY(-1px);
  }
  .ofc-card:active {
    transform: translateY(0);
  }
  .ofc-card-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6b7280;
    margin-bottom: 4px;
  }
  .ofc-card-text {
    line-height: 1.4;
    color: #111827;
  }
  .ofc-copied {
    position: absolute;
    top: 6px;
    right: 8px;
    font-size: 10px;
    font-weight: 600;
    color: #16a34a;
    opacity: 0;
    transition: opacity 0.2s;
    pointer-events: none;
  }
  .ofc-copied.visible {
    opacity: 1;
  }
`;

/** Escape user/AI text before injecting into innerHTML to prevent XSS. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class UIOverlay {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private panel: HTMLElement | null = null;
  private insertHandler: ((text: string) => void) | null = null;
  private regenerateHandler: (() => void) | null = null;

  setInsertHandler(fn: (text: string) => void): void {
    this.insertHandler = fn;
  }

  setRegenerateHandler(fn: () => void): void {
    this.regenerateHandler = fn;
  }

  inject(anchor: Element): void {
    if (this.isAttached()) return;

    const host = document.createElement('div');
    host.id = HOST_ID;
    // If anchor has a data-ofc-container attr it's a dedicated slot — append inside.
    // Otherwise insert after the anchor (default: next to the OF chat input).
    if (anchor.hasAttribute('data-ofc-container')) {
      anchor.appendChild(host);
    } else {
      anchor.insertAdjacentElement('afterend', host);
    }

    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLES;
    shadow.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'ofc-panel';

    const header = document.createElement('div');
    header.id = 'ofc-header';
    header.innerHTML = `
      <span id="ofc-header-left"><span class="dot"></span> AI Suggestions</span>
      <button id="ofc-regenerate" title="Regenerate suggestions">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
        Regenerate
      </button>
    `;
    panel.appendChild(header);

    // Wire regenerate button — handler set later via setRegenerateHandler()
    const regenBtn = header.querySelector<HTMLButtonElement>('#ofc-regenerate')!;
    regenBtn.addEventListener('click', () => {
      if (this.regenerateHandler) this.regenerateHandler();
    });

    shadow.appendChild(panel);

    this.host = host;
    this.shadow = shadow;
    this.panel = panel;
  }

  isAttached(): boolean {
    return this.host !== null && document.contains(this.host);
  }

  showLoading(): void {
    if (!this.panel) return;
    this.setRegenVisible(false);
    this.setContent(`
      <div class="ofc-loading">
        <div class="ofc-spinner"></div>
        <span>Generating suggestions…</span>
      </div>
    `);
  }

  showSuggestions(suggestions: Suggestion[]): void {
    if (!this.panel) return;

    const cardsHtml = suggestions
      .map((s) => {
        const colors = CARD_COLORS[s.type] ?? CARD_COLORS.engage;
        return `
          <div
            class="ofc-card"
            data-text="${escapeHtml(s.text)}"
            style="background:${colors.bg};border-color:${colors.border};"
          >
            <div class="ofc-card-label">${escapeHtml(colors.label)}</div>
            <div class="ofc-card-text">${escapeHtml(s.text)}</div>
            <span class="ofc-copied">Inserted!</span>
          </div>
        `;
      })
      .join('');

    this.setContent(`<div class="ofc-suggestions">${cardsHtml}</div>`);
    this.setRegenVisible(true);

    // Attach click-to-insert handlers after rendering
    this.shadow?.querySelectorAll<HTMLElement>('.ofc-card').forEach((card) => {
      card.addEventListener('click', () => {
        const text = card.dataset['text'] ?? '';
        const showBadge = (): void => {
          const badge = card.querySelector<HTMLElement>('.ofc-copied');
          if (!badge) return;
          badge.classList.add('visible');
          setTimeout(() => badge.classList.remove('visible'), 1500);
        };
        if (this.insertHandler) {
          this.insertHandler(text);
          showBadge();
        } else {
          void navigator.clipboard.writeText(text).then(showBadge);
        }
      });
    });
  }

  showError(msg: string): void {
    if (!this.panel) return;
    this.setRegenVisible(true); // allow retry on error
    this.setContent(
      `<div class="ofc-error">⚠ ${escapeHtml(msg)}</div>`
    );
  }

  remove(): void {
    this.host?.remove();
    this.host = null;
    this.shadow = null;
    this.panel = null;
  }

  private setRegenVisible(visible: boolean): void {
    const btn = this.shadow?.querySelector<HTMLElement>('#ofc-regenerate');
    if (!btn) return;
    btn.classList.toggle('visible', visible);
  }

  /** Replace the panel body content (preserves header). */
  private setContent(html: string): void {
    if (!this.panel) return;
    // Remove all children except the header
    const header = this.panel.querySelector('#ofc-header');
    this.panel.innerHTML = '';
    if (header) this.panel.appendChild(header);
    const container = document.createElement('div');
    container.innerHTML = html;
    this.panel.appendChild(container);
  }
}
