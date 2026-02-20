// Injected into the page's main world so DevTools console can reach the
// isolated content script via postMessage.
window.__OFC_diagnose = () => window.postMessage({ __ofc: 1, fn: 'diagnose' }, '*');
window.__OFC_diagnoseProfile = () => window.postMessage({ __ofc: 1, fn: 'diagnoseProfile' }, '*');
