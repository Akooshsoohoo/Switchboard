(function (root) {
  // Pure helpers for pseudoedit: edits go to a draft copy, never to the original file.
  const MAX_BYTES = 2 * 1024 * 1024;

  function isBinary(text) {
    return text.includes('\u0000');
  }

  // FNV-1a, so the same path always maps to the same draft name without needing Node's crypto.
  function hash(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  function draftName(origPath) {
    const base = String(origPath).split(/[\\/]/).pop() || 'file';
    const safe = base.replace(/[^\w.\-]/g, '_').slice(0, 80);
    return `${hash(String(origPath).toLowerCase())}-${safe}`;
  }

  function splitLines(text) {
    if (text === '') return [];
    const lines = text.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    return lines;
  }

  // Edit script as [{op: ' '|'-'|'+', line}], trimming the shared head and tail first.
  function diffOps(a, b) {
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    let endA = a.length, endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
    const ops = [];
    for (let i = 0; i < start; i++) ops.push({ op: ' ', line: a[i] });
    const midA = a.slice(start, endA), midB = b.slice(start, endB);
    if (midA.length * midB.length > 4_000_000) {
      // Too big for a table: show the changed block as one removal and one addition.
      for (const line of midA) ops.push({ op: '-', line });
      for (const line of midB) ops.push({ op: '+', line });
    } else {
      const n = midA.length, m = midB.length;
      const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
      for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
          table[i][j] = midA[i] === midB[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
        }
      }
      let i = 0, j = 0;
      while (i < n && j < m) {
        if (midA[i] === midB[j]) { ops.push({ op: ' ', line: midA[i] }); i++; j++; }
        else if (table[i + 1][j] >= table[i][j + 1]) ops.push({ op: '-', line: midA[i++] });
        else ops.push({ op: '+', line: midB[j++] });
      }
      while (i < n) ops.push({ op: '-', line: midA[i++] });
      while (j < m) ops.push({ op: '+', line: midB[j++] });
    }
    for (let i = endA; i < a.length; i++) ops.push({ op: ' ', line: a[i] });
    return ops;
  }

  // Unified diff with 3 lines of context. Empty string when nothing changed.
  function unifiedDiff(orig, edited, name = 'file') {
    const ops = diffOps(splitLines(orig), splitLines(edited));
    if (!ops.some((o) => o.op !== ' ')) return '';
    const CONTEXT = 3;
    const keep = new Array(ops.length).fill(false);
    ops.forEach((o, idx) => {
      if (o.op === ' ') return;
      for (let k = Math.max(0, idx - CONTEXT); k <= Math.min(ops.length - 1, idx + CONTEXT); k++) keep[k] = true;
    });
    const out = [`--- ${name} (original)`, `+++ ${name} (draft)`];
    let oldLine = 1, newLine = 1, idx = 0;
    while (idx < ops.length) {
      if (!keep[idx]) {
        if (ops[idx].op !== '+') oldLine++;
        if (ops[idx].op !== '-') newLine++;
        idx++;
        continue;
      }
      const startOld = oldLine, startNew = newLine;
      const body = [];
      let oldCount = 0, newCount = 0;
      while (idx < ops.length && keep[idx]) {
        const { op, line } = ops[idx];
        body.push(op + line);
        if (op !== '+') { oldCount++; oldLine++; }
        if (op !== '-') { newCount++; newLine++; }
        idx++;
      }
      out.push(`@@ -${startOld},${oldCount} +${startNew},${newCount} @@`, ...body);
    }
    return out.join('\n') + '\n';
  }

  const api = { MAX_BYTES, isBinary, hash, draftName, unifiedDiff };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SwitchboardDraft = api;
})(globalThis);
