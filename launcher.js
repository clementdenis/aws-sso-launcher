import { DEFAULTS, MAX_SESSIONS, accountName, consoleUrl, limitPageUrl, logoutUrl, refreshBadge, roleName } from "./sessions.js";
import { SignInError, loadAssignments, matchesSession, portalStartUrl, search, sessionFor, shortcutUrl } from "./portal.js";

const CACHE_MAX_AGE = 10 * 60 * 1000; // re-read accounts from the portal at most every 10 minutes
const $ = id => document.getElementById(id);
const form = $("settings");
let settings = DEFAULTS;
let sessions = { live: [] };
let entries = [];        // [{ accountId, accountName, email, roleName }]
let accountsNote = null; // { text, error?, action? } shown above the account list
let rows = [];           // what each visible row opens: { session } or { entry, session? }
let selected = 0;

const time = sec => new Date(sec * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const el = (tag, props = {}, ...children) => { const e = Object.assign(document.createElement(tag), props); e.append(...children); return e; };
const button = (text, className, onclick) => el("button", { className: `btn ${className}`, textContent: text, onclick });

async function openTab(url) {
  await chrome.tabs.create({ url });
  window.close();
}

async function openOrFocus(url, match) {
  const [tab] = await chrome.tabs.query({ url: match });
  if (!tab) return openTab(url);
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  window.close();
}

// Reuse an existing console session when there is one: it doesn't take one of the 5 session slots.
const activate = row => openTab(row.session
  ? consoleUrl(row.session, settings.region)
  : shortcutUrl(settings.prefix, row.entry.accountId, row.entry.roleName));

function note({ text, error, action }) {
  return el("div", { className: `note${error ? " error" : ""}` }, text, action ? " " : "", action ?? "");
}

function addRow(row, info, extra) {
  const i = rows.push(row) - 1;
  const div = el("div", { className: "row", onclick: () => activate(row), onmousemove: () => selected !== i && select(i, false) }, info, extra);
  div.dataset.i = i;
  return div;
}

// AWS sometimes sends an empty account alias: use the account name from the portal instead.
const sessionName = s => s.account_alias || entries.find(e => e.accountId === s.principal_arn?.split(":")[4])?.accountName || accountName(s);

const info = (title, role, detail, tooltip = "") =>
  el("div", { className: "info", title: tooltip },
    el("span", { className: "title" }, title, el("span", { className: "role", textContent: ` · ${role}` })),
    el("small", { textContent: detail }));

const sessionRow = s => addRow({ session: s },
  info(sessionName(s), roleName(s.principal_arn), `${s.principal_arn?.split(":")[4]} · expires ${time(s.expiry)}`, s.principal_arn),
  button("Sign out", "", ev => { ev.stopPropagation(); signOut(s, ev.target); }));

function accountRow(e) {
  const s = sessionFor(e, sessions.live);
  return addRow({ entry: e, session: s },
    info(e.accountName, e.roleName, `${e.accountId} · ${e.email}`),
    s ? el("span", { className: "status", textContent: "Active", title: "Opens your existing console session" }) : "");
}

function render() {
  const q = $("q").value;
  const n = sessions.live.length;
  const counter = $("counter");
  counter.hidden = !!sessions.error;
  counter.textContent = `${n}/${MAX_SESSIONS} sessions`;
  counter.className = `counter${n >= MAX_SESSIONS ? " full" : n === MAX_SESSIONS - 1 ? " warn" : ""}`;

  rows = [];
  const nodes = [];
  const liveMatches = sessions.live.filter(s => matchesSession(s, q, sessionName(s)));
  if (sessions.error) {
    nodes.push(el("h2", {}, "Active sessions"), note({ text: "Can't read your console sessions. Are you signed in to the AWS console?", error: true }));
  } else if (!q || liveMatches.length) {
    nodes.push(el("h2", {}, "Active sessions", el("small", { textContent: `(${n}/${MAX_SESSIONS})` })));
    if (!n) nodes.push(note({ text: "No active console session." }));
    nodes.push(...liveMatches.map(sessionRow));
  }

  const matches = search(entries, q);
  nodes.push(el("h2", {}, "Accounts", el("small", { textContent: entries.length ? `(${matches.length})` : "" })));
  if (accountsNote) nodes.push(note(accountsNote));
  if (q && entries.length && !matches.length) nodes.push(note({ text: `Nothing matches “${q}”.` }));
  nodes.push(...matches.slice(0, 300).map(accountRow));

  $("results").replaceChildren(...nodes);
  select(Math.min(selected, rows.length - 1), false);
}

function select(i, scroll = true) {
  selected = Math.max(0, i);
  for (const r of document.querySelectorAll(".row")) r.classList.toggle("sel", +r.dataset.i === selected);
  if (scroll) document.querySelector(".row.sel")?.scrollIntoView({ block: "nearest" });
}

async function loadAccounts(force) {
  if (!settings.prefix) {
    entries = [];
    accountsNote = { text: "Set your access portal prefix in ⚙ Settings to search your accounts." };
    return render();
  }
  const { assignments: cache } = await chrome.storage.local.get("assignments");
  const cached = cache?.prefix === settings.prefix;
  entries = cached ? cache.entries : [];
  accountsNote = entries.length ? null : { text: "Loading your accounts…" };
  render();
  if (cached && !force && Date.now() - cache.at < CACHE_MAX_AGE) return;
  try {
    entries = await loadAssignments(settings.prefix);
    accountsNote = entries.length ? null : { text: "No account is assigned to you in this access portal." };
    await chrome.storage.local.set({ assignments: { prefix: settings.prefix, entries, at: Date.now() } });
  } catch (e) {
    accountsNote = e instanceof SignInError
      ? { text: entries.length ? "Saved list. Sign in to the access portal to refresh it." : "Sign in to the access portal to see your accounts.",
          action: button("Sign in", "primary", () => openTab(portalStartUrl(settings.prefix))) }
      : { text: `Couldn't load your accounts: ${e.message}`, error: true };
  }
  render();
}

async function signOut(s, btn) {
  btn.disabled = true;
  btn.textContent = "Signing out…";
  await fetch(logoutUrl(s, settings.region), { credentials: "include" }).catch(() => {});
  sessions = await refreshBadge();
  render();
  // AWS changed something or the logout needs its page: let AWS do it in a tab.
  if (sessions.live.some(l => l.differentiator === s.differentiator)) chrome.tabs.create({ url: logoutUrl(s, settings.region) });
}

function showSettings(on) {
  form.hidden = !on;
  for (const id of ["search", "results", "footer"]) $(id).hidden = on;
  $("toggle-settings").setAttribute("aria-pressed", on);
  (on ? form.prefix : $("q")).focus();
}

$("q").addEventListener("input", () => { selected = 0; render(); });
document.addEventListener("keydown", ev => {
  if (!form.hidden || !rows.length) return;
  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
    ev.preventDefault();
    select((selected + (ev.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length);
  } else if (ev.key === "Enter") {
    ev.preventDefault();
    activate(rows[selected]);
  }
});
$("toggle-settings").onclick = () => showSettings(form.hidden);
$("refresh").onclick = () => { refreshBadge().then(s => { sessions = s; render(); }); loadAccounts(true); };
$("portal").onclick = () => settings.prefix ? openTab(portalStartUrl(settings.prefix)) : showSettings(true);
$("limit").onclick = () => openOrFocus(limitPageUrl(settings.region), "https://*.signin.aws.amazon.com/sessions/limit*");

form.onsubmit = async ev => {
  ev.preventDefault();
  settings = { prefix: form.prefix.value.trim().toLowerCase(), region: form.region.value.trim() };
  await chrome.storage.sync.set(settings);
  $("welcome").hidden = true;
  showSettings(false);
  refreshBadge().then(s => { sessions = s; render(); });
  loadAccounts(true);
};

settings = await chrome.storage.sync.get(DEFAULTS);
form.prefix.value = settings.prefix;
form.region.value = settings.region;
$("welcome").hidden = !!settings.prefix;
if (!settings.prefix) showSettings(true);
render();
refreshBadge().then(s => { sessions = s; render(); });
loadAccounts(false);
