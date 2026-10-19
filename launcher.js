import { DEFAULTS, MAX_SESSIONS, accountName, consoleUrl, limitPageUrl, logoutUrl, refreshBadge, roleName } from "./sessions.js";
import { SignInError, connect, detectFromHistory, hasSession, matchesSession, portalStartUrl, search, sessionFor, shortcutUrl } from "./portal.js";

// Commercial AWS regions, for the region field's suggestions (any valid region code is still accepted).
const REGIONS = {
  "us-east-1": "US East (N. Virginia)", "us-east-2": "US East (Ohio)", "us-west-1": "US West (N. California)", "us-west-2": "US West (Oregon)",
  "af-south-1": "Africa (Cape Town)", "ap-east-1": "Asia Pacific (Hong Kong)", "ap-east-2": "Asia Pacific (Taipei)",
  "ap-south-1": "Asia Pacific (Mumbai)", "ap-south-2": "Asia Pacific (Hyderabad)", "ap-southeast-1": "Asia Pacific (Singapore)",
  "ap-southeast-2": "Asia Pacific (Sydney)", "ap-southeast-3": "Asia Pacific (Jakarta)", "ap-southeast-4": "Asia Pacific (Melbourne)",
  "ap-southeast-5": "Asia Pacific (Malaysia)", "ap-southeast-6": "Asia Pacific (New Zealand)", "ap-southeast-7": "Asia Pacific (Thailand)",
  "ap-northeast-1": "Asia Pacific (Tokyo)", "ap-northeast-2": "Asia Pacific (Seoul)", "ap-northeast-3": "Asia Pacific (Osaka)",
  "ca-central-1": "Canada (Central)", "ca-west-1": "Canada West (Calgary)", "eu-central-1": "Europe (Frankfurt)", "eu-central-2": "Europe (Zurich)",
  "eu-west-1": "Europe (Ireland)", "eu-west-2": "Europe (London)", "eu-west-3": "Europe (Paris)", "eu-south-1": "Europe (Milan)",
  "eu-south-2": "Europe (Spain)", "eu-north-1": "Europe (Stockholm)", "il-central-1": "Israel (Tel Aviv)", "me-south-1": "Middle East (Bahrain)",
  "me-central-1": "Middle East (UAE)", "mx-central-1": "Mexico (Central)", "sa-east-1": "South America (São Paulo)"
};
let historyPrefixes = []; // portal prefixes found in the browsing history, most visited first
const $ = id => document.getElementById(id);
const form = $("settings");
let settings = DEFAULTS;
let sessions = { live: [] };
let accounts = [];        // [{ accountId, accountName, email }]
let accountsNote = null;  // { text, error?, action? } shown above the account list
const expanded = new Set(); // account IDs showing their permission sets
const roles = new Map();  // account ID -> permission set names, "loading" or an Error
let portalClient = null;  // promise of the portal API client, created on first use
const portal = () => portalClient ??= connect(settings.prefix).catch(e => { portalClient = null; throw e; });
let rows = [];            // what each selectable row does: { session }, { account } or { accountId, role, session? }
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

// Account rows open their permission sets; session and permission set rows open the console,
// reusing an existing session when there is one (it doesn't take one of the 5 session slots).
function activate(row) {
  if (row.account) return toggle(row.account);
  openTab(row.session ? consoleUrl(row.session, settings.region) : shortcutUrl(settings.prefix, row.accountId, row.role));
}

function note({ text, error, action }, className = "") {
  return el("div", { className: `note ${error ? "error" : ""} ${className}` }, text, action ? " " : "", action ?? "");
}

const errorNote = (e, what) => e instanceof SignInError
  ? { text: `Sign in to the access portal to see your ${what}.`, action: button("Sign in", "primary", () => openTab(portalStartUrl(settings.prefix))) }
  : { text: `Couldn't load your ${what}: ${e.message}`, error: true };

function addRow(row, className, ...children) {
  const i = rows.push(row) - 1;
  const div = el("div", { className: `row ${className}`, onclick: () => activate(row), onmousemove: () => selected !== i && select(i, false) }, ...children);
  div.dataset.i = i;
  return div;
}

const activeTag = title => el("span", { className: "status", textContent: "Active", title });

// AWS sometimes sends an empty account alias: use the account name from the portal instead.
const sessionName = s => s.account_alias || accounts.find(a => a.accountId === s.principal_arn?.split(":")[4])?.accountName || accountName(s);

const info = (title, role, detail = [], tooltip = "") =>
  el("div", { className: "info", title: tooltip },
    el("span", { className: "title" }, title, role ? el("span", { className: "role", textContent: ` · ${role}` }) : ""),
    detail.length ? el("small", {}, ...detail) : "");

let toastTimer;
function toast(text) {
  const t = $("toast");
  Object.assign(t, { textContent: text, hidden: false });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 1500);
}

const copyAccountId = id => navigator.clipboard.writeText(id).then(() => toast(`Copied ${id}`), () => toast("Couldn't copy"));

// Account ID followed by a copy icon, like the access portal.
const accountIdWithCopy = id => [id, el("button", {
  className: "copy", title: "Copy account ID (⌘C / Ctrl+C)", ariaLabel: `Copy account ID ${id}`,
  innerHTML: '<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 1h8a2 2 0 0 1 2 2v8h-1.5V3a.5.5 0 0 0-.5-.5H5V1Zm-2 3h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 1.5a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V6a.5.5 0 0 0-.5-.5H3Z"/></svg>',
  onclick: ev => { ev.stopPropagation(); copyAccountId(id); }
})];

const rowAccountId = row => row.account?.accountId ?? row.accountId ?? row.session?.principal_arn?.split(":")[4];

const sessionRow = s => addRow({ session: s }, "",
  info(sessionName(s), roleName(s.principal_arn), [...accountIdWithCopy(rowAccountId({ session: s })), ` · expires ${time(s.expiry)}`], s.principal_arn),
  Object.assign(button("Sign out", "", ev => { ev.stopPropagation(); signOut(s); }), { title: "Sign out of this session (Delete)" }));

// An account row, followed by its permission sets when expanded.
function accountRows(a) {
  const open = expanded.has(a.accountId);
  const nodes = [addRow({ account: a }, "",
    el("span", { className: "chevron", textContent: open ? "▾" : "▸" }),
    info(a.accountName, null, [...accountIdWithCopy(a.accountId), ` · ${a.email}`]),
    hasSession(a.accountId, sessions.live) ? activeTag("You have a console session in this account") : "")];
  const list = open && roles.get(a.accountId);
  if (list === "loading") nodes.push(note({ text: "Loading permission sets…" }, "sub"));
  else if (list instanceof Error) nodes.push(note(errorNote(list, "permission sets"), "sub"));
  else if (list) nodes.push(...list.map(role => {
    const s = sessionFor(a.accountId, role, sessions.live);
    return addRow({ accountId: a.accountId, role, session: s }, "sub", info(role), s ? activeTag("Opens your existing console session") : "");
  }));
  return nodes;
}

async function toggle(a, open = !expanded.has(a.accountId)) {
  if (!open) { expanded.delete(a.accountId); return render(); }
  expanded.add(a.accountId);
  if (roles.get(a.accountId) === "loading") return render();
  if (!Array.isArray(roles.get(a.accountId))) {
    roles.set(a.accountId, "loading");
    render();
    try { roles.set(a.accountId, await (await portal()).roles(a.accountId)); }
    catch (e) { roles.set(a.accountId, e); }
  }
  render();
  const first = rows.findIndex(r => r.role && r.accountId === a.accountId);
  if (first >= 0) select(first);
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

  const matches = search(accounts, q);
  nodes.push(el("h2", {}, "Accounts", el("small", { textContent: accounts.length ? `(${matches.length})` : "" })));
  if (accountsNote) nodes.push(note(accountsNote));
  if (q && accounts.length && !matches.length) nodes.push(note({ text: `No account matches “${q}”.` }));
  for (const a of matches.slice(0, 300)) nodes.push(...accountRows(a));

  $("results").replaceChildren(...nodes);
  select(Math.min(selected, rows.length - 1), false);
}

function select(i, scroll = true) {
  selected = Math.max(0, i);
  for (const r of document.querySelectorAll(".row")) r.classList.toggle("sel", +r.dataset.i === selected);
  if (scroll) document.querySelector(".row.sel")?.scrollIntoView({ block: "nearest" });
}

// One call (per page of 100 accounts); a saved copy shows instantly while it refreshes.
async function loadAccounts() {
  if (!settings.prefix) {
    accounts = [];
    accountsNote = { text: "Set your access portal prefix in ⚙ Settings to search your accounts." };
    return render();
  }
  const { accounts: saved } = await chrome.storage.local.get("accounts");
  if (saved?.prefix === settings.prefix) accounts = saved.list;
  accountsNote = accounts.length ? null : { text: "Loading your accounts…" };
  render();
  try {
    accounts = await (await portal()).accounts();
    accountsNote = accounts.length ? null : { text: "No account is assigned to you in this access portal." };
    await chrome.storage.local.set({ accounts: { prefix: settings.prefix, list: accounts } });
  } catch (e) {
    accountsNote = e instanceof SignInError && accounts.length
      ? { ...errorNote(e, "accounts"), text: "Saved list. Sign in to the access portal to refresh it." }
      : errorNote(e, "accounts");
  }
  render();
}

// Forget everything fetched from the portal (Refresh, or a new portal prefix).
function resetPortal() {
  portalClient = null;
  roles.clear();
  expanded.clear();
}

async function signOut(s) {
  // Show progress on the session's Sign out button (the action may come from the Delete key on another row).
  const i = rows.findIndex(r => r.session === s && !r.role);
  const btn = document.querySelector(`.row[data-i="${i}"] button`);
  if (btn) Object.assign(btn, { disabled: true, textContent: "Signing out…" });
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
  if (on) suggestFromHistory();
}

// Input with a suggestion list. Unlike <datalist>, which filters by the current value (so a pre-filled
// field only suggests itself), it shows every option on focus and filters only once you type.
function combobox(input, getOptions) {
  const list = el("ul", { className: "combo", hidden: true, role: "listbox" });
  input.after(list);
  let typed = false, active = -1, shown = [];
  const pick = o => { input.value = o.value; list.hidden = true; };
  const render = () => {
    const q = typed ? input.value.toLowerCase() : "";
    shown = getOptions().filter(o => `${o.value} ${o.label ?? ""}`.toLowerCase().includes(q));
    list.replaceChildren(...shown.map((o, i) => el("li", {
      role: "option",
      className: [i === active && "active", o.value === input.value && "current"].filter(Boolean).join(" "),
      onmousedown: ev => { ev.preventDefault(); pick(o); } // preventDefault keeps focus in the input
    }, el("b", { textContent: o.value }), o.label ? el("span", { textContent: o.label }) : "")));
    list.hidden = !shown.length;
    list.querySelector(".active")?.scrollIntoView({ block: "nearest" });
  };
  const open = () => { typed = false; active = -1; render(); };
  input.addEventListener("focus", open);
  input.addEventListener("click", () => list.hidden && open()); // already focused after a pick
  input.addEventListener("input", () => { typed = true; active = -1; render(); });
  input.addEventListener("blur", () => { list.hidden = true; });
  input.addEventListener("keydown", ev => {
    if (list.hidden) return;
    const n = shown.length;
    if (ev.key === "ArrowDown") active = (active + 1) % n;
    else if (ev.key === "ArrowUp") active = active <= 0 ? n - 1 : active - 1;
    else if (ev.key === "Enter" && active >= 0) pick(shown[active]);
    else if (ev.key === "Escape") list.hidden = true;
    else return;
    ev.preventDefault();
    if (!list.hidden) render();
  });
}

// Optional "history" permission: only asked for when the user clicks the button.
async function suggestFromHistory() {
  const granted = await chrome.permissions.contains({ permissions: ["history"] });
  $("history-btn").hidden = granted;
  if (!granted) return;
  const items = await chrome.history.search({ text: "aws", startTime: 0, maxResults: 10000 });
  const { prefixes, regions } = detectFromHistory(items);
  historyPrefixes = prefixes;
  if (document.activeElement === form.prefix) form.prefix.dispatchEvent(new Event("focus")); // show them now
  if (!form.prefix.value && prefixes[0]) form.prefix.value = prefixes[0];
  if (!settings.prefix && regions[0]) form.region.value = regions[0]; // first setup only: never override a saved region
  $("history-hint").textContent = prefixes.length
    ? `Found in your browsing history: ${prefixes.join(", ")}.`
    : "No access portal found in your browsing history.";
}

$("q").addEventListener("input", () => {
  selected = 0;
  render();
  // Narrowed down to one account: show its permission sets right away.
  const matches = search(accounts, $("q").value);
  if ($("q").value && matches.length === 1) toggle(matches[0], true);
});
document.addEventListener("keydown", ev => {
  if (!form.hidden || !rows.length) return;
  const row = rows[selected];
  const q = $("q");
  const caretAtEnd = q.selectionStart === q.value.length; // otherwise ← → move the caret in the search box
  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
    ev.preventDefault();
    select((selected + (ev.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length);
  } else if (ev.key === "Enter") {
    ev.preventDefault();
    activate(row);
  } else if (ev.key.toLowerCase() === "c" && (ev.metaKey || ev.ctrlKey) && q.selectionStart === q.selectionEnd && rowAccountId(row)) {
    // ⌘C / Ctrl+C with no text selected in the search box: copy the selected row's account ID.
    ev.preventDefault();
    copyAccountId(rowAccountId(row));
  } else if (row.session && ((ev.key === "Delete" && caretAtEnd) || (ev.key === "Backspace" && !q.value))) {
    // Delete (fn+delete on a Mac), or Backspace with an empty search box: sign out of the selected session.
    ev.preventDefault();
    signOut(row.session);
  } else if (ev.key === "ArrowRight" && caretAtEnd && row.account && !expanded.has(row.account.accountId)) {
    ev.preventDefault();
    toggle(row.account, true);
  } else if (ev.key === "ArrowLeft" && caretAtEnd && (row.role || expanded.has(row.account?.accountId))) {
    ev.preventDefault();
    const accountId = row.account?.accountId ?? row.accountId;
    toggle(accounts.find(a => a.accountId === accountId), false);
    select(rows.findIndex(r => r.account?.accountId === accountId));
  }
});
$("history-btn").onclick = () => chrome.permissions.request({ permissions: ["history"] }).then(ok => ok && suggestFromHistory());
combobox(form.prefix, () => historyPrefixes.map(value => ({ value })));
combobox(form.region, () => Object.entries(REGIONS).map(([value, label]) => ({ value, label })));
$("toggle-settings").onclick = () => showSettings(form.hidden);
$("refresh").onclick = () => { refreshBadge().then(s => { sessions = s; render(); }); resetPortal(); loadAccounts(); };
$("portal").onclick = () => settings.prefix ? openTab(portalStartUrl(settings.prefix)) : showSettings(true);
$("limit").onclick = () => openOrFocus(limitPageUrl(settings.region), "https://*.signin.aws.amazon.com/sessions/limit*");

form.onsubmit = async ev => {
  ev.preventDefault();
  settings = { prefix: form.prefix.value.trim().toLowerCase(), region: form.region.value.trim() };
  await chrome.storage.sync.set(settings);
  resetPortal();
  accounts = [];
  $("welcome").hidden = true;
  showSettings(false);
  refreshBadge().then(s => { sessions = s; render(); });
  loadAccounts();
};

settings = await chrome.storage.sync.get(DEFAULTS);
form.prefix.value = settings.prefix;
form.region.value = settings.region;
$("welcome").hidden = !!settings.prefix;
if (!settings.prefix) showSettings(true);
render();
refreshBadge().then(s => { sessions = s; render(); });
loadAccounts();
