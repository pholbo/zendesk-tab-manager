const textarea = document.getElementById("domains");
const status = document.getElementById("status");
const versionEl = document.getElementById("version");

versionEl.textContent = `v${chrome.runtime.getManifest().version}`;

chrome.storage.sync.get(["zendeskDomains"], (result) => {
  textarea.value = (result.zendeskDomains || []).join("\n");
});

let statusTimeout;

document.getElementById("save").addEventListener("click", () => {
  const domains = textarea.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  chrome.storage.sync.set({ zendeskDomains: domains }, () => {
    status.textContent = "Saved ✓";
    status.classList.add("visible");
    clearTimeout(statusTimeout);
    statusTimeout = setTimeout(() => {
      status.classList.remove("visible");
    }, 1500);
  });
});
