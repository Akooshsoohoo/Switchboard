// Run with `npm run shortcut`. Adds Switchboard to the Start menu so it can be pinned to the taskbar.
const { app, shell } = require('electron');
const path = require('path');

const root = path.resolve(__dirname, '..');

app.whenReady().then(() => {
  const link = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Switchboard.lnk');
  const ok = shell.writeShortcutLink(link, {
    target: process.execPath, // this project's electron.exe
    args: `"${root}"`,
    cwd: root,
    icon: path.join(root, 'assets', 'switchboard.ico'),
    iconIndex: 0,
    description: 'Named terminals side by side',
    appUserModelId: 'Switchboard', // matches app.setAppUserModelId in main.js
  });
  console.log(ok ? `Created ${link}` : 'Could not create the shortcut');
  app.quit();
});
