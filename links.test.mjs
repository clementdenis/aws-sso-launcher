// Run: node links.test.mjs
import assert from "node:assert/strict";
import { parseConsoleUrl, parseStableUrl, sessionTabCounts, sessionUrl, stableUrl } from "./links.js";

const page = "https://111122223333-u5b3rpfo.eu-west-3.console.aws.amazon.com/s3/buckets/my-bucket?region=eu-west-3&tab=objects#x";
assert.deepEqual(parseConsoleUrl(page), {
  differentiator: "111122223333-u5b3rpfo", accountId: "111122223333",
  destination: "https://eu-west-3.console.aws.amazon.com/s3/buckets/my-bucket?region=eu-west-3&tab=objects#x"
});
assert.equal(parseConsoleUrl("https://111122223333-u5b3rpfo.console.aws.amazon.com/iam/home").destination,
  "https://console.aws.amazon.com/iam/home", "host without region");
assert.equal(parseConsoleUrl("https://eu-west-3.console.aws.amazon.com/ec2/home"), null, "not a multi-session URL");
assert.equal(parseConsoleUrl("https://111122223333-u5b3rpfo.console.aws.amazon.com.evil.com/"), null);
assert.equal(parseConsoleUrl("not a url"), null);

const link = stableUrl("acme", "111122223333", "Admin Access", "https://eu-west-3.console.aws.amazon.com/s3/buckets?region=eu-west-3");
assert.equal(link, "https://acme.awsapps.com/start/#/console?account_id=111122223333&role_name=Admin+Access&destination=https%3A%2F%2Feu-west-3.console.aws.amazon.com%2Fs3%2Fbuckets%3Fregion%3Deu-west-3");
assert.equal(stableUrl("acme", "111122223333"), "https://acme.awsapps.com/start/#/console?account_id=111122223333", "role and page optional");
assert.deepEqual(parseStableUrl(link), { accountId: "111122223333", role: "Admin Access", destination: "https://eu-west-3.console.aws.amazon.com/s3/buckets?region=eu-west-3" });
assert.deepEqual(parseStableUrl("https://acme.awsapps.com/start/#/console?account_id=1&role_name=R"), { accountId: "1", role: "R", destination: "" });
assert.equal(parseStableUrl("https://acme.awsapps.com/start/#/"), null);
assert.equal(parseStableUrl("https://evil.com/#/console?account_id=1"), null);

const s = { differentiator: "111122223333-u5b3rpfo" };
assert.equal(sessionUrl(s, "https://eu-west-3.console.aws.amazon.com/s3/buckets?region=eu-west-3", "us-east-1"),
  "https://111122223333-u5b3rpfo.eu-west-3.console.aws.amazon.com/s3/buckets?region=eu-west-3", "round trip of parseConsoleUrl");
assert.equal(sessionUrl(s, parseConsoleUrl(page).destination, "us-east-1"), page);
assert.equal(sessionUrl(s, "https://console.aws.amazon.com/iam/home?region=eu-west-1#/roles", "us-east-1"),
  "https://111122223333-u5b3rpfo.eu-west-1.console.aws.amazon.com/iam/home?region=eu-west-1#/roles", "bare host gets the page's region");
assert.equal(sessionUrl(s, "", "eu-west-3"), "https://111122223333-u5b3rpfo.eu-west-3.console.aws.amazon.com/console/home?region=eu-west-3", "no page: console home");
assert.equal(sessionUrl(s, "https://evil.com/x", "eu-west-3"), "https://111122223333-u5b3rpfo.eu-west-3.console.aws.amazon.com/console/home?region=eu-west-3", "never leaves the console");
assert.deepEqual([...sessionTabCounts([page, page, "https://222222222222-x1.console.aws.amazon.com/iam/home", "https://example.com/", "about:blank"])],
  [["111122223333-u5b3rpfo", 2], ["222222222222-x1", 1]], "tabs per session; other tabs ignored");
console.log("ok");
