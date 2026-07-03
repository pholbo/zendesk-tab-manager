// Runs on every page. Intercepts plain left-clicks on links pointing at a
// configured Zendesk domain and redirects them to the background script,
// which reuses an existing Zendesk tab instead of opening a new one.
//
// Middle-clicks fire an "auxclick" event, not "click" — so this listener
// never sees them, and the browser's normal "open in new tab" behavior
// happens untouched. Ctrl/Cmd/Shift-clicks are treated the same way, since
// those are also explicit "open elsewhere" gestures.

let zendeskDomains = [];

chrome.storage.sync.get(["zendeskDomains"], (result) => {
  zendeskDomains = result.zendeskDomains || [];
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.zendeskDomains) {
    zendeskDomains = changes.zendeskDomains.newValue || [];
  }
});

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

function handleClick(event) {
  if (zendeskDomains.length === 0) return;
  if (event.defaultPrevented) return;
  if (event.button !== 0) return;
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

  const anchor = event.target.closest && event.target.closest("a[href]");
  if (!anchor) return;

  let url;
  try {
    url = new URL(anchor.href, document.baseURI);
  } catch {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  const linkMatches = matchDomain(url.hostname.toLowerCase(), zendeskDomains);
  if (!linkMatches) return;

  // If we're already on a matching Zendesk tab, let in-app navigation behave normally.
  const currentPageMatches = matchDomain(location.hostname.toLowerCase(), zendeskDomains);
  if (currentPageMatches) return;

  event.preventDefault();
  event.stopPropagation();
  chrome.runtime.sendMessage({ type: "openZendeskLink", url: url.href });
}

document.addEventListener("click", handleClick, true);
