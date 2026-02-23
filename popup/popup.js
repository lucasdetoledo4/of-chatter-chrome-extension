// ─── DOM refs ─────────────────────────────────────────────────────────────────

const creatorListEl   = document.getElementById('creatorList');
const addCreatorBtn   = document.getElementById('addCreator');
const creatorNameInput = document.getElementById('creatorName');
const creatorTypeSelect = document.getElementById('creatorType');
const apiKeyInput     = document.getElementById('apiKey');
const keyPill         = document.getElementById('keyStatus');
const keyDot          = document.getElementById('keyDot');
const keyStatusText   = document.getElementById('keyStatusText');
const saveBtn         = document.getElementById('save');
const testBtn         = document.getElementById('test');
const statusEl        = document.getElementById('status');

// ─── State ────────────────────────────────────────────────────────────────────

/** @type {{ id: string; name: string; type: string; createdAt: string }[]} */
let creators = [];
let activeCreatorId = '';

// ─── Init ─────────────────────────────────────────────────────────────────────

// Placeholder names from old seeding logic — removed on load.
const LEGACY_PLACEHOLDER_RE = /^(Creator \d+|New Creator)$/;

chrome.storage.sync.get(['ANTHROPIC_API_KEY', 'CREATORS', 'ACTIVE_CREATOR_ID'], (data) => {
  // API key display
  if (data.ANTHROPIC_API_KEY) {
    const last4 = data.ANTHROPIC_API_KEY.slice(-4);
    apiKeyInput.placeholder = `••••••••••${last4}`;
    setKeyStatus(true, `Key saved  ···${last4}`);
  }

  // Load creators, stripping any legacy placeholder names.
  const raw = data.CREATORS || [];
  creators = raw.filter((c) => !LEGACY_PLACEHOLDER_RE.test(c.name));
  if (creators.length !== raw.length) saveCreatorState(); // persist cleanup
  activeCreatorId = creators.find((c) => c.id === data.ACTIVE_CREATOR_ID)?.id ?? creators[0]?.id ?? '';

  renderCreatorList();
  syncEditFields();
});

// ─── Render ───────────────────────────────────────────────────────────────────

function renderCreatorList() {
  creatorListEl.innerHTML = '';

  if (creators.length === 0) {
    creatorListEl.innerHTML = '<div class="creator-empty">Open OnlyFans to auto-detect creators</div>';
    return;
  }

  creators.forEach((c) => {
    const row = document.createElement('div');
    row.className = `creator-row${c.id === activeCreatorId ? ' active' : ''}`;
    row.dataset.id = c.id;
    row.innerHTML = `
      <div class="creator-dot${c.id === activeCreatorId ? ' active' : ''}"></div>
      <span class="creator-name">${escHtml(c.name)}</span>
      <span class="creator-type-badge">${typeLabel(c.type)}</span>
      <button class="creator-delete" data-delete-id="${escHtml(c.id)}" ${creators.length <= 1 ? 'disabled' : ''} title="Delete creator">✕</button>
    `;

    // Click row → set active
    row.addEventListener('click', (e) => {
      if (e.target.closest('.creator-delete')) return;
      setActive(c.id);
    });

    // Delete button
    const delBtn = row.querySelector('.creator-delete');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (creators.length <= 1) return;
      if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
      creators = creators.filter((x) => x.id !== c.id);
      if (activeCreatorId === c.id) {
        activeCreatorId = creators[0].id;
      }
      saveCreatorState();
      renderCreatorList();
      syncEditFields();
    });

    creatorListEl.appendChild(row);
  });
}

function syncEditFields() {
  const active = creators.find((c) => c.id === activeCreatorId);
  const editSection = document.getElementById('editSection');
  if (!active) {
    editSection.style.display = 'none';
    return;
  }
  editSection.style.display = '';
  creatorNameInput.value = active.name;
  creatorTypeSelect.value = active.type;
}

// ─── Creator management ───────────────────────────────────────────────────────

function setActive(id) {
  activeCreatorId = id;
  chrome.storage.sync.set({ ACTIVE_CREATOR_ID: id });
  renderCreatorList();
  syncEditFields();
}

addCreatorBtn.addEventListener('click', () => {
  const newCreator = {
    id: `c_${Date.now()}`,
    name: 'New Creator',
    type: 'woman',
    createdAt: new Date().toISOString(),
  };
  creators.push(newCreator);
  activeCreatorId = newCreator.id;
  saveCreatorState();
  renderCreatorList();
  syncEditFields();
  creatorNameInput.focus();
  creatorNameInput.select();
});

// ─── Save ─────────────────────────────────────────────────────────────────────

saveBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();

  if (key && !key.startsWith('sk-ant-')) {
    showStatus('Key must start with sk-ant-', 'error');
    return;
  }

  // Update active creator's name + type only when one is selected.
  const active = creators.find((c) => c.id === activeCreatorId);
  if (active) {
    const newName = creatorNameInput.value.trim();
    if (!newName) {
      showStatus('Creator name cannot be empty', 'error');
      return;
    }
    const idx = creators.findIndex((c) => c.id === activeCreatorId);
    if (idx >= 0) {
      creators[idx] = { ...creators[idx], name: newName, type: creatorTypeSelect.value };
    }
  }

  const toSave = { CREATORS: creators, ACTIVE_CREATOR_ID: activeCreatorId };
  if (key) toSave.ANTHROPIC_API_KEY = key;

  chrome.storage.sync.set(toSave, () => {
    if (key) {
      const last4 = key.slice(-4);
      apiKeyInput.value = '';
      apiKeyInput.placeholder = `••••••••••${last4}`;
      setKeyStatus(true, `Key saved  ···${last4}`);
    }
    if (active) renderCreatorList();
    showStatus('Saved', 'ok');
  });
});

// ─── Test connection ──────────────────────────────────────────────────────────

testBtn.addEventListener('click', async () => {
  const typedKey = apiKeyInput.value.trim();

  let apiKey = typedKey;
  if (!apiKey) {
    const stored = await chrome.storage.sync.get('ANTHROPIC_API_KEY');
    apiKey = stored.ANTHROPIC_API_KEY || '';
  }

  if (!apiKey) {
    showStatus('Enter or save an API key first', 'error');
    return;
  }

  testBtn.disabled = true;
  testBtn.textContent = 'Testing…';
  showStatus('', 'info');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });

    if (response.ok) {
      showStatus('Connected ✓', 'ok');
    } else {
      const body = await response.json().catch(() => ({}));
      const msg  = body?.error?.message || `Error ${response.status}`;
      showStatus(msg, 'error');
    }
  } catch {
    showStatus('Network error — check your connection', 'error');
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test API';
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function saveCreatorState() {
  chrome.storage.sync.set({ CREATORS: creators, ACTIVE_CREATOR_ID: activeCreatorId });
}

function setKeyStatus(ok, text) {
  keyPill.className  = `key-pill ${ok ? 'ok' : 'missing'}`;
  keyDot.className   = `key-dot ${ok ? 'ok' : 'missing'}`;
  keyStatusText.textContent = text;
}

function showStatus(text, type) {
  statusEl.textContent = text;
  statusEl.className   = type || '';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function typeLabel(type) {
  const map = {
    woman: 'Woman',
    egirl: 'E-girl',
    mature_woman: 'Mature',
    man: 'Man',
    picture_only: 'Photos',
    video_creator: 'Video',
    couple: 'Couple',
  };
  return map[type] || type;
}
