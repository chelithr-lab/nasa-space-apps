const $ = id => document.getElementById(id);
const esc = value => String(value??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaultMission = missions.find(m=>m.name==='Blue Ghost 1');
const fromHash = () => missions.find(m=>m.id===location.hash.slice(1));
let selected = fromHash() ?? defaultMission;
let era = 'All';
let tab = 'overview';
let visible = [];
let animation;
let displayedMission;
function setView(showMap){
  $('globe-panel').hidden=!showMap;
  $('flight-panel').hidden=showMap;
  $('globe-view').setAttribute('aria-pressed',showMap);
  $('flight-view').setAttribute('aria-pressed',!showMap);
}
$('globe-view').onclick=()=>setView(true);
$('flight-view').onclick=()=>setView(false);
$('total').textContent = missions.length;
$('clps-total').textContent = missions.filter(m=>m.clps).length;
for(const decade of new Set(missions.map(m=>Math.floor(m.year/10)*10))) $('decade').add(new Option(decade+'s',decade));
const labels = {All:'All phases',Past:'Past missions',Active:'Active missions',Future:'Future missions'};
function renderList(){
  const query=$('search').value.trim().toLowerCase();
  const decade=Number($('decade').value);
  visible=missions.filter(m=>(era==='All'||m.era===era)&&(!$('clps').checked||m.clps)&&(!decade||Math.floor(m.year/10)*10===decade)&&[m.name,m.subtitle,m.org,m.operator,m.type,m.site,...(m.payloads??[]).flat()].join(' ').toLowerCase().includes(query));
  if(visible.length&&!visible.includes(selected)) selected=visible[0];
  const button=(m,timeline)=>'<button data-id="'+m.id+'" data-era="'+m.era+'" aria-current="'+(m===selected)+'"><small>'+esc(timeline?m.date:m.year)+'</small><strong>'+esc(m.name)+'</strong></button>';
  $('list').innerHTML=visible.length?visible.map(m=>button(m,false)).join(''):'<div class="empty">No matches. Try a different search or filter.</div>';
  $('track').innerHTML=visible.map(m=>button(m,true)).join('');
  $('count').textContent=visible.length+' / '+missions.length+' MISSIONS · '+labels[era].toUpperCase();
  const index=visible.indexOf(selected);
  $('previous').disabled=index<=0;
  $('next').disabled=index<0||index>=visible.length-1;
}
function focusInScroller(container){
  const item=container.querySelector('[aria-current="true"]');
  if(!item)return;
  const a=item.getBoundingClientRect(),b=container.getBoundingClientRect();
  if(container===$('track')){
    if(a.left<b.left||a.right>b.right) container.scrollLeft+=a.left-b.left-12;
  }else if(a.top<b.top||a.bottom>b.bottom) container.scrollTop+=a.top-b.top-18;
}
const templates={
  landing:{path:'M98 276 C165 264 165 126 314 86 C480 42 512 185 435 216 L388 228',steps:['Launch','Lunar transfer','Lunar orbit','Powered descent','Surface'],point:[388,228]},
  rover:{path:'M98 276 C165 264 165 126 314 86 C480 42 512 185 435 216 L388 228 L365 241',steps:['Launch','Lunar transfer','Descent','Surface deployment'],point:[365,241]},
  orbit:{path:'M98 276 C165 264 165 126 314 86 C465 36 530 148 461 221 C399 295 294 234 311 143 C326 68 451 58 486 130',steps:['Launch','Lunar transfer','Orbit insertion','Orbital operations'],point:[486,130]},
  flyby:{path:'M98 276 C165 264 165 126 314 86 C478 42 560 149 488 253 C411 363 224 328 98 276',steps:['Launch','Lunar transfer','Lunar flyby'],point:[488,253]},
  impact:{path:'M98 276 C152 258 188 135 307 108 Q369 117 392 193',steps:['Launch','Lunar transfer','Impact'],point:[392,193]},
  return:{path:'M98 276 C165 264 165 126 314 86 C470 44 520 178 431 218 L388 228 Q450 180 472 235 C414 352 196 334 98 276',steps:['Launch','Lunar transfer','Descent','Surface operations','Ascent and Earth return'],point:[388,228]},
  earth:{path:'M98 276 C-5 190 145 130 192 208 C233 288 145 331 98 276',steps:['Launch','Earth orbit','Rendezvous and docking','Earth return'],point:[192,208]}
};
function routeFor(m){
  if(m.type==='Earth orbit test') return templates.earth;
  if(m.type==='Flyby') return m.returning?{...templates.flyby,steps:[...templates.flyby.steps,'Earth return']}:{...templates.flyby,path:'M98 276 C165 264 165 126 314 86 C478 42 560 149 488 253 Q454 301 420 317'};
  if(m.type==='Impact') return templates.impact;
  if(/sample return|crewed landing/i.test(m.type)) return templates.return;
  if(/rover|hopper/i.test(m.type)) return templates.rover;
  if(/lander/i.test(m.type)) return templates.landing;
  return m.returning?{...templates.orbit,steps:[...templates.orbit.steps,'Earth return'],path:templates.orbit.path+' C532 265 248 360 98 276'}:templates.orbit;
}
function drawRoute(m){
  const r=routeFor(m);
  const planned=m.era==='Future'||/unsuccessful|failed/i.test(m.outcome);
  $('route-mode').textContent=planned?'PLANNED PROFILE':'ILLUSTRATIVE PROFILE';
  $('steps').innerHTML=r.steps.map(s=>'<li>'+esc(s)+'</li>').join('');
  $('trajectory').innerHTML='<defs><radialGradient id="earth"><stop stop-color="#668caa"/><stop offset="1" stop-color="#1b2a42"/></radialGradient></defs><g fill="none" stroke="#a4a9b333"><path d="M58 276h80m-40-40v80"/><circle cx="98" cy="276" r="36"/></g><circle cx="98" cy="276" r="19" fill="url(#earth)" stroke="#8fa2be" stroke-width=".7"/><path id="route-line" d="'+r.path+'" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="'+(planned?'5 5':'0')+'" opacity=".9"/><circle cx="'+r.point[0]+'" cy="'+r.point[1]+'" r="11" fill="none" stroke="var(--accent)" stroke-opacity=".45"/><circle cx="'+r.point[0]+'" cy="'+r.point[1]+'" r="3" fill="var(--accent)"/><circle id="craft" r="4" fill="#e4f5ff" visibility="hidden"/><g fill="#d0d3dc" font-size="10" font-family="monospace" letter-spacing="1"><text x="75" y="320">EARTH</text><text x="493" y="320">MOON</text></g>';
}
function renderTab(){
  for(const b of $('tabs').querySelectorAll('button')) b.setAttribute('aria-pressed',b.dataset.tab===tab);
  const m=selected;
  if(tab==='payloads'){
    $('tab-content').innerHTML=m.payloads?.length?'<p class="mono subtle">'+m.payloads.length+' INDEXED PAYLOADS / SUITES</p>'+m.payloads.map(([name,role],i)=>'<details class="payload" '+(i===0?'open':'')+'><summary>'+esc(name)+'</summary><p>'+esc(role)+'</p></details>').join(''):'<p>Individual payloads are pending catalog entry. See Sources for mission records.</p>';
  }else if(tab==='sources'){
    $('tab-content').innerHTML='<p><a href="'+esc(m.source)+'" target="_blank" rel="noopener">Open mission reference ↗</a></p>'+(surfaceSites[m.name]?'<p><a href="'+coordinateArchive+'" target="_blank" rel="noopener">NASA surface coordinates ↗</a></p>':'')+(m.clps?'<p><a href="'+clps+'" target="_blank" rel="noopener">NASA CLPS delivery catalog ↗</a></p>':'')+(m.era==='Future'?'<p>Planned windows and payload manifests are subject to change.</p>':'');
  }else{
    const rows=[[m.era==='Future'?'Target':'Launch',m.date],['Arrival',m.arrival==='N/A'?null:m.arrival],['Operator',m.operator||m.org],['Launch vehicle',m.rocket],['Destination',m.site],['Outcome',m.outcome],['CLPS order',m.order]];
    $('tab-content').innerHTML='<p>'+esc(m.purpose||'See the mission archive for objectives and spacecraft details.')+'</p><dl>'+rows.filter(([,value])=>value).map(([key,value])=>'<div><dt>'+esc(key)+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl>';
  }
}
function render(updateHash=false){
  cancelAnimationFrame(animation);
  $('replay').textContent='▷ Play route';
  renderList();
  if(updateHash&&visible.length) history.replaceState(null,'','#'+selected.id);
  focusInScroller($('list'));focusInScroller($('track'));
  const m=selected;
  $('flight-type').textContent=m.type.toUpperCase();
  $('destination').textContent=m.site||m.type;
  $('brief').innerHTML='<h2>'+esc(m.name)+'</h2><span class="badge '+(m.era==='Active'?'active':'')+'">'+(m.clps?'CLPS / ':'')+esc(m.watch?'WATCHLIST':m.era.toUpperCase())+'</span><div class="brief-meta">'+esc(m.subtitle||m.org+' · '+m.type)+'</div>';
  if(displayedMission!==m){
    showGlobeMission(m);
    showSpacecraft(m);
    displayedMission=m;
  }
  drawRoute(m);
  renderTab();
}
for(const id of ['list','track']) $(id).addEventListener('click',e=>{
  const button=e.target.closest('[data-id]');
  if(!button)return;
  selected=visible.find(m=>m.id===button.dataset.id);
  tab='overview';render(true);
  $(id).querySelector('[aria-current="true"]')?.focus({preventScroll:true});
});
$('eras').addEventListener('click',e=>{
  if(!e.target.dataset.era)return;
  era=e.target.dataset.era;
  for(const b of $('eras').querySelectorAll('button'))b.setAttribute('aria-pressed',b.dataset.era===era);
  render(true);
});
$('search').addEventListener('input',()=>render(true));
$('clps').addEventListener('change',()=>render(true));
$('decade').addEventListener('change',()=>render(true));
$('tabs').addEventListener('click',e=>{if(e.target.dataset.tab){tab=e.target.dataset.tab;renderTab();}});
for(const [id,delta] of [['previous',-1],['next',1]]) $(id).onclick=()=>{
  const m=visible[visible.indexOf(selected)+delta];
  if(m){selected=m;tab='overview';render(true);}
};
$('about').onclick=()=>$('info').showModal();
$('replay').onclick=()=>{
  cancelAnimationFrame(animation);
  const path=$('route-line'),craft=$('craft'),length=path.getTotalLength(),start=performance.now();
  const steps=[...$('steps').children];
  const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:3200;
  craft.setAttribute('visibility','visible');
  function frame(now){
    const progress=duration?Math.min(1,(now-start)/duration):1;
    const point=path.getPointAtLength(length*progress);
    craft.setAttribute('cx',point.x);craft.setAttribute('cy',point.y);
    steps.forEach((step,i)=>step.classList.toggle('active',i===Math.min(steps.length-1,Math.floor(progress*steps.length))));
    $('replay').textContent=progress<1?'↻ Restart route':'↻ Replay route';
    if(progress<1)animation=requestAnimationFrame(frame);
  }
  animation=requestAnimationFrame(frame);
};
window.addEventListener('hashchange',()=>{const m=fromHash();if(m){selected=m;render();}});
render();
