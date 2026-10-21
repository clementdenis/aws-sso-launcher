// Run: node sessions.test.mjs
import assert from "node:assert/strict";
import { signOutOrder, summarize } from "./sessions.js";

const s = (alias, expiry, arn = "arn:aws:sts::111122223333:assumed-role/AWSReservedSSO_AWSAdministratorAccess_30cd181501209ecf/me@example.com") =>
  ({ account_alias: alias, principal_arn: arn, expiry, differentiator: "111122223333-abc" });

const r = summarize([s("prod", 2000), s("dev", 999)], 1000);
assert.equal(r.count, 1, "expired sessions are not counted");
assert.equal(r.title, "AWS console sessions: 1/5\n• prod — AWSAdministratorAccess");
assert.equal(r.color, "#1d8102");

assert.equal(summarize([1, 2, 3, 4].map(i => s("a" + i, 2000)), 1000).color, "#ff9900");
assert.equal(summarize([1, 2, 3, 4, 5].map(i => s("a" + i, 2000)), 1000).color, "#d13212");
assert.match(summarize([{ differentiator: "x-1", expiry: 2000, principal_arn: "arn:aws:sts::1:assumed-role/MyRole/me" }], 1000).title, /• 1 — MyRole/, "no alias: account ID from the ARN");
assert.equal(summarize([], 1000).count, 0);
assert.match(summarize([s("", 2000)], 1000).title, /• 111122223333 — AWSAdministratorAccess/, "empty alias falls back to account ID");
const order = signOutOrder([
  { differentiator: "a", expiry: 300 }, { differentiator: "b", expiry: 100 }, { differentiator: "c", expiry: 200 }, { differentiator: "d", expiry: 50 }],
  new Map([["a", 0], ["b", 2], ["d", 1]]));
assert.deepEqual(order.map(s => s.differentiator), ["c", "a", "d", "b"], "no open tab first (soonest expiry first), then fewest tabs");
console.log("ok");
