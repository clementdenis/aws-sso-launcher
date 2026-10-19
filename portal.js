// IAM Identity Center access portal: list the accounts assigned to you, and their permission sets on demand.
// Uses the documented portal API (ListAccounts / ListAccountRoles) with the bearer token the
// portal itself keeps in a cookie once you're signed in.
import { roleName } from "./sessions.js";

export const portalStartUrl = prefix => `https://${prefix}.awsapps.com/start/`;

const TOKEN_COOKIES = ["__Host-idc-access-portal-authn", "x-amz-sso_authn"]; // current and legacy portal
export class SignInError extends Error {}

// The portal page embeds its API endpoint: <script type="application/json" id="env">{"dpApiEndpoint": ...}</script>
export function parseApiEndpoint(html) {
  const env = html.match(/<script[^>]*id="env"[^>]*>([\s\S]*?)<\/script>/);
  if (!env) throw new Error("access portal page has no env block");
  return JSON.parse(env[1]).dpApiEndpoint;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(endpoint, token, path) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(endpoint + path, { headers: { "x-amz-sso_bearer_token": token } });
    // Throttled (the portal API allows only a few calls per second): wait as asked, else back off exponentially.
    if (res.status === 429 && attempt < 6) {
      await sleep((Number(res.headers.get("retry-after")) * 1000 || 500 * 2 ** attempt) + Math.random() * 250);
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new SignInError("Not signed in to the access portal");
    if (!res.ok) throw new Error(res.status === 429 ? "the access portal is throttling requests, try again in a minute" : `HTTP ${res.status}`);
    return res.json();
  }
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

// Portal API client for the signed-in user: accounts(), then roles(accountId) when an account is opened.
export async function connect(prefix) {
  const cookies = await chrome.cookies.getAll({ domain: `${prefix}.awsapps.com` });
  const token = TOKEN_COOKIES.map(n => cookies.find(c => c.name === n)?.value).find(Boolean);
  if (!token) throw new SignInError("Not signed in to the access portal");
  const page = await fetch(portalStartUrl(prefix));
  if (!page.ok) throw new Error(`access portal "${prefix}" not found (HTTP ${page.status})`);
  const endpoint = parseApiEndpoint(await page.text());
  return {
    // -> [{ accountId, accountName, email }] sorted by name
    accounts: async () => (await paged(q => api(endpoint, token, `/assignment/accounts?max_result=100${q}`), "accountList"))
      .map(a => ({ accountId: a.accountId, accountName: a.accountName, email: a.emailAddress }))
      .sort((x, y) => x.accountName.localeCompare(y.accountName)),
    // -> permission set names, sorted
    roles: async accountId => (await paged(q => api(endpoint, token, `/assignment/roles?account_id=${accountId}&max_result=100${q}`), "roleList"))
      .map(r => r.roleName).sort()
  };
}

const terms = query => query.toLowerCase().split(/\s+/).filter(Boolean);

// Every term must appear in the account's name, ID, email or (for pins) permission set and page title;
// names starting with the first term come first.
export function search(accounts, query) {
  const t = terms(query);
  if (!t.length) return accounts;
  const rank = a => a.accountName.toLowerCase().startsWith(t[0]) ? 0 : 1;
  return accounts
    .filter(a => t.every(term => `${a.accountName} ${a.accountId} ${a.email} ${a.role ?? ""} ${a.title ?? ""}`.toLowerCase().includes(term)))
    .sort((x, y) => rank(x) - rank(y)); // stable: keeps alphabetical order within a rank
}

export const matchesSession = (s, query, name = s.account_alias) =>
  terms(query).every(term => `${name} ${s.principal_arn}`.toLowerCase().includes(term));

// Browsing history items -> portal prefixes (<prefix>.awsapps.com) and sign-in regions
// (<region>.signin.aws.amazon.com), most visited first.
export function detectFromHistory(items) {
  const tally = re => {
    const visits = new Map();
    for (const { url, visitCount = 1 } of items) {
      let host;
      try { host = new URL(url).hostname; } catch { continue; }
      const key = host.match(re)?.[1];
      if (key) visits.set(key, (visits.get(key) ?? 0) + visitCount);
    }
    return [...visits].sort((a, b) => b[1] - a[1]).map(([key]) => key);
  };
  return {
    prefixes: tally(/^([a-z0-9-]+)\.awsapps\.com$/),
    regions: tally(/^([a-z]{2}(?:-[a-z]+)+-\d)\.signin\.aws\.amazon\.com$/)
  };
}

const sessionAccount = s => s.principal_arn?.split(":")[4];
// An active console session for this account + permission set, if any (reusing it saves a session slot).
export const sessionFor = (accountId, role, live) =>
  live.find(s => sessionAccount(s) === accountId && roleName(s.principal_arn) === role);
export const hasSession = (accountId, live) => live.some(s => sessionAccount(s) === accountId);
