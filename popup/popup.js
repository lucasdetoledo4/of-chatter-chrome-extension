const input = document.getElementById('apiKey');
const creatorTypeSelect = document.getElementById('creatorType');
const btn = document.getElementById('save');
const status = document.getElementById('status');

// Load existing settings
chrome.storage.sync.get(['ANTHROPIC_API_KEY', 'CREATOR_TYPE'], (data) => {
  if (data.ANTHROPIC_API_KEY) {
    input.placeholder = '••••••••' + data.ANTHROPIC_API_KEY.slice(-4);
  }
  if (data.CREATOR_TYPE) {
    creatorTypeSelect.value = data.CREATOR_TYPE;
  }
});

btn.addEventListener('click', () => {
  const key = input.value.trim();
  const creatorType = creatorTypeSelect.value;

  if (key && !key.startsWith('sk-ant-')) {
    status.textContent = 'Key should start with sk-ant-';
    status.className = 'error';
    return;
  }

  const toSave = { CREATOR_TYPE: creatorType };
  if (key) toSave.ANTHROPIC_API_KEY = key;

  chrome.storage.sync.set(toSave, () => {
    status.textContent = 'Saved.';
    status.className = '';
    if (key) {
      input.value = '';
      input.placeholder = '••••••••' + key.slice(-4);
    }
  });
});
