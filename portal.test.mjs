// Run: node portal.test.mjs
import assert from "node:assert/strict";
import { matchesSession, parseApiEndpoint, search, sessionFor, shortcutUrl } from "./portal.js";

assert.equal(parseApiEndpoint(`<head><script type="application/json" id="env">{"region":"eu-west-3","dpApiEndpoint":"https://portal.sso.eu-west-3.amazonaws.com"}</script>`),
  "https://portal.sso.eu-west-3.amazonaws.com");
assert.throws(() => parseApiEndpoint("<html></html>"));

assert.equal(shortcutUrl("acme", "111122223333", "Admin Access"),
  "https://acme.awsapps.com/start/#/console?account_id=111122223333&role_name=Admin%20Access");

const e = (accountName, roleName, accountId = "111122223333") => ({ accountName, roleName, accountId, email: `${accountName}@example.com` });
const entries = [e("billing", "ReadOnly"), e("prod-api", "Admin"), e("prod-api", "ReadOnly"), e("sandbox-prod", "Admin", "444455556666")];
assert.equal(search(entries, "").length, 4);
assert.deepEqual(search(entries, "prod admin").map(x => x.accountName), ["prod-api", "sandbox-prod"], "all terms match; name prefix ranks first");
assert.deepEqual(search(entries, "4444").map(x => x.accountName), ["sandbox-prod"], "matches account ID");
assert.equal(search(entries, "nope").length, 0);

const arn = "arn:aws:sts::111122223333:assumed-role/AWSReservedSSO_Admin_30cd181501209ecf/me@example.com";
const live = [{ account_alias: "prod-api", principal_arn: arn }];
assert.equal(sessionFor(e("prod-api", "Admin"), live), live[0]);
assert.equal(sessionFor(e("prod-api", "ReadOnly"), live), undefined, "same account, other permission set");
assert.ok(matchesSession(live[0], "prod admin"));
assert.ok(!matchesSession(live[0], "billing"));
assert.ok(matchesSession({ account_alias: "", principal_arn: arn }, "prod", "prod-api"), "empty alias: match on the portal account name");
console.log("ok");
