/* Deterministic presentation of original generated intent; no model calls. */
(function(root){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function compactMarkup(item,packet){
 const data=packet.compact_intent;
 if(!data||data.repository!==packet.repository||data.baseline_commit!==packet.baseline_commit||data.head_commit!==packet.head_commit)return '';
 const summary=packet.objective_summary?.intent_semantics?.explanations?.find(r=>r.change_id===item.id),ids=new Set(summary?.member_change_ids||item.flowIds||[]);
 const flows=(packet.flows||[]).filter(f=>ids.has(f.id)||f.id===item.id);
 const keys=[...new Set([...flows.flatMap(f=>[f.boundary_id,f.method]),item.methodRef].filter(k=>data.methods?.[k]))];
 if(!keys.length)return '';
 const bodies=keys.map(key=>{
  const pair=data.methods[key],operation=pair.after||pair.before;
  if(!operation)return '';
  const slots=[...(pair.after?.slots||[]).filter(s=>s.change!=='unchanged'),...(pair.before?.slots||[]).filter(s=>s.change==='removed')];
  return `<div class="compact-operation"><code class="compact-signature">${esc(operation.operation.display)}</code><dl>${slots.map(slot=>`<div class="compact-slot ${esc(slot.change||'')}"><dt>${esc(slot.label)}</dt><dd>${slot.condition?`<span class="compact-condition">[${esc(slot.condition)}]</span> `:''}${esc(slot.value)}</dd></div>`).join('')||'<div class="compact-slot"><dd>No operation changes recorded.</dd></div>'}</dl></div>`;
 }).join('');
 return `<section class="deterministic-intent compact-intent" aria-label="Deterministic parametric intent"><header><h4>Intent changes</h4><span>Deterministic</span></header>${bodies}</section>`;
}
function markup(item,packet){
 if(packet.compact_intent)return compactMarkup(item,packet);
 const data=packet.intent_diff;if(!data)return '';
 if(data.repository!==packet.repository||data.baseline_commit!==packet.baseline_commit||data.head_commit!==packet.head_commit)return '';
 const summary=packet.objective_summary?.intent_semantics?.explanations?.find(r=>r.change_id===item.id),ids=new Set(summary?.member_change_ids||item.flowIds||[]);
 const flows=(packet.flows||[]).filter(f=>ids.has(f.id)||f.id===item.id);
 const keys=[...new Set([...flows.flatMap(f=>[f.boundary_id,f.method]),item.methodRef].filter(k=>data.comparisons?.[k]))];
 if(!keys.length)return '';
 const sections=keys.map(key=>{
  const comparison=data.comparisons[key],head=data.head?.methods?.[key]?.symbolic?.rows||[];
  const changes=new Map(comparison.rows.filter(e=>e.side==='head').map(e=>[e.row.id,e.change]));
  const entries=head.map(row=>({row,change:changes.get(row.id)||'not_compared'}));
  entries.push(...comparison.rows.filter(e=>e.change==='removed'));
  const rowMarkup=entry=>`<div class="intent-symbol-row ${esc(entry.change)}"><span class="intent-change-mark" aria-label="${esc(entry.change)}">${entry.change==='added'?'+':entry.change==='removed'?'−':''}</span><span class="intent-kind">${esc(entry.row.label)}</span><code title="${esc(entry.row.original?.text||'')}">${esc(entry.row.symbol)}</code></div>`;
  const phases=[['given','Given','Recorded conditions; each outcome retains its own guard.'],['when','When',''],['then','Then','']];
  const groups=phases.map(([phase,label,note])=>{
   const rows=entries.filter(e=>e.row.phase===phase);if(!rows.length)return '';
   return `<section class="intent-phase"><header><b>${label}</b>${note?`<small>${esc(note)}</small>`:''}</header>${rows.slice(0,24).map(rowMarkup).join('')}${rows.length>24?`<p>${rows.length-24} more steps are outside this display.</p>`:''}</section>`;
  }).join('');
  return `<div class="intent-method">${groups}</div>`;
 }).join('');
 return `<section class="deterministic-intent" aria-label="Deterministic intent changes"><header><h4>Intent changes</h4><span>Deterministic</span></header>${sections}<small>Selected-method scope; calls outside the supplied source may be unresolved.</small></section>`;
}
root.codeIntentSymbolicDiff={markup};if(typeof module!=='undefined')module.exports=root.codeIntentSymbolicDiff;
})(typeof window!=='undefined'?window:globalThis);
