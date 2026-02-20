# CLAUDE.md — OF Chatter Assistant Chrome Extension

## For new sessions: read this first

- **`docs/DECISIONS.md`** — full rationale for every architectural decision, DOM strategy,
  prompt design choices, mock harness design, and sources used. Read before making changes.
- **`tasks/todo.md`** — implementation progress and backlog.
- **`COMMITS.md`** — commit message conventions.

## Commits

Before creating any git commit, you MUST read `COMMITS.md` first and follow its conventions exactly.

---

## Project Overview

This is a Chrome Extension (Manifest V3) that injects an AI-powered chat assistant into OnlyFans' web interface. It helps agency operators ("chatters") manage fan conversations more efficiently by suggesting contextual replies, tracking fan profiles, and providing upsell nudges.

**Core value prop**: Let one chatter manage 5–10 creator accounts simultaneously with AI-assisted messaging.

---

## Architecture

```
of-chatter-extension/
├── manifest.json              # MV3 manifest
├── background/
│   └── service-worker.js      # Handles API calls, auth, storage sync
├── content/
│   ├── injector.js            # Entry point injected into OF pages
│   ├── dom-observer.js        # Watches for chat updates via MutationObserver
│   ├── chat-extractor.js      # Scrapes conversation from OF React DOM
│   └── ui-overlay.js          # Renders suggestion panel into the page
├── popup/
│   ├── popup.html
│   └── popup.js               # Settings, account switcher
├── api/
│   └── claude-client.js       # Anthropic API calls (via background worker)
├── utils/
│   ├── fan-profile.js         # Fan data model and storage
│   └── storage.js             # chrome.storage.local wrappers
└── mock/
    ├── mock-chat.html         # Local test harness (no OF account needed)
    └── mock-data.js           # Sample conversations for testing
```

---

## Key Technical Constraints

- **Manifest V3**: Use `chrome.scripting.executeScript` not `background.js` persistent pages. All API calls must go through the service worker to keep the API key out of content scripts.
- **OF is React-based**: Don't rely on stable CSS class names — they change. Use `data-` attributes, ARIA roles, and structural DOM patterns instead. Prefer intercepting XHR/fetch responses for message data over DOM scraping when possible.
- **No OF API**: Everything is reverse-engineered from the web UI. Treat OF's frontend as a black box.
- **API key security**: The Anthropic API key must NEVER be in content scripts. Route all LLM calls through the background service worker using `chrome.runtime.sendMessage`.

---

## AI Behavior

### Suggestion Generation

The AI generates 3 reply suggestions per incoming message. Suggestions are tiered:

1. **Engage** — Keep the conversation warm, build rapport
2. **Soft upsell** — Nudge toward PPV or custom content naturally
3. **Direct upsell** — Clear CTA for a purchase

### System Prompt Template

```
You are an expert OnlyFans chatter managing conversations on behalf of a creator.
Your goal is to maximize fan engagement and revenue while maintaining an authentic,
warm tone that matches the creator's persona.

Creator persona: {creator_name} — {creator_persona_description}
Fan profile: Name: {fan_name} | Subscribed: {sub_duration} | Total spent: ${lifetime_value} | Last interaction: {last_seen}
Conversation history (last 10 messages): {conversation_history}

Generate exactly 3 reply options as JSON:
[
  { "type": "engage", "text": "..." },
  { "type": "soft_upsell", "text": "..." },
  { "type": "direct_upsell", "text": "..." }
]

Respond ONLY with the JSON array. No preamble.
```

### Model

Use `claude-haiku-4-5-20251001` for suggestions (fast, cheap). Fall back to `claude-sonnet-4-6` for complex personas or long conversation histories.

---

## Fan Profile Data Model

```js
{
  fanId: string,           // scraped from OF DOM or URL
  displayName: string,
  firstSeen: ISO8601,
  lastSeen: ISO8601,
  lifetimeValue: number,   // USD
  messageCount: number,
  tags: string[],          // e.g. ["whale", "custom-content", "ghosted"]
  notes: string,           // freeform operator notes
  ppvHistory: [{ contentId, price, date }],
}
```

Stored in `chrome.storage.local` keyed by `fan:{fanId}`.

---

## Testing

Always test against `mock/mock-chat.html` before testing on a live OF account. The mock harness simulates:

- Incoming messages triggering the MutationObserver
- The suggestion panel rendering
- API call/response flow

Run: open `mock/mock-chat.html` in Chrome with the extension loaded in developer mode.

---

## Commands

**Tooling: use `bun` for all package management and script execution** (not `npm`/`node`).
Install bun if needed: `curl -fsSL https://bun.sh/install | bash`

```bash
# Install dependencies
bun install

# Load extension in Chrome
# Go to chrome://extensions → Enable Developer Mode → Load Unpacked → select project root

# Run mock test harness
open mock/mock-chat.html

# Lint (tsc --noEmit)
bun run lint

# Build (esbuild via build.js)
bun run build

# Watch mode
bun run build:watch

# Run build.js directly (bun executes TS/JS natively)
bun build.js
```

---

## Environment Variables

Store sensitive config in `chrome.storage.sync` (user-set via popup), not hardcoded:

- `ANTHROPIC_API_KEY` — set by user in popup
- `DEFAULT_MODEL` — defaults to `claude-haiku-4-5-20251001`
- `MAX_SUGGESTIONS` — defaults to 3

---

## Code Style

- Vanilla JS or TypeScript (prefer TS for anything non-trivial)
- No frontend frameworks in content scripts (keep bundle size minimal)
- Async/await everywhere, no raw Promise chains
- Comment DOM selectors explaining WHY they work (they're fragile)
- Keep content scripts thin — logic lives in utils and background worker

---

## Known Gotchas

- OF lazy-loads chat history; scroll detection may be needed to load older messages
- OF's React may re-render and wipe injected DOM nodes — use MutationObserver to re-inject
- `chrome.storage.local` has a 10MB quota — prune old fan profiles periodically
- Service workers in MV3 are ephemeral; don't rely on in-memory state in the background script

---

## Workflow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents liberally to keep the main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until the mistake rate drops
- Review `tasks/lessons.md` at session start for the relevant project

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing tests without being told how

---

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

---

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

---

## Design Standards

When making any UI or UX decision, reason like a **senior product designer at a B2B SaaS company**. This extension is a professional tool used under time pressure by agency operators. Every design choice must serve that user.

### Design Philosophy

- **Tool, not widget**: The panel must feel like a precision instrument, not a marketing pop-up. Think VS Code's suggestion dropdown, Linear's command palette — purposeful, quiet, fast.
- **Dark-first**: OF's UI is dark. The extension panel must match the environment — a jarring white box is amateur. Default to dark surfaces (`#0e0e14` range), muted borders, low-contrast chrome.
- **Information hierarchy**: Labels, badges, and secondary text should be visually subordinate to the content the chatter actually reads (the suggestion text). If your eyes go to the wrong thing first, the hierarchy is wrong.
- **Density with breathing room**: This is a compact tool in a tight space. Be dense enough to show all 3 suggestions without scrolling, but never crowded. 9-11px padding on tight elements, 13px body text.
- **Earn every pixel**: No decorative elements that don't serve a function. No gradients for vibes, no emojis in UI chrome, no borders that don't create meaningful separation.

### Interaction Design

- **Primary action must be obvious**: The chatter's goal is to click a suggestion and send it. That action must be one click, instantly discoverable, never ambiguous.
- **Hover reveals, not click**: Progressive disclosure via hover is fine for secondary actions (the "Use →" button, regenerate). Don't hide the primary action.
- **Feedback must be immediate**: Clicks that trigger async work must show a loading state within 1 frame. "Inserted" feedback must be instant and clear (color change, text change), not a toast.
- **Never block reading**: Loading spinners and error states must not shift the layout. Reserve the panel space, swap the content.
- **Collapse is an escape valve**: Chatters should be able to get the panel out of their way with one click when it's not needed. Never trap them.

### Visual System

- **Colors**: Use a consistent 5-color role system per suggestion type. Each type owns one accent color (emerald / amber / violet). These colors appear ONLY as left border accents and badge tints — never as full card backgrounds.
- **Typography**: System font stack only (no web fonts). 13px body, 9-10px labels, 700 weight for uppercase badges, 400 for body text. Line-height 1.5 on body text.
- **Motion**: Animations must be sub-200ms and respect reduced-motion preferences. Use fade + translate(4px) entrance. No bounces, no elastic easing.
- **Border radius**: 12px on the panel, 6-8px on buttons and badges, 100px (pill) on type badges. Consistent hierarchy.
- **Shadows**: One shadow per elevation level. Panel uses `0 8px 32px rgba(0,0,0,0.5)`. Buttons use no shadow. No neumorphism.

### Review Checklist (before shipping any UI change)

1. Does it work in the mock harness without looking broken?
2. Does it pass the "3-second scan test" — can a chatter read all 3 suggestions in 3 seconds?
3. Is the primary action (click to insert) discoverable without explanation?
4. Does it look intentional at 100%, 125%, and 150% browser zoom?
5. Would you be comfortable shipping this to a paying customer today?
