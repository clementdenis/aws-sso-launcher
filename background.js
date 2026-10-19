import { refreshBadge } from "./sessions.js";

// Badge: poll every minute, and right away when an AWS page finishes loading (sign-in, sign-out, new console).
chrome.alarms.get("sessions").then(a => a || chrome.alarms.create("sessions", { periodInMinutes: 1 }));
chrome.alarms.onAlarm.addListener(refreshBadge);
chrome.storage.onChanged.addListener((_changes, area) => area === "sync" && refreshBadge()); // region may have changed
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  // tab.url is only visible for hosts in host_permissions, i.e. AWS pages.
  if (change.status === "complete" && tab.url?.startsWith("https://")) refreshBadge();
});
refreshBadge();

