/* Recorded evidence exploration; reviewer assessments never authorize governance. */
(function(root){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=v=>esc(JSON.stringify(v??null,null,2));
const pipeline=root.walkthroughPipeline||(typeof require==='function'?require('./walkthrough-model.js'):null);
const gap=(check,checks)=>['error','blocked'].includes(check.state)&&!pipeline?.intentionalSkip(check,checks);
const tabs=[['obj','Governed boundaries'],['graph','Impact graph'],['path','Behavior path'],['src','Source evidence'],['analysis','Analysis details'],['ask','Ask CodeIntent']];
function recordedText(fact){
 if(!fact)return 'no recorded value';
 if(Array.isArray(fact.allowed))return fact.allowed.join(', ');
 if(Array.isArray(fact.arguments))return fact.arguments.join(', ');
 const args=fact.value?.attrs?.arguments;
 if(Array.isArray(args)){
  const values=args.map(arg=>arg?.attrs?.member||arg?.attrs?.qualifier||arg?.node||'value');
  return fact.scope==='source_return_construction'?values[0]:values.join(', ');
 }
 return fact.value?.attrs?.member||fact.value?.node||fact.operation||fact.slot||'recorded value';
}
function unjudgedCard(entry,index){
 const before=recordedText(entry.before?.[0]),after=recordedText(entry.after?.[0]);
 const method=entry.method||'This code path';
 const added=(entry.after?.[0]?.allowed||[]).filter(value=>!(entry.before?.[0]?.allowed||[]).includes(value));
 const summary=entry.form==='state_transition'&&added.length
  ? `${method} can now run when state is ${added.join(' or ')}, in addition to ${before}.`
  : `${method} now uses ${after} instead of ${before}.`;
 // A boundary ID alone is not an accepted constraint.  Only an explicit
 // objective/constraint binding belongs in the constraint list; otherwise
 // this is a potential behavioral change.
 const objective=entry.objective||entry.governance_objective||entry.constraint||'';
 return {id:'recorded-impact:'+index,flowIds:String(entry.flow_id||'').split('+').filter(Boolean),kind:objective?'constraint':'change',status:'review',
  file:entry.changed?.file||'',method,title:summary,summary,before,after,connections:[],intentBefore:entry.before||[],intentAfter:entry.after||[],reviewType:'Behavior',
  objective,concept:entry.boundary_id||'Recorded changed behavior',groundingLabel:'RECORDED BEFORE/AFTER EVIDENCE · BOUNDARY JUDGMENT NOT SUPPLIED',
  qualification:'This is a direct comparison of recorded source facts. It is not a governance decision or a runtime guarantee.'};
}
function enrich(model,packet,summary,checks){
 const result={...model,changes:[...model.changes],constraints:[...model.constraints]};
 if(!result.changes.length&&!result.constraints.length&&model.semanticStatus!=='no_changes'){
  const unjudged=(packet.explorer?.impact?.unjudged||[]).filter(entry=>entry&&entry.changed?.file&&entry.before?.length&&entry.after?.length&&recordedText(entry.before[0])!==recordedText(entry.after[0]));
  if(unjudged.length){
   const cards=unjudged.map(unjudgedCard);
   result.changes.push(...cards.filter(card=>card.kind==='change'));
   result.constraints.push(...cards.filter(card=>card.kind==='constraint'));
   return result;
  }
  const groups=new Map();
  for(const flow of packet.flows||[]){if(flow.change_kind==='context_only')continue;const file=flow.source?.file||'Unlocated evidence';if(!groups.has(file))groups.set(file,[]);groups.get(file).push(flow);}
  for(const [file,flows] of groups)result.changes.push({id:'recorded:'+file,kind:'change',status:'unknown',file,title:file.split('/').pop(),method:'',summary:`${flows.length} recorded analysis entries; semantic outcome not established.`,before:'Inspect the recorded baseline evidence.',after:'Inspect the recorded candidate evidence.',connections:[],intentBefore:[],intentAfter:[],reviewType:'Behavior',groundingLabel:'RECORDED EVIDENCE · OUTCOME UNRESOLVED',qualification:'Source changes and extraction differences alone do not establish a behavior change.'});
 }
 for(const check of checks||[]){if(!gap(check,checks))continue;result.changes.push({id:'coverage:'+check.id,kind:'change',status:'unknown',file:'',title:check.label||check.id,summary:check.detail||'Required analysis is incomplete.',before:'An established comparison is required.',after:'Cannot be established from this run.',connections:[],reviewType:'Behavior',groundingLabel:'RECORDED ANALYSIS GAP',check});}
 result.noGovernedChanges=Boolean(checks?.length)&&checks.every(c=>['passed','skipped'].includes(c.state)||pipeline?.intentionalSkip(c,checks))&&!(packet.flows||[]).some(f=>f.change_kind!=='context_only')&&!result.changes.length&&!result.constraints.length&&checks?.some(c=>c.id==='intent_diff'&&c.state==='passed')&&checks?.some(c=>c.id==='governance_decision'&&c.state==='passed');
 return result;
}
function flowsFor(item,packet){const ids=new Set(item.flowIds||[]);return (packet?.flows||[]).filter(f=>ids.has(f.id)||f.id===item.id||(item.file&&f.source?.file===item.file));}
function coverage(packet,summary,checks){
 const flows=packet?.flows||[];const methods=new Set(flows.filter(f=>f.change_kind==='source_changed').map(f=>f.method).filter(Boolean));
 const gaps=(checks||[]).filter(c=>gap(c,checks));
 return `<details class="rx-coverage"><summary><b>Unchanged results and analysis coverage</b> · ${methods.size} changed methods represented · ${gaps.length} incomplete checks</summary><p>Counts describe the supplied artifact, not the entire pull request. Recorded graph differences do not by themselves establish changed behavior.</p><ul>${gaps.map(c=>`<li><b>${esc(c.label||c.id)}:</b> ${esc(c.detail)}</li>`).join('')||'<li>No incomplete checks reported.</li>'}</ul><p>Explanation: ${esc(summary?.intent_semantics?.status||'unavailable')}. ${esc(summary?.intent_semantics?.reason||'')}</p>${(summary?.intent_semantics?.omitted_change_ids||[]).length?`<p>${summary.intent_semantics.omitted_change_ids.length} changes omitted from the explanation.</p>`:''}<p>${esc(packet?.qualification||'No claim is made about behavior outside the evaluated scope.')}</p></details>`;
}
function graphData(item,packet,full){
 const graph=packet?.graph||{nodes:[],edges:[]};const flows=flowsFor(item,packet);const seeds=new Set([item.id,'episode:'+item.id,'source:'+item.file,...flows.flatMap(f=>[f.id,'episode:'+f.id])]);
 const selected=new Set(seeds);for(const e of graph.edges||[])if(seeds.has(e.from)||seeds.has(e.to)){selected.add(e.from);selected.add(e.to);}
 const allNodes=(graph.nodes||[]).filter(n=>full||selected.has(n.id));const nodes=allNodes.slice(0,60);const ids=new Set(nodes.map(n=>n.id));
 return {nodes,edges:(graph.edges||[]).filter(e=>ids.has(e.from)&&ids.has(e.to)),omitted:allNodes.length-nodes.length};
}
function graphPane(item,packet,options){
 const g=graphData(item,packet,options.full);if(!g.nodes.length)return '<p>No recorded graph connections are supplied for this item.</p>';
 const nodeLabel=n=>n.label||n.title||(packet.flows||[]).find(f=>n.id===f.id||n.id==='episode:'+f.id)?.method?.split('::').pop()||n.id;
 const selected=g.nodes.find(n=>n.id===options.node);const width=960,height=Math.ceil(g.nodes.length/3)*100+30;const positions=new Map(g.nodes.map((n,i)=>[n.id,{x:20+i%3*315,y:20+Math.floor(i/3)*100}]));
 return `<p>Recorded relationships; these are not a runtime execution trace.</p><button type="button" class="btn" data-act="graph-full">${options.full?'Show related evidence':'Show wider graph context'}</button><div class="rx-graph"><svg viewBox="0 0 ${width} ${height}" role="group" aria-label="Recorded impact graph">${g.edges.map(e=>{const a=positions.get(e.from),b=positions.get(e.to);return `<path d="M${a.x+135} ${a.y+30} L${b.x+135} ${b.y+30}" class="rx-edge"><title>${esc(e.kind)}</title></path>`;}).join('')}${g.nodes.map(n=>{const p=positions.get(n.id);return `<g role="button" tabindex="0" data-node="${esc(n.id)}" aria-label="${esc(nodeLabel(n))}"><rect x="${p.x}" y="${p.y}" width="280" height="64" rx="8"/><text x="${p.x+8}" y="${p.y+24}">${esc(String(nodeLabel(n)).slice(-35))}</text><text x="${p.x+8}" y="${p.y+47}">${esc(n.kind||'Recorded node')}</text></g>`;}).join('')}</svg></div>${g.omitted?`<p>${g.omitted} additional nodes omitted from this view.</p>`:''}<div class="rx-inspector" aria-live="polite">${selected?`<h4>${esc(selected.label||selected.id)}</h4><pre>${json(selected)}</pre><ul>${g.edges.filter(e=>e.from===selected.id||e.to===selected.id).map(e=>`<li>${esc(e.from)} → ${esc(e.to)} · ${esc(e.kind)}</li>`).join('')}</ul>`:'Select a node to inspect its recorded properties and relationships.'}</div>`;
}
function patchFor(item,packet){
 const lines=String(packet?.source_diff?.content||'').split('\n');let active=false;const result=[];
 for(const line of lines){if(line.startsWith('diff --git '))active=line===`diff --git a/${item.file} b/${item.file}`;if(active)result.push(line);}
 return result.join('\n');
}
function linkedObligations(file,packet){
 const map=packet?.explorer?.governance?.holon_map||{};
 const methods=(map.methods||[]).filter(m=>m.file===file),ids=new Set(methods.map(m=>m.id));
 const regions=new Set(methods.flatMap(m=>m.holon_ids||[]));
 for(const flow of packet?.flows||[])if(flow.source?.file===file){
  for(const r of flow.potential_impact||[])if(r.kind==='governance_constrained_region')regions.add(r.id);
 }
 const result=[];
 for(const workflow of packet?.explorer?.workflows?.workflows||[]){
  for(const obligation of workflow.obligations||[]){
   const direct=(obligation.evidence||[]).filter(e=>e.source?.path===file||ids.has(e.method_id));
   if(direct.length){result.push({workflow,obligation,evidence:direct,relationship:'Direct source witness',regions:[]});continue;}
   const mapping=(map.mappings||[]).find(m=>m.id===obligation.governance?.objective_id||m.id==='ftgo_workflow_'+obligation.id.replace(/[.-]/g,'_'));
   if(!mapping)continue;
   const scoped=mapping.scope_method_ids||[];
   if(ids.size&&scoped.length&&!scoped.some(id=>ids.has(id)))continue;
   const shared=(mapping.holon_ids||[]).filter(id=>regions.has(id));
   const mapped=(mapping.method_ids||[]).some(id=>ids.has(id));
   if(shared.length||mapped)result.push({workflow,obligation,evidence:obligation.evidence||[],relationship:mapped?'Recorded method mapping':'Recorded shared intent region',regions:shared});
  }
 }
 return result;
}
function governanceCatalog(packet,file=''){
 const data=packet?.explorer?.workflows;
 if(!data)return '<p>The workflow artifact could not be loaded. This is an evidence-loading problem, not a conclusion that governance is absent.</p>';
 const workflows=data.workflows||[],links=linkedObligations(file,packet),linked=new Map(links.map(r=>[r.workflow.id+'|'+r.obligation.id,r]));
 const affected=workflows.filter(w=>w.impact_status&&w.impact_status!=='unaffected');
 const architecture=data.architecture;
 return `<section class="rx-governance"><h3>Governance model for this PR</h3><p>${workflows.length} recorded workflows · ${affected.length} intersect this PR · ${workflows.reduce((n,w)=>n+(w.obligations||[]).length,0)} recorded obligations</p><p>PR-wide impact comes from the recorded workflow analysis. It does not establish that every changed file affects every workflow.</p>${architecture?`<article class="rx-objective"><h4>${esc(architecture.status)} architecture constraint</h4><p>${esc(architecture.statement)}</p><p>${esc(architecture.qualification)}</p></article>`:''}${affected.length?'':'<p>No recorded workflow intersects this PR.</p>'}${affected.map(w=>`<details class="rx-workflow" ${links.some(r=>r.workflow.id===w.id)?'open':''}><summary><b>${esc(w.name||w.id)}</b> · ${esc(w.governance_status||'status not supplied')} · PR impact: ${esc(w.impact_status||'not assessed')}</summary><p>${esc(w.customer_outcome||w.outcome)}</p>${(w.obligations||[]).map(o=>{const relation=linked.get(w.id+'|'+o.id);return `<article class="rx-objective"><h4>${esc(o.id)} · ${esc(o.phase)}</h4><p>${esc(o.statement)}</p><p>Governance: ${esc(o.governance?.status||'not supplied')} · Impact: ${esc(o.impact_status||'not assessed')} · Evidence: ${esc(o.evidence_status||'not supplied')}</p>${relation?`<p><b>Selected file: ${esc(relation.relationship)}</b>${relation.regions.length?` · ${esc(relation.regions.join(', '))}`:''}</p>`:''}<details><summary>Methods, source witnesses and proof</summary><ul>${(o.evidence||[]).map(e=>`<li><b>${esc(e.source?.owner||e.method_id)}</b><br><code>${esc(e.source?.path)}:${esc(e.source?.line||'—')}</code> · ${esc(e.classification)}<br>Recorded regions: ${esc((e.intent_region_ids||[]).join(', ')||'none supplied')}</li>`).join('')}</ul><pre>${json({proof:o.proof,comparison:o.proof_comparison,gap:o.gap_reason})}</pre></details></article>`;}).join('')}</details>`).join('')}<p>${esc(data.qualification||'')}</p></section>`;
}
function changedFiles(packet){
 return [...new Set([...(packet?.flows||[]).map(f=>f.source?.file),...String(packet?.source_diff?.content||'').split('\n').filter(l=>l.startsWith('diff --git ')).map(l=>l.match(/^diff --git a\/(.+) b\/(.+)$/)?.[2])].filter(Boolean))].sort();
}
function pane(item,packet,summary,checks,options){
 const original=item,files=changedFiles(packet),runScope=!item.file;
 const file=item.file||(files.includes(options.file)?options.file:files[0])||'';
 item={...item,file};
 const flows=flowsFor(item,packet),linked=linkedObligations(file,packet);
 const explanations=summary?.intent_semantics?.explanations||[];
 const explanation=explanations.find(e=>e.change_id===original.id);
 const relatedExplanations=explanation?[explanation]:explanations.filter(e=>e.changed_source?.file===file);
 const detailCheck=packet?.explorer?.results?.checks?.find(c=>c.id===original.check?.id)||original.check;
 const scope=runScope?`<div class="rx-scope"><p><b>Run-level analysis gap.</b> This check has no single source location. Browse changed-file context below; it is not a finding attributed to the selected file.</p><label>Changed file <select data-evidence-file>${files.map(f=>`<option value="${esc(f)}" ${f===file?'selected':''}>${esc(f)}</option>`).join('')}</select></label></div>`:'';
 // A coding-standards finding has no governed boundary of its own: the holon map is intent-only.
 const standard=Boolean(original.standard||original.findings?.[0]?.kind==='standard');
 const shownTabs=standard?tabs.filter(([id])=>id!=='obj'&&id!=='ask'):tabs;
 const tab=shownTabs.some(([id])=>id===options.tab)?options.tab:standard?'graph':'obj';let body='';
 if(tab==='graph')body=graphPane(item,packet,options);
 if(tab==='path'){
  const rows=linked.flatMap(({workflow,obligation,evidence})=>evidence.map(e=>`<tr><td>${esc(workflow.name)}<br>${esc(obligation.phase)} · ${esc(e.source?.owner)}</td><td><pre>${json(e.baseline_parameters)}</pre></td><td><pre>${e.replacement_parameters?.length?json(e.replacement_parameters):'No replacement parameters recorded; this does not prove the behavior was removed.'}</pre>${esc(e.classification)}</td></tr>`));
  const side=(f,key)=>(f.fact_changes||[]).map(c=>c[key]).filter(Boolean).concat((f.observed_deltas||[]).map(d=>d.fields?.fact?.[key]).filter(Boolean));
  if(!rows.length)for(const f of flows){const before=side(f,'before'),after=side(f,'after');rows.push(`<tr><td>${esc(f.method||f.title||f.id)}</td><td><pre>${before.length?json(before):json((f.observed_deltas||[]).map(d=>({kind:d.kind,fields:Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,v?.before]))})))}</pre></td><td><pre>${after.length?json(after):json((f.observed_deltas||[]).map(d=>({kind:d.kind,fields:Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,v?.after]))})))}</pre></td></tr>`);}
  body=`<p>${linked.length?'Recorded workflow obligations and their source witnesses.':'Recorded extraction differences; these are not semantic equivalence judgments.'} The rows are not an inferred runtime execution sequence.</p><div class="rx-table"><table><thead><tr><th>Workflow / method</th><th>Baseline evidence</th><th>Candidate evidence</th></tr></thead><tbody>${rows.join('')||'<tr><td colspan="3">No path evidence recorded for this source.</td></tr>'}</tbody></table></div>`;
 }
 if(tab==='src')body=`<p>${esc(item.file||'No source location supplied.')}</p>${item.comparison?.complete?`<div class="ba"><div><b>Baseline</b><pre>${esc(item.comparison.before.text)}</pre></div><div><b>Candidate</b><pre>${esc(item.comparison.after.text)}</pre></div></div>`:`<pre>${esc(patchFor(item,packet)||'Source evidence unavailable for this item.')}</pre>`}${standard?'':`<details><summary>Intent notation</summary><pre>${json(flows.map(f=>({method:f.method,facts:f.fact_changes,observed_deltas:f.observed_deltas})))}</pre></details>`}`;
 if(tab==='obj'){
  const methods=(packet?.explorer?.governance?.holon_map?.methods||[]).filter(m=>m.file===file);
  body=`<div class="rx-scope"><b>Selected file: ${esc(file)}</b><p>${linked.length?`${linked.length} recorded obligation connections. Linked workflows are expanded below.`:'No direct or scoped-region objective connection was recorded for this file. The full PR governance model remains available below; no extra connection is inferred.'}</p>${original.objective?`<p>${esc(original.objective)}</p>`:''}<details><summary>${methods.length} recorded method memberships</summary><pre>${json(methods)}</pre></details></div>${typeof legacyMethodExplorer!=='undefined'?legacyMethodExplorer.markup(packet,options.methods||{}):''}${governanceCatalog(packet,file)}`;
 }
 if(tab==='analysis')body=`<dl><dt>Baseline</dt><dd><code>${esc(packet?.baseline_commit)}</code></dd><dt>Candidate</dt><dd><code>${esc(packet?.head_commit)}</code></dd><dt>Evidence basis</dt><dd>${esc(original.groundingLabel)}</dd></dl><p>${esc(original.qualification||'Outcome unresolved.')}</p>${detailCheck?`<h4>${esc(detailCheck.label||detailCheck.id)}</h4><p>${esc(detailCheck.detail)}</p><pre>${json(detailCheck.output||detailCheck)}</pre>`:`<pre>${json(flows.map(f=>({id:f.id,judgment:f.behavior_judgment,source:f.source,findings:f.findings,potential_impact:f.potential_impact})))}</pre>`}<details><summary>Recorded impact and analysis gaps</summary><pre>${json({gaps:packet?.explorer?.impact?.gaps,unjudged:packet?.explorer?.impact?.unjudged?.filter(r=>r.changed?.file===file)})}</pre></details>`;
 const ruleExplanation=standard?(summary?.intent_semantics?.finding_explanations||[]).find(row=>row.finding_id===original.findings[0].findingKey):null;
 if(tab==='ask'&&standard)body=`<p><b>Recorded explanation of this finding</b> · assembled from the rule and its guidance, not written by a model.</p><p>${esc(ruleExplanation?.review||original.detailSummary||original.summary||'No explanation was recorded for this finding.')}</p>${original.resolution?`<h4>How to resolve it</h4><p>${esc(original.resolution)}</p>`:''}<p>${esc(detailCheck?.detail||'')}</p>`;
 else if(tab==='ask')body=relatedExplanations.length?`<p><b>Saved model explanation${explanation?'':'s for the selected file'}</b> · advisory wording, separate from the recorded judgment. These explanations may contain errors; compare them with source evidence.</p>${relatedExplanations.map(e=>`<h4>${esc(e.title)}</h4><p>${esc(e.semantic_consequence)}</p><p>${esc(e.user_or_system_effect)}</p>`).join('')}<ul>${(summary.intent_semantics.uncertainty||[]).map(v=>`<li>${esc(v)}</li>`).join('')}</ul>`:`<p><b>Recorded evidence summary — no model explanation was generated.</b></p><p>${esc(file)} has ${flows.length} recorded analysis entries and ${linked.length} linked workflow obligations. This count does not establish a behavioral change.</p><p>${esc(detailCheck?.detail||'Inspect the before/after source and recorded analysis to assess this change.')}</p><p>Explanation status: ${esc(summary?.intent_semantics?.status||'unavailable')}. ${esc(summary?.intent_semantics?.reason||'No saved explanation for this item.')}</p>`;
 return `<section class="rx-explorer">${scope}${packet?.explorer_errors?.length?`<p class="rx-scope">Evidence loading errors: ${esc(packet.explorer_errors.join('; '))}</p>`:''}<div class="rx-tabs" role="tablist" aria-label="Impact views">${shownTabs.map(([id,title])=>`<button type="button" role="tab" id="rx-tab-${id}" data-ex-tab="${id}" aria-selected="${tab===id}" aria-controls="rx-panel" tabindex="${tab===id?0:-1}">${title}</button>`).join('')}</div><div id="rx-panel" class="rx-pane" role="tabpanel" aria-labelledby="rx-tab-${tab}">${body}</div></section>`;
}
root.reviewExplorer={enrich,coverage,pane,graphData,tabs,linkedObligations,changedFiles,governanceCatalog};if(typeof module!=='undefined')module.exports=root.reviewExplorer;
})(typeof window!=='undefined'?window:globalThis);
