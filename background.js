import { refreshBadge } from "./sessions.js";

// The browser persists this setting; an earlier version set it to true, which hides the popup.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

// Badge: poll every minute, and right away when an AWS page finishes loading (sign-in, sign-out, new console).
chrome.alarms.get("sessions").then(a => a || chrome.alarms.create("sessions", { periodInMinutes: 1 }));
chrome.alarms.onAlarm.addListener(refreshBadge);
chrome.storage.onChanged.addListener(refreshBadge); // region may have changed
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  // tab.url is only visible for hosts in host_permissions, i.e. AWS pages.
  if (change.status === "complete" && tab.url?.startsWith("https://")) refreshBadge();
});
refreshBadge();

// Shortcut toggles the access portal side panel. open() must run synchronously in the key press and
// does nothing if the panel is already open; an already-open panel gets the message and closes itself.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "open-portal") return;
  if (tab) chrome.sidePanel.open({ windowId: tab.windowId });
  const windowId = tab?.windowId ?? (await chrome.windows.getLastFocused()).id; // no tab: focus is in the panel
  chrome.runtime.sendMessage({ closePanel: windowId }).catch(() => {}); // no panel open: nobody listening
});

// AWS pages refuse to be framed (X-Frame-Options / CSP frame-ancestors).
// Strip those headers only for frames outside any tab, i.e. inside this side panel.
// Session rules vanish on browser restart, so re-register on every service worker start.
chrome.declarativeNetRequest.updateSessionRules({
  removeRuleIds: [1],
  addRules: [{
    id: 1,
    action: {
      type: "modifyHeaders",
      responseHeaders: [
        { header: "x-frame-options", operation: "remove" },
        { header: "content-security-policy", operation: "remove" }
      ]
    },
    condition: { tabIds: [chrome.tabs.TAB_ID_NONE], resourceTypes: ["sub_frame"] }
  }]
});
