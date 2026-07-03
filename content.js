// Runs on every page. Every new Zendesk tab gets redirected into the
// existing one by default (see background.js) — this script's job is just
// to tell the background script when a click was a deliberate "open in a
// new tab" gesture (middle-click, or Ctrl/Cmd/Shift-click) so that one
// specific tab is let through instead of being redirected.

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

  const isMiddleClick = event.type === "auxclick" && event.button === 1;
  const isModifiedClick =
    event.type === "click" &&
    event.button === 0 &&
    (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey);

  if (isMiddleClick || isModifiedClick) {
    // Deliberate "open in a new tab" — let the browser do its normal thing,
    // just flag this URL so the background script doesn't redirect it. This
    // applies even when already on a Zendesk tab (e.g. middle-clicking an
    // Admin link to keep it separate from the current ticket).
    chrome.runtime.sendMessage({ type: "allowNewTab", url: url.href });
    return;
  }

  if (event.type !== "click" || event.button !== 0) return;

  // Plain left-click: only redirect when arriving from outside Zendesk.
  // In-app navigation while already on a Zendesk tab is left to the app.
  const currentPageMatches = matchDomain(location.hostname.toLowerCase(), zendeskDomains);
  if (currentPageMatches) return;

  event.preventDefault();
  event.stopPropagation();
  chrome.runtime.sendMessage({ type: "openZendeskLink", url: url.href });
}

document.addEventListener("click", handleClick, true);
document.addEventListener("auxclick", handleClick, true);
