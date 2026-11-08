// Run with `npm run shortcut`. Adds Switchboard to the Start menu so it can be pinned to the taskbar,
// and registers it in Explorer: files get "Open with", folders get "Open in Switchboard".
const { app, shell } = require('electron');
const { execFileSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const icon = path.join(root, 'assets', 'switchboard-light.ico');

function reg(key, name, value) {
  const args = ['add', `HKCU\\Software\\Classes\\${key}`];
  args.push(name ? '/v' : '/ve');
  if (name) args.push(name);
  args.push('/d', value, '/f');
  execFileSync('reg.exe', args, { stdio: 'ignore' });
}

function registerExplorer() {
  const command = (arg) => `"${process.execPath}" "${root}" "${arg}"`;
  // Files: shows in the "Open with" list. Keyed by exe name, so it is shared by any electron.exe.
  const files = 'Applications\\electron.exe';
  reg(files, 'FriendlyAppName', 'Switchboard');
  reg(`${files}\\DefaultIcon`, null, icon);
  reg(`${files}\\shell\\open\\command`, null, command('%1'));
  // Folders have no "Open with", so they get a menu entry (on the folder, and on its empty background).
  for (const [key, arg] of [['Directory\\shell\\Switchboard', '%1'], ['Directory\\Background\\shell\\Switchboard', '%V']]) {
    reg(key, null, 'Open in Switchboard');
    reg(key, 'Icon', icon);
    reg(`${key}\\command`, null, command(arg));
  }
}

app.whenReady().then(() => {
  const link = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Switchboard.lnk');
  const ok = shell.writeShortcutLink(link, {
    target: process.execPath, // this project's electron.exe
    args: `"${root}"`,
    cwd: root,
    icon,
    iconIndex: 0,
    description: 'Named terminals side by side',
    appUserModelId: 'Switchboard', // matches app.setAppUserModelId in main.js
  });
  console.log(ok ? `Created ${link}` : 'Could not create the shortcut');
  try {
    registerExplorer();
    console.log('Registered Explorer "Open with" and folder menu');
  } catch (error) {
    console.log(`Could not register with Explorer: ${error.message}`);
  }
  app.quit();
});
