# SKILLS.md — OF Chatter Assistant Chrome Extension

A reference of reusable patterns and skills for building this project. When implementing a feature, check here first before writing from scratch.

---

## Skill: DOM Observation (MutationObserver)

Use this pattern to detect new incoming messages without polling.

```js
// content/dom-observer.js
export function observeChat(onNewMessage) {
  const chatContainer = findChatContainer();
  if (!chatContainer) return;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const msg = extractMessageFromNode(node);
        if (msg && msg.fromFan) {
          onNewMessage(msg);
        }
      }
    }
  });

  observer.observe(chatContainer, { childList: true, subtree: true });
  return () => observer.disconnect(); // cleanup function
}
```

**Key notes:**

- Always return a cleanup/disconnect function
- Check `nodeType === Node.ELEMENT_NODE` before accessing DOM properties
- Re-run `findChatContainer()` if OF navigates to a new chat (SPA navigation)

---

## Skill: Safe Background API Calls

Content scripts cannot safely hold API keys. Route all LLM calls through the background service worker.

```js
// In content script — send request
const suggestions = await chrome.runtime.sendMessage({
  type: "GET_SUGGESTIONS",
  payload: { conversation, fanProfile, creatorPersona },
});

// In background/service-worker.js — handle request
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_SUGGESTIONS") {
    getSuggestions(message.payload).then(sendResponse);
    return true; // keep message channel open for async response
  }
});
```

**Key notes:**

- Always `return true` in the listener for async responses
- Wrap `sendMessage` calls in try/catch — service worker may be inactive
- Never put the API key in content scripts or popup JS

---

## Skill: Anthropic API Call

Standard pattern for calling the Anthropic API from the background worker.

```js
// background/service-worker.js
async function callClaude(
  systemPrompt,
  userMessage,
  model = "claude-haiku-4-5-20251001",
) {
  const { ANTHROPIC_API_KEY } =
    await chrome.storage.sync.get("ANTHROPIC_API_KEY");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  const data = await response.json();
  return data.content[0].text;
}
```

---

## Skill: Parsing Suggestions from Claude Response

Claude returns a JSON array. Parse it safely.

````js
function parseSuggestions(rawText) {
  try {
    // Strip any accidental markdown fences
    const clean = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) throw new Error("Expected array");
    return parsed;
  } catch (e) {
    console.error("Failed to parse suggestions:", e, rawText);
    return [{ type: "engage", text: rawText }]; // graceful fallback
  }
}
````

---

## Skill: Fan Profile Storage

CRUD helpers for fan profiles using `chrome.storage.local`.

```js
// utils/storage.js
const FAN_PREFIX = "fan:";

export async function getFanProfile(fanId) {
  const key = FAN_PREFIX + fanId;
  const result = await chrome.storage.local.get(key);
  return result[key] || null;
}

export async function upsertFanProfile(fanId, updates) {
  const existing = (await getFanProfile(fanId)) || {
    fanId,
    firstSeen: new Date().toISOString(),
  };
  const updated = {
    ...existing,
    ...updates,
    lastSeen: new Date().toISOString(),
  };
  await chrome.storage.local.set({ [FAN_PREFIX + fanId]: updated });
  return updated;
}

export async function getAllFanProfiles() {
  const all = await chrome.storage.local.get(null);
  return Object.entries(all)
    .filter(([k]) => k.startsWith(FAN_PREFIX))
    .map(([, v]) => v);
}
```

---

## Skill: Injecting UI Without Conflicts

Inject suggestion panels into OF's UI without breaking their React rendering.

```js
// content/ui-overlay.js
export function injectSuggestionPanel(anchorElement) {
  // Use a shadow DOM to avoid CSS conflicts with OF's styles
  const host = document.createElement("div");
  host.id = "ofc-suggestion-host";
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      /* scoped styles here — won't leak into OF */
      .panel { background: #1a1a2e; border-radius: 8px; padding: 12px; ... }
    </style>
    <div class="panel" id="ofc-panel">
      <div id="ofc-suggestions"></div>
    </div>
  `;

  anchorElement.insertAdjacentElement("afterend", host);
  return shadow.getElementById("ofc-suggestions");
}
```

**Key notes:**

- Shadow DOM isolates your styles from OF's — prevents visual breakage
- Always check if the panel is already injected before injecting again
- Re-inject if OF's React removes your host node (MutationObserver on `document.body`)

---

## Skill: SPA Navigation Detection

OF is a SPA — detect route changes to re-initialize the extension on chat navigation.

```js
// content/injector.js
let lastUrl = location.href;

new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    onRouteChange(location.href);
  }
}).observe(document.body, { subtree: true, childList: true });

function onRouteChange(url) {
  if (url.includes("/messages/")) {
    // User navigated to a chat — re-initialize
    initializeChatAssistant();
  }
}
```

---

## Skill: Mock Test Harness

Test AI suggestion flow locally without an OF account.

```html
<!-- mock/mock-chat.html -->
<!DOCTYPE html>
<html>
  <head>
    <title>OF Chat Mock</title>
  </head>
  <body>
    <div id="chat-container" data-testid="chat-messages">
      <!-- Messages load here -->
    </div>
    <button onclick="simulateIncomingMessage()">Simulate Fan Message</button>

    <script src="mock-data.js"></script>
    <script>
      function simulateIncomingMessage() {
        const msg = document.createElement("div");
        msg.className = "message from-fan";
        msg.dataset.senderId = "fan_123";
        msg.textContent =
          MOCK_MESSAGES[Math.floor(Math.random() * MOCK_MESSAGES.length)];
        document.getElementById("chat-container").appendChild(msg);
      }
    </script>
  </body>
</html>
```

---

## Skill: Building the Suggestion Prompt

Assemble context into a clean, token-efficient prompt.

```js
// utils/prompt-builder.js
export function buildSuggestionPrompt({
  conversation,
  fanProfile,
  creatorPersona,
}) {
  const recentMessages = conversation.slice(-10); // last 10 only — saves tokens

  return {
    system: `You are an expert OnlyFans chatter for ${creatorPersona.name}.
Persona: ${creatorPersona.description}
Always match the creator's voice. Never break character.
Respond ONLY with a JSON array of 3 suggestions: [{type, text}, ...]
Types: "engage", "soft_upsell", "direct_upsell"`,

    user: `Fan: ${fanProfile.displayName} | Spent: $${fanProfile.lifetimeValue} | Sub: ${fanProfile.subDuration}
${fanProfile.notes ? `Notes: ${fanProfile.notes}` : ""}

Recent conversation:
${recentMessages.map((m) => `${m.fromFan ? "Fan" : "Creator"}: ${m.text}`).join("\n")}

Latest fan message: "${recentMessages.at(-1)?.text}"

Generate 3 reply options.`,
  };
}
```

---

## Common Pitfalls

| Pitfall                              | Solution                                          |
| ------------------------------------ | ------------------------------------------------- |
| OF CSS classes change on deploy      | Use `data-` attrs and ARIA roles, not class names |
| Service worker dies mid-request      | Add keepalive ping or handle graceful restart     |
| Injected UI wiped by React re-render | MutationObserver on body to re-inject             |
| JSON parse fails on Claude response  | Always wrap in try/catch with fallback            |
| Storage quota exceeded               | Prune fan profiles older than 90 days on startup  |
| API key exposed in content script    | ALWAYS route through background service worker    |
