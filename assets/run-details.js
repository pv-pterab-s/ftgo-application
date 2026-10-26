/* What one run covered: compared revisions, analyzed components, each check's real completeness and
   time, and where analysis stopped. A check can report "passed" while parts of it did not run; this
   view says so instead of repeating the green state. Gaps are unanalyzed evidence, not defects. */
(function(root){
'use strict';
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const shortSha=value=>String(value||'').slice(0,7);
const humanize=value=>String(value||'').replaceAll('_',' ').replace(/^./,char=>char.toUpperCase());
const isTest=file=>/\/src\/(?:test|integration-test|integrationTest|component-test)\//.test('/'+(file||''));
// "ftgo-order-service/src/..." -> "order service"; code outside a service is shared code.
function component(file){
 const top=String(file||'').split('/')[0]||'';
 if(/-service$/.test(top))return top.replace(/^ftgo-/,'').replace(/-service$/,' service');
 return top&&String(file).includes('/')?`shared code (${top})`:'repository root';
}
// "pkg.Class#method/2" -> "Class.method"; "Class.method(...)" keeps its last two parts; a bare class is its simple name.
const ownerName=value=>{
 const text=String(value||'').split('::').pop(),canonical=text.match(/(?:^|\.)([^.#]+)#([^/(]+)/);
 if(canonical)return `${canonical[1]}.${canonical[2]}`;
 return text.includes('(')?text.replace(/\(.*$/,'').split('.').slice(-2).join('.'):text.split('.').pop();
};

const GAP_REASONS={
 class_initializer_source_changed:'Field initializers changed in a way the analysis does not compare',
 class_initializer_source_unavailable:'Field initializers could not be read on one side of the comparison',
 comparison_source_missing:'The baseline copy of this file was not available to compare',
 comparison_source_sha_mismatch:'The baseline copy of this file did not match the accepted baseline',
 comparison_source_parse_failed:'This file could not be parsed for comparison',
 accepted_source_witness_schema_retained:'Compared using facts recorded in an older baseline format',
 changed_unresolved_return_construction:'A changed return value is built in a way the analysis cannot follow',
 return_construction_chain_unresolved:'A returned value is built in a way the analysis cannot follow',
 governance_constrained_region_unmapped:'Governed code changed outside any mapped objective region',
 semantic_evidence_budget_exceeded:'The evidence for this change exceeded the judgment size limit',
 after_source_parse_incomplete:'The changed file could not be fully parsed',
 after_owner_relocated_or_ambiguous:'The changed method moved or could not be identified uniquely',
};
const TRACE_STATUS={
 verified:['traced','Event routes between services were traced from the accepted baseline.'],
 verified_index_with_supplied_overlay:['traced','Event routes between services were traced from the accepted baseline.'],
 verified_supplied_source_inventory:['traced','Event routes between services were traced from the full baseline source.'],
 verified_not_affected:['traced','Event routes between services were checked; this change touches none of them.'],
 accepted_trace_index_missing:['not_traced','Event routes between services were not traced: the accepted baseline has no trace index.'],
 supplied_source_closure_identity_invalid:['not_traced','Event routes between services were not traced: the accepted baseline has no trace index.'],
 trace_source_scope_budget_exceeded:['not_traced','Event routes between services were not traced: the repository exceeds the tracer\'s limit of 1,000 Java files or 16 MB.'],
 trace_source_closure_budget_exceeded:['not_traced','Event routes between services were not traced: the traced route sources exceed the 512 KB limit.'],
 accepted_inventory_identity_invalid:['not_traced','Event routes between services were not traced: the base commit\'s source did not match the accepted baseline.'],
 not_recorded:['not_traced','This run did not record whether event routes between services were traced.'],
};
const STOP_CODES={
 event_publisher_not_found:'no publisher was found',
 publisher_event_payload_missing_or_ambiguous:'the published payload could not be identified',
 publisher_receiver_unresolved:'the publisher could not be resolved',
 event_type_missing_or_ambiguous:'the event type could not be identified',
 subscriber_does_not_read_field:'the subscriber does not read this field',
 consumer_mapper_missing:'the consumer mapping could not be followed',
};
const gapText=gap=>GAP_REASONS[gap.reason]||humanize(gap.reason||'Analysis stopped');
const stopText=row=>`${row.event_type?String(row.event_type).split('.').pop()+': ':''}${STOP_CODES[row.code]||humanize(row.code)}`;

function seconds(start,end){
 const a=Date.parse(start||''),b=Date.parse(end||'');
 return Number.isFinite(a)&&Number.isFinite(b)&&b>=a?(b-a)/1000:null;
}
const formatSeconds=value=>value===null?'—':value<10?value.toFixed(1)+' s':Math.round(value)+' s';

// A check's real completeness. "Passed" stays only when nothing in its own record says part of it did not run.
function checkCoverage(check){
 const detail=String(check.detail||check.summary||'');
 const subchecks=(check.subchecks||[]).filter(row=>row&&typeof row==='object');
 const missed=subchecks.filter(row=>row.state&&!['passed','skipped'].includes(row.state));
 const notes=[];
 const coverage=check.coverage;
 if(coverage?.schema==='check-coverage-v1'){
  if(coverage.enforcement==='watch_only')notes.push('Watch-only: performed checks are advisory');
  for(const reason of coverage.reasons||[])notes.push(humanize(reason));
  if(coverage.completeness==='not_recorded')notes.push('Scope completeness was not recorded');
 }
 if(missed.length){
  const reasons=[...new Set(missed.flatMap(row=>(row.gaps||[]).map(text=>String(text).replace(/^region:[0-9a-f]+:\s*/,'').replace(/:\s*[0-9a-f]{64}$/,''))))];
  notes.push(`${missed.length} of ${subchecks.length} parts did not run (${missed.map(row=>row.label||row.id).join(', ')})${reasons.length?': '+reasons.join('; '):''}`);
 }
 const unjudged=detail.match(/(\d+) not judged/);
 const judged=detail.match(/(\d+) checks? on/);
 if(unjudged&&Number(unjudged[1])>0)notes.push(`${unjudged[1]}${judged?' of '+judged[1]:''} checks were not judged`);
 for(const part of detail.split(/;\s*/))if(/\b(unavailable|not supplied|lower bound)\b/i.test(part)&&!/^0 /.test(part))notes.push(part.replace(/^./,char=>char.toUpperCase()));
 const state=check.state||'pending';
 let status;
 if(state==='error')status='incomplete';
 else if(state==='failed')status='issue';
 else if(['skipped','stopped'].includes(state))status='skipped';
 else if(state==='passed')status=notes.length?'partial':'complete';
 else status='running';
 if(coverage?.schema==='check-coverage-v1'){
  if(coverage.execution==='skipped')status='skipped';
  else if(coverage.execution==='incomplete')status='incomplete';
  else if(state==='passed'&&coverage.completeness!=='reported_scope_complete')status='partial';
 }
 return {id:check.id,label:check.label||humanize(check.id),status,notes,detail,seconds:seconds(check.started_at,check.completed_at)};
}
const STATUS_LABEL={complete:['Passed','ok'],partial:['Passed, incomplete','warn'],issue:['Issue found','bad'],incomplete:['Did not complete','bad'],skipped:['Skipped','muted'],running:['Running','muted']};

function changedFiles(packet){
 const scope=packet?.analysis_scope;
 if(Array.isArray(scope?.changed_files)&&scope.changed_files.length)return {files:scope.changed_files,total:scope.changed_file_count||scope.changed_files.length};
 const diff=packet?.source_diff?.content||'';
 const files=[...new Set([...diff.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].map(match=>match[2]))];
 return {files,total:files.length};
}

function runDetails(status,packet){
 const checks=(status?.checks||status?.stages||[]).map(checkCoverage);
 const starts=(status?.checks||status?.stages||[]).map(row=>Date.parse(row.started_at||'')).filter(Number.isFinite);
 const ends=(status?.checks||status?.stages||[]).map(row=>Date.parse(row.completed_at||'')).filter(Number.isFinite);
 const checkSeconds=starts.length&&ends.length?(Math.max(...ends)-Math.min(...starts))/1000:null;
 const {files,total}=changedFiles(packet);
 const byComponent=new Map();
 for(const file of files){const key=component(file);if(!byComponent.has(key))byComponent.set(key,{name:key,files:[],tests:0});const row=byComponent.get(key);row.files.push(file);if(isTest(file))row.tests++;}
 const scope=packet?.analysis_scope||null;
 const gaps=(scope?.gaps||[]).filter(gap=>gap&&typeof gap==='object');
 const tracing=scope?.cross_service_tracing||null;
 let trace=TRACE_STATUS[tracing?.status]||(tracing?['not_traced',`Event routes between services were not traced (${humanize(tracing.status)}).`]:null);
 if(trace&&trace[0]==='traced'&&tracing.index_source==='accepted_inventory')trace=['traced',trace[1].replace(/from the accepted baseline\.$/,'from the base commit\'s source, checked file by file against the accepted baseline.')];
 const notCovered=[];
 for(const check of checks)if(['partial','incomplete','skipped'].includes(check.status))notCovered.push({kind:'check '+check.status,title:check.label,text:check.notes.join('. ')||check.detail||STATUS_LABEL[check.status][0]});
 const productionGaps=gaps.filter(gap=>!gap.test_only),testGaps=gaps.length-productionGaps.length;
 for(const gap of productionGaps)notCovered.push({kind:'gap',title:gap.owner?ownerName(gap.owner):gap.path?gap.path.split('/').pop():gap.boundary_id||'Analysis',text:gapText(gap),file:gap.path||''});
 if(scope&&scope.gap_count>gaps.length)notCovered.push({kind:'gap',title:'More gaps',text:`${scope.gap_count-gaps.length} further gaps were recorded but not listed.`});
 const unmatched=(scope?.unresolved_context||[]).filter(row=>row.kind==='unmatched_cameron_method');
 if(unmatched.length)notCovered.push({kind:'gap',title:'Native call analysis',text:`${scope.unresolved_context_count>unmatched.length?scope.unresolved_context_count:unmatched.length} changed method(s) could not be matched to the native call graph, so their callers were not followed: ${unmatched.slice(0,5).map(row=>ownerName(row.identity)).join(', ')}${unmatched.length>5?'…':''}`});
 if(scope?.parse_error_count)notCovered.push({kind:'gap',title:'Parsing',text:`${scope.parse_error_count} file(s) could not be parsed.`});
 if(trace&&trace[0]!=='traced')notCovered.push({kind:'trace',title:'Cross-service events',text:trace[1]});
 const stopped=tracing?.changed_routes?.stopped||[];
 if(stopped.length)notCovered.push({kind:'trace',title:'Cross-service events',text:`Tracing stopped on ${tracing.changed_routes.stopped_count} route(s) this change touches: ${[...new Set(stopped.map(stopText))].join('; ')}.`});
 return {
  base:packet?.baseline_commit||status?.governance_baseline?.baseline_commit||'',head:status?.sha||packet?.head_commit||'',
  governance:status?.governance_baseline||null,
  components:[...byComponent.values()].sort((a,b)=>a.name.localeCompare(b.name)),fileTotal:total,
  units:scope?{direct:scope.direct_unit_count,context:scope.context_unit_count,reused:scope.reused_unit_count}:null,
  checks,checkSeconds,runSeconds:seconds(status?.started_at,status?.updated_at),completed:status?.state==='completed',
  trace,routes:tracing?.changed_routes||null,testGaps,notCovered,scopeRecorded:Boolean(scope),
 };
}

function commitLink(repo,commit,text){
 const parts=String(repo||'').split('/');
 if(parts.length!==2||!/^[0-9a-f]{40}$/.test(commit||''))return `<code>${escapeHtml(shortSha(commit)||'unknown')}</code>`;
 return `<a href="https://github.com/${parts.map(encodeURIComponent).join('/')}/commit/${commit}" target="_blank" rel="noopener"><code>${escapeHtml(shortSha(commit))}</code></a>${text?' '+escapeHtml(text):''}`;
}

function runDetailsMarkup(status,packet,repo,options={}){
 if(!status)return '';
 const run=runDetails(status,packet);
 const gapCount=run.notCovered.length;
 const summary=[`${run.fileTotal} changed file${run.fileTotal===1?'':'s'} in ${run.components.length} component${run.components.length===1?'':'s'}`,
  run.checkSeconds!==null?`checks took ${formatSeconds(run.checkSeconds)}`:'',
  run.completed?(gapCount?`${gapCount} item${gapCount===1?'':'s'} not fully covered`:'nothing recorded as uncovered'):'still running'].filter(Boolean).join(' · ');
 const governance=run.governance?.governance_version?`<dd>Governance ${escapeHtml(String(run.governance.governance_version).replace(/^gov:/,'').slice(0,12))} · ${escapeHtml(run.governance.workflows||0)} accepted workflows${run.governance.accepted_obligations?` · ${escapeHtml(run.governance.accepted_obligations)} proved obligations`:''}</dd>`:'';
 const units=run.units?`<p class="run-note">${escapeHtml(run.units.direct)} changed method${run.units.direct===1?'':'s'} analyzed directly, ${escapeHtml(run.units.context)} connected method${run.units.context===1?'':'s'} re-checked${run.units.reused!==null?`, ${escapeHtml(run.units.reused)} reused unchanged from the baseline`:''}.</p>`:'';
 const components=run.components.length?`<ul class="run-components">${run.components.map(row=>`<li><b>${escapeHtml(row.name)}</b> <span>${row.files.length} file${row.files.length===1?'':'s'}${row.tests?` (${row.tests} test)`:''}</span></li>`).join('')}</ul>${run.fileTotal>run.components.reduce((n,row)=>n+row.files.length,0)?`<p class="run-note">${run.fileTotal} files changed; the first ${run.components.reduce((n,row)=>n+row.files.length,0)} are listed.</p>`:''}`:'<p class="run-note">No changed files were recorded.</p>';
 const checks=run.checks.length?`<table class="run-checks"><thead><tr><th>Check</th><th>Result</th><th>Time</th></tr></thead><tbody>${run.checks.map(check=>{const [text,tone]=STATUS_LABEL[check.status];return `<tr><td>${escapeHtml(check.label)}</td><td><span class="run-state ${tone}">${escapeHtml(text)}</span></td><td>${escapeHtml(formatSeconds(check.seconds))}</td></tr>`;}).join('')}</tbody></table>`:'<p class="run-note">No checks were published for this run.</p>';
 const uncovered=run.notCovered.length?`<ul class="run-gaps">${run.notCovered.map(row=>`<li class="${escapeHtml(row.kind)}"><b>${escapeHtml(row.title)}</b><span>${escapeHtml(row.text)}</span>${row.file?`<code>${escapeHtml(row.file)}</code>`:''}</li>`).join('')}</ul>`:`<p class="run-note">${run.completed?'No check or analysis step recorded a gap.':'The run has not finished.'}</p>`;
 const changedRoutes=new Set([...(run.routes?.removed||[]),...(run.routes?.added||[])].map(row=>`${row.event_type}.${row.event_field}>${row.handler_owner}`)).size;
 const routes=changedRoutes?`<p class="run-note">${changedRoutes} traced event route${changedRoutes===1?'':'s'} between services changed. They are listed on the affected findings.</p>`:'';
 const traced=run.trace&&run.trace[0]==='traced'?`<p class="run-note">${escapeHtml(run.trace[1])} Only supported Java event shapes are traced; HTTP calls and saga commands are not.</p>`:'';
 const scopeMissing=run.scopeRecorded?'':'<p class="run-note">This run did not record analysis gaps. Runs from before this view was added show checks only.</p>';
 return `<details class="run-details" data-run-details${options.open?' open':''}><summary><b>What this run covered</b><span>${escapeHtml(summary)}</span></summary>
  <dl class="run-revisions"><dt>Compared</dt><dd>Accepted baseline ${commitLink(repo,run.base)} → this PR ${commitLink(repo,run.head)}</dd>${governance?`<dt>Governance</dt>${governance}`:''}${run.runSeconds!==null?`<dt>Elapsed</dt><dd>${escapeHtml(formatSeconds(run.runSeconds))} from the first check to the last update</dd>`:''}</dl>
  <h4>Components analyzed</h4>${components}${units}
  <h4>Checks</h4>${checks}
  <h4>Not covered</h4>${uncovered}${routes}${traced}${scopeMissing}${run.testGaps?`<p class="run-note">${run.testGaps} gap${run.testGaps===1?'':'s'} in test code only, not listed.</p>`:''}
  <p class="run-note">CodeIntent reads source; it does not run the services. Runtime configuration, database contents, message delivery and third-party systems are outside this analysis.</p>
 </details>`;
}

// The flows behind one review item: same id, same method, or same changed file.
function itemFlows(item,packet){
 const flows=(packet?.flows||[]).filter(flow=>flow&&typeof flow==='object');
 const exact=flows.filter(flow=>flow.id===item.id||(item.flowIds||[]).includes(flow.id));
 if(exact.length)return exact;
 const byMethod=item.methodRef?flows.filter(flow=>flow.method===item.methodRef):[];
 if(byMethod.length)return byMethod;
 return item.file?flows.filter(flow=>flow.source?.file===item.file||(flow.affected_paths||[]).includes(item.file)):[];
}

// Analysis gaps and trace stops that touch this finding's file, method, boundary or governed region.
function findingGaps(item,packet){
 const scope=packet?.analysis_scope;
 if(!scope||!item)return [];
 const flows=itemFlows(item,packet);
 const regions=new Set(flows.flatMap(flow=>(flow.concepts||[]).map(row=>row.unit_id).filter(Boolean)));
 const boundaries=new Set(flows.map(flow=>flow.boundary_id).filter(Boolean));
 const files=new Set([item.file,...flows.flatMap(flow=>[flow.source?.file,...(flow.affected_paths||[])])].filter(Boolean));
 const ownerClass=value=>String(value||'').split('#')[0].split('::').pop().replace(/\(.*$/,'');
 const methodClass=ownerClass(item.methodRef);
 const notes=[];
 for(const gap of scope.gaps||[]){
  if(!gap||gap.test_only)continue;
  const touches=(gap.path&&files.has(gap.path))||(gap.owner&&methodClass&&(gap.owner===methodClass||methodClass.endsWith('.'+gap.owner)||gap.owner.startsWith(methodClass+'#')))
   ||(gap.boundary_id&&boundaries.has(gap.boundary_id)&&(!(gap.intent_region_ids||[]).length||(gap.intent_region_ids||[]).some(id=>regions.has(id))));
  if(touches)notes.push({kind:'gap',text:gapText(gap)+(gap.owner?` (${ownerName(gap.owner)})`:'')});
 }
 for(const row of scope.unresolved_context||[])if(row.kind==='unmatched_cameron_method'&&item.methodRef&&ownerName(row.identity)===ownerName(item.methodRef))notes.push({kind:'gap',text:'This method could not be matched to the native call graph, so its callers were not followed.'});
 for(const flow of flows){
  const trace=flow.cross_service_trace;if(!trace)continue;
  if(trace.stopped_count)notes.push({kind:'trace',text:`Cross-service tracing stopped: ${[...new Set((trace.stopped||[]).map(stopText))].join('; ')}.`});
 }
 const seen=new Set();
 return notes.filter(note=>!seen.has(note.text)&&seen.add(note.text));
}

function findingGapsMarkup(item,packet){
 const notes=findingGaps(item,packet);
 if(!notes.length)return '';
 return `<section class="finding-gaps" aria-label="Analysis limits for this finding"><h4>Analysis limits for this finding</h4><ul>${notes.map(note=>`<li class="${escapeHtml(note.kind)}">${escapeHtml(note.text)}</li>`).join('')}</ul><p>These mark evidence the analysis did not follow or a route it traced. They are not defects. Check them before relying on this finding.</p></section>`;
}

const api={runDetails,runDetailsMarkup,checkCoverage,findingGaps,findingGapsMarkup,itemFlows,ownerName};
root.codeIntentRunDetails=api;
if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
