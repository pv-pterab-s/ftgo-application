/* Pure rendering of a versioned evidence projection. No simulation or inferred reach. */
function territoryHull(points){
 const p=[...new Map(points.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 if(p.length<3)return p;
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const half=list=>{const h=[];for(const q of list){while(h.length>1&&cross(h.at(-2),h.at(-1),q)<=0)h.pop();h.push(q);}return h;};
 return [...half(p).slice(0,-1),...half([...p].reverse()).slice(0,-1)];
}
/* Follow dependent callers, never arbitrary proximity or shared membership.
   Each reached method retains a shortest witnessed route back to a finding. */
function territoryBlastRadius(doc){
 const t=doc.territory, map=doc.holon_map;
 const index=new Map(t.methods.map((m,i)=>[m[0],i]));
 const origins=new Set((doc.boundaries||[]).filter(b=>b.result.status==='violated').flatMap(b=>b.violation_method_ids||b.method_ids));
 for(const a of doc.business||[])if(a.governance_result?.status==='violated'||a.result?.status==='violated'){
  const mapping=map.mappings.find(m=>m.kind==='business'&&m.id===a.id);
  for(const id of mapping?.method_ids||[])origins.add(id);
 }
 const changeOrigins=new Set((doc.boundaries||[]).flatMap(b=>b.unbound_method_ids||(b.result.status==='baseline_update_proposed'?b.method_ids:[])));
 const callers=t.methods.map(()=>[]);
 for(const [a,b] of t.calls)if(callers[b]&&t.methods[a])callers[b].push(a);
 const paths=new Map(), queue=[];
 for(const id of [...new Set([...origins,...changeOrigins])].sort())if(index.has(id)){const i=index.get(id);paths.set(i,{origin:id,next:null,depth:0});queue.push(i);}
 for(let q=0;q<queue.length;q++){
  const callee=queue[q], path=paths.get(callee);
  for(const caller of callers[callee].sort((a,b)=>a-b))if(!paths.has(caller)){
   paths.set(caller,{origin:path.origin,next:callee,depth:path.depth+1});queue.push(caller);
  }
 }
 const reached=new Set(queue.map(i=>t.methods[i][0]));
 const potential=new Set([...reached].filter(id=>!origins.has(id)&&!changeOrigins.has(id)));
 const objectives=[...(doc.business||[]).map(a=>({...a,kind:'business'})),...(doc.architecture||[]).map(a=>({...a,kind:'architecture'}))].map(a=>{
  const m=map.mappings.find(m=>m.id===a.id&&m.kind===a.kind);
  const direct=new Set(m?.scope_method_ids||m?.method_ids||[]);
  const context=new Set(map.holons.filter(h=>(m?.holon_ids||[]).includes(h.id)).flatMap(h=>h.method_ids));
  if(a.kind==='architecture')for(const row of t.methods)if((a.anchors||[]).includes(t.services[row[3]][0]))context.add(row[0]);
  return {id:a.id,direct:[...reached].filter(id=>direct.has(id)),context:[...reached].filter(id=>context.has(id))};
 });
 return {origins,changeOrigins,potential,reached,paths,objectives,holons:t.native_holons.filter(h=>h[1].some(i=>paths.has(i))),unmapped:[...origins].filter(id=>!index.has(id))};
}
function objectiveTerritoriesMarkup(doc, selectedObjectiveId){
 const t=doc.territory,map=doc.holon_map;
 if(!t||!map)return '<p class="note">This evidence package does not include an objective terrain projection.</p>';
 const selectedArea=[...(doc.architecture||[]).map(a=>({...a,kind:'architecture'})),...(doc.business||[]).map(a=>({...a,kind:'business'}))].find(a=>a.id===selectedObjectiveId);
 const selectedMapping=selectedArea&&map.mappings.find(row=>row.id===selectedArea.id&&row.kind===selectedArea.kind);
 const directMethods=new Set(selectedMapping?.scope_method_ids||selectedMapping?.method_ids||[]);
 const contextHolons=new Set(selectedMapping?.holon_ids||[]);
 const contextMethods=new Set(map.holons.filter(h=>contextHolons.has(h.id)).flatMap(h=>h.method_ids));
 const terrainMethodIds=new Set(t.methods.map(row=>row[0]));
 const focusedDirect=new Set([...directMethods].filter(id=>terrainMethodIds.has(id)));
 const focusedContext=new Set([...contextMethods].filter(id=>terrainMethodIds.has(id)&&!focusedDirect.has(id)));
 const objectiveHasMapping=Boolean(selectedMapping&&(focusedDirect.size||focusedContext.size));
 const colors=['#d6336c','#7c4ddb','#0e9aa7','#ad6500','#2563eb'];
 const methods=new Map(map.methods.map(m=>[m.id,m]));
 const holons=new Map(map.holons.map(h=>[h.id,h]));
 const business=[...doc.business].sort((a,b)=>a.id.localeCompare(b.id));
 const territories=business.map((a,i)=>{
  const m=map.mappings.find(m=>m.id===a.id&&m.kind==='business');
  const contextIds=new Set((m?.holon_ids||[]).flatMap(id=>holons.get(id)?.method_ids||[]));
  const ids=new Set(m?.scope_method_ids||contextIds);
  return {area:a,mapping:m,ids,contextIds,color:colors[i%colors.length],changed:[...ids].map(id=>methods.get(id)).filter(m=>m?.changed)};
 });
 const violated=(doc.boundaries||[]).filter(a=>a.result.status==='violated');
 const blast=territoryBlastRadius(doc);
 const violationMethods=blast.origins;
 const updates=(doc.boundaries||[]).filter(a=>a.result.status==='baseline_update_proposed'||a.baseline_update_flow_ids?.length);
 const changed=new Set([...map.methods.filter(m=>m.changed).map(m=>m.id),...violationMethods,...blast.changeOrigins]);
 const servicePoints=t.services.map((s,i)=>t.methods.filter(m=>m[3]===i).map(m=>[m[4],m[5]]));
 const polygon=(p,attrs)=>p.length>2?`<polygon points="${territoryHull(p).map(p=>p.join(',')).join(' ')}" ${attrs}/>`:'';
 const architectureServices=new Set(doc.architecture.flatMap(a=>a.anchors||[]));
 const contours=servicePoints.map((points,i)=>polygon(points,`class="territory-service ${architectureServices.has(t.services[i][0])?'governed':''}"`)).join('');
 const washes=territories.map(o=>t.services.map((s,i)=>{
  const points=t.methods.filter(m=>m[3]===i&&o.contextIds.has(m[0])).map(m=>[m[4],m[5]]);
  return polygon(points,`fill="${o.color}" fill-opacity=".10" stroke="${o.color}" stroke-opacity=".5" stroke-width="1.5" stroke-linejoin="round"`);
 }).join('')).join('');
 const lines=[...blast.paths.entries()].filter(([i,p])=>p.next!==null).map(([i,p])=>{
  const x=t.methods[p.next],y=t.methods[i];
  return `<path class="territory-impact-call" d="M${x[4]},${x[5]} Q${(x[4]+y[4])/2},${Math.min(x[5],y[5])-16} ${y[4]},${y[5]}"/>`;
 }).join('');
 const dots=t.methods.map(m=>{
  const owners=territories.filter(o=>o.ids.has(m[0]));
  const fill=violationMethods.has(m[0])?'#cf222e':owners[0]?.color||'var(--territory-neutral)';
  const entry=territories.some(o=>o.mapping?.method_ids.includes(m[0]));
  const direct=focusedDirect.has(m[0]),context=!direct&&focusedContext.has(m[0]);
  return `<g data-terrain-method-id="${esc(m[0])}" opacity="${objectiveHasMapping&&!direct&&!context?'.14':'1'}"><title>${esc(m[2])}${direct?' · accepted objective scope method':context?' · member of a mapped intent area':''}${violationMethods.has(m[0])?' · reported violation':blast.potential.has(m[0])?' · potential impact through recorded callers':''}</title>${blast.potential.has(m[0])?`<circle cx="${m[4]}" cy="${m[5]}" r="5" class="territory-potential"/>`:''}${violationMethods.has(m[0])?`<circle cx="${m[4]}" cy="${m[5]}" r="7" class="territory-violation"/>`:changed.has(m[0])?`<circle cx="${m[4]}" cy="${m[5]}" r="7" class="territory-changed"/>`:''}${direct?`<circle cx="${m[4]}" cy="${m[5]}" r="8" fill="none" stroke="#f08c00" stroke-width="2.5"/>`:context?`<circle cx="${m[4]}" cy="${m[5]}" r="8" fill="none" stroke="#1971c2" stroke-width="2.5"/>`:''}<circle cx="${m[4]}" cy="${m[5]}" r="${owners.length?2.8:2}" fill="${fill}"/>${owners.slice(1).map((o,i)=>`<circle cx="${m[4]}" cy="${m[5]}" r="${4+i*1.5}" fill="none" stroke="${o.color}"/>`).join('')}${entry?`<circle cx="${m[4]}" cy="${m[5]}" r="5" class="territory-entry"/>`:''}</g>`;
 }).join('');
 const labels=servicePoints.map((p,i)=>{
  if(!p.length)return '';
  const x=p.reduce((s,p)=>s+p[0],0)/p.length,y=p.reduce((s,p)=>s+p[1],0)/p.length;
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="territory-service-label">${esc(t.services[i][1].replace(/^ftgo-/,''))}</text>`;
 }).join('');
 const changes=map.methods.filter(m=>changed.has(m.id)).sort((a,b)=>a.id.localeCompare(b.id));
 const focusSummary=selectedObjectiveId?'<div data-objective-focus data-objective-id="'+esc(selectedObjectiveId)+'" class="territory-objective-selection"><strong>'+esc(selectedArea?.statement||selectedObjectiveId)+'</strong>'+ (objectiveHasMapping?'<span>'+focusedDirect.size+' accepted scope methods · '+focusedContext.size+' methods in mapped intent areas</span><span><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#f08c00"></i> Orange: accepted scope · <i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#1971c2"></i> Blue: mapped region membership</span>':'<span class="note">No exact source or region mapping is recorded for this objective in this run.</span>')+'</div>':'';
 return `<div class="objective-terrain">${focusSummary}${violated.length?`<div class="territory-violation-banner"><b>${violated.length} intent finding(s) report violations</b><span>Red: ${violationMethods.size} mapped violation locations. Amber: ${blast.potential.size} potentially affected callers across ${blast.holons.length} intent areas.</span></div>`:''}${updates.length?`<div class="territory-baseline-banner"><b>${updates.length} intent changes need a baseline decision</b><span>${blast.changeOrigins.size} mapped change locations · ${blast.potential.size} potentially affected callers. These changes have no accepted objective obligation.</span></div>`:''}<div class="territory-map-summary"><strong>${t.methods.length.toLocaleString()} methods · ${t.native_holons.length} intent areas</strong><span>${t.calls.length.toLocaleString()} resolved calls</span></div><svg viewBox="0 0 720 570" class="territory-brain" role="img" aria-label="Objective territories generated from the baseline evidence. ${territories.length} business contracts mapped across the codebase; ${changes.length} methods have recorded intent changes."><title>Accepted objective territories with this PR’s recorded intent changes</title>${contours}${washes}${lines}${dots}${labels}</svg><div class="territory-legend">${territories.map(o=>`<span><i style="background:${o.color}"></i>${esc(o.area.statement)}</span>`).join('')}${violationMethods.size?'<span><i class="violation-key"></i>Objective violation</span>':''}${blast.potential.size?'<span><i class="potential-key"></i>Potential caller impact</span>':''}<span><i class="architecture-key"></i>Architecture boundary</span><span><i class="changed-key"></i>Intent changed in this PR</span><span><i class="neutral-key"></i>No mapped business objective supplied</span></div><div class="territory-impact-summary">${territories.map(o=>`<p><span style="color:${o.color}">●</span> <b>${o.changed.length?`${o.changed.length} intent change${o.changed.length===1?'':'s'}`:'No intent changes in this objective’s area'}</b> inside ${o.mapping?.holon_ids.length||0} mapped intent areas · ${o.ids.size} governed methods · ${o.contextIds.size} methods in related intent-area context.</p>`).join('')}${changes.length?`<p class="territory-changed-methods">Changed intent: ${changes.map(m=>esc(m.method.split('.').pop().replace('#','.').replace(/\/\d+$/,''))).join(' · ')}</p>`:''}</div><p class="note">Colored dots show accepted objective scope; shading shows related intent-area context. Red origins are exact accepted objective-to-method mappings. Impact follows resolved callers only; shared membership and territory overlap do not establish a violation.</p>${updates.length?`<details class="territory-rule-findings"><summary>Proposed baseline updates</summary>${updates.map(a=>`<p><b>${esc(a.statement)}</b><br>Decide whether this intent should remain ungoverned or be bound to an objective. The accepted baseline remains unchanged.</p>`).join('')}</details>`:''}${violated.length?`<details class="territory-rule-findings"><summary>${violated.length} rule findings</summary>${violated.map(a=>`<p><b>${esc(a.statement)}</b><br>${a.method_ids.length} mapped locations${a.unmapped_flow_ids?.length?` · ${a.unmapped_flow_ids.length} locations need an exact source mapping`:''}</p>`).join('')}</details>`:''}<details class="territory-provenance"><summary>Generated from the evidence package</summary><p>${esc(String(t.qualification||'').replace(/pinned CPG/g,'pinned code structure analysis').replace(/\bCFG\b/g,'control-flow').replace(/native intent membership/g,'intent-area membership'))}</p><p>Impact projection: dependent-callers-v1 · ${blast.unmapped.length} violation locations absent from the terrain. Control-flow and data-flow counts support local context; they are not used as cross-method impact edges.</p><p>Layout ${esc(t.layout_version)} · baseline ${esc(t.baseline_commit.slice(0,12))} · graph ${esc(t.graph_sha256.slice(0,16))}</p><p>${Object.entries(t.relation_counts).map(([k,v])=>`${esc(k)}: ${v.toLocaleString()}`).join(' · ')}</p></details></div>`;
}

function workflowTerritoryShape(points,attrs){
 const unique=[...new Map(points.map(point=>[point.join(','),point])).values()];
 if(unique.length===1)return `<circle cx="${unique[0][0]}" cy="${unique[0][1]}" r="10" ${attrs}/>`;
 if(unique.length===2)return `<line x1="${unique[0][0]}" y1="${unique[0][1]}" x2="${unique[1][0]}" y2="${unique[1][1]}" ${attrs}/>`;
 return `<polygon points="${territoryHull(unique).map(point=>point.join(',')).join(' ')}" ${attrs}/>`;
}

function terrainMethodSignature(row,fallback,argumentTypes=[]){
 if(Array.isArray(row?.[8]))return {raw:String(row?.[2]||'Unknown method'),name:String(row?.[2]||'Unknown method'),returnType:'',arguments:row[8].map(index=>argumentTypes[index]).filter(Boolean),argumentsKnown:row[8].every(index=>Boolean(argumentTypes[index]))};
 const raw=String(row?.[8]||fallback?.method||row?.[2]||'Unknown method');
 const signature=raw.includes('::')?raw.split('::').slice(1).join('::'):raw;
 const match=signature.match(/^(.*?)(?::([^()]+))?\((.*)\)$/);
 if(match)return {raw,name:match[1],returnType:match[2]||'',arguments:match[3]?match[3].split(/,(?![^<]*>)/).map(value=>value.trim()):[],argumentsKnown:true};
 const arity=signature.match(/^(.*)\/(\d+)$/);
 return {raw,name:arity?arity[1]:signature,returnType:'',arguments:[],argumentsKnown:Boolean(arity&&Number(arity[2])===0)};
}

function workflowTerritoryMarkup(doc,workflow,state){
 const t=doc.territory,map=doc.holon_map;
 if(!t||!map)return '<p class="note">This evidence package does not include the method terrain and holon membership needed for a workflow lens.</p>';
 const colors=['#2563eb','#7c4ddb','#0e9aa7','#ad6500','#d6336c','#16803c','#8250df','#bc4c00'];
 const methodIndex=new Map(t.methods.map((row,index)=>[row[0],index]));
 const nativeHolons=new Map(t.native_holons);
 const fullMembership=Boolean(state.terrainMembership);
 const obligations=workflow.obligations;
 const selected=obligations.find(row=>row.id===state.governedObligation)||obligations.find(row=>row.impact_status!=='unaffected')||obligations[0];
 state.governedObligation=selected?.id;
 const evidence=obligations.flatMap((obligation,index)=>obligation.evidence.map(row=>({...row,obligation,order:index+1,color:colors[index%colors.length]})));
 const mapped=evidence.filter(row=>(row.intent_region_ids||[]).some(id=>nativeHolons.has(id)));
 const unmapped=evidence.filter(row=>!(row.intent_region_ids||[]).some(id=>nativeHolons.has(id)));
 const evidenceByMethod=new Map();
 for(const row of evidence){if(!evidenceByMethod.has(row.method_id))evidenceByMethod.set(row.method_id,[]);evidenceByMethod.get(row.method_id).push(row);}
 const workflowHolonIds=[...new Set(mapped.flatMap(row=>(row.intent_region_ids||[]).filter(id=>nativeHolons.has(id))))];
 const holonRows=workflowHolonIds.map(id=>{
  const rows=mapped.filter(row=>row.intent_region_ids.includes(id));
  const indices=nativeHolons.get(id).filter(index=>t.methods[index]);
  const witnessIndices=[...new Set(rows.map(row=>methodIndex.get(row.method_id)).filter(index=>index!==undefined&&indices.includes(index)))];
  const obligationRows=[...new Map(rows.map(row=>[row.obligation.id,row])).values()];
  return {id,rows,indices,witnessIndices,obligationRows};
 }).filter(row=>row.witnessIndices.length);
 const servicePoints=t.services.map((service,index)=>t.methods.filter(row=>row[3]===index).map(row=>[row[4],row[5]]));
 const architectureServices=new Set((doc.architecture||[]).flatMap(row=>row.anchors||[]));
 const contours=servicePoints.map((points,index)=>points.length>2?`<polygon points="${territoryHull(points).map(point=>point.join(',')).join(' ')}" class="territory-service ${architectureServices.has(t.services[index][0])?'governed':''}"/>`:'').join('');
 const evidenceIndices=new Set([...evidenceByMethod.keys()].map(id=>methodIndex.get(id)).filter(index=>index!==undefined));
 const callKeys=new Set();
 const evidencedCalls=(t.calls||[]).filter(([caller,callee])=>evidenceIndices.has(caller)&&evidenceIndices.has(callee)).filter(([caller,callee])=>{const key=`${caller}:${callee}`;if(callKeys.has(key))return false;callKeys.add(key);return true;}).map(([caller,callee])=>{
  const from=t.methods[caller],to=t.methods[callee];
  return `<path d="M${from[4]},${from[5]} L${to[4]},${to[5]}" class="workflow-evidenced-call" marker-end="url(#workflow-call-arrow)"><title>Resolved call: ${esc(from[2])} → ${esc(to[2])}</title></path>`;
 }).join('');
 const hulls=holonRows.map(holon=>{
  const active=holon.obligationRows.some(row=>row.obligation.id===selected?.id);
  const color=holon.obligationRows[0]?.color||colors[0];
  const label=holon.obligationRows.map(row=>row.order).join(',');
  const displayIndices=fullMembership?holon.indices:holon.witnessIndices;
  const fragments=[...new Set(displayIndices.map(index=>t.methods[index][3]))].map(serviceIndex=>{
   const points=displayIndices.filter(index=>t.methods[index][3]===serviceIndex).map(index=>[t.methods[index][4],t.methods[index][5]]);
   const centroid=[points.reduce((sum,row)=>sum+row[0],0)/points.length,points.reduce((sum,row)=>sum+row[1],0)/points.length];
   return `${workflowTerritoryShape(points,`class="workflow-holon-hull" style="--workflow-color:${color}"`)}<text x="${centroid[0].toFixed(1)}" y="${(centroid[1]-12).toFixed(1)}" class="workflow-holon-label">H ${esc(holon.id.split(':').pop().slice(0,5))} · ${esc(label)}</text>`;
  }).join('');
  return `<g class="workflow-terrain-holon ${active?'selected':'muted'}" data-terrain-holon="${esc(holon.id)}" tabindex="0" role="button"><title>${esc(holon.id)} · obligations ${esc(label)} · ${holon.rows.length} candidate witnesses · ${fullMembership?'full optimizer membership':'witness methods only'}</title>${fragments}</g>`;
 }).join('');
 const priority={exact_fact_change:3,changed_witness_method:2,structural_context:1,unaffected:0};
 const strongest=rows=>rows.reduce((best,row)=>priority[row.classification]>priority[best]?row.classification:best,'unaffected');
 const dots=t.methods.map(row=>{
  const rows=evidenceByMethod.get(row[0])||[];
  if(!rows.length)return `<circle cx="${row[4]}" cy="${row[5]}" r="1.35" class="workflow-terrain-neutral"/>`;
  const impact=strongest(rows),accepted=rows.some(item=>item.obligation.governance.status==='accepted');
  const hasHolon=rows.some(item=>(item.intent_region_ids||[]).some(id=>nativeHolons.has(id)));
  const selectedWitness=rows.some(item=>item.obligation.id===selected?.id);
  return `<g class="workflow-terrain-method ${selectedWitness?'selected':'muted'}" data-terrain-method="${esc(row[0])}" tabindex="0" role="button"><title>${esc(row[2])} · ${rows.length} workflow candidate${rows.length===1?'':'s'} · ${esc(impact.replaceAll('_',' '))}${hasHolon?'':' · no native holon membership'}</title>${accepted?`<circle cx="${row[4]}" cy="${row[5]}" r="7" class="workflow-terrain-accepted"/>`:''}${hasHolon?`<circle cx="${row[4]}" cy="${row[5]}" r="${impact==='unaffected'?3.2:4.4}" class="workflow-terrain-dot ${esc(impact)}"/>`:`<rect x="${row[4]-4}" y="${row[5]-4}" width="8" height="8" class="workflow-terrain-dot unmapped ${esc(impact)}"/>`}</g>`;
 }).join('');
 const labels=servicePoints.map((points,index)=>{if(!points.length)return '';const x=points.reduce((sum,row)=>sum+row[0],0)/points.length,y=points.reduce((sum,row)=>sum+row[1],0)/points.length;return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="territory-service-label">${esc(t.services[index][1].replace(/^ftgo-/,''))}</text>`;}).join('');
 const chosenHolon=holonRows.find(row=>row.id===state.governedHolon);
 const defaultMethod=evidence.find(row=>row.classification!=='unaffected')?.method_id||evidence[0]?.method_id;
 const chosenMethod=state.governedMethod||(!chosenHolon?defaultMethod:null),methodEvidence=chosenMethod?(evidenceByMethod.get(chosenMethod)||[]):[];
 if(chosenMethod)state.governedMethod=chosenMethod;
 const inspector=methodEvidence.length?`<div class="workflow-terrain-inspector"><h4>Candidate witnesses at ${esc(t.methods[methodIndex.get(chosenMethod)]?.[2]||chosenMethod)}</h4>${methodEvidence.map(row=>`<section><header><span class="pill ${row.obligation.governance.status==='accepted'?'green':'amber'}">${esc(row.obligation.governance.status)}</span><span class="pill ${row.classification==='exact_fact_change'?'red':row.classification==='unaffected'?'':'amber'}">${esc(row.classification.replaceAll('_',' '))}</span></header><b>${esc(row.obligation.statement)}</b><div class="workflow-fact-delta"><span class="${row.replacement_parameters.length?'fact-before':''}">${row.replacement_parameters.length?'− ':''}${esc(workflowFactExpression(row.form,row.baseline_parameters))}</span>${row.replacement_parameters.map(value=>`<span class="fact-after">+ ${esc(workflowFactExpression(row.form,value))}</span>`).join('')}</div><small>${esc(row.candidate_id)} · ${esc(row.source.path)}:${esc(row.source.line||'—')}</small></section>`).join('')}</div>`:chosenHolon?`<div class="workflow-terrain-inspector"><h4>Native intent holon ${esc(chosenHolon.id)}</h4><p>${chosenHolon.rows.length} workflow candidate witnesses support ${chosenHolon.obligationRows.length} obligation${chosenHolon.obligationRows.length===1?'':'s'}: ${chosenHolon.obligationRows.map(row=>esc(row.obligation.statement)).join(' · ')}</p></div>`:'';
 const route=`<div class="workflow-obligation-route terrain-route">${obligations.map((row,index)=>`<button data-workflow-obligation="${esc(row.id)}" aria-pressed="${row.id===selected?.id}"><b>${index+1}</b><span>${esc(row.id.split('.').pop().replaceAll('_',' '))}</span><small>${esc(row.governance.status)} · ${esc(row.impact_status.replaceAll('_',' '))}</small></button>`).join('<i>→</i>')}</div>`;
 return `<div class="objective-terrain workflow-terrain"><div class="workflow-map-head"><div><span class="pill">customer workflow</span> <span class="pill ${workflow.governance_status==='accepted'?'green':'amber'}">governance ${esc(workflow.governance_status)}</span><h3>${esc(workflow.name)}</h3><p>${esc(workflow.customer_outcome)}</p></div><span class="pill ${workflow.impact_status==='direct_change'?'amber':''}">${esc(workflowImpactStatus(workflow).label)}</span></div>${route}<div class="territory-map-summary"><strong>${t.methods.length.toLocaleString()} methods · ${t.native_holons.length} native intent holons</strong><span>${workflowHolonIds.length} holons support this workflow · ${mapped.length}/${evidence.length} candidates mapped to them</span><button class="terrain-membership-toggle" data-terrain-membership aria-pressed="${fullMembership}">${fullMembership?'Show witness methods only':'Show full optimizer membership'}</button></div><svg viewBox="0 0 720 570" class="territory-brain workflow-terrain-brain" role="img" aria-label="${esc(workflow.name)} witnesses overlaid on native intent holons and service boundaries"><defs><marker id="workflow-call-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" class="workflow-call-arrow-head"/></marker></defs>${contours}${evidencedCalls}${hulls}${dots}${labels}</svg><div class="territory-legend"><span><i class="workflow-exact-key"></i>Exact candidate changed</span><span><i class="workflow-method-key"></i>Witness method changed</span><span><i class="workflow-context-key"></i>Structural context</span><span><i class="workflow-stable-key"></i>Stable workflow witness</span><span><i class="workflow-call-key"></i>Resolved call evidence (${callKeys.size})</span><span><i class="workflow-accepted-key"></i>Accepted contract</span><span><i class="workflow-unmapped-key"></i>No native holon membership</span></div>${inspector}<details class="workflow-unmapped"><summary>${unmapped.length} workflow candidate witnesses have no native holon membership</summary><p>These facts remain attached to source methods but are not placed into a native optimizer holon.</p>${unmapped.map(row=>`<p><b>${esc(row.obligation.id)}</b> · <code>${esc(workflowFactExpression(row.form,row.baseline_parameters))}</code><br><small>${esc(row.source.path)}:${esc(row.source.line||'—')} · ${esc(row.candidate_id)}</small></p>`).join('')}</details><p class="note">Colored shapes show service-local fragments of native holons that contain workflow witnesses. The numbered strip carries declared obligation order; the terrain draws arrows only for resolved calls in the evidence graph. Spatial distance and holon adjacency do not establish execution. A holon supports an obligation but does not by itself prove fulfillment.</p></div>`;
}

function governedMethodSourceMarkup(packet,method,direct){
 if(!direct)return '<p class="note">No direct source edit is established for this method; related context may be affected.</p>';
 if(!method?.file)return '<p class="note">Source location unavailable for this method.</p>';
 const owner=String(method.method||'').split('::').pop().replace(/#([^/]+)\/\d+$/,'.$1()');
 const impact=packet?.intent_impact;
 const concepts=impact?.baseline_commit===packet?.baseline_commit&&impact?.head_commit===packet?.head_commit?impact?.concepts||[]:[];
 const anchors=concepts.filter(c=>c.changed?.file===method.file&&owner.endsWith(c.changed?.method||'\0')&&Number.isInteger(c.changed.line)).map(c=>({line:c.changed.line,deleted:Boolean(c.changed.deleted)}));
 return `<section class="governed-method-source"><h4>Source changes</h4><p class="ii-ah"><b>File:</b> <code style="overflow-wrap:anywhere">${esc(method.file)}</code><br><b>Selected method:</b> <code style="overflow-wrap:anywhere">${esc(method.method||'Not recorded')}</code></p><p class="note">− removed · + added · line numbers: baseline / PR</p><div class="ii-code" data-governed-source-file="${esc(method.file)}" data-source-anchors="${esc(JSON.stringify(anchors))}"><p class="note">Loading source changes…</p></div></section>`;
}
function terrainFlowMethodOwner(method){
 const value=String(method||''),canonical=value.match(/(?:^|\.)([^.#]+)#([^/]+)\/\d+$/);
 return canonical?`${canonical[1]}.${canonical[2]}`:value.split('::').pop().split(':')[0];
}
function terrainSourceChanges(packet,terrain){
 const mapped=new Map(),unmapped=[];
 const rows=new Map((terrain.methods||[]).map(row=>[row[0],row]));
 for(const flow of packet?.flows||[]){
  if(!['source_changed','added','removed','governed_boundary_change'].includes(flow.change_kind))continue;
  if(flow.change_kind==='added'&&rows.has('candidate:'+flow.id)){
   mapped.set('candidate:'+flow.id,flow);continue;
  }
  const ids=new Set([...(flow.observed_deltas||[]).filter(d=>d.kind==='method_capsule').map(d=>d.unit_id),...(flow.potential_impact||[]).filter(d=>d.kind==='method_capsule').map(d=>d.id)]);
  let matches=[...ids].filter(id=>rows.has(id)&&terrain.files?.[rows.get(id)[1]]===flow.source?.file);
  if(!matches.length&&flow.method&&flow.source?.file){
   const owner=terrainFlowMethodOwner(flow.method);
   // The terrain carries a humanized "Class: method" label, not the FQN. Match a changed
   // boundary to its dot by normalizing both to lowercase alphanumerics within the same file
   // (e.g. Order#noteApproved -> "ordernoteapproved" == "Order: note approved").
   const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
   const parts=String(flow.method).split('#'),labelKey=parts.length===2?norm(parts[0].split('.').pop()+parts[1]):null;
   matches=(terrain.methods||[]).filter(row=>terrain.files?.[row[1]]===flow.source.file&&(owner===row[2]||owner.endsWith('.'+row[2])||(labelKey&&norm(row[2])===labelKey))).map(row=>row[0]);
  }
  if(matches.length===1)mapped.set(matches[0],flow);else unmapped.push(flow);
 }
 return {mapped,unmapped};
}
function candidateMethodTerrain(terrain,packet){
 if(!terrain)return terrain;
 const t={...terrain,methods:[...terrain.methods],files:[...(terrain.files||[])],services:[...terrain.services]};
 const additions=[...new Map((packet?.flows||[]).filter(f=>f.change_kind==='added'&&f.id&&f.method&&f.source?.file).map(f=>[f.source.file+'::'+f.method,f])).values()].sort((a,b)=>(a.source.file+'::'+a.method).localeCompare(b.source.file+'::'+b.method));
 for(const [index,flow] of additions.entries()){
  const id='candidate:'+flow.id;
  if(t.methods.some(row=>row[0]===id))continue;
  let file=t.files.indexOf(flow.source.file);if(file<0){file=t.files.length;t.files.push(flow.source.file);}
  // Keep baseline points and memberships untouched. Candidate dots occupy an outer ring.
  let service=t.services.findIndex(s=>s[0]==='candidate-unmapped');
  if(service<0){service=t.services.length;t.services.push(['candidate-unmapped','Added in this PR (not baseline-mapped)']);}
  const angle=2*Math.PI*index/Math.max(1,additions.length)-Math.PI/2;
  t.methods.push([id,file,flow.method,service,360+345*Math.cos(angle),285+268*Math.sin(angle),0,0]);
 }
 return t;
}
function workflowMethodImpactMarkup(doc,selected,workflows,state){
 const t=candidateMethodTerrain(doc.territory,doc.source_packet),map=doc.holon_map;
 if(!t||!map)return '<p class="note">This evidence package does not include the method terrain and holon mappings.</p>';
 const methods=new Map(map.methods.map(row=>[row.id,row]));
 const sourceChanges=terrainSourceChanges(doc.source_packet,t);
 for(const [id,flow] of sourceChanges.mapped)if(!methods.has(id))methods.set(id,{id,method:flow.method,file:flow.source.file});
 const servicePoints=t.services.map((service,index)=>t.methods.filter(row=>row[3]===index).map(row=>[row[4],row[5]]));
 const architectureServices=new Set((doc.architecture||[]).flatMap(row=>row.anchors||[]));
 const contours=servicePoints.map((points,index)=>points.length>2&&t.services[index][0]!=='candidate-unmapped'?`<polygon points="${territoryHull(points).map(point=>point.join(',')).join(' ')}" class="territory-service ${architectureServices.has(t.services[index][0])?'governed':''}"/>`:'').join('');
 const labels=servicePoints.map((points,index)=>{if(!points.length)return '';const x=points.reduce((sum,row)=>sum+row[0],0)/points.length,y=points.reduce((sum,row)=>sum+row[1],0)/points.length;return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="territory-service-label">${esc(t.services[index][1].replace(/^ftgo-/,''))}</text>`;}).join('');
 const evidenceRows=[];
 for(const workflow of workflows)for(const obligation of workflow.obligations)for(const evidence of obligation.evidence||[])evidenceRows.push({...evidence,workflow,obligation});
 const affected=evidenceRows.filter(row=>row.classification!=='unaffected');
 const allByMethod=new Map();
 for(const row of evidenceRows){if(!allByMethod.has(row.method_id))allByMethod.set(row.method_id,[]);allByMethod.get(row.method_id).push(row);}
 const byMethod=new Map();
 for(const row of affected){if(!byMethod.has(row.method_id))byMethod.set(row.method_id,[]);byMethod.get(row.method_id).push(row);}
 const priority={exact_fact_change:3,changed_witness_method:2,structural_context:1};
 const strongest=rows=>rows.reduce((best,row)=>priority[row.classification]>priority[best]?row.classification:best,'structural_context');
 const nativeHolons=(t.native_holons||[]).map(([id,indices])=>({id,indices:indices.filter(index=>t.methods[index])})).filter(row=>row.indices.length);
 const methodIndex=new Map(t.methods.map((row,index)=>[row[0],index]));
 const holonsByMethodIndex=new Map();
 for(const holon of nativeHolons)for(const index of holon.indices){if(!holonsByMethodIndex.has(index))holonsByMethodIndex.set(index,[]);holonsByMethodIndex.get(index).push(holon.id);}
 const groupedMethodIndices=new Set(nativeHolons.flatMap(row=>row.indices));
 const directMethodIds=new Set(affected.filter(row=>['exact_fact_change','changed_witness_method'].includes(row.classification)).map(row=>row.method_id));
 for(const id of sourceChanges.mapped.keys())directMethodIds.add(id);
 const allAffectedIds=new Set([...byMethod.keys(),...sourceChanges.mapped.keys()]);
 const holonRows=new Map(nativeHolons.map(holon=>[holon.id,affected.filter(row=>(row.intent_region_ids||[]).includes(holon.id))]));
 const holonEvidenceRows=new Map(nativeHolons.map(holon=>[holon.id,evidenceRows.filter(row=>(row.intent_region_ids||[]).includes(holon.id))]));
 const holonDescriptions=new Map(nativeHolons.map(holon=>{
  const workflowNames=[...new Set((holonEvidenceRows.get(holon.id)||[]).map(row=>row.workflow.name))].sort();
  const methodNames=[...new Set(holon.indices.map(index=>t.methods[index][2]))].sort();
  const serviceNames=[...new Set(holon.indices.map(index=>t.services[t.methods[index][3]]?.[1]).filter(Boolean).map(name=>name.replace(/^ftgo-/,'').replace(/-service$/,' service'))) ].sort();
  const workflowSummary=workflowNames.length?`${workflowNames.slice(0,2).join(' + ')}${workflowNames.length>2?` +${workflowNames.length-2} workflow${workflowNames.length===3?'':'s'}`:''}`:'';
  const serviceSummary=`${serviceNames.slice(0,2).join(' + ')}${serviceNames.length>2?` +${serviceNames.length-2}`:''}`;
  const representativeAction=String(methodNames[0]||'unknown action').split(/[.#]/).pop().replace(/\/\d+$/,'');
  return [holon.id,{label:`${workflowSummary||'Unbound flow'} · ${serviceSummary||'unmapped service'} · ${representativeAction}`,workflowNames,methodNames,serviceNames,representativeAction}];
 }));
 const selectedWorkflowMethods=new Set(selected.obligations.flatMap(row=>(row.evidence||[]).filter(item=>item.classification!=='unaffected').map(item=>item.method_id)));
 const methodDots=t.methods.map((row,index)=>{
  const rows=byMethod.get(row[0])||[],impact=sourceChanges.mapped.get(row[0])?.change_kind==='added'?'added':rows.some(item=>['exact_fact_change','changed_witness_method'].includes(item.classification))?strongest(rows):sourceChanges.mapped.has(row[0])?'source_changed':rows.length?strongest(rows):'stable',selectedMethod=state.governedMethod===row[0],workflowFocus=selectedWorkflowMethods.has(row[0]),directPr=directMethodIds.has(row[0])||sourceChanges.mapped.has(row[0]);
  const workflowNames=[...new Set(rows.map(item=>item.workflow.name))];
  const title=`${row[2]}${rows.length?' · '+impact.replaceAll('_',' ')+' · affected workflows: '+workflowNames.join(', '):' · no workflow-bound PR impact'}`;
  const signature=terrainMethodSignature(row,methods.get(row[0]),t.argument_types),memberships=holonsByMethodIndex.get(index)||[];
  return `<g class="workflow-impact-method ${esc(impact)}${directPr?' direct-pr-intersection':''} ${groupedMethodIndices.has(index)?'has-holon':'ungrouped'} ${selectedMethod?'selected':''} ${workflowFocus?'workflow-focus':''}" data-method-id="${esc(row[0])}" data-method-label="${esc(signature.name)}" data-holon-ids="${esc(memberships.join(' '))}" data-related-workflow-ids="${esc(workflowNames.map(name=>rows.find(item=>item.workflow.name===name)?.workflow.id).filter(Boolean).join(' '))}" data-related-workflow-names="${esc(workflowNames.join(' | '))}" data-governed-method="${esc(row[0])}" tabindex="0" role="button" aria-label="${esc(signature.name)}, ${memberships.length} flow holon membership${memberships.length===1?'':'s'}${directPr?', direct PR intersection':''}"><title>${esc(signature.name)} · ${memberships.length} flow holon membership${memberships.length===1?'':'s'}${directPr?' · direct PR intersection':''}${rows.length?' · '+title.split(' · ').slice(1).join(' · '):''}</title><circle class="workflow-method-hit" cx="${row[4]}" cy="${row[5]}" r="7"/>${directPr?`<circle class="workflow-pr-intersection-pulse" cx="${row[4]}" cy="${row[5]}" r="6.5"/>`:''}<circle class="workflow-method-dot" cx="${row[4]}" cy="${row[5]}" r="2"/></g>`;
 }).join('')+(t.methods.length>doc.territory.methods.length?`<text x="12" y="14" class="candidate-method-key">Teal outer ring: ${t.methods.length-doc.territory.methods.length} added methods · candidate only</text>`:'');
 const membershipRings=nativeHolons.map(holon=>{const description=holonDescriptions.get(holon.id);return `<g data-holon-description-id="${esc(holon.id)}" data-holon-label="${esc(description.label)}"><title>${esc(description.label)} · ${esc(holon.id)}</title>${holon.indices.map(index=>{const method=t.methods[index];return `<circle class="workflow-method-holon-ring" data-holon-membership="${esc(holon.id)}" data-member-method="${esc(method[0])}" cx="${method[4]}" cy="${method[5]}" r="4"/>`;}).join('')}</g>`;}).join('');
 const selectedWorkflowHolons=new Set(evidenceRows.filter(row=>row.workflow.id===selected.id).flatMap(row=>row.intent_region_ids||[]));
 const orderedHolons=[...nativeHolons].sort((left,right)=>{const a=holonDescriptions.get(left.id).label,b=holonDescriptions.get(right.id).label;return a<b?-1:a>b?1:left.id<right.id?-1:1;});
 const globalDirectCount=directMethodIds.size;
 const holonSummary=holon=>{const description=holonDescriptions.get(holon.id),affectedCount=holon.indices.filter(index=>allAffectedIds.has(t.methods[index][0])).length,directCount=holon.indices.filter(index=>directMethodIds.has(t.methods[index][0])).length,serviceCount=description.serviceNames.length,workflowBound=selectedWorkflowHolons.has(holon.id),methodCount=`${holon.indices.length} method${holon.indices.length===1?'':'s'}`,otherDirectCount=Math.max(0,globalDirectCount-directCount),intersectionSummary=`${directCount} of these ${holon.indices.length} holon method${holon.indices.length===1?'':'s'} directly intersect${directCount===1?'s':''} this PR; ${otherDirectCount} other PR method${otherDirectCount===1?'':'s'} remain${otherDirectCount===1?'s':''} shown globally`;return {holon,description,affectedCount,directCount,serviceCount,workflowBound,relationship:workflowBound?`${selected.name} → ${description.label} → ${methodCount} across ${serviceCount} service${serviceCount===1?'':'s'} → ${intersectionSummary}`:`${description.label} → ${methodCount} across ${serviceCount} service${serviceCount===1?'':'s'} → ${intersectionSummary}. No evidence from ${selected.name} is bound to this holon.`};};
 const holonSummaries=orderedHolons.map(holonSummary),prHolons=holonSummaries.filter(row=>row.directCount),workflowHolons=holonSummaries.filter(row=>!row.directCount&&row.workflowBound),otherHolons=holonSummaries.filter(row=>!row.directCount&&!row.workflowBound);
 const holonButton=row=>`<button class="${row.holon.id===state.governedHolon?'pinned':''}" aria-pressed="${row.holon.id===state.governedHolon}" data-holon-viewer-id="${esc(row.holon.id)}" data-holon-viewer-label="${esc(row.description.label)}" data-holon-relationship="${esc(row.relationship)}" data-holon-search-text="${esc(`${row.description.label} ${row.description.methodNames.join(' ')} ${row.holon.id}`.toLowerCase())}" data-holon-method-names="${encodeURIComponent(JSON.stringify(row.description.methodNames))}" data-governed-holon="${esc(row.holon.id)}" title="${esc(`${row.description.label} · ${row.description.methodNames.slice(0,3).join(' · ')} · ${row.holon.id}`)}"><b>${esc(row.description.label)}</b><small class="holon-search-match" data-holon-search-match hidden></small><span class="holon-row-badges"><small>${row.holon.indices.length} method${row.holon.indices.length===1?'':'s'}</small><small>${row.serviceCount} service${row.serviceCount===1?'':'s'}</small>${row.directCount?`<small class="direct">Contains ${row.directCount===globalDirectCount?'the same ':''}${row.directCount} global PR method${row.directCount===1?'':'s'}</small>`:''}${row.workflowBound?'<small class="workflow">Active workflow</small>':''}${row.affectedCount-row.directCount?`<small>${row.affectedCount-row.directCount} context</small>`:''}</span></button>`;
 const holonGroup=(label,rows,kind)=>`<section class="holon-viewer-group ${kind}" data-holon-group><h4>${esc(label)} <span>${rows.length}</span></h4>${rows.map(holonButton).join('')||'<p class="holon-group-empty">None</p>'}</section>`;
 const otherOpen=otherHolons.some(row=>row.holon.id===state.governedHolon);
 const holonCountLabel=`${nativeHolons.length} holon${nativeHolons.length===1?'':'s'}`;
 const holonViewer=`<dialog class="holon-viewer" data-holon-viewer-dialog aria-label="Flow holons in this governed-objectives map"><header title="Drag to move the holon viewer"><div><span class="eyebrow">Flow holons</span><h3>Holon viewer</h3></div><div class="holon-viewer-actions"><span>${nativeHolons.length} group${nativeHolons.length===1?'':'s'}${state.governedHolon?' · pinned':''}</span>${state.governedHolon?'<button type="button" data-governed-reset>Clear selection</button>':''}<button type="button" data-close-holon-viewer>Close</button></div></header><label class="holon-search"><span>Find a holon or method</span><input type="search" data-holon-search placeholder="Search ${holonCountLabel}"><small data-holon-search-status>${holonCountLabel}</small></label><div class="holon-viewer-layout"><div class="holon-viewer-detail" data-holon-viewer-detail>Hover or focus a relevant holon to see its relationship and methods.</div><div class="holon-viewer-list" role="list">${holonGroup('Intersects this PR',prHolons,'pr')}${holonGroup('Related to active workflow',workflowHolons,'workflow')}<details class="holon-viewer-other" data-holon-group ${otherOpen?'open':''}><summary>Other holons <span>${otherHolons.length}</span></summary>${otherHolons.map(holonButton).join('')}</details><p class="holon-no-results" data-holon-no-results hidden>No holons match this search.</p></div></div></dialog>`;
 const selectedHolonSummary=holonSummaries.find(row=>row.holon.id===state.governedHolon);
 const defaultRelationship=selectedHolonSummary?.relationship||`${selected.name} → ${selectedWorkflowHolons.size} related flow holon${selectedWorkflowHolons.size===1?'':'s'} → ${selectedWorkflowMethods.size} affected workflow method${selectedWorkflowMethods.size===1?'':'s'} → ${globalDirectCount} PR method${globalDirectCount===1?'':'s'} shown globally`;
 const selectedRows=state.governedMethod?(byMethod.get(state.governedMethod)||[]):[];
 const selectedEvidenceRows=state.governedMethod?(allByMethod.get(state.governedMethod)||[]):[];
 const selectedHolon=state.governedHolon?nativeHolons.find(row=>row.id===state.governedHolon):null;
 const selectedHolonRows=selectedHolon?(holonRows.get(selectedHolon.id)||[]):[];
 const selectedHolonEvidenceRows=selectedHolon?(holonEvidenceRows.get(selectedHolon.id)||[]):[];
 const selectedBindingRows=selectedHolon?selectedHolonEvidenceRows:selectedEvidenceRows;
 const selectedAffectedRows=selectedHolon?selectedHolonRows:selectedRows;
 const relatedWorkflows=[...new Map(selectedBindingRows.map(row=>[row.workflow.id,row.workflow])).values()];
 const selectedTerrainIndex=state.governedMethod?methodIndex.get(state.governedMethod):undefined;
 const selectedTerrainMethod=selectedTerrainIndex===undefined?null:t.methods[selectedTerrainIndex];
 const selectedMethod=state.governedMethod?(methods.get(state.governedMethod)||selectedTerrainMethod?.[2]):null;
 const selectedSignature=selectedTerrainMethod?terrainMethodSignature(selectedTerrainMethod,methods.get(state.governedMethod),t.argument_types):null;
 const selectedMemberships=selectedTerrainIndex===undefined?[]:(holonsByMethodIndex.get(selectedTerrainIndex)||[]);
 const selectedHolonDescription=selectedHolon?holonDescriptions.get(selectedHolon.id):null;
 const selectedMethodDirect=Boolean(state.governedMethod&&directMethodIds.has(state.governedMethod));
 const selectedMethodImpact=sourceChanges.mapped.get(state.governedMethod)?.change_kind==='added'?'Added in this PR — not accepted baseline content':sourceChanges.mapped.has(state.governedMethod)&&!selectedRows.some(row=>['exact_fact_change','changed_witness_method'].includes(row.classification))?'source_changed':selectedRows.length?strongest(selectedRows):'stable';
 const selectedFile=selectedTerrainMethod?(t.files?.[selectedTerrainMethod[1]]||methods.get(state.governedMethod)?.file||'Source file unavailable'):'';
 const relatedWorkflowMarkup=relatedWorkflows.length?relatedWorkflows.map(workflow=>{const rows=selectedBindingRows.filter(row=>row.workflow.id===workflow.id),changed=rows.some(row=>row.classification!=='unaffected');return `<button data-governed-area="${esc(workflow.id)}" class="${workflow.id===selected.id?'selected':''}"><span>${esc((doc.customer_workflows.workflow_sets||[]).find(set=>set.id===workflow.set_id)?.name||workflow.set_id)}</span><b>${esc(workflow.name)}</b><small>${rows.length} bound candidate${rows.length===1?'':'s'} · ${changed?'affected by this PR':'stable in this PR'}</small></button>`;}).join(''):'<p class="note">No baseline workflow evidence is bound here.</p>';
 const affectedMarkup=selectedAffectedRows.length?`<div class="holon-method-evidence">${selectedAffectedRows.map(row=>`<article><span class="pill ${row.classification==='exact_fact_change'?'red':'amber'}">${esc(row.classification.replaceAll('_',' '))}</span><b>${esc(row.workflow.name)} → ${esc(row.obligation.statement)}</b><div class="workflow-fact-delta"><span class="${row.replacement_parameters.length?'fact-before':''}">${row.replacement_parameters.length?'− ':''}${esc(workflowFactExpression(row.form,row.baseline_parameters))}</span>${row.replacement_parameters.map(value=>`<span class="fact-after">+ ${esc(workflowFactExpression(row.form,value))}</span>`).join('')}</div><small>${esc(row.source.path)}:${esc(row.source.line||'—')}</small></article>`).join('')}</div>`:'<p class="note">None of the bound workflow evidence is affected by this PR.</p>';
 const bindingSections=`<div class="holon-related-workflows"><h4>Supports these workflows</h4>${relatedWorkflowMarkup}</div><div class="holon-pr-impact"><h4>Affected by this PR</h4>${affectedMarkup}</div>`;
 const argumentMarkup=selectedSignature?.argumentsKnown?`<dt>Arguments</dt><dd>${selectedSignature.arguments.length?selectedSignature.arguments.map(value=>`<code>${esc(value)}</code>`).join(' '):'<span>None</span>'}</dd>`:'';
 const methodBindingMarkup=relatedWorkflows.length?`<div class="holon-related-workflows"><h4>Workflow-evidence binding</h4>${relatedWorkflowMarkup}</div>`:`<div class="holon-related-workflows"><h4>Workflow-evidence binding</h4><p class="note">None. This method remains visible because it ${selectedMethodDirect?'directly intersects this PR':'belongs to the selected structural context'}, not because accepted evidence binds it to ${esc(selected.name)}.</p></div>`;
 const methodPrMarkup=governedMethodSourceMarkup(doc.source_packet,methods.get(state.governedMethod),selectedMethodDirect)+(selectedAffectedRows.length?`<div class="holon-pr-impact"><h4>PR evidence</h4>${affectedMarkup}</div>`:'');
 const inspector=selectedTerrainMethod?`<section class="workflow-holon-inspector"><header><div><span class="eyebrow">${selectedMethodDirect?'Direct PR method':'Method'}</span><h3>${esc(selectedSignature.name)}</h3><p>${esc(selectedFile)}</p></div><button data-governed-reset>Close</button></header><div class="method-inspector-facts"><p><b>PR intersection</b><span>${selectedMethodDirect?esc(selectedMethodImpact.replaceAll('_',' ').replace('exact fact change','exact-fact change').replace('changed witness method','witness-method change')):'No direct intersection'}</span></p><p><b>Workflow lens</b><span>${esc(selected.name)}</span></p></div><dl class="terrain-method-signature">${argumentMarkup}${selectedSignature.returnType?`<dt>Returns</dt><dd><code>${esc(selectedSignature.returnType)}</code></dd>`:''}<dt>Holon memberships</dt><dd>${selectedMemberships.length?selectedMemberships.map(id=>`<button data-governed-holon="${esc(id)}" title="${esc(id)}">${esc(holonDescriptions.get(id)?.label||id)}</button>`).join(' '):'<span>Not assigned to a flow holon</span>'}</dd></dl>${methodBindingMarkup}${methodPrMarkup}</section>`:selectedHolon?`<section class="workflow-holon-inspector"><header><div><span class="eyebrow">Flow holon</span><h3>${esc(selectedHolonDescription.label)}</h3><code>${esc(selectedHolon.id)}</code></div><button data-governed-reset>Close</button></header><p>${selectedHolon.indices.length} member method${selectedHolon.indices.length===1?'':'s'} · ${selectedHolonEvidenceRows.length} bound workflow candidate${selectedHolonEvidenceRows.length===1?'':'s'}.</p>${bindingSections}<details class="holon-member-methods"><summary>All ${selectedHolonDescription.methodNames.length} member method${selectedHolonDescription.methodNames.length===1?'':'s'}</summary>${selectedHolonDescription.methodNames.map(name=>`<code>${esc(name)}</code>`).join('')}</details></section>`:'<p class="workflow-impact-prompt">Every dot is a clickable method in the original deterministic service terrain. Highlighted methods contain workflow-bound evidence affected by this PR.</p>';
 const obligations=selected.obligations.map((row,index)=>`<article class="selected-workflow-obligation ${esc(row.impact_status)}"><b>${index+1}</b><div><span>${esc(row.id.split('.').pop().replaceAll('_',' '))}</span><small>${esc(row.statement)}</small></div><span class="pill ${row.impact_status==='direct_change'?'amber':row.impact_status==='context_only'?'':'green'}">${esc(workflowImpactStatus(row).label)}</span></article>`).join('');
 return `<div class="workflow-holon-terrain workflow-method-terrain" data-method-terrain data-pinned-method="${esc(state.governedMethod||'')}" data-pinned-holon="${esc(state.governedHolon||'')}" data-default-relationship="${esc(defaultRelationship)}"><section class="selected-workflow-summary"><header><div><span class="pill">${esc(selected.actor)} workflow</span><h3>${esc(selected.name)}</h3><p>${esc(workflowOutcome(selected))}</p></div><span class="pill workflow-pr-status ${selected.impact_status==='direct_change'?'red':selected.impact_status==='unaffected'?'green':'amber'}">${esc(workflowImpactStatus(selected).label)}</span></header><details><summary>${selected.obligations.length} workflow obligations</summary><div class="selected-workflow-obligations">${obligations}</div></details></section>${state.workflowTransition?`<p class="workflow-selection-transition" role="status">${esc(state.workflowTransition)}</p>`:''}<div class="territory-map-summary"><strong>${t.methods.length.toLocaleString()} methods</strong><span>${nativeHolons.length} flow holons · ${groupedMethodIndices.size} grouped methods · ${t.methods.length-groupedMethodIndices.size} ungrouped · ${allAffectedIds.size} affected · ${directMethodIds.size} directly changed</span></div><div class="holon-relationship" data-holon-relationship>${esc(defaultRelationship)}</div><div class="holon-viewer-launch-row"><button data-open-holon-viewer>Open holon viewer <span>${nativeHolons.length}</span></button><small>Search, preview, and pin holons without resizing the method map.</small></div><div class="holon-map-viewer"><div class="holon-map-canvas"><div class="method-holon-hover-status" data-holon-hover-status>Hover a method to inspect its holon memberships; click to open its source changes.</div><svg viewBox="0 0 720 570" class="territory-brain workflow-holon-brain" role="img" aria-label="Methods grouped by service; the holon viewer highlights member methods while direct PR intersections remain visible and pulse">${contours}${methodDots}<g class="workflow-method-holon-rings">${membershipRings}</g>${labels}</svg><div class="territory-legend compact" aria-label="Map legend"><span><i class="workflow-holon-stable-key"></i>Baseline method</span><span><i class="workflow-context-key"></i>Structural context</span><span><i class="workflow-focus-key"></i>Active workflow</span><span><i class="workflow-membership-key"></i>Selected holon</span><span><i class="workflow-source-key"></i>Source method changed</span><span><i class="workflow-exact-key"></i>Exact-fact PR change</span><span><i class="workflow-method-key"></i>Witness-method PR change</span><span><i class="architecture-key"></i>Service boundary</span></div><p class="holon-map-help">Position groups methods by service, not execution order. Holon membership does not prove runtime interaction.</p></div>${holonViewer}</div>${sourceChanges.unmapped.length?`<p class="note">${sourceChanges.unmapped.length} source-changed methods are not mapped onto this baseline terrain.</p>`:''}${inspector}</div>`;
}
