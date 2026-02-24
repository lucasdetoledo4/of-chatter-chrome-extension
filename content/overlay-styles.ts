// ─── Shadow DOM styles ────────────────────────────────────────────────────────
// Isolated inside the shadow root — OF's own styles do not bleed in.

export const STYLES = `
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

  /* prev/next use text arrows, not SVG — restore normal line-height */
  #ofc-prev, #ofc-next { font-size: 13px; line-height: 1; }

  /* Regen in-progress: dim suggestions, keep them visible while waiting */
  #ofc-body.regen-loading { opacity: 0.38; pointer-events: none; transition: opacity 0.15s; }
  #ofc-body { transition: opacity 0.2s; }

  /* ── Trigger-word auto-switch notice ─────────────────────── */
  #ofc-trigger-notice {
    display: none;
    font-size: 10.5px;
    color: #92400e;
    background: #fef3c7;
    border-left: 3px solid #f59e0b;
    padding: 4px 10px;
  }
  #ofc-trigger-notice.visible { display: block; }

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
