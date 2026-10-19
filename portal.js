// IAM Identity Center access portal: list the accounts and permission sets assigned to you.
// Uses the documented portal API (ListAccounts / ListAccountRoles) with the bearer token the
// portal itself keeps in a cookie once you're signed in.
import { roleName } from "./sessions.js";

export const portalStartUrl = prefix => `https://${prefix}.awsapps.com/start/`;
// Documented "shortcut link": opens the console for an account + permission set via the portal.
export const shortcutUrl = (prefix, accountId, role) =>
  `${portalStartUrl(prefix)}#/console?account_id=${accountId}&role_name=${encodeURIComponent(role)}`;

const TOKEN_COOKIES = ["__Host-idc-access-portal-authn", "x-amz-sso_authn"]; // current and legacy portal
export class SignInError extends Error {}

// The portal page embeds its API endpoint: <script type="application/json" id="env">{"dpApiEndpoint": ...}</script>
export function parseApiEndpoint(html) {
  const env = html.match(/<script[^>]*id="env"[^>]*>([\s\S]*?)<\/script>/);
  if (!env) throw new Error("access portal page has no env block");
  return JSON.parse(env[1]).dpApiEndpoint;
}

async function api(endpoint, token, path) {
  const res = await fetch(endpoint + path, { headers: { "x-amz-sso_bearer_token": token } });
  if (res.status === 401 || res.status === 403) throw new SignInError("Not signed in to the access portal");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function paged(fetchPage, key) {
  const items = [];
  let next;
  do {
    const page = await fetchPage(next ? `&next_token=${encodeURIComponent(next)}` : "");
    items.push(...(page[key] ?? []));
    next = page.nextToken;
  } while (next);
  return items;
}

// Run fn over items with at most `limit` requests in flight (one roles call per account).
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const n = i++; out[n] = await fn(items[n]); }
  }));
  return out;
}

// -> [{ accountId, accountName, email, roleName }] sorted by account then role.
export async function loadAssignments(prefix) {
  const cookies = await chrome.cookies.getAll({ domain: `${prefix}.awsapps.com` });
  const token = TOKEN_COOKIES.map(n => cookies.find(c => c.name === n)?.value).find(Boolean);
  if (!token) throw new SignInError("Not signed in to the access portal");
  const page = await fetch(portalStartUrl(prefix));
  if (!page.ok) throw new Error(`access portal "${prefix}" not found (HTTP ${page.status})`);
  const endpoint = parseApiEndpoint(await page.text());

  const accounts = await paged(q => api(endpoint, token, `/assignment/accounts?max_result=100${q}`), "accountList");
  const roles = await mapLimit(accounts, 6, a =>
    paged(q => api(endpoint, token, `/assignment/roles?account_id=${a.accountId}&max_result=100${q}`), "roleList"));
  return accounts
    .flatMap((a, i) => roles[i].map(r => ({ accountId: a.accountId, accountName: a.accountName, email: a.emailAddress, roleName: r.roleName })))
    .sort((x, y) => x.accountName.localeCompare(y.accountName) || x.roleName.localeCompare(y.roleName));
}

const terms = query => query.toLowerCase().split(/\s+/).filter(Boolean);

// Every term must appear somewhere; account names starting with the first term come first.
export function search(entries, query) {
  const t = terms(query);
  if (!t.length) return entries;
  const rank = e => e.accountName.toLowerCase().startsWith(t[0]) ? 0 : 1;
  return entries
    .filter(e => t.every(term => `${e.accountName} ${e.accountId} ${e.email} ${e.roleName}`.toLowerCase().includes(term)))
    .sort((x, y) => rank(x) - rank(y)); // stable: keeps alphabetical order within a rank
}

export const matchesSession = (s, query, name = s.account_alias) =>
  terms(query).every(term => `${name} ${s.principal_arn}`.toLowerCase().includes(term));

// An active console session for this account + permission set, if any (reusing it saves a session slot).
export const sessionFor = (entry, live) =>
  live.find(s => s.principal_arn?.split(":")[4] === entry.accountId && roleName(s.principal_arn) === entry.roleName);
