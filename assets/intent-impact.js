/* Source-first review tiles shared by every check on the Review page, plus the page outline.
   One tile design: breadcrumb (check › subject › file:line), name and status, the code (changed lines from
   the run's verified patch, or unchanged code carried in the projection), a trace ladder, and
   Intended / This PR. Intent concepts come from packet.intent_impact joined with intent_diff verdicts;
   improper-test findings come from that check's published findings. Nothing here judges. */
(function(){
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=p=>String(p||'').split('/').pop();
const slug=s=>'rt-'+String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
const STATUS={changed:['changed','Behavior changed'],preserved:['preserved','Preserved'],review:['review','Needs review'],gap:['gap','Analysis incomplete'],pending:['pending','Awaiting analysis'],
  weak:['changed','Weak test'],clear:['preserved','Test OK'],watch:['review','Would be a finding'],deleted:['changed','Test removed'],inconclusive:['gap','Analysis incomplete']};
const WEIGHT={enforced:['w-enforced','Enforced · blocks'],advisory:['w-advisory','Advisory review'],watch:['w-watch','Watch-only'],proposed:['w-proposed','Proposed policy change'],complete:['w-complete','No finding']};
const LADDER={rule:'Rule',collection:'Standards collection',enforcement:'Enforcement',line:'Changed line',removed:'Removed lines',method:'Method',test:'Test',covers:'Covers',concept:'Concept',reason:'Reason',service:'Reaches',lands:'Lands in · unchanged'};

/* ---------- shared tile ---------- */
function ladder(steps){
  return `<ol class="ii-ladder" aria-label="Trace from changed code to impact">${[...steps].reverse().map(([k,v])=>`<li class="ii-step-${k}"><span class="lk">${LADDER[k]}</span><span class="lv">${e(v)}</span></li>`).join('')}</ol>`;
}
function unchangedCode(a){
  if(!a)return '';
  const rows=a.lines.map((text,i)=>{const n=a.start+i;return `<div class="ii-dl${n===a.anchor?' lands':''}"><span class="n">${n}</span><span class="m"></span><span class="t">${e(text)||' '}</span></div>`;}).join('');
  return `<div class="ii-affected-source"><p class="ii-ah"><b>Affected here</b> · unchanged${a.label?` · <strong>${e(a.label)}</strong>`:''} · <code>${e(short(a.file))}${a.anchor!=null?`:${e(a.anchor)}`:''}</code></p><div class="ii-code ii-affected" role="region" aria-label="Unchanged code in ${e(short(a.file))}">${rows}</div></div>`;
}
function tile(t){
  const [cls,label]=STATUS[t.status]||STATUS.pending;
  const code=t.code?`<p class="ii-ah"><b>Changed here</b> · this PR · <code>${e(short(t.code.file))}</code></p><div class="ii-code ii-changed" data-file="${e(t.code.file)}" data-mode="${e(t.code.mode)}" data-line="${e(t.code.line??'')}" data-region="${e(t.code.region||'')}" data-method="${e(t.code.method||'')}"><p class="note">Loading the changed lines…</p></div>`:'';
  const body=t.custom?`<div class="ii-grid one">${t.custom}</div>`:code||t.affected?`<div class="ii-grid"><div class="ii-src">${code}${unchangedCode(t.affected)}</div>${ladder(t.steps)}</div>`:'';
  return `<article class="ii-tile ${cls}" id="${e(t.id)}" data-outline-name="${e(t.name)}" data-outline-status="${cls}">
<nav class="ii-crumbs" aria-label="Location">${t.crumbs.map(e).join('<span aria-hidden="true"> › </span>')}</nav>
<header><span class="ii-cname">${e(t.name)}</span>${t.badge?`<span class="ii-badge">${e(t.badge)}</span>`:''}<span class="ii-status ${cls}">${e(t.label||label)}</span>${t.conf?`<span class="ii-conf">confidence ${e(t.conf)}</span>`:''}</header>
${body}<dl class="ii-io">${t.io.map(([k,v])=>`<dt>${e(k)}</dt><dd>${v}</dd>`).join('')}</dl>
${t.details?`<details class="ii-sub"><summary>Technical evidence</summary><p class="note">${t.details}</p></details>`:''}</article>`;
}
function quiet(count,text,items){
  if(!count)return '';
  const list=items?.length?`<ul>${items.slice(0,8).map(i=>`<li>${e(short(i))}</li>`).join('')}${items.length>8?`<li>… and ${items.length-8} more</li>`:''}</ul>`:'';
  return `<details class="ii-quiet"><summary><b>${count}</b> ${text}</summary>${list}</details>`;
}

/* ---------- intent differences ---------- */
// Summary, concepts grouped by service, and one concept in detail: intended vs this PR, the recorded
// transitions at a glance, the changed rows, and each row's source. Built only from recorded facts,
// the verified patch and intent_diff verdicts; a boundary change without a question stays unresolved.
const conceptName=id=>String(id||'').replace(/^FTGO-/,'').toLowerCase().replace(/-/g,' ').replace(/^./,c=>c.toUpperCase());
function verdicts(liveDoc){
  const check=(liveDoc?.checks||liveDoc?.stages||[]).find(c=>c.id==='intent_diff');
  return Object.fromEntries((check?.judgments||[]).filter(r=>r.question_id).map(r=>[r.question_id,r]));
}
const plain=html=>String(html||'').replace(/<[^>]*>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const stateOf=v=>String(v||'').split('=').pop().split('.').pop().trim();
const human=s=>String(s||'').toLowerCase().replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
const plural=(n,word,many)=>`${n} ${n===1?word:(many||word+'s')}`;
const RANK={changed:0,review:1,gap:2,pending:3,preserved:4};
function describe(form,slots){
  if(!slots)return '';
  if(form==='state_transition')return `${(slots.allowed||[]).map(s=>human(stateOf(s))).join(', ')||'Any state'} → ${(slots.writes||[]).map(w=>human(stateOf(w))).join(', ')||'no state write'}`;
  if(slots.slot)return `${slots.slot}(${slots.value??''})`;
  if(slots.receiver||slots.operation)return `${slots.receiver||''}.${slots.operation||''}(${(slots.arguments||[]).join(', ')})`;
  if(slots.participant)return slots.participant;
  return Object.entries(slots).map(([k,v])=>`${k}: ${Array.isArray(v)?v.join(', '):v}`).join(' · ');
}
const describeAll=(form,list)=>list.length?list.map(s=>describe(form,s)).join('; '):'';
function changeOf(item){
  if(item.before.length&&item.after.length)return ['changed','Changed'];
  if(item.after.length)return ['added','Added'];
  if(item.before.length)return ['dropped','No longer recorded'];
  return ['unknown','See source'];
}
function intentItems(view,byQuestion){
  const judged=(view.concepts||[]).map(t=>{const v=byQuestion[t.question_id];return {
    id:slug('ii-item '+t.question_id),concept:t.concept,boundary:t.boundary_id,status:v?.verdict||'pending',conf:v?.confidence,
    method:t.changed.method,file:t.changed.file,line:t.changed.line,mode:t.changed.deleted?'deleted':'line',form:t.form,
    before:t.facts?.before?[t.facts.before]:[],after:t.facts?.after?[t.facts.after]:[],intended:t.intended,sentence:t.sentence,
    affected:t.affected,services:t.services||[],obligations:v?.workflow_obligations||[],details:`Boundary <code>${e(t.boundary_id)}</code> · question <code>${e(t.question_id)}</code>`};});
  const unjudged=(view.unjudged||[]).map(u=>({
    id:slug('ii-item '+u.flow_id),concept:conceptName(u.boundary_id),boundary:u.boundary_id,status:'gap',unasked:true,
    method:u.method,file:u.changed?.file,line:u.changed?.line,mode:u.changed?.side==='after'?'line':'old',form:u.form,
    before:u.before||[],after:u.after||[],services:[service(u.changed?.file)],obligations:[],flowIds:String(u.flow_id||'').split('+').filter(Boolean),
    details:`Boundary <code>${e(u.boundary_id)}</code> · no boundary question was asked for this change${(u.reasons||[]).length?` · ${e(u.reasons.join(', '))}`:''}`}));
  return [...judged,...unjudged];
}
const service=p=>{const m=/^ftgo-([\w-]+?)(?:-service)?\//.exec(p||'');return m?m[1].replace(/-/g,' ').replace(/^./,c=>c.toUpperCase())+(m[1].endsWith('history')?'':' service'):'Repository';};
function intentConcepts(view,byQuestion){
  const map=new Map();
  for(const item of intentItems(view,byQuestion)){
    const key=item.concept;
    if(!map.has(key))map.set(key,{key,id:slug('intent '+key),name:key,boundary:item.boundary,items:[],services:new Set()});
    const c=map.get(key);c.items.push(item);item.services.forEach(s=>c.services.add(s));
  }
  for(const g of view.gaps||[]){
    const key=conceptName(g.boundary_id);
    if(!map.has(key))map.set(key,{key,id:slug('intent '+key),name:key,boundary:g.boundary_id,items:[],services:new Set(),unmapped:true});
    else map.get(key).unmapped=true;
  }
  return [...map.values()].map(c=>{
    const statuses=c.items.map(i=>i.status).concat(c.unmapped?['gap']:[]);
    const status=statuses.sort((a,b)=>RANK[a]-RANK[b])[0]||'gap';
    const confs=c.items.map(i=>i.conf).filter(Boolean);
    const methods=new Set(c.items.map(i=>i.method));
    return {...c,status,unaskedOnly:Boolean(c.items.length)&&c.items.every(i=>i.unasked),label:c.items.length&&c.items.every(i=>i.label)?c.items[0].label:null,conf:confs[0],services:[...c.services],methods:methods.size};
  }).sort((a,b)=>RANK[a.status]-RANK[b.status]||b.items.length-a.items.length);
}
function summaryCard(view,concepts){
  const n=k=>concepts.filter(c=>c.status===k).length;
  const changed=n('changed'),review=n('review'),open=n('gap')+n('pending'),kept=n('preserved'),total=concepts.length;
  const [tone,badge,head]=changed?['changed','Intent changed',`Intent changed in ${changed} of ${plural(total,'concept')}`]:
    review?['review','Needs review',`${review} of ${plural(total,'concept')} need${review===1?'s':''} review`]:
    open?['gap','Unresolved',`Intent unresolved for ${open} of ${plural(total,'concept')}`]:
    total?['preserved','Preserved',`Intent preserved in ${plural(total,'concept')}`]:['preserved','No governed change','No governed intent changed'];
  const size=view.size||{},items=concepts.reduce((a,c)=>a+c.items.length,0),methods=new Set(concepts.flatMap(c=>c.items.map(i=>i.method))).size;
  const noise=(view.noise?.files||[]).length,ungoverned=(view.noise?.ungoverned||[]).length;
  const lede=[items?`${plural(items,'governed change')} across ${plural(methods,'method')}${(view.services||[]).length?` in ${e(view.services.join(', '))}`:''}.`:'',
    noise?`${plural(noise,'file')} changed without method behavior.`:'',ungoverned?`${plural(ungoverned,'other method')} changed without a governed fact.`:''].filter(Boolean).join(' ');
  const stat=(cls,value,label)=>`<div class="ii-stat ${cls}"><b>${value}</b><span>${label}</span></div>`;
  return `<div class="ii-summary ${tone}"><div class="ii-summary-head"><span class="ii-flag ${tone}">${badge}</span><h4>${head}</h4></div>${lede?`<p>${lede}</p>`:''}
${coverageLine(concepts)}<div class="ii-stats">${stat('changed',changed,'changed')}${stat('review',review+open,review&&!open?'need review':'unresolved or need review')}${stat('preserved',kept,'preserved')}${stat('size',`${size.files||0} · ${size.lines||0}`,'files · lines changed')}</div></div>`;
}
function coverageCounts(concepts){
  const items=concepts.flatMap(c=>c.items);
  return {total:items.length,judged:items.filter(i=>!['gap','pending'].includes(i.status)).length,
    unasked:items.filter(i=>i.unasked).length,pending:items.filter(i=>i.status==='pending').length,
    unmapped:concepts.filter(c=>c.unmapped).length};
}
function coverageLine(concepts){
  const k=coverageCounts(concepts);
  if(!k.total&&!k.unmapped)return '';
  const pct=n=>k.total?Math.round(100*n/k.total):0;
  return `<div class="ii-cov"><div class="ii-covbar" role="img" aria-label="${k.judged} of ${k.total} governed changes analyzed"><i class="j" style="width:${pct(k.judged)}%"></i><i class="u" style="width:${pct(k.unasked)}%"></i><i class="p" style="width:${pct(k.pending)}%"></i></div>
<p class="ii-legend"><span><i class="ii-sw j"></i>Analyzed · ${k.judged} of ${k.total}</span>${k.unasked?`<span><i class="ii-sw u"></i>No boundary question · ${k.unasked}</span>`:''}${k.pending?`<span><i class="ii-sw p"></i>Awaiting analysis · ${k.pending}</span>`:''}${k.unmapped?`<span><i class="ii-sw m"></i>Not mapped to an accepted region · ${k.unmapped}</span>`:''}</p></div>`;
}
function glance(c){
  const facts=c.items.filter(i=>i.form==='state_transition');
  if(!facts.length)return '';
  const edges=side=>new Set(facts.flatMap(i=>i[side].flatMap(s=>(s.allowed||[]).flatMap(a=>(s.writes||[]).map(w=>stateOf(a)+'>'+stateOf(w))))));
  const before=edges('before'),after=edges('after'),all=new Set([...before,...after]);
  const states=[...new Set([...all].flatMap(k=>k.split('>')))];
  if(!states.length||states.length>12)return '';
  const unrecorded=facts.some(i=>!i.after.length);
  const cell=(from,to)=>{const k=from+'>'+to,b=before.has(k),a=after.has(k);
    const [cls,mark,note]=b&&a?['same','•','recorded before and after']:a?['added','+','newly recorded in this PR']:b?['dropped','−',unrecorded?'recorded before, not recorded in this PR':'no longer recorded']:['none','','not part of these facts'];
    return `<span class="ii-cell ${cls}" title="${e(human(from)+' → '+human(to)+': '+note)}" aria-label="${e(human(from)+' to '+human(to)+': '+note)}">${mark}</span>`;};
  const cols=`grid-template-columns:minmax(8rem,1.4fr) repeat(${states.length},minmax(3.2rem,1fr))`;
  return `<section class="ii-block"><h5>At a glance <span>· recorded state transitions, from row to column</span></h5><div class="ii-matrix-wrap"><div class="ii-matrix" role="img" aria-label="Recorded state transitions before and after this PR">
<div class="ii-mrow head" style="${cols}"><span>From ↓ · To →</span>${states.map(s=>`<span>${e(human(s))}</span>`).join('')}</div>
${states.map(from=>`<div class="ii-mrow" style="${cols}"><span class="ii-mlabel">${e(human(from))}</span>${states.map(to=>cell(from,to)).join('')}</div>`).join('')}</div></div>
<p class="ii-legend"><span><i class="ii-cell same">•</i> before and after</span><span><i class="ii-cell added">+</i> newly recorded</span><span><i class="ii-cell dropped">−</i> ${unrecorded?'not recorded in this PR':'no longer recorded'}</span></p></section>`;
}
function itemRows(c){
  const groups=new Map();
  for(const item of c.items){const sig=JSON.stringify([item.form,item.before,item.after,item.status]);
    if(!groups.has(sig))groups.set(sig,[]);groups.get(sig).push(item);}
  return [...groups.values()];
}
function evidence(item,hidden){
  const where=`${short(item.file)}:${item.line??'?'}`;
  const steps=[['line',`${short(item.file)}\nline ${item.line??'?'}${item.mode!=='line'?', before this PR':''}`],['method',item.method],['concept',item.concept],['service',item.services.join(' → ')]];
  if(item.affected)steps.push(['lands',`${item.affected.label}\nline ${item.affected.anchor}`]);
  const prior=item.mode!=='line';
  const code=item.file?`<p class="ii-ah"><b>${prior?'Before this PR':'Changed here'}</b> · ${prior?'baseline':'this PR'} · <code>${e(where)}</code></p><div class="ii-code ii-changed" data-file="${e(item.file)}" data-method="${e(item.method)}" data-flow-ids="${e((item.flowIds||[]).join(' '))}" data-mode="${e(item.mode)}" data-line="${e(item.line??'')}"><p class="note">Loading the changed lines…</p></div>`:'';
  return `<div class="ii-ev" data-ii-ev="${e(item.id)}"${hidden?' hidden':''}><div class="ii-grid"><div class="ii-src">${code}${unchangedCode(item.affected)}</div>${ladder(steps)}</div>
<details class="ii-sub"><summary>Technical evidence</summary><p class="note">${item.details}</p></details></div>`;
}
function conceptPanel(c,hidden){
  const [cls,label]=STATUS[c.status]||STATUS.pending;
  const intended=[...new Set(c.items.map(i=>i.intended).filter(Boolean))];
  const sentences=[...new Set(c.items.map(i=>i.sentence).filter(Boolean))];
  const thisPr=sentences.length?sentences.join(' '):c.items.length?`${plural(c.items.length,'recorded boundary change')} with no boundary question, so whether intent changed is unresolved. Review each row's source below.`:
    'The changed code could not be mapped to this concept\'s accepted region, so its effect is unknown. Other concepts are still evaluated.';
  const groups=itemRows(c),first=c.items[0];
  const rows=groups.map(g=>{const item=g[0],[ccls,clabel]=changeOf(item);
    return `<button type="button" class="ii-row${item===first?' on':''}" data-ii-item="${e(item.id)}" aria-pressed="${item===first}">
<span class="ii-rm">${e(g.length>1?`${item.method} +${g.length-1} more`:item.method)}</span><span class="ii-rw">${e(g.length>1?plural(g.length,'method'):`${short(item.file)}:${item.line??'?'}`)}</span>
<span class="ii-rb">${e(describeAll(item.form,item.before)||'Not recorded')}</span><span class="ii-ra ${ccls}">${e(describeAll(item.form,item.after)||(item.before.length?'Not recorded':'See source'))}</span><span><span class="ii-tag ${ccls}">${clabel}</span></span></button>
${g.length>1?`<div class="ii-same" data-ii-group="${e(item.id)}"${item===first?'':' hidden'}><span>Same recorded change in ${g.length} methods. Pick one to see its source.</span>${g.map((m,j)=>`<button type="button" class="ii-chip${j?'':' on'}" data-ii-item="${e(m.id)}" aria-pressed="${!j}">${e(m.method)}</button>`).join('')}</div>`:''}`;}).join('');
  return `<article class="ii-tile ii-concept ${cls}" id="${e(c.id)}" data-ii-panel data-outline-name="${e(c.name)}" data-outline-status="${cls}"${hidden?' hidden':''}>
<nav class="ii-crumbs" aria-label="Location">Intent differences<span aria-hidden="true"> › </span>${e(c.services.join(', ')||'Repository')}<span aria-hidden="true"> › </span>${e(c.name)}</nav>
<header><span class="ii-cname">${e(c.name)}</span><span class="ii-badge">Governed</span>${c.unaskedOnly?'':`<span class="ii-status ${cls}">${e(c.label||label)}</span>`}${c.conf?`<span class="ii-conf">confidence ${e(c.conf)}</span>`:''}</header>
<div class="ii-compare"><div class="ii-side"><span class="ii-k">Intended · baseline</span><p>${intended.length?intended.map(e).join(' '):'No accepted intent statement was recorded for this concept.'}</p></div>
<div class="ii-side pr ${cls}"><span class="ii-k">This PR</span><p>${thisPr}</p></div></div>
${governedBy(c,cls,label)}
${glance(c)}
${c.items.length?`<section class="ii-block"><h5>Intent diff <span>· changed rows only${groups.some(g=>g.length>1)?', repeated changes grouped':''}</span></h5><div class="ii-table"><div class="ii-thead"><span>Method</span><span>Where</span><span>Before</span><span>This PR</span><span>Change</span></div>${rows}</div></section>
<section class="ii-block"><h5>Evidence</h5>${c.items.map(i=>evidence(i,i!==first)).join('')}</section>`:''}
</article>`;
}
// Accepted workflow → obligation → boundary question → this change → result, from the judgment's own links.
function governedBy(c,cls,label){
  const first=c.items[0];
  if(!first)return '';
  const obligations=[...new Map(c.items.flatMap(i=>i.obligations).map(o=>[o.obligation_id||o.statement,o])).values()];
  const asked=c.items.some(i=>i.intended);
  const step=(n,k,body,extra='')=>`<div class="ii-gstep${extra}"><span class="ii-k">${n} · ${k}</span>${body}</div>`;
  const where=`${short(first.file)}:${first.line??'?'}`;
  const methods=new Set(c.items.map(i=>i.method));
  const weight=c.status==='changed'?WEIGHT.enforced:c.status==='preserved'?WEIGHT.complete:WEIGHT.advisory;
  const chain=(o)=>`<div class="ii-chain">${
    step(1,'Customer workflow',o?`<b>${e(o.workflow_name||o.workflow_id)}</b><span class="note">${e(o.governance_status==='accepted'?'Accepted':human(o.governance_status||'not accepted'))}${o.workflow_category?` · ${e(o.workflow_category)}`:''}</span>`:'<span class="note">No accepted workflow is linked</span>')}${
    step(2,'Obligation',o?`<span>${e(o.statement)}</span><span class="note">${o.witness_count!=null?plural(Number(o.witness_count),'witness','witnesses'):''}${o.phase?` · ${e(human(o.phase))} phase`:''}</span>`:'<span class="note">—</span>')}${
    step(3,'Boundary question',asked?`<span>${e(first.intended)}</span>`:'<span class="note">No boundary question was asked</span>')}${
    step(4,'This change',`<code>${e(methods.size>1?`${first.method} +${methods.size-1} more`:first.method)}</code><span class="note">${e(where)}</span>`,' here')}${
    step(5,'Result',c.unaskedOnly?'<span class="note">No governed result was produced for this change.</span>':`<b class="ii-res ${cls}">${e(c.label||label)}</b><span class="ii-weight ${weight[0]}">${weight[1]}</span>`)}</div>`;
  const link=obligations[0]?.workflow_id?`<button type="button" class="ii-link" data-intent-governance="1" data-workflow-id="${e(obligations[0].workflow_id)}">Open in the Governance tab</button>`:'';
  const proposed=c.status==='changed'?`<div class="ii-proposed"><span class="ii-weight w-proposed">${WEIGHT.proposed[1]}</span><span>If this change is intended, the accepted policy must be updated through governance review. This PR cannot change it; the finding stays enforced until then.</span></div>`:'';
  return `<section class="ii-block"><div class="ii-bhead"><h5>Governed by <span>· the accepted policy used to evaluate this change</span></h5>${link}</div>${(obligations.length?obligations:[null]).map(chain).join('')}${proposed}</section>`;
}
function conceptNav(concepts){
  const by=new Map();
  for(const c of concepts){const s=c.services[0]||'Repository';if(!by.has(s))by.set(s,[]);by.get(s).push(c);}
  return `<nav class="ii-nav" aria-label="Concepts in this change">${[...by].map(([s,list])=>`<div class="ii-ngroup"><p class="ii-gname"><span>${e(s)}</span><span>${list.length} concept${list.length===1?'':'s'}</span></p>
${list.map((c,i)=>{const [cls,label]=STATUS[c.status]||STATUS.pending;const lead=plain(c.items.find(x=>x.sentence)?.sentence)||(c.items.length?`${plural(c.items.length,'change')} without a boundary question.`:'Not mapped to an accepted region.');
return `<button type="button" class="ii-ncard ${cls}${c===concepts[0]?' on':''}" data-ii-concept="${e(c.id)}" aria-pressed="${c===concepts[0]}" aria-controls="${e(c.id)}"><span class="ii-nhead"><b>${e(c.name)}</b>${c.unaskedOnly?'':`<span class="ii-status ${cls}">${e(c.label||label)}</span>`}</span><span class="ii-nlead">${e(lead)}</span><span class="ii-nmeta">${plural(c.items.length,'change')} · ${plural(c.methods,'method')}</span></button>`;}).join('')}</div>`).join('')}</nav>`;
}
window.intentImpactSection=function(packet,liveDoc){
  const view=packet?.intent_impact;
  if(!view)return '';
  const concepts=intentConcepts(view,verdicts(liveDoc));
  const work=concepts.length?`<div class="ii-work${concepts.length===1?' single':''}">${concepts.length>1?conceptNav(concepts):''}<div class="ii-panels">${concepts.map((c,i)=>conceptPanel(c,i>0)).join('')}</div></div>`:'';
  return `<section class="ii-section ii-review" aria-label="Intent impact" data-ii-review><div class="ii-head"><h4>Intent impact</h4><p class="note">Each governed concept this PR touches, traced from source to its recorded behavior and the unchanged code that relies on it.</p></div>
${summaryCard(view,concepts)}${work}
${quiet((view.noise?.files||[]).length,'file'+((view.noise?.files||[]).length===1?'':'s')+' changed without method behavior · no intent impact',view.noise?.files)}
${quiet((view.noise?.ungoverned||[]).length,'method'+((view.noise?.ungoverned||[]).length===1?'':'s')+' changed without a governed fact',view.noise?.ungoverned)}
${quiet((view.noise?.context_only||[]).length,'nearby method'+((view.noise?.context_only||[]).length===1?'':'s')+' affected only by surrounding changes',view.noise?.context_only)}</section>`;
};
function selectConcept(review,id){
  const panel=review.querySelector(`[data-ii-panel][id="${CSS.escape(id)}"]`);
  if(!panel)return null;
  review.querySelectorAll('[data-ii-panel]').forEach(p=>p.hidden=p!==panel);
  review.querySelectorAll('[data-ii-concept]').forEach(b=>{const on=b.dataset.iiConcept===id;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);});
  return panel;
}
function selectItem(panel,id){
  const row=panel.querySelector(`.ii-row[data-ii-item="${CSS.escape(id)}"]`),chip=panel.querySelector(`.ii-chip[data-ii-item="${CSS.escape(id)}"]`);
  const group=chip?.closest('[data-ii-group]')?.dataset.iiGroup||(row?id:null);
  panel.querySelectorAll('.ii-row').forEach(r=>{const on=r.dataset.iiItem===group;r.classList.toggle('on',on);r.setAttribute('aria-pressed',on);});
  panel.querySelectorAll('[data-ii-group]').forEach(g=>{g.hidden=g.dataset.iiGroup!==group;
    if(!chip&&g.dataset.iiGroup===group)g.querySelectorAll('.ii-chip').forEach((c,j)=>{c.classList.toggle('on',!j);c.setAttribute('aria-pressed',!j);});});
  if(chip)chip.parentElement.querySelectorAll('.ii-chip').forEach(c=>{const on=c===chip;c.classList.toggle('on',on);c.setAttribute('aria-pressed',on);});
  panel.querySelectorAll('[data-ii-ev]').forEach(ev=>ev.hidden=ev.dataset.iiEv!==id);
}
function wireIntentReview(root){
  root.querySelectorAll('[data-ii-review]').forEach(review=>{
    review.addEventListener('click',ev=>{
      const concept=ev.target.closest('[data-ii-concept]');
      if(concept){selectConcept(review,concept.dataset.iiConcept);return;}
      const item=ev.target.closest('[data-ii-item]');
      if(item)selectItem(item.closest('[data-ii-panel]'),item.dataset.iiItem);
    });
  });
}
// The outline links to every concept; reveal a concept that is not the one on screen.
window.revealIntentConcept=function(el){
  const review=el?.matches?.('[data-ii-panel][hidden]')&&el.closest('[data-ii-review]');
  if(review)selectConcept(review,el.id);
};

/* ---------- improper tests ---------- */
function covers(unit){
  const [cls,method]=String(unit||'').split('.');
  const subject=(cls||'').replace(/(Tests?|IT)$/,'');
  const behavior=(method||'').replace(/^should/,'').replace(/^./,c=>c.toLowerCase());
  return subject?`${subject}${behavior?` · ${behavior}`:''}`:'Not established';
}
function testTile(f){
  const kind=f.kind||'weak';
  const anchor=f.anchor_line?Number(f.anchor_line):null;
  const regionStart=f.region?Number(String(f.region).split('-')[0]):Number(f.line)||null;
  const mode=kind==='deleted'?'deleted-method':f.anchor_mode==='line'&&anchor?'line':f.anchor_mode==='removed'?'removed':'region';
  const where=`${short(f.file)}${anchor||regionStart?`:${anchor||regionStart}`:''}`;
  const method=String(f.unit||'').split('.').pop();
  const steps=[[mode==='removed'||mode==='deleted-method'?'removed':'line',`${short(f.file)}${anchor||regionStart?`\nline ${anchor||regionStart}`:''}`],
               ['test',f.unit||short(f.file)],['covers',covers(f.unit)]];
  if(f.reason_id)steps.push(['reason',String(f.reason_id).replaceAll('_',' ')]);
  const thisPr=f.comment?e(f.comment):kind==='deleted'?`<code>${e(f.unit)}</code> was removed. Confirm the behavior it covered was removed too, or is tested elsewhere.`:
    kind==='inconclusive'?'The changed test could not be read completely, so the check failed closed.':e(f.signals||'The test may pass even if the behavior it names breaks.');
  return tile({id:slug('test '+f.unit+' '+kind),crumbs:['Improper tests',f.unit||short(f.file),where],name:f.unit||short(f.file),badge:'Test',
    status:kind,conf:f.anchor_confidence,code:f.file?{file:f.file,mode,line:anchor,region:f.region,method}:null,steps,
    io:[['Intended','A test fails when the behavior it names breaks.'],['This PR',thisPr]],
    details:[f.signals?`Signals: ${e(f.signals)}`:'',f.basis?`Basis: ${e(f.basis)}`:''].filter(Boolean).join(' · ')});
}
window.improperTestsSection=function(liveDoc){
  const check=(liveDoc?.checks||liveDoc?.stages||[]).find(c=>c.id==='improper_tests');
  const findings=check?.findings||[];
  const adequacy=window.testAdequacyMarkup?testAdequacyMarkup(check):'';
  if(!findings.length&&!adequacy)return '';
  return `<section class="ii-section" aria-label="Improper tests">${findings.map(testTile).join('')}${adequacy}</section>`;
};

/* ---------- remaining checks ---------- */
const checksOf=liveDoc=>Object.fromEntries((liveDoc?.checks||liveDoc?.stages||[]).map(c=>[c.id,c]));
const chip=(cls,text)=>`<span class="pt-chip ${cls}">${e(text)}</span>`;
const row=(cls,state,name,note,target)=>`<li>${chip(cls,state)}<b>${target?`<a href="#rc-${e(target)}" data-outline-target="rc-${e(target)}">${e(name)}</a>`:e(name)}</b><span class="note">${e(note)}</span></li>`;
const LEVELS=[['Small',0],['Moderate',2],['Broad',3],['Extensive',4]];
const userSeverity=label=>window.codingSeverity?codingSeverity(label).label:String(label||'').replace(/^./,c=>c.toUpperCase());

function gauge(score,threshold){
  const pos=Math.max(0,Math.min(100,score/4*100)),th=Math.max(0,Math.min(100,threshold/4*100));
  return `<div class="pt-gauge" role="img" aria-label="Change scope ${score} of 4, threshold ${threshold}"><div class="pt-track"><i class="pt-skip" style="width:${th}%"></i><b class="pt-th" style="left:${th}%"></b><b class="pt-mark" style="left:${pos}%"></b></div>
<div class="pt-ticks">${LEVELS.map(([l,at])=>`<span style="left:${at*25}%">${l}</span>`).join('')}</div><p class="pt-legend"><span class="sw skip"></span>Below threshold: downstream checks skipped <span class="sw th"></span>Threshold ${e(threshold)}</p></div>`;
}

/* ---------- evidence coverage: one gap list for every view ---------- */
// Required gaps leave the assessment incomplete; advisory gaps only lower confidence.
// A governed change that no boundary question covered does not stop the decision today, so it is
// advisory here too; the page never contradicts the decision. Set 'required' if governance makes it blocking.
const UNJUDGED_LANE='advisory';
const GAP_CLOSE={unresolved_call:'Nothing required. Behavior through these calls is evaluated with less certainty.',
  added_method_contract_unchecked:'Optional. Add the new method to an accepted region to have its contract checked.',
  removed_method_contract_unchecked:'Optional. Confirm the removed method\'s contract was retired or moved.',
  context_only_cpg_drift:'Nothing required. Only the surrounding code changed; the method itself did not.',
  'Governed facts changed; semantic preservation requires evidence.':'Nothing required here. The intent judgment for this concept decides whether behavior was preserved.'};
const GAP_TITLE={context_only_cpg_drift:'Surrounding code structure changed','Governed facts changed; semantic preservation requires evidence.':'Governed facts changed without a preservation proof'};
// Customer-facing text never names internal analysis tools.
const customerText=t=>String(t||'').replace(/\bcpg\b/gi,'code structure').replace(/\b(?:joern|type\s*safe|llm)\b/gi,'analysis').replace(/\b(?:gherkin|gerkin)\b/gi,'behavior model');
function subcheckClose(reason){
  if(/module purpose|change declaration/i.test(reason))return 'Declare each module\'s purpose and this PR\'s intended change, then rerun this revision.';
  if(/budget|omitted/i.test(reason))return 'The review budget was exceeded. Narrow or split the change, then rerun.';
  if(/region/i.test(reason))return 'Some source regions could not be captured. Rerun this revision.';
  return 'Rerun this revision.';
}
window.evidenceGaps=function(liveDoc,packet){
  const c=checksOf(liveDoc),view=packet?.intent_impact||{},gaps=[];
  const unjudged=new Map();
  for(const u of view.unjudged||[]){const k=conceptName(u.boundary_id);if(!unjudged.has(k))unjudged.set(k,[]);unjudged.get(k).push(u);}
  for(const [concept,list] of unjudged)gaps.push({lane:UNJUDGED_LANE,title:`${plural(list.length,'governed change')} with no boundary question`,
    scope:concept,where:list.map(u=>({label:`${u.method}${u.changed?.line?':'+u.changed.line:''}`,target:slug('intent '+concept)})),
    close:'Select a boundary question for these changes, then rerun this revision.'});
  for(const g of view.gaps||[])gaps.push({lane:'required',title:'Changed code is not mapped to an accepted region',scope:conceptName(g.boundary_id),
    where:[{label:conceptName(g.boundary_id),target:slug('intent '+conceptName(g.boundary_id))}],close:'Map the changed method to this concept\'s accepted region through governance review, then rerun.'});
  const ce=c.connected_evidence,required=Number((String(ce?.detail||'').match(/(\d+) required evidence gap/)||[])[1]||0);
  if(required)gaps.push({lane:'required',title:`${plural(required,'finding')} cite${required===1?'s':''} evidence missing from this revision`,scope:'Connected evidence',where:[],
    close:'Rerun so the cited evidence is produced for this revision.'});
  const integrity=(ce?.substeps||[]).find(s=>s.id==='integrity');
  if(integrity&&integrity.state!=='passed')gaps.push({lane:'required',title:'Baseline, governance version or source did not match this revision',scope:'Connected evidence',where:[],
    close:'Rerun against the accepted baseline pinned for this pull request.'});
  if(ce?.interpretation_status==='unavailable')gaps.push({lane:'advisory',title:'No recorded explanation for this exact evidence',scope:'Connected evidence',where:[],
    close:'Nothing required. Findings stand on their own evidence.'});
  const selection=ce?.evidence_selection;
  if(Number(selection?.omitted||0))gaps.push({lane:'advisory',title:`${plural(Number(selection.omitted),'optional evidence item')} omitted to fit the review budget`,scope:'Connected evidence',where:[],
    close:'Nothing required. Finding witnesses are always retained.'});
  const byBasis=new Map();
  for(const f of (c.rule_impact?.findings||[]).filter(f=>f.status==='gap'||String(f.enforced)!=='true')){
    if(f.status!=='gap')continue;
    const k=f.basis||f.title||'evidence';if(!byBasis.has(k))byBasis.set(k,[]);byBasis.get(k).push(f);}
  for(const [basis,list] of byBasis){const files=new Map();list.forEach(f=>{const n=short(f.file)||'Governed evidence';files.set(n,(files.get(n)||0)+1);});
    gaps.push({lane:'advisory',title:GAP_LABEL[basis]||GAP_TITLE[basis]||customerText(human(basis)),count:list.length,scope:'Governance-rule impact',
      where:[...files].sort((a,b)=>b[1]-a[1]).map(([f,n])=>({label:n>1?`${f} · ${n}`:f})),close:GAP_CLOSE[basis]||'Nothing required. Confidence is lower here.'});}
  const errors=(packet?.governance_review?.subchecks||c.rule_impact?.subchecks||[]).filter(s=>s.state==='error');
  const reasons=new Map();
  for(const s of errors)for(const g of (s.gaps?.length?s.gaps:['could not run'])){const r=String(g).replace(/:.*$/,'');if(!reasons.has(r))reasons.set(r,[]);reasons.get(r).push(s.label||s.id);}
  for(const [reason,labels] of reasons)gaps.push({lane:'advisory',title:`Bounded review couldn't run · ${plural(labels.length,'check')}`,scope:labels.join(', '),
    detail:customerText(reason).replace(/^./,ch=>ch.toUpperCase()),where:[],close:subcheckClose(reason)});
  return gaps;
};
function gapRow(g){
  const where=g.where.length?`<div class="ev-where">${g.where.slice(0,4).map(w=>w.target?`<a href="#${e(w.target)}" data-outline-target="${e(w.target)}">${e(w.label)}</a>`:`<span>${e(w.label)}</span>`).join('')}${g.where.length>4?`<span class="note">+${g.where.length-4} more</span>`:''}</div>`:'';
  return `<li class="ev-gap"><div class="ev-gh"><b>${e(g.title)}</b>${g.count?`<span class="ev-n">${g.count}</span>`:''}</div><span class="note">${e(g.scope)}${g.detail?` · ${e(g.detail)}`:''}</span>${where}<p class="ev-close"><b>What closes this:</b> ${e(g.close)}</p></li>`;
}
function coverageMarkup(liveDoc,packet){
  const gaps=evidenceGaps(liveDoc,packet),req=gaps.filter(g=>g.lane==='required'),adv=gaps.filter(g=>g.lane==='advisory');
  const concepts=packet?.intent_impact?intentConcepts(packet.intent_impact,verdicts(liveDoc)):[];
  const lane=(cls,kicker,head,list,empty)=>`<section class="ev-lane ${cls}"><header><span class="ii-k">${kicker}</span><b>${head}</b></header>${list.length?`<ul>${list.map(gapRow).join('')}</ul>`:`<p class="note ev-empty">${empty}</p>`}</section>`;
  return `${coverageLine(concepts)}<div class="ev-lanes">${lane('req','Required · review is incomplete',req.length?`${plural(req.length,'gap')} to close before a final decision`:'Nothing required is missing',req,'Every required piece of evidence is present.')}
${lane('adv','Advisory · lowers confidence only',adv.length?`${plural(adv.reduce((n,g)=>n+(g.count||1),0),'place')} with incomplete evidence`:'No advisory gaps',adv,'No place lacks evidence.')}</div>`;
}

/* ---------- one set of counts for the whole page ---------- */
// "Needs action" = findings a person must resolve or decide. Advisory evidence gaps are informational.
window.reviewActionCounts=function(liveDoc){
  const c=checksOf(liveDoc),per={};
  per.intent_diff=(c.intent_diff?.judgments||[]).filter(j=>['changed','review'].includes(j.verdict)).length;
  per.improper_tests=(c.improper_tests?.findings||[]).length;
  per.coding_standards=(c.coding_standards?.findings||[]).filter(f=>f.band==='finding').length;
  per.rule_impact=(c.rule_impact?.findings||[]).filter(f=>f.status!=='gap'&&String(f.enforced)==='true').length;
  return {per,total:Object.values(per).reduce((a,b)=>a+b,0)};
};
window.severitySection=function(liveDoc){
  const sev=liveDoc?.severity||{},check=checksOf(liveDoc).severity;
  if(!check||sev.score==null)return '';
  const score=Number(sev.score),threshold=Number(sev.threshold||2),label=String(sev.label||'');
  const ran=sev.decision==='full_analysis';
  const band=c=>c==null?'':Number(c)>=0.85?'high':Number(c)>=0.6?'medium':'low';
  return tile({id:'rt-severity',crumbs:['Change severity','This pull request'],name:'Change severity',badge:'Routing',
    status:ran?'changed':'clear',label:`${userSeverity(label)} · ${score.toFixed(2)} of 4`,conf:band(sev.confidence),custom:gauge(score,threshold),steps:[],
    io:[['Intended','Changes above the threshold get the full analysis; changes below it skip the downstream checks.'],
        ['This PR',ran?`Rated <b>${e(userSeverity(label))}</b> (${score.toFixed(2)} of 4), above the ${threshold} threshold, so every check ran.`
                      :`Rated <b>${e(userSeverity(label))}</b> (${score.toFixed(2)} of 4), below the ${threshold} threshold. Coding standards and intent analysis were skipped; improper tests still run when tests change.`]]});
};

window.standardsSection=function(liveDoc){
  const check=checksOf(liveDoc).coding_standards;
  if(!check)return '';
  const active=(check.findings||[]).map(f=>({...f,watch:false})),watch=(check.watch_only_findings||[]).map(f=>({...f,watch:true}));
  const all=[...active,...watch];
  if(!all.length)return '';
  return `<section class="ii-section" aria-label="Coding standards">${all.map(f=>{
    const finding=f.band==='finding',line=Number(f.line)||null;
    const categoryLabel=value=>human(String(value||'').replace(/-/g,' '));
    const leaf=categoryLabel(f.category||'repository standards'),parent=f.category_parent?categoryLabel(f.category_parent):'';
    const collection=parent?`${parent} · ${leaf}`:leaf;
    return tile({id:slug('std '+f.rule_id+' '+f.file+' '+f.line),crumbs:['Coding standards',collection,f.rule_id,`${short(f.file)}${line?':'+line:''}`],name:f.name||f.rule_id,
      badge:f.watch?'Watch-only':'Enforced',status:f.watch?'watch':finding?'changed':'clear',label:f.watch?(finding?'Would be a finding':'Would be an FYI'):finding?'Finding':'FYI',
      conf:f.confidence?(Number(f.confidence)>=0.85?'high':Number(f.confidence)>=0.6?'medium':'low'):'',
      code:f.file?{file:f.file,mode:'line',line}:null,
      steps:[['line',`${short(f.file)}${line?`\nline ${line}`:''}`],['method',f.unit||'Not supplied'],['rule',`${f.rule_id} v${f.rule_version||'1'}`],['collection',collection],['enforcement',f.watch?'Watch-only · not enforced yet':'Enforced']],
      io:[['Intended',e(f.name||f.rule_id)],['This PR',`<code>${e(f.unit||short(f.file))}</code> was reported as a ${finding?'finding':'note'} against this rule${f.severity?`, ${e(f.severity)} severity`:''}.`],...(f.guidance?[['Suggested fix',e(f.guidance)]]:[])],
      details:`Rule ${e(f.rule_id)} v${e(f.rule_version||'1')}${f.watch?' · watch-only rules are recorded for evaluation and never block':''}`});}).join('')}</section>`;
};

const GAP_LABEL={unresolved_call:'Calls could not be resolved',added_method_contract_unchecked:'New methods with no contract check',removed_method_contract_unchecked:'Removed methods with no contract check'};
window.ruleImpactSection=function(liveDoc,packet){
  const check=checksOf(liveDoc).rule_impact;
  if(!check)return '';
  const findings=check.findings||[];
  const violations=findings.filter(f=>f.status!=='gap'&&String(f.enforced)==='true');
  const gapCount=findings.length-violations.length;
  const evidence=findings.length?tile({id:'rt-rule-evidence',crumbs:['Governance-rule impact','Advisory evidence'],name:plural(gapCount,'evidence gap'),badge:'Advisory',
    status:violations.length?'changed':'gap',label:violations.length?`${violations.length} governed violation${violations.length===1?'':'s'}`:'No governed violation',steps:[],
    custom:gapCount?'<p class="note">Listed with what closes each one under <a href="#rt-connected" data-outline-target="rt-connected">Evidence coverage</a>.</p>':'',
    io:[['Intended','Every changed behavior can be traced to governed evidence.'],
        ['This PR',violations.length?`${violations.length} governed rule${violations.length===1?' is':'s are'} violated; the remaining gaps lower confidence only.`:'No governed rule is violated. The remaining gaps lower confidence and need no response.']]}):'';
  const subs=packet?.governance_review?.subchecks||[];
  const WHAT={placement:'Logic stays in the class and service that own it',scope:'Every edit is needed for the stated change',module_fit:'Changes fit the purpose of their module',undisclosed:'Behavior does not exceed the PR description',sabotage:'No authorization bypass, secret exposure or unsafe call'};
  const state=s=>s.state==='passed'?['ok','Passed']:s.state==='failed'?['bad',`${s.findings||''} finding${s.findings===1?'':'s'}`.trim()]:['gap',"Couldn't run"];
  const reasons=[...new Set(subs.flatMap(s=>s.state==='error'?(s.gaps||[]):[]).map(g=>String(g).replace(/:.*$/,'').replace(/^region$/,'Some source regions could not be captured')))];
  const bounded=subs.length?tile({id:'rt-bounded-review',crumbs:['Governance-rule impact','Bounded review',`${subs.length} checks`],name:'Bounded review',badge:'Review',
    status:subs.some(s=>s.state==='failed')?'changed':subs.some(s=>s.state==='error')?'gap':'clear',label:subs.some(s=>s.state==='failed')?'Findings':subs.some(s=>s.state==='error')?"Couldn't run":'No issues',steps:[],
    custom:`<ul class="pt-checklist">${subs.map(s=>{const [c,t]=state(s);return row(c,t,s.label,WHAT[s.id]||'');}).join('')}</ul>`,
    io:[...(reasons.length?[['Why',e(reasons.join('. ')+'.')]]:[]),['To complete',subs.some(s=>s.state==='error')?[...new Set(subs.filter(s=>s.state==='error').flatMap(s=>s.gaps?.length?s.gaps:['']).map(g=>subcheckClose(String(g))))].join(' '):'No action needed.']]}):'';
  const semantic=window.semanticReviewsMarkup?semanticReviewsMarkup(check):'';
  return evidence||bounded||semantic?`<section class="ii-section" aria-label="Governance-rule impact">${violations.length?`<p class="note">${violations.length} enforced finding(s) are listed with the review findings below.</p>`:''}${evidence}${bounded}${semantic}</section>`:'';
};

window.connectedSection=function(liveDoc,packet){
  const check=checksOf(liveDoc).connected_evidence;
  if(!check)return '';
  const gaps=evidenceGaps(liveDoc,packet),req=gaps.filter(g=>g.lane==='required').length,adv=gaps.filter(g=>g.lane==='advisory').length;
  return tile({id:'rt-connected',crumbs:['Connected evidence','Evidence coverage'],name:'Evidence coverage',badge:'Evidence',
    status:req?'gap':'clear',label:req?plural(req,'required gap'):adv?'Complete · advisory gaps':'Complete',steps:[],
    custom:`${coverageMarkup(liveDoc,packet)}${window.evidenceSelectionMarkup?evidenceSelectionMarkup(check):''}${window.semanticGroundingMarkup?semanticGroundingMarkup(check):''}`,
    io:[['Intended','Every finding is backed by complete, verified evidence.'],['This PR',req?`${plural(req,'required gap')} must be closed before the decision is final. Advisory gaps lower confidence only.`:adv?'Required evidence is complete. Advisory gaps lower confidence only.':'Required evidence is complete.']]});
};

let currentPacket=null;
function decisionNote(id,c,liveDoc){
  const d=String(c.detail||''),n=re=>Number((d.match(re)||[])[1]||0);
  if(['blocked','stopped'].includes(c.state))return 'Skipped for this change';
  if(id==='severity'){const s=liveDoc?.severity||{};return `${userSeverity(s.label)} · ${s.decision==='full_analysis'?'full analysis ran':'downstream checks skipped'}`;}
  if(id==='intent_diff'){const v=n(/(\d+) governed semantic boundary violation/),g=n(/(\d+) governed boundary\(ies\) could not be mapped/),r=n(/(\d+) boundary judgment/);
    return [v&&`${v} governed concept${v===1?'':'s'} changed`,r&&`${r} need${r===1?'s':''} review`,g&&`${g} missing an accepted-region mapping`].filter(Boolean).join(' · ')||customerDetail(d);}
  if(id==='coding_standards'){const w=(c.watch_only_findings||[]).length,a=(c.findings||[]).filter(f=>f.band==='finding').length;return `${a} enforced finding${a===1?'':'s'} · ${w} watch-only`;}
  if(id==='improper_tests'){const f=(c.findings||[]).length;return f?`${f} weak or removed test${f===1?'':'s'}`:/no changed Java test/.test(d)?'No test changes':'Tests checked, none weak';}
  if(id==='rule_impact'){const f=c.findings||[],v=f.filter(x=>x.status!=='gap'&&String(x.enforced)==='true').length,g=f.length-v;return `${v} governed violation${v===1?'':'s'} · ${g} evidence gap${g===1?'':'s'}`;}
  if(id==='connected_evidence'){const gaps=window.evidenceGaps?evidenceGaps(liveDoc,currentPacket):[],r=gaps.filter(x=>x.lane==='required').length,a=gaps.length-r;
    return `${r?plural(r,'required gap'):'Required evidence complete'}${a?` · ${plural(a,'advisory gap')}`:''}`;}
  return customerDetail(d);
}
// The accepted policy this decision used, and whether it is the one pinned for this run's base.
function policyStrip(liveDoc,packet){
  const b=liveDoc?.governance_baseline;
  if(!b?.governance_version)return '';
  const shortId=v=>String(v||'').replace(/^(gov:)?([0-9a-f]{8})[0-9a-f]*$/,(m,p,h)=>(p||'')+h);
  const pinnedVersion=packet?.governed_objectives?.version_id,pinnedBase=packet?.baseline_commit;
  const known=pinnedVersion||pinnedBase;
  const matches=(!pinnedVersion||pinnedVersion===b.governance_version)&&(!pinnedBase||!b.source_commit||pinnedBase===b.source_commit);
  const counts=[b.workflows!=null?plural(Number(b.workflows),'workflow'):'',b.accepted_obligations!=null?plural(Number(b.accepted_obligations),'accepted obligation'):''].filter(Boolean).join(' · ');
  return `<div class="pt-policy"><span class="ii-k">${b.status==='accepted'?'Accepted policy':'Policy · '+e(human(b.status||'unknown'))}</span><code>${e(shortId(b.governance_version))}</code>${counts?`<span>${counts}</span>`:''}${b.ontology_sha256?`<code class="pt-dim">ontology ${e(String(b.ontology_sha256).slice(0,8))}</code>`:''}
${known?`<span class="pt-pin ${matches?'ok':'bad'}">${matches?'Pinned to this run\'s base':'Does not match this run\'s base · rerun required'}</span>`:''}</div>`;
}
const weightLegend=()=>`<p class="pt-legend pt-weights"><b>How much a finding counts</b>${[WEIGHT.enforced,['w-advisory','Advisory review · lowers confidence'],['w-watch','Watch-only · never blocks'],['w-proposed','Proposed policy change · not accepted']].map(([c,t])=>`<span><i class="ii-weight ${c}" aria-hidden="true"></i>${e(t)}</span>`).join('')}</p>`;
window.decisionSection=function(liveDoc,packet){
  currentPacket=packet;
  const checks=checksOf(liveDoc),decision=checks.governance_decision;
  if(!decision)return '';
  const verdict=liveDoc?.verdict||'';
  const order=['intent_diff','improper_tests','coding_standards','rule_impact','connected_evidence','severity'];
  const NAME={intent_diff:'Intent differences',improper_tests:'Improper tests',coding_standards:'Coding standards',rule_impact:'Governance-rule impact',connected_evidence:'Connected evidence',severity:'Change severity'};
  const rows=order.filter(id=>checks[id]).map(id=>{const c=checks[id],s=c.state;
    const advisory=id==='rule_impact'&&(c.findings||[]).some(f=>String(f.enforced)!=='true')||id==='connected_evidence'&&evidenceGaps(liveDoc,packet).some(g=>g.lane==='advisory');
    const watch=id==='coding_standards'&&(c.watch_only_findings||[]).length&&!(c.findings||[]).some(f=>f.band==='finding');
    const [cls,label]=id==='severity'?['ok','Routing']:s==='failed'?WEIGHT.enforced:s==='error'?['gap','Incomplete']:['blocked','stopped'].includes(s)?['skip','Skipped']:
      s==='passed'?(advisory?WEIGHT.advisory:watch?WEIGHT.watch:['ok','No issues']):['gap','Pending'];
    return {cls,label,id,blocks:s==='failed',incomplete:s==='error',html:row(cls,label,NAME[id],decisionNote(id,c,liveDoc),id)};});
  const blocks=rows.filter(r=>r.blocks),incomplete=rows.filter(r=>r.incomplete);
  const headline=verdict==='PASS'?'<b class="ok">Ready to merge</b><span>Every required check passed for this revision.</span>':
    blocks.length?`<b>Blocked</b><span>${e(blocks.map(r=>NAME[r.id]).join(' and '))} ${blocks.length===1?'reports':'report'} a required finding.${incomplete.length?' The assessment is also incomplete, so a fix must be re-analyzed before approval.':''}</span>`:
    `<b class="gap">LACKS_DETERMINISTIC_EVIDENCE</b><span>No required finding, but ${e(incomplete.map(r=>NAME[r.id]).join(' and ')||'some checks')} could not finish.</span>`;
  return tile({id:'rt-decision',crumbs:['Governance decision','This pull request'],name:'Governance decision',badge:'Decision',
    status:verdict==='PASS'?'clear':blocks.length?'changed':'gap',label:verdict==='UNKNOWN'?'LACKS_DETERMINISTIC_EVIDENCE':verdict||'Pending',steps:[],
    custom:`${policyStrip(liveDoc,packet)}<div class="pt-verdict">${headline}</div><ul class="pt-checklist">${[...blocks,...incomplete,...rows.filter(r=>!blocks.includes(r)&&!incomplete.includes(r))].map(r=>r.html).join('')}</ul>${weightLegend()}`,
    io:[['Intended','A pull request merges only when every governed concept is preserved and the evidence is complete.'],
        ['This PR',verdict==='PASS'?'Ready for owner review.':blocks.length?`Resolve the findings in ${e(blocks.map(r=>NAME[r.id]).join(' and '))}${incomplete.length?', supply the missing evidence,':''} then rerun.`:'Supply the missing evidence, then rerun.']]});
};

/* ---------- code loading ---------- */
function parseHunks(patch,file){
  const section=(patch||'').split(/(?=^diff --git )/m).find(s=>s.split('\n').includes('+++ b/'+file)||s.split('\n').includes('--- a/'+file));
  if(!section)return [];
  return section.split(/(?=^@@ )/m).map(h=>{
    const head=h.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/);if(!head)return null;
    let oldNo=+head[1],newNo=+head[2];const rows=[];
    for(const raw of h.split('\n').slice(1)){
      if(raw.startsWith('\\')||raw==='')continue;
      const k=raw[0]==='+'||raw[0]==='-'?raw[0]:' ';
      rows.push({k,o:k==='+'?null:oldNo,n:k==='-'?null:newNo,t:raw.slice(1),near:newNo});
      if(k!=='+')oldNo++;if(k!=='-')newNo++;
    }
    return rows;
  }).filter(Boolean);
}
function selectRows(hunks,{mode,line,region,method}){
  const [a,b]=String(region||'').split('-').map(Number);
  for(const rows of hunks){
    let hits=[];
    if(mode==='line')hits=rows.map((r,i)=>r.k!=='-'&&r.n===line?i:-1).filter(i=>i>=0);
    else if(mode==='old')hits=rows.map((r,i)=>r.k!=='+'&&r.o===line?i:-1).filter(i=>i>=0);
    else if(mode==='deleted')hits=rows.map((r,i)=>r.k==='-'&&r.o===line?i:-1).filter(i=>i>=0);
    else if(mode==='deleted-method'){const start=rows.findIndex(r=>r.k==='-'&&new RegExp('\\b'+method+'\\s*\\(').test(r.t));
      if(start>=0){hits=[start];for(let i=start-1;i>=0&&rows[i].k==='-';i--)hits.unshift(i);for(let i=start+1;i<rows.length&&rows[i].k==='-';i++)hits.push(i);}}
    else hits=rows.map((r,i)=>r.k!==' '&&(!a||(r.near>=a&&r.near<=b+1))?i:-1).filter(i=>i>=0);
    if(!hits.length)continue;
    if((mode==='line'||mode==='old')&&rows[hits[0]].k===' '){const added=rows.findIndex((r,i)=>i>=hits[0]&&r.k==='+'),near=added>=0?added:rows.findIndex((r,i)=>i>=hits[0]&&r.k!==' ');if(near>=0)hits=[near];}
    const from=Math.max(0,hits[0]-3),to=Math.min(rows.length,hits[hits.length-1]+4);
    return {rows:rows.slice(from,to),hits:new Set(hits.map(i=>i-from))};
  }
  return null;
}
async function githubSourceLink(file,anchor){
 const repo=typeof LIVE_REPO==='string'?LIVE_REPO:'',pr=typeof LIVE_PR!=='undefined'?String(LIVE_PR):'';
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)||!/^\d+$/.test(pr)||!file)return '';
 const bytes=new TextEncoder().encode(file);
 const hash=typeof reviewSha256==='function'?await reviewSha256(bytes):Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 const line=anchor&&Number.isInteger(anchor.line)&&anchor.line>0?(anchor.deleted?'L':'R')+anchor.line:'';
 const href='https://github.com/'+repo+'/pull/'+pr+'/files#diff-'+hash+line;
 return `<p class="ii-ah"><a href="${e(href)}" target="_blank" rel="noopener noreferrer">${line?'Open method’s changed line in GitHub PR diff':'Open file diff in GitHub PR'} ↗</a></p>`;
}
window.renderGovernedMethodSource=async function(root,loadPatch){
 const nodes=[...root.querySelectorAll('[data-governed-source-file]')];
 if(!nodes.length)return;
 let patch;try{patch=await loadPatch();}catch(error){nodes.forEach(node=>node.innerHTML=`<p class="note">${e(error.message)}</p>`);return;}
 if(patch===null){nodes.forEach(node=>node.innerHTML='<p class="note">No source patch was supplied for this revision.</p>');return;}
 for(const node of nodes){
  const hunks=parseHunks(patch,node.dataset.governedSourceFile);
  const anchors=JSON.parse(node.dataset.sourceAnchors||'[]');
  const matched=hunks.filter(rows=>anchors.some(a=>rows.some(r=>a.deleted?r.k==='-'&&r.o===a.line:r.k==='+'&&r.n===a.line)));
  const link=await githubSourceLink(node.dataset.governedSourceFile,anchors.find(a=>hunks.some(rows=>rows.some(r=>a.deleted?r.k==='-'&&r.o===a.line:r.k==='+'&&r.n===a.line))));
  if(!hunks.length){node.innerHTML='<p class="note">This file has no changes in the recorded patch; it may be affected context rather than directly edited source.</p>';continue;}
  const rowsMarkup=rows=>rows.map(r=>`<div class="ii-dl ${r.k==='+'?'add':r.k==='-'?'del':''}"><span class="n">${r.o??''}</span><span class="n">${r.n??''}</span><span class="m">${r.k.trim()}</span><span class="t">${e(r.t)||' '}</span></div>`).join('');
  node.innerHTML=matched.length?'<p class="note">Patch hunks containing this method’s recorded changed lines. Surrounding context may include adjacent methods.</p>'+matched.map(rowsMarkup).join('<hr>'):'<p class="note">An exact changed-line anchor is unavailable for this method.</p>';
  node.innerHTML+=`<details${matched.length?'':' open'}><summary>Full file diff${matched.length?'':' (not method-specific)'}</summary>${hunks.map(rowsMarkup).join('<hr>')}</details>`;
  node.innerHTML=link+node.innerHTML;
 }
};
window.renderIntentImpact=async function(root,loadPatch){
  const nodes=[...root.querySelectorAll('.ii-changed[data-file]')];
  if(nodes.length){
    let patch;try{patch=await loadPatch();}catch(err){nodes.forEach(n=>n.innerHTML=`<p class="note">${e(err.message)}</p>`);patch=null;}
    if(patch!==null)for(const node of nodes){
      const d=node.dataset,hunks=parseHunks(patch,d.file),found=selectRows(hunks,{mode:d.mode,line:Number(d.line)||null,region:d.region,method:d.method});
      const sourceLabel=`<p class="ii-ah"><b>File:</b> <code style="overflow-wrap:anywhere">${e(d.file)}</code><br><b>Selected method:</b> <code style="overflow-wrap:anywhere">${e(d.method||'Not recorded')}</code></p>`;
      node.innerHTML=found?found.rows.map((r,i)=>`<div class="ii-dl ${r.k==='+'?'add':r.k==='-'?'del':''}${found.hits.has(i)?' hit':''}"><span class="n">${r.n??''}</span><span class="m">${r.k.trim()}</span><span class="t">${e(r.t)||' '}</span></div>`).join('')
        :hunks.length?'<p class="note">Exact method anchor unavailable. Showing the recorded file diff (not method-specific).</p>'+hunks.map(rows=>rows.map(r=>`<div class="ii-dl ${r.k==='+'?'add':r.k==='-'?'del':''}"><span class="n">${r.o??''}</span><span class="n">${r.n??''}</span><span class="m">${r.k.trim()}</span><span class="t">${e(r.t)||' '}</span></div>`).join('')).join('<hr>'):'<p class="note">This file has no changes in the recorded patch; it may be affected context rather than directly edited source.</p>';
      const anchor=hunks.flat().find(r=>(d.mode==='deleted'||d.mode==='old')?r.k==='-'&&r.o===Number(d.line):r.k==='+'&&r.n===Number(d.line));
      node.innerHTML=sourceLabel+await githubSourceLink(d.file,anchor?{line:anchor.k==='-'?anchor.o:anchor.n,deleted:anchor.k==='-'}:null)+node.innerHTML;
    }
  }
  wireIntentReview(root);
  renderReviewOutline(root);
};

/* ---------- page outline: where you are ---------- */
let outlineObserver;
function renderReviewOutline(root){
  const sidebar=document.querySelector('.sidebar');
  const checks=[...root.querySelectorAll('.review-check-tile')];
  if(!sidebar||!checks.length)return;
  const items=checks.map((check,ci)=>{
    if(!check.id)check.id='rc-'+(check.dataset.reviewCheckId||ci);
    const title=check.querySelector('summary h3')?.textContent?.trim()||'Check';
    const state=check.querySelector('summary .pill')?.textContent?.trim()||'';
    const tiles=[...check.querySelectorAll('.ii-tile[id]')];
    const count=Number(check.querySelector('summary .count')?.textContent||0);
    return `<li class="ro-check"><a href="#${e(check.id)}" data-outline-target="${e(check.id)}"><span>${e(title)}</span><small>${e(state)}${count?` · ${count} to act on`:''}</small></a>${tiles.length?`<ol>${tiles.map(t=>`<li><a href="#${e(t.id)}" data-outline-target="${e(t.id)}" class="ro-${e(t.dataset.outlineStatus)}">${e(t.dataset.outlineName)}</a></li>`).join('')}</ol>`:''}</li>`;
  }).join('');
  const top=root.querySelector('#rt-decision');
  const decisionItem=top?`<li class="ro-check"><a href="#rt-decision" data-outline-target="rt-decision"><span>Governance decision</span><small>${e(top.querySelector('.ii-status')?.textContent||'')}</small></a></li>`:'';
  root.querySelectorAll('.pt-checklist a[data-outline-target]').forEach(a=>{if(!document.getElementById(a.dataset.outlineTarget))a.replaceWith(document.createTextNode(a.textContent));});
  sidebar.innerHTML=`<p class="eyebrow">On this page</p><ol class="review-outline">${decisionItem}${items}</ol><div class="side-foot">Checks in run order. The highlighted entry is the one in view.</div>`;
  root.onclick=ev=>{const a=ev.target.closest('.pt-checklist [data-outline-target]');if(!a)return;ev.preventDefault();const el=document.getElementById(a.dataset.outlineTarget);if(!el)return;for(let n=el;n&&n!==root;n=n.parentElement)if(n.tagName==='DETAILS')n.open=true;el.scrollIntoView({behavior:'smooth',block:'start'});};
  sidebar.onclick=ev=>{const a=ev.target.closest('[data-outline-target]');if(!a)return;ev.preventDefault();
    const el=document.getElementById(a.dataset.outlineTarget);if(!el)return;
    window.revealIntentConcept(el);
    const parent=el.closest('details.review-check-tile');if(parent)parent.open=true;if(el.tagName==='DETAILS')el.open=true;
    el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});};
  outlineObserver?.disconnect();
  const links=new Map([...sidebar.querySelectorAll('[data-outline-target]')].map(a=>[a.dataset.outlineTarget,a]));
  outlineObserver=new IntersectionObserver(entries=>{
    for(const entry of entries){if(!entry.isIntersecting)continue;
      const tileId=entry.target.id,checkId=entry.target.closest('.review-check-tile')?.id;
      sidebar.querySelectorAll('.current').forEach(x=>x.classList.remove('current'));
      links.get(checkId)?.classList.add('current');links.get(tileId)?.classList.add('current');}
  },{rootMargin:'-20% 0px -70% 0px'});
  root.querySelectorAll('.review-check-tile, .ii-tile[id], #rt-decision').forEach(el=>outlineObserver.observe(el));
}
})();
