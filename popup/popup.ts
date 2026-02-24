import { StorageKey, LEGACY_PLACEHOLDER_RE, ANTHROPIC_API_URL, ANTHROPIC_API_VERSION, MODEL_HAIKU } from '../utils/constants';

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const creatorListEl    = document.getElementById('creatorList');
const addCreatorBtn    = document.getElementById('addCreator');
const creatorNameInput = document.getElementById('creatorName') as HTMLInputElement | null;
const creatorTypeSelect = document.getElementById('creatorType') as HTMLSelectElement | null;
const apiKeyInput      = document.getElementById('apiKey') as HTMLInputElement | null;
const keyPill          = document.getElementById('keyStatus');
const keyDot           = document.getElementById('keyDot');
const keyStatusText    = document.getElementById('keyStatusText');
const saveBtn          = document.getElementById('save');
const testBtn          = document.getElementById('test') as HTMLButtonElement | null;
const statusEl         = document.getElementById('status');

// ─── State ────────────────────────────────────────────────────────────────────

interface Creator {
  id: string;
  name: string;
  type: string;
  createdAt: string;
}

let creators: Creator[] = [];
let activeCreatorId = '';

// ─── Init ─────────────────────────────────────────────────────────────────────

chrome.storage.sync.get(
  [StorageKey.ApiKey, StorageKey.Creators, StorageKey.ActiveCreatorId],
  (data: Record<string, unknown>) => {
    if (!apiKeyInput || !creatorNameInput || !creatorTypeSelect) return;

    // API key display
    const storedKey = data[StorageKey.ApiKey] as string | undefined;
    if (storedKey) {
      const last4 = storedKey.slice(-4);
      apiKeyInput.placeholder = `••••••••••${last4}`;
      setKeyStatus(true, `Key saved  ···${last4}`);
    }

    // Load creators, stripping any legacy placeholder names.
    const raw = (data[StorageKey.Creators] as Creator[] | undefined) ?? [];
    creators = raw.filter((c) => !LEGACY_PLACEHOLDER_RE.test(c.name));
    if (creators.length !== raw.length) saveCreatorState(); // persist cleanup
    const storedActiveId = data[StorageKey.ActiveCreatorId] as string | undefined;
    activeCreatorId =
      creators.find((c) => c.id === storedActiveId)?.id ?? creators[0]?.id ?? '';

    renderCreatorList();
    syncEditFields();
  }
);

// ─── Render ───────────────────────────────────────────────────────────────────

function renderCreatorList(): void {
  if (!creatorListEl) return;
  creatorListEl.innerHTML = '';

  if (creators.length === 0) {
    creatorListEl.innerHTML =
      '<div class="creator-empty">Open OnlyFans to auto-detect creators</div>';
    return;
  }

  creators.forEach((c) => {
    const row = document.createElement('div');
    row.className = `creator-row${c.id === activeCreatorId ? ' active' : ''}`;
    row.dataset['id'] = c.id;
    row.innerHTML = `
      <div class="creator-dot${c.id === activeCreatorId ? ' active' : ''}"></div>
      <span class="creator-name">${escHtml(c.name)}</span>
      <span class="creator-type-badge">${typeLabel(c.type)}</span>
      <button class="creator-delete" data-delete-id="${escHtml(c.id)}" ${creators.length <= 1 ? 'disabled' : ''} title="Delete creator">✕</button>
    `;

    // Click row → set active
    row.addEventListener('click', (e) => {
      if ((e.target as Element).closest('.creator-delete')) return;
      setActive(c.id);
    });

    // Delete button
    const delBtn = row.querySelector<HTMLButtonElement>('.creator-delete');
    delBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (creators.length <= 1) return;
      if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
      creators = creators.filter((x) => x.id !== c.id);
      if (activeCreatorId === c.id) {
        activeCreatorId = creators[0]?.id ?? '';
      }
      saveCreatorState();
      renderCreatorList();
      syncEditFields();
    });

    creatorListEl.appendChild(row);
  });
}

function syncEditFields(): void {
  const editSection = document.getElementById('editSection');
  if (!editSection || !creatorNameInput || !creatorTypeSelect) return;

  const active = creators.find((c) => c.id === activeCreatorId);
  if (!active) {
    editSection.style.display = 'none';
    return;
  }
  editSection.style.display = '';
  creatorNameInput.value = active.name;
  creatorTypeSelect.value = active.type;
}

// ─── Creator management ───────────────────────────────────────────────────────

function setActive(id: string): void {
  activeCreatorId = id;
  chrome.storage.sync.set({ [StorageKey.ActiveCreatorId]: id });
  renderCreatorList();
  syncEditFields();
}

addCreatorBtn?.addEventListener('click', () => {
  if (!creatorNameInput) return;
  const newCreator: Creator = {
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

saveBtn?.addEventListener('click', () => {
  if (!apiKeyInput || !creatorNameInput || !creatorTypeSelect) return;
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
      creators[idx] = { ...creators[idx]!, name: newName, type: creatorTypeSelect.value };
    }
  }

  const toSave: Record<string, unknown> = {
    [StorageKey.Creators]: creators,
    [StorageKey.ActiveCreatorId]: activeCreatorId,
  };
  if (key) toSave[StorageKey.ApiKey] = key;

  chrome.storage.sync.set(toSave, () => {
    if (!apiKeyInput) return;
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

testBtn?.addEventListener('click', async () => {
  if (!testBtn || !apiKeyInput) return;
  const typedKey = apiKeyInput.value.trim();

  let apiKey = typedKey;
  if (!apiKey) {
    const stored = await chrome.storage.sync.get(StorageKey.ApiKey) as Record<string, unknown>;
    apiKey = (stored[StorageKey.ApiKey] as string) || '';
  }

  if (!apiKey) {
    showStatus('Enter or save an API key first', 'error');
    return;
  }

  testBtn.disabled = true;
  testBtn.textContent = 'Testing…';
  showStatus('', 'info');

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL_HAIKU,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });

    if (response.ok) {
      showStatus('Connected ✓', 'ok');
    } else {
      const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
      const msg = body?.error?.message ?? `Error ${response.status}`;
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

function saveCreatorState(): void {
  chrome.storage.sync.set({
    [StorageKey.Creators]: creators,
    [StorageKey.ActiveCreatorId]: activeCreatorId,
  });
}

function setKeyStatus(ok: boolean, text: string): void {
  if (!keyPill || !keyDot || !keyStatusText) return;
  keyPill.className  = `key-pill ${ok ? 'ok' : 'missing'}`;
  keyDot.className   = `key-dot ${ok ? 'ok' : 'missing'}`;
  keyStatusText.textContent = text;
}

function showStatus(text: string, type: string): void {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className   = type || '';
}

function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    woman: 'Woman',
    egirl: 'E-girl',
    mature_woman: 'Mature',
    man: 'Man',
    picture_only: 'Photos',
    video_creator: 'Video',
    couple: 'Couple',
  };
  return map[type] ?? type;
}
