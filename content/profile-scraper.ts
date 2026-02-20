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
    if (el) {
      console.log(`[OFC] profile-scraper: resolved "${sel}"`);
      return el;
    }
  }
  console.log(`[OFC] profile-scraper: none resolved from [${selectors.join(', ')}]`);
  return null;
}

function textOf(el: Element | null): string {
  return el?.textContent?.trim() ?? '';
}

export function scrapeCreatorProfile(): ScrapedProfile | null {
  // Only run on pages that look like a creator profile
  const pathname = location.pathname;
  const isProfilePage =
    pathname.startsWith('/my/') ||
    /^\/@[^/]+$/.test(pathname) ||
    pathname.startsWith('/u/');

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
  if (!displayName) {
    console.log('[OFC] profile-scraper: no display name found — skipping scrape');
    return null;
  }

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
  console.log('[OFC] Profile scraped:', result);
  return result;
}
