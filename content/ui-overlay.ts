import type { Suggestion, SuggestionMode, FanProfile, CreatorAccount } from '../types/index';
import {
  TYPE_CONFIG,
  MODE_TIER_CONFIG,
  ICON_SPARKLE,
  ICON_REGEN,
  ICON_CHEVRON_UP,
  ICON_CHEVRON_DOWN,
} from './overlay-config';
import { STYLES } from './overlay-styles';
import {
  PANEL_HOST_ID,
  REGEN_FEEDBACK_MS,
  NOTES_SAVED_MS,
  DROP_GUARD_MS,
} from '../utils/constants';

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
    document.getElementById(PANEL_HOST_ID)?.remove();

    const host = document.createElement('div');
    host.id = PANEL_HOST_ID;

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
        setTimeout(() => savedEl.classList.remove('visible'), NOTES_SAVED_MS);
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
      setTimeout(() => { this._justToggledDrop = false; }, DROP_GUARD_MS);
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

    // Single delegated listener on the container — O(1) instead of O(n) per-card
    const container = this.shadow?.querySelector<HTMLElement>('.ofc-suggestions');
    if (container) this.wireCardClicks(container);
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

  /** Single delegated click handler for all suggestion cards. */
  private wireCardClicks(container: HTMLElement): void {
    container.addEventListener('click', (e) => {
      const card = (e.target as Element).closest<HTMLElement>('.ofc-card');
      if (!card) return;
      // Stop propagation on use-btn clicks to avoid triggering parent listeners
      if ((e.target as Element).closest('.ofc-use-btn')) e.stopPropagation();
      this.doInsert(card);
    });
  }

  /** Insert the suggestion text from a card and show visual feedback. */
  private doInsert(card: HTMLElement): void {
    const text = card.dataset['text'] ?? '';
    if (!text) return;
    this.insertHandler ? this.insertHandler(text) : void navigator.clipboard.writeText(text);
    const btn = card.querySelector<HTMLButtonElement>('.ofc-use-btn');
    if (btn) {
      btn.textContent = '✓ Inserted';
      btn.classList.add('done');
      setTimeout(() => {
        btn.textContent = 'Use →';
        btn.classList.remove('done');
      }, REGEN_FEEDBACK_MS);
    }
  }

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
    this.doInsert(card);
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
