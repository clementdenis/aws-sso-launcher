# AWS SSO Panel

A small Chrome / Microsoft Edge extension for people who live in AWS IAM Identity Center (AWS SSO):

- **Access portal in the side panel**: your `https://<prefix>.awsapps.com/start` portal stays open next to your tabs. Consoles you open from it land in normal tabs.
- **Console sessions at a glance**: the toolbar icon shows how many [AWS console multi-sessions](https://docs.aws.amazon.com/awsconsolehelpdocs/latest/gsg/multisession.html) are active (AWS allows 5). It turns orange at 4 and red at 5, and hovering lists them.
- **Session popup**: click the icon to see each session (account, role, expiry), open its console, or sign out of it before you hit the limit.

## Install

The extension isn't on the Chrome Web Store / Edge Add-ons yet; load it unpacked:

1. Download or clone this repository:
   ```bash
   git clone https://github.com/clementdenis/aws-sso-panel.git
   ```
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge) and turn on **Developer mode**.
3. Click **Load unpacked** and select the cloned folder.
4. Pin the extension to the toolbar to see the session count.

Requires Chrome or Edge 116 or newer.

## Setup

On first open, the side panel asks for:

- **Access portal prefix**: the `<prefix>` in your portal URL `https://<prefix>.awsapps.com/start`.
- **Console sign-in region**: the region used to read your console sessions (default `us-east-1`).

You can change both later with the ⚙ button in the panel.

## Usage

| Action | How |
| --- | --- |
| Session list, open or sign out of a session | Click the toolbar icon |
| Toggle the access portal side panel | <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> (<kbd>⌥</kbd><kbd>⇧</kbd><kbd>A</kbd> on macOS), or **Access portal** in the popup |
| Change the shortcut | `chrome://extensions/shortcuts` or `edge://extensions/shortcuts` |
| Reload the portal / open it in a tab / settings | ↻ / ↗ / ⚙ in the panel |

## How it works and why it needs its permissions

- **`sidePanel`, `storage`, `alarms`**: the panel, your two settings (synced with your browser profile), and a once-a-minute refresh of the session count.
- **Host access to AWS domains** (`*.awsapps.com`, `*.aws.amazon.com`, `*.signin.aws`, `*.amazonaws.com`): to read the session list and to let the portal load inside the panel.
- **`declarativeNetRequest`**: AWS pages refuse to be embedded (`X-Frame-Options`, CSP `frame-ancestors`). The extension removes those two headers **only for frames outside any tab**, i.e. inside its own side panel. Pages in your normal tabs are untouched.
- **A content script on `*.awsapps.com`**, active only when the portal runs inside a frame. Browsers drop `SameSite=Lax` cookies written by script in an embedded page, which breaks the portal login with a 401. The script writes the portal's cookies as `SameSite=None` instead.
- **Session list and sign out** use the same endpoints as AWS's own session limit page:
  `GET https://<region>.signin.aws.amazon.com/sessions/v1/list` and
  `GET https://<region>.signin.aws.amazon.com/sessions/<id>/v1/logout`.
  They are **undocumented** and may change. If they do, the badge disappears and the popup says the list is unavailable; it never shows a stale count.

## Privacy

The extension has no server, analytics or tracking. It only talks to AWS, with your existing browser session, and stores nothing but your portal prefix and region.

## Limitations

- If your Identity Center uses an external identity provider (Okta, Entra ID, Google…), its login page may refuse to load in the panel. Sign in once with ↗ (open in a tab); the panel works afterwards.
- Tested on Chromium-based browsers only (Chrome, Edge). Firefox has no `sidePanel` API.

## Development

There is no build step: edit the files and click the reload button on the extension card.

```bash
node sessions.test.mjs
```

runs the unit tests for the session-list logic (Node 20+).

## Disclaimer

Not affiliated with, endorsed by or supported by Amazon Web Services. "AWS" and "AWS IAM Identity Center" are trademarks of Amazon.com, Inc. or its affiliates.

## License

[MIT](LICENSE)
