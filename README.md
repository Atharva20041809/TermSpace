# Termspace

A minimal terminal dashboard for Google Workspace, built on top of [gogcli](https://github.com/openclaw/gogcli). Browse your unread Gmail, check today's calendar, and skim recent Drive files — all from a keyboard-driven menu in your terminal. Send an email or add a calendar event without ever opening a browser.

> Rename freely — swap "Termspace" for whatever you're calling the project.

## Why

Most Google Workspace access happens through a browser. This project explores what a fast, keyboard-only alternative looks like: a Node.js process that spawns [`gog`](https://github.com/openclaw/gogcli) as a child process, parses its JSON output, and renders an interactive list in raw terminal mode — no GUI, no mouse.

## Features

- **Command menu** — pick from Gmail, Calendar, or Drive on launch
- **Live results view** — runs the selected `gog` command and shows a loading state, then the results
- **Send an email** — from the Gmail results screen, compose and send a message (To / Subject / Body) without leaving the terminal
- **Add a calendar event** — from the Calendar results screen, create an event with a title, date, and start/end time
- **Full keyboard navigation** — arrows to move, Enter to select, Esc to go back, `q` to quit

## Keybindings

| Screen         | Key       | Action                          |
| -------------- | --------- | -------------------------------- |
| Menu           | ↑ / ↓     | Move selection                   |
| Menu           | Enter     | Run the selected command         |
| Results        | Esc       | Back to menu                     |
| Results        | `q`       | Quit                              |
| Gmail results  | `s`       | Compose and send an email        |
| Calendar results | `a`     | Add a calendar event             |
| Compose form   | Enter     | Confirm field / submit           |
| Compose form   | Esc       | Cancel and return to results     |

## Prerequisites

- [Node.js](https://nodejs.org/) (v16+)
- [`gog`](https://github.com/openclaw/gogcli) installed and authenticated:

  ```bash
  brew install openclaw/tap/gogcli
  gog auth credentials set ~/Downloads/client_secret_*.json
  gog auth add you@gmail.com --services gmail,calendar,drive
  export GOG_ACCOUNT=you@gmail.com
  ```

## Installation

```bash
git clone https://github.com/<your-username>/termspace.git
cd termspace
node index.js
```

No npm dependencies — the whole app is a single `index.js` using only Node's built-in `child_process` module to shell out to `gog`.

## Usage

```bash
node index.js
```

1. Use the arrow keys to pick **Gmail**, **Calendar**, or **Drive** and press Enter.
2. Watch the loading state while `gog` runs, then see the results.
3. On the Gmail screen, press `s` to compose and send a reply. On the Calendar screen, press `a` to add a new event.
4. Press Esc anytime to return to the menu, or `q` to quit.

## How it works

- `child_process.spawn("gog", [...])` runs each Google Workspace command and captures stdout as JSON.
- `process.stdin` is put into raw mode so individual keypresses (arrows, Enter, Esc, letters) can be handled directly, without waiting for a line of input.
- The screen is redrawn with ANSI escape codes (`\x1B[2J\x1B[H`) on every state change, giving a simple full-screen terminal UI without any external TUI library.
- A small state machine (`menu` → `results` → `compose`) tracks what's currently on screen and what input should do.

## Roadmap

- [ ] Scrollable/paginated results for large inboxes
- [ ] Read full email body / attachments inline
- [ ] Delete or archive from the Gmail results view
- [ ] Recurring event support
- [ ] Config file for default account / calendar

## Built with

- [Node.js](https://nodejs.org/)
- [gogcli](https://github.com/openclaw/gogcli) — Google Workspace CLI

## License

MIT
