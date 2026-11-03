(function (root) {
  // Match permission questions, never ordinary idle time or a generic question.
  // Keep this independent of any particular CLI version's layout or ANSI colors.
  function stripControl(text) {
    return text.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/\x1b[@-_]/g, '').replace(/\r/g, '\n');
  }
  function isApprovalPrompt(text) {
    const tail = stripControl(text).slice(-2400);
    return /(?:^|\n)\s*(?:[│┃>›❯╭╰─\s]*)?(?:do you want to (?:proceed|allow|run|execute)|would you like to (?:run|allow|execute)|allow (?:this|these|the following)|approve (?:this|these|the following))[^\n]{0,200}\?/im.test(tail)
      || /(?:^|\n)\s*(?:[│┃>›❯\s]*)?(?:approval (?:required|needed)|permission (?:required|needed)|(?:waiting|awaiting) (?:for )?(?:your |user )?approval)\s*[:.!]?\s*$/im.test(tail)
      || /(?:^|\n)[^\n]{0,30}(?:requires your approval|needs your permission to continue)[.!]?\s*$/im.test(tail);
  }
  function statusClass(s) {
    return s.exited ? 'exited' : s.approval ? 'approval' : s.working ? 'working' : 'waiting';
  }
  function statusText(s) {
    return { exited: 'Exited', approval: 'Approval needed', working: 'Working', waiting: 'Waiting for you' }[statusClass(s)];
  }
  const api = { stripControl, isApprovalPrompt, statusClass, statusText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SwitchboardStatus = api;
})(globalThis);
