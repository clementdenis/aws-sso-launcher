# AWS SSO Launcher

A small Chrome / Microsoft Edge extension for people who live in AWS IAM Identity Center (AWS SSO). Press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> (or click the icon), type a few letters, press <kbd>Enter</kbd>: you're in the console.

![The launcher: active console sessions on top, searchable accounts and permission sets below](docs/screenshot.png)

- **Search every account and permission set** assigned to you: by account name, ID, email or permission set. All words must match, so `prod admin` finds AdministratorAccess on your production accounts.
- **Reuses your sessions**: if you already have a console session for that account and permission set (marked **Active**), <kbd>Enter</kbd> takes you back to it instead of opening a new one, so it doesn't use one of your session slots.
- **Console sessions at a glance**: AWS allows 5 simultaneous [console sessions](https://docs.aws.amazon.com/awsconsolehelpdocs/latest/gsg/multisession.html) per browser. The icon badge shows how many are active (orange at 4, red at 5), and the launcher lists them with a **Sign out** button so you can free a slot before you hit the limit.

## Install

The extension isn't on the Chrome Web Store / Edge Add-ons yet; load it unpacked:

1. Download or clone this repository:
   ```bash
   git clone https://github.com/clementdenis/aws-sso-launcher.git
   ```
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge) and turn on **Developer mode**.
3. Click **Load unpacked** and select the cloned folder.
4. Pin the extension to the toolbar to see the session count.

Requires Chrome or Edge 116 or newer.

## Setup

On first open, the launcher asks for:

- **Access portal prefix**: the `<prefix>` in your portal URL `https://<prefix>.awsapps.com/start`.
- **Console sign-in region**: the region used to read your console sessions (default `us-east-1`; the field suggests every AWS region).

**Find it in my browsing history** fills both in for you: it looks for the portals (`<prefix>.awsapps.com`) and sign-in regions (`<region>.signin.aws.amazon.com`) you visit most. It asks for the history permission only when you click it.

Change them later with ⚙. Your accounts load once you're signed in to the access portal (the launcher offers a **Sign in** button when you aren't).

## Usage

| Action | How |
| --- | --- |
| Open the launcher | Click the toolbar icon, or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> (<kbd>⌥</kbd><kbd>⇧</kbd><kbd>A</kbd> on macOS) |
| Pick an account / permission set | Type to filter, <kbd>↑</kbd> <kbd>↓</kbd> to select, <kbd>Enter</kbd> or click to open |
| Sign out of a console session | **Sign out** next to the session |
| Reload your account list | **Refresh** (it also refreshes on its own every 10 minutes) |
| Change the shortcut | `chrome://extensions/shortcuts` or `edge://extensions/shortcuts` |

## How it works and why it needs its permissions

- **`cookies`** and host access to **`*.awsapps.com`**: once you sign in, the access portal keeps a login token in a cookie. The extension reads it to call the portal API.
- Host access to **`*.amazonaws.com`**: the [IAM Identity Center portal API](https://docs.aws.amazon.com/singlesignon/latest/PortalAPIReference/Welcome.html) (`ListAccounts`, `ListAccountRoles`) that lists your accounts and permission sets.
- Opening an account uses the portal's documented [shortcut links](https://docs.aws.amazon.com/singlesignon/latest/userguide/createshortcutlink.html) (`https://<prefix>.awsapps.com/start/#/console?account_id=…&role_name=…`).
- Host access to **`*.aws.amazon.com`**: the console session list and sign out. They use the same endpoints as AWS's own session limit page:
  `GET https://<region>.signin.aws.amazon.com/sessions/v1/list` and
  `GET https://<region>.signin.aws.amazon.com/sessions/<id>/v1/logout`.
  These two are **undocumented** and may change. If they do, the badge disappears and the launcher says the sessions can't be read; it never shows a stale count.
- **`history`** (optional, asked only when you click **Find it in my browsing history**): reads your history once to suggest your portal prefix and sign-in region. Nothing is stored or sent anywhere. You can revoke it from the extension's details page.
- **`storage`, `alarms`**: your two settings (synced with your browser profile), a local cache of your account list, and a once-a-minute refresh of the session count.

## Privacy

The extension has no server, analytics or tracking. It only talks to AWS, with your existing browser session. It stores your portal prefix, region and the list of your accounts and permission sets (names, IDs, emails) in your browser.

## Development

There is no build step: edit the files and click the reload button on the extension card.

```bash
npm test
```

runs the unit tests for the session and search logic (Node 20+, no dependencies).

## Disclaimer

Not affiliated with, endorsed by or supported by Amazon Web Services. "AWS" and "AWS IAM Identity Center" are trademarks of Amazon.com, Inc. or its affiliates.

## License

[MIT](LICENSE)
