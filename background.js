// Every newly created tab pointing at a configured Zendesk domain gets
// redirected into an existing Zendesk tab, UNLESS content.js told us in
// advance (via an "allowNewTab" message) that this exact URL was opened
// deliberately — middle-click, or Ctrl/Cmd/Shift-click.
//
// We can't tell "opened deliberately" apart from "opened elsewhere" using
// chrome.tabs.Tab.openerTabId: Chrome sets it to the current active tab
// even for links opened by another app entirely (e.g. clicking a link in
// Obsidian), so it doesn't actually mean "a click inside this tab caused
// it." The allowlist above is what makes the distinction reliably.

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

const allowedNewTabUrls = new Map(); // url -> expiry timeoutId
const ALLOW_TTL_MS = 5000;

function allowNewTab(url) {
  if (allowedNewTabUrls.has(url)) {
    clearTimeout(allowedNewTabUrls.get(url));
  }
  const timeoutId = setTimeout(() => allowedNewTabUrls.delete(url), ALLOW_TTL_MS);
  allowedNewTabUrls.set(url, timeoutId);
}

function consumeAllowedNewTab(url) {
  if (!allowedNewTabUrls.has(url)) return false;
  clearTimeout(allowedNewTabUrls.get(url));
  allowedNewTabUrls.delete(url);
  return true;
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

chrome.runtime.onMessage.addListener((message) => {
  if (!message) return;
  if (message.type === "openZendeskLink" && message.url) {
    reuseExistingTab(message.url);
  } else if (message.type === "allowNewTab" && message.url) {
    allowNewTab(message.url);
  }
});

function handleNewTab(tab, url) {
  if (consumeAllowedNewTab(url)) return; // deliberate new tab — leave it alone
  reuseExistingTab(url, tab.id);
}

const pendingTabs = new Set();

chrome.tabs.onCreated.addListener((tab) => {
  const candidateUrl = tab.url || tab.pendingUrl;
  if (candidateUrl) {
    handleNewTab(tab, candidateUrl);
  } else {
    pendingTabs.add(tab.id);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => pendingTabs.delete(tabId));

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!pendingTabs.has(tabId)) return;
  if (!changeInfo.url) return;
  pendingTabs.delete(tabId);
  handleNewTab({ id: tabId }, changeInfo.url);
});
