// Run: node portal.test.mjs
import assert from "node:assert/strict";
import { SignInError, connect, detectFromHistory, hasSession, matchesSession, parseApiEndpoint, search, sessionFor, shortcutUrl } from "./portal.js";

assert.equal(parseApiEndpoint(`<head><script type="application/json" id="env">{"region":"eu-west-3","dpApiEndpoint":"https://portal.sso.eu-west-3.amazonaws.com"}</script>`),
  "https://portal.sso.eu-west-3.amazonaws.com");
assert.throws(() => parseApiEndpoint("<html></html>"));

assert.equal(shortcutUrl("acme", "111122223333", "Admin Access"),
  "https://acme.awsapps.com/start/#/console?account_id=111122223333&role_name=Admin%20Access");

const a = (accountName, accountId = "111122223333") => ({ accountName, accountId, email: `aws+${accountName}@example.com` });
const accounts = [a("billing"), a("prod-api"), a("sandbox-prod", "444455556666")];
assert.equal(search(accounts, "").length, 3);
assert.deepEqual(search(accounts, "prod").map(x => x.accountName), ["prod-api", "sandbox-prod"], "name prefix ranks first");
assert.deepEqual(search(accounts, "4444").map(x => x.accountName), ["sandbox-prod"], "matches account ID");
assert.deepEqual(search(accounts, "aws+billing").map(x => x.accountName), ["billing"], "matches email");
assert.equal(search(accounts, "prod nope").length, 0, "every term must match");

const arn = "arn:aws:sts::111122223333:assumed-role/AWSReservedSSO_Admin_30cd181501209ecf/me@example.com";
const live = [{ account_alias: "prod-api", principal_arn: arn }];
assert.equal(sessionFor("111122223333", "Admin", live), live[0]);
assert.equal(sessionFor("111122223333", "ReadOnly", live), undefined, "same account, other permission set");
assert.ok(hasSession("111122223333", live));
assert.ok(!hasSession("444455556666", live));
assert.ok(matchesSession(live[0], "prod admin"));
assert.ok(!matchesSession(live[0], "billing"));
assert.ok(matchesSession({ account_alias: "", principal_arn: arn }, "prod", "prod-api"), "empty alias: match on the portal account name");

const history = [
  { url: "https://acme.awsapps.com/start/#/", visitCount: 3 },
  { url: "https://acme.awsapps.com/start/#/console?account_id=1", visitCount: 4 },
  { url: "https://other-org.awsapps.com/start", visitCount: 5 },
  { url: "https://eu-west-3.signin.aws.amazon.com/oauth?x=1", visitCount: 9 },
  { url: "https://us-east-1.signin.aws.amazon.com/", visitCount: 2 },
  { url: "https://signin.aws.amazon.com/", visitCount: 50 },
  { url: "https://evil.com/?acme.awsapps.com", visitCount: 99 },
  { url: "not a url" }
];
assert.deepEqual(detectFromHistory(history), { prefixes: ["acme", "other-org"], regions: ["eu-west-3", "us-east-1"] },
  "ranked by total visits; only real portal / regional sign-in hosts");

// connect() against a stubbed portal that throttles the first calls.
globalThis.chrome = { cookies: { getAll: async () => [{ name: "__Host-idc-access-portal-authn", value: "tok" }] } };
let throttle = 2;
const calls = [];
globalThis.fetch = async (url, opts) => {
  calls.push({ url, token: opts?.headers?.["x-amz-sso_bearer_token"] });
  if (url.endsWith("/start/")) return new Response(`<script type="application/json" id="env">{"dpApiEndpoint":"https://api"}</script>`);
  if (throttle-- > 0) return new Response("", { status: 429, headers: { "retry-after": "0.01" } });
  if (url.includes("/assignment/accounts")) return Response.json(url.includes("next_token=p2")
    ? { accountList: [{ accountId: "2", accountName: "alpha", emailAddress: "a@x" }] }
    : { accountList: [{ accountId: "1", accountName: "beta", emailAddress: "b@x" }], nextToken: "p2" });
  if (url.includes("/assignment/roles?account_id=1")) return Response.json({ roleList: [{ roleName: "ReadOnly" }, { roleName: "Admin" }] });
  return new Response("", { status: 500 });
};
const portal = await connect("acme");
assert.deepEqual(await portal.accounts(), [
  { accountId: "2", accountName: "alpha", email: "a@x" }, { accountId: "1", accountName: "beta", email: "b@x" }],
  "all pages, sorted by name, after 2 throttled calls");
assert.deepEqual(await portal.roles("1"), ["Admin", "ReadOnly"]);
assert.ok(calls.filter(c => c.url.startsWith("https://api")).every(c => c.token === "tok"), "bearer token sent");
assert.equal(calls.filter(c => c.url.includes("/assignment/roles")).length, 1, "roles fetched only for the opened account");

throttle = Infinity;
await assert.rejects(portal.roles("1"), /throttling/, "gives up with a clear message");
globalThis.chrome.cookies.getAll = async () => [];
await assert.rejects(connect("acme"), SignInError, "no token cookie: not signed in");
console.log("ok");
