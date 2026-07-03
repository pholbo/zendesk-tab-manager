# Zendesk Tab Manager

A small Chrome extension that keeps Zendesk from cluttering your tab bar.

By default, most links to a Zendesk ticket or article open in a brand new
tab. This extension redirects those clicks to your existing Zendesk tab
instead, reusing it rather than creating a new one every time. If you
actually want a new tab, **middle-click** the link (or Ctrl/Cmd-click, or
Shift-click) and it opens normally — the extension only steps in for plain
left-clicks.

## How it works

- A content script listens for left-clicks on links. Middle-clicks fire a
  different browser event (`auxclick`, not `click`), so the extension never
  sees them and the browser's normal "open in a new tab" behavior happens
  untouched.
- When a plain left-click on a matching Zendesk link is detected, the
  extension cancels the default navigation and asks the background service
  worker to handle it.
- The background script looks for an existing open tab on that same Zendesk
  domain. If one exists, it navigates that tab and brings it to the front.
  If not, it opens a new tab — which then becomes the tab that gets reused
  next time.

## Installation (unpacked / developer mode)

This extension isn't published on the Chrome Web Store — you load it
directly from source:

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `zendesk-tab-manager` folder.
5. Click the extension's icon in the toolbar (or go to its **Details ->
   Extension options**) and enter your Zendesk domain(s), one per line, e.g.:
   ```
   yourcompany.zendesk.com
   ```
   You can also use a wildcard like `*.zendesk.com` to match any Zendesk
   subdomain.

## Notes

- The extension only acts on domains you explicitly configure — it does
  nothing until you add at least one domain in the options page.
- It won't hijack links while you're already browsing Zendesk itself, so
  normal in-app navigation isn't affected.

## License

[MIT](LICENSE)
