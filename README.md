# Switchboard

A barebones terminal for running several agent CLIs (claude, codex, agy) side by side.

- **Sidebar**: every session, by name, marked **working** (green, pulsing) or **waiting** (amber).
  A session that finished while it was hidden shows in bold until you open it.
- **Panes**: sessions shown side by side. Drag the dividers to resize.

Each session is a PowerShell that starts in the folder above this one.

## Run

```
npm install
npm start
```

## Controls

| Action | How |
| --- | --- |
| New session | `+ New` or Ctrl+Shift+T |
| Show a session in the focused pane | Click it in the sidebar |
| Open a session as a new pane beside the others | Ctrl+click it in the sidebar |
| Rename | Double-click the name (sidebar or pane title) |
| Close pane (session keeps running) | `×` on the pane title or Ctrl+Shift+W |
| Kill session | `×` on its sidebar row |
| Copy / paste | Ctrl+C with text selected / Ctrl+V |

## How "working" is detected

Agents redraw a spinner while they work, so a session that printed output in the last 1.5 s counts
as working. Output that comes straight after your own keystrokes or a resize is ignored, because
that is just echo and redraw.
