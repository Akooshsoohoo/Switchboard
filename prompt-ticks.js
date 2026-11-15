(function (root) {
  // Mark where the user's submitted prompts sit in a terminal's scrollback, as ticks on xterm's
  // overview ruler (beside the scrollbar). Prompts are recognised by text: Claude Code echoes them
  // at column 0 as "> text" or "❯ text". The live input box is framed ("│ > ") and lives in the
  // bottom rows, so it is never matched.
  const PROMPT_RE = /^[>❯] \S/;
  const LIVE_ROWS = 6; // bottom rows that may still be the input area being redrawn

  function isPromptLine(text) { return PROMPT_RE.test(text); }

  // Attach to a Terminal (created with overviewRulerWidth). Returns a disposer.
  function attach(term, color, onFirstMark) {
    const marks = new Set(); // absolute line numbers already marked
    let scanned = null;      // marker for the first line not yet scanned
    let timer = 0;

    function scan() {
      timer = 0;
      const buf = term.buffer.active;
      if (buf.type !== 'normal') return;
      const end = buf.baseY + term.rows - LIVE_ROWS;
      const start = scanned && !scanned.isDisposed ? scanned.line : 0;
      for (let y = Math.max(0, start); y < end; y++) {
        const line = buf.getLine(y);
        if (!line || line.isWrapped || !isPromptLine(line.translateToString(true))) continue;
        if (marks.has(y)) continue;
        const marker = term.registerMarker(y - (buf.baseY + buf.cursorY));
        if (!marker) continue;
        marks.add(y);
        marker.onDispose(() => marks.delete(marker.line));
        term.registerDecoration({ marker, overviewRulerOptions: { color, position: 'full' } });
      }
      scanned?.dispose();
      scanned = term.registerMarker(end - (buf.baseY + buf.cursorY));
    }

    const sub = term.onWriteParsed(() => { clearTimeout(timer); timer = setTimeout(scan, 250); });
    return () => { sub.dispose(); clearTimeout(timer); scanned?.dispose(); };
  }

  const api = { isPromptLine, attach, LIVE_ROWS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SwitchboardPromptTicks = api;
})(globalThis);
