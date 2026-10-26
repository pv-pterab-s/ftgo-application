/* Advisory fallback tiles for saved previews and live run status. */
(function(root){
'use strict';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Plain wording for gap codes that stop deterministic analysis; unknown codes are shown as written.
const GAP_TEXT={changed_unresolved_return_construction:'the changed return value could not be resolved to known facts'};
const shortOwner=owner=>String(owner||'').split('.').pop().replace('#','.').replace(/\/\d+$/,'');
// Name each check that could not finish, with its recorded detail and any gaps behind it.
function failureRows(packet,checks){
 const byId=new Map((checks||[]).map(check=>[check.id,check]));
 const gaps=(checks||[]).flatMap(check=>(check.judgments||[]).filter(row=>row.verdict==='gap'));
 return (packet.failures||[]).map(failure=>{
  const check=byId.get(failure.stage);
  const detail=check?.detail?` ${esc(check.detail)}.`:'';
  const causes=failure.stage==='connected_evidence'?gaps.map(row=>{const owner=shortOwner(row.source_model_coverage?.owner);return `<li>${esc(GAP_TEXT[row.reason]||row.reason)}${owner?` in <code>${esc(owner)}</code>`:''}</li>`;}).join(''):'';
  return `<li><b>${esc(check?.label||failure.stage)}</b> did not finish.${detail}${causes?`<ul>${causes}</ul>`:''}</li>`;
 }).join('');
}
// A run that needed this review is incomplete, and an incomplete run does not go in.
const BLOCKED='Not going in: this PR is blocked in this state.';
function blockedNotice(){
 return `<div class="fallback-blocked" role="status"><b>${BLOCKED}</b><p>Deterministic verification did not finish. A nondeterministic analysis cannot approve a PR, and answering its findings does not unblock it. The PR can go in only after a run whose deterministic checks finish.</p></div>`;
}
function render(packet,checks){
 if(packet?.schema!=='llm-error-review-v1')throw new Error('Unsupported fallback artifact');
 const evidence=new Map((packet.evidence||[]).map(row=>[row.id,row]));
 const label='Nondeterministic analysis · model output, not verified against the code';
 const tiles=(packet.issues||[]).map(item=>`<article class="tile"><div class="tile-top"><h3>Potential issue: ${esc(item.title)}</h3></div>
 <div class="tile-sub"><b>${label}</b></div>
 <div class="ba"><div><small>BEFORE · LLM INTERPRETATION</small>${esc(item.before)}</div><div class="after"><small>WITH THIS PR · LLM INTERPRETATION</small>${esc(item.after)}</div></div>
 <div class="summary"><small>${label}</small><p>${esc(item.explanation)}</p></div>
 <div class="rule"><small>UNCERTAINTY</small><p>${esc(item.uncertainty)}</p></div>
 <section class="compact-evidence"><h4>Recorded evidence</h4>${item.evidence_ids.map(id=>{const row=evidence.get(id);return row?`<details><summary>${esc(id)} · ${esc(row.kind)} · ${esc(row.quality)}</summary><pre>${esc(row.content)}</pre></details>`:`<p>${esc(id)} · partial source diff</p>`;}).join('')}</section>
 </article>`).join('');
 const failures=failureRows(packet,checks);
 return `${blockedNotice()}<h3 class="fallback-heading">Nondeterministic analysis</h3><p>Deterministic analysis could not finish, so a model reviewed the PR diff. Its potential issues are advisory: they cannot approve the PR or satisfy a failed deterministic check.</p>${failures?`<p><b>Why this ran</b></p><ul class="fallback-failures">${failures}</ul>`:''}
 <p>${esc(packet.identity?.repository||'')} · <code>${esc(packet.identity?.head_commit||'')}</code></p>
 <p>Diagnostic reference: <code>${esc(packet.diagnostic_id)}</code></p>
 <p>${esc(packet.evidence_scope||'Partial source evidence; complete PR coverage is not established.')}</p>
 ${packet.coverage?`<p class="fallback-coverage">${packet.coverage.complete_pr_diff?'Complete PR diff':'Supplied diff'}: ${esc(packet.coverage.input_files)} changed files · ${esc(packet.coverage.submitted_bytes)} bytes submitted · ${packet.status==='completed'?'analysis completed':'analysis did not complete'}.</p>`:''}
 ${tiles||`<p>${packet.status!=='completed'?esc(packet.reason||'Fallback analysis is unavailable.'):'No potential issues were returned. This does not establish that the PR is safe.'}</p>`}`;
}
root.llmErrorReview={render,BLOCKED};
if(typeof module!=='undefined')module.exports=root.llmErrorReview;
})(typeof window!=='undefined'?window:globalThis);
