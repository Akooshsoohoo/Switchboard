(function (root) {
  const palettes = {
    light: { background: '#ffffff', foreground: '#35353b', cursor: '#55565d', cursorAccent: '#ffffff', selectionBackground: '#cdd9eb', black: '#35353b', red: '#b33b37', green: '#357443', yellow: '#89620c', blue: '#3766a1', magenta: '#86508f', cyan: '#32737b', white: '#73747b', brightBlack: '#85868e', brightRed: '#bb4640', brightGreen: '#3c8049', brightYellow: '#946c12', brightBlue: '#4277b5', brightMagenta: '#995ba2', brightCyan: '#3b838b', brightWhite: '#4d4e56' },
    dark: { background: '#202123', foreground: '#d7d7dc', cursor: '#d7d7dc', cursorAccent: '#202123', selectionBackground: '#454d60', black: '#37383c', red: '#e47970', green: '#81bb91', yellow: '#dcb96b', blue: '#8faede', magenta: '#c6a1d1', cyan: '#8abec4', white: '#d7d7dc', brightBlack: '#8c8e97', brightRed: '#f28d84', brightGreen: '#9bcea9', brightYellow: '#e7cc8b', brightBlue: '#abc5ee', brightMagenta: '#d8b7e0', brightCyan: '#a6d2d6', brightWhite: '#f2f2f5' },
  };
  const tints = {
    Blue: ['#e0ecfb', '#1d2d47'], Green: ['#dff1e5', '#1b3529'],
    Purple: ['#ede2f8', '#2e2649'], Rose: ['#fbe0ea', '#40232f'], Amber: ['#f8ebc9', '#40341c'],
  };
  function terminalTheme(mode, tint) {
    const theme = { ...palettes[mode === 'dark' ? 'dark' : 'light'] };
    if (tints[tint]) theme.background = tints[tint][mode === 'dark' ? 1 : 0];
    return theme;
  }
  const api = { terminalTheme };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SwitchboardAppearance = api;
})(globalThis);
