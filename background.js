// Two ways a Zendesk link reaches us:
//
// 1. Clicked inside a page where content.js is running: it cancels the
//    click and sends us an "openZendeskLink" message before any tab is
//    created.
//
// 2. Opened from outside Chrome entirely (Obsidian, Slack desktop, Mail,
//    etc.): the OS asks Chrome to open the URL directly, so a new tab
//    appears with no content.js involvement. We catch this in
//    chrome.tabs.onCreated instead. Such tabs have no openerTabId, which is
//    what distinguishes them from tabs opened by clicking a link *inside*
//    an existing Chrome tab (including middle-click / Ctrl/Cmd-click new
//    tabs, which do have an openerTabId and must be left alone).

function matchDomain(hostname, patterns) {
  for (const raw of patterns) {
    const pattern = raw.trim().toLowerCase();
    if (!pattern) continue;
    if (pattern.startsWith("*.")) {
      const bareDomain = pattern.slice(2);
      const suffix = pattern.slice(1); // ".zendesk.com"
      if (hostname === bareDomain || hostname.endsWith(suffix)) return pattern;
    } else if (hostname === pattern) {
      return pattern;
    }
  }
  return null;
}

async function getZendeskDomains() {
  const result = await chrome.storage.sync.get(["zendeskDomains"]);
  return result.zendeskDomains || [];
}

async function reuseExistingTab(url, tabIdToClose) {
  const domains = await getZendeskDomains();
  if (domains.length === 0) return;

  let hostname;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return;
  }
  if (!matchDomain(hostname, domains)) return;

  const tabs = await chrome.tabs.query({});
  const candidates = tabs.filter((tab) => {
    if (tab.id === tabIdToClose) return false;
    if (!tab.url) return false;
    try {
      return new URL(tab.url).hostname.toLowerCase() === hostname;
    } catch {
      return false;
    }
  });

  candidates.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  const existingTab = candidates[0];

  if (existingTab) {
    await chrome.tabs.update(existingTab.id, { url, active: true });
    await chrome.windows.update(existingTab.windowId, { focused: true });
    if (tabIdToClose !== undefined) {
      await chrome.tabs.remove(tabIdToClose);
    }
  } else if (tabIdToClose === undefined) {
    await chrome.tabs.create({ url, active: true });
  }
  // else: this is the first Zendesk tab and it already exists (tabIdToClose) —
  // leave it as-is, it becomes the tab that gets reused next time.
}

// Case 1: link clicked inside a page running content.js.
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "openZendeskLink" && message.url) {
    reuseExistingTab(message.url);
  }
});

// Case 2: tab opened from outside Chrome.
const pendingExternalTabs = new Set();

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.openerTabId) return;
  if (tab.url) {
    reuseExistingTab(tab.url, tab.id);
  } else {
    pendingExternalTabs.add(tab.id);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => pendingExternalTabs.delete(tabId));

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!pendingExternalTabs.has(tabId)) return;
  if (!changeInfo.url) return;
  pendingExternalTabs.delete(tabId);
  reuseExistingTab(changeInfo.url, tabId);
});
