import { getFanProfile } from '../utils/storage';
import { computeAutoTags } from '../utils/auto-tagger';

// ─── Tag colour palette (matches panel accent colours) ────────────────────────

const TAG_STYLE: Record<string, string> = {
  whale:          'background:rgba(16,185,129,0.18);color:#34d399;',
  'ppv buyer':    'background:rgba(245,158,11,0.18);color:#fbbf24;',
  'time waster':  'background:rgba(239,68,68,0.16);color:#f87171;',
  ghosted:        'background:rgba(148,163,184,0.14);color:#94a3b8;',
};

const PILL_BASE = [
  'display:inline-block',
  'font-size:11px',
  'font-weight:700',
  'letter-spacing:0.07em',
  'text-transform:uppercase',
  'padding:1px 6px',
  'border-radius:100px',
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  'line-height:1.6',
  'white-space:nowrap',
  'pointer-events:none',
].join(';');

// ─── DOM helpers ──────────────────────────────────────────────────────────────

const CHAT_LINK_RE = /\/my\/chats\/chat\/([^/?#]+)|\/messages\/([^/?#]+)/;

/**
 * Find the chat inbox list container to scope tag injection.
 *
 * OF renders the inbox list, pinned section, and gallery in different
 * containers. We want tags ONLY on the regular inbox conversation rows —
 * the "left chat boxes" the chatter uses to pick who to reply to.
 *
 * Selectors in priority order (validated 2026-02 where possible):
 *  1. at-attr="chats_list" — OF's stable AT attribute for the inbox list
 *  2. .b-chats__list — BEM class used in some OF builds
 *  3. [class*="chats__list"] — flexible match for minified variants
 *
 * Falls back to null; callers fall back to document-wide scan (existing
 * behaviour) if the container is not found.
 */
function findChatListScope(): Element | null {
  return (
    document.querySelector('[at-attr="chats_list"]') ??
    document.querySelector('[at-attr="list_chats"]') ??
    document.querySelector('.b-chats__list') ??
    document.querySelector('[class*="b-chats__list"]') ??
    null
  );
}

function extractFanId(href: string): string | null {
  const match = href.match(CHAT_LINK_RE);
  return match?.[1] ?? match?.[2] ?? null;
}

async function tagLink(link: HTMLAnchorElement): Promise<void> {
  // Mark first to prevent concurrent re-processing while awaiting storage
  link.dataset.ofcTagged = 'true';

  const fanId = extractFanId(link.getAttribute('href') ?? link.href);
  if (!fanId) return;

  const profile = await getFanProfile(fanId);
  if (!profile) return;

  // Compute tags fresh — don't rely on stored tags which may be stale
  const tags = computeAutoTags(profile);
  if (tags.length === 0) return;

  // Remove stale container if it exists (re-tag after profile change)
  link.querySelector('.ofc-inbox-tags')?.remove();

  const wrap = document.createElement('span');
  wrap.className = 'ofc-inbox-tags';
  wrap.style.cssText = 'display:inline-flex;gap:3px;align-items:center;margin-left:2px;vertical-align:middle;flex-shrink:0;';

  for (const tag of tags.slice(0, 2)) {
    const extra = TAG_STYLE[tag] ?? 'background:rgba(255,255,255,0.1);color:#cbd5e1;';
    const pill = document.createElement('span');
    pill.textContent = tag;
    pill.style.cssText = `${PILL_BASE};${extra}`;
    wrap.appendChild(pill);
  }

  link.appendChild(wrap);
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

function scanAndTag(): void {
  // Scope to the inbox list container when found — avoids tagging links in the
  // pinned section, gallery, vault, and other non-inbox contexts.
  const scope: Element | Document = findChatListScope() ?? document;
  const links = Array.from(scope.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/my/chats/chat/"], a[href*="/messages/"]'
  ));
  for (const link of links) {
    if (!link.dataset.ofcTagged) void tagLink(link);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

let _observer: MutationObserver | null = null;
let _debounce: ReturnType<typeof setTimeout> | null = null;

export function startInboxTagger(): void {
  stopInboxTagger();
  scanAndTag();

  _observer = new MutationObserver(() => {
    if (_debounce) clearTimeout(_debounce);
    _debounce = setTimeout(() => { _debounce = null; scanAndTag(); }, 120);
  });
  _observer.observe(document.body, { childList: true, subtree: true });
}

export function stopInboxTagger(): void {
  _observer?.disconnect();
  _observer = null;
  if (_debounce) { clearTimeout(_debounce); _debounce = null; }

  // Remove injected tags and clear markers so re-entry does a clean pass
  document.querySelectorAll('.ofc-inbox-tags').forEach((el) => el.remove());
  Array.from(document.querySelectorAll<HTMLElement>('a[data-ofc-tagged]')).forEach((el) => {
    delete el.dataset.ofcTagged;
  });
}
