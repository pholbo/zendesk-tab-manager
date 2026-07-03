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
  console.log("[ZTM] reuseExistingTab", { url, tabIdToClose, domains });
  if (domains.length === 0) return;

  let hostname;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return;
  }
  const matched = matchDomain(hostname, domains);
  console.log("[ZTM] hostname", hostname, "matched pattern:", matched);
  if (!matched) return;

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
  console.log(
    "[ZTM] candidate tabs",
    candidates.map((t) => ({ id: t.id, url: t.url, lastAccessed: t.lastAccessed }))
  );

  candidates.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  const existingTab = candidates[0];

  if (existingTab) {
    console.log("[ZTM] reusing tab", existingTab.id);
    await chrome.tabs.update(existingTab.id, { url, active: true });
    await chrome.windows.update(existingTab.windowId, { focused: true });
    if (tabIdToClose !== undefined) {
      await chrome.tabs.remove(tabIdToClose);
    }
  } else if (tabIdToClose === undefined) {
    console.log("[ZTM] no existing tab, creating new one");
    await chrome.tabs.create({ url, active: true });
  } else {
    console.log("[ZTM] no existing tab, leaving external tab", tabIdToClose, "as-is");
  }
}

// Case 1: link clicked inside a page running content.js.
chrome.runtime.onMessage.addListener((message) => {
  console.log("[ZTM] onMessage", message);
  if (message && message.type === "openZendeskLink" && message.url) {
    reuseExistingTab(message.url);
  }
});

// Case 2: tab opened from outside Chrome.
const pendingExternalTabs = new Set();

chrome.tabs.onCreated.addListener((tab) => {
  console.log("[ZTM] tabs.onCreated", { id: tab.id, openerTabId: tab.openerTabId, url: tab.url, pendingUrl: tab.pendingUrl });
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
  console.log("[ZTM] onUpdated for pending external tab", tabId, changeInfo);
  if (!changeInfo.url) return;
  pendingExternalTabs.delete(tabId);
  reuseExistingTab(changeInfo.url, tabId);
});
