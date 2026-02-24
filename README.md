# OF Chatter Assistant — Chrome Extension

A Manifest V3 Chrome extension that injects an AI-powered reply panel into OnlyFans. Built for agency operators managing multiple creator accounts simultaneously: when a fan message arrives the extension generates three ready-to-send replies in under a second, tiered from rapport-building to direct upsell, in the creator's actual voice.

**Core metric**: one chatter can work 5–10 accounts without context-switching — the panel keeps fan context, spend history, and reply options visible at all times.

---

## How it works

```
Fan sends message
    └─ MutationObserver fires (dom-observer.ts)
        └─ Conversation history scraped from OF React DOM
        └─ Fan profile fetched / created in chrome.storage.local
        └─ PPV purchases auto-detected and added to profile
        └─ chrome.runtime.sendMessage → background service worker
            └─ Prompt assembled (prompt-builder.ts)
            └─ Anthropic API call (haiku by default, sonnet for long chats)
            └─ JSON response parsed → 3 Suggestion objects
        └─ Shadow DOM panel renders suggestion cards
            └─ Click or Alt+1/2/3 → text inserted into OF chat input
```

The Anthropic API key lives exclusively in `chrome.storage.sync` and is only read inside the background service worker. Content scripts never see it.

---

## Features

### Suggestion generation

Three reply options are generated for every incoming fan message. Each card has a labelled intent tier and a left-border accent colour:

| Tier | Intent |
|------|--------|
| **Engage** | Rapport-building; no sell at all. Keeps the fan talking. |
| **Soft Sell** | Story-led nudge toward content. Feels natural, not pushy. |
| **Direct** | Clear CTA with a price or action. Confident, in-character. |

### Suggestion modes

The chatter switches modes per-conversation based on the fan's state. Mode is persisted to `chrome.storage.local` and survives page reloads.

| Mode | What the model generates |
|------|--------------------------|
| **Sell** *(default)* | The three standard tiers above |
| **Warm Up** | Three rapport-only replies; no upsell language at all |
| **Re-engage** | Three reactivation replies for fans who have gone quiet |

### Creator persona system

Seven persona types, each with a distinct voice guide and concrete few-shot example exchanges (sourced from real chatter training material). The model receives both — the guide for tone/style and the examples for exact language patterns.

| Type | Voice character |
|------|----------------|
| `egirl` | Bubbly, emoji-heavy, FOMO-driven, casual spelling |
| `woman` | Warm, genuinely flirty, builds connection before the sell |
| `mature_woman` | Experienced, unhurried, makes fans feel chosen |
| `man` | Direct, gym/lifestyle focus, low emoji, matter-of-fact upsells |
| `picture_only` | Visual language, teases through set/shoot descriptions |
| `video_creator` | Motion-forward, custom clip emphasis, behind-the-scenes energy |
| `couple` | Natural "we" voice, voyeuristic framing, invites rather than sells |

If the model has a real conversation to learn from, few-shot examples are replaced with the creator's actual sent messages — the highest-fidelity persona signal possible.

### Creator auto-detection

On every page load the extension scrapes the logged-in user's identity from the OF sidebar nav. It then:

1. Fuzzy-matches the scraped name against stored creators (emoji/punctuation-stripped comparison)
2. Auto-switches to the matching creator if found
3. Auto-creates a new creator record if the name is new
4. Fetches the creator's OF profile page server-side meta tags to extract their bio
5. Infers the persona type from the bio using keyword heuristics (overridable in the popup)

The chatter never needs to manually select which account they're chatting from.

### AI-inferred writing style

When the extension has observed at least 5 of the creator's own sent messages, it fires a background `ANALYZE_CREATOR_STYLE` request. The model produces a 3–4 sentence description of the creator's actual writing patterns (emoji density, sentence rhythm, characteristic phrases, opener style). This description replaces the static voice guide in subsequent prompts — the replies sound like *that specific creator*, not a generic archetype.

Style analysis results are cached for 7 days; re-analysis is triggered automatically when the cache expires.

### Fan profile tracking

Every fan has a persistent profile in `chrome.storage.local` (keyed `fan:{fanId}`):

```
fanId           string     scraped from URL / DOM
displayName     string     scraped from page title / chat header
firstSeen       ISO8601    set on first contact
lastSeen        ISO8601    updated on every message
lifetimeValue   number     USD, auto-incremented from PPV detections
messageCount    number     total messages processed
tags            string[]   operator-applied: "whale", "ghosted", "custom-content"
notes           string     freeform; editable in the panel, auto-saved on blur
ppvHistory      object[]   { contentId, price, date } per purchase
usedSuggestions string[]   last 10 sent replies; deduplication guard in the prompt
```

Profiles older than 90 days are pruned automatically on extension install/startup.

### Fan context in the prompt

The model receives structured behavioural context on every request — it's not just the conversation history:

- **Spend tier**: VIP framing for high spenders ($200+), gentle intro pricing for $0 fans, time-waster flag for fans with 15+ messages and no purchases
- **Recency**: if the fan has been quiet for 7+ days, re-engagement tone is applied before any upsell
- **Tags**: whale, ghosted, custom-content flags influence the pitch strategy
- **PPV history**: the model knows how many purchases the fan has made
- **Used suggestions**: the last 5 sent replies (truncated to 80 chars each) are included as a "do not repeat" block, eliminating recycled phrases

### PPV purchase auto-detection

On every message, the extension scans the visible chat DOM for PPV message elements with paid/purchased/unlocked modifier classes and extracts the `$price` from their text content. New purchases are deduplicated against the stored history and added automatically, with `lifetimeValue` incremented accordingly. No manual data entry required.

### Fan online status

The chat header is polled for OF's online status indicator every 30 seconds. When the fan is online, a `● online` pill appears in the fan context strip above the suggestions.

### Reply length scaling

The prompt adapts to the fan's last message length:
- **≤ 8 words** → 1–2 sentence replies only (match their brevity)
- **≥ 30 words** → 3–4 sentence replies where natural
- Between → no instruction (model chooses)

### Regenerate with variation hints

The regenerate button (Alt+R) replays the same request with a randomly selected variation hint injected into the prompt — instructions like "be more mysterious", "keep it short and punchy", or "start mid-thought". The last 3 used hints are tracked to ensure consecutive regenerations always feel different.

### Multi-creator switcher

The panel header shows the active creator name and a chevron. Clicking it opens a dropdown of all stored creators. Selecting one writes `ACTIVE_CREATOR_ID` to `chrome.storage.sync`, which triggers the `onChanged` listener to reload state and re-generate suggestions under the new persona — no page reload required.

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| Alt+1 | Insert suggestion 1 |
| Alt+2 | Insert suggestion 2 |
| Alt+3 | Insert suggestion 3 |
| Alt+R | Regenerate all three |

### SPA navigation

OF is a React SPA. The extension tracks `location.href` changes via a root `MutationObserver` and re-initialises the chat assistant on every navigation to a chat URL (debounced 300ms). On non-chat navigation (e.g. a creator's profile page), the extension opportunistically scrapes the profile DOM to update the creator record.

### React re-render resilience

A host-guard `MutationObserver` watches `document.body` for panel removal. If OF's React re-renders wipe the injected host element, the panel is re-injected automatically.

---

## Architecture

### Module layout

```
of-chatter-ext/
├── manifest.json
├── build.js                        # esbuild: ESM for SW, IIFE for content + popup
├── tsconfig.json
├── types/
│   └── index.ts                    # all shared types — zero `any`
├── background/
│   └── service-worker.ts           # API proxy, retry logic, suggestion parser
├── content/
│   ├── injector.ts                 # orchestrator: suggestion flow, SPA nav, diagnostics
│   ├── dom-observer.ts             # MutationObserver, chat/PPV scraper, online status
│   ├── ui-overlay.ts               # Shadow DOM panel, event delegation, mode/creator UI
│   ├── chat-input.ts               # pure DOM: findChatInput, insertIntoChat, findAnchorElement
│   ├── creator-state.ts            # cached creator state, persona, style analysis, bio fetch
│   ├── overlay-config.ts           # TypeConfig, TYPE_CONFIG, MODE_TIER_CONFIG, SVG icons
│   ├── overlay-styles.ts           # STYLES constant (Shadow DOM CSS)
│   ├── profile-scraper.ts          # OF profile page and nav scraping
│   └── diag-bridge.js              # thin main-world shim for DevTools diagnostics
├── utils/
│   ├── constants.ts                # single source of truth for all magic values
│   ├── prompt-builder.ts           # system/user prompt assembly
│   ├── voice-guides.ts             # per-type voice descriptions + few-shot examples
│   ├── variation-hints.ts          # regen variation hints, anti-repeat tracking
│   └── storage.ts                  # chrome.storage.local/sync wrappers, pruning
├── popup/
│   ├── popup.html
│   └── popup.ts                    # settings UI: API key, creator management
└── mock/
    └── mock-chat.html              # self-contained test harness, no OF account needed
```

### Key design decisions

**Shadow DOM isolation** — the panel lives in a shadow root, completely insulated from OF's stylesheet churn. OF redeploys with renamed CSS classes regularly; the panel is unaffected.

**Content script stays thin** — all Anthropic calls route through the background service worker. Content scripts only do DOM work. This keeps the API key out of a context accessible to page JavaScript and satisfies MV3's CSP constraints.

**No CSS class selectors for message detection** — OF minifies and rotates class names on every deploy. The extension uses `at-attr="chat_message"` (a stable custom attribute), `.g-avatar` presence for fan/creator discrimination, and a title-tag regex for fan name extraction. These patterns are validated against the real OF DOM.

**React input insertion** — OF uses React's synthetic event system. To make a value change register, the extension bypasses React's wrapped setter by calling the native `Object.getOwnPropertyDescriptor` setter directly, then dispatches a bubbling `input` event to trigger React's state sync.

**Event delegation** — the suggestion panel uses a single click listener on the `.ofc-suggestions` container rather than per-card listeners. This avoids O(n) listener attachment and cleanup on every suggestion render.

---

## Stack

| Concern | Choice |
|---------|--------|
| Extension platform | Chrome MV3 |
| Language | TypeScript (strict, noEmit via tsc) |
| Bundler | esbuild (`build.js`) |
| Package manager | **bun** |
| Primary model | `claude-haiku-4-5-20251001` — fast, cheap |
| Fallback model | `claude-sonnet-4-6` — for conversations > 30 messages |
| Storage | `chrome.storage.local` (fan/creator profiles) + `chrome.storage.sync` (settings) |

---

## Setup

**Requires [bun](https://bun.sh)**:

```bash
curl -fsSL https://bun.sh/install | bash
```

```bash
bun install          # install esbuild and type dependencies
bun run build        # compile all bundles to dist/ and popup/popup.js
bun run lint         # tsc --noEmit — type check only, no emit
bun run build:watch  # incremental rebuild on change
```

---

## Load in Chrome

1. `bun run build`
2. Navigate to `chrome://extensions`
3. Enable **Developer mode**
4. **Load unpacked** → select this project root
5. Open OnlyFans, navigate to any chat — the panel injects below the chat input

Set your Anthropic API key via the extension popup before first use.

---

## Testing without an OF account

Open `mock/mock-chat.html` in Chrome (extension does not need to be loaded):

1. Enter your Anthropic API key in the config panel (stored in `localStorage`)
2. Select a creator persona type
3. Click **▶ Send Fan Message** — a simulated fan message appears in the mock thread
4. The suggestion panel renders with 3 AI-generated cards
5. Click a card or press Alt+1/2/3 to insert into the mock chat input
6. Click **↻ Regenerate** (or Alt+R) for a new set with a different style variation
7. Switch the mode toggle (Warm / Sell / Re-engage) and regenerate to see the output shift

The mock shims the entire `chrome.*` namespace in-page and calls the Anthropic API directly (using `anthropic-dangerous-direct-browser-access`).

---

## DevTools diagnostics

From the browser DevTools console on an OF tab:

```javascript
window.ofcDiagnose()        // full panel: routing, DOM selectors, input type, fan name
window.ofcDiagnoseProfile() // profile scraper: which selectors resolved, what was found
```

These functions are injected into the page's main world via `diag-bridge.js` (declared in `web_accessible_resources`). The actual logic runs in the isolated content script world, which has full `chrome.*` API access.

---

## API costs

Haiku is roughly **$0.001–0.002 per suggestion request** at typical conversation lengths. Style analysis runs once every 7 days per creator. $5 of API credits covers thousands of test interactions.

The extension never makes API calls unless a fan message arrives. Regenerate is the only user-triggered cost.

---

## Commit conventions

See [`COMMITS.md`](./COMMITS.md). Format: `type: short description` — no period, no AI references, ≤ 50 chars.

---

## Internal documentation

- [`docs/DECISIONS.md`](./docs/DECISIONS.md) — rationale for every non-obvious architectural choice: DOM strategy, Shadow DOM, content script format, prompt design, mock harness design
- [`tasks/todo.md`](./tasks/todo.md) — implementation progress and backlog
- [`SUGGESTIONS.md`](./SUGGESTIONS.md) — deferred ideas and future improvements
