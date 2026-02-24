import type {
  CreatorType,
  CreatorPersona,
  CreatorProfile,
  CreatorAccount,
  AnalyzeCreatorStyleRequest,
  BackgroundResponse,
} from '../types/index';
import {
  getCreatorProfile as fetchCreatorProfileFromStorage,
  upsertCreatorProfile,
  getCreators,
  upsertCreatorAccount,
} from '../utils/storage';
import { CREATOR_PRESETS } from '../utils/prompt-builder';
import {
  STYLE_REFRESH_MS,
  LEGACY_PLACEHOLDER_RE,
  STYLE_ANALYSIS_MIN_MSGS,
  CREATOR_STYLE_MAX_CHARS,
  StorageKey,
} from '../utils/constants';

// ─── Module-level state ───────────────────────────────────────────────────────

let cachedCreatorId: string = 'default';
let cachedCreatorType: CreatorType = 'woman';
let cachedCreatorProfile: CreatorProfile | null = null;

// ─── Getters / setters ────────────────────────────────────────────────────────

export function getCreatorId(): string { return cachedCreatorId; }
export function getCreatorType(): CreatorType { return cachedCreatorType; }
export function getCreatorProfile(): CreatorProfile | null { return cachedCreatorProfile; }

export function setCreatorProfile(profile: CreatorProfile | null): void {
  cachedCreatorProfile = profile;
}

export function setCreatorType(type: CreatorType): void {
  cachedCreatorType = type;
}

// ─── Persona ──────────────────────────────────────────────────────────────────

const _mockWindow = window as typeof window & { __OFC_MOCK_PERSONA__?: string };

export function getActivePersona(): CreatorPersona {
  const mockType = _mockWindow.__OFC_MOCK_PERSONA__;
  if (mockType && mockType in CREATOR_PRESETS) {
    return CREATOR_PRESETS[mockType as keyof typeof CREATOR_PRESETS];
  }
  return {
    ...CREATOR_PRESETS[cachedCreatorType],
    name: cachedCreatorProfile?.displayName || CREATOR_PRESETS[cachedCreatorType].name,
  };
}

// ─── Name normalisation ───────────────────────────────────────────────────────

/**
 * Normalise a creator display name for fuzzy matching.
 * Strips emojis / special punctuation, lowercases, collapses whitespace.
 * "Sofia 💕" and "sofia" both normalise to "sofia".
 */
export function normalizeCreatorName(name: string): string {
  return name
    .replace(/[^\w\s&\u0080-\uFFFF]/g, '') // keep letters (incl. accented), digits, spaces, &
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// ─── Persona type inference ───────────────────────────────────────────────────

/**
 * Infer a creator persona type from their bio + display name using keyword heuristics.
 * This is a best-effort starting point — chatters always override in the popup.
 */
export function inferPersonaType(bio: string, displayName: string): CreatorType {
  const text = `${bio} ${displayName}`.toLowerCase();
  if (/\bcouple\b|husband|wife|\bwe \b/.test(text)) return 'couple';
  if (/egirl|e-girl|\bgamer\b|streamer|anime|cosplay|kawaii/.test(text)) return 'egirl';
  if (/mature|milf|\bmom\b|\bmother\b|cougar/.test(text)) return 'mature_woman';
  if (/\bguy\b|\bman\b|\bmale\b|daddy|muscl|gym\b/.test(text)) return 'man';
  if (/\bvideo\b.*custom|\bcustom.*clips\b/.test(text)) return 'video_creator';
  if (/photos? only|pics only|picture sets?|photo sets?/.test(text)) return 'picture_only';
  return 'woman';
}

// ─── Creator state loading ────────────────────────────────────────────────────

export async function loadCreatorState(): Promise<void> {
  const syncData = await chrome.storage.sync.get([
    StorageKey.ActiveCreatorId,
    StorageKey.Creators,
  ]);
  let creators: CreatorAccount[] =
    (syncData[StorageKey.Creators] as CreatorAccount[]) ?? [];

  // One-time migration: strip any placeholder names left by old seeding logic.
  const cleaned = creators.filter((c) => !LEGACY_PLACEHOLDER_RE.test(c.name));
  if (cleaned.length !== creators.length) {
    creators = cleaned;
    await chrome.storage.sync.set({ [StorageKey.Creators]: creators });

  }

  if (creators.length === 0) {
    cachedCreatorId = '';
    cachedCreatorType = 'woman';
    cachedCreatorProfile = null;
    return;
  }

  const activeId =
    (syncData[StorageKey.ActiveCreatorId] as string) ?? creators[0]!.id;
  const active = creators.find((c) => c.id === activeId) ?? creators[0]!;
  cachedCreatorId = active.id;
  cachedCreatorType = active.type as CreatorType;
  cachedCreatorProfile = await fetchCreatorProfileFromStorage(cachedCreatorId);
}

// ─── Style analysis ───────────────────────────────────────────────────────────

/** Fire-and-forget style analysis when we have enough real messages. */
export function triggerStyleAnalysisIfNeeded(creatorRealMessages: string[]): void {
  if (creatorRealMessages.length < STYLE_ANALYSIS_MIN_MSGS) return;

  // Skip if a fresh style exists (analyzed within the last STYLE_REFRESH_MS)
  const analyzedAt = cachedCreatorProfile?.styleAnalyzedAt;
  const isStale =
    !analyzedAt ||
    Date.now() - new Date(analyzedAt).getTime() > STYLE_REFRESH_MS;
  if (cachedCreatorProfile?.writingStyle && !isStale) return;

  const req: AnalyzeCreatorStyleRequest = {
    type: 'ANALYZE_CREATOR_STYLE',
    creatorMessages: creatorRealMessages,
  };
  const reason = cachedCreatorProfile?.writingStyle
    ? 'refreshing stale style'
    : 'analysing creator voice';


  chrome.runtime
    .sendMessage<AnalyzeCreatorStyleRequest, BackgroundResponse>(req)
    .then(async (resp) => {
      if (resp.success && resp.writingStyle) {
        cachedCreatorProfile = await upsertCreatorProfile(cachedCreatorId, {
          writingStyle: resp.writingStyle.slice(0, CREATOR_STYLE_MAX_CHARS),
          styleAnalyzedAt: new Date().toISOString(),
        });

      }
    })
    .catch((err: unknown) => {
      console.warn('[OFC] Style analysis failed:', err);
    });
}

// ─── Creator bio fetch ────────────────────────────────────────────────────────

/**
 * Fetch the creator's bio from their OF profile page by reading server-rendered
 * meta tags. OF emits og:description (and meta name=description) server-side for
 * SEO, so the text is present in the raw HTML response without needing JS execution.
 *
 * Runs from the content script (same-origin → session cookies are included
 * automatically). Falls back gracefully to null on any network or parse failure.
 */
export async function fetchCreatorBio(username: string): Promise<string | null> {
  try {
    const resp = await fetch(`https://onlyfans.com/@${username}`, {
      credentials: 'include',
      headers: { Accept: 'text/html' },
    });
    if (!resp.ok) return null;
    const html = await resp.text();

    // Both attribute orderings are valid HTML; OF may use either.
    const patterns = [
      /<meta\s[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
      /<meta\s[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i,
      /<meta\s[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
      /<meta\s[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i,
    ];

    for (const pattern of patterns) {
      const m = html.match(pattern);
      if (m?.[1]) {
        return m[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"');
      }
    }


    return null;
  } catch (err) {
    console.warn('[OFC] Creator bio fetch failed:', err);
    return null;
  }
}

// ─── Re-export for convenience ────────────────────────────────────────────────
// Callers that need to upsert accounts can import these directly from storage,
// but we also need them in the bio-fetch IIFE in injector.ts.
export { getCreators, upsertCreatorAccount, upsertCreatorProfile };
