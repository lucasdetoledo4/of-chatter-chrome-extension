const input = document.getElementById('apiKey');
const btn = document.getElementById('save');
const status = document.getElementById('status');

// Load existing key (show last 4 chars as hint)
chrome.storage.sync.get('ANTHROPIC_API_KEY', (data) => {
  if (data.ANTHROPIC_API_KEY) {
    input.placeholder = '••••••••' + data.ANTHROPIC_API_KEY.slice(-4);
  }
});

btn.addEventListener('click', () => {
  const key = input.value.trim();
  if (!key) {
    status.textContent = 'Enter a key first.';
    status.className = 'error';
    return;
  }
  if (!key.startsWith('sk-ant-')) {
    status.textContent = 'Key should start with sk-ant-';
    status.className = 'error';
    return;
  }
  chrome.storage.sync.set({ ANTHROPIC_API_KEY: key }, () => {
    status.textContent = 'Saved.';
    status.className = '';
    input.value = '';
    input.placeholder = '••••••••' + key.slice(-4);
  });
});
