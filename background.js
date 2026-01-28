chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

function injectPageScript(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    files: ['page.js'],
    world: 'MAIN'
  }).catch(() => {
    // Ignore errors (e.g. chrome:// pages)
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    injectPageScript(tabId);
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'PH_INJECT_PAGE_SCRIPT' && sender.tab) {
    injectPageScript(sender.tab.id);
  }
});
