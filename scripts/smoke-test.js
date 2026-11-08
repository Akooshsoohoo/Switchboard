// Real Electron renderer/xterm integration with isolated storage and stubbed shells.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboard-smoke-'));
app.setPath('userData', profile);
let win;
const created = [];
ipcMain.handle('projects:list', () => []);
let nextSessionId = 1;
ipcMain.on('session:newId', (e) => { e.returnValue = nextSessionId++; });
ipcMain.on('pty:create', (_e, id) => created.push(id));
ipcMain.on('pty:resize', () => {});
ipcMain.on('preferences:appearance', () => {});
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function run(code) { return win.webContents.executeJavaScript(code); }
app.whenReady().then(async () => {
  try {
    win = new BrowserWindow({ show: false, width: 1200, height: 800, webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), backgroundThrottling: false } });
    const errors = [];
    win.webContents.on('console-message', (_e, level, message) => { if (level === 3) errors.push(message); });
    await win.loadFile(path.join(__dirname, '..', 'index.html'));
    await wait(300);
    assert.equal(await run('sessions.size'), 1);
    await run(`
      draggedId = 1;
      const rect = document.querySelector('.pane').getBoundingClientRect();
      document.querySelector('.pane').dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true,
        clientX: rect.left + 5, clientY: rect.top + rect.height / 2, dataTransfer: new DataTransfer() }));
    `);
    assert.equal(await run('dropTarget.edge'), 'left');
    await run("mainEl.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true }))");
    assert.equal(await run("document.querySelectorAll('.empty-pane').length"), 1);
    assert.equal(await run('panes.length'), 1);
    const snapped = await run("({pane:document.querySelector('.pane').getBoundingClientRect().width, blank:document.querySelector('.empty-pane').getBoundingClientRect().width})");
    assert.ok(Math.abs(snapped.pane - snapped.blank) < 2);
    await run("placeSession(1, null, 'center'); removePane(0); showInFocused(1)");

    assert.equal(await run("document.documentElement.dataset.appearance"), 'light');
    assert.equal(await run("document.querySelectorAll('.row .session-icon').length"), 0);
    await run("document.getElementById('settings-toggle').click()");
    assert.equal(await run("document.getElementById('settings').hidden"), false);
    await run("document.querySelector('button[data-appearance=dark]').click()");
    assert.equal(await run('sessions.get(1).term.options.theme.background'), '#202123');
    await run("setSessionTint(1, TINTS[1]); setAppearance('light')");
    assert.equal(await run('sessions.get(1).term.options.theme.background'), '#e0ecfb');
    await run("setSessionTint(1, TINTS[0]); document.getElementById('new-session').click()");
    assert.equal(await run('sessions.size'), 2);
    await run('addPane(1)');
    assert.equal(await run('layout.axis'), 'y');
    win.webContents.send('pty:data', 1, 'Do you want to proceed?\r\n  1. Yes\r\n  2. No');
    await wait(650);
    assert.equal(await run('statusClass(sessions.get(1))'), 'approval');
    assert.equal(await run("document.querySelector('.row[data-id=\"1\"] .status').textContent"), 'Approval needed');
    await run("sessions.get(1).term.input('\\r')");
    assert.equal(await run('sessions.get(1).approval'), false);
    await run("setAppearance('dark')");
    nextSessionId = 1; // a reload restarts the page, and the stubbed id counter with it
    await win.reload();
    await wait(500);
    assert.equal(await run('appearance'), 'dark');
    assert.equal(await run('sessions.get(1).term.options.theme.background'), '#202123');
    const overflow = await run("({page:document.documentElement.scrollWidth > innerWidth, pane:document.querySelector('.pane').getBoundingClientRect().width, rows:document.querySelector('.xterm').clientHeight})");
    assert.equal(overflow.page, false);
    assert.ok(overflow.pane > 500 && overflow.rows > 100);
    await run("renameSession(1, 'Switchboard'); showInFocused(createSession({name:'Portfolio'}).id); addPane(1); createSession({name:'EverythingApp'}); setAppearance('light')");
    win.webContents.send('pty:data', 1, '\x1b[1mOpenAI Codex\x1b[0m\r\nmodel: gpt-5\r\n\r\n› Refine the interface. Keep it minimal.\r\n\r\nUpdating the workspace styles...\r\n\r\n  M  style.css\r\n  M  index.html\r\n');
    win.webContents.send('pty:data', 2, 'Claude Code\r\n\r\nThe build passed. Ready for your next message.\r\n\r\n› ');
    win.webContents.send('pty:data', 3, 'Do you want to proceed?\r\n  1. Yes\r\n  2. No');
    await wait(1700);
    await run('renderSidebar()');
    const newButton = await run("(() => { const el=document.getElementById('new-session'), r=el.getBoundingClientRect(); return {visible:r.height>20&&r.bottom<innerHeight,label:el.textContent.includes('New terminal')}; })()");
    assert.deepEqual(newButton, {visible:true,label:true});
    assert.equal(await run("document.querySelector('.row[data-id=\"3\"]').classList.contains('approval')"), true);
    await wait(250);
    fs.writeFileSync(path.join(profile, 'workspace.png'), (await win.webContents.capturePage(undefined, {stayHidden:true,stayAwake:true})).toPNG());
    await run("document.getElementById('settings-toggle').click()");
    await wait(250);
    fs.writeFileSync(path.join(profile, 'light.png'), (await win.webContents.capturePage(undefined, {stayHidden:true,stayAwake:true})).toPNG());
    await run("setAppearance('dark')");
    await wait(150);
    fs.writeFileSync(path.join(profile, 'dark.png'), (await win.webContents.capturePage(undefined, {stayHidden:true,stayAwake:true})).toPNG());
    assert.deepEqual(errors, []);
    console.log('Screenshots: ' + profile);
    console.log('PASS: real renderer, xterm, new terminals, stacked panes, theme persistence, tint switching, approval detection and response.');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
