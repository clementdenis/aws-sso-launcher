import { MAX_SESSIONS, accountName, consoleUrl, getRegion, limitPageUrl, logoutUrl, refreshBadge, roleName } from "./sessions.js";

const region = await getRegion();
const windowId = (await chrome.windows.getCurrent()).id; // looked up early: sidePanel.open must run right in the click
const time = sec => new Date(sec * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

async function openOrFocus(url, match) {
  const [tab] = await chrome.tabs.query({ url: match });
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
  window.close();
}

document.getElementById("manage").onclick = () =>
  openOrFocus(limitPageUrl(region), "https://*.signin.aws.amazon.com/sessions/limit*");
document.getElementById("portal").onclick = () => chrome.sidePanel.open({ windowId }).then(() => window.close());

const button = (text, title, onclick) => {
  const b = document.createElement("button");
  Object.assign(b, { textContent: text, title, onclick });
  return b;
};

async function signOut(s, btn) {
  btn.disabled = true;
  btn.textContent = "Signing out…";
  await fetch(logoutUrl(s, region), { credentials: "include" }).catch(() => {});
  const summary = await refreshBadge();
  render(summary);
  // AWS changed something or the logout needs its page: let AWS do it in a tab.
  if (summary.live.some(l => l.differentiator === s.differentiator)) chrome.tabs.create({ url: logoutUrl(s, region) });
}

function render({ live, error }) {
  const status = document.getElementById("status");
  document.getElementById("heading").textContent = `AWS console sessions: ${live.length}/${MAX_SESSIONS}`;
  status.textContent = error ? `Session list unavailable (${error}). Are you signed in to the AWS console?` : "No active console session.";
  status.hidden = live.length > 0;

  document.getElementById("list").replaceChildren(...live.map(s => {
    const li = document.createElement("li");
    const info = document.createElement("div");
    const name = document.createElement("b");
    const detail = document.createElement("small");
    name.textContent = accountName(s);
    detail.textContent = `${roleName(s.principal_arn)} · expires ${time(s.expiry)}`;
    info.title = s.principal_arn;
    info.append(name, detail);
    const open = button("Open", "Open this session's console", () => { chrome.tabs.create({ url: consoleUrl(s, region) }); window.close(); });
    const out = button("Sign out", "Sign out of this console session", () => signOut(s, out));
    li.append(info, open, out);
    return li;
  }));
}

render(await refreshBadge());
