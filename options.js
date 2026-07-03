const textarea = document.getElementById("domains");
const status = document.getElementById("status");

chrome.storage.sync.get(["zendeskDomains"], (result) => {
  textarea.value = (result.zendeskDomains || []).join("\n");
});

document.getElementById("save").addEventListener("click", () => {
  const domains = textarea.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  chrome.storage.sync.set({ zendeskDomains: domains }, () => {
    status.textContent = "Saved.";
    setTimeout(() => {
      status.textContent = "";
    }, 1500);
  });
});
