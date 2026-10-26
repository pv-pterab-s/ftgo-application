/* Live implementation of docs/ui-designs/review-walkthrough/codeintent-review-walkthrough.html. */
(function(){
'use strict';
const qs=new URLSearchParams(location.search);
const screen=document.querySelector('#screen');
const runContext=document.querySelector('#run-context');
const prBack=document.querySelector('#pr-back');
const repo=qs.get('repo')||'';
const sha=qs.get('sha')||'';
const pr=qs.get('pr')||'';
const runId=qs.get('run_id')||'';
const api=(qs.get('api')||'').replace(/\/+$/,'');
let dataPath=qs.get('data')||'';
const {ANALYSIS,REVIEW}=walkthroughPipeline;
const initialView=qs.get('view')==='checks'?'checks':'review';
const state={desc:walkthroughPipeline.isDescriptionRoute(qs),status:null,packet:null,packetDigest:null,summary:null,model:null,view:initialView,selected:initialView==='review'?(qs.get('item')||null):null,tab:'obj',node:null,full:false,evidenceFile:'',methods:{},drafts:new Map(),reasons:new Map(),saves:new Map(),reviewScope:null,commentBody:'',commentChecked:0,error:'',loadingArtifact:false,runDetailsOpen:false};
let pollTimer=null;
let assessmentResize=null;
let returnCommentId=/^[0-9]+$/.test(qs.get('comment')||'')?qs.get('comment'):null;

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const short=value=>String(value||'').split('/').pop();
const label=value=>String(value||'').replace(/^FTGO-/,'').replaceAll('_',' ').replaceAll('-',' ').toLowerCase().replace(/^./,c=>c.toUpperCase());
const demo=repo==='scottswindell-hub/ftgo-application';
const rawChecks=()=>state.status?.checks||state.status?.stages||[];
const checks=()=>rawChecks().filter(c=>!demo||(!walkthroughPipeline.demoEvidenceGap(c)&&c.id!=='governance_decision'));
const items=()=>state.model?[...state.model.changes,...state.model.constraints].filter(item=>!demo||item.status!=='unknown'):[];
function reviewTargets(item){return item?codeIntentFindingReviews.targets(item,items(),state.packet,state.summary,checks()):[];}
function reviewTarget(item){
 const targets=reviewTargets(item),issue=new URLSearchParams(location.search).get('issue');
 return targets.find(t=>t.finding.review.scope===state.reviewScope)||targets.find(t=>t.finding.id===issue||t.finding.ref===issue)||(targets.length===1?targets[0]:null);
}
function decision(id){
 const target=reviewTarget(items().find(item=>item.id===id));
 const r=target?.finding.review;
 return (r&&state.drafts.get(r.scope))||(r?.decision==='accepted'?'yes':r?.decision==='unresolved'?'no':'');
}
function confirmed(item){
 const target=reviewTarget(item),draft=state.drafts.get(target?.finding.review.scope);
 return codeIntentFindingReviews.recorded(target,state.commentBody)&&(!draft||draft===(target.finding.review.decision==='accepted'?'yes':'no'));
}
async function refreshReviewComment(){
 if(!returnCommentId||Date.now()-state.commentChecked<30000)return false;
 const pending=checks().some(check=>(check.findings||[]).some(finding=>finding.review?.record&&!codeIntentFindingReviews.recorded({finding},state.commentBody)));
 if(!pending)return false;
 state.commentChecked=Date.now();
 try{
  const response=await fetch(`https://api.github.com/repos/${repo.split('/').map(encodeURIComponent).join('/')}/issues/comments/${returnCommentId}`,{cache:'no-store'});
  if(!response.ok)return false;
  const comment=await response.json();
  const body=comment.user?.login==='github-actions[bot]'?comment.body||'':'';
  if(body===state.commentBody)return false;
  state.commentBody=body;return true;
 }catch(error){return false;/* Keep the recorded decision; do not claim the comment was refreshed. */}
}
function pullRequestUrl(){
 const parts=repo.split('/');
 return parts.length===2&&parts.every(Boolean)&&/^\d+$/.test(pr)
  ? `https://github.com/${parts.map(encodeURIComponent).join('/')}/pull/${encodeURIComponent(pr)}`:'#';
}

function returnToCommentUrl(){return returnCommentId&&pullRequestUrl()!=='#'?`${pullRequestUrl()}#issuecomment-${returnCommentId}`:null;}
async function resolveReturnComment(){
 if(returnCommentId||pullRequestUrl()==='#')return;
 try{
  for(let page=1;page<=10;page++){
   const response=await fetch(`https://api.github.com/repos/${repo.split('/').map(encodeURIComponent).join('/')}/issues/${encodeURIComponent(pr)}/comments?per_page=100&page=${page}`,{headers:{Accept:'application/vnd.github+json'}});
   if(!response.ok)throw Error('Comment lookup unavailable');
   const comments=await response.json();
   const comment=comments.find(row=>row.user?.login==='github-actions[bot]'&&row.body?.includes('<!-- codeintent-checks -->'));
   if(comment){returnCommentId=String(comment.id);break;}
   if(comments.length<100)break;
  }
 }catch(error){/* Keep return disabled rather than navigate to an unrelated destination. */}
 await refreshReviewComment();render();
}

function routeUrl(view,selected=null){
 const url=new URL(location.href);
 url.searchParams.delete('issue');url.searchParams.delete('check');
 if(view==='checks')url.searchParams.set('view','checks');else url.searchParams.delete('view');
 if(view==='review'&&selected)url.searchParams.set('item',selected);else url.searchParams.delete('item');
 return url.href;
}
function navigate(view,selected=null){
 state.desc=false;state.view=view;state.selected=view==='review'?selected:null;
 history.pushState(null,'',routeUrl(state.view,state.selected));
 render();
}

function statusUrl(){
 const base=/\/status$/.test(api)?api:api+'/status';
 return base+'?'+new URLSearchParams({sha,repo,...(runId?{run_id:runId}:{})});
}
function trusted(url){
 if(url.origin===location.origin)return true;
 try{return api&&url.origin===new URL(api,location.href).origin;}catch{return false;}
}
async function loadJson(reference,maxBytes,digest){
 const url=new URL(reference,location.href);if(!trusted(url))throw Error('Artifact URL is outside the configured pipeline origin.');
 const response=await fetch(url,{cache:'no-store'});if(response.status===202)return null;
 if(!response.ok)throw Error('Artifact returned HTTP '+response.status+'.');
 const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.byteLength>maxBytes)throw Error('Artifact exceeds the review size limit.');
 if(digest&&await reviewSha256(bytes)!==digest)throw Error('Artifact checksum differs from the pinned run.');
 return JSON.parse(new TextDecoder().decode(bytes));
}
async function loadText(reference,maxBytes,digest){
 const url=new URL(reference,location.href);if(!trusted(url))throw Error('Artifact URL is outside the configured pipeline origin.');
 const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error('Artifact returned HTTP '+response.status+'.');
 const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.byteLength>maxBytes)throw Error('Artifact exceeds the review size limit.');
 if(digest&&await reviewSha256(bytes)!==digest)throw Error('Artifact checksum differs from the pinned run.');
 return new TextDecoder().decode(bytes);
}
async function loadArtifacts(){
 if(state.loadingArtifact||state.packet||!dataPath)return false;
 state.loadingArtifact=true;
 try{
  const reference=state.status?.review_artifact;
  const digest=reference?.name==='intent-flow.json'?reference.sha256:null;
  const packet=await loadJson(dataPath,2*1024*1024,digest);if(!packet)return;
  if(packet.schema!=='intent-flow-view-v1'||!Array.isArray(packet.flows))throw Error('Unsupported CodeIntent artifact.');
  if(packet.repository!==repo||packet.head_commit!==sha)throw Error('Artifact identity differs from this pull request.');
  if(runId&&packet.simulation?.run_id!==runId)throw Error('Artifact belongs to another local run.');
  if(packet.source_diff?.status==='supplied'&&packet.source_diff.url){
   const patchUrl=new URL(packet.source_diff.url,new URL(dataPath,location.href)).href;
   packet.source_diff.content=await loadText(patchUrl,512*1024,packet.source_diff.sha256);
  }
  packet.explorer={
   terrain:packet.governed_objectives?.territory,
   governance:packet.governed_objectives?.holon_map?{holon_map:packet.governed_objectives.holon_map}:undefined,
   workflows:packet.governed_objectives?.customer_workflows,
   impact:packet.intent_impact,
   results:{checks:checks()}
  };packet.explorer_errors=[];
  const explorerReferences={
   terrain:packet.governed_objectives?.territory_artifact,
   governance:packet.governed_objectives?.holon_map_artifact,
   workflows:packet.governed_objectives?.customer_workflow_artifact,
   impact:packet.intent_impact_artifact,
   ...(packet.explorer_artifacts||{})
  };
  await Promise.all(Object.entries(explorerReferences).filter(([,ref])=>ref?.url).map(async ([key,ref])=>{
   try{
    const detail=await loadJson(new URL(ref.url,new URL(dataPath,location.href)).href,4*1024*1024,ref.sha256);
    if(!detail)throw Error('Evidence is still being prepared');
    const identity=detail.identity||detail;
    if(identity.baseline_commit!==packet.baseline_commit||(key!=='terrain'&&identity.head_commit!==packet.head_commit)||(key==='terrain'&&identity.head_commit&&identity.head_commit!==packet.head_commit))throw Error('Evidence revision mismatch');
    if(identity.repository&&identity.repository!==repo)throw Error('Evidence repository mismatch');
    packet.explorer[key]=detail;
   }catch(error){packet.explorer_errors.push(key+': '+error.message);}
  }));
  packet.explorer.results={checks:checks()};
  let loadedSummary=null;
  const inline=packet.objective_summary;
  if(inline){
   const identity=inline.identity||{};
   if(identity.repository!==repo||identity.head_commit!==sha||identity.baseline_commit!==packet.baseline_commit)throw Error('Semantic summary identity differs from this run.');
   loadedSummary=inline;
  }
  const ref=packet.objective_summary_artifact;
  if(ref){
   const summary=await loadJson(new URL(ref.url,new URL(dataPath,location.href)).href,262144,ref.sha256);
   if(summary){
    const identity=summary.identity||{};
    if(identity.repository!==repo||identity.head_commit!==sha||identity.baseline_commit!==packet.baseline_commit)throw Error('Semantic summary identity differs from this run.');
    loadedSummary=summary;
   }
  }
  const model=reviewExplorer.enrich(codeIntentReviewModel(packet,loadedSummary||{},[],checks()),packet,loadedSummary,checks());
  state.packet=packet;state.packetDigest=digest||null;state.summary=loadedSummary;state.model=model;
  return true;
 }catch(error){state.error='Review evidence unavailable: '+error.message;return true;}
 finally{state.loadingArtifact=false;}
}
async function poll(){
 let changed=false;
 try{
  if(!api||!repo||!sha)throw Error('This link is missing api, repo, or sha.');
  const response=await fetch(statusUrl(),{cache:'no-store'});if(!response.ok)throw Error('Status returned HTTP '+response.status+'.');
  const nextStatus=await response.json();
  changed=JSON.stringify(nextStatus)!==JSON.stringify(state.status)||!!state.error;
  state.status=nextStatus;state.error='';
  const reference=state.status?.review_artifact;
  if(!dataPath&&reference?.schema==='review-artifact-reference-v1'&&reference.name==='intent-flow.json'){
   const artifact=new URL(statusUrl());artifact.searchParams.set('detail','review-artifact');artifact.searchParams.set('name',reference.name);dataPath=artifact.href;
  }
  if(state.packet&&reference?.sha256&&reference.sha256!==state.packetDigest){state.packet=null;state.summary=null;state.model=null;}
  if(state.packet){
   if(changed){state.packet.explorer.results={checks:checks()};state.model=reviewExplorer.enrich(codeIntentReviewModel(state.packet,state.summary||{},[],checks()),state.packet,state.summary,checks());}
  }else changed=await loadArtifacts()||changed;
 }catch(error){const message='Live pipeline unavailable: '+error.message;changed=message!==state.error;state.error=message;}
 const commentChanged=await refreshReviewComment();
 if(changed||commentChanged)render({preserveScroll:true});
 pollTimer=setTimeout(poll,state.status?.state==='completed'?15000:1500);
}

function iconFor(value){return value.state==='passed'?'<span class="dot ok">✓</span>':value.state==='error'?'<span class="dot bad">!</span>':value.state==='warn'?'<span class="dot warn">!</span>':'<span class="dot run"></span>';}
function badgeFor(value){return value.state==='passed'?'<span class="verdict pass">PASS</span>':value.state==='error'?'<span class="verdict violation">REVIEW</span>':value.state==='warn'?'<span class="verdict warn">REVIEW</span>':'';}
function phaseRow(name,value){return `<div class="check" data-phase="${esc(name)}">${iconFor(value)}<span><b>CodeIntent / ${esc(name)}</b><small aria-live="polite">${esc(value.line)}</small></span>${badgeFor(value)}</div>`;}
function verdict(){return state.status?.verdict||'';}
function githubHead(){
 const branch=sha.slice(0,12)||'candidate';
 return `<div class="gh-head"><h1>Review FTGO changes <span>#${esc(pr||'—')}</span></h1>
  <div class="gh-meta"><span class="pill">Open</span><span><b>${esc(repo.split('/')[0]||'repository owner')}</b> wants to merge into <code>main</code> from <code>${esc(branch)}</code></span></div></div>`;
}
function checkExplanation(){
 const id=new URLSearchParams(location.search).get('check');
 if(!id||(demo&&rawChecks().some(c=>c.id===id&&walkthroughPipeline.demoEvidenceGap(c))))return '';
 const check=checks().find(value=>value.id===id);
 if(!check)return `<section class="notice"><h2>Check explanation</h2><p>${state.status?'This check is not present in the recorded run.':'Loading the recorded check…'}</p></section>`;
 const findings=(check.findings||[]).filter(value=>value&&typeof value==='object');
 return `<section class="notice" id="check-explanation"><h2>${esc(check.label||check.id)}</h2><p><b>${esc(check.state||'pending')}</b>: ${esc(check.detail||check.summary||'No additional explanation was recorded.')}</p>${findings.length?`<ul>${findings.map(f=>`<li><b>${esc(f.title||f.rule_id||f.name||'Finding')}</b>${f.detail||f.reason||f.observation?`: ${esc(f.detail||f.reason||f.observation)}`:''}</li>`).join('')}</ul>`:''}</section>`;
}
function checksScreen(){
 const analysis=walkthroughPipeline.phase(checks(),ANALYSIS,'Waiting for source analysis');
 const intent=analysis.state==='running'?{state:'pending',line:'Waiting for CodeIntent / analysis'}:walkthroughPipeline.phase(checks(),REVIEW,'Waiting for intent review');
 const completed=state.status?.state==='completed';
 const count=items().length;
 let top,after='';
 if(demo&&completed&&!count&&rawChecks().some(walkthroughPipeline.demoEvidenceGap))return githubHead()+listScreen();
 if(!completed)top='<div class="merge-top"><span class="ic run">…</span><div><h3>Some checks haven’t completed yet</h3><p>CodeIntent is evaluating this revision.</p></div></div>';
 else if(verdict()==='PASS'&&!count){
  top='<div class="merge-top"><span class="ic ok">✓</span><div><h3>All checks have passed</h3><p>2 successful CodeIntent checks</p></div></div>';
  if(state.model?.noGovernedChanges)after='<div class="happy"><span class="face" aria-hidden="true">✓</span><h3>No governed changes require review</h3><p>Analysis passed. No governed behavior changes were selected for review.</p></div>';
  else if(state.model?.semanticStatus==='no_changes'&&!items().length)after='<div class="happy"><span class="face" aria-hidden="true">✓</span><h3>Behavior is unchanged</h3><p>The implementation changed, but no semantic change requiring a decision was established.</p></div>';
 }else{
  top=`<div class="merge-top"><span class="ic bad">!</span><div><h3>${verdict()==='VIOLATION'?'CodeIntent found a violation':verdict()==='UNKNOWN'?'LACKS_DETERMINISTIC_EVIDENCE':'CodeIntent needs review'}</h3><p>${count?`${count} review item${count===1?'':'s'} from the completed checks.`:'The run could not establish an accepted outcome.'}</p></div></div>`;
  after=`<div class="violation-box"><h3>${count?`${count} review item${count===1?'':'s'}`:'Review evidence is incomplete'}</h3><p style="margin:0">${esc(count?'Open CodeIntent to review each behavior, rule finding, and test finding.':state.status?.reason||'Open CodeIntent to review the recorded evidence.')}</p><p style="margin:0"><button type="button" class="btn blue" data-act="open">Review in CodeIntent →</button></p></div>`;
 }
 if(completed&&verdict()==='PASS'&&state.status?.acceptance?.mode==='enforce'&&state.status.acceptance.status!=='ready')top=top.replace('All checks have passed','Analysis passed').replace('2 successful CodeIntent checks','Governance acceptance is reported separately below.');
 return githubHead()+checkExplanation()+`<div class="merge">${top}${phaseRow('analysis',analysis)}${phaseRow('intent review',intent)}</div>${after}${acceptanceNotice()}${runDetails()}`;
}

function intentLines(value){
 const lines=[];
 for(const entry of Array.isArray(value)?value:[value])for(const fact of entry?.facts||[]){
  if(typeof fact!=='string'){lines.push(JSON.stringify(fact));continue;}
  const start=fact.indexOf('{');if(start<0){lines.push(fact);continue;}
  let slots;try{slots=JSON.parse(fact.slice(start));}catch{lines.push(fact);continue;}
  lines.push(fact.slice(0,start).trim().replaceAll('_',' '));
  if(slots.slot&&Object.hasOwn(slots,'value'))lines.push(`  ${slots.slot} := ${typeof slots.value==='string'?slots.value:JSON.stringify(slots.value)}`);
  else for(const [key,item] of Object.entries(slots))lines.push(`  ${key}: ${Array.isArray(item)?item.join(' | '):typeof item==='string'?item:JSON.stringify(item)}`);
 }
 return lines;
}
function diffLines(before,after){return [...before.map(text=>['-',text]),...after.map(text=>['+',text])];}
function sourceLines(item){return codeIntentSourceDiffLines(item.comparison);}
function lines(rows){return rows.map(([mark,text])=>`<span class="${mark==='+'?'a':mark==='-'?'d':''}">${esc((mark||' ')+' '+text)}</span>`).join('');}
function typeIcon(value){
 const type=['Bug','Architecture','Test','Standard','Business','Behavior'].includes(value)?value:'Behavior';
 const paths={
  Bug:'<path d="M9 4h6M10 7V5m4 2V5M7 11H4m3 4H4m16-4h-3m3 4h-3M8 9c0-2 1.8-3 4-3s4 1 4 3v6c0 2.5-1.8 4-4 4s-4-1.5-4-4V9Zm0 3h8"/>',
  Architecture:'<path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM9 14h6v6H9v-6ZM7 10v2h5m5-2v2h-5v2"/>',
  Test:'<path d="M9 3h6m-5 0v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8"/>',
  Standard:'<path d="M7 3h10v18H7V3Zm3 4h4m-4 4h4m-4 4h4"/>',
  Business:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m12 12 6-6"/>',
  Behavior:'<circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M8 6h8M7 8l4 8m6-8-4 8"/>'
 };
 return `<span class="type-icon type-${type.toLowerCase()}" title="${type}" aria-label="${type}"><svg viewBox="0 0 24 24" aria-hidden="true">${paths[type]}</svg></span>`;
}
function row(item,kind){
 const answer=decision(item.id),submitted=confirmed(item);
 const status=item.status==='unknown'?'LACKS_DETERMINISTIC_EVIDENCE':answer==='yes'?(submitted?'Accepted · recorded':'Accept'):answer==='no'?(submitted?'Rejected · recorded':'Reject'):'';
 const type=String(item.reviewType||'Behavior');
 return `<button type="button" class="row ${answer||''} ${submitted?'submitted':''}" data-row="${esc(item.id)}"><span class="t"><b>${esc(item.title||item.summary)}</b>${item.summary?`<span class="row-summary">${esc(item.summary)}</span>`:''}<small class="meta">${esc(item.concept||item.file||item.groundingLabel||'Recorded review evidence')}${item.objective?' · accepted constraint':''}</small></span><span class="row-side">${typeIcon(type)}${status?`<span class="st">${esc(status)}</span>`:''}</span></button>`;
}
function summaryNotice(){
 if(demo)return '';
 const summary=state.summary?.intent_semantics;
 return summary?.status==='unavailable'?`<div class="notice"><b>English descriptions unavailable</b><p>${esc(summary.reason||'The optional explanation step could not complete. Recorded findings remain available below.')}</p></div>`:'';
}
function listScreen(){
 if(!state.model){
  const finished=state.status?.state==='completed';
  const failures=checks().filter(check=>check.state==='error'||check.state==='failed');
  if(demo&&finished&&rawChecks().some(walkthroughPipeline.demoEvidenceGap))return `<div class="ci"><p class="empty-list">No review items to display.</p>${runDetails()}</div>`;
  if(finished||state.error)return `<div class="ci"><div class="error-box" role="status"><h2>Review evidence unavailable</h2><p>${esc(state.error||(failures.length?'Analysis finished with errors; review evidence could not be produced.':'Analysis finished without a recorded review artifact.'))}</p>${failures.length?`<ul>${failures.map(check=>`<li><b>${esc(check.label||check.id)}</b>: ${esc(check.detail||check.summary||'Analysis unavailable')}</li>`).join('')}</ul>`:''}</div>${runDetails()}</div>`;
  return `<div class="ci"><div class="loading">Waiting for recorded review evidence…</div></div>`;
 }
 const all=items();
 const reviewable=all.filter(item=>item.status!=='unknown');
 const complete=(state.model.semanticStatus==='no_changes'||state.model.noGovernedChanges)&&verdict()==='PASS';
 const empty=demo?'No review items to display.':complete?'No change to evaluated governed behavior was established.':'Review evidence is incomplete. An empty list does not establish unchanged behavior.';
 if(!reviewable.length)return `<div class="ci">${complete?'<div class="happy"><span class="face" aria-hidden="true">✓</span><h3>No governed changes require review</h3><p>Analysis passed. No review response is needed for this change.</p></div>':`<p class="empty-list">${empty}</p>`}${acceptanceNotice()}${summaryNotice()}${runDetails()}</div>`;
 const section=(kind,heading)=>{
  const group=reviewable.filter(item=>item.kind===kind);
  if(!group.length)return '';
  const id=kind+'-findings';
  return `<section class="findings-section" aria-labelledby="${id}"><h1 id="${id}">${heading}</h1><ul class="findings-list" aria-label="${heading}">${group.map(item=>`<li><button class="findings-item" type="button" data-row="${esc(item.id)}">${esc(item.summary||item.title)}</button></li>`).join('')}</ul></section>`;
 };
 const sections=[section('change','Did you intend these behavioral changes?'),section('constraint','Did you mean to change these constraints?')].filter(Boolean);
 return `<div class="ci findings-review section-count-${sections.length}"><div class="findings-sections">${sections.join('')}</div>${acceptanceNotice()}${summaryNotice()}${runDetails()}</div>`;
}
// The first changed line on each side of the recorded excerpt, from its patch hunk header.
function changedLines(comparison){
 let base=null,head=null,found=null;
 for(const [mark,text] of comparison?.diffLines||[]){
  const hunk=String(text).match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if(hunk){if(found)break;base=Number(hunk[1]);head=Number(hunk[2]);continue;}
  if(base===null)continue;
  if(mark==='-'){found=found||{base:null,head:null};found.base??=base;base++;}
  else if(mark==='+'){found=found||{base:null,head:null};found.head??=head;head++;}
  else{if(found&&found.base!==null&&found.head!==null)break;base++;head++;}
 }
 return found;
}
function blobUrl(commit,file,line){
 const parts=repo.split('/');
 if(parts.length!==2||!/^[0-9a-f]{40}$/.test(commit||'')||!file)return '';
 return `https://github.com/${parts.map(encodeURIComponent).join('/')}/blob/${commit}/${String(file).split('/').map(encodeURIComponent).join('/')}${line?'#L'+line:''}`;
}
function sourceLinks(item){
 if(!item.file)return '';
 const lines=changedLines(item.comparison)||{},recorded=Number(item.line)||null;
 const added=item.comparison?.before?.text==='(file did not exist in the accepted baseline)';
 const head=blobUrl(sha,item.file,recorded||lines.head),base=added?'':blobUrl(state.packet?.baseline_commit,item.file,lines.base||(!recorded&&lines.head)||null);
 const files=pullRequestUrl()!=='#'?pullRequestUrl()+'/files':'';
 const link=(url,text)=>url?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>`:'';
 const at=line=>line?` line ${line}`:'';
 const links=[link(head,'This PR'+at(recorded||lines.head)),link(base,'Baseline'+at(lines.base)),link(files,'All changed files')].filter(Boolean);
 return links.length?`<div class="source-links"><small>SOURCE</small><code title="${esc(item.file)}">${esc(item.file)}</code><span>${links.join(' · ')}</span></div>`:'';
}
// What a person configured, what the analysis derived from code, and what is model wording.
// Accepted obligations on the consumers this finding's traced event routes reach.
function consumerObligations(item){
 const seen=new Map();
 for(const route of codeIntentContractTrace.contractRoutes(item,state.packet))
  for(const row of route.obligations||[])if(!seen.has(row.obligation_id))seen.set(row.obligation_id,{...row,altered:route.status!=='unchanged'});
  else if(route.status!=='unchanged')seen.get(row.obligation_id).altered=true;
 return [...seen.values()];
}
function findingOrigins(item){
 const finding=(item.findings||[])[0],authority=state.status?.governance_baseline?.authority||{};
 const shortRef=value=>String(value||'').replace(/^gov:/,'').slice(0,12);
 const release=authority.ledger_release?` release ${shortRef(authority.ledger_release)}`:'';
 let people;
 if(item.objective)people=`The accepted constraint above was written and accepted by people in the governance ledger${release}. It is not inferred from this code.`;
 else if(finding?.kind==='standard')people=`Rule ${finding.rule_id} was written and approved by people in this repository's coding standards${finding.basis?` (${finding.basis})`:''}.`;
 else if(finding?.kind==='test')people='None. The test-quality check is a built-in CodeIntent check, not a rule someone configured for this repository.';
 else{
  const consumers=consumerObligations(item),altered=consumers.filter(row=>row.altered),named=(altered.length?altered:consumers).map(row=>row.obligation_id).join(', ');
  people=consumers.length?`No accepted objective covers the changed code itself. The ${altered.length?'consumer that receives the changed value':'consumers on its traced routes'} ${altered.length?'is':'are'} governed by ${named}, written and accepted by people in the governance ledger${release}. See Cross-service contract below.`
   :'None. No accepted objective covers this change, so the question is only whether you intended it.';
 }
 const base=String(state.packet?.baseline_commit||'').slice(0,12),head=sha.slice(0,12);
 const code=[];
 if(finding?.kind==='standard'){
  code.push(`The finding is the recorded result of the coding-standards check on this commit (${head}), which checked ${finding.method||'the changed code'} against rule ${finding.rule_id}.`);
  if(item.comparison?.before?.text!=null)code.push(`The code excerpt is ${item.comparison.scope==='method'?'the changed hunks of that method':'taken'} from the digest-verified PR patch.`);
  const decided={judge:'Whether the code breaks the rule was decided by the coding-standards judge model. It can be wrong; compare the code with the rule.',
   static:'Whether the code breaks the rule was decided by a deterministic static check, not a model.',
   always_flag:'Whether the code breaks the rule was decided by a fixed pattern, not a model.'}[finding.detected_by]
   ||'This run did not record whether the judge model or a static check raised the finding; compare the code with the rule.';
  return `<section class="provenance"><h4>Where this comes from</h4><dl><dt>Set by people</dt><dd>${esc(people)}</dd><dt>Derived from code</dt><dd>${esc(code.join(' '))}</dd><dt>Model wording</dt><dd>${esc('None. The explanation is assembled from the rule and its guidance. '+decided)}</dd></dl></section>`;
 }
 if(item.intentBefore?.length||item.intentAfter?.length)code.push(`The intent facts were extracted by deterministic analysis of the baseline (${base||'unknown'}) and this PR (${head}).`);
 if(item.comparison?.before?.text!=null)code.push(`The code excerpt is ${item.comparison.scope==='method'?'the changed hunks of the recorded method':'taken'} from the digest-verified PR patch.`);
 if(finding)code.push(`The finding itself is the recorded result of the ${finding.kind==='test'?'test-quality':'coding-standards'} check on this commit.`);
 if(item.connections?.length)code.push('The connected outcomes come from the accepted workflow map, matched to the methods this PR changed.');
 if(codeIntentContractTrace.contractRoutes(item,state.packet).length)code.push('The cross-service routes were traced from the baseline and PR source, from the published value to the consumer\'s handler.');
 const model=/AGENT INTERPRETATION/.test(item.groundingLabel||'')?'The summary sentences are written by a model from the recorded facts. They can be wrong; check them against the code.':'None. Every statement here is projected from recorded analysis.';
 return `<details class="provenance" open><summary>Where this comes from</summary><dl><dt>Set by people</dt><dd>${esc(people)}</dd><dt>Derived from code</dt><dd>${esc(code.join(' ')||'No code-derived facts were recorded for this item.')}</dd><dt>Model wording</dt><dd>${esc(model)}</dd></dl></details>`;
}
// The reason a No carries: what the reviewer typed in this session, else the reason already saved
// with the recorded No, so resubmitting without editing keeps it.
function currentReason(review){
 if(!review)return '';
 return state.reasons.get(review.scope)??(review.decision==='unresolved'?review.reason||'':'');
}
// Number only source lines anchored by a recorded patch hunk; excerpts without an anchor stay unnumbered.
function standardCode(item){
 let before=null,after=null;
 const rows=sourceLines(item).map(([mark,text])=>{
  const hunk=String(text).match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if(hunk){before=Number(hunk[1]);after=Number(hunk[2]);return `<div class="standard-diff-line"><span class="line-no"></span><span class="line-no"></span><code>${esc(text)}</code></div>`;}
  const old=mark!=='+'&&before!=null?before++:'',next=mark!=='-'&&after!=null?after++:'';
  return `<div class="standard-diff-line ${mark==='+'?'a':mark==='-'?'d':''}"><span class="line-no">${old}</span><span class="line-no">${next}</span><code>${esc((mark||' ')+' '+text)}</code></div>`;
 }).join('');
 const available=item.comparison?.before?.text!=null&&item.comparison?.after?.text!=null;
 return `<div class="diffs source-only"><section class="pane"><header><h4>Code</h4><span>${esc(item.file)}</span></header>${available?`<div class="standard-numbered-diff">${rows}</div>`:`<p class="evidence-empty">${esc(item.comparison?.reason||'Source comparison unavailable. Open Source evidence for available patches.')}</p>`}</section></div>`;
}
function detailScreen(item){
 const answer=decision(item.id),intent=diffLines(intentLines(item.intentBefore),intentLines(item.intentAfter));
 const connections=item.connections?.length?`<div class="holon"><b>Connected governed outcomes</b><ul>${item.connections.map(connection=>`<li><b>${esc(connection.title)}</b> · ${esc(connection.detail)}</li>`).join('')}</ul></div>`:'';
 const resolution=item.resolution?`<div class="rule"><small>HOW TO RESOLVE IT</small><p>${esc(item.resolution)}</p></div>`:'';
 const interpretation=`<div class="summary"><small>${esc(item.groundingLabel||'RECORDED PIPELINE EVIDENCE')}</small><p>${esc(item.detailSummary||item.summary)}</p></div>`;
 const standard=item.findings?.[0]?.kind==='standard'?item.findings[0]:null;
 const governance=!standard&&Boolean(item.objective);
 const question=standard?`Accept this code as an exception to ${standard.rule_id}?`:'Accept this governed change?';
 // A run whose deterministic checks did not finish never goes in, so its findings take no answers.
 const answersClosed=Boolean(state.status?.llm_review);
 const closedBar=`<div class="ask desc-assessment" role="region" aria-label="Intent assessment"><span class="merge-blocked" role="status">${esc(llmErrorReview.BLOCKED)}</span><b>No answer is taken: deterministic verification did not finish for this run.</b></div>`;
 const yes=standard?'Accept — allow it here':'Accept — this change is intended',no=standard?'Reject — the code must change':'Reject — not acceptable';
 const target=reviewTarget(item),targets=reviewTargets(item);
 const save=state.saves.get(target?.finding.review.scope);
 const review=target?.finding.review,reason=currentReason(review);
 // A No reports the finding as incorrect; the optional reason travels with it to Holonic's review queue.
 const reasonBox='';   // Reject-reason textarea removed; a No records without a free-text reason.
 const reported=review?.decision==='unresolved'?`<div class="rule incorrect-reported"><small>REJECTED · WILL BE FLAGGED ON FUTURE PRS UNTIL ADJUDICATED</small><p>${esc(review.reason||'No reason was given.')}${review.actor?` · ${esc(review.actor)}`:''}</p></div>`:'';
 const selector=targets.length>1?`<label>Finding <select data-review-scope><option value="">Choose a finding</option>${targets.map(t=>`<option value="${esc(t.finding.review.scope)}" ${target===t||target?.finding.review.scope===t.finding.review.scope?'selected':''}>${esc(t.finding.title||t.finding.name||t.finding.id||t.finding.ref)}</option>`).join('')}</select></label>`:'';

 return `<div class="ci desc-page${standard?' standard-page':governance?' governance-page':''}"><article class="tile">
  ${standard?`<div class="tile-head"><h3>${esc(item.title)}</h3></div>
  <div class="summary standard-intro"><p><b>Code standard violation:</b> ${esc(item.detailSummary||item.summary)}</p>${item.resolution?`<p class="standard-resolution"><b>How to resolve it:</b> ${esc(item.resolution)}</p>`:''}</div>
  ${standardCode(item)}
  ${findingOrigins(item)}`:governance?`<div class="tile-head"><h3>${esc(item.title)}</h3></div>
  <div class="governance-intro"><p><b>Violated constraint:</b> ${esc(item.objective)}</p></div>
  <div class="governance-consequences"><p><b>Consequences:</b> ${esc(item.detailSummary||item.summary)}</p></div>
  <div class="ba"><div><small>Before</small>${esc(item.before)}</div><div class="after"><small>With this PR</small>${esc(item.after)}</div></div>
  <div class="diffs governance-intent"><section class="pane"><header><h4>Intent</h4></header>${intent.length?`<pre>${lines(intent)}</pre>`:'<p class="evidence-empty">No intent comparison recorded for this item.</p>'}</section></div>
  ${standardCode(item)}
  ${findingOrigins(item)}`:`  <div class="tile-head"><h3>${esc(item.title)}</h3>${typeIcon(item.reviewType||'Behavior')}</div>
  <div class="tile-sub"><code>${esc(item.method||short(item.file))}</code></div>
  ${item.objective?`<div class="rule"><small>ACCEPTED CONSTRAINT</small><p>${esc(item.objective)}</p></div>`:''}
  ${sourceLinks(item)}
  <div class="ba"><div><small>${esc(item.beforeLabel||'BEFORE')}</small>${esc(item.before)}</div><div class="after"><small>${esc(item.afterLabel||'WITH THIS PR')}</small>${esc(item.after)}</div></div>
  ${interpretation}
  ${findingOrigins(item)}
  <div class="diffs${standard?' source-only':''}">
   ${standard?'':`<section class="pane"><header><b>Intent</b><span>${esc(label(item.concept))}</span></header>${intent.length?`<pre>${lines(intent)}</pre>`:'<p class="evidence-empty">No intent comparison recorded for this item.</p>'}</section>`}
   <section class="pane"><header><b>Code</b><span>${esc(short(item.file))}</span></header>${item.comparison?.before?.text!=null&&item.comparison?.after?.text!=null?`<pre>${lines(sourceLines(item))}</pre>${item.comparison.complete?'':`<p class="evidence-empty">${esc(item.comparison.qualification||'Recorded source excerpt; open more evidence for context.')}</p>`}`:`<p class="evidence-empty">${esc(item.comparison?.reason||'No source comparison recorded for this item. Check the source evidence view for available patches.')}</p>`}</section>
  </div>
`}
  ${codeIntentContractTrace.contractMarkup(item,state.packet,repo,sha)}
  ${codeIntentFindingImpact.findingImpactMarkup(item,state.packet)}
  ${codeIntentRunDetails.findingGapsMarkup(item,state.packet)}
  ${answersClosed?closedBar:item.status==='unknown'?'<div class="ask desc-assessment" role="region" aria-label="Intent assessment"><b>LACKS_DETERMINISTIC_EVIDENCE. Review the analysis gap; assessments are unavailable.</b></div>':item.status==='watch'?'<div class="ask desc-assessment" role="region" aria-label="Intent assessment"><b>This is informational; no response is required.</b></div>':`<div class="ask desc-assessment" role="region" aria-label="Intent assessment"><b>${esc(question)}</b>${selector}<button type="button" class="choice yes" data-act="yes" ${target&&!save?.busy?'':'disabled'} aria-pressed="${answer==='yes'}">${esc(yes)}</button><button type="button" class="choice no" data-act="no" ${target&&!save?.busy?'':'disabled'} aria-pressed="${answer==='no'}">${esc(no)}</button>${reasonBox}<button type="button" class="choice return-github" data-act="return-github" ${answer&&target&&!save?.busy&&returnToCommentUrl()?'':'disabled'} aria-busy="${!!save?.busy}"><span class="return-spinner" aria-hidden="true"><img src="assets/checks-running.gif" width="18" height="18" alt=""></span><span>Return to Github</span></button></div>`}
  ${reported}<section class="compact-evidence" ${standard?'aria-label="Evidence views"':'aria-labelledby="recorded-evidence-heading"'}>${standard?'':'<h4 id="recorded-evidence-heading">Recorded evidence</h4>'}<div id="recorded-evidence">${standard?'':resolution}${connections}${reviewExplorer.pane(item,state.packet,state.summary,checks(),{tab:state.tab,node:state.node,full:state.full,file:state.evidenceFile,methods:state.methods})}</div></section>
 </article></div>`;
}
function runDetails(){return codeIntentRunDetails.runDetailsMarkup(state.status,state.packet,repo,{open:state.runDetailsOpen});}
function acceptanceNotice(){
 const a=state.status?.acceptance;
 if(a?.mode!=='enforce'||a.status==='ready')return '';
 if(verdict()==='PASS')return '';   // a clean pass does not surface the acceptance-record artifact (matches #48; review-service runs never write to the ledger, so acceptance is always "incomplete")
 return `<div class="notice"><b>Governance acceptance: ${esc(a.status||'unavailable')}</b><p>${esc(a.reason||'Acceptance is not ready.')}</p><p>This is separate from the source-analysis result.</p></div>`;
}
function reviewScroll(){
 return {x:scrollX,y:scrollY,panes:[...screen.querySelectorAll('.pane pre')].map(node=>({top:node.scrollTop,left:node.scrollLeft}))};
}
function restoreReviewScroll(saved){
 requestAnimationFrame(()=>{
  scrollTo(saved.x,saved.y);
  [...screen.querySelectorAll('.pane pre')].forEach((node,index)=>{const value=saved.panes[index];if(value){node.scrollTop=value.top;node.scrollLeft=value.left;}});
 });
}
function render(options={}){
 const saved=options.preserveScroll?reviewScroll():null;
 // Polling re-renders the page; keep a reviewer's half-typed reason and caret in place.
 const typing=document.activeElement?.matches?.('[data-review-reason]')?{start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd}:null;
 runContext.textContent=repo+(pr?' · Pull request #'+pr:'');
 const prUrl=pullRequestUrl();prBack.href=prUrl;prBack.hidden=prUrl==='#';
 document.title=`CodeIntent · ${repo||'review'}${pr?' #'+pr:''}`;
 if(state.error&&!state.status&&!state.packet){screen.innerHTML=`<div class="error-box"><b>CodeIntent could not load this run.</b><p>${esc(state.error)}</p><p><a href="/">Return to local PR runs</a></p></div>`;codeIntentCustomerLanguage.sanitize(screen);return;}
 if(state.desc){
  const route=new URLSearchParams(location.search);
  const item=walkthroughPipeline.descriptionItem(items(),state.packet,state.summary,checks(),route.get('check'),route.get('issue'));
  if(item){state.selected=item.id;screen.innerHTML=detailScreen(item);}
  else if(state.status?.llm_review)screen.innerHTML='<div class="notice"><h2>Automated verification is incomplete</h2><p>This PR is not going in in this state. The nondeterministic analysis below reports its source coverage separately and does not satisfy the incomplete deterministic checks.</p></div>';
  else screen.innerHTML=`<div class="notice"><h2>${state.model?'Description unavailable':'Loading issue description…'}</h2><p>${state.model?'No matching description was recorded for this issue.':'Loading the pinned review evidence.'}</p>${state.model?checkExplanation():''}</div>`;
 }else if(state.view==='checks')screen.innerHTML=checksScreen();
 else if(state.selected){const item=items().find(value=>value.id===state.selected);screen.innerHTML=item?detailScreen(item):listScreen();}
 else screen.innerHTML=listScreen();
 const sizeNotice=(state.status?.checks||[]).find(check=>check.id==='reviewability')?.reviewability;
 if(sizeNotice&&sizeNotice.band!=='normal'){
  screen.insertAdjacentHTML('beforeend',`<section class="notice reviewability-notice"><h2>Review scope</h2><p>${esc(sizeNotice.message)}</p></section>`);
 }
 if(state.status?.llm_review){
  screen.insertAdjacentHTML('beforeend',`<section class="llm-fallback-review">${llmErrorReview.render(state.status.llm_review,state.status.checks)}</section>`);
 }
 codeIntentCustomerLanguage.sanitize(screen);
 assessmentResize?.disconnect();
 const assessment=screen.querySelector('.desc-assessment');
 const desc=screen.querySelector('.desc-page');
 document.documentElement.style.removeProperty('scroll-padding-bottom');
 if(assessment&&desc){
  const reserve=()=>{const height=assessment.getBoundingClientRect().height+32;desc.style.paddingBottom=height+'px';document.documentElement.style.scrollPaddingBottom=height+'px';};
  assessmentResize=new ResizeObserver(reserve);assessmentResize.observe(assessment);reserve();
 }
 legacyMethodExplorer.hydrate();
 if(saved)restoreReviewScroll(saved);
 const reasonField=typing&&screen.querySelector('[data-review-reason]');
 if(reasonField){reasonField.focus();reasonField.setSelectionRange(typing.start,typing.end);}
}

// Yes accepts a finding, so it is saved under the reviewer's GitHub identity and
// waits for the server's receipt. The API says how to prove who is answering: a
// GitHub sign-in bounce when that is configured (the page resumes this exact
// request on return), or otherwise a /codeintent-review comment on the PR.
async function saveYes(request,destination,signInAllowed=true){
 const scope=request.scope,page=location.href.split('#')[0];
 try{
  const token=codeIntentFindingReviews.session();
  await codeIntentFindingReviews.submit(token?{...request,session:token}:request);
  location.assign(destination);
 }catch(error){
  if(error.signIn&&signInAllowed){codeIntentFindingReviews.forget();codeIntentFindingReviews.signIn({request,destination},page);return;}
  if(error.confirm){await confirmOnGitHub(request,destination);return;}
  state.saves.set(scope,{request:error.status===409?null:request,busy:false});render();
  window.alert(error.signIn?'GitHub sign-in did not complete. Press Return to Github to try again.':error.message);
 }
}
async function confirmOnGitHub(request,destination){
 const line=codeIntentFindingReviews.command('yes',request.head_sha,request.scope);
 const message='Confirm your Yes from your GitHub account: post this as a new comment on the pull request.';
 let copied=false;
 try{await navigator.clipboard.writeText(line);copied=true;}catch(error){}
 if(copied)window.alert(message+' It is copied to your clipboard.');
 else window.prompt(message,line);
 location.assign(destination.split('#')[0]+'#new_comment_field');
}
document.addEventListener('click',async event=>{
 const target=event.target.closest('button,a,[data-row],[data-node],[data-method-id],[data-method-service],input');if(!target)return;
 if(target.closest('.legacy-method-explorer'))return;
 const action=target.dataset.act;
 if(target.dataset.exTab){state.tab=target.dataset.exTab;render();document.querySelector('#rx-tab-'+state.tab)?.focus();return;}
 if(target.dataset.node){state.node=target.dataset.node;render();return;}
 if(action==='graph-full'){state.full=!state.full;state.node=null;render();return;}
 // A method in a finding's impact list opens the impact map with that method selected.
 if(target.dataset.impactMethod){
  state.tab='obj';state.methods.governedMethod=target.dataset.impactMethod;state.methods.governedHolon=null;render();
  document.querySelector('.legacy-method-explorer')?.scrollIntoView({behavior:'smooth',block:'start'});return;
 }

 if(action==='open'){navigate('review');}
 else if(action==='checks'){event.preventDefault();navigate('checks');}
 else if(target.dataset.row){state.evidenceFile='';state.node=null;state.full=false;navigate('review',target.dataset.row);scrollTo(0,0);}
 else if((action==='yes'||action==='no')&&state.status?.llm_review)return;
 else if(action==='yes'||action==='no'){
  const item=items().find(i=>i.id===state.selected),review=reviewTarget(item);
  if(!review||item.status==='unknown'||item.status==='watch'||state.saves.get(review.finding.review.scope)?.busy)return;
  state.drafts.set(review.finding.review.scope,action);render();
  document.querySelector(`.desc-assessment [data-act="${action}"]`)?.classList.add('choice-selected');
 }
 else if(action==='return-github'){
  const item=items().find(i=>i.id===state.selected),review=reviewTarget(item),destination=returnToCommentUrl();
  if(!review||!destination||item.status==='unknown'||item.status==='watch')return;
  const scope=review.finding.review.scope,answer=decision(item.id),prior=state.saves.get(scope);
  if(!answer||prior?.busy)return;
  const reason=answer==='no'?String(currentReason(review.finding.review)).trim():'';
  // Demo: record the Accept/Reject anonymously on click, then return to GitHub. No identity
  // is collected; both answers are one plain POST to the review_service decision endpoint.
  const request=prior?.request&&prior.request.answer===answer&&(prior.request.reason||'')===reason?prior.request:{repository:repo,pull_request:Number(pr),head_sha:sha,scope,answer,boundary_sig:review.finding.review.boundary_sig,check_id:review.check.id,finding_ref:review.finding.ref||review.finding.id,request_id:crypto.randomUUID(),...(reason?{reason}:{})};
  state.saves.set(scope,{request,busy:true});render();
  try{
   await codeIntentFindingReviews.submit(request);
   location.assign(destination);
  }catch(error){
   state.saves.set(scope,{request:error.status===409?null:request,busy:false});render();
   window.alert(error.message);
  }
 }


});
// Polling re-renders; keep the run-details panel as the reviewer left it.
document.addEventListener('toggle',event=>{if(event.target.matches?.('[data-run-details]'))state.runDetailsOpen=event.target.open;},true);
document.addEventListener('input',event=>{
 if(!event.target.matches('[data-review-reason]'))return;
 const review=reviewTarget(items().find(i=>i.id===state.selected));
 if(review)state.reasons.set(review.finding.review.scope,event.target.value);
});
document.addEventListener('change',event=>{
 if(event.target.matches('[data-review-scope]')){state.reviewScope=event.target.value;render();return;}

 if(event.target.matches('[data-evidence-file]')){state.evidenceFile=event.target.value;state.node=null;render();document.querySelector('[data-evidence-file]')?.focus();}
});
document.addEventListener('keydown',event=>{
 if(event.target.matches('input,textarea,select')||event.ctrlKey||event.metaKey||event.altKey)return;
 if(event.target.matches('[role="tab"]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const ts=[...document.querySelectorAll('[data-ex-tab]')],n=ts.indexOf(event.target),next=event.key==='Home'?0:event.key==='End'?ts.length-1:(n+(event.key==='ArrowRight'?1:-1)+ts.length)%ts.length;ts[next].click();return;}
 if(event.target.closest('[data-node]')&&['Enter',' '].includes(event.key)){event.preventDefault();event.target.closest('[data-node]').dispatchEvent(new MouseEvent('click',{bubbles:true}));return;}
 if(state.view!=='review')return;
 if(['j','k'].includes(event.key)&&!state.selected){const rows=[...document.querySelectorAll('[data-row]')];const n=rows.indexOf(document.activeElement);rows[(n+(event.key==='j'?1:-1)+rows.length)%rows.length]?.focus();event.preventDefault();}
 if(state.selected&&['y','n'].includes(event.key)){document.querySelector(`[data-act="${event.key==='y'?'yes':'no'}"]`)?.click();event.preventDefault();}
});
legacyMethodExplorer.setRender(render);
addEventListener('popstate',()=>{
 const route=new URLSearchParams(location.search),view=route.get('view')==='checks'?'checks':'review';
 state.desc=walkthroughPipeline.isDescriptionRoute(route);state.view=view;state.selected=view==='review'?(route.get('item')||null):null;render();
});
const theme=document.querySelector('#theme');
function setTheme(value){
 document.documentElement.dataset.theme=value;
 const action=value==='dark'?'Use light theme':'Use dark theme';
 theme.textContent=value==='dark'?'☀':'☾';
 theme.setAttribute('aria-label',action);theme.title=action;
}
setTheme(localStorage.getItem('codeintent-theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));
theme.addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';localStorage.setItem('codeintent-theme',next);setTheme(next);});
const signedIn=codeIntentFindingReviews.finishSignIn();
const resumed=signedIn?.pending?.request,resumeTo=signedIn?.pending?.destination;
if(resumed)state.drafts.set(resumed.scope,'yes');
render();poll();resolveReturnComment();
if(signedIn?.error)setTimeout(()=>window.alert(signedIn.error),0);
else if(resumed&&/^https:\/\/github\.com\//.test(resumeTo||'')&&resumed.repository===repo&&resumed.head_sha===sha){
 state.saves.set(resumed.scope,{request:resumed,busy:true});render();
 saveYes(resumed,resumeTo,false);
}
})();
