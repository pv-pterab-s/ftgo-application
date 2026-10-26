/* Read-only governance descriptions linked to frozen holon memberships. */
function liveGovernedObjectivesMarkup(doc){
 if(!doc)return '<article class="card"><div class="body"><h2>Governed objectives unavailable</h2><p>This run did not publish an accepted governance snapshot. Check the run baseline identity before relying on objective coverage.</p></div></article>';
 if(doc.schema!=='governed-objectives-status-v1')return '<article class="card"><div class="body"><h2>Governed objectives unavailable</h2><p>The published objective snapshot has an unsupported schema.</p></div></article>';
 const summary=doc.summary||{},authority=doc.authority||{},workflows=doc.workflows||[];
 const tone=status=>status==='violated'?'red':status==='affected'?'amber':'green';
 const label=status=>({violated:'Boundary violation',affected:'Affected',not_intersected:'Not intersected'})[status]||status;
 const rows=workflows.map(workflow=>`<details class="card live-governed-workflow" ${workflow.status!=='not_intersected'?'open':''}><summary><span class="pill ${tone(workflow.status)}">${esc(label(workflow.status))}</span> <strong>${esc(workflow.name)}</strong> <span class="note">${esc(workflow.category)}</span></summary><div class="body">${(workflow.obligations||[]).map(obligation=>`<section class="governance-objective ${obligation.status==='violated'?'violation':obligation.status==='affected'?'gap':'clear'}"><span class="pill ${tone(obligation.status)}">${esc(label(obligation.status))}</span><h3>${esc(obligation.statement||obligation.id)}</h3><p class="note"><code>${esc(obligation.objective_id)}</code> · ${esc(obligation.phase||'accepted obligation')}</p>${(obligation.boundary_ids||[]).length?`<p>Governed boundaries: ${(obligation.boundary_ids||[]).map(id=>`<code>${esc(id)}</code>`).join(' ')}</p>`:''}</section>`).join('')}</div></details>`).join('');
 return `<section class="governed-objectives" data-live-governed-objectives><h2>Governed objectives <span class="pill green">LIVE</span></h2><p>Accepted workflow obligations from the baseline pinned to this pull request, joined to this run’s governed-boundary judgments.</p><div class="stats"><div><b>${esc(summary.affected_workflows??0)}</b><small>affected workflows</small></div><div><b>${esc(summary.workflows??workflows.length)}</b><small>accepted workflows</small></div><div><b>${esc(summary.accepted_obligations??0)}</b><small>accepted obligations</small></div></div>${(summary.affected_boundaries||[]).length?`<div class="summary-box stop"><strong>${esc(summary.violated_workflows||0)} workflow(s) intersect a violated boundary</strong><p>${summary.affected_boundaries.map(id=>`<code>${esc(id)}</code>`).join(' ')}</p></div>`:'<div class="summary-box pass"><strong>No governed workflow boundary intersection was reported.</strong></div>'}${rows||'<article class="card"><div class="body"><p>No accepted workflows were present in the published snapshot.</p></div></article>'}<details class="card"><summary>Accepted authority and run identity</summary><div class="body"><p>Governance <code>${esc(doc.governance_version||'unavailable')}</code><br>Baseline <code>${esc(doc.baseline_commit||'unavailable')}</code><br>Head <code>${esc(doc.head_commit||'unavailable')}</code></p><p>Authority: ${esc(authority.kind||'unavailable')} · accepted state <code>${esc(authority.accepted_state||'unavailable')}</code> · release <code>${esc(authority.ledger_release||'unavailable')}</code></p><p class="note">${esc(doc.qualification||'')}</p></div></details></section>`;
}

function governanceAreaStatus(area){
 if(area.governance_result){
  const status=area.governance_result.status;
  return {tone:status==='violated'?'violation':status==='satisfied'?'clear':status==='not_assessed'?'unassessed':'gap',label:({violated:'Objective violated',satisfied:'Accepted obligations satisfied',not_assessed:'No accepted obligation assessed',evidence_needed:'Accepted objective evidence missing'})[status]||status};
 }
 if(area.kind==='business'||area.kind==='boundary'){
  const status=area.result?.status||'not_assessed';
  return {tone:status==='satisfied'?'clear':status==='violated'?'violation':status==='not_assessed'?'unassessed':'gap',label:({satisfied:'Satisfied',violated:'Violated',conflict:'Conflicting evidence',evidence_unavailable:'Required evidence missing',not_assessed:'Not assessed'})[status]||status};
 }
 const changes=area.observation?.changes;
 return {tone:!area.observation?'unassessed':Array.isArray(changes)&&!changes.length?'clear':'gap',label:!area.observation?'Not assessed':changes?.length?'Architecture changes detected':'No architecture change detected'};
}
function governedBoundaryAreas(packet){
 const map=packet.governed_objectives?.holon_map;
 const key=s=>String(s||'').split('::').pop().replace('#','.');
 const impact=packet.intent_impact;
 const concepts=impact&&impact.baseline_commit===packet.baseline_commit&&impact?.head_commit===packet.head_commit?impact.concepts||[]:[];
 const groups=new Map();
 for(const f of packet.flows||[]){
  const judgment=f.behavior_judgment;
  if(!judgment?.boundary_id||judgment.boundary_id!==f.title)continue;
  if(!['supported_boundary_violation','supported_boundary_preservation','insufficient_evidence'].includes(judgment.status))continue;
  const concept=concepts.find(c=>c.question_id===judgment.question_id&&c.boundary_id===judgment.boundary_id);
  const id=judgment.boundary_id;
  if(!groups.has(id))groups.set(id,{id,kind:'boundary',statement:concept?`${concept.concept}. ${concept.intended}`:id,result:{status:'satisfied'},method_ids:[],region_ids:[],flow_ids:[],unmapped_flow_ids:[],violation_method_ids:[],unbound_method_ids:[],baseline_update_flow_ids:[]});
  const area=groups.get(id);
  const evaluation=packet.governed_objectives?.objective_evaluation;
  const linked=(evaluation?.objectives||[]).some(a=>a.obligations.some(o=>o.question_ids.includes(judgment.question_id)));
  const findingStatus=judgment.status==='supported_boundary_violation'?(evaluation&&!linked?'baseline_update_proposed':'violated'):judgment.status==='supported_boundary_preservation'?'satisfied':'evidence_unavailable';
  const priority={satisfied:0,evidence_unavailable:1,baseline_update_proposed:2,violated:3};
  if(priority[findingStatus]>priority[area.result.status])area.result.status=findingStatus;
  if(judgment.status==='supported_boundary_violation'){
   const matches=(map?.methods||[]).filter(m=>key(m.method)===key(f.method)&&m.file===f.source?.file);
   if(matches.length===1){area.method_ids.push(matches[0].id);area[findingStatus==='violated'?'violation_method_ids':'unbound_method_ids'].push(matches[0].id);}
   if(findingStatus==='baseline_update_proposed')area.baseline_update_flow_ids.push(f.id);
   else area.unmapped_flow_ids.push(f.id);
   area.region_ids.push(...(f.concepts||[]).filter(c=>c.status==='governance_constrained').map(c=>c.unit_id));
   area.flow_ids.push(f.id);
  }
 }
 return [...groups.values()].map(a=>({...a,method_ids:[...new Set(a.method_ids)],region_ids:[...new Set(a.region_ids)],violation_method_ids:[...new Set(a.violation_method_ids)],unbound_method_ids:[...new Set(a.unbound_method_ids)]}));
}

// Describe recorded substitutions independently of the semantic judgment.
function governedChangeExplanation(packet,concept){
 const words=name=>String(name).replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase().replace(/\bid\b/g,'ID');
 const valueLabel=value=>{
  const match=/^get([A-Z]\w*)\(\)(?:\.get([A-Z]\w*)\(\))?$/.exec(value);
  return match?words(match[2]||match[1])+(match[2]?` from ${words(match[1])}`:''):value;
 };
 const bindings=[];
 for(const flow of packet.flows||[]){
  if(flow.title!==concept.boundary_id||flow.source?.file!==concept.changed?.file)continue;
  const owner=String(flow.method||'').split('::').pop().replace(/#([^/]+)\/\d+$/,'.$1()');
  if(!owner.endsWith(concept.changed?.method||'\0'))continue;
  for(const delta of flow.observed_deltas||[]){
   if(delta.kind!=='normalized_boundary_fact')continue;
   const parse=rows=>(rows||[]).flatMap(row=>{try{return row.startsWith('value_binding ')?[JSON.parse(row.slice(14))]:[];}catch{return [];}});
   const before=parse(delta.fields?.fact?.before),after=parse(delta.fields?.fact?.after);
   for(const b of before)for(const a of after)if(a.slot===b.slot&&a.value!==b.value&&typeof a.value==='string'&&typeof b.value==='string')bindings.push({before:b,after:a});
  }
 }
 if(bindings.length!==1)return concept.sentence?`<p class="governed-change-description">${esc(concept.sentence.replace(/<[^>]*>/g,''))}</p>`:'';
 const {before,after}=bindings[0],field=words(after.slot.replace(/^(with|set)/,''));
 const receiver=concept.affected;
 const service=/^ftgo-(.+?)-service\//.exec(receiver?.file||'');
 const command=/CommandMessage<(\w+)>/.exec((receiver?.lines||[]).join('\n'))?.[1];
 const subject=service&&command?`${words(service[1]).replace(/^./,c=>c.toUpperCase())}’s ${command}`:'The command';
 return `<p class="governed-change-description">${esc(subject)} now carries the ${esc(valueLabel(after.value))} in its ${esc(field)} field. Previously, it carried the ${esc(valueLabel(before.value))}.</p><dl class="governed-change-values"><dt>Previously</dt><dd><code>${esc(before.slot)} ← ${esc(before.value)}</code></dd><dt>This PR</dt><dd><code>${esc(after.slot)} ← ${esc(after.value)}</code></dd></dl>${receiver?`<p class="note">Receiving handler: <code>${esc(receiver.label)}</code> · <code>${esc(receiver.file.split('/').pop())}:${esc(receiver.anchor)}</code></p>`:''}`;
}
// Put the deterministic explanation before the workflow territories.
function changedConceptsCard(packet){
 const impact=packet.intent_impact;
 const concepts=impact?.baseline_commit===packet.baseline_commit&&impact?.head_commit===packet.head_commit?impact?.concepts||[]:[];
 const changed=concepts;
 const directMethods=new Set((packet.governed_objectives?.customer_workflows?.workflows||[]).flatMap(workflow=>workflow.obligations||[]).flatMap(obligation=>obligation.evidence||[]).filter(row=>['exact_fact_change','changed_witness_method'].includes(row.classification)).map(row=>row.method_id));
 if(!changed.length)return `<div class="governance-changed-card clear"><b>No governed concept was judged changed.</b><span>${directMethods.size?`${directMethods.size} implementation method${directMethods.size===1?'':'s'} directly intersect${directMethods.size===1?'s':''} this PR and remain visible in the map.`:'No governed workflow evidence directly intersects this PR.'}</span></div>`;
 const short=p=>String(p||'').split('/').pop();
 return `<div class="governance-changed-card"><b>What this PR changes</b>${changed.map(c=>`<article class="governed-change">${governedChangeExplanation(packet,c)}<p class="note">Changed in <code>${esc(c.changed?.method)}</code> · <code>${esc(short(c.changed?.file))}:${esc(c.changed?.line??'')}</code></p></article>`).join('')}<button data-view="review">Open source evidence in Review</button><p class="note">Descriptions come from recorded boundary facts and source mappings.</p></div>`;
}
function candidateImpactMarkup(doc){
 const impact=doc.candidate_impact;
 if(!impact)return '<section class="candidate-impact"><h3>Proposed candidate intersections</h3><p class="note">This run did not supply the candidate-impact projection.</p></section>';
 const s=impact.summary,labels={exact_fact_change:'Exact fact changed',changed_witness_method:'Witness method changed',structural_context:'Structural context only'};
 const rows=impact.affected_candidates.map(row=>{
  const short=String(row.method||'').split('::').pop();
  const after=row.replacement_parameters?.length?`<h5>Candidate revision facts</h5><pre>${esc(JSON.stringify(row.replacement_parameters,null,2))}</pre>`:'<p class="note">The candidate fact itself was not removed; this is a method or context intersection.</p>';
  return `<details class="candidate-impact-row ${esc(row.classification)}"><summary><span class="pill ${row.classification==='exact_fact_change'?'red':row.classification==='changed_witness_method'?'amber':''}">${esc(labels[row.classification])}</span><strong>${esc(short)}</strong><small>${esc(row.invariant.form)} · ${esc(row.candidate_id)}</small></summary><p><code>${esc(row.source.path)}:${esc(row.source.line||'—')}</code></p><h5>Baseline candidate invariant</h5><pre>${esc(JSON.stringify(row.invariant.parameters,null,2))}</pre>${after}<p class="note">Objective: ${esc(row.objective_id)} · ${esc(row.boundary_id)} · ${row.candidate_status==='accepted'?'accepted obligation':'proposed candidate only'}</p></details>`;
 }).join('');
 return `<section class="candidate-impact"><h3>Proposed candidate intersections</h3><p>Which baseline candidates intersect this PR. An intersection is not an objective violation.</p><div class="candidate-impact-summary"><span><b>${s.total_candidates}</b> total</span><span class="exact"><b>${s.exact_fact_changes}</b> exact changes</span><span><b>${s.changed_witness_methods}</b> changed methods</span><span><b>${s.structural_context}</b> context only</span><span><b>${s.unaffected}</b> unaffected</span></div>${rows||'<p class="note">No proposed candidate intersects the recorded PR impact envelope.</p>'}<details class="candidate-impact-qualification"><summary>Classification rules</summary><p>${esc(impact.qualification)}</p></details></section>`;
}
function workflowFactExpression(form,parameters){
 const p=parameters||{};
 if(form==='value_binding')return `${p.slot||'value'} ← ${p.value||'unknown'}`;
 if(form==='boundary_call')return `${p.receiver||'receiver'}.${p.operation||'operation'}(${(p.arguments||[]).join(', ')})`;
 if(form==='state_transition')return `${p.guard||'state'}: ${(p.allowed||[]).join(' | ')||'?'} → ${(p.writes||[]).join(', ')||'no recorded write'}`;
 if(form==='http_endpoint')return `${p.method||'HTTP'} ${p.path||'unknown path'}`;
 if(form==='http_response')return `${p.status||'status'} → ${p.body||'no body'}`;
 if(String(form).startsWith('saga_'))return `${form.replace('saga_','')} ${p.participant||p.value||''}`.trim();
 return `${form} ${JSON.stringify(p)}`;
}
function workflowProofMarkup(obligation){
 const proof=obligation.proof,comparison=obligation.proof_comparison;
 if(!proof)return obligation.evidence_status==='gap'?'':'<p class="note">No formal multi-witness predicate has been declared.</p>';
 const tone=value=>value==='proved'?'green':value==='broken'?'red':'amber';
 const relationship=row=>{const r=row.relationship;if(!r)return '';if(r.command_type)return `<span class="workflow-proof-route"><code>${esc(String(r.command_type).split('.').pop())}</code> → <code>${esc(r.dispatch_channel)}</code> → <code>${esc(String(r.handler).split('.').pop())}</code> → <code>${esc(String(r.target).split('.').pop())}</code><small>${r.methods?.length||0} preserved method capsules · ${r.cpg_nodes?.length||0} exact CPG nodes</small></span>`;if(r.variable)return `<span class="workflow-proof-route"><code>${esc(r.variable)}</code> flows through <code>${esc((r.method_owners||[]).join(', '))}</code></span>`;if(r.anchors?.length)return `<span class="workflow-proof-route">Exact source anchors: <code>${esc(JSON.stringify(r.anchors))}</code></span>`;return '';};
 const clauses=(comparison?.clauses||proof.clauses||[]).map(row=>`<li><span class="pill ${tone(row.status)}">${esc(row.status)}</span><b>${esc(row.id)}</b><small>${esc(row.reason)}</small>${relationship(row)}${row.candidate_ids?.length?`<code>${esc(row.candidate_ids.join(' + '))}</code>`:''}</li>`).join('');
 const ledger=(proof.witness_ledger||[]).map(row=>`<tr><td><code>${esc(row.form)}</code></td><td>${esc(String(row.source.owner||'').split('.').pop())}<small>${esc(row.source.path)}:${esc(row.source.line||'—')}</small></td><td><code>${esc(row.candidate_id)}</code></td></tr>`).join('');
 const current=comparison?.verdict||proof.verdict;
 return `<details class="workflow-proof"><summary><span class="pill ${tone(proof.verdict)}">Baseline proof: ${esc(proof.verdict)}</span>${comparison?` <span class="pill ${tone(current)}">PR preservation: ${esc(current)}</span>`:''}<span>Inspect multi-witness proof</span></summary><p class="note">${esc(proof.qualification)}</p><ol>${clauses}</ol><details><summary>${proof.witness_ledger.length} content-addressed witnesses</summary><table><thead><tr><th>Fact</th><th>Source anchor</th><th>Identity</th></tr></thead><tbody>${ledger}</tbody></table></details><p class="note">Predicate <code>${esc(proof.predicate_sha256)}</code> · certificate <code>${esc(proof.proof_sha256)}</code></p></details>`;
}
function workflowIntersectionMap(data){
 const labels={exact_fact_change:'Candidate fact changed',changed_witness_method:'Candidate method changed',structural_context:'Candidate in impact context'};
 const intersections=Array.isArray(data.intersections)?data.intersections:data.workflows.flatMap(workflow=>workflow.obligations.flatMap(obligation=>(obligation.evidence||[]).filter(row=>row.classification!=='unaffected').map(row=>({...row,workflow_id:workflow.id,workflow_name:workflow.name,obligation_id:obligation.id,obligation_statement:obligation.statement}))));
 const rows=intersections.map(row=>{
  const before=workflowFactExpression(row.form,row.baseline_parameters);
  const replacements=(row.replacement_parameters||[]).map(value=>workflowFactExpression(row.form,value));
  const delta=replacements.length?`<div class="workflow-fact-delta"><span class="fact-before">− ${esc(before)}</span>${replacements.map(value=>`<span class="fact-after">+ ${esc(value)}</span>`).join('')}</div>`:`<code class="workflow-fact-expression">${esc(before)}</code><small>The recorded candidate fact is stable; its method or structural context intersects this PR.</small>`;
  return `<tr class="${esc(row.classification)}"><td><strong>${esc(row.workflow_name)}</strong></td><td><span>${esc(row.obligation_statement)}</span><small>${esc(row.obligation_id)}</small></td><td><span class="pill ${row.classification==='exact_fact_change'?'red':'amber'}">${esc(labels[row.classification])}</span>${delta}<small>${esc(row.candidate_id)}</small></td><td><code>${esc(String(row.source.owner||row.method).split('.').pop())}</code><small>${esc(row.source.path)}:${esc(row.source.line||'—')}</small></td></tr>`;
 }).join('');
 return `<section class="workflow-intersection-map"><h4>This PR → candidate facts → workflow obligations</h4><p>Only candidate facts intersecting this PR’s impact envelope are shown here.</p>${rows?`<div class="workflow-intersection-table-wrap"><table><thead><tr><th>Customer workflow</th><th>Workflow obligation</th><th>Candidate fact and PR relationship</th><th>Source witness</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="note">No candidate fact assigned to a customer workflow intersects this PR. This does not mean the PR has no other candidate intersections.</p>'}</section>`;
}
function workflowGovernanceHierarchy(data,doc){
 const architecture=data.architecture;
 const architectureArea=(doc.architecture||[]).find(row=>row.id===architecture.objective_id);
 const architectureState=architectureArea?governanceAreaStatus({...architectureArea,kind:'architecture'}):{tone:'unassessed',label:'Not assessed for this PR'};
 const impactLabels={direct_change:'Direct PR intersection',context_only:'Context intersection',unaffected:'No PR intersection'};
 const impactTones={direct_change:'amber',context_only:'',unaffected:''};
 const workflows=data.workflows.map(workflow=>{
  const accepted=workflow.obligations.filter(row=>row.governance.status==='accepted').length;
  return `<article class="workflow-node ${esc(workflow.impact_status)}"><header><span class="pill">Workflow</span><span class="pill ${impactTones[workflow.impact_status]}">${esc(impactLabels[workflow.impact_status])}</span></header><strong>${esc(workflow.name)}</strong><p>${esc(workflow.customer_outcome)}</p><small>${workflow.obligations.length} obligations · ${accepted} accepted · ${workflow.obligations.length-accepted} not accepted</small></article>`;
 }).join('');
 return `<section class="workflow-governance-hierarchy"><div class="architecture-objective-band ${esc(architectureState.tone)}"><header><span class="pill green">${esc(architecture.status)} architecture objective</span><span class="pill ${architectureState.tone==='clear'?'green':architectureState.tone==='violation'?'red':'amber'}">${esc(architectureState.label)}</span></header><strong>${esc(architecture.statement)}</strong><p>Cross-cutting constraint over all ${architecture.applies_to_workflow_ids.length} customer workflows.</p></div><div class="architecture-crosscut" aria-hidden="true"><span></span></div><div class="workflow-node-grid">${workflows}</div></section>`;
}
function workflowCandidateInventory(data){
 const inventory=data.candidate_inventory;
 return `<details class="workflow-candidate-inventory"><summary>Candidate-fact classification</summary><div><span><b>${inventory.unique_assigned_candidates}</b> assigned to workflow obligations</span><span><b>${inventory.architecture_candidate_assignments}</b> assigned specifically to architecture</span><span><b>${inventory.unassigned_candidates}</b> still unclassified</span></div><p>The accepted architecture objective remains active, but candidates are not called architectural merely because they were collected from its former broad service scope.</p></details>`;
}
function customerWorkflowMarkup(doc){
 const data=doc.customer_workflows;
 if(!data)return `<section class="customer-workflows"><h3>Customer workflows</h3><p class="note">This run did not supply the proposed customer-workflow overlay.</p></section>`;
 const labels={direct_change:'Review intersection',context_only:'Structural context',unaffected:'No recorded intersection'};
 const tones={direct_change:'amber',context_only:'',unaffected:'green'};
 const classes={exact_fact_change:'Exact fact',changed_witness_method:'Witness method',structural_context:'Context'};
 const workflows=data.workflows.map(workflow=>{
  const impacted=workflow.obligations.filter(row=>row.impact_status!=='unaffected').length;
  const obligations=workflow.obligations.map(obligation=>{
   const counts=obligation.impact_counts;
   const evidence=obligation.evidence.filter(row=>row.classification!=='unaffected').map(row=>`<details class="workflow-evidence ${esc(row.classification)}"><summary><span class="pill ${row.classification==='exact_fact_change'?'red':'amber'}">${esc(classes[row.classification])}</span><code>${esc(row.form)}</code><span>${esc(String(row.source.owner||row.method).split('.').pop())}</span></summary><p><code>${esc(row.source.path)}:${esc(row.source.line||'—')}</code></p><h5>Baseline witness</h5><pre>${esc(JSON.stringify(row.baseline_parameters,null,2))}</pre>${row.replacement_parameters?.length?`<h5>Revision facts</h5><pre>${esc(JSON.stringify(row.replacement_parameters,null,2))}</pre>`:'<p class="note">The candidate fact itself was not replaced.</p>'}</details>`).join('');
   const governanceLabel=obligation.governance.status==='accepted'?(obligation.governance.kind==='business_contract'?'Accepted contract':'Accepted obligation'):'Proposed obligation';
   const gap=obligation.evidence_status==='gap'?`<p class="note"><span class="pill amber">Evidence gap</span> ${esc(obligation.gap_reason||'No baseline witness currently proves this obligation.')}</p>`:'';
   return `<article class="workflow-obligation ${esc(obligation.impact_status)} ${esc(obligation.governance.status)}"><header><span class="workflow-phase">${esc(obligation.phase)}</span><span><span class="pill ${obligation.governance.status==='accepted'?'green':'amber'}">${esc(governanceLabel)}</span> <span class="pill ${tones[obligation.impact_status]}">${esc(labels[obligation.impact_status])}</span></span></header><h5>${esc(obligation.statement)}</h5>${obligation.governance.objective_id?`<p class="workflow-objective-link">Objective: <code>${esc(obligation.governance.objective_id)}</code></p>`:''}${gap}${workflowProofMarkup(obligation)}<p class="note">${obligation.candidate_count} baseline witnesses · ${counts.exact_fact_change} exact · ${counts.changed_witness_method} method · ${counts.structural_context} context</p>${evidence||(obligation.evidence_status==='gap'?'':'<p class="note">No witness in this obligation intersects the PR impact envelope.</p>')}</article>`;
  }).join('');
  return `<details class="customer-workflow ${esc(workflow.impact_status)}" ${workflow.impact_status!=='unaffected'?'open':''}><summary><span class="pill">Workflow</span><span class="pill ${tones[workflow.impact_status]}">${esc(labels[workflow.impact_status])}</span><strong>${esc(workflow.name)}</strong><small>${impacted}/${workflow.obligations.length} obligations intersect</small></summary><p>${esc(workflow.customer_outcome)}</p><div class="workflow-services">${workflow.participating_services.map(service=>`<span>${esc(service.replace(/^ftgo-/,'').replace(/-service$/,''))}</span>`).join('')}</div><div class="workflow-obligations">${obligations}</div></details>`;
 }).join('');
 const s=data.summary;
 return `<section class="customer-workflows"><header><div><h3>Governance model for this PR</h3><p>Architecture constrains every customer workflow; business contracts and proposed obligations sit inside those workflows.</p></div></header>${workflowGovernanceHierarchy(data,doc)}<div class="workflow-summary"><span><b>${s.workflow_count}</b> workflows</span><span><b>${s.affected_workflows}</b> intersect this PR</span><span><b>${s.exact_fact_change}</b> exact facts</span><span><b>${s.changed_witness_method}</b> witness methods</span><span><b>${s.structural_context}</b> context</span></div>${workflowIntersectionMap(data)}<h4 class="workflow-catalog-title">Workflow obligations and governance status</h4>${workflows}${workflowCandidateInventory(data)}<details class="candidate-impact-qualification"><summary>Scope and qualification</summary><p>${esc(data.domain.qualification||'')}</p><p>${esc(data.qualification)}</p></details></section>`;
}
function workflowImpactStatus(workflow){
 return workflow.impact_status==='direct_change'?{tone:'gap',label:'Affected by this PR'}:workflow.impact_status==='context_only'?{tone:'unassessed',label:'Related context affected'}:{tone:'clear',label:'Not affected by this PR'};
}
function workflowHolonMap(map,workflow,state,architecture){
 const obligations=workflow.obligations;
 const selectedObligation=obligations.find(row=>row.id===state.governedObligation)||obligations.find(row=>row.impact_status!=='unaffected')||obligations[0];
 state.governedObligation=selectedObligation?.id;
 const evidence=obligations.flatMap((obligation,index)=>obligation.evidence.map(row=>({...row,obligation,index:index+1,governance:obligation.governance})));
 const regionIds=new Set(evidence.flatMap(row=>row.intent_region_ids));
 const methodIds=new Set(evidence.map(row=>row.method_id));
 const holons=map.holons.filter(row=>regionIds.has(row.id));
 const methods=new Map(map.methods.filter(row=>methodIds.has(row.id)).map(row=>[row.id,row]));
 const evidenceByMethod=new Map();
 for(const row of evidence){if(!evidenceByMethod.has(row.method_id))evidenceByMethod.set(row.method_id,[]);evidenceByMethod.get(row.method_id).push(row);}
 const declaredServices=new Set(workflow.participating_services);
 const serviceIds=new Set([...holons.flatMap(row=>row.service_ids),...map.services.filter(row=>declaredServices.has(row.label)).map(row=>row.id)]);
 const serviceCandidates=map.services.filter(row=>serviceIds.has(row.id));
 const serviceGroups=new Map();
 for(const service of serviceCandidates){if(!serviceGroups.has(service.label))serviceGroups.set(service.label,[]);serviceGroups.get(service.label).push(service);}
 const services=[...serviceGroups.values()].flatMap(rows=>{const witnessed=rows.filter(service=>holons.some(holon=>holon.service_ids.includes(service.id)));return witnessed.length?witnessed:[rows[0]];});
 const focus=holons.find(row=>row.id===state.governedHolon);
 const visible=focus?[focus]:holons;
 const priority={exact_fact_change:3,changed_witness_method:2,structural_context:1,unaffected:0};
 const strongest=rows=>rows.reduce((best,row)=>priority[row.classification]>priority[best]?row.classification:best,'unaffected');
 const cell=(holon,serviceId)=>{
  const holonEvidence=evidence.filter(row=>row.intent_region_ids.includes(holon.id));
  const obligationRows=[...new Map(holonEvidence.map(row=>[row.obligation.id,row.obligation])).values()];
  const dots=[...new Set(holonEvidence.map(row=>row.method_id))].map(methodId=>{
   const method=methods.get(methodId),rows=evidenceByMethod.get(methodId)||[];
   if(!method||!method.service_ids.includes(serviceId))return '';
   const impact=strongest(rows),accepted=rows.some(row=>row.governance.status==='accepted');
   const selected=rows.some(row=>row.obligation.id===selectedObligation?.id);
   return `<button class="holon-method-dot workflow-dot ${esc(impact)} ${accepted?'accepted':''} ${selected?'selected-obligation':''}" data-governed-method="${esc(methodId)}" title="${esc(method.method)} · ${rows.length} workflow candidate${rows.length===1?'':'s'} · ${esc(impact.replaceAll('_',' '))}" aria-label="${esc(method.method)}"></button>`;
  }).join('');
  const selected=obligationRows.some(row=>row.id===selectedObligation?.id);
  return `<div class="governance-holon-cell workflow-holon ${selected?'selected-obligation':''}"><button class="holon-cell-title" data-governed-holon="${esc(holon.id)}">Intent holon <small>${esc(holon.id.split(':').pop().slice(0,8))}</small></button><div class="workflow-holon-obligations">${obligationRows.map(row=>`<span class="${row.governance.status==='accepted'?'accepted':''}">${obligations.indexOf(row)+1}. ${esc(row.id.split('.').pop().replaceAll('_',' '))}</span>`).join('')}</div><div class="holon-method-dots">${dots}</div><small>${holonEvidence.length} candidate witness${holonEvidence.length===1?'':'es'}</small></div>`;
 };
 const method=methods.get(state.governedMethod);
 const methodEvidence=method?(evidenceByMethod.get(method.id)||[]):[];
 const inspector=method?`<div class="governance-method-inspector workflow-method-inspector"><b>${esc(method.method)}</b><p>${esc(method.file)}</p>${methodEvidence.map(row=>{const replacement=row.replacement_parameters?.length?row.replacement_parameters.map(value=>`<span class="fact-after">+ ${esc(workflowFactExpression(row.form,value))}</span>`).join(''):'';return `<section><header><span class="pill ${row.governance.status==='accepted'?'green':'amber'}">${esc(row.governance.status)}</span><span class="pill ${row.classification==='exact_fact_change'?'red':row.classification==='unaffected'?'':'amber'}">${esc(row.classification.replaceAll('_',' '))}</span></header><strong>${esc(row.obligation.statement)}</strong><div class="workflow-fact-delta"><span class="${replacement?'fact-before':''}">${replacement?'− ':''}${esc(workflowFactExpression(row.form,row.baseline_parameters))}</span>${replacement}</div><small>${esc(row.candidate_id)}</small></section>`;}).join('')}</div>`:'';
 return `<div class="workflow-map"><div class="workflow-map-head"><div><span class="pill">Workflow</span><h3>${esc(workflow.name)}</h3><p>${esc(workflow.customer_outcome)}</p></div><span class="pill ${workflow.impact_status==='direct_change'?'amber':''}">${esc(workflowImpactStatus(workflow).label)}</span></div><div class="workflow-obligation-route">${obligations.map((row,index)=>`<button data-workflow-obligation="${esc(row.id)}" aria-pressed="${row.id===selectedObligation?.id}"><b>${index+1}</b><span>${esc(row.id.split('.').pop().replaceAll('_',' '))}</span><small>${esc(row.governance.status)} · ${esc(row.impact_status.replaceAll('_',' '))}</small></button>`).join('<i>→</i>')}</div><div class="governance-application-cell workflow-application"><header><b>${esc(map.application.label)}</b><span><span class="pill green">${esc(architecture.status)} architecture</span> <small>${esc(architecture.objective_id)}</small></span>${focus?'<button data-governed-reset>All workflow holons</button>':''}</header><div class="governance-service-cells">${services.map(service=>{const children=visible.filter(holon=>holon.service_ids.includes(service.id));const participant=declaredServices.has(service.label);return `<section class="governance-service-cell ${participant?'direct':'shared'}"><h4>${esc(service.label)}</h4><small>${participant?'Declared workflow participant':'Witnessed structural context'}</small><div class="governance-holon-cells">${children.map(holon=>cell(holon,service.id)).join('')||'<p class="note">Declared participant; no source witness is anchored here yet.</p>'}</div></section>`;}).join('')}</div></div><p class="governance-map-legend"><span class="legend-red">● Exact candidate changed</span><span class="legend-amber">● Witness method changed</span><span class="legend-blue">● Structural context</span><span>◎ Accepted contract witness</span></p>${inspector}<details><summary>How workflows map to intent holons</summary><p>Candidate witness → method capsule → recorded intent-region membership. Obligation ordering comes from the workflow declaration, not holon adjacency.</p><p>${esc(map.qualification)}</p></details></div>`;
}
function workflowOutcome(workflow){return workflow.outcome||workflow.customer_outcome||'';}
function workflowImpactExplorer(doc,selected,workflows,state){
 const map=doc.holon_map;
 if(!map)return '<p class="note">This evidence package does not include method and holon mappings.</p>';
 const methodMap=new Map(map.methods.map(row=>[row.id,row]));
 const holonMap=new Map(map.holons.map(row=>[row.id,row]));
 const serviceMap=new Map(map.services.map(row=>[row.id,row.label]));
 const affected=[];
 for(const workflow of workflows)for(const obligation of workflow.obligations)for(const row of obligation.evidence||[])if(row.classification!=='unaffected')affected.push({...row,workflow,obligation});
 const byMethod=new Map();
 for(const row of affected){if(!byMethod.has(row.method_id))byMethod.set(row.method_id,[]);byMethod.get(row.method_id).push(row);}
 const priority={exact_fact_change:3,changed_witness_method:2,structural_context:1};
 const strongest=rows=>rows.reduce((best,row)=>priority[row.classification]>priority[best]?row.classification:best,'structural_context');
 const serviceGroups=new Map();
 for(const [methodId,rows] of byMethod){
  const method=methodMap.get(methodId);
  const serviceIds=method?.service_ids?.length?method.service_ids:['unmapped-service'];
  const regionIds=[...new Set(rows.flatMap(row=>row.intent_region_ids||[]).filter(id=>holonMap.has(id)))];
  const holonIds=regionIds.length?regionIds:['unmapped-holon'];
  for(const serviceId of serviceIds){
   const service=serviceMap.get(serviceId)||String(rows[0].source.path||'Other source').split('/')[0];
   if(!serviceGroups.has(service))serviceGroups.set(service,new Map());
   for(const holonId of holonIds){
    if(!serviceGroups.get(service).has(holonId))serviceGroups.get(service).set(holonId,new Set());
    serviceGroups.get(service).get(holonId).add(methodId);
   }
  }
 }
 const selectedMethod=methodMap.get(state.governedMethod);
 const selectedHolon=state.governedHolon;
 const inspectRows=selectedMethod?(byMethod.get(selectedMethod.id)||[]):selectedHolon==='unmapped-holon'?affected.filter(row=>!(row.intent_region_ids||[]).some(id=>holonMap.has(id))):selectedHolon?affected.filter(row=>(row.intent_region_ids||[]).includes(selectedHolon)):[];
 const inspector=inspectRows.length?`<section class="workflow-impact-inspector"><header><div><span class="eyebrow">${selectedMethod?'Affected method':'Affected holon'}</span><h3>${esc(selectedMethod?.method||selectedHolon)}</h3>${selectedMethod?`<p>${esc(selectedMethod.file)}</p>`:''}</div><button data-governed-reset>Close</button></header><h4>${[...new Set(inspectRows.map(row=>row.workflow.name))].length} workflow${[...new Set(inspectRows.map(row=>row.workflow.name))].length===1?'':'s'} changed here</h4>${inspectRows.map(row=>`<article><div><span class="pill ${row.classification==='exact_fact_change'?'red':'amber'}">${esc(row.classification.replaceAll('_',' '))}</span><span class="pill">${esc((doc.customer_workflows.workflow_sets||[]).find(set=>set.id===row.workflow.set_id)?.name||row.workflow.set_id)}</span></div><strong>${esc(row.workflow.name)}</strong><p>${esc(row.obligation.statement)}</p><div class="workflow-fact-delta"><span class="${row.replacement_parameters.length?'fact-before':''}">${row.replacement_parameters.length?'− ':''}${esc(workflowFactExpression(row.form,row.baseline_parameters))}</span>${row.replacement_parameters.map(value=>`<span class="fact-after">+ ${esc(workflowFactExpression(row.form,value))}</span>`).join('')}</div><small>${esc(row.candidate_id)} · ${esc(row.source.path)}:${esc(row.source.line||'—')}</small></article>`).join('')}</section>`:'<p class="workflow-impact-prompt">Select an affected holon or method to see which workflows and obligations changed there.</p>';
 const tree=[...serviceGroups].sort(([a],[b])=>a.localeCompare(b)).map(([service,holons])=>`<section class="impact-service"><header><h3>${esc(service.replace(/^ftgo-/,'').replace(/-service$/,''))}</h3><span>${holons.size} affected holon${holons.size===1?'':'s'}</span></header>${[...holons].sort(([a],[b])=>a.localeCompare(b)).map(([holonId,methodIds])=>{const rows=[...methodIds].flatMap(id=>byMethod.get(id)||[]);const flowNames=[...new Set(rows.map(row=>row.workflow.name))];return `<article class="impact-holon ${holonId===selectedHolon?'selected':''}"><button class="impact-holon-title" data-governed-holon="${esc(holonId)}"><b>${holonId==='unmapped-holon'?'No native holon membership':'Intent holon '+esc(holonId.split(':').pop().slice(0,8))}</b><span>${flowNames.length} affected workflow${flowNames.length===1?'':'s'}</span></button><div class="impact-methods">${[...methodIds].sort().map(id=>{const method=methodMap.get(id),rows=byMethod.get(id)||[],impact=strongest(rows);return `<button class="impact-method ${esc(impact)}" data-governed-method="${esc(id)}" aria-pressed="${id===state.governedMethod}"><span>${esc(String(method?.method||rows[0].method).split('#').pop())}</span><small>${rows.length} workflow binding${rows.length===1?'':'s'}</small></button>`;}).join('')}</div></article>`;}).join('')}</section>`).join('');
 const selectedStatus=workflowImpactStatus(selected);
 const obligations=selected.obligations.map((row,index)=>{const proof=row.proof_comparison?.verdict||row.proof_status;const proofTone=proof==='proved'?'green':proof==='broken'?'red':'amber';return `<article class="selected-workflow-obligation ${esc(row.impact_status)}"><b>${index+1}</b><div><span>${esc(row.id.split('.').pop().replaceAll('_',' '))}</span><small>${esc(row.statement)}</small>${row.proof?`<small>Multi-witness proof <span class="pill ${proofTone}">${esc(proof)}</span></small>`:''}</div><span class="pill ${row.impact_status==='direct_change'?'amber':row.impact_status==='context_only'?'':'green'}">${esc(workflowImpactStatus(row).label)}</span></article>`;}).join('');
 return `<div class="workflow-impact-explorer"><section class="selected-workflow-summary"><header><div><span class="pill">${esc(selected.actor)} workflow</span> <span class="pill ${selected.governance_status==='accepted'?'green':'amber'}">governance ${esc(selected.governance_status)}</span><h3>${esc(selected.name)}</h3><p>${esc(workflowOutcome(selected))}</p></div><span class="pill ${selectedStatus.tone==='gap'?'amber':selectedStatus.tone==='clear'?'green':''}">${esc(selectedStatus.label)}</span></header><details><summary>${selected.obligations.length} workflow obligations</summary><div class="selected-workflow-obligations">${obligations}</div></details></section><section class="affected-structure"><header><div><h2>Affected holons and methods</h2><p>Only methods intersecting this PR’s candidate-impact envelope appear here.</p></div><span class="pill ${affected.length?'amber':'green'}">${byMethod.size} affected methods</span></header>${tree||'<div class="empty">No workflow-bound candidate method intersects this PR.</div>'}</section>${inspector}</div>`;
}
function acceptedObjectivesMarkup(doc,options){
 const areas=[...(doc.architecture||[]).map(a=>({...a,kind:'architecture'})),...(doc.business||[]).map(a=>({...a,kind:'business'}))];
 if(!areas.length)return '<article class="card"><div class="body"><h2>Governed objectives unavailable</h2><p>This run did not supply accepted objective declarations.</p></div></article>';
 const state=reviewState(options.scope);
 const selected=areas.find(a=>a.id===state.governedArea)||areas.find(a=>governanceAreaStatus(a).tone==='violation')||areas[0];
 state.governedArea=selected.id;
 const buttons=areas.map(area=>{const status=governanceAreaStatus(area);return `<button class="governance-description ${esc(status.tone)}" data-governed-area="${esc(area.id)}" aria-pressed="${area.id===selected.id}"><span class="pill">${esc(area.kind)} objective</span><strong>${esc(area.statement||area.id)}</strong><span class="governance-description-status">${status.tone==='clear'?'✓':status.tone==='violation'?'✕':'◉'} ${esc(status.label)}</span></button>`;}).join('');
 const status=governanceAreaStatus(selected),mapping=doc.holon_map?.mappings.find(row=>row.id===selected.id&&row.kind===selected.kind);
 const terrain=typeof objectiveTerritoriesMarkup==='function'?objectiveTerritoriesMarkup(doc,selected.id):'<p class="note">Objective terrain unavailable in this view.</p>';
 const obligations=selected.accepted_obligations||[];
 return `<section data-review-scope="${esc(options.scope)}" class="governed-objectives"><h2>Governed objectives</h2><p>Accepted architecture and business objectives, their recorded results, and their mapped code regions.</p><div class="governance-mapping-layout"><nav class="governance-description-list" aria-label="Accepted objectives">${buttons}</nav><div class="governance-mapping-panel"><header><span class="pill ${status.tone==='clear'?'green':status.tone==='violation'?'red':'amber'}">${esc(status.label)}</span><h3>${esc(selected.statement||selected.id)}</h3><p class="note">${mapping?(mapping.scope_method_ids||mapping.method_ids||[]).length+' mapped methods · '+(mapping.holon_ids||[]).length+' related intent areas':'Exact objective mapping unavailable.'}</p></header>${terrain}<details class="objective-inspect"><summary>${obligations.length} accepted obligations for this objective</summary>${obligations.map(row=>`<p><strong>${esc(row.statement||row.id)}</strong><br><code>${esc(row.id)}</code> · ${esc(row.status)}</p>`).join('')||'<p>No accepted obligation evidence was supplied.</p>'}</details></div></div></section>`;
}
function governedObjectivesMarkup(packet,options){
 const doc=packet.governed_objectives?{...packet.governed_objectives,boundaries:governedBoundaryAreas(packet),source_packet:packet}:null;
 if(!doc)return '<article class="card"><div class="body"><h2>Governed objectives unavailable</h2><p>This run did not supply its accepted governance snapshot.</p></div></article>';
 if(doc.baseline_commit!==packet.baseline_commit||doc.head_commit!==packet.head_commit)throw Error('Governance snapshot differs from this revision');
 reviewBoards.set(options.scope,options);
 const state=reviewState(options.scope),data=doc.customer_workflows,workflows=data?.workflows||[],query=new URLSearchParams(location.search);
 if(!workflows.length)return acceptedObjectivesMarkup(doc,options);
 if(!state.governedArea){const requested=query.get('area'),affected=workflows.find(row=>row.impact_status!=='unaffected');state.governedArea=workflows.some(row=>row.id===requested)?requested:affected?.id||null;}
 if(!state.governedMethod&&query.get('method')&&doc.holon_map?.methods.some(row=>row.id===query.get('method')))state.governedMethod=query.get('method');
 if(!state.governedHolon&&query.get('holon')&&doc.holon_map?.holons.some(row=>row.id===query.get('holon')))state.governedHolon=query.get('holon');
 const relatedWorkflowIds=new Set(workflows.filter(workflow=>workflow.obligations.some(obligation=>(obligation.evidence||[]).some(row=>{
  if(row.classification==='unaffected')return false;
  return Boolean(state.governedMethod&&row.method_id===state.governedMethod||state.governedHolon&&(row.intent_region_ids||[]).includes(state.governedHolon));
 }))).map(row=>row.id));
 if(relatedWorkflowIds.size&&!relatedWorkflowIds.has(state.governedArea))state.governedArea=[...relatedWorkflowIds][0];
 const selected=workflows.find(row=>row.id===state.governedArea)||workflows.find(row=>row.impact_status!=='unaffected');
 const sets=data.workflow_sets||[{id:'customer',name:'Customer workflows',description:'Customer-visible outcomes.'}];
 const architecture=data.architecture;
 const directlyAffected=workflows.filter(row=>row.impact_status==='direct_change'),contextAffected=workflows.filter(row=>row.impact_status==='context_only');
 const unaffected=workflows.filter(row=>row.impact_status==='unaffected');
 const workflowButton=row=>`<button data-governed-area="${esc(row.id)}" class="${row.id===selected?.id?'selected':''} ${relatedWorkflowIds.has(row.id)?'holon-related':''} ${row.impact_status==='direct_change'?'pr-affected':''}"><span>${esc(row.name)}</span><small>${esc(workflowImpactStatus(row).label)}</small></button>`;
 const affectedSets=sets.map(set=>{
  const rows=workflows.filter(row=>(row.set_id||'customer')===set.id&&row.impact_status!=='unaffected');
  if(!rows.length)return '';
  const related=rows.some(row=>relatedWorkflowIds.has(row.id));
  return `<details class="workflow-set ${related?'holon-related':''}" open><summary><span><b>${esc(set.name)}</b><small>${esc(set.description||'')} · ${rows.length} affected or context-related</small></span></summary><div class="workflow-set-items">${rows.map(workflowButton).join('')}</div></details>`;
 }).join('');
 const unaffectedTile=unaffected.length?`<details class="workflow-set workflow-unaffected" ${selected?.impact_status==='unaffected'?'open':''}><summary><span><b>Unaffected workflows (${unaffected.length})</b></span></summary><div class="workflow-set-items">${unaffected.map(workflowButton).join('')}</div></details>`:'';
 const browser=`<div class="workflow-set-browser"><section class="workflow-pr-overview"><span>PR workflow impact</span><strong>${directlyAffected.length} workflow${directlyAffected.length===1?'':'s'} affected by this PR</strong><p>${directlyAffected.length?esc(directlyAffected.map(row=>row.name).join(' · ')):'No workflow-bound evidence directly intersects this PR.'}${contextAffected.length?` · ${contextAffected.length} additional context-only`:''}</p></section><section class="workflow-architecture"><span class="pill green">${esc(architecture.status)} architecture objective</span><strong>${esc(architecture.statement)}</strong></section>${affectedSets}${unaffectedTile}</div>`;
 return `<section data-review-scope="${esc(options.scope)}" class="governed-objectives"><h2>Workflow impact</h2><p>Select a highlighted method to inspect its changed source lines and connected workflow obligations.</p><div class="governance-mapping-layout workflow-impact-layout"><nav aria-label="Workflow catalog">${browser}</nav><div class="governance-mapping-panel">${selected?workflowMethodImpactMarkup(doc,selected,workflows,state):'<div class="empty">No workflows are affected by this PR. Expand unaffected workflows to inspect them.</div>'}</div></div><details class="governance-coverage"><summary>Governance and candidate coverage</summary><p>${data.candidate_inventory.unique_assigned_candidates} distinct candidates assigned across ${workflows.length} workflows · ${data.candidate_inventory.unassigned_candidates} candidates not yet classified into a workflow.</p><p>Baseline ${esc(doc.baseline_commit.slice(0,12))} → revision ${esc(doc.head_commit.slice(0,12))}</p><p>${esc(data.qualification)}</p></details></section>`;
}
function governanceHolonMap(map,mapping,area,state){
 const holons=map.holons.filter(h=>mapping.holon_ids.includes(h.id));
 const methods=new Map(map.methods.map(m=>[m.id,m]));
 const contextServices=new Set([...mapping.service_ids,...holons.flatMap(h=>h.service_ids)]);
 const services=map.services.filter(s=>contextServices.has(s.id));
 const focus=holons.find(h=>h.id===state.governedHolon);
 const visible=focus?[focus]:holons;
 const detailed=Boolean(focus)||area.kind==='business';
 const cell=(h,sid)=>{
  const dots=h.method_ids.map(id=>methods.get(id)).filter(m=>m?.service_ids.includes(sid));
  const changed=dots.some(m=>m.changed);
  if(!detailed)return `<button class="holon-overview-dot ${changed?'changed':''}" data-governed-holon="${esc(h.id)}" title="${esc(h.id)} · ${dots.length} witnessed methods${changed?' · contains intent changes':''}" aria-label="${esc(h.id)}: ${dots.length} witnessed methods${changed?', contains changes':''}"></button>`;
  return `<div class="governance-holon-cell ${changed?'changed':''}"><button class="holon-cell-title" data-governed-holon="${esc(h.id)}">Unlabeled holon <small>${esc(h.id.split(':').pop().slice(0,8))}</small></button><span class="holon-shared">${h.service_ids.length>1?'Shared across '+h.service_ids.length+' services':'Recorded service context'}</span><div class="holon-method-dots">${dots.map(m=>`<button class="holon-method-dot ${m.changed?'changed':''} ${mapping.method_ids.includes(m.id)?'contract-entry':''}" data-governed-method="${esc(m.id)}" title="${esc(m.method)}${m.changed?' · intent changed':''}" aria-label="${esc(m.method)}${m.changed?', intent changed':''}"></button>`).join('')}</div><small>${dots.length} witnessed method${dots.length===1?'':'s'}</small></div>`;
 };
 const method=map.methods.find(m=>m.id===state.governedMethod);
 return `<p class="note">${esc(mapping.relationship)}</p><div class="governance-application-cell"><header><b>${esc(map.application.label)}</b>${focus?'<button data-governed-reset>All mapped holons</button>':''}</header><div class="governance-service-cells">${services.map(service=>{const children=visible.filter(h=>h.service_ids.includes(service.id));if(!children.length)return '';return `<section class="governance-service-cell ${mapping.service_ids.includes(service.id)?'direct':'shared'}"><h4>${esc(service.label)}</h4><small>${mapping.service_ids.includes(service.id)?'Governed anchor / entry context':'Shared holon context'}</small><div class="governance-holon-cells">${children.map(h=>cell(h,service.id)).join('')}</div></section>`;}).join('')||'<p class="note">No service placement is recorded for these mapped holons.</p>'}</div></div><p class="governance-map-legend"><span class="legend-blue">● Mapped membership</span><span class="legend-amber">● Intent changed in this PR</span><span>◎ Contract entry method</span></p>${!detailed?'<p class="note">Each dot is a holon. Select one to see the method dots inside it.</p>':'<p class="note">Dots inside cells are witnessed methods. Select a dot to inspect its connection.</p>'}${method?`<div class="governance-method-inspector"><b>${esc(method.method)}</b><p>${esc(method.file)}</p><span class="pill ${method.changed?'amber':''}">${method.changed?'Recorded intent changed':'No recorded intent change for this mapped method'}</span><p>${method.holon_ids.length} holon memberships · ${method.witness_ids.length} governance witnesses</p>${method.review_ids[0]?`<button data-open-region="${esc(method.review_ids[0])}">Explain in Review → Intent diffs</button> <button data-review-source="${esc(method.review_ids[0])}">Inspect source</button>`:''}</div>`:''}<details><summary>How to read these connections</summary><p>${esc(map.qualification)}</p><p>${holons.length} mapped holons. Cell size is a layout choice, not a risk or confidence score.</p></details>`;
}
function governanceSelectedEvidence(area,packet,options){
 if(area.kind==='architecture')return `<details class="objective-inspect"><summary>Accepted declaration and architecture evidence</summary>${intentDslMarkup({id:area.id,statement:area.statement,anchors:area.anchors})}<p>${esc(area.observation?.qualification||'No architecture observation was supplied.')}</p><pre>${esc(JSON.stringify(area.observation?.changes||[],null,2))}</pre></details>`;
 const story=(packet.intent_stories||[]).find(s=>s.related_flow_ids?.includes('contract:'+area.id));
 const missing=area.result?.missing||[];
 const values=missing.flatMap(m=>[m.target_field,m.value_field]);
 return `<details class="objective-inspect"><summary>Accepted contract and source evidence</summary>${intentDslMarkup({id:area.id,statement:area.statement,service:area.service,entry_method:area.entry_method,required_assignments:area.required_assignments},values)}${missing.length?'<p class="note">Highlighted tokens identify the missing required witness. The recorded result is evidence unavailable, not a confirmed violation.</p>':''}${story?`<button data-review-source="${esc(story.id)}">Inspect source diff</button> <button data-open-region="${esc(story.id)}">Explain in Review → Intent diffs</button>`:''}<p>No parent business-objective link is supplied for this contract.</p><pre>${esc(JSON.stringify(area.result||{status:'not_assessed'},null,2))}</pre></details>`;
}
const METHOD_HOLON_COLORS=['#8250df','#0969da','#1a7f37','#bf8700','#cf222e','#0e9aa7','#d63384','#bc4c00'];
function clearMethodHolonHover(terrain,skipPinnedRestore=false){
 if(!terrain)return;
 terrain.classList.remove('is-holon-hovering');
 terrain.querySelectorAll('.workflow-impact-method').forEach(node=>node.classList.remove('holon-peer','holon-origin'));
 terrain.querySelectorAll('.workflow-method-holon-ring').forEach(node=>{node.classList.remove('is-active');node.style.removeProperty('--holon-color');node.setAttribute('r','4');});
 if(!skipPinnedRestore&&terrain.dataset.pinnedMethod){const pinned=[...terrain.querySelectorAll('.workflow-impact-method')].find(node=>node.dataset.methodId===terrain.dataset.pinnedMethod);if(pinned){showMethodHolonHover(pinned,true);return;}}
 if(!skipPinnedRestore&&terrain.dataset.pinnedHolon){const pinned=[...terrain.querySelectorAll('[data-holon-viewer-id]')].find(node=>node.dataset.holonViewerId===terrain.dataset.pinnedHolon);if(pinned){showHolonViewerPreview(pinned,true);return;}}
 const status=terrain.querySelector('[data-holon-hover-status]');
 if(status)status.textContent='Hover a method to inspect its holon memberships; click to open its source changes.';
}
function showMethodHolonHover(method,pinned=false){
 const terrain=method?.closest('[data-method-terrain]');if(!terrain)return;
 clearMethodHolonHover(terrain,true);
 const holonIds=String(method.dataset.holonIds||'').split(/\s+/).filter(Boolean),label=method.dataset.methodLabel||method.dataset.methodId;
 method.classList.add('holon-origin');
 const status=terrain.querySelector('[data-holon-hover-status]');
 if(!holonIds.length){if(status)status.textContent=`${label} is not assigned to a flow holon.`;return;}
 const active=new Map(holonIds.map((id,index)=>[id,index]));
 const holonLabels=new Map([...terrain.querySelectorAll('[data-holon-description-id]')].map(node=>[node.dataset.holonDescriptionId,node.dataset.holonLabel]));
 terrain.classList.add('is-holon-hovering');
 terrain.querySelectorAll('.workflow-impact-method').forEach(node=>{const memberships=String(node.dataset.holonIds||'').split(/\s+/);node.classList.toggle('holon-peer',memberships.some(id=>active.has(id)));});
 terrain.querySelectorAll('.workflow-method-holon-ring').forEach(node=>{const index=active.get(node.dataset.holonMembership);if(index===undefined)return;node.classList.add('is-active');node.style.setProperty('--holon-color',METHOD_HOLON_COLORS[index%METHOD_HOLON_COLORS.length]);node.setAttribute('r',String(4+index*1.8));});
 if(status){status.textContent='';const prefix=document.createElement('span');prefix.className='method-holon-status-prefix';prefix.textContent=`${label} belongs to`;prefix.title=prefix.textContent;status.append(prefix);holonIds.forEach((id,index)=>{const chip=document.createElement('span');chip.className='holon-color-chip';chip.style.setProperty('--holon-color',METHOD_HOLON_COLORS[index%METHOD_HOLON_COLORS.length]);chip.textContent=holonLabels.get(id)||id;chip.title=id;status.append(chip);});}
}
function resetHolonViewerDetail(terrain){
 const detail=terrain?.querySelector('[data-holon-viewer-detail]');
 if(detail)detail.textContent='Hover or focus a relevant holon to see its relationship and methods.';
 const relationship=terrain?.querySelector('[data-holon-relationship]');
 if(relationship)relationship.textContent=terrain.dataset.defaultRelationship||'';
}
function showHolonViewerPreview(button,pinned=false){
 const terrain=button?.closest('[data-method-terrain]');if(!terrain)return;
 clearMethodHolonHover(terrain,true);
 const holonId=button.dataset.holonViewerId,label=button.dataset.holonViewerLabel||holonId,color=METHOD_HOLON_COLORS[0];
 const members=[...terrain.querySelectorAll('.workflow-impact-method')].filter(node=>String(node.dataset.holonIds||'').split(/\s+/).includes(holonId)).sort((left,right)=>{const a=String(left.dataset.methodLabel),b=String(right.dataset.methodLabel);return a<b?-1:a>b?1:0;});
 terrain.classList.add('is-holon-hovering');
 members.forEach(node=>node.classList.add('holon-peer'));
 terrain.querySelectorAll('.workflow-method-holon-ring').forEach(node=>{if(node.dataset.holonMembership!==holonId)return;node.classList.add('is-active');node.style.setProperty('--holon-color',color);node.setAttribute('r','4');});
 const status=terrain.querySelector('[data-holon-hover-status]');
 if(status){status.textContent='';const prefix=document.createElement('span');prefix.className='method-holon-status-prefix';prefix.textContent='Holon:';status.append(prefix);const chip=document.createElement('span');chip.className='holon-color-chip';chip.style.setProperty('--holon-color',color);chip.textContent=label;chip.title=holonId;status.append(chip);}
 const relationship=terrain.querySelector('[data-holon-relationship]');if(relationship)relationship.textContent=button.dataset.holonRelationship||label;
 const detail=terrain.querySelector('[data-holon-viewer-detail]');if(!detail)return;
 detail.textContent='';
 const heading=document.createElement('h4');heading.textContent=label;detail.append(heading);
 const identity=document.createElement('code');identity.textContent=holonId;detail.append(identity);
 const direct=members.filter(node=>node.classList.contains('exact_fact_change')||node.classList.contains('changed_witness_method')),context=members.filter(node=>node.classList.contains('structural_context')),stable=members.filter(node=>node.classList.contains('stable'));
 const summary=document.createElement('p');summary.textContent=`${members.length} methods · ${direct.length} direct PR intersection${direct.length===1?'':'s'} · ${context.length} context`;detail.append(summary);
 const methodButton=method=>{const item=document.createElement('button');item.dataset.governedMethod=method.dataset.methodId;const name=document.createElement('b');name.textContent=method.dataset.methodLabel;const impact=document.createElement('small');const classification=['exact_fact_change','changed_witness_method','structural_context'].find(value=>method.classList.contains(value));item.className=`holon-viewer-method ${classification||'stable'}`;impact.textContent=classification?classification.replaceAll('_',' '):'stable in this PR';item.append(name,impact);return item;};
 const addGroup=(title,rows)=>{if(!rows.length)return;const section=document.createElement('section');section.className='holon-detail-method-group';const label=document.createElement('h5');label.textContent=title;const list=document.createElement('div');list.className='holon-viewer-methods';rows.forEach(method=>list.append(methodButton(method)));section.append(label,list);detail.append(section);};
 addGroup('Direct PR intersections',direct);addGroup('Structural context',context);
 if(stable.length){const disclosure=document.createElement('details');disclosure.className='holon-stable-methods';const disclosureLabel=document.createElement('summary');disclosureLabel.textContent=`${stable.length} stable member method${stable.length===1?'':'s'}`;const list=document.createElement('div');list.className='holon-viewer-methods';stable.forEach(method=>list.append(methodButton(method)));disclosure.append(disclosureLabel,list);detail.append(disclosure);}
}
function nearestTerrainMethod(event){
 // Keyboard activation keeps its focused method. Pointer targeting uses SVG
 // coordinates so zoom and responsive scaling cannot change the nearest dot.
 if(event.type==='click'&&event.detail===0)return null;
 const svg=event.target.closest?.('svg.workflow-holon-brain');
 const matrix=svg?.getScreenCTM?.();
 if(!matrix||!Number.isFinite(event.clientX)||!Number.isFinite(event.clientY))return null;
 const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
 const local=point.matrixTransform(matrix.inverse());
 let nearest=null,distance=14*14;
 for(const method of svg.querySelectorAll('.workflow-impact-method')){
  const dot=method.querySelector('.workflow-method-dot');if(!dot)continue;
  const dx=Number(dot.getAttribute('cx'))-local.x,dy=Number(dot.getAttribute('cy'))-local.y,d=dx*dx+dy*dy;
  if(d<distance||(d===distance&&nearest&&method.dataset.methodId<nearest.dataset.methodId)){nearest=method;distance=d;}
 }
 return nearest;
}
document.addEventListener('click',event=>{
 const button=nearestTerrainMethod(event)||event.target.closest('button,[data-terrain-method],[data-terrain-holon],[data-governed-holon],[data-governed-method]');if(!button)return;
 const scope=button.closest('[data-review-scope]')?.dataset.reviewScope;if(!scope)return;
 const state=reviewState(scope);
 if(button.hasAttribute('data-open-holon-viewer')){state.holonViewerOpen=true;button.closest('[data-method-terrain]')?.querySelector('[data-holon-viewer-dialog]')?.show?.();}
 else if(button.hasAttribute('data-close-holon-viewer')){state.holonViewerOpen=false;button.closest('[data-holon-viewer-dialog]')?.close?.();}
 else if(button.dataset.governedArea){state.governedArea=button.dataset.governedArea;state.workflowTransition=null;state.holonViewerOpen=false;if(!button.closest('.holon-related-workflows'))state.governedHolon=null;state.governedMethod=null;state.governedObligation=null;render();const board=[...(document.querySelectorAll?.('[data-review-scope]')||[])].find(node=>node.dataset.reviewScope===scope);const terrain=board?.querySelector?.('[data-objective-focus]');terrain?.scrollIntoView?.({block:'nearest'});}
 else if(button.dataset.workflowObligation){state.governedObligation=button.dataset.workflowObligation;state.governedHolon=null;state.governedMethod=null;render();}
 else if(button.dataset.governedHolon){const holonId=button.dataset.governedHolon;state.governedHolon=holonId;state.governedMethod=null;state.holonViewerOpen=true;render();const board=[...(document.querySelectorAll?.('[data-review-scope]')||[])].find(node=>node.dataset.reviewScope===scope),terrain=board?.querySelector?.('[data-method-terrain]'),viewer=terrain?.querySelector?.('[data-holon-viewer-dialog]'),holon=[...(terrain?.querySelectorAll?.('[data-holon-viewer-id]')||[])].find(node=>node.dataset.holonViewerId===holonId);viewer?.show?.();if(terrain)terrain.dataset.pinnedHolon=holonId;if(holon){showHolonViewerPreview(holon,true);holon.scrollIntoView?.({block:'nearest'});}}
 else if(button.dataset.governedMethod){const methodId=button.dataset.governedMethod,currentTerrain=button.closest('[data-method-terrain]'),sourceMethod=[...(currentTerrain?.querySelectorAll?.('.workflow-impact-method')||[])].find(node=>node.dataset.methodId===methodId),relatedIds=String(sourceMethod?.dataset.relatedWorkflowIds||'').split(/\s+/).filter(Boolean),relatedNames=String(sourceMethod?.dataset.relatedWorkflowNames||'').split(' | ').filter(Boolean);state.workflowTransition=null;state.holonViewerOpen=false;if(relatedIds.length&&!relatedIds.includes(state.governedArea)){state.governedArea=relatedIds[0];state.workflowTransition=`Switched to ${relatedNames[0]||'the related workflow'} because ${sourceMethod?.dataset.methodLabel||'this method'} supports it.`;}state.governedMethod=methodId;render();const board=[...(document.querySelectorAll?.('[data-review-scope]')||[])].find(node=>node.dataset.reviewScope===scope),terrain=board?.querySelector?.('[data-method-terrain]'),method=[...(terrain?.querySelectorAll?.('.workflow-impact-method')||[])].find(node=>node.dataset.methodId===methodId),inspector=terrain?.querySelector?.('.workflow-holon-inspector');if(terrain)terrain.dataset.pinnedMethod=methodId;if(method)showMethodHolonHover(method,true);inspector?.scrollIntoView?.({block:'nearest',behavior:'smooth'});}
 else if(button.dataset.terrainHolon){state.governedHolon=button.dataset.terrainHolon;state.governedMethod=null;render();}
 else if(button.dataset.terrainMethod){state.governedMethod=button.dataset.terrainMethod;state.governedHolon=null;render();}
 else if(button.hasAttribute('data-terrain-membership')){state.terrainMembership=!state.terrainMembership;render();}
 else if(button.hasAttribute('data-governed-reset')){const keepViewer=Boolean(button.closest('[data-holon-viewer-dialog]'));state.governedHolon=null;state.governedMethod=null;state.holonViewerOpen=keepViewer;render();if(keepViewer){const board=[...(document.querySelectorAll?.('[data-review-scope]')||[])].find(node=>node.dataset.reviewScope===scope);board?.querySelector?.('[data-holon-viewer-dialog]')?.show?.();}}
});
document.addEventListener('close',event=>{const viewer=event.target.closest?.('[data-holon-viewer-dialog]');if(!viewer)return;const scope=viewer.closest('[data-review-scope]')?.dataset.reviewScope;if(scope)reviewState(scope).holonViewerOpen=false;},true);
let holonViewerDrag=null;
document.addEventListener('pointerdown',event=>{const header=event.target.closest?.('[data-holon-viewer-dialog]>header');if(!header||event.target.closest?.('button,input'))return;const viewer=header.parentElement,rect=viewer.getBoundingClientRect();holonViewerDrag={viewer,dx:event.clientX-rect.left,dy:event.clientY-rect.top};viewer.style.margin='0';viewer.style.right='auto';viewer.style.bottom='auto';viewer.style.left=`${rect.left}px`;viewer.style.top=`${rect.top}px`;viewer.classList.add('dragging');event.preventDefault();});
document.addEventListener('pointermove',event=>{if(!holonViewerDrag)return;const {viewer,dx,dy}=holonViewerDrag,rect=viewer.getBoundingClientRect(),left=Math.max(0,Math.min(window.innerWidth-rect.width,event.clientX-dx)),top=Math.max(0,Math.min(window.innerHeight-rect.height,event.clientY-dy));viewer.style.left=`${left}px`;viewer.style.top=`${top}px`;});
document.addEventListener('pointerup',()=>{holonViewerDrag?.viewer.classList.remove('dragging');holonViewerDrag=null;});
document.addEventListener('mousemove',event=>{const method=nearestTerrainMethod(event);if(method)showMethodHolonHover(method);});
document.addEventListener('mouseout',event=>{const method=event.target.closest?.('.workflow-impact-method[data-method-id]');if(method&&!method.contains(event.relatedTarget))clearMethodHolonHover(method.closest('[data-method-terrain]'));});
document.addEventListener('focusin',event=>{const method=event.target.closest?.('.workflow-impact-method[data-method-id]');if(method)showMethodHolonHover(method);});
document.addEventListener('focusout',event=>{const method=event.target.closest?.('.workflow-impact-method[data-method-id]');if(method&&!method.contains(event.relatedTarget))clearMethodHolonHover(method.closest('[data-method-terrain]'));});
document.addEventListener('mouseover',event=>{const holon=event.target.closest?.('[data-holon-viewer-id]');if(holon&&!holon.contains(event.relatedTarget))showHolonViewerPreview(holon);});
document.addEventListener('mouseout',event=>{const viewer=event.target.closest?.('.holon-viewer');if(viewer&&!viewer.contains(event.relatedTarget)){const terrain=viewer.closest('[data-method-terrain]');clearMethodHolonHover(terrain);if(!terrain?.dataset.pinnedHolon)resetHolonViewerDetail(terrain);}});
document.addEventListener('focusin',event=>{const holon=event.target.closest?.('[data-holon-viewer-id]');if(holon)showHolonViewerPreview(holon);});
document.addEventListener('focusout',event=>{const viewer=event.target.closest?.('.holon-viewer');if(viewer&&!viewer.contains(event.relatedTarget)){const terrain=viewer.closest('[data-method-terrain]');clearMethodHolonHover(terrain);if(!terrain?.dataset.pinnedHolon)resetHolonViewerDetail(terrain);}});
document.addEventListener('input',event=>{const input=event.target.closest?.('[data-holon-search]');if(!input)return;const viewer=input.closest('.holon-viewer'),terrain=viewer.closest('[data-method-terrain]'),query=input.value.trim().toLowerCase(),buttons=[...viewer.querySelectorAll('[data-holon-viewer-id]')];for(const button of buttons){button.hidden=Boolean(query)&&!String(button.dataset.holonSearchText||'').includes(query);const match=button.querySelector('[data-holon-search-match]');if(match){let methodNames=[];try{methodNames=JSON.parse(decodeURIComponent(button.dataset.holonMethodNames||'%5B%5D'));}catch{}const matchedMethod=methodNames.find(name=>String(name).toLowerCase().includes(query));match.textContent=matchedMethod?`Matched method: ${matchedMethod}`:'Matched holon label';match.hidden=!query||button.hidden;}}for(const group of viewer.querySelectorAll('[data-holon-group]')){const matches=[...group.querySelectorAll('[data-holon-viewer-id]')].some(button=>!button.hidden);group.hidden=Boolean(query)&&!matches;if(query&&matches&&group.tagName==='DETAILS')group.open=true;}const visible=buttons.filter(button=>!button.hidden).length,empty=viewer.querySelector('[data-holon-no-results]'),status=viewer.querySelector('[data-holon-search-status]');if(empty)empty.hidden=visible>0;if(status)status.textContent=query?`${visible} matching holon${visible===1?'':'s'}${terrain?.dataset.pinnedHolon?' · pinned preview retained':''}`:`${buttons.length} holons`;if(!terrain?.dataset.pinnedHolon){clearMethodHolonHover(terrain,true);resetHolonViewerDetail(terrain);}});
document.addEventListener('change',event=>{
 const select=event.target.closest('[data-workflow-select]');if(!select||!select.value)return;
 const scope=select.closest('[data-review-scope]')?.dataset.reviewScope;if(!scope)return;
 const state=reviewState(scope);state.governedArea=select.value;state.governedHolon=null;state.governedMethod=null;state.governedObligation=null;render();
});
document.addEventListener('keydown',event=>{
 if(event.key!=='Enter'&&event.key!==' ')return;
 const target=event.target.closest('[data-terrain-method],[data-terrain-holon],[data-governed-holon],[data-governed-method]');
 if(!target)return;
 event.preventDefault();target.click();
});
