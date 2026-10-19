// Console URLs in multi-session mode embed the session ("differentiator"):
//   https://111122223333-u5b3rpfo.eu-west-3.console.aws.amazon.com/s3/buckets?region=eu-west-3
// They stop working when the session ends. Stable links go through the access portal instead
// (its documented shortcut link), with the session part removed from the destination.

const SESSION_HOST = /^(\d{12}-[a-z0-9]+)\.((?:[a-z0-9-]+\.)*console\.aws\.amazon\.com)$/;

// Multi-session console page -> { differentiator, accountId, destination } (null for any other URL).
export function parseConsoleUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const m = u.hostname.match(SESSION_HOST);
  if (u.protocol !== "https:" || !m) return null;
  return { differentiator: m[1], accountId: m[1].slice(0, 12), destination: `https://${m[2]}${u.pathname}${u.search}${u.hash}` };
}

// Access portal shortcut link; role and destination are optional (the portal asks for a role if missing).
export function stableUrl(prefix, accountId, role, destination) {
  const params = new URLSearchParams({ account_id: accountId });
  if (role) params.set("role_name", role);
  if (destination) params.set("destination", destination);
  return `https://${prefix}.awsapps.com/start/#/console?${params}`;
}

// Shortcut link (any portal) -> { accountId, role, destination } (null for any other URL).
export function parseStableUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!u.hostname.endsWith(".awsapps.com") || !u.hash.startsWith("#/console?")) return null;
  const p = new URLSearchParams(u.hash.slice("#/console?".length));
  const accountId = p.get("account_id");
  return accountId ? { accountId, role: p.get("role_name") ?? "", destination: p.get("destination") ?? "" } : null;
}

// A destination opened in an existing session: put the session back in front of the console host.
// Without a destination (or one outside the console), the session's console home.
export function sessionUrl(session, destination, region) {
  let d;
  try { d = destination && new URL(destination); } catch { d = null; }
  if (!d || !(d.hostname === "console.aws.amazon.com" || d.hostname.endsWith(".console.aws.amazon.com")))
    return `https://${session.differentiator}.${region}.console.aws.amazon.com/console/home?region=${region}`;
  // Multi-session hosts are regional: the bare console host gets the page's region.
  const host = d.hostname === "console.aws.amazon.com"
    ? `${d.searchParams.get("region") || region}.console.aws.amazon.com` : d.hostname;
  return `https://${session.differentiator}.${host}${d.pathname}${d.search}${d.hash}`;
}
