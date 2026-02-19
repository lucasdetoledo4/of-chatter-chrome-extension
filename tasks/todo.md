# OF Chatter Extension — Task Tracker

## Core Implementation (v0.1)

- [x] Step 1: Project scaffolding (package.json, tsconfig.json, build.js, manifest.json, bun install)
- [x] Step 2: `types/index.ts` — all shared types, zero `any`
- [x] Step 3: `utils/storage.ts` — fan profile CRUD + pruning
- [x] Step 4: `utils/prompt-builder.ts` — Anthropic-ready system/user prompts
- [x] Step 5: `background/service-worker.ts` — API proxy, message handler, suggestion parser
- [x] Step 6: `content/dom-observer.ts` — MutationObserver, chat scraper
- [x] Step 7: `content/ui-overlay.ts` — Shadow DOM panel, color-coded cards, click-to-copy
- [x] Step 8: `content/injector.ts` — orchestrator, SPA nav, retry logic, host-guard
- [x] Step 9: `mock/mock-chat.html` + `mock/mock-data.ts` — full self-contained test harness
- [x] Step 10: `tasks/todo.md` + CLAUDE.md bun tooling note

## Verification Checklist

- [ ] `bun install` — no errors
- [ ] `bun run lint` — 0 TypeScript errors
- [ ] `bun run build` — `dist/background/service-worker.js` + `dist/content/injector.js` created
- [ ] Open `mock/mock-chat.html` → console: `[OFC] Content script loaded`
- [ ] Console: `[OFC] Chat assistant initialized`
- [ ] Console: `[OFC] Chat observer started`
- [ ] Enter API key → status shows "Key saved ✓"
- [ ] Click "Simulate Fan Message" → loading spinner appears
- [ ] After ~1-2s → 3 color-coded cards render (Engage / Soft Upsell / Direct Upsell)
- [ ] Click a card → "Copied!" badge, text in clipboard

## Backlog (Post-MVP)

- [ ] Popup UI for API key, model selection, creator persona config
- [ ] Fan profile viewer in popup
- [ ] PPV history tracking from message scraping
- [ ] Multi-creator account switcher
- [ ] Keyboard shortcut to accept suggestion (insert into chat input)
- [ ] Suggestion history / undo
- [ ] Rate limiting / request debounce (avoid firing on rapid message bursts)
- [ ] Prune old profiles on a schedule (not just onInstalled)
