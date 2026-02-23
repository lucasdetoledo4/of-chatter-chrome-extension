import type { Suggestion, SuggestionType, SuggestionMode, FanProfile, CreatorAccount } from '../types/index';

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

// Position-based badge config for non-sell modes — type field is unreliable
// (model outputs "engage" for all 3), so we label by intent instead.
const MODE_TIER_CONFIG: Partial<Record<SuggestionMode, TypeConfig[]>> = {
  warm_up: [
    { accent: '#10b981', labelBg: 'rgba(16, 185, 129, 0.12)', labelColor: '#34d399', label: 'Personal' },
    { accent: '#10b981', labelBg: 'rgba(16, 185, 129, 0.12)', labelColor: '#34d399', label: 'Warmth'   },
    { accent: '#10b981', labelBg: 'rgba(16, 185, 129, 0.12)', labelColor: '#34d399', label: 'Light'    },
  ],
  re_engage: [
    { accent: '#8b5cf6', labelBg: 'rgba(139, 92, 246, 0.12)', labelColor: '#a78bfa', label: 'Check-in' },
    { accent: '#8b5cf6', labelBg: 'rgba(139, 92, 246, 0.12)', labelColor: '#a78bfa', label: 'Remind'   },
    { accent: '#8b5cf6', labelBg: 'rgba(139, 92, 246, 0.12)', labelColor: '#a78bfa', label: 'Nudge'    },
  ],
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
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
    margin: 8px 0;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
    width: 100%;
    min-width: 320px;
    max-width: 560px;
  }

  .ofc-hidden { display: none !important; }

  /* ── Header ─────────────────────────────────────────────── */
  #ofc-header {
    background: #fff;
    border-bottom: 1px solid #e2e8f0;
    user-select: none;
  }

  #ofc-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 8px 8px 12px;
    gap: 8px;
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

  /* ── Creator switcher button ─────────────────────────────── */
  .ofc-creator-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 6px;
    transition: background 0.12s;
    font-family: inherit;
    color: #475569;
  }

  .ofc-creator-btn:hover { background: #f1f5f9; }

  #ofc-creator-name {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: #475569;
    white-space: nowrap;
  }

  .ofc-creator-chevron {
    color: #94a3b8;
    display: flex;
    align-items: center;
    line-height: 0;
  }

  /* ── Creator dropdown ────────────────────────────────────── */
  .ofc-creator-drop {
    border-top: 1px solid #e2e8f0;
    background: #fff;
    overflow: hidden;
  }

  .ofc-creator-row {
    padding: 9px 14px;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: background 0.1s;
    color: #475569;
  }

  .ofc-creator-row:hover { background: #f8fafc; }

  .ofc-creator-row.active {
    color: #7c3aed;
    font-weight: 600;
  }

  .ofc-creator-check {
    font-size: 11px;
    color: #7c3aed;
  }

  #ofc-count {
    font-size: 10px;
    font-weight: 400;
    color: #94a3b8;
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
    color: #94a3b8;
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
    color: #475569;
    background: #f1f5f9;
  }

  #ofc-regen.spinning svg {
    animation: ofc-spin 0.65s linear infinite;
  }

  /* Regen in-progress: dim suggestions, keep them visible while waiting */
  #ofc-body.regen-loading { opacity: 0.38; pointer-events: none; transition: opacity 0.15s; }
  #ofc-body { transition: opacity 0.2s; }

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
    color: #94a3b8;
    transition: color 0.12s, background 0.12s, border-color 0.12s;
    white-space: nowrap;
    font-family: inherit;
  }

  .ofc-mode-btn:hover { color: #64748b; }

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
    color: #64748b;
    font-size: 12px;
  }

  .ofc-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid #e2e8f0;
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
    color: #dc2626;
    font-size: 12px;
    line-height: 1.55;
  }

  .ofc-error-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #dc2626;
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
    border-top: 1px solid #e2e8f0;
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
    background: #f1f5f9;
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
    color: #94a3b8;
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
    color: #475569;
    border-color: #e2e8f0;
    background: #f1f5f9;
  }

  .ofc-use-btn:hover {
    color: #7c3aed;
    background: rgba(124, 58, 237, 0.08);
    border-color: rgba(124, 58, 237, 0.2);
  }

  .ofc-use-btn.done {
    opacity: 1;
    pointer-events: none;
    color: #34d399;
    background: rgba(16, 185, 129, 0.1);
    border-color: rgba(16, 185, 129, 0.22);
  }

  /* ── Keyboard shortcut hints ─────────────────────── */
  .ofc-kbd {
    font-size: 9px;
    color: #94a3b8;
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    border-radius: 3px;
    padding: 1px 5px;
    font-family: ui-monospace, monospace;
    letter-spacing: 0.03em;
    flex-shrink: 0;
    transition: color 0.12s;
  }
  .ofc-card:hover .ofc-kbd { color: #475569; }

  .ofc-text {
    color: #334155;
    font-size: 13px;
    line-height: 1.5;
    word-break: break-word;
  }

  .ofc-card:hover .ofc-text {
    color: #0f172a;
  }

  /* ── Fan context strip ──────────────────────────────── */
  #ofc-fan-ctx {
    display: none;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    background: #f1f5f9;
    border-bottom: 1px solid #e2e8f0;
    font-size: 11px;
    flex-wrap: wrap;
  }

  #ofc-panel.collapsed #ofc-fan-ctx { display: none !important; }

  .ofc-ctx-spend {
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .ofc-ctx-sep { color: #cbd5e1; }

  .ofc-ctx-dur { color: #94a3b8; }

  .ofc-ctx-tag {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 1px 6px;
    border-radius: 100px;
    background: rgba(0, 0, 0, 0.05);
    color: #64748b;
  }

  .ofc-ctx-online {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 1px 6px;
    border-radius: 100px;
    background: rgba(16, 185, 129, 0.12);
    color: #10b981;
  }

  /* ── Notes ──────────────────────────────────────────── */
  #ofc-notes {
    padding: 6px 10px 8px;
    background: #fff;
    border-top: 1px solid #e2e8f0;
    position: relative;
  }

  #ofc-panel.collapsed #ofc-notes { display: none; }

  .ofc-notes-label {
    display: block;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #94a3b8;
    margin-bottom: 4px;
  }

  .ofc-notes-ta {
    width: 100%;
    background: #f8fafc;
    border: 1.5px solid #e2e8f0;
    border-radius: 6px;
    color: #475569;
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

  .ofc-notes-ta::placeholder { color: #cbd5e1; }

  .ofc-notes-ta:focus {
    border-color: #7c3aed;
    color: #0f172a;
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
  if (value === 0) return '#94a3b8';
  if (value < 50) return '#64748b';
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
  private creatorSwitchHandler: ((id: string) => void) | null = null;
  private activeMode: SuggestionMode = 'sell';
  private lastSavedNotes = '';
  private collapsed = false;
  private _keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private _docClickHandler: (() => void) | null = null;
  private _creators: CreatorAccount[] = [];
  private _activeCreatorId: string = '';
  private _dropOpen = false;
  private _justToggledDrop = false;

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

  setCreatorSwitchHandler(fn: (id: string) => void): void {
    this.creatorSwitchHandler = fn;
  }

  setCreators(creators: CreatorAccount[], activeId: string): void {
    this._creators = creators;
    this._activeCreatorId = activeId;
    this._syncCreatorBtn();
  }

  /** Set the active mode — updates internal state and syncs button classes if injected. */
  setMode(mode: SuggestionMode): void {
    this.activeMode = mode;
    const btns = this.shadow?.querySelectorAll<HTMLButtonElement>('.ofc-mode-btn');
    btns?.forEach((b) => b.classList.toggle('active', b.dataset['mode'] === mode));
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
      <div id="ofc-header-row">
        <div id="ofc-title">
          <span class="ofc-logo">${ICON_SPARKLE}</span>
          <button id="ofc-creator-btn" class="ofc-creator-btn" title="Switch creator">
            <span id="ofc-creator-name">···</span>
            <span class="ofc-creator-chevron">${ICON_CHEVRON_DOWN}</span>
          </button>
          <span id="ofc-count"></span>
        </div>
        <div id="ofc-modes">
          <button class="ofc-mode-btn${this.activeMode === 'warm_up' ? ' active' : ''}" data-mode="warm_up">Warm</button>
          <button class="ofc-mode-btn${this.activeMode === 'sell' ? ' active' : ''}" data-mode="sell">Sell</button>
          <button class="ofc-mode-btn${this.activeMode === 're_engage' ? ' active' : ''}" data-mode="re_engage">Re-engage</button>
        </div>
        <div id="ofc-actions">
          <button id="ofc-regen" class="ofc-hbtn" title="Regenerate (Alt+R)" style="display:none">
            ${ICON_REGEN}
          </button>
          <button id="ofc-collapse" class="ofc-hbtn" title="Collapse panel">
            ${ICON_CHEVRON_UP}
          </button>
        </div>
      </div>
      <div id="ofc-creator-drop" class="ofc-creator-drop ofc-hidden"></div>
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

    // Wire creator switcher button
    const creatorBtn = header.querySelector<HTMLButtonElement>('#ofc-creator-btn')!;
    const creatorDrop = header.querySelector<HTMLElement>('#ofc-creator-drop')!;
    creatorBtn.addEventListener('click', () => {
      this._justToggledDrop = true;
      setTimeout(() => { this._justToggledDrop = false; }, 10);
      this._dropOpen = !this._dropOpen;
      creatorDrop.classList.toggle('ofc-hidden', !this._dropOpen);
      const chevron = creatorBtn.querySelector<HTMLElement>('.ofc-creator-chevron');
      if (chevron) chevron.innerHTML = this._dropOpen ? ICON_CHEVRON_UP : ICON_CHEVRON_DOWN;
    });

    // Close dropdown when clicking outside the panel
    if (this._docClickHandler) {
      document.removeEventListener('click', this._docClickHandler);
    }
    const docClickHandler = (): void => {
      if (this._dropOpen && !this._justToggledDrop) {
        this._dropOpen = false;
        creatorDrop.classList.add('ofc-hidden');
        const chevron = creatorBtn.querySelector<HTMLElement>('.ofc-creator-chevron');
        if (chevron) chevron.innerHTML = ICON_CHEVRON_DOWN;
      }
    };
    document.addEventListener('click', docClickHandler);
    this._docClickHandler = docClickHandler;

    // Keyboard shortcuts — Alt+1/2/3 inserts suggestion, Alt+R regens
    // Remove any previous listener first (handles re-injection after React removes the panel)
    if (this._keydownHandler) {
      document.removeEventListener('keydown', this._keydownHandler);
    }
    const keydownHandler = (e: KeyboardEvent): void => {
      if (!e.altKey) return;
      if (e.key === '1') { e.preventDefault(); this.insertCard(0); }
      else if (e.key === '2') { e.preventDefault(); this.insertCard(1); }
      else if (e.key === '3') { e.preventDefault(); this.insertCard(2); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); this.regenerateHandler?.(); }
    };
    document.addEventListener('keydown', keydownHandler);
    this._keydownHandler = keydownHandler;

    // Apply any creator data that was set before the shadow DOM existed
    this._syncCreatorBtn();
  }

  isAttached(): boolean {
    return this.host !== null && document.contains(this.host);
  }

  showLoading(): void {
    if (!this.panel) return;
    this.clearRegenLoading();
    this.setRegenVisible(false);
    this.setCount('');
    this.setBodyContent(`
      <div class="ofc-loading">
        <div class="ofc-spinner"></div>
        <span>Generating suggestions…</span>
      </div>
    `);
  }

  /** Regen-specific loading: keep current suggestions visible but dimmed, spin the icon. */
  showRegenLoading(): void {
    const regenBtn = this.shadow?.querySelector<HTMLButtonElement>('#ofc-regen');
    if (regenBtn) {
      regenBtn.classList.add('spinning');
      regenBtn.disabled = true;
    }
    const body = this.panel?.querySelector<HTMLElement>('#ofc-body');
    body?.classList.add('regen-loading');
  }

  showSuggestions(suggestions: Suggestion[]): void {
    if (!this.panel) return;
    this.clearRegenLoading();

    const count = suggestions.length;
    this.setCount(count > 0 ? `${count} suggestion${count === 1 ? '' : 's'}` : '');

    const modeTiers = MODE_TIER_CONFIG[this.activeMode];
    const cardsHtml = suggestions
      .map((s, i) => {
        const cfg = modeTiers?.[i] ?? TYPE_CONFIG[s.type] ?? TYPE_CONFIG.engage;
        return `
          <div class="ofc-card" data-text="${escapeHtml(s.text)}">
            <div class="ofc-accent-bar" style="background:${cfg.accent};"></div>
            <div class="ofc-card-body">
              <div class="ofc-card-top">
                <span class="ofc-badge" style="background:${cfg.labelBg};color:${cfg.labelColor};">
                  ${escapeHtml(cfg.label)}
                </span>
                <div style="display:flex;align-items:center;gap:5px;">
                  <span class="ofc-kbd" title="Alt+${i + 1}">alt ${i + 1}</span>
                  <button class="ofc-use-btn">Use →</button>
                </div>
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
    this.clearRegenLoading();
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

  /** Show or hide the "● online" pill in the fan context strip. */
  setOnlineStatus(online: boolean): void {
    const ctx = this.shadow?.querySelector<HTMLElement>('#ofc-fan-ctx');
    if (!ctx) return;
    const existing = ctx.querySelector('.ofc-ctx-online');
    if (online && !existing) {
      const pill = document.createElement('span');
      pill.className = 'ofc-ctx-online';
      pill.textContent = '● online';
      ctx.appendChild(pill);
    } else if (!online && existing) {
      existing.remove();
    }
  }

  remove(): void {
    if (this._keydownHandler) {
      document.removeEventListener('keydown', this._keydownHandler);
      this._keydownHandler = null;
    }
    if (this._docClickHandler) {
      document.removeEventListener('click', this._docClickHandler);
      this._docClickHandler = null;
    }
    this.host?.remove();
    this.host = null;
    this.shadow = null;
    this.panel = null;
  }

  // ─── Private ──────────────────────────────────────────────

  private _syncCreatorBtn(): void {
    const nameEl = this.shadow?.querySelector<HTMLElement>('#ofc-creator-name');
    const active = this._creators.find((c) => c.id === this._activeCreatorId) ?? this._creators[0];
    if (nameEl) {
      nameEl.textContent = active ? active.name.toUpperCase() : '···';
    }

    const drop = this.shadow?.querySelector<HTMLElement>('#ofc-creator-drop');
    if (!drop) return;

    // Always show the creator name; hide the chevron when there's only one creator
    const creatorBtn = this.shadow?.querySelector<HTMLElement>('#ofc-creator-btn');
    if (creatorBtn) {
      creatorBtn.style.display = '';
      creatorBtn.style.cursor = this._creators.length > 1 ? 'pointer' : 'default';
      const chevron = creatorBtn.querySelector<HTMLElement>('.ofc-creator-chevron');
      if (chevron) chevron.style.display = this._creators.length > 1 ? '' : 'none';
    }

    drop.innerHTML = this._creators.map((c) => `
      <div class="ofc-creator-row${c.id === this._activeCreatorId ? ' active' : ''}" data-creator-id="${escapeHtml(c.id)}">
        <span>${escapeHtml(c.name)}</span>
        ${c.id === this._activeCreatorId ? '<span class="ofc-creator-check">✓</span>' : ''}
      </div>
    `).join('');

    drop.querySelectorAll<HTMLElement>('.ofc-creator-row').forEach((row) => {
      row.addEventListener('click', () => {
        const id = row.dataset['creatorId'];
        if (!id || id === this._activeCreatorId) return;
        // Close the dropdown immediately
        this._dropOpen = false;
        drop.classList.add('ofc-hidden');
        const chevron = this.shadow?.querySelector<HTMLElement>('.ofc-creator-chevron');
        if (chevron) chevron.innerHTML = ICON_CHEVRON_DOWN;
        this.creatorSwitchHandler?.(id);
      });
    });
  }

  /** Insert the suggestion card at the given zero-based index via keyboard shortcut. */
  private insertCard(index: number): void {
    const cards = this.shadow?.querySelectorAll<HTMLElement>('.ofc-card');
    if (!cards || index >= cards.length) return;
    const card = cards[index];
    if (!card) return;
    const text = card.dataset['text'] ?? '';
    if (!text) return;

    if (this.insertHandler) {
      this.insertHandler(text);
    } else {
      void navigator.clipboard.writeText(text);
    }

    // Mirror the visual feedback of a click on the use-btn
    const useBtn = card.querySelector<HTMLButtonElement>('.ofc-use-btn');
    if (useBtn) {
      useBtn.textContent = '✓ Inserted';
      useBtn.classList.add('done');
      setTimeout(() => {
        useBtn.textContent = 'Use →';
        useBtn.classList.remove('done');
      }, 2000);
    }
  }

  private toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    this.panel?.classList.toggle('collapsed', this.collapsed);
    const collapseBtn = this.shadow?.querySelector('#ofc-collapse');
    if (collapseBtn) {
      collapseBtn.innerHTML = this.collapsed ? ICON_CHEVRON_DOWN : ICON_CHEVRON_UP;
      collapseBtn.setAttribute('title', this.collapsed ? 'Expand panel' : 'Collapse panel');
    }
  }

  private clearRegenLoading(): void {
    const regenBtn = this.shadow?.querySelector<HTMLButtonElement>('#ofc-regen');
    if (regenBtn) {
      regenBtn.classList.remove('spinning');
      regenBtn.disabled = false;
    }
    const body = this.panel?.querySelector<HTMLElement>('#ofc-body');
    body?.classList.remove('regen-loading');
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
