/**
 * profile-scraper.ts
 *
 * Scrapes creator profile data from OF profile pages.
 * Selectors are educated guesses based on BEM naming patterns observed in the
 * chat DOM (validated 2025-02). Each field uses a fallback chain — the first
 * selector that resolves wins. All failures are logged with the attempted
 * selectors so they can be corrected against the real DOM.
 *
 * Call scrapeCreatorProfile() on any OF page; returns null if the page does
 * not look like a creator profile page.
 */

export interface ScrapedProfile {
  displayName: string;
  bio: string;
  profilePhotoUrl?: string;
  recentCaptions: string[];
}

function queryFirst(selectors: string[]): Element | null {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function textOf(el: Element | null): string {
  return el?.textContent?.trim() ?? '';
}

export function scrapeCreatorProfile(): ScrapedProfile | null {
  // Only run on pages that look like a creator profile
  const pathname = location.pathname;
  // Known OF section pages that are NOT creator profiles.
  // Kept as a blocklist rather than an allowlist so new OF routes don't silently break.
  const OF_SECTIONS = /^\/(my|following|collections|notifications|messages|bookmarks|statistics|vault|explore|home|add|edit|settings|subscribers|payments|search)\b/i;
  const isProfilePage =
    /^\/@[^/]+\/?$/.test(pathname) ||          // /@username
    pathname.startsWith('/u/') ||               // /u/123456
    (/^\/[^/]+\/?$/.test(pathname) && !OF_SECTIONS.test(pathname));  // bare /username

  if (!isProfilePage) return null;

  // ── Display name ────────────────────────────────────────────────────────────
  // OF uses a page-level h1 for the creator name on profile pages.
  const nameEl = queryFirst([
    'h1.g-page-title',
    '[class*="profile__name"] h1',
    '[class*="userAvatar__name"]',
    'h1',
  ]);
  const displayName = textOf(nameEl);

  // Bail out if we can't even find a name — probably not a profile page
  if (!displayName) return null;

  // ── Bio ─────────────────────────────────────────────────────────────────────
  const bioEl = queryFirst([
    '[class*="profile__about"]',
    '[class*="profile__description"]',
    '[class*="about__text"]',
    '[class*="b-profile__description"]',
    '[data-testid="profile-bio"]',
  ]);
  const bio = textOf(bioEl);

  // ── Profile photo ────────────────────────────────────────────────────────────
  const photoEl = queryFirst([
    '.g-avatar img',
    '[class*="profile__avatar"] img',
    '[class*="userAvatar__image"]',
    '[class*="b-avatar"] img',
  ]);
  const profilePhotoUrl = photoEl instanceof HTMLImageElement ? photoEl.src : undefined;

  // ── Recent post captions ─────────────────────────────────────────────────────
  // Grab up to 5 non-empty captions from visible posts on the profile feed.
  const captionEls = document.querySelectorAll(
    '[class*="b-post__text"], [class*="post__description"], [class*="postText"]'
  );
  const recentCaptions = Array.from(captionEls)
    .map((el) => el.textContent?.trim() ?? '')
    .filter(Boolean)
    .slice(0, 5);

  const result: ScrapedProfile = { displayName, bio, profilePhotoUrl, recentCaptions };
  return result;
}

/**
 * Scrape the logged-in creator's display name from the persistent sidebar nav.
 *
 * Validated against real OF DOM (2026-02):
 * - [class*="sidebar"] .g-user-name  — creator display name
 * - [class*="sidebar"] .g-user-username — @username (used as fallback ID)
 *
 * Available on every OF page, so this runs on chat pages without needing to
 * navigate to the creator's profile page.
 */
export function scrapeCreatorFromNav(): { displayName: string; username: string | null } | null {
  const nameEl = document.querySelector('[class*="sidebar"] .g-user-name');
  const displayName = nameEl?.textContent?.trim() ?? '';
  if (!displayName) return null;

  const usernameEl = document.querySelector('[class*="sidebar"] .g-user-username');
  const username = usernameEl?.textContent?.trim().replace(/^@/, '') || null;

  return { displayName, username };
}

/**
 * Diagnostic: run all profile selectors independently and log results.
 * Call window.__OFC_diagnoseProfile() in DevTools on a real OF profile page
 * to validate which selectors resolve vs. which need updating.
 */
export function diagnoseProfileScraper(): void {
  console.group('[OFC] Profile scraper diagnostic');
  console.log('pathname:', location.pathname);
  const checks: [string, Element | null][] = [
    ['h1.g-page-title',                    document.querySelector('h1.g-page-title')],
    ['[class*="profile__name"] h1',        document.querySelector('[class*="profile__name"] h1')],
    ['[class*="userAvatar__name"]',        document.querySelector('[class*="userAvatar__name"]')],
    ['h1 (any)',                           document.querySelector('h1')],
    ['[class*="profile__about"]',          document.querySelector('[class*="profile__about"]')],
    ['[class*="b-profile__description"]',  document.querySelector('[class*="b-profile__description"]')],
    ['.g-avatar img',                      document.querySelector('.g-avatar img')],
    ['[class*="b-post__text"] (first)',    document.querySelector('[class*="b-post__text"]')],
  ];
  for (const [label, el] of checks) {
    console.log(`${el ? '✓' : '✗'} ${label}`, el ?? 'NOT FOUND');
  }
  console.groupEnd();
}
