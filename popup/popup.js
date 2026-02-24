"use strict";
(() => {
  // utils/constants.ts
  var MODEL_HAIKU = "claude-haiku-4-5-20251001";
  var ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
  var ANTHROPIC_API_VERSION = "2023-06-01";
  var STYLE_REFRESH_MS = 7 * 24 * 60 * 60 * 1e3;
  var LEGACY_PLACEHOLDER_RE = /^(Creator \d+|New Creator)$/;

  // popup/popup.ts
  var creatorListEl = document.getElementById("creatorList");
  var addCreatorBtn = document.getElementById("addCreator");
  var creatorNameInput = document.getElementById("creatorName");
  var creatorTypeSelect = document.getElementById("creatorType");
  var apiKeyInput = document.getElementById("apiKey");
  var keyPill = document.getElementById("keyStatus");
  var keyDot = document.getElementById("keyDot");
  var keyStatusText = document.getElementById("keyStatusText");
  var saveBtn = document.getElementById("save");
  var testBtn = document.getElementById("test");
  var statusEl = document.getElementById("status");
  var creators = [];
  var activeCreatorId = "";
  chrome.storage.sync.get(
    ["ANTHROPIC_API_KEY" /* ApiKey */, "CREATORS" /* Creators */, "ACTIVE_CREATOR_ID" /* ActiveCreatorId */],
    (data) => {
      if (!apiKeyInput || !creatorNameInput || !creatorTypeSelect) return;
      const storedKey = data["ANTHROPIC_API_KEY" /* ApiKey */];
      if (storedKey) {
        const last4 = storedKey.slice(-4);
        apiKeyInput.placeholder = `\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${last4}`;
        setKeyStatus(true, `Key saved  \xB7\xB7\xB7${last4}`);
      }
      const raw = data["CREATORS" /* Creators */] ?? [];
      creators = raw.filter((c) => !LEGACY_PLACEHOLDER_RE.test(c.name));
      if (creators.length !== raw.length) saveCreatorState();
      const storedActiveId = data["ACTIVE_CREATOR_ID" /* ActiveCreatorId */];
      activeCreatorId = creators.find((c) => c.id === storedActiveId)?.id ?? creators[0]?.id ?? "";
      renderCreatorList();
      syncEditFields();
    }
  );
  function renderCreatorList() {
    if (!creatorListEl) return;
    creatorListEl.innerHTML = "";
    if (creators.length === 0) {
      creatorListEl.innerHTML = '<div class="creator-empty">Open OnlyFans to auto-detect creators</div>';
      return;
    }
    creators.forEach((c) => {
      const row = document.createElement("div");
      row.className = `creator-row${c.id === activeCreatorId ? " active" : ""}`;
      row.dataset["id"] = c.id;
      row.innerHTML = `
      <div class="creator-dot${c.id === activeCreatorId ? " active" : ""}"></div>
      <span class="creator-name">${escHtml(c.name)}</span>
      <span class="creator-type-badge">${typeLabel(c.type)}</span>
      <button class="creator-delete" data-delete-id="${escHtml(c.id)}" ${creators.length <= 1 ? "disabled" : ""} title="Delete creator">\u2715</button>
    `;
      row.addEventListener("click", (e) => {
        if (e.target.closest(".creator-delete")) return;
        setActive(c.id);
      });
      const delBtn = row.querySelector(".creator-delete");
      delBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (creators.length <= 1) return;
        if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
        creators = creators.filter((x) => x.id !== c.id);
        if (activeCreatorId === c.id) {
          activeCreatorId = creators[0]?.id ?? "";
        }
        saveCreatorState();
        renderCreatorList();
        syncEditFields();
      });
      creatorListEl.appendChild(row);
    });
  }
  function syncEditFields() {
    const editSection = document.getElementById("editSection");
    if (!editSection || !creatorNameInput || !creatorTypeSelect) return;
    const active = creators.find((c) => c.id === activeCreatorId);
    if (!active) {
      editSection.style.display = "none";
      return;
    }
    editSection.style.display = "";
    creatorNameInput.value = active.name;
    creatorTypeSelect.value = active.type;
  }
  function setActive(id) {
    activeCreatorId = id;
    chrome.storage.sync.set({ ["ACTIVE_CREATOR_ID" /* ActiveCreatorId */]: id });
    renderCreatorList();
    syncEditFields();
  }
  addCreatorBtn?.addEventListener("click", () => {
    if (!creatorNameInput) return;
    const newCreator = {
      id: `c_${Date.now()}`,
      name: "New Creator",
      type: "woman",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    creators.push(newCreator);
    activeCreatorId = newCreator.id;
    saveCreatorState();
    renderCreatorList();
    syncEditFields();
    creatorNameInput.focus();
    creatorNameInput.select();
  });
  saveBtn?.addEventListener("click", () => {
    if (!apiKeyInput || !creatorNameInput || !creatorTypeSelect) return;
    const key = apiKeyInput.value.trim();
    if (key && !key.startsWith("sk-ant-")) {
      showStatus("Key must start with sk-ant-", "error");
      return;
    }
    const active = creators.find((c) => c.id === activeCreatorId);
    if (active) {
      const newName = creatorNameInput.value.trim();
      if (!newName) {
        showStatus("Creator name cannot be empty", "error");
        return;
      }
      const idx = creators.findIndex((c) => c.id === activeCreatorId);
      if (idx >= 0) {
        creators[idx] = { ...creators[idx], name: newName, type: creatorTypeSelect.value };
      }
    }
    const toSave = {
      ["CREATORS" /* Creators */]: creators,
      ["ACTIVE_CREATOR_ID" /* ActiveCreatorId */]: activeCreatorId
    };
    if (key) toSave["ANTHROPIC_API_KEY" /* ApiKey */] = key;
    chrome.storage.sync.set(toSave, () => {
      if (!apiKeyInput) return;
      if (key) {
        const last4 = key.slice(-4);
        apiKeyInput.value = "";
        apiKeyInput.placeholder = `\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${last4}`;
        setKeyStatus(true, `Key saved  \xB7\xB7\xB7${last4}`);
      }
      if (active) renderCreatorList();
      showStatus("Saved", "ok");
    });
  });
  testBtn?.addEventListener("click", async () => {
    if (!testBtn || !apiKeyInput) return;
    const typedKey = apiKeyInput.value.trim();
    let apiKey = typedKey;
    if (!apiKey) {
      const stored = await chrome.storage.sync.get("ANTHROPIC_API_KEY" /* ApiKey */);
      apiKey = stored["ANTHROPIC_API_KEY" /* ApiKey */] || "";
    }
    if (!apiKey) {
      showStatus("Enter or save an API key first", "error");
      return;
    }
    testBtn.disabled = true;
    testBtn.textContent = "Testing\u2026";
    showStatus("", "info");
    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_API_VERSION,
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: MODEL_HAIKU,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }]
        })
      });
      if (response.ok) {
        showStatus("Connected \u2713", "ok");
      } else {
        const body = await response.json().catch(() => ({}));
        const msg = body?.error?.message ?? `Error ${response.status}`;
        showStatus(msg, "error");
      }
    } catch {
      showStatus("Network error \u2014 check your connection", "error");
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = "Test API";
    }
  });
  function saveCreatorState() {
    chrome.storage.sync.set({
      ["CREATORS" /* Creators */]: creators,
      ["ACTIVE_CREATOR_ID" /* ActiveCreatorId */]: activeCreatorId
    });
  }
  function setKeyStatus(ok, text) {
    if (!keyPill || !keyDot || !keyStatusText) return;
    keyPill.className = `key-pill ${ok ? "ok" : "missing"}`;
    keyDot.className = `key-dot ${ok ? "ok" : "missing"}`;
    keyStatusText.textContent = text;
  }
  function showStatus(text, type) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = type || "";
  }
  function escHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function typeLabel(type) {
    const map = {
      woman: "Woman",
      egirl: "E-girl",
      mature_woman: "Mature",
      man: "Man",
      picture_only: "Photos",
      video_creator: "Video",
      couple: "Couple"
    };
    return map[type] ?? type;
  }
})();
//# sourceMappingURL=popup.js.map
