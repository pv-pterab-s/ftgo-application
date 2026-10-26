/* Shared presentation of fixture and generated findings. Responses are session-only. */
const reviewBoards = new Map();
function customerDetail(value){
 const text=String(value||'').replace(/\btype\s*safe\b/gi,'analysis service').replace(/\b(?:gherkin|gerkin)\b/gi,'behavior model').replace(/\bjev-[\w.-]+/gi,'analysis service').replace(/\bLLMs?\b/g,'analysis').replace(/\blarge language models?\b/gi,'analysis').replace(/\bjoern\b/gi,'code analysis').replace(/\bCPGs?\b/g,'code structure').replace(/\bcode property graphs?\b/gi,'code structure').replace(/\s*\(\d*\.\d+\)/g,'')
  // Producer and check details written for engineers, reworded for reviewers.
  .replace(/Real backend artifacts ready;\s*/i,'Analysis ready; ').replace(/\bnative (WARN|PASS|BLOCK);\s*/gi,'').replace(/bounded boundary question\(s\)/gi,'governed question(s)')
  .replace(/frozen-baseline backend evidence/gi,'analysis of the changed code').replace(/;\s*downstream checks selected/i,', so every check ran').replace(/;\s*explanations follow in Asking Code Intent/i,'');
 return text.replace(/^./,c=>c.toUpperCase());
}
// Customer names for the pipeline's own producer steps; check definitions keep their ids.
function customerCheckLabel(check){
 return ({pr_source:'Read the pull request',backend_artifacts:'Analyze the changed code',severity:'Assess change scope',ask_code_intent:'Ask Code Intent'}[check?.id])||check?.label||check?.id||'';
}
function customerEvidence(value){
 if(Array.isArray(value))return value.map(customerEvidence);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!/(model|provider|confidence|probabilit|score|request|response)/i.test(key)).map(([key,item])=>[key,customerEvidence(item)]));
 return typeof value==='string'?customerDetail(value):value;
}
const reviewViewState = new Map();
function reviewState(scope) {
  if (!reviewViewState.has(scope)) reviewViewState.set(scope, {filter:'needs',check:'all',owner:'all',responses:new Map()});
  return reviewViewState.get(scope);
}
function reviewResponseState(action) {
  const governance={'governance-existing':'Existing governance proposed · awaiting owner','governance-new':'New governance proposed · awaiting owner','governance-none':'Ungoverned scope proposed · awaiting owner'};
  if(governance[action])return governance[action];
  return action === 'fix-submitted' ? 'Fix submitted · awaiting analysis' : action === 'context-supplied' ? 'Context supplied · awaiting analysis' : action === 'dispute' ? 'Disputed · awaiting review' : action === 'request-changes' ? 'Changes requested · awaiting author' : 'Response recorded · awaiting owner';
}
function reviewEntryStatus(e) { return e.statusLabel||(e.status==='not_applicable'?'Not configured':e.status==='clear'?'No action needed':e.status==='gap'?'Missing review input':'Action needed'); }
function reviewEntryActions(e) {
  if (e.status==='clear'||e.status==='not_applicable') return [];
  if(e.governanceDecision)return [['governance-existing','Request existing-rule mapping'],['governance-new','Request new governance'],['governance-none','Request ungoverned scope']];
  return e.status==='gap' ? [ ['context-supplied','Mark context supplied'], ['escalate','Request owner review'], ['dispute','Dispute finding'] ] : [ ['request-changes','Request changes'], ['fix-submitted','Mark fix submitted'], ['dispute','Dispute finding'] ];
}
function shortReviewSource(source){
 const text=source.label||'Source unavailable',parts=text.split('::');
 const file=parts[0].split('/').pop();
 return file+(source.symbol||parts[1]?' · '+(source.symbol||parts[1]):'');
}
function shortReviewRevision(value){return /^[0-9a-f]{40,64}$/i.test(value||'')?value.slice(0,12):value||'Not supplied';}
function intentVisualMarkup(visual){
 if(!visual)return '';
 const lane=(label,steps,changed)=>`<div class="intent-visual-lane ${changed?'changed':''}"><b>${esc(label)}</b><div>${steps.map((step,index)=>`${index?'<span class="intent-arrow">→</span>':''}<span class="intent-state ${step.missing?'missing':''}">${esc(step.label)}</span>`).join('')}</div></div>`;
 return `<div class="intent-visual" aria-label="Intent transition comparison">${lane('Baseline',visual.before,false)}${lane('This revision',visual.after,true)}</div>`;
}
function reviewLaneMarkup(entries,options,state){
 if(options.checks?.length)return reviewCheckTiles(entries,options,state);
 const lanes=[
  {id:'objectives',title:'Governance objectives',description:'What must stay true, what this change affects, and what to do.',match:e=>Boolean(e.governanceObjective)||e.checks?.includes('Governance policy')},
  {id:'new-intent',title:'New intent · governance decisions',description:'Use an existing rule, create a new rule, or explicitly decide that no rule is needed.',match:e=>e.governanceDecision},
  {id:'related-intent',title:'Related behavior changes',description:'Changes we found but have not connected to an agreed rule.',match:e=>Boolean(e.story)},
  {id:'improper-tests',title:'Improper tests',description:'Test findings, changed assertions, and source evidence.',match:e=>e.category==='Improper tests'},
  {id:'coding-standards',title:'Coding standards',description:'Findings against the repository’s adopted standards.',match:e=>e.category==='Coding standards'},
  {id:'evidence',title:'Evidence gaps',description:'Missing information that prevents a complete review.',match:e=>e.status==='gap'||e.category==='Evidence coverage'},
  {id:'observations',title:'Source observations',description:'Remaining changes recorded by the analysis.',match:()=>true}
 ];
 const remaining=new Set(entries);
 return '<div class="review-lanes">'+lanes.map(lane=>{
  const items=entries.filter(e=>remaining.has(e)&&lane.match(e));items.forEach(e=>remaining.delete(e));
  if(!items.length)return '';
  return `<details class="review-lane" data-review-lane="${lane.id}"><summary class="review-lane-head"><h3 id="lane-${lane.id}">${esc(lane.title)} <span class="count">${items.length}</span></h3><p>${esc(lane.description)}</p></summary><div class="review-board">${items.map(e=>reviewEntryTile(e,options,state)).join('')}</div></details>`;
 }).join('')+'</div>';
}
function reviewCheckTiles(entries,options,state){
 const category={severity:'Severity',coding_standards:'Coding standards',improper_tests:'Improper tests',intent_diff:'Intent differences',rule_impact:'Rule impact',connected_evidence:'Connected evidence',governance_decision:'Governance decision'};
 return '<div class="review-check-tiles">'+options.checks.filter(check=>category[check.id]&&!(check.id==='governance_decision'&&options.decisionShown)&&(!['passed','skipped'].includes(check.state)||options.checkBodies?.[check.id])).map(check=>{
  const items=entries.filter(e=>e.category===category[check.id]||(check.id==='intent_diff'&&e.category==='Evidence coverage')||(check.id==='rule_impact'&&e.checks?.includes('Governance-rule impact'))||(check.id==='connected_evidence'&&e.checks?.includes('Connected evidence')));
  const blocked=check.state==='blocked',active=['failed','error'].includes(check.state);
  const stateLabel=blocked?'Waiting on another check':check.state==='error'?'Assessment incomplete':check.state==='failed'?'Findings to review':check.state==='stopped'?'Stopped':check.state==='passed'?'No issues':check.state;
  // With an intent impact view, its concept tiles are this check's primary content; the remaining tabs follow.
  const body=options.checkBodies?.[check.id]?options.checkBodies[check.id]+(check.id==='rule_impact'?`<div class="review-board">${items.map(e=>reviewEntryTile(e,options,state)).join('')}</div>`:''):check.id==='intent_diff'?(options.intentImpactHtml||'')+intentChangeMap(items,options,state):`<div class="review-board">${items.map(e=>reviewEntryTile(e,options,state)).join('')}</div>`;
  return `<details class="review-check-tile" data-review-check-id="${esc(check.id)}"><summary><h3>${esc(check.label||category[check.id]||check.id)}</h3><span class="pill ${blocked?'':active?'amber':''}">${esc(stateLabel)}</span>${(()=>{const n=items.filter(e=>e.status==='action').length+(options.checkActions?.[check.id]||0);return n?`<span class="count" title="Items needing action">${n}</span>`:'';})()}</summary><p class="review-check-detail">${esc(customerDetail(check.detail||'No additional check detail was supplied.'))}</p>${items.length||options.checkBodies?.[check.id]||(check.id==='intent_diff'&&options.intentImpactHtml)?body:`<p class="note">${blocked?'No independent finding: this check has not run because its prerequisite did not complete.':'No source-linked review finding was supplied for this check.'}</p>`}</details>`;
 }).join('')+'</div>';
}
function intentChangeMap(entries,options,state){
 const groups=new Map([
  ['diffs',{key:'diffs',area:'Intent diffs',entries:[]}],
  ['new',{key:'new',area:'New intent',entries:[]}],
  ['related',{key:'related',area:'Related behavior',entries:[]}],
  ['gaps',{key:'gaps',area:'Evidence gaps',entries:[]}]
 ]);
 for(const entry of entries){
  const key=entry.governanceDecision?'new':entry.story?'diffs':entry.category==='Evidence coverage'||entry.id==='intent-unresolved-call-group'||entry.statusLabel==='Production behavior link missing'?'gaps':'related';
  groups.get(key).entries.push(entry);
 }
 if(options.intentImpactHtml){groups.delete('diffs');for(const [key,g] of groups)if(!g.entries.length)groups.delete(key);if(!groups.size)return '';}
 if(!groups.size)return '<p class="note">No intent findings match the current filter.</p>';
 const current=groups.has(state.intentArea)?state.intentArea:groups.has('diffs')?'diffs':[...groups.keys()][0];
 const group=groups.get(current);
 const tone=g=>g.entries.some(e=>e.status==='action'&&!e.tone)?'violation':g.entries.some(e=>e.tone==='amber')?'boundary':g.entries.some(e=>e.governanceDecision)?'unmapped':g.entries.some(e=>e.status==='gap')?'incomplete':'observed';
 const labels={violation:'Violation reported',boundary:'Boundary violation reported',unmapped:'Governance mapping needed',incomplete:'Assessment incomplete',observed:'Observed change'};
 const name=value=>value.replace(/^FTGO-/,'').replaceAll('-',' ').toLowerCase().replace(/^./,x=>x.toUpperCase());
 return `<div class="intent-map"><h4>${options.intentImpactHtml?'Other intent changes':'Intent changes'}</h4><p class="note">${options.intentImpactHtml?'Changes that are not governed concepts, and missing evidence.':'Expand a change to inspect its intent DSL and source.'}</p><div class="intent-map-grid" role="group" aria-label="Intent review areas">${[...groups.values()].map(g=>`<button class="intent-map-block ${tone(g)}" data-intent-area="${esc(g.key)}" aria-pressed="${g.key===current}"><strong>${esc(name(g.area))}</strong><small>${g.entries.length}</small></button>`).join('')}</div><section class="intent-map-detail" aria-label="Selected intent area"><h4>${esc(name(group.area))}</h4><p class="note">${esc({diffs:'Compare recorded intent before and after the change, then inspect the DSL and source.',new:'New intent detected in this revision. Any request for governance is handled separately from this analysis.',related:'Related source and behavior changes recorded by the analysis.',gaps:'Missing context or evidence that limits this intent assessment.'}[group.key])}</p>${group.entries.length?`<div class="intent-collapsed-list">${group.entries.map(e=>`<details class="intent-change-item" data-intent-item="${esc(e.id)}"><summary><strong>${esc(e.title)}</strong><span class="pill ${e.status==='action'?'red':e.status==='gap'?'amber':''}">${esc(reviewEntryStatus(e))}</span></summary>${reviewEntryTile(e,options,state)}</details>`).join('')}</div>`:'<p class="note">No items match this area and the current filters.</p>'}</section></div>`;
}
function reviewBoard(options) {
  reviewBoards.set(options.scope,options);
  const state=reviewState(options.scope), entries=options.entries;
  const counts={needs:0,awaiting:0,clear:0};
  for(const e of entries) counts[state.responses.has(e.id)?'awaiting':e.status==='action'?'needs':'clear']++;
  counts.needs+=options.extraNeeds||0;
  const region=options.region||'all';
  const visible=entries.filter(e=>(region==='all'||e.region===region)&&(state.check==='all'||e.category===state.check)&&(state.owner==='all'||e.owner===state.owner)&&(state.filter==='all'||state.filter==='awaiting'&&state.responses.has(e.id)||state.filter==='needs'&&e.status==='action'&&!state.responses.has(e.id))).sort((a,b)=>({action:0,gap:1,clear:2,not_applicable:3}[a.status]??1)-({action:0,gap:1,clear:2,not_applicable:3}[b.status]??1));
  const checkOptions=[...new Set(entries.map(e=>e.category))],owners=[...new Set(entries.map(e=>e.owner).filter(x=>x&&x!=='Owner not supplied'))];
  return `<section data-review-scope="${esc(options.scope)}"><div class="review-board-head"><div><h2>${esc(options.title)}</h2><p>${esc(options.description||'')}</p></div></div><details class="review-run-details"><summary>Run details and filters</summary><div class="review-revision"><b>Reviewed revision</b> <code title="${esc(options.head||'Not supplied')}">${esc(shortReviewRevision(options.head))}</code> <span>· ${esc(options.freshness||'Current head not supplied')}</span><details><summary>Baseline and run context</summary><p>Reviewed head <code>${esc(options.head||'Not supplied')}</code></p><p>Baseline <code>${esc(options.baseline||'Not supplied')}</code></p><p>${esc(options.qualification||'')}</p></details></div>${entries.some(e=>!e.owner||e.owner==='Owner not supplied')?'<p class="note">Review owners were not identified in this artifact. Assign them before recording an approval.</p>':''}<div class="review-triage" aria-label="Review filters">${[['needs',counts.needs+' need action'],['awaiting',counts.awaiting+' awaiting others'],['all','All '+entries.length+' · '+counts.clear+' informational']].map(([id,label])=>`<button data-review-filter="${id}" aria-pressed="${state.filter===id}" class="${state.filter===id?'selected':''}">${esc(label)}</button>`).join('')}<label>Check <select data-review-check><option value="all">All checks</option>${checkOptions.map(x=>`<option ${state.check===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label>${owners.length?`<label>Owner <select data-review-owner><option value="all">All owners</option>${owners.map(x=>`<option ${state.owner===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label>`:''}</div><p class="note">Response buttons record your response; analysis or owner review is still pending.</p></details>${options.lanes?reviewLaneMarkup(visible,options,state):`<div class="review-board">${visible.map(e=>reviewEntryTile(e,options,state)).join('')}</div>`}${visible.length||options.checks?'':`<div class="card"><div class="body"><p>No items match these filters. Choose All to include items awaiting others and changes with no action needed.</p></div></div>`}<p class="note">Responses are recorded for this browser session. A fix becomes verified only after new analysis; responses do not clear CI checks or change the baseline.</p></section>`;
}
function reviewEntryTile(e,options,state) {
  if(e.story)return intentStoryTile(e,options,state);
  const response=state.responses.get(e.id);
  const color=e.tone||(e.status==='clear'?'green':e.status==='gap'?'amber':e.status==='not_applicable'?'':'red');
  const concept=e.concept&&!e.title.includes(e.concept)?(window.conceptLabel?conceptLabel(e.concept):e.concept).replaceAll('_',' '):'';
  const context=[concept,e.owner&&e.owner!=='Owner not supplied'?e.owner:''].filter(Boolean);
  const supporting=[...new Set(e.checks||[])].filter(x=>x.toLowerCase()!==e.category.toLowerCase());
  return `<article class="review-result ${e.status==='gap'?'evidence':e.status==='clear'?'pass':e.status==='not_applicable'?'compact':'intent'}" data-review-id="${esc(e.id)}" data-packet-id="${esc(e.id)}" data-regions="${esc(e.region)}"><div class="result-head"><h3>${esc(e.category)}</h3><span class="pill ${color}">${esc(reviewEntryStatus(e))}</span></div><div class="result-body"><button class="result-path source-button" data-review-source="${esc(e.id)}" title="${esc(e.source.label)} · Inspect source evidence">${esc(shortReviewSource(e.source))}</button><h4>${esc(e.title)}</h4>${e.codeHtml||''}${context.length?`<p class="note">${esc(context.join(' · '))}</p>`:''}${intentVisualMarkup(e.intentVisual)}${e.before!==undefined?`<p class="delta-caption">${esc(e.deltaLabel||'Baseline → This revision')}</p><div class="mini-diff"><div class="del">− ${esc(e.before)}</div><div class="add">+ ${esc(e.after)}</div></div>`:''}${e.summary?`<p><b>Why review:</b> ${esc(e.summary)}</p>`:''}<p><b>Next step:</b> ${esc(e.nextStep)}</p>${supporting.length?`<div class="review-check-tags"><span class="note">Also detected by</span>${supporting.map(x=>`<span class="pill">${esc(x)}</span>`).join('')}</div>`:''}<details class="result-details"><summary>Checks, policy and connected evidence</summary>${e.details||'<p>No additional evidence supplied.</p>'}</details>${response?`<div class="result-actions"><div class="response-state"><b>${esc(reviewResponseState(response.action))}</b><small>${esc(response.label)} · ${esc(response.at)}<br>Revision ${esc(response.head||'not supplied')} · original finding remains open</small></div><button data-review-undo="${esc(e.id)}">Undo response</button></div>`:['clear','not_applicable'].includes(e.status)?'<p class="note">No response required.</p>':`<div class="result-actions">${reviewEntryActions(e).map(([action,label])=>`<button data-review-action="${action}" data-entry-id="${esc(e.id)}">${esc(label)}</button>`).join('')}</div>`}</div></article>`;
}
function reviewSourceDialog() {
  let dialog=document.querySelector('#review-source-dialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='review-source-dialog';document.body.append(dialog);}
  return dialog;
}
async function openReviewSource(options,entry){
  const dialog=reviewSourceDialog();
  dialog.innerHTML='<button data-source-close>Close</button><p>Loading source evidence…</p>';
  dialog.showModal();
  try {
    const data=await options.sourceDetails(entry);
    if(!dialog.open)return;
    const patch=data.patch;
    dialog.innerHTML=`<div class="source-dialog-head"><h2>Source evidence</h2><button data-source-close>Close</button></div><p style="overflow-wrap:anywhere"><code>${esc(entry.source.label)}</code></p><p class="note">${esc(options.baseline||'Unknown baseline')} → ${esc(options.head||'Unknown revision')}</p><p>${esc(data.message||'')}</p>${patch?`<pre class="source-patch">${patch.split('\n').map(line=>`<span class="${line.startsWith('+')?'add':line.startsWith('-')?'del':''}">${esc(line)}</span>`).join('\n')}</pre>`:''}${data.evidence?`<pre>${esc(data.evidence)}</pre>`:''}<p class="note">${esc(entry.source.qualification||'Exact source lines are not supplied.')}</p>`;
  } catch(error){dialog.innerHTML=`<button data-source-close>Close</button><p>Source evidence unavailable: ${esc(error.message)}</p>`;}
}
document.addEventListener('click',e=>{
  if(e.target.closest('[data-source-close]')){reviewSourceDialog().close();return;}
  const button=e.target.closest('button');if(!button)return;
  const section=button.closest('[data-review-scope]');if(!section)return;
  const options=reviewBoards.get(section.dataset.reviewScope);if(!options)return;
  const state=reviewState(options.scope);
  if(button.dataset.intentArea){state.intentArea=button.dataset.intentArea;render();return;}
  if(button.dataset.reviewFilter){state.filter=button.dataset.reviewFilter;render();return;}
  if(button.dataset.reviewSource){const entry=options.entries.find(x=>x.id===button.dataset.reviewSource);if(entry)openReviewSource(options,entry);return;}
  if(button.dataset.reviewAction){state.responses.set(button.dataset.entryId,{action:button.dataset.reviewAction,label:button.textContent,at:new Date().toLocaleTimeString(),head:options.head});render();return;}
  if(button.dataset.reviewUndo){state.responses.delete(button.dataset.reviewUndo);render();}
});
document.addEventListener('change',e=>{
  const section=e.target.closest('[data-review-scope]');if(!section)return;
  const state=reviewState(section.dataset.reviewScope);
  if(e.target.matches('[data-review-check]'))state.check=e.target.value;
  else if(e.target.matches('[data-review-owner]'))state.owner=e.target.value;
  else return;
  render();
});
function reviewResponseHistory(scope){
 const state=reviewState(scope),options=reviewBoards.get(scope),byId=new Map((options?.entries||[]).map(e=>[e.id,e]));
 return `<article class="card"><div class="body"><h2>Review responses</h2>${state.responses.size?[...state.responses].map(([id,r])=>`<div class="gate"><div><strong>${esc(byId.get(id)?.title||id)}</strong><small>${esc(reviewResponseState(r.action))}<br>${esc(r.label)} · ${esc(r.at)} · revision ${esc(r.head||'not supplied')}</small></div></div>`).join(''):'<p>No responses recorded for this review.</p>'}<p class="note">Session-only responses. No approvals, verified fixes or backend audit events are inferred.</p></div></article>`;
}
