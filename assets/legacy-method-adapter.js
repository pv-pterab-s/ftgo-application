/* Bridge the original service terrain and provenance explorer into the live review. */
(function(root){
'use strict';
let activeState={},activePacket=null,rerender=()=>{};
root.esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
root.reviewState=()=>activeState;
root.render=()=>rerender();
function patch(file){let selected=false;return String(activePacket?.source_diff?.content||'').split('\n').filter(line=>{if(line.startsWith('diff --git '))selected=line===`diff --git a/${file} b/${file}`;return selected;}).join('\n');}
function markup(packet,state,item={}){
 activeState=state;activePacket=packet;
 const workflows=packet?.explorer?.workflows?.workflows||[],map=packet?.explorer?.governance?.holon_map,terrain=packet?.explorer?.terrain;
 if(!terrain||!map||!workflows.length)return '<p>The original method explorer needs the recorded terrain, method mappings, and workflow artifacts.</p>';
 const explanation=packet.objective_summary?.intent_semantics?.explanations?.find(row=>row.change_id===item.id),linkedIds=new Set((explanation?.graph_path||[]).map(row=>row.workflow_id));
 const selected=workflows.find(w=>linkedIds.has(w.id))||workflows.find(w=>w.id===state.governedArea)||workflows.find(w=>w.impact_status==='direct_change')||workflows[0];state.governedArea=selected.id;
 const doc={...packet.governed_objectives,compact_review:true,review_item:item,territory:terrain,holon_map:map,customer_workflows:packet.explorer.workflows,source_packet:packet};
 return `<section class="legacy-method-explorer" data-review-scope="restored-methods">${workflowMethodImpactMarkup(doc,selected,workflows,state)}</section>`;
}
function hydrate(){
 const board=document.querySelector('.legacy-method-explorer');if(!board)return;
 for(const element of board.querySelectorAll('[data-governed-source-file]')){
  const text=patch(element.dataset.governedSourceFile);const pre=document.createElement('pre');pre.textContent=text||'No changed-file patch was recorded for this baseline source.';element.replaceChildren(pre);
 }

}
root.legacyMethodExplorer={markup,hydrate,setRender(fn){rerender=fn;}};
})(window);
