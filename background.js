import { DEFAULTS, getRegion, refreshBadge, roleName } from "./sessions.js";
import { sessionFor } from "./portal.js";
import { parseConsoleUrl, parseStableUrl, sessionUrl, stableUrl } from "./links.js";

// Badge: poll every minute, and right away when an AWS page finishes loading (sign-in, sign-out, new console).
chrome.alarms.get("sessions").then(a => a || chrome.alarms.create("sessions", { periodInMinutes: 1 }));
chrome.alarms.onAlarm.addListener(refreshBadge);
chrome.storage.onChanged.addListener((changes, area) => area === "sync" && changes.region && refreshBadge());
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  // tab.url is only visible for hosts in host_permissions, i.e. AWS pages.
  if (change.status === "complete" && tab.url?.startsWith("https://")) refreshBadge();
});
refreshBadge();


// Stable link (portal shortcut, e.g. a bookmark) for an account + permission set you already have a
// console session for: go straight to that session instead of signing in again, which would take
// another of the 5 session slots.
chrome.tabs.onUpdated.addListener(async (tabId, change) => {
  const link = change.url && parseStableUrl(change.url);
  if (!link?.role) return;
  const s = sessionFor(link.accountId, link.role, (await refreshBadge()).live);
  if (s) chrome.tabs.update(tabId, { url: sessionUrl(s, link.destination, await getRegion()) });
});

// Right-click on a console page (or a console link in it) -> Copy stable AWS link.
chrome.runtime.onInstalled.addListener(() => chrome.contextMenus.create({
  id: "copy-stable-link", title: "Copy stable AWS link", contexts: ["page", "link"],
  documentUrlPatterns: ["https://*.console.aws.amazon.com/*"]
}));
chrome.contextMenus.onClicked.addListener(async info => {
  const page = parseConsoleUrl(info.linkUrl) ?? parseConsoleUrl(info.pageUrl);
  const { prefix } = await chrome.storage.sync.get(DEFAULTS);
  if (!page || !prefix) return;
  const s = (await refreshBadge()).live.find(x => x.differentiator === page.differentiator);
  if (!await copyText(stableUrl(prefix, page.accountId, s ? roleName(s.principal_arn) : "", page.destination))) return;
  // No window to show a message in: flash ✓ on the icon, then back to the session count.
  await chrome.action.setBadgeText({ text: "✓" });
  await chrome.action.setBadgeBackgroundColor({ color: "#037f0c" });
  setTimeout(refreshBadge, 1500);
});

// A service worker has no clipboard: copy from an offscreen document (needs clipboardWrite). Resolves to success.
async function copyText(text) {
  if (!await chrome.offscreen.hasDocument())
    await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["CLIPBOARD"], justification: "Copy a stable AWS console link" });
  return chrome.runtime.sendMessage({ copy: text });
}
