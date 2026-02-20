# OF Chatter Assistant — Chrome Extension

A Chrome Extension (Manifest V3) that injects an AI-powered suggestion panel into
OnlyFans. When a fan sends a message, the extension generates 3 ready-to-send reply
options — tiered from rapport-building to direct upsell — so one chatter can manage
multiple creator accounts without slowing down.

---

## How it works

1. A MutationObserver watches the OF chat container for new fan messages
2. When one arrives, the conversation history is scraped and sent (via the background
   service worker) to the Anthropic API
3. The model returns 3 typed suggestions (engage / soft upsell / direct upsell)
4. A Shadow DOM panel renders the cards — click one to insert it directly into the
   chat input

The API key never touches content scripts. All Anthropic calls go through the
background service worker, which has `host_permissions` for `api.anthropic.com`.

---

## Stack

| Thing | Choice |
|-------|--------|
| Extension | Chrome MV3 |
| Language | TypeScript (strict) |
| Bundler | esbuild via `build.js` |
| Package manager | **bun** (not npm) |
| AI | Anthropic API — `claude-haiku-4-5-20251001` (fast/cheap), fallback to `claude-sonnet-4-6` |

---

## Project structure

```
of-chatter-ext/
├── manifest.json
├── build.js                    # esbuild config — ESM for SW, IIFE for content
├── types/index.ts              # all shared types, zero any
├── background/
│   └── service-worker.ts       # API proxy, message handler, suggestion parser
├── content/
│   ├── injector.ts             # main orchestrator, SPA nav, retry logic
│   ├── dom-observer.ts         # MutationObserver, chat scraper
│   └── ui-overlay.ts           # Shadow DOM panel, cards, insert handler
├── utils/
│   ├── prompt-builder.ts       # system/user prompt construction, persona voices
│   └── storage.ts              # chrome.storage.local wrappers, pruning
├── mock/
│   ├── mock-chat.html          # self-contained test harness (no OF account needed)
│   └── mock-data.ts            # sample fan profile and conversation
├── docs/
│   └── DECISIONS.md            # architecture decisions, sources, known gotchas
└── tasks/
    └── todo.md                 # implementation progress and backlog
```

---

## Setup

**Requires [bun](https://bun.sh).** Install it if needed:
```bash
curl -fsSL https://bun.sh/install | bash
```

```bash
bun install       # install deps
bun run build     # compile to dist/
bun run lint      # tsc --noEmit (type check only)
bun run build:watch  # rebuild on file changes
```

---

## Load in Chrome

1. Run `bun run build`
2. Go to `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** → select this project root
5. Open OnlyFans → navigate to any chat → the suggestion panel appears below the input

---

## Test without an OF account

Open `mock/mock-chat.html` in Chrome (the extension does not need to be loaded):

1. Enter your Anthropic API key in the config panel (saved to localStorage)
2. Select a creator persona type from the dropdown
3. Click **▶ Send Fan Message** — a simulated fan message appears
4. The suggestion panel loads and shows 3 AI-generated cards
5. Click a card to insert it into the mock chat input
6. Click **↻ Regenerate** for a fresh set with a different style variation

The mock shims the entire `chrome` namespace in-page and calls the Anthropic API
directly (with the `anthropic-dangerous-direct-browser-access` header).

---

## Creator personas

The prompt is personalised by creator type. Switch between them in the mock dropdown
or (eventually) the extension popup:

| Type | Voice |
|------|-------|
| `egirl` | Bubbly, emoji-heavy, FOMO-driven, casual spelling |
| `woman` | Confident, warm, genuinely flirty, builds before selling |
| `mature_woman` | Experienced, unhurried, makes fans feel chosen |
| `man` | Direct, gym/lifestyle, low emoji, matter-of-fact upsells |
| `picture_only` | Visual language, set/gallery focused, teases through description |
| `video_creator` | Motion-forward, custom clip emphasis, behind-the-scenes energy |
| `couple` | "We" language, voyeuristic, frames upsells as joining |

Each type includes few-shot example exchanges sourced from real chatter guides.

---

## API key

Set it in the mock's config panel (stored in `localStorage`) or, when using the real
extension, via the popup (stored in `chrome.storage.sync` as `ANTHROPIC_API_KEY`).

Get a key at [console.anthropic.com](https://console.anthropic.com).
Haiku costs roughly **$0.001–0.002 per suggestion request** — $5 of credits covers
thousands of test runs.

---

## Commit conventions

See [`COMMITS.md`](./COMMITS.md). Short version:

```
feat: add regenerate button
fix: handle missing api key gracefully
refactor: split prompt builder into helpers
chore: bump esbuild
docs: update decisions log
```

No AI tool references in commit messages. No period at the end.

---

## Architecture decisions

See [`docs/DECISIONS.md`](./docs/DECISIONS.md) for the full rationale behind every
non-obvious choice — DOM strategy, Shadow DOM, content script format, prompt design,
mock harness design, and the full backlog.
