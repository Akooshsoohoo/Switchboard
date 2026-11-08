# Switchboard

A minimal terminal workspace for running several agent CLIs (claude, codex, agy) side by side.

The Index interface uses system typography, a compact session sidebar, and a terminal-style app icon. **New terminal** sits below Projects. Open the **gear** at the bottom of the sidebar to choose a light or dark appearance; the choice is remembered, including for terminal colors and session tints.

Session dots show **green** while working, **yellow** while waiting for you, and **red** when a supported CLI approval prompt needs permission to continue. Approval detection recognizes explicit permission questions in terminal output; unknown prompt formats fall back to the activity-based working/waiting indicator. Answer approval prompts in the terminal. Exited sessions show gray.

- **Sidebar**: every session, by name, marked **working** (green), **waiting for you** (yellow), or **approval needed** (red).
  A session that finished while it was hidden shows in bold until you open it.
- **Panes**: drag sessions from the sidebar onto a pane's left, right, top, or bottom edge to split the screen. Mix horizontal and vertical splits, and drag the dividers to resize.
- **File panes**: open a text file (`.txt`, `.py`, anything under 2 MB) in a pane and edit it. Your edits never reach the real file. They autosave to a draft copy and a diff in Switchboard's data folder (`drafts`), so Claude Code or Codex can read them. **Send path** types the draft and diff locations into your terminal without pressing Enter. **Diff** shows what differs, **Reset** throws the edits away, and a banner appears if the original changes on disk.

Each session is a PowerShell that starts in the folder above this one.

## Run

```
npm install
npm start
```

### Pin to the taskbar

```
npm run shortcut
```

This adds **Switchboard** to the Start menu. Search for it, right-click it, and choose **Pin to taskbar**.

## Controls

| Action | How |
| --- | --- |
| New session | `+ New terminal` or Ctrl+Shift+T |
| Open a file as a draft | `+ Open file` or Ctrl+O (when no terminal has focus) |
| Zoom in / out / reset | Ctrl+Plus (or Ctrl+=) / Ctrl+Minus / Ctrl+0 |
| Minimize / expand sidebar | Click the arrow at the top of the sidebar; your choice is remembered across restarts |
| Show a session in the focused pane | Click it in the sidebar |
| Open a session as a new pane below the others | Ctrl+click it in the sidebar |
| Split left/right or above/below | Drag a sidebar session or pane title onto another pane's edge |
| Move or swap sessions | Drop on a pane's center to open a hidden session there or swap two visible sessions |
| Open another window | Ctrl+Shift+N |
| Move a session to another window | Drag its sidebar row or pane title into the other window: onto a pane (edge to split, center to open there) or into its sidebar. The shell keeps running. |
| Rename | Double-click the name (sidebar or pane title) |
| Close pane (session keeps running) | `×` on the pane title or Ctrl+Shift+W |
| Kill session | `×` on its sidebar row |
| Copy / paste | Ctrl+C with text selected / Ctrl+V |
| New line in a Claude prompt (no submit) | Shift+Enter |

## How "working" is detected

Agents redraw a spinner while they work, so a session that printed output in the last 1.5 s counts
as working. Output that comes straight after your own keystrokes or a resize is ignored, because
that is just echo and redraw.
