// Receives "openZendeskLink" messages from content.js and either navigates
// an existing tab already on that Zendesk domain, or opens a new tab if
// none exists yet (that tab then becomes the reused one going forward).

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "openZendeskLink" && message.url) {
    openInExistingOrNewTab(message.url);
  }
});

async function openInExistingOrNewTab(url) {
  const targetHost = new URL(url).hostname.toLowerCase();

  const tabs = await chrome.tabs.query({});
  const candidates = tabs.filter((tab) => {
    if (!tab.url) return false;
    try {
      return new URL(tab.url).hostname.toLowerCase() === targetHost;
    } catch {
      return false;
    }
  });

  candidates.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  const existingTab = candidates[0];

  if (existingTab) {
    await chrome.tabs.update(existingTab.id, { url, active: true });
    await chrome.windows.update(existingTab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url, active: true });
  }
}
