const workspace = document.querySelector('.workspace');
const original = workspace.innerHTML;
const concepts = {
 dock: { description: 'A compact session dock on the left, with terminals as separate cards on a spacious canvas. More breathing room and clear pane boundaries; session names live on the cards.', tag: 'COMPACT DOCK / INSET CARDS' },
 ribbon: { description: 'Sessions become browser-like tabs. The sidebar disappears and terminals run edge to edge, with a thin divider and almost no framing. The most compact, terminal-first direction.', tag: 'TOP TABS / EDGE TO EDGE' },
 index: { description: 'A text-led session index with numbered rows and project shortcuts. A larger primary terminal sits above a smaller secondary pane. Quiet hierarchy with very little box decoration.', tag: 'TEXT INDEX / STACKED WORKSPACE' },
};
function selectDesign(key) {
 workspace.innerHTML = original;
 document.querySelector('.app').dataset.layout = key;
 document.querySelector('#description').textContent = concepts[key].description;
 document.querySelector('#direction-tag').textContent = concepts[key].tag;
 document.querySelectorAll('.choice').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.design === key)));
 const sidebar = workspace.querySelector('.sidebar');
 const panes = workspace.querySelector('.panes');
 const secondary = panes.querySelectorAll('.terminal p');
 // Keep short utility panes readable in the stacked concept.
 panes.querySelectorAll('.pane:last-child .terminal p').forEach((p, i) => { if (i === 1 || i === 3) p.classList.add('secondary-detail'); });
 if (key === 'dock') {
  sidebar.innerHTML = '<button class="dock-item active" title="Switchboard">01<span class="dot green"></span></button><button class="dock-item" title="Portfolio">02<span class="dot"></span></button><button class="dock-item" title="Scratchpad">03<span class="dot gray"></span></button><span style="color:var(--line)">—</span><span class="dock-item" style="display:grid;place-items:center">+</span><span class="dock-item bottom" title="Projects">▤</span>';
  const canvas = document.createElement('div'); canvas.className = 'dock-canvas';
  canvas.innerHTML = '<div class="workspace-header"><div><h2>Your workspace</h2><p>3 sessions &nbsp; / &nbsp; 1 working, 1 waiting</p></div><div class="tools"><span class="preview-control">Split view ⊞</span><span class="preview-control">+ New session</span></div></div>';
  canvas.append(panes); canvas.insertAdjacentHTML('beforeend','<div class="dock-caption"><span>Switchboard &nbsp; / &nbsp; PowerShell</span><span>Drag cards to rearrange</span></div>'); workspace.append(canvas);
 }
 if (key === 'ribbon') {
  sidebar.remove();
  workspace.insertAdjacentHTML('afterbegin','<nav class="ribbon-tabs" aria-label="Sessions"><button class="session-tab active"><span class="dot green"></span>Switchboard<small>01</small></button><button class="session-tab"><span class="dot"></span>Portfolio<small>02</small></button><button class="session-tab"><span class="dot gray"></span>Scratchpad<small>03</small></button><span class="ribbon-add">+</span><span class="ribbon-projects">Projects⌄ &nbsp; ⊞</span></nav>');
 }
 if (key === 'index') {
  const projects = sidebar.querySelector('.projects').outerHTML;
  sidebar.innerHTML = '<h2 class="index-title">Sessions</h2><div class="index-summary">03 open &nbsp; · &nbsp; 01 working</div><div class="section-label">In this workspace</div><div><button class="index-row active"><span class="index-number">01</span><div><div class="session-name">Switchboard</div><div class="session-meta">Codex · gpt-5<br>Working</div></div><span class="dot green"></span></button><button class="index-row"><span class="index-number">02</span><div><div class="session-name">Portfolio</div><div class="session-meta">Claude · Sonnet<br>Waiting for you</div></div><span class="dot"></span></button><button class="index-row"><span class="index-number">03</span><div><div class="session-name">Scratchpad</div><div class="session-meta">PowerShell</div></div></button></div><div class="index-new">+ &nbsp;New session</div><div class="sidebar-spacer"></div>'+projects+'<div class="new">Ctrl ⇧ T &nbsp; New session</div>';
  const content = document.createElement('div'); content.className = 'index-main';
  content.innerHTML = '<div class="index-toolbar">Switchboard <small>/ Codex</small><span class="right">Split ↓ &nbsp; ···</span></div>'; content.append(panes); workspace.append(content);
 }
 workspace.querySelectorAll('.dock-item,.session-tab,.index-row').forEach(b => {if(b.tagName === 'BUTTON') b.addEventListener('click',()=>{b.parentElement.querySelectorAll('.active').forEach(el=>el.classList.remove('active'));b.classList.add('active')})});
}
document.querySelectorAll('.choice').forEach((b,i)=>{const key=['dock','ribbon','index'][i];b.dataset.design=key;b.innerHTML='<small>0'+(i+1)+'</small>'+key[0].toUpperCase()+key.slice(1);b.addEventListener('click',()=>selectDesign(key))});
document.querySelector('.review h1').textContent = 'Three ways to shape the workspace.';
document.querySelector('.review-top p').textContent = 'Same palette. Different navigation, hierarchy, and terminal arrangement.';
document.querySelector('#icon-title').textContent = 'Icon direction: the terminal, reduced.';
document.querySelector('#icon-description').textContent = 'A framed ›_ prompt. Shared across all three concepts.';
document.querySelectorAll('.logo use,.icon-tile use').forEach(el=>el.setAttribute('href','#terminal-frame'));
selectDesign('dock');
