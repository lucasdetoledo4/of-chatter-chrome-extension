# Suggestions & Deferred Ideas

Ideas that came up but weren't implemented. Review before starting new sessions.

---

## Regen button cooldown

Disable the regenerate button for ~1s after click to prevent rapid-fire API
calls from impatient chatters. Simple: set `disabled` on click, re-enable in
the existing `clearRegenLoading()` call — no new state needed.

---

## Fan profile viewer in popup

List stored fans (displayName, lifetimeValue, lastSeen, tags) in the popup UI.
Tap a fan to see full profile + notes. Low complexity: `chrome.storage.local`
already has everything, just needs a simple table rendered in `popup.html`.

---

## XHR intercept for PPV data

More reliable than DOM class scraping. OF's message feed API returns purchase
data in the response JSON. Intercept `fetch`/`XHR` in the content script and
parse `$.data[].media[].price` + purchased flag. Updates `ppvHistory` and
`lifetimeValue` without needing fragile DOM selectors.

---

## Suggestion history (last 2–3 gens)

Keep the last 2–3 suggestion sets in memory. Surface via a small "← prev"
arrow in the panel header. If a chatter dismisses or misreads suggestions
before using one, they can step back without triggering a new API call.

---

## Per-fan mode memory

Persist the active suggestion mode (Warm/Sell/Re-engage) per `fanId` in
`chrome.storage.local` keyed as `ofc_mode:{fanId}`. Restore it on navigation
to that fan's chat. Currently mode is global — switching fans mid-session
resets the mode to whatever was last used.

---

## Typo correction as follow-up message

When a suggestion card containing a typo is sent, automatically copy the
correction (e.g. `"you*"`) to clipboard so the chatter can paste it as a
quick follow-up message — matching the natural human pattern of sending a
correction in a separate message.

Complexity notes:
- Needs to detect which suggestion was sent and whether it contains a typo
- Correction only makes sense after the chatter picks and sends a specific card
- No extra API call needed — derive the corrected word client-side
- Silent UX: no extra card, just clipboard on "Use →" click
