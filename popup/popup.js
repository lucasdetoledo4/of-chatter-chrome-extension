const apiKeyInput  = document.getElementById('apiKey');
const keyStatus    = document.getElementById('keyStatus');
const keyDot       = document.getElementById('keyDot');
const keyStatusText = document.getElementById('keyStatusText');
const saveBtn      = document.getElementById('save');
const testBtn      = document.getElementById('test');
const statusEl     = document.getElementById('status');
const creatorGrid  = document.getElementById('creatorGrid');

let selectedCreatorType = 'woman';

// ─── Load saved settings ──────────────────────────────────────────────────────

chrome.storage.sync.get(['ANTHROPIC_API_KEY', 'CREATOR_TYPE'], (data) => {
  if (data.ANTHROPIC_API_KEY) {
    const last4 = data.ANTHROPIC_API_KEY.slice(-4);
    apiKeyInput.placeholder = `••••••••••${last4}`;
    setKeyStatus(true, `Key saved  ···${last4}`);
  }

  const type = data.CREATOR_TYPE || 'woman';
  setActiveCard(type);
});

// ─── Creator type cards ───────────────────────────────────────────────────────

creatorGrid.querySelectorAll('.creator-card').forEach((card) => {
  card.addEventListener('click', () => setActiveCard(card.dataset.value));
});

function setActiveCard(value) {
  selectedCreatorType = value;
  creatorGrid.querySelectorAll('.creator-card').forEach((c) => {
    c.classList.toggle('active', c.dataset.value === value);
  });
}

// ─── API key status ───────────────────────────────────────────────────────────

function setKeyStatus(ok, text) {
  keyStatus.className = `key-status ${ok ? 'ok' : 'missing'}`;
  keyDot.className    = `key-dot ${ok ? 'ok' : 'missing'}`;
  keyStatusText.textContent = text;
}

// ─── Save ─────────────────────────────────────────────────────────────────────

saveBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();

  if (key && !key.startsWith('sk-ant-')) {
    showStatus('Key must start with sk-ant-', 'error');
    return;
  }

  const toSave = { CREATOR_TYPE: selectedCreatorType };
  if (key) toSave.ANTHROPIC_API_KEY = key;

  chrome.storage.sync.set(toSave, () => {
    if (key) {
      const last4 = key.slice(-4);
      apiKeyInput.value = '';
      apiKeyInput.placeholder = `••••••••••${last4}`;
      setKeyStatus(true, `Key saved  ···${last4}`);
    }
    showStatus('Settings saved', 'ok');
  });
});

// ─── Test connection ──────────────────────────────────────────────────────────

testBtn.addEventListener('click', async () => {
  // Prefer the just-typed key over the stored one
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
  } catch (err) {
    showStatus('Network error — check your connection', 'error');
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test API';
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function showStatus(text, type) {
  statusEl.textContent = text;
  statusEl.className = type || '';
}
