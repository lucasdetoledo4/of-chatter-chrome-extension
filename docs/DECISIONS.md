# Design Decisions & Annotations

This file documents the *why* behind every non-obvious decision in this codebase.
It is kept up to date as features are added. Future sessions should read this before
making architectural changes.

---

## Extension architecture

### Manifest V3 + service worker
**Decision:** Use MV3 with a background service worker (`background/service-worker.ts`).
**Why:** MV3 is the current Chrome standard. Persistent background pages are gone.
The service worker is ephemeral — it spins up on demand and is killed when idle.
**Consequence:** Never store state in memory inside the service worker. Always read
from `chrome.storage` on each request. In-memory state will be lost between requests.

### ESM for service worker, IIFE for content script
**Decision:** `build.js` outputs ESM for the service worker and IIFE for content scripts.
**Why:** Chrome MV3 service workers support ES modules (`"type": "module"` in manifest).
Content scripts do NOT support ES modules — they execute in the page context where
there is no module loader. IIFE wraps everything in a single self-contained function.
If you ever change the content script format to ESM, it will silently break in Chrome.

### API key never in content scripts
**Decision:** All Anthropic API calls go through the background service worker via
`chrome.runtime.sendMessage`. The API key lives only in `chrome.storage.sync`.
**Why:** Content scripts execute in the page context and are inspectable. A key in
a content script is effectively public. The service worker is isolated.

---

## DOM strategy for OnlyFans

### Prefer `data-testid` and ARIA over CSS class names
**Decision:** Selectors like `[data-testid="chat-messages"]` and `[role="main"]`
are used instead of class names.
**Why:** OF is a React app built with webpack. Class names are hashed on every deploy
(e.g. `.b_abc123`). `data-testid` and ARIA roles are semantic and stable.
**Known selectors and why they work:**
- `[data-testid="chat-messages"]` — OF uses testid on the message list container
- `[data-testid="chat-input"]` — stable attribute on the chat textarea
- `[role="textbox"]` — semantic fallback if testid changes
- `[class*="message"]` — substring match survives hash changes; "message" is always
  present in OF's message bubble class names even across deploys

### MutationObserver on chat container
**Decision:** `dom-observer.ts` watches `[data-testid="chat-messages"]` for new child nodes.
**Why:** OF does not expose a public API. XHR interception would be more reliable
(real fan IDs, timestamps, spend data) but is significantly more complex. DOM observation
is the pragmatic first approach. See backlog: "Intercept XHR instead of scraping".

### Host-guard MutationObserver
**Decision:** `injector.ts` runs a second MutationObserver on `document.body` to
detect when React removes the injected panel and re-injects it.
**Why:** React's reconciler can unmount and remount DOM nodes, wiping injected elements.
The host-guard catches this and triggers re-injection automatically.

---

## UI overlay

### Shadow DOM
**Decision:** The suggestion panel uses `attachShadow({ mode: 'open' })`.
**Why:** Isolates the extension's CSS from OF's stylesheet. OF injects global styles
aggressively. Without Shadow DOM, OF's CSS overrides the panel's layout unpredictably.
`mode: 'open'` (not 'closed') allows the host-guard observer to check `document.contains`.

### `escapeHtml()` on all AI output
**Decision:** All text from the Anthropic API is passed through `escapeHtml()` before
being set as innerHTML.
**Why:** XSS prevention. The AI response is untrusted external content. Even though
we control the prompt, the model could theoretically output HTML tags. This is a
hard rule — never use `innerHTML` with raw AI text.

### Click-to-insert vs click-to-copy
**Decision:** Card clicks insert text into the OF chat input directly, not clipboard.
Fallback to clipboard if no input element is found.
**Why:** Workflow speed. Copy-paste requires an extra step. Direct insertion is one click.
**Implementation detail:** React wraps the native value setter on `<input>`/`<textarea>`.
To trigger React's synthetic event system, we use `Object.getOwnPropertyDescriptor`
to get the original setter, call it, then dispatch a bubbling `input` event.
For contenteditable (the likely OF chat input in production), `document.execCommand('insertText')`
is deprecated but remains the most reliable cross-browser way to trigger React's handler
without reaching into React internals (fiber).

---

## AI / prompt engineering

### Model selection
**Decision:** `claude-haiku-4-5-20251001` by default. Fall back to `claude-sonnet-4-6`
for conversations longer than 30 messages.
**Why:** Haiku is fast (~1s) and cheap (~$0.001 per request). For short conversations
it produces excellent results. Long conversations need more reasoning capacity.
Cost at testing scale: ~$0.001-0.002 per "Simulate Fan Message" click.

### Temperature 1.0
**Decision:** Anthropic API calls use `temperature: 1.0` (the maximum).
**Why:** We want maximum diversity between suggestions and especially between regenerate
calls. The structured JSON output contract (we ask for a JSON array) is reliable enough
at temp 1.0 that the fallback parser handles any rare malformed output.

### Full conversation history (no truncation)
**Decision:** The entire scraped conversation is sent to the API, not a truncated window.
**Why:** The user explicitly requested full context. Haiku's context window is large
enough for any realistic OF chat. Costs scale linearly with length but remain negligible
at Haiku pricing. If this becomes a cost issue, add a configurable limit back via
`chrome.storage.sync` (`MAX_HISTORY_MESSAGES`).

### Creator persona types + per-type voice guides
**Decision:** 7 creator archetypes (`egirl`, `woman`, `mature_woman`, `man`,
`picture_only`, `video_creator`, `couple`), each with a detailed voice guide in the
system prompt.
**Why:** A generic "warm, authentic" persona produces generic output. Specific voice
descriptions produce distinct, recognisable character voices. The model anchors to
concrete style cues much better than abstract adjectives.

### Few-shot examples per persona type
**Decision:** Each persona's system prompt includes 2-3 example fan→reply exchanges
showing all 3 suggestion tiers.
**Sources:**
- [phoenix-creators.com — Message Script Guide](https://www.phoenix-creators.com/onlyfans-blog/the-ultimate-guide-to-onlyfans-message-scripts)
- [phoenix-creators.com — PPV Message Ideas](https://www.phoenix-creators.com/onlyfans-blog/onlyfans-ppv-message-ideas)
- [xcreatormgmt.com — Mass Message Ideas](https://www.xcreatormgmt.com/blog/onlyfans-mass-message-ideas-with-examples)
- [tdmchattingservice.com — PPV Templates](https://tdmchattingservice.com/onlyfans-ppv-message-ideas-high-examples/)
- [supercreator.app — Chatter Guide](https://www.supercreator.app/guides/onlyfans-chatter)
- [toolify.ai — 6-Figure Chat Script](https://www.toolify.ai/gpts/learn-the-chat-script-that-generates-6figure-income-on-onlyfans-67052)
**Why:** Few-shot examples give the model concrete language targets, not just abstract
descriptions. Even 1-2 examples per type measurably reduces generic output and makes
responses feel genre-accurate.
**Rule:** Examples must say "do NOT copy verbatim" to prevent the model from
literally repeating them.

### Variation hints on regenerate
**Decision:** When the regenerate button is clicked, a randomly selected variation
hint is appended to the user prompt (e.g. "Be more mysterious — give less, make them
work for it.").
**Why:** Without a variation seed, identical prompts produce near-identical outputs
even at high temperature. The hint breaks the pattern by explicitly steering the
model toward a different stylistic approach each time.

### Suggestion tiers: engage / soft_upsell / direct_upsell
**Decision:** Always generate exactly 3 typed suggestions covering the full conversion
spectrum.
**Why:** Chatters need to read the fan's mood in the moment and pick the right pressure
level. Having all 3 ready lets them make that judgment call instantly without waiting
for a new generation.

---

## Mock test harness

### `window.__OFC_MOCK__` flag
**Decision:** The mock sets `window.__OFC_MOCK__ = true` (and `__OFC_MOCK_FAN_ID__`,
`__OFC_MOCK_PERSONA__`, `__OFC_MOCK_ANCHOR_ID__`) before loading the content script.
**Why:** `history.replaceState({}, '', '/my/chats/1234567')` can throw a `SecurityError`
on `file://` origins in some Chrome configurations, killing the rest of the inline script
(including event listeners). The flag lets the injector bypass URL-based routing entirely
in mock mode, making the harness robust regardless of replaceState behaviour.
**Rule:** All mock flags must be set BEFORE `<script src="../dist/content/injector.js">`.
The injector reads them at module evaluation time.

### Mock uses inline API calls, not the service worker
**Decision:** `chrome.runtime.sendMessage` in the mock is intercepted and calls the
Anthropic API directly from the page (not via the service worker).
**Why:** The mock is a standalone HTML file. There is no extension context, so
`chrome.runtime` has no real backing. The mock shims the entire `chrome` namespace.
**Consequence:** The mock's inline prompt mirrors (but does not import) `prompt-builder.ts`.
When the prompt builder changes, update the mock's inline prompt too. This duplication
is a known trade-off of the standalone harness design.

### `anthropic-dangerous-direct-browser-access: true` header
**Decision:** The mock adds this header to all Anthropic API fetch calls.
**Why:** The Anthropic API blocks browser-side calls by default (CORS + origin policy).
This header is Anthropic's official mechanism to allow direct browser access. It is
only needed in the mock — the real extension routes calls through the service worker
which has `host_permissions` for `https://api.anthropic.com/*` and is not subject
to browser CORS restrictions.

### `data-ofc-container` attribute
**Decision:** The mock's right-pane AI suggestions container has `data-ofc-container`.
The `UIOverlay.inject()` method checks for this attribute to decide whether to
`appendChild` (container slot) or `insertAdjacentElement('afterend', ...)` (default).
**Why:** In the mock, the suggestion panel lives in the right pane (better UX for
testing). In production OF, it injects after the chat input. The attribute avoids
adding mock-specific logic to the overlay itself.

---

## Storage

### `fan:` key prefix in `chrome.storage.local`
**Decision:** Fan profiles are stored as `fan:{fanId}` keys.
**Why:** Allows `getAllFanProfiles()` to filter by prefix without a separate index.
`chrome.storage.local` has a 10MB quota — the prefix scheme makes pruning straightforward.

### Pruning on `onInstalled`
**Decision:** `pruneOldProfiles()` runs when the extension is installed or updated.
Profiles not seen in 90 days are deleted.
**Why:** Storage quota protection. 10MB fills up slowly but will fill eventually
for accounts with many fans. `onInstalled` is the most reliable time to run maintenance
since the service worker is guaranteed to be active.

---

## Backlog (known gaps, not yet implemented)

- **XHR interception** — intercept OF's own fetch responses to get real fan IDs,
  message timestamps, and spend data instead of scraping the DOM
- **Popup UI** — API key config, model selector, creator persona editor
- **Per-creator persona switching** — detect which OF account is active, load its persona
- **Prompt caching** — Anthropic supports prompt caching; the system prompt is identical
  per creator session, caching would cut input token costs ~90%
- **Usage tracking** — record which suggestion type (engage/soft/direct) gets clicked
  to build per-fan conversion signal
- **Auto-tagging** — tag fans as `whale`, `ghosted`, `ppv-buyer` from behaviour
- **Keyboard shortcuts** — press 1/2/3 to insert the corresponding suggestion
- **Real OF testing** — all DOM selectors are educated guesses until validated live
