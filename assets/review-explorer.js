/* Recorded evidence exploration; reviewer assessments never authorize governance. */
(function(root){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=v=>esc(JSON.stringify(v??null,null,2));
const pipeline=root.walkthroughPipeline||(typeof require==='function'?require('./walkthrough-model.js'):null);
const gap=(check,checks)=>['error','blocked'].includes(check.state)&&!pipeline?.intentionalSkip(check,checks);
const tabs=[['obj','Governed boundaries'],['graph','Impact graph']];
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
function flowsFor(item,packet){
 const flows=packet?.flows||[],ids=new Set(item.flowIds||[]);
 const explanation=packet?.objective_summary?.intent_semantics?.explanations?.find(row=>row.change_id===item.id);
 for(const id of explanation?.member_change_ids||[])ids.add(id);
 const obligation=String(item.id||'').startsWith('change:')?item.id.slice(7):null;
 const exact=flows.filter(f=>ids.has(f.id)||f.id===item.id||(obligation&&(f.behavior_judgment?.workflow_obligations||[]).includes(obligation)));
 if(exact.length||ids.size||obligation)return exact;
 const method=item.methodRef||item.method;
 if(method){const key=String(method).replace(/\([^)]*\)|\/\d+$/g,'').split(/[#.:]/).pop().replace(/[^a-z0-9]/gi,'').toLowerCase();
  return flows.filter(f=>f.source?.file===item.file&&String(f.method||f.title).replace(/\([^)]*\)|\/\d+$/g,'').split(/[#.:]/).pop().replace(/[^a-z0-9]/gi,'').toLowerCase()===key);}
 // File-wide context is only a fallback for a file or run-level item, never
 // evidence attributed to a specific finding with known member flows.
 return flows.filter(f=>item.file&&f.source?.file===item.file);
}
function coverage(packet,summary,checks){
 const flows=packet?.flows||[];const methods=new Set(flows.filter(f=>f.change_kind==='source_changed').map(f=>f.method).filter(Boolean));
 const gaps=(checks||[]).filter(c=>gap(c,checks));
 return `<details class="rx-coverage"><summary><b>Unchanged results and analysis coverage</b> · ${methods.size} changed methods represented · ${gaps.length} incomplete checks</summary><p>Counts describe the supplied artifact, not the entire pull request. Recorded graph differences do not by themselves establish changed behavior.</p><ul>${gaps.map(c=>`<li><b>${esc(c.label||c.id)}:</b> ${esc(c.detail)}</li>`).join('')||'<li>No incomplete checks reported.</li>'}</ul><p>Explanation: ${esc(summary?.intent_semantics?.status||'unavailable')}. ${esc(summary?.intent_semantics?.reason||'')}</p>${(summary?.intent_semantics?.omitted_change_ids||[]).length?`<p>${summary.intent_semantics.omitted_change_ids.length} changes omitted from the explanation.</p>`:''}<p>${esc(packet?.qualification||'No claim is made about behavior outside the evaluated scope.')}</p></details>`;
}
function graphData(item,packet,full){
 const graph=packet?.graph||{nodes:[],edges:[]},flows=packet.flows||[],aliases=new Map(),groups=new Map();
 // Merge display duplicates only when both canonical identity and recorded delta agree.
 const projected=(graph.nodes||[]).map(n=>{if(n.kind!=='Changed behavior')return {...n};
  const flow=flows.find(f=>n.id==='episode:'+f.id||n.id===f.id);
  const delta=flow&&(flow.fact_changes?.length?flow.fact_changes:flow.observed_deltas);
  const key=flow?.boundary_id&&delta?.length?JSON.stringify([flow.boundary_id,delta]):n.id;
  if(groups.has(key)){const first=groups.get(key);first.members.push(n.id);aliases.set(n.id,first.id);return null;}
  const node={...n,members:[n.id]};groups.set(key,node);return node;
 }).filter(Boolean);
 const edges=[],seen=new Set();for(const edge of graph.edges||[]){const e={...edge,from:aliases.get(edge.from)||edge.from,to:aliases.get(edge.to)||edge.to};const key=JSON.stringify([e.from,e.to,e.kind]);if(!seen.has(key)){seen.add(key);edges.push(e);}}
 const memberFlows=flowsFor(item,packet),seeds=new Set([item.id,'episode:'+item.id,...memberFlows.flatMap(f=>[f.id,'episode:'+f.id])].map(id=>aliases.get(id)||id));
 if(!memberFlows.length)seeds.add('source:'+item.file);
 const selected=new Set(seeds);for(const e of edges)if(seeds.has(e.from)||seeds.has(e.to)){selected.add(e.from);selected.add(e.to);}
 const allNodes=projected.filter(n=>full||selected.has(n.id)),nodes=allNodes.slice(0,60),ids=new Set(nodes.map(n=>n.id));
 return {nodes,edges:edges.filter(e=>ids.has(e.from)&&ids.has(e.to)),omitted:allNodes.length-nodes.length};
}
function changedCaption(node,packet){
 const flow=(packet.flows||[]).find(f=>(node.members||[node.id]).includes('episode:'+f.id));
 const slots=packet.compact_intent?.methods?.[flow?.boundary_id]?.after?.slots||[];
 const changed=slots.filter(s=>s.change==='added'||s.change==='modified').map(s=>s.kind==='exception'?'throws '+s.value:s.value);
 return changed.length?changed.join('; '):node.label||node.title||'Changed behavior';
}
function codePathMarkup(packet,options,entry){
 const data=packet.code_path;if(!data||data.schema!=='code-path-view-v1')return '';
 const identity=data.identity||{},commit=identity.side==='baseline'?packet.baseline_commit:packet.head_commit;
 if(identity.repository!==packet.repository||identity.commit!==commit)return '<p>Code path source belongs to a different revision.</p>';
 const methods=new Map((data.methods||[]).map(m=>[m.id,m])),edges=data.edges||[];
 const chosen=options.codePath?.method||entry,method=methods.get(chosen);if(!method)return '';
 const short=signature=>{const [owner,member]=String(signature).split('#');return member?owner.split('.').pop()+'.'+member:signature;};
 const changed=new Set(options.changedMethods||[]),addedLines=patchFor({file:method.file},packet).split('\n').filter(l=>l.startsWith('+')&&!l.startsWith('+++')).map(l=>l.slice(1).trim()),calls=edges.filter(e=>e.caller===chosen&&(changed.has(methods.get(e.target)?.signature)||(changed.has(method.signature)&&addedLines.some(line=>line.includes(e.call_site?.text))))).slice(0,32),source=method.source;

 const lineHtml=(line,index)=>{
  const number=source.start_line+index;let html=esc(line),cursor=0;
  const sites=calls.filter(e=>e.call_site?.start_line===number).map(e=>({edge:e,column:e.call_site.start_column-1-(index===0?(source.start_column||1)-1:0)})).sort((a,b)=>a.column-b.column);
  if(sites.length){const pieces=[];for(const {edge,column} of sites){const spelling=String(edge.call_site.text||'').split('\n')[0];if(column<cursor||!spelling||line.slice(column,column+spelling.length)!==spelling)continue;pieces.push(esc(line.slice(cursor,column)));pieces.push(`<mark class="cp-highlight">${esc(spelling)}</mark>`);cursor=column+spelling.length;}pieces.push(esc(line.slice(cursor)));html=pieces.join('');}
  return `<span class="cp-line"><span class="cp-line-number">${number}</span><span>${html}</span></span>`;
 };
 const code=source?`<pre class="cp-source"><code>${source.text.split('\n').map(lineHtml).join('\n')}</code></pre>`:'<p>Source for this method was not supplied.</p>';
 return `<section class="ig-code-path"><div class="cp-method-heading"><b>${esc(short(method.signature))}</b></div>${code}</section>`;

}
function impactedObjectives(item,packet){
 const ids=new Set(flowsFor(item,packet).flatMap(f=>f.behavior_judgment?.workflow_obligations||[]));
 if(String(item.id||'').startsWith('change:'))ids.add(item.id.slice(7));
 const records=(packet.explorer?.workflows?.workflows||[]).flatMap(w=>w.obligations||[]).filter(o=>ids.has(o.id));
 const statements=[...new Set(records.map(o=>o.statement).filter(Boolean))];
 if(statements.length)return statements;
 const row=packet.objective_summary?.intent_semantics?.explanations?.find(r=>r.change_id===item.id);
 return [item.objective||row?.accepted_intent||'No linked governed objective was supplied.'];
}
function objectiveHeading(item,packet,extra='',focus=null){
 const values=impactedObjectives(item,packet);
 const valueMarkup=value=>extra==='boundary-objective'?`<button type="button" class="objective-focus-choice" data-objective-focus="${esc(value)}" aria-pressed="${focus===value}" title="Highlight recorded associations; select again to clear">${esc(value)}</button>`:`<span>${esc(value)}</span>`;
 return values.length===1?`<h3 class="ig-objective ${extra}"><b>Impacted governed objective:</b> ${valueMarkup(values[0])}</h3>`:`<div class="ig-objective ${extra}"><b>Impacted governed objectives:</b><ul>${values.map(value=>`<li>${valueMarkup(value)}</li>`).join('')}</ul></div>`;
}
function graphPane(item,packet,options){
 const raw=graphData(item,packet,options.full),nodes=raw.nodes.filter(n=>options.full||n.kind!=='Connected step'),ids=new Set(nodes.map(n=>n.id)),edges=raw.edges.filter(e=>ids.has(e.from)&&ids.has(e.to));
 if(!nodes.length)return '<p>No impact connections were recorded for this finding.</p>';
 const obligations=(packet.explorer?.workflows?.workflows||[]).flatMap(w=>w.obligations||[]);
 const label=n=>n?.kind==='Accepted constraint'?(obligations.find(o=>'ob:'+o.id===n.id)?.statement||n.label):n?.kind==='Changed behavior'?changedCaption(n,packet):n?.label||n?.title||'Related code';
 const selected=nodes.find(n=>n.id===options.node)||nodes.find(n=>n.kind==='Changed behavior')||nodes[0];
 const related=new Set([selected.id]);for(const e of edges)if(e.from===selected.id||e.to===selected.id){related.add(e.from);related.add(e.to);}
 const columns=[[],[],[]];for(const n of nodes)columns[n.kind==='Source file'?0:n.kind==='Changed behavior'?1:2].push(n);
 const height=Math.max(...columns.map(ns=>ns.length),1)*106+60,positions=new Map(columns.flatMap((ns,col)=>ns.map((n,i)=>[n.id,{x:30+col*410,y:50+i*106}])));
 const flows=packet.flows||[],flow=flows.find(f=>'episode:'+f.id===selected.id||f.id===selected.id);
 const summaries=packet.objective_summary?.intent_semantics?.explanations||[];
 const explanation=flow?summaries.find(r=>(r.member_change_ids||[]).includes(flow.id)):null;
 const workflows=packet.explorer?.workflows?.workflows||[];
 let content='';
 if(selected.kind==='Source file'||selected.kind==='Changed behavior'){
  content='';
 }else if(selected.kind==='Accepted constraint'){
  const id=selected.id.replace(/^ob:/,''),binding=workflows.flatMap(w=>(w.obligations||[]).filter(o=>o.id===id).map(o=>({w,o})))[0];
  const wording=summaries.find(r=>(r.graph_path||[]).some(p=>p.obligation_statement===binding?.o.statement));
  content=`<h4>Requirement</h4><p>${esc(binding?.o.statement||label(selected))}</p>${binding?`<p class="ig-file">Workflow: ${esc(binding.w.name)}</p>`:''}`;
 }else if(selected.kind==='Customer workflow'){
  const workflow=workflows.find(w=>w.id===selected.id.replace(/^wf:/,''));
  content=`<h4>${esc(workflow?.name||label(selected))}</h4>`;
 }else content=`<h4>${esc(label(selected))}</h4><p>Select a connected source or requirement to inspect its context.</p>`;
 const paths=packet.code_path,requirementId=selected.kind==='Accepted constraint'?selected.id.replace(/^ob:/,''):null;
 const boundFlow=requirementId?flows.find(f=>(f.behavior_judgment?.workflow_obligations||[]).includes(requirementId)):null;
 const entry=paths?.graph_bindings?.[selected.id]||(selected.kind==='Customer workflow'?paths?.workflow_entries?.[selected.id.replace(/^wf:/,'')]:null)||(boundFlow?paths?.graph_bindings?.['episode:'+boundFlow.id]||(paths?.methods||[]).find(m=>m.signature===boundFlow.boundary_id)?.id:null);
 if(selected.kind==='Accepted constraint'||selected.kind==='Customer workflow')content+=codePathMarkup(packet,{changedMethods:flowsFor(item,packet).map(f=>f.boundary_id)},entry);
 const currentSummary=summaries.find(row=>row.change_id===item.id),objectiveId=String(item.id||'').replace(/^change:/,''),objectiveRecord=workflows.flatMap(w=>w.obligations||[]).find(o=>o.id===objectiveId),objective=objectiveRecord?.statement||item.objective||currentSummary?.accepted_intent||'No linked governed objective was supplied.';

 return `<div class="ig-toolbar">${objectiveHeading(item,packet)}<button type="button" class="btn" data-act="graph-full">${options.full?'Focus on this finding':'Show wider context'}</button></div><div class="rx-graph ig-canvas"><svg viewBox="0 0 1190 ${height}" role="group" aria-label="Impact relationships"><defs><marker id="ig-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#8a9bb1"/></marker></defs>${['Source','Changed behavior','Requirements and workflows'].map((name,i)=>`<text class="ig-column" x="${30+i*410}" y="24">${name}</text>`).join('')}${edges.map(e=>{const a=positions.get(e.from),b=positions.get(e.to),active=e.from===selected.id||e.to===selected.id;return `<path class="rx-edge ${active?'ig-active':'ig-muted'}" marker-end="url(#ig-arrow)" d="M${a.x+300} ${a.y+32} C${a.x+355} ${a.y+32},${b.x-55} ${b.y+32},${b.x} ${b.y+32}"><title>${esc(e.kind)}</title></path><text class="ig-edge-caption" x="${(a.x+300+b.x)/2}" y="${(a.y+b.y)/2+22}" text-anchor="middle">${esc(e.kind==='affects'?'workflow link':e.kind)}</text>`;}).join('')}${nodes.map(n=>{const p=positions.get(n.id),name=label(n),words=String(name).split(/\s+/),lines=[''];for(const word of words){if((lines[lines.length-1]+' '+word).trim().length>39&&lines[lines.length-1])lines.push(word);else lines[lines.length-1]+=(lines[lines.length-1]?' ':'')+word;}const short=lines.slice(0,2);return `<g class="ig-node ${(n.id===selected.id?'ig-selected ':related.has(n.id)?'ig-related ':'ig-muted ')+(n.kind==='Changed behavior'?'ig-behavior':'')}" role="button" tabindex="0" aria-pressed="${n.id===selected.id}" data-node="${esc(n.id)}" aria-label="${esc(name)}"><title>${esc(name)}</title><rect x="${p.x}" y="${p.y}" width="300" height="64" rx="10"/><text x="${p.x+14}" y="${p.y+19}">${short.map((line,i)=>`<tspan x="${p.x+14}" dy="${i?15:0}">${esc(line)}${i===1&&lines.length>2?'…':''}</tspan>`).join('')}</text><text class="ig-kind" x="${p.x+14}" y="${p.y+53}">${esc(n.kind||'Related code')}</text></g>`;}).join('')}</svg></div>${content?`<section class="ig-detail" aria-live="polite">${content}</section>`:''}${raw.omitted?`<p>${raw.omitted} more nodes are outside this view.</p>`:''}`;
}
function patchFor(item,packet){
 const lines=String(packet?.source_diff?.content||'').split('\n');let active=false;const result=[];
 for(const line of lines){if(line.startsWith('diff --git '))active=line===`diff --git a/${item.file} b/${item.file}`;if(active)result.push(line);}
 return result.join('\n');
}
function sourcePane(item,packet){
 const patch=patchFor(item,packet),parts=patch.split(/(?=^@@)/m),header=parts.shift()||'';
 const name=String(item.methodRef||item.method||'').replace(/\([^)]*\)|\/\d+$/g,'').split(/[#.:]/).pop().replace(/[^a-z0-9]/gi,'').toLowerCase();
 const matching=name?parts.filter(hunk=>hunk.toLowerCase().replace(/[^a-z0-9]/g,'').includes(name)):[];
 const focused=matching.length?header+matching.join(''):patch;
 const code=text=>`<pre class="rx-source">${text.split('\n').map(line=>`<span class="${line.startsWith('+')&&!line.startsWith('+++')?'rx-added':line.startsWith('-')&&!line.startsWith('---')?'rx-removed':''}">${esc(line)}</span>`).join('\n')}</pre>`;
 if(patch)return `<p><b>${esc(item.file)}</b></p><p>${matching.length?'Patch hunks matching the selected method.':'Recorded patch for the selected file; a narrower method match is unavailable.'}</p>${code(focused)}${focused!==patch?`<section><h4>Other changes in this file</h4>${code(patch)}</section>`:''}`;
 if(item.comparison?.complete)return `<p>${esc(item.file)}</p><div class="ba"><div><b>Before</b><pre>${esc(item.comparison.before.text)}</pre></div><div><b>After</b><pre>${esc(item.comparison.after.text)}</pre></div></div>`;
 return '<p>Source evidence is unavailable for this selection.</p>';
}
function linkedObligations(file,packet,item){
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
 if(!item)return result;
 const flows=flowsFor(item,packet),obligations=new Set(flows.flatMap(f=>f.behavior_judgment?.workflow_obligations||[]));
 const selectedRegions=new Set(flows.flatMap(f=>[...(f.concepts||[]).map(c=>c.unit_id),...(f.behavior_judgment?.intent_region_ids||[])]));
 const mapMethods=(map.methods||[]).filter(m=>m.file===file&&flows.some(f=>String(m.method||'').replace(/\([^)]*\)|\/\d+$/g,'')===String(f.boundary_id||f.method||'').replace(/\([^)]*\)|\/\d+$/g,'')));
 const methodIds=new Set(mapMethods.map(m=>m.id));
 const matches=e=>methodIds.has(e.method_id)||(e.intent_region_ids||[]).some(id=>selectedRegions.has(id))||selectedRegions.has(e.candidate_id);
 return result.map(row=>({...row,evidence:row.evidence.filter(matches)})).filter(row=>obligations.has(row.obligation.id)||row.evidence.length);
}
function governanceCatalog(packet,file=''){
 const data=packet?.explorer?.workflows;
 if(!data)return '<p>The workflow artifact could not be loaded. This is an evidence-loading problem, not a conclusion that governance is absent.</p>';
 const workflows=data.workflows||[],links=linkedObligations(file,packet),linked=new Map(links.map(r=>[r.workflow.id+'|'+r.obligation.id,r]));
 const affected=workflows.filter(w=>w.impact_status&&w.impact_status!=='unaffected');
 const architecture=data.architecture;
 return `<section class="rx-governance"><h3>Governance model for this PR</h3><p>${workflows.length} recorded workflows · ${affected.length} intersect this PR · ${workflows.reduce((n,w)=>n+(w.obligations||[]).length,0)} recorded obligations</p><p>PR-wide impact comes from the recorded workflow analysis. It does not establish that every changed file affects every workflow.</p>${architecture?`<article class="rx-objective"><h4>${esc(architecture.status)} architecture constraint</h4><p>${esc(architecture.statement)}</p><p>${esc(architecture.qualification)}</p></article>`:''}${affected.length?'':'<p>No recorded workflow intersects this PR.</p>'}${workflows.map(w=>`<details class="rx-workflow" ${links.some(r=>r.workflow.id===w.id)?'open':''}><summary><b>${esc(w.name||w.id)}</b> · ${esc(w.governance_status||'status not supplied')} · PR impact: ${esc(w.impact_status||'not assessed')}</summary><p>${esc(w.customer_outcome||w.outcome)}</p>${(w.obligations||[]).map(o=>{const relation=linked.get(w.id+'|'+o.id);return `<article class="rx-objective"><h4>${esc(o.id)} · ${esc(o.phase)}</h4><p>${esc(o.statement)}</p><p>Governance: ${esc(o.governance?.status||'not supplied')} · Impact: ${esc(o.impact_status||'not assessed')} · Evidence: ${esc(o.evidence_status||'not supplied')}</p>${relation?`<p><b>Selected file: ${esc(relation.relationship)}</b>${relation.regions.length?` · ${esc(relation.regions.join(', '))}`:''}</p>`:''}<details><summary>Methods, source witnesses and proof</summary><ul>${(o.evidence||[]).map(e=>`<li><b>${esc(e.source?.owner||e.method_id)}</b><br><code>${esc(e.source?.path)}:${esc(e.source?.line||'—')}</code> · ${esc(e.classification)}<br>Recorded regions: ${esc((e.intent_region_ids||[]).join(', ')||'none supplied')}</li>`).join('')}</ul><pre>${json({proof:o.proof,comparison:o.proof_comparison,gap:o.gap_reason})}</pre></details></article>`;}).join('')}</details>`).join('')}<p>${esc(data.qualification||'')}</p></section>`;
}
function changedFiles(packet){
 return [...new Set([...(packet?.flows||[]).map(f=>f.source?.file),...String(packet?.source_diff?.content||'').split('\n').filter(l=>l.startsWith('diff --git ')).map(l=>l.match(/^diff --git a\/(.+) b\/(.+)$/)?.[2])].filter(Boolean))].sort();
}
function pane(item,packet,summary,checks,options){
 const original=item,files=changedFiles(packet),runScope=!item.file;
 const file=item.file||(files.includes(options.file)?options.file:files[0])||'';
 item={...item,file};
 const flows=flowsFor(item,packet),linked=linkedObligations(file,packet,runScope?null:item);
 const detailCheck=packet?.explorer?.results?.checks?.find(c=>c.id===original.check?.id)||original.check;
 const scope=runScope?`<div class="rx-scope"><p><b>Run-level analysis gap.</b> This check has no single source location. Browse changed-file context below; it is not a finding attributed to the selected file.</p><label>Changed file <select data-evidence-file>${files.map(f=>`<option value="${esc(f)}" ${f===file?'selected':''}>${esc(f)}</option>`).join('')}</select></label></div>`:'';
 // A coding-standards finding has no governed boundary of its own: the holon map is intent-only.
 const standard=Boolean(original.standard||original.findings?.[0]?.kind==='standard');
 const shownTabs=standard?tabs.filter(([id])=>id!=='obj'&&id!=='ask'):tabs;
 const tab=shownTabs.some(([id])=>id===options.tab)?options.tab:standard?'graph':'obj';let body='';
 if(tab==='graph')body=graphPane(item,packet,options);
 if(tab==='path'){
  const readable=value=>{if(value==null)return 'Not recorded';if(typeof value==='string')return value;if(Array.isArray(value))return value.map(readable).join(' · ');if(value.value&&typeof value.value==='string')return value.value;if(value.allowed)return 'Allowed states: '+value.allowed.join(', ');if(value.arguments)return 'Arguments: '+value.arguments.join(', ');if(value.slot)return value.slot;return 'See technical evidence';};
  const entries=linked.flatMap(({workflow,obligation,evidence})=>evidence.map(e=>({workflow,obligation,...e})));
  const changed=entries.filter(e=>e.classification!=='unaffected'),context=entries.filter(e=>e.classification==='unaffected');
  const table=entries=>`<div class="rx-table"><table><thead><tr><th>Behavior</th><th>Before</th><th>After</th></tr></thead><tbody>${entries.map(e=>`<tr><td>${esc(e.source?.owner||e.workflow?.name||'Selected behavior')}</td><td>${esc(readable(e.baseline_parameters))}</td><td>${esc(e.replacement_parameters?.length?readable(e.replacement_parameters):'Not compared')}</td></tr>`).join('')}</tbody></table></div>`;
  const side=(f,key)=>(f.fact_changes||[]).flatMap(c=>[c[key],...(c.changed_fields||[]).map(row=>row[key])]).filter(Boolean).concat((f.observed_deltas||[]).map(d=>d.fields?.fact?.[key]).filter(Boolean));
  const fallback=flows.map(f=>({source:{owner:f.title||f.method},baseline_parameters:side(f,'before'),replacement_parameters:side(f,'after')}));
  body=`<p>Before and after evidence for this finding. This is a comparison, not an execution trace.</p>${changed.length?table(changed):fallback.length?table(fallback):'<p>No behavior comparison is recorded for this finding.</p>'}<p class="note">A missing candidate comparison does not establish that behavior was removed.</p>`;
 }
 if(tab==='path'&&item.semanticComparison)body=`<div class="ba"><div><b>Before</b><p>${esc(item.semanticComparison.before)}</p></div><div><b>With this PR</b><p>${esc(item.semanticComparison.after)}</p></div></div>`;
 if(tab==='src')body=sourcePane(item,packet);
 if(tab==='obj')body=typeof legacyMethodExplorer!=='undefined'?legacyMethodExplorer.markup(packet,options.methods||{},original):'<p>The recorded map is unavailable for this selection.</p>';
 if(tab==='obj')body=objectiveHeading(original,packet,'boundary-objective',options.methods?.focusObjective)+body;
 if(tab==='analysis'){
  const incomplete=(checks||[]).filter(c=>gap(c,checks));
  body=`<h3>Analysis of this change</h3><p>${detailCheck?esc(detailCheck.detail||'This check has no recorded detail.'):esc(original.qualification||'Review the source before accepting this change.')}</p>${original.objective?`<h4>Exact recorded requirement</h4><p>${esc(original.objective)}</p>`:''}${(detailCheck?.output?.gaps||[]).length?`<ul>${detailCheck.output.gaps.map(g=>`<li>${esc(g.reason||'Evidence gap')}</li>`).join('')}</ul>`:''}${incomplete.length?`<h4>Incomplete checks</h4><ul>${incomplete.map(c=>`<li><b>${esc(c.label||c.id)}:</b> ${esc(c.detail||'The check could not finish.')}</li>`).join('')}</ul>`:'<p>No incomplete checks were reported.</p>'}`;
 }
 return `<section class="rx-explorer">${scope}${packet?.explorer_errors?.length?`<p class="rx-scope">Evidence loading errors: ${esc(packet.explorer_errors.join('; '))}</p>`:''}<div class="rx-tabs" role="tablist" aria-label="Impact views">${shownTabs.map(([id,title])=>`<button type="button" role="tab" id="rx-tab-${id}" data-ex-tab="${id}" aria-selected="${tab===id}" aria-controls="rx-panel" tabindex="${tab===id?0:-1}">${title}</button>`).join('')}</div><div id="rx-panel" class="rx-pane" role="tabpanel" aria-labelledby="rx-tab-${tab}">${body}</div></section>`;
}
root.reviewExplorer={enrich,coverage,pane,graphData,tabs,linkedObligations,changedFiles,governanceCatalog};if(typeof module!=='undefined')module.exports=root.reviewExplorer;
})(typeof window!=='undefined'?window:globalThis);
