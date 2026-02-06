chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Inject early monkey-patch to capture PostHog instance from debug mode log
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: details.tabId },
      world: 'MAIN',
      injectImmediately: true,
      func: () => {
        const originalLog = console.log;
        console.log = function (...args) {
          if (args.length > 1 &&
            typeof args[0] === 'string' &&
            args[0].includes('[PostHog.js]') &&
            typeof args[1] === 'string' &&
            args[1].includes('Starting in debug mode')) {
            if (args[2] && args[2]['this']) {
              const instance = args[2]['this'];
              // Skip PostHog's internal toolbar instance
              if (instance.config?.name !== 'ph_toolbar_internal') {
                window.__POSTHOG_INSTANCE__ = instance;
              }
            }
          }
          return originalLog.apply(this, args);
        };
      }
    });
  } catch {
    // Ignore errors (e.g. chrome:// pages)
  }
});

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
