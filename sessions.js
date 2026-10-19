// Undocumented AWS endpoint behind the multi-session page (observed Oct 2026):
// GET https://<region>.signin.aws.amazon.com/sessions/v1/list
// -> { sessions: [{ account_alias, principal_arn, expiry (epoch seconds), differentiator, ... }] }
export const MAX_SESSIONS = 5;

export const listUrl = region => `https://${region}.signin.aws.amazon.com/sessions/v1/list`;
export const limitPageUrl = region => `https://${region}.signin.aws.amazon.com/sessions/limit`;
// What AWS's own "Sign out selected session" link opens (plain GET).
export const logoutUrl = (s, region) => `https://${region}.signin.aws.amazon.com/sessions/${encodeURIComponent(s.differentiator)}/v1/logout`;
// Multi-session console URL format from the AWS docs: https://<differentiator>.<region>.console.aws.amazon.com/
export const consoleUrl = (s, region) => `https://${s.differentiator}.${region}.console.aws.amazon.com/console/home?region=${region}`;

// "arn:aws:sts::123:assumed-role/AWSReservedSSO_AdminAccess_30cd18/me@x.com" -> "AdminAccess"
export const roleName = arn => (arn?.split("/")[1] ?? "?").replace(/^AWSReservedSSO_(.+)_[0-9a-f]+$/, "$1");

// Alias can be an empty string; AWS's own page then shows the account ID from the ARN.
export const accountName = s => s.account_alias || s.principal_arn?.split(":")[4] || s.differentiator;

export function summarize(sessions, nowSec) {
  const live = sessions.filter(s => s.expiry > nowSec);
  return {
    live,
    count: live.length,
    title: [`AWS console sessions: ${live.length}/${MAX_SESSIONS}`,
      ...live.map(s => `• ${accountName(s)} — ${roleName(s.principal_arn)}`)].join("\n"),
    color: live.length >= MAX_SESSIONS ? "#d13212" : live.length === MAX_SESSIONS - 1 ? "#ff9900" : "#1d8102"
  };
}

// No portal prefix by default: the side panel asks for it on first open.
export const DEFAULTS = { prefix: "", region: "us-east-1" };
export const getRegion = async () => (await chrome.storage.sync.get(DEFAULTS)).region;

// Fetch the list, update the icon badge and tooltip, and return the summary (with `error` when unavailable).
export async function refreshBadge() {
  let summary;
  try {
    const res = await fetch(listUrl(await getRegion()), { credentials: "include", cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    summary = summarize((await res.json()).sessions ?? [], Date.now() / 1000);
  } catch (e) {
    // Signed out (or AWS changed the endpoint): no badge rather than a stale count.
    summary = { live: [], count: 0, error: e.message, title: `AWS console sessions: unavailable (${e.message})` };
  }
  await chrome.action.setBadgeText({ text: summary.count ? String(summary.count) : "" });
  if (summary.color) await chrome.action.setBadgeBackgroundColor({ color: summary.color });
  await chrome.action.setTitle({ title: summary.title });
  return summary;
}
