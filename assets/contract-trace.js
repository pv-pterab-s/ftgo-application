/* Cross-service contract for one finding: which published event fields this change alters, the
   unchanged consumers that receive them, and the accepted obligations those consumers carry. A traced
   route is source evidence (exact Java shapes only), not proof of runtime delivery or compatibility. */
(function(root){
'use strict';
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const helpers=()=>root.codeIntentRunDetails||(typeof require==='function'?require('./run-details.js'):null);
const ownerName=value=>helpers().ownerName(value);
const serviceOf=path=>{const top=String(path||'').split('/')[0]||'';return /-service$/.test(top)?top.replace(/^ftgo-/,'').replace(/-service$/,' service'):top?`shared code (${top})`:'';};
const fieldName=row=>`${String(row.event_type||'event').split('.').pop()}.${row.event_field||'?'}`;
const routeKey=row=>`${row.event_type}|${row.event_field}|${row.handler_owner}`;

// Pair each baseline route with its PR counterpart: same event field and handler means the value changed.
function contractRoutes(item,packet){
 const flows=helpers().itemFlows(item,packet).filter(flow=>flow.cross_service_trace);
 const byKey=new Map();
 const take=(row,state)=>{const key=routeKey(row),entry=byKey.get(key)||{key,route:row,states:new Set()};entry.states.add(state);if(state==='added'&&!entry.route.consumers)entry.route=row;byKey.set(key,entry);};
 for(const flow of flows){
  const trace=flow.cross_service_trace;
  for(const row of trace.removed||[])take(row,'removed');
  for(const row of trace.added||[])take(row,'added');
  for(const row of trace.retained||[])take(row,'retained');
 }
 return [...byKey.values()].map(entry=>{
  const s=entry.states,status=s.has('removed')&&s.has('added')?'changed':s.has('added')?'new':s.has('removed')?'removed':'unchanged';
  return {...entry.route,status};
 }).sort((a,b)=>['changed','new','removed','unchanged'].indexOf(a.status)-['changed','new','removed','unchanged'].indexOf(b.status)||fieldName(a).localeCompare(fieldName(b)));
}

function blob(repo,commit,path,line){
 const parts=String(repo||'').split('/');
 if(parts.length!==2||!/^[0-9a-f]{40}$/.test(commit||'')||!path)return '';
 return `https://github.com/${parts.map(encodeURIComponent).join('/')}/blob/${commit}/${String(path).split('/').map(encodeURIComponent).join('/')}${line?'#L'+line:''}`;
}
const link=(url,text)=>url?`<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`:escapeHtml(text);

const STATUS_TEXT={
 changed:'The value this PR publishes in this field is different from the baseline.',
 new:'This PR publishes a value on a route the baseline did not have.',
 removed:'This PR no longer publishes the traced value on this route.',
 unchanged:'The traced value reaching the consumer is the same as the baseline.',
};

function consumerChain(route){
 return [...new Set((route.consumers||[]).filter(pin=>!/#domainEventHandlers\//.test(pin.owner)).map(pin=>ownerName(pin.owner)))];
}
// Unchanged routes are context: one line each with where the value goes and what governs it.
function unchangedMarkup(route,packet,repo){
 const base=packet?.baseline_commit,consumers=route.consumers||[],chain=consumerChain(route);
 const target=consumers.find(pin=>ownerName(pin.owner)===chain[0])||{};
 const obligations=(route.obligations||[]).map(row=>row.obligation_id);
 return `<li class="contract-route unchanged compact"><code>${escapeHtml(fieldName(route))}</code><span class="contract-state">unchanged</span><span>→ ${link(blob(repo,base,target.path,target.line),chain[0]||ownerName(route.handler_owner))}${target.path?` <small>${escapeHtml(serviceOf(target.path))}</small>`:''}${obligations.length?` · governed by <b>${escapeHtml(obligations.join(', '))}</b>`:''}</span></li>`;
}

function routeMarkup(route,packet,repo,head){
 if(route.status==='unchanged')return unchangedMarkup(route,packet,repo);
 const base=packet?.baseline_commit;
 const producer=route.producer||{};
 const consumers=route.consumers||[];
 const handler=consumers.find(pin=>pin.owner===route.handler_owner)||consumers.find(pin=>/handle|consume|on[A-Z]/.test(pin.owner))||consumers[0]||{};
 const last=consumers[consumers.length-1]||handler;
 const service=serviceOf(handler.path||last.path);
 const consumerChanged=(route.obligations||[]).some(row=>row.consumer_changed);
 const chain=consumerChain(route);
 const obligations=(route.obligations||[]).map(row=>`<li><span><b>${escapeHtml(row.obligation_id)}</b>${row.workflow_name?` <small>${escapeHtml(row.workflow_name)}</small>`:''}</span><span>${escapeHtml(row.statement)}</span><small>Witness ${link(blob(repo,base,row.witness_path,null),ownerName(row.witness_owner))}${row.consumer_changed?' · changed in this PR':' · unchanged in this PR'}</small></li>`).join('');
 const ask=consumerChanged?'The consumer also changed in this PR; check both sides together.':
  `${chain.length?ownerName(route.handler_owner):'The consumer'} is unchanged in this PR, so it will receive the ${route.status==='removed'?'route change':'new value'} as is. Confirm it handles it.`;
 return `<li class="contract-route ${escapeHtml(route.status)}">
  <div class="contract-head"><code>${escapeHtml(fieldName(route))}</code><span class="contract-state">${escapeHtml(route.status)}</span></div>
  <p>${escapeHtml(STATUS_TEXT[route.status])}</p>
  <dl><dt>Published by</dt><dd>${link(blob(repo,route.status==='removed'?base:head,producer.path,route.status==='removed'?producer.line:null),ownerName(route.producer_owner||producer.owner))}${producer.path?` <small>${escapeHtml(serviceOf(producer.path))}</small>`:''}${route.status!=='new'&&producer.path?` · ${link(blob(repo,base,producer.path,producer.line),'baseline')}`:''}</dd>
  <dt>Received by</dt><dd>${chain.length?chain.map((name,index)=>{const pin=consumers.find(row=>ownerName(row.owner)===name)||{};return link(blob(repo,base,pin.path,pin.line),name)+(index<chain.length-1?' → ':'');}).join(''):escapeHtml(ownerName(route.handler_owner))}${service?` <small>${escapeHtml(service)}</small>`:''}</dd></dl>
  ${obligations?`<div class="contract-obligations"><small>ACCEPTED OBLIGATION ON THIS CONSUMER</small><ul>${obligations}</ul></div>`:''}
  ${ask?`<p class="contract-ask">${escapeHtml(ask)}</p>`:''}
 </li>`;
}

function contractMarkup(item,packet,repo,head){
 const routes=contractRoutes(item,packet);
 if(!routes.length)return '';
 const altered=routes.filter(route=>route.status!=='unchanged');
 const summary=altered.length?`This change alters ${altered.length} published event value${altered.length===1?'':'s'} that ${altered.length===1?'reaches':'reach'} another service.`:
  'This change touches code on traced event routes, but every traced value reaching the consumers is the same as the baseline. The trace covers these event values only, not other behavior in the changed code.';
 return `<section class="contract-trace" aria-label="Cross-service contract"><h4>Cross-service contract</h4><p class="contract-summary">${escapeHtml(summary)}</p><ul>${routes.map(route=>routeMarkup(route,packet,repo,head)).join('')}</ul><p class="contract-note">Traced from source: the published value's expression and its path to the consumer's handler. Exact Java event shapes only; broker delivery, serialization and HTTP or saga calls are not traced. A route is evidence to check, not proof of compatibility.</p></section>`;
}

const api={contractRoutes,contractMarkup};
root.codeIntentContractTrace=api;
if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
