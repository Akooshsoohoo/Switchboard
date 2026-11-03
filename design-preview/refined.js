const app = document.querySelector('.app');
const settings = document.querySelector('#settings');
const settingsToggle = document.querySelector('#settings-toggle');
document.querySelectorAll('.session-icon,.new-session-label,.toolbar-divider').forEach(el=>el.remove());
let terminalNumber = 0;
const sessions = {
 switchboard: {name:'Switchboard',agent:'Codex',state:'working',label:'Working',path:'~\\Switchboard',content:'<div class="agent-heading">OpenAI Codex<small>gpt-5</small></div><div class="agent-path">~\\Switchboard</div><p><span class="terminal-prompt">›</span>Refine the interface. Keep it minimal.</p><p class="terminal-muted">I’ll update the spacing and session controls,<br>keeping the terminal at the center of the workspace.</p><p class="terminal-code">Updating the workspace styles…</p><div class="file-line"><span class="terminal-code">M</span>style.css<span>+42 −18</span></div><div class="file-line"><span class="terminal-code">M</span>index.html<span>+8 −4</span></div><div class="input-line"><span class="terminal-prompt">›</span><span class="cursor"></span></div>'},
 portfolio: {name:'Portfolio',agent:'Claude Code',state:'waiting',label:'Waiting for you',path:'~\\AkashPortfolio',content:'<div class="agent-heading">Claude Code<small>Sonnet</small></div><div class="agent-path">~\\AkashPortfolio</div><p><span class="terminal-prompt">›</span>Check the latest changes.</p><p class="terminal-muted">The build passed. The layout changes are ready for review.</p><p class="terminal-code">✓ Build completed<br>✓ No issues found</p><p class="terminal-muted">Ready for your next message.</p><div class="input-line"><span class="terminal-prompt">›</span><span class="cursor"></span></div>'},
 everything: {name:'EverythingApp',agent:'Claude Code',state:'approval',label:'Approval needed',path:'~\\EverythingApp',content:'<div class="agent-heading">Claude Code<small>Sonnet</small></div><div class="agent-path">~\\EverythingApp</div><p><span class="terminal-prompt">›</span>Verify the changes.</p><p class="terminal-muted">The agent is paused until you approve this action.</p><div class="approval-card"><strong>Allow this command?</strong><code class="approval-command">npm run build</code><span class="approval-option">› 1. Yes, allow once</span><span class="approval-option">&nbsp; 2. No</span></div><p class="terminal-muted">Sample approval prompt · This preview runs no commands.</p>'},
};
function selectSession(key){const s=sessions[key];document.querySelector('#current-name').textContent=s.name;document.querySelector('#current-agent').textContent=s.agent;document.querySelector('#primary-terminal').innerHTML=s.content;document.querySelector('#primary-state').textContent=s.label;document.querySelector('#primary-path').textContent=s.path;document.querySelector('#primary-dot').className='dot '+s.state;document.querySelectorAll('[data-session]').forEach(b=>{const selected=b.dataset.session===key;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected))});document.querySelector('.pane.secondary').hidden=key==='portfolio';document.querySelector('.pane.secondary').style.display=key==='portfolio'?'none':''}
function toggleSettings(open){settings.hidden=!open;settingsToggle.setAttribute('aria-expanded',String(open));if(open)settings.querySelector('[aria-pressed="true"]').focus();else settingsToggle.focus()}
function setAppearance(mode){app.dataset.appearance=mode;document.querySelectorAll('.appearance-options button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.appearance===mode)));try{localStorage.setItem('switchboard-preview-appearance',mode)}catch{}}
settingsToggle.addEventListener('click',()=>toggleSettings(settings.hidden));
document.querySelector('#settings-close').addEventListener('click',()=>toggleSettings(false));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!settings.hidden)toggleSettings(false)});
document.addEventListener('pointerdown',e=>{if(!settings.hidden&&!settings.contains(e.target)&&!settingsToggle.contains(e.target)){settings.hidden=true;settingsToggle.setAttribute('aria-expanded','false')}});
document.querySelectorAll('.appearance-options button').forEach(b=>b.addEventListener('click',()=>setAppearance(b.dataset.appearance)));
document.querySelector('.session-list').addEventListener('click',e=>{const b=e.target.closest('[data-session]');if(b)selectSession(b.dataset.session)});
function newTerminal(){
 const number=++terminalNumber,key='terminal-'+number,name='Terminal '+number;
 sessions[key]={name,agent:'PowerShell',state:'waiting',label:'Waiting for you',path:'~',content:'<p class="terminal-muted">Windows PowerShell</p><p>PS ~&gt; <span class="cursor"></span></p><p class="terminal-muted">Preview terminal · No shell process is running.</p>'};
 const row=document.createElement('button');row.className='session';row.dataset.session=key;row.setAttribute('aria-pressed','false');row.innerHTML='<span class="session-copy"><span class="session-name">'+name+'</span><span class="session-meta">PowerShell</span></span><span class="dot waiting" role="img" aria-label="Waiting for you" title="Waiting for you"></span>';
 document.querySelector('.session-list').append(row);document.querySelector('#session-count').textContent=Object.keys(sessions).length+' sessions';selectSession(key);
}
document.querySelector('#new-terminal').addEventListener('click',newTerminal);
document.addEventListener('keydown',e=>{if(e.ctrlKey&&e.shiftKey&&e.key.toLowerCase()==='t'){e.preventDefault();newTerminal()}});
document.querySelector('#split-toggle').addEventListener('click',()=>document.querySelector('.panes').classList.toggle('side-by-side'));
document.querySelector('#sidebar-toggle').addEventListener('click',()=>{app.classList.add('sidebar-collapsed');document.querySelector('.expand-sidebar').focus()});
document.querySelector('.expand-sidebar').addEventListener('click',()=>{app.classList.remove('sidebar-collapsed');document.querySelector('#sidebar-toggle').focus()});
try{setAppearance(localStorage.getItem('switchboard-preview-appearance')==='dark'?'dark':'light')}catch{setAppearance('light')}
selectSession('switchboard');
