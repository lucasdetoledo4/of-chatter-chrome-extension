import type { Suggestion, SuggestionType, SuggestionMode, FanProfile } from '../types/index';

const HOST_ID = 'ofc-suggestion-host';

// ─── Type configuration ───────────────────────────────────────────────────────

interface TypeConfig {
  accent: string;      // left border color
  labelBg: string;     // badge background
  labelColor: string;  // badge text
  label: string;       // display label
}

const TYPE_CONFIG: Record<SuggestionType, TypeConfig> = {
  engage: {
    accent: '#10b981',
    labelBg: 'rgba(16, 185, 129, 0.12)',
    labelColor: '#34d399',
    label: 'Engage',
  },
  soft_upsell: {
    accent: '#f59e0b',
    labelBg: 'rgba(245, 158, 11, 0.12)',
    labelColor: '#fbbf24',
    label: 'Soft Sell',
  },
  direct_upsell: {
    accent: '#8b5cf6',
    labelBg: 'rgba(139, 92, 246, 0.12)',
    labelColor: '#a78bfa',
    label: 'Direct',
  },
};

// ─── Icons ────────────────────────────────────────────────────────────────────

const ICON_SPARKLE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2L13.09 8.26L19 9L13.09 9.74L12 16L10.91 9.74L5 9L10.91 8.26L12 2Z"/>
  <path d="M19 15L19.5 17.5L22 18L19.5 18.5L19 21L18.5 18.5L16 18L18.5 17.5L19 15Z" opacity="0.6"/>
  <path d="M5 3L5.4 4.6L7 5L5.4 5.4L5 7L4.6 5.4L3 5L4.6 4.6L5 3Z" opacity="0.6"/>
</svg>`;

const ICON_REGEN = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
</svg>`;

const ICON_CHEVRON_UP = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="18 15 12 9 6 15"/>
</svg>`;

const ICON_CHEVRON_DOWN = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="6 9 12 15 18 9"/>
</svg>`;

// ─── Styles ───────────────────────────────────────────────────────────────────

const STYLES = `
  :host {
    display: block;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }

  /* ── Panel shell ───────────────────────────────────────── */
  #ofc-panel {
    background: #0e0e14;
    border: 1px solid #21212e;
    border-radius: 12px;
    overflow: hidden;
    margin: 8px 0;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(255, 255, 255, 0.04);
    width: 100%;
    min-width: 320px;
    max-width: 560px;
  }

  /* ── Header ─────────────────────────────────────────────── */
  #ofc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 8px 8px 12px;
    background: #13131d;
    border-bottom: 1px solid #21212e;
    gap: 8px;
    user-select: none;
  }

  #ofc-title {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1;
  }

  .ofc-logo {
    color: #7c3aed;
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  #ofc-label {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: #5a5a7a;
    white-space: nowrap;
  }

  #ofc-count {
    font-size: 10px;
    font-weight: 400;
    color: #383850;
    letter-spacing: 0;
    text-transform: none;
    white-space: nowrap;
  }

  #ofc-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .ofc-hbtn {
    background: none;
    border: none;
    color: #383858;
    cursor: pointer;
    padding: 5px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s, background 0.15s;
    line-height: 0;
  }

  .ofc-hbtn:hover {
    color: #7878a8;
    background: #1c1c2a;
  }

  #ofc-regen.spinning svg {
    animation: ofc-spin 0.65s linear infinite;
  }

  /* ── Mode toggle ─────────────────────────────────────────── */
  #ofc-modes {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
  }

  .ofc-mode-btn {
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    padding: 3px 8px;
    border-radius: 100px;
    border: 1px solid transparent;
    cursor: pointer;
    background: none;
    color: #2e2e48;
    transition: color 0.12s, background 0.12s, border-color 0.12s;
    white-space: nowrap;
    font-family: inherit;
  }

  .ofc-mode-btn:hover { color: #5a5a7a; }

  .ofc-mode-btn[data-mode="warm_up"].active {
    color: #34d399;
    background: rgba(16, 185, 129, 0.12);
    border-color: rgba(16, 185, 129, 0.2);
  }

  .ofc-mode-btn[data-mode="sell"].active {
    color: #fbbf24;
    background: rgba(245, 158, 11, 0.12);
    border-color: rgba(245, 158, 11, 0.2);
  }

  .ofc-mode-btn[data-mode="re_engage"].active {
    color: #a78bfa;
    background: rgba(139, 92, 246, 0.12);
    border-color: rgba(139, 92, 246, 0.2);
  }

  #ofc-panel.collapsed #ofc-modes { display: none; }

  /* ── Body ───────────────────────────────────────────────── */
  #ofc-body {
    overflow: hidden;
  }

  #ofc-panel.collapsed #ofc-body {
    display: none;
  }

  /* ── Loading ────────────────────────────────────────────── */
  .ofc-loading {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 13px 14px;
    color: #404058;
    font-size: 12px;
  }

  .ofc-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid #1e1e2c;
    border-top-color: #7c3aed;
    border-radius: 50%;
    animation: ofc-spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  @keyframes ofc-spin { to { transform: rotate(360deg); } }

  /* ── Error ──────────────────────────────────────────────── */
  .ofc-error {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px 14px;
    color: #f87171;
    font-size: 12px;
    line-height: 1.55;
  }

  .ofc-error-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #f87171;
    flex-shrink: 0;
    margin-top: 4px;
  }

  /* ── Suggestion cards ───────────────────────────────────── */
  .ofc-suggestions {
    display: flex;
    flex-direction: column;
  }

  .ofc-card {
    display: flex;
    align-items: stretch;
    border-top: 1px solid #18181f;
    cursor: pointer;
    transition: background 0.12s;
    animation: ofc-fadein 0.2s ease both;
    position: relative;
  }

  .ofc-card:first-child {
    border-top: none;
  }

  .ofc-card:nth-child(2) { animation-delay: 0.05s; }
  .ofc-card:nth-child(3) { animation-delay: 0.10s; }

  @keyframes ofc-fadein {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .ofc-card:hover {
    background: #131320;
  }

  .ofc-accent-bar {
    width: 3px;
    flex-shrink: 0;
  }

  .ofc-card-body {
    flex: 1;
    padding: 9px 12px 10px 11px;
    min-width: 0;
  }

  .ofc-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 5px;
  }

  .ofc-badge {
    display: inline-flex;
    align-items: center;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 2px 7px 2px 6px;
    border-radius: 100px;
    flex-shrink: 0;
  }

  .ofc-use-btn {
    font-size: 11px;
    font-weight: 500;
    color: #38385a;
    background: none;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 2px 9px;
    cursor: pointer;
    flex-shrink: 0;
    opacity: 0;
    transition:
      opacity 0.15s,
      color 0.15s,
      background 0.15s,
      border-color 0.15s;
    pointer-events: none;
    white-space: nowrap;
    font-family: inherit;
    line-height: 1.6;
  }

  .ofc-card:hover .ofc-use-btn {
    opacity: 1;
    pointer-events: auto;
    color: #6868a8;
    border-color: #28283c;
    background: #19192a;
  }

  .ofc-use-btn:hover {
    color: #a78bfa;
    background: rgba(139, 92, 246, 0.14);
    border-color: rgba(139, 92, 246, 0.28);
  }

  .ofc-use-btn.done {
    opacity: 1;
    pointer-events: none;
    color: #34d399;
    background: rgba(16, 185, 129, 0.1);
    border-color: rgba(16, 185, 129, 0.22);
  }

  .ofc-text {
    color: #9898b8;
    font-size: 13px;
    line-height: 1.5;
    word-break: break-word;
  }

  .ofc-card:hover .ofc-text {
    color: #b0b0cc;
  }

  /* ── Fan context strip ──────────────────────────────── */
  #ofc-fan-ctx {
    display: none;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    background: #0b0b11;
    border-bottom: 1px solid #18181f;
    font-size: 11px;
    flex-wrap: wrap;
  }

  #ofc-panel.collapsed #ofc-fan-ctx { display: none !important; }

  .ofc-ctx-spend {
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .ofc-ctx-sep { color: #252535; }

  .ofc-ctx-dur { color: #3a3a58; }

  .ofc-ctx-tag {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 1px 6px;
    border-radius: 100px;
    background: rgba(255, 255, 255, 0.04);
    color: #383858;
  }

  /* ── Notes ──────────────────────────────────────────── */
  #ofc-notes {
    padding: 6px 10px 8px;
    background: #0b0b11;
    border-top: 1px solid #18181f;
    position: relative;
  }

  #ofc-panel.collapsed #ofc-notes { display: none; }

  .ofc-notes-label {
    display: block;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #2e2e45;
    margin-bottom: 4px;
  }

  .ofc-notes-ta {
    width: 100%;
    background: #0e0e18;
    border: 1px solid #1e1e2c;
    border-radius: 6px;
    color: #6868a0;
    font-size: 12px;
    font-family: inherit;
    line-height: 1.5;
    padding: 5px 8px;
    resize: none;
    outline: none;
    overflow-y: hidden;
    min-height: 44px;
    transition: border-color 0.15s, color 0.15s;
  }

  .ofc-notes-ta::placeholder { color: #252538; }

  .ofc-notes-ta:focus {
    border-color: #2e2e4a;
    color: #9090c0;
  }

  .ofc-notes-saved {
    position: absolute;
    right: 10px;
    bottom: 10px;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #10b981;
    opacity: 0;
    transition: opacity 0.2s;
    pointer-events: none;
  }

  .ofc-notes-saved.visible { opacity: 1; }
`;

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Escape user/AI text before injecting into innerHTML to prevent XSS. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Fan context helpers ──────────────────────────────────────────────────────

function spendColor(value: number): string {
  if (value === 0) return '#3a3a58';
  if (value < 50) return '#5a5a88';
  if (value < 200) return '#d97706';
  return '#10b981';
}

function formatSpend(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

function formatSubDuration(firstSeen: string): string {
  const days = Math.floor((Date.now() - new Date(firstSeen).getTime()) / 86400000);
  if (days < 1) return 'new today';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}wk`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}yr`;
}

// ─── UIOverlay class ──────────────────────────────────────────────────────────

export class UIOverlay {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private panel: HTMLElement | null = null;
  private insertHandler: ((text: string) => void) | null = null;
  private regenerateHandler: (() => void) | null = null;
  private notesSaveHandler: ((notes: string) => void) | null = null;
  private modeChangeHandler: ((mode: SuggestionMode) => void) | null = null;
  private activeMode: SuggestionMode = 'sell';
  private lastSavedNotes = '';
  private collapsed = false;

  setInsertHandler(fn: (text: string) => void): void {
    this.insertHandler = fn;
  }

  setRegenerateHandler(fn: () => void): void {
    this.regenerateHandler = fn;
  }

  setModeChangeHandler(fn: (mode: SuggestionMode) => void): void {
    this.modeChangeHandler = fn;
  }

  setNotesSaveHandler(fn: (notes: string) => void): void {
    this.notesSaveHandler = fn;
  }

  inject(anchor: Element, insertPosition: InsertPosition = 'beforebegin'): void {
    if (this.isAttached()) return;

    // Remove any orphaned panel left by a previous UIOverlay instance.
    // Without this, SPA re-navigation creates a second panel alongside the stale one.
    document.getElementById(HOST_ID)?.remove();

    const host = document.createElement('div');
    host.id = HOST_ID;

    if (anchor.hasAttribute('data-ofc-container')) {
      // Mock harness: inject inside the designated container
      anchor.appendChild(host);
    } else {
      anchor.insertAdjacentElement(insertPosition, host);
    }

    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLES;
    shadow.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'ofc-panel';

    // ── Header ──────────────────────────────────────────────
    const header = document.createElement('div');
    header.id = 'ofc-header';
    header.innerHTML = `
      <div id="ofc-title">
        <span class="ofc-logo">${ICON_SPARKLE}</span>
        <span id="ofc-label">AI Suggestions</span>
        <span id="ofc-count"></span>
      </div>
      <div id="ofc-modes">
        <button class="ofc-mode-btn" data-mode="warm_up">Warm</button>
        <button class="ofc-mode-btn active" data-mode="sell">Sell</button>
        <button class="ofc-mode-btn" data-mode="re_engage">Re-engage</button>
      </div>
      <div id="ofc-actions">
        <button id="ofc-regen" class="ofc-hbtn" title="Regenerate suggestions" style="display:none">
          ${ICON_REGEN}
        </button>
        <button id="ofc-collapse" class="ofc-hbtn" title="Collapse panel">
          ${ICON_CHEVRON_UP}
        </button>
      </div>
    `;

    // ── Body ────────────────────────────────────────────────
    const body = document.createElement('div');
    body.id = 'ofc-body';

    const fanCtx = document.createElement('div');
    fanCtx.id = 'ofc-fan-ctx';

    const notesSection = document.createElement('div');
    notesSection.id = 'ofc-notes';
    notesSection.innerHTML = `
      <label class="ofc-notes-label">Notes</label>
      <textarea class="ofc-notes-ta" placeholder="Fan notes…" spellcheck="false"></textarea>
      <span class="ofc-notes-saved">Saved</span>
    `;

    panel.appendChild(header);
    panel.appendChild(fanCtx);
    panel.appendChild(body);
    panel.appendChild(notesSection);
    shadow.appendChild(panel);

    this.host = host;
    this.shadow = shadow;
    this.panel = panel;

    // Wire notes textarea: auto-grow on input, auto-save on blur
    const notesTa = notesSection.querySelector<HTMLTextAreaElement>('.ofc-notes-ta')!;
    notesTa.addEventListener('input', () => this.resizeNotesTa());
    notesTa.addEventListener('blur', () => {
      const val = notesTa.value;
      if (val === this.lastSavedNotes) return;
      this.lastSavedNotes = val;
      this.notesSaveHandler?.(val);
      const savedEl = notesSection.querySelector<HTMLElement>('.ofc-notes-saved');
      if (savedEl) {
        savedEl.classList.add('visible');
        setTimeout(() => savedEl.classList.remove('visible'), 1500);
      }
    });

    // Wire header buttons
    const regenBtn = header.querySelector<HTMLButtonElement>('#ofc-regen')!;
    regenBtn.addEventListener('click', () => this.regenerateHandler?.());

    const collapseBtn = header.querySelector<HTMLButtonElement>('#ofc-collapse')!;
    collapseBtn.addEventListener('click', () => this.toggleCollapse());

    // Wire mode toggle buttons
    const modeBtns = header.querySelectorAll<HTMLButtonElement>('.ofc-mode-btn');
    modeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset['mode'] as SuggestionMode;
        this.activeMode = mode;
        modeBtns.forEach((b) => b.classList.toggle('active', b === btn));
        this.modeChangeHandler?.(mode);
      });
    });
  }

  isAttached(): boolean {
    return this.host !== null && document.contains(this.host);
  }

  showLoading(): void {
    if (!this.panel) return;
    this.setRegenVisible(false);
    this.setCount('');
    this.setBodyContent(`
      <div class="ofc-loading">
        <div class="ofc-spinner"></div>
        <span>Generating suggestions…</span>
      </div>
    `);
  }

  showSuggestions(suggestions: Suggestion[]): void {
    if (!this.panel) return;

    const count = suggestions.length;
    this.setCount(count > 0 ? `${count} suggestion${count === 1 ? '' : 's'}` : '');

    const cardsHtml = suggestions
      .map((s) => {
        const cfg = TYPE_CONFIG[s.type] ?? TYPE_CONFIG.engage;
        return `
          <div class="ofc-card" data-text="${escapeHtml(s.text)}">
            <div class="ofc-accent-bar" style="background:${cfg.accent};"></div>
            <div class="ofc-card-body">
              <div class="ofc-card-top">
                <span class="ofc-badge" style="background:${cfg.labelBg};color:${cfg.labelColor};">
                  ${escapeHtml(cfg.label)}
                </span>
                <button class="ofc-use-btn">Use →</button>
              </div>
              <div class="ofc-text">${escapeHtml(s.text)}</div>
            </div>
          </div>
        `;
      })
      .join('');

    this.setBodyContent(`<div class="ofc-suggestions">${cardsHtml}</div>`);
    this.setRegenVisible(true);

    // Attach click handlers after rendering
    this.shadow?.querySelectorAll<HTMLElement>('.ofc-card').forEach((card) => {
      const useBtn = card.querySelector<HTMLButtonElement>('.ofc-use-btn');

      const doInsert = (): void => {
        const text = card.dataset['text'] ?? '';
        if (this.insertHandler) {
          this.insertHandler(text);
        } else {
          void navigator.clipboard.writeText(text);
        }
        if (useBtn) {
          useBtn.textContent = '✓ Inserted';
          useBtn.classList.add('done');
          setTimeout(() => {
            useBtn.textContent = 'Use →';
            useBtn.classList.remove('done');
          }, 2000);
        }
      };

      // Card body click → insert (but not if the use button was clicked, it handles itself)
      card.addEventListener('click', (e) => {
        if (e.target === useBtn) return; // use-btn handles it
        doInsert();
      });

      useBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        doInsert();
      });
    });
  }

  showError(msg: string): void {
    if (!this.panel) return;
    this.setRegenVisible(true);
    this.setCount('');
    this.setBodyContent(`
      <div class="ofc-error">
        <div class="ofc-error-dot"></div>
        <span>${escapeHtml(msg)}</span>
      </div>
    `);
  }

  showFanContext(fan: FanProfile): void {
    const ctx = this.shadow?.querySelector<HTMLElement>('#ofc-fan-ctx');
    if (!ctx) return;

    const tagPills = fan.tags
      .slice(0, 3)
      .map((t) => `<span class="ofc-ctx-tag">${escapeHtml(t)}</span>`)
      .join('');

    ctx.innerHTML = `
      <span class="ofc-ctx-spend" style="color:${spendColor(fan.lifetimeValue)}">${formatSpend(fan.lifetimeValue)}</span>
      <span class="ofc-ctx-sep">·</span>
      <span class="ofc-ctx-dur">${formatSubDuration(fan.firstSeen)}</span>
      ${fan.tags.length > 0 ? `<span class="ofc-ctx-sep">·</span>${tagPills}` : ''}
    `;
    ctx.style.display = 'flex';

    // Populate notes textarea with stored notes and resize to fit
    const notesTa = this.shadow?.querySelector<HTMLTextAreaElement>('.ofc-notes-ta');
    if (notesTa) {
      notesTa.value = fan.notes ?? '';
      this.lastSavedNotes = fan.notes ?? '';
      this.resizeNotesTa();
    }
  }

  remove(): void {
    this.host?.remove();
    this.host = null;
    this.shadow = null;
    this.panel = null;
  }

  // ─── Private ──────────────────────────────────────────────

  private toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    this.panel?.classList.toggle('collapsed', this.collapsed);
    const collapseBtn = this.shadow?.querySelector('#ofc-collapse');
    if (collapseBtn) {
      collapseBtn.innerHTML = this.collapsed ? ICON_CHEVRON_DOWN : ICON_CHEVRON_UP;
      collapseBtn.setAttribute('title', this.collapsed ? 'Expand panel' : 'Collapse panel');
    }
  }

  private setRegenVisible(visible: boolean): void {
    const btn = this.shadow?.querySelector<HTMLElement>('#ofc-regen');
    if (!btn) return;
    btn.style.display = visible ? '' : 'none';
    btn.classList.toggle('spinning', false);
  }

  private resizeNotesTa(): void {
    const ta = this.shadow?.querySelector<HTMLTextAreaElement>('.ofc-notes-ta');
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }

  private setCount(text: string): void {
    const el = this.shadow?.querySelector<HTMLElement>('#ofc-count');
    if (el) el.textContent = text ? `· ${text}` : '';
  }

  /** Replace only the body content, leaving the header intact. */
  private setBodyContent(html: string): void {
    const body = this.panel?.querySelector<HTMLElement>('#ofc-body');
    if (!body) return;
    body.innerHTML = html;
  }
}
