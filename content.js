const pendingRequests = new Map();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'PH_DEBUG_REQUEST') return false;

  const requestId = crypto.randomUUID();
  const timeoutMs = message.action === 'startPickSelector' ? 30000 : 5000;
  const timeout = setTimeout(() => {
    pendingRequests.delete(requestId);
    sendResponse({ data: null, error: `Timeout: no response from page script (${timeoutMs / 1000}s)` });
  }, timeoutMs);

  pendingRequests.set(requestId, { sendResponse, timeout });

  window.postMessage({
    type: 'PH_DEBUG_TO_PAGE',
    action: message.action,
    payload: message.payload,
    requestId
  }, '*');

  // Return true to keep sendResponse channel open for async reply
  return true;
});

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.type !== 'PH_DEBUG_TO_CONTENT') return;

  const { requestId, data, error } = event.data;
  const pending = pendingRequests.get(requestId);
  if (!pending) return;

  clearTimeout(pending.timeout);
  pendingRequests.delete(requestId);
  pending.sendResponse({ data, error });
});

// Ask background to inject page.js on load
chrome.runtime.sendMessage({ type: 'PH_INJECT_PAGE_SCRIPT' });
