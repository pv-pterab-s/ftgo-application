/* Impact of one finding: the changed method, its callers in the baseline call graph, and which of
   them this PR demonstrably changes. Callers are potentially affected, not shown to break. */
(function(root){
'use strict';
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const serviceName=value=>String(value||'unmapped').replace(/^ftgo-/,'').replace(/-service$/,' service');
const isTest=file=>/\/src\/(?:test|integration-test|component-test|[\w-]*-test)\//.test(file||'');
// Code outside a deployable service (such as ftgo-common) is shared by the services that call it.
const placeName=row=>row.service&&row.service!=='Other source'?serviceName(row.service):`shared code (${String(row.file||'').split('/')[0]||'unplaced'})`;
const MAX_DEPTH=3,MAX_CALLERS=40;

// "pkg.Class#method/2" or "Class.method(...)" -> "Class.method", the terrain's method label.
function ownerName(value){
 const text=String(value||''),canonical=text.match(/(?:^|\.)([^.#]+)#([^/(]+)/);
 if(canonical)return `${canonical[1]}.${canonical[2]}`;
 return text.split('::').pop().replace(/\(.*$/,'').split('.').slice(-2).join('.');
}
// Parameter count of a recorded method ("C#work/1", "C.work(String)"), or null when it isn't recorded.
const parameterCount=text=>{const value=String(text).trim();return value?value.split(/,(?![^<]*>)/).length:0;};
function refArity(value){
 const text=String(value||''),slash=text.match(/\/(\d+)$/);
 if(slash)return Number(slash[1]);
 const params=text.match(/\(([^()]*)\)\s*$/);
 return params?parameterCount(params[1]):null;
}
// Keep unsupported signatures uncertain rather than guessing their overload.
function parameterTypes(text,declaration=false){
 if(!String(text).trim())return [];
 return String(text).split(/,(?![^<]*>)/).map(value=>{
  let type=value.trim();
  if(declaration)type=type.replace(/^final\s+/,'').replace(/\s+[A-Za-z_$][\w$]*$/,'');
  type=type.replace(/\.\.\.$/,'[]').replace(/\s+/g,'');
  return /^(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*(?:\[\])*$/.test(type)?type:null;
 });
}
function refTypes(value){
 const params=String(value||'').match(/\(([^()]*)\)\s*$/);
 return params?parameterTypes(params[1]):null;
}
function sameType(left,right){
 if(typeof left!=='string'||typeof right!=='string')return null;
 if(left===right)return true;
 // Java's implicit java.lang names may be shortened in recorded signatures.
 if(left.replace(/^java\.lang\./,'')===right.replace(/^java\.lang\./,''))return true;
 if(left.split('.').pop()!==right.split('.').pop())return false;
 return left.includes('.')&&right.includes('.')?false:null;
}
const rowArity=row=>Array.isArray(row[8])?row[8].length:0;
// The terrain row for one recorded method. An exact holon-map identity wins. Otherwise the file, name,
// parameter count and parameter types must all agree with one method. Without comparable types a name
// match is not proof (the PR may have added an overload beside a baseline sibling), so it resolves to
// nothing rather than show another overload's callers.
function resolveMethod(terrain,map,file,name,arity,exactRef,types=null){
 const index=new Map(terrain.methods.map((row,i)=>[row[0],i]));
 const exact=exactRef?(map?.methods||[]).filter(row=>row.method===exactRef&&index.has(row.id)).map(row=>index.get(row.id)):[];
 if(exact.length===1)return {rows:exact};
 let candidates=terrain.methods.map((row,i)=>[row,i]).filter(([row])=>(!file||terrain.files?.[row[1]]===file)&&
  (row[2]===name||name.endsWith('.'+row[2])||row[2].endsWith('.'+name)));
 if(arity!==null)candidates=candidates.filter(([row])=>rowArity(row)===arity);
 // No parameters is complete type evidence.
 if(types===null&&arity===0)types=[];
 if(types===null)return candidates.length?{rows:[],ambiguous:true}:{rows:[]};
 const compared=candidates.map(candidate=>{
  const row=candidate[0],recorded=(row[8]||[]).map(id=>terrain.argument_types?.[id]);
  return {candidate,matches:types.map((type,i)=>sameType(type,recorded[i]))};
 }).filter(({matches})=>!matches.includes(false));
 if(compared.some(({matches})=>matches.includes(null)))return {rows:[],ambiguous:true};
 candidates=compared.map(({candidate})=>candidate);
 if(candidates.length>1)return {rows:[],ambiguous:true};
 return {rows:candidates.map(([,i])=>i)};
}
function terrainRows(terrain,map,file,method){
 return method?resolveMethod(terrain,map,file,ownerName(method),refArity(method),method,refTypes(method)):{rows:[]};
}
// When a finding records only its file, find the method whose body holds a changed line that
// matches one of the finding's recorded fact expressions: the nearest declaration above it.
const compact=value=>String(value||'').replace(/[\s"']/g,'');
function factExpressions(item){
 const out=[];
 for(const entry of [...(item.intentBefore||[]),...(item.intentAfter||[])])for(const fact of entry?.facts||[]){
  const text=typeof fact==='string'?fact:JSON.stringify(fact),start=text.indexOf('{');
  try{const value=JSON.parse(text.slice(start));if(value.expression)out.push(compact(value.expression));}catch{}
 }
 return out.filter(value=>value.length>=8);
}
function patchMethods(item,packet){
 const expressions=factExpressions(item),names=new Map();
 if(!expressions.length||typeof packet?.source_diff?.content!=='string')return [];
 let active=false,hunk=[];
 const declaration=/^\s*(?:(?:public|protected|private|static|final|synchronized|abstract)\s+)+[\w<>\[\],.? ]+?\s+(\w+)\s*\(/;
 const scan=()=>{
  for(let i=0;i<hunk.length;i++){
   const line=hunk[i];
   if(!/^[+-]/.test(line)||!expressions.some(expression=>compact(line.slice(1)).includes(expression)))continue;
   for(let j=i;j>=0;j--){
    const text=j===0?hunk[0].replace(/^@@[^@]*@@\s*/,''):hunk[j].slice(1),match=text.match(declaration)||(j===0&&text.match(/(?:^|\s)(\w+)\s*\(/));
    if(!match)continue;
    // The parameter count, when the parameter list closes on the declaration line.
    const params=text.slice(text.indexOf('(',text.search(new RegExp('\\b'+match[1]+'\\s*\\(')))+1).match(/^([^()]*)\)/);
    const arity=params?parameterCount(params[1]):null;
    const types=params?parameterTypes(params[1],true):null;
    names.set(match[1]+'/'+JSON.stringify(types),{name:match[1],arity,types});break;
   }
  }
  hunk=[];
 };
 for(const line of packet.source_diff.content.split('\n')){
  if(line.startsWith('diff --git ')){scan();active=line===`diff --git a/${item.file} b/${item.file}`;continue;}
  if(!active)continue;
  if(line.startsWith('@@')){scan();hunk=[line];}
  else if(hunk.length&&/^[ +-]/.test(line))hunk.push(line);
 }
 scan();
 return [...names.values()];
}
// Parameter types for a type-less method reference, read from this PR's own declaration of it: the
// nearest declaration above a changed line, on the PR side. Every such declaration with this name and
// parameter count must agree, and the parameter list must close on the declaration line.
function declaredTypes(item,packet,name,arity){
 if(typeof packet?.source_diff?.content!=='string'||!item.file)return null;
 const declaration=/^\s*(?:(?:public|protected|private|static|final|synchronized|abstract)\s+)*[\w<>\[\],.?]+(?:\s*<[^>]*>)?\s+(\w+)\s*\(([^()]*)\)/;
 let active=false,hunk=[],importsChanged=false;
 const found=new Set();
 const scan=()=>{
  for(let i=0;i<hunk.length;i++){
   if(!/^[+-]/.test(hunk[i]))continue;
   for(let j=i;j>=0;j--){
    if(hunk[j].startsWith('-')&&j!==i)continue; // Deleted lines are not part of the PR's source.
    const text=j===0?hunk[0].replace(/^@@[^@]*@@\s*/,''):hunk[j].slice(1),match=text.match(declaration);
    if(!match)continue;
    if(match[1]===name&&(arity===null||parameterCount(match[2])===arity))found.add(JSON.stringify(parameterTypes(match[2],true)));
    break;
   }
  }
  hunk=[];
 };
 for(const line of packet.source_diff.content.split('\n')){
  if(line.startsWith('diff --git ')){scan();active=line===`diff --git a/${item.file} b/${item.file}`;continue;}
  if(!active)continue;
  if(/^[+-]\s*import\s/.test(line))importsChanged=true;
  if(line.startsWith('@@')){scan();hunk=[line];}
  else if(hunk.length&&/^[ +-]/.test(line))hunk.push(line);
 }
 scan();
 if(found.size!==1)return null;
 const types=JSON.parse([...found][0]);
 return types.includes(null)?null:{types,importsChanged};
}
// Within one Java file a simple type name refers to exactly one type, so the PR's own declaration may
// name a parameter by its simple name. That holds only while the PR leaves the file's imports alone.
function resolveDeclared(terrain,file,name,arity,declared){
 const candidates=terrain.methods.map((row,i)=>[row,i]).filter(([row])=>terrain.files?.[row[1]]===file&&
  (row[2]===name||name.endsWith('.'+row[2])||row[2].endsWith('.'+name))&&rowArity(row)===declared.types.length&&(arity===null||rowArity(row)===arity));
 const verdict=(type,recorded)=>{
  const same=sameType(type,recorded);
  if(same!==null)return same;
  return !declared.importsChanged&&!type.includes('.')&&typeof recorded==='string'&&recorded.split('.').pop()===type?true:null;
 };
 const compared=candidates.map(([row,i])=>({i,matches:declared.types.map((type,k)=>verdict(type,terrain.argument_types?.[(row[8]||[])[k]]))}))
  .filter(({matches})=>!matches.includes(false));
 if(compared.length!==1||compared[0].matches.includes(null))return null;
 return {rows:[compared[0].i]};
}
function changedFlowRows(terrain,map,packet){
 const rows=new Set();
 for(const flow of packet?.flows||[]){
  if(!(flow.fact_changes||[]).length&&!(flow.observed_deltas||[]).length)continue;
  for(const i of terrainRows(terrain,map,flow.source?.file,flow.method).rows)rows.add(i);
 }
 return rows;
}

function findingImpact(item,packet){
 const terrain=packet?.explorer?.terrain,map=packet?.explorer?.governance?.holon_map;
 if(!terrain?.methods||!terrain.calls)return {status:'unavailable'};
 let resolved=terrainRows(terrain,map,item.file,item.methodRef),inferred=false;
 if(!resolved.rows.length&&!resolved.ambiguous&&!item.methodRef&&item.file){
  const matches=patchMethods(item,packet).map(({name,arity,types})=>resolveMethod(terrain,map,item.file,name,arity,null,types));
  resolved={rows:[...new Set(matches.flatMap(match=>match.rows))],ambiguous:matches.some(match=>match.ambiguous)};
  inferred=resolved.rows.length>0;
 }
 let declaredFromPatch=false;
 if(resolved.ambiguous&&item.methodRef&&refTypes(item.methodRef)===null){
  const name=ownerName(item.methodRef),arity=refArity(item.methodRef);
  const declared=declaredTypes(item,packet,name.split('.').pop(),arity);
  const match=declared&&resolveDeclared(terrain,item.file,name,arity,declared);
  if(match){resolved=match;declaredFromPatch=true;}
 }
 if(resolved.ambiguous)return {status:'ambiguous'};
 const origins=resolved.rows;
 if(!origins.length)return {status:'unmapped'};
 const node=i=>{const row=terrain.methods[i];return {id:row[0],name:row[2],service:terrain.services[row[3]]?.[1]||'',file:terrain.files?.[row[1]]||''};};
 const callers=terrain.methods.map(()=>[]);
 for(const [caller,callee] of terrain.calls)if(callers[callee]&&terrain.methods[caller])callers[callee].push(caller);
 const changed=changedFlowRows(terrain,map,packet),originSet=new Set(origins);
 const reached=new Map(origins.map(i=>[i,{depth:0,next:null}])),queue=[...origins],found=[];
 for(let q=0;q<queue.length&&found.length<MAX_CALLERS;q++){
  const callee=queue[q],depth=reached.get(callee).depth;
  if(depth>=MAX_DEPTH)continue;
  for(const caller of [...callers[callee]].sort((a,b)=>a-b)){
   if(reached.has(caller))continue;
   reached.set(caller,{depth:depth+1,next:callee});queue.push(caller);found.push(caller);
   if(found.length>=MAX_CALLERS)break;
  }
 }
 const origin=node(origins[0]);
 const path=i=>{const names=[];for(let at=i;at!==null;at=reached.get(at).next)names.push(terrain.methods[at][2]);return names;};
 const rows=found.map(i=>({...node(i),depth:reached.get(i).depth,path:path(i),
  crossService:terrain.methods[i][3]!==terrain.methods[origins[0]][3],test:isTest(terrain.files?.[terrain.methods[i][1]]),demonstrated:changed.has(i)&&!originSet.has(i)}));
 return {status:'mapped',origin,origins:origins.map(node),inferred,declaredFromPatch,callers:rows,truncated:found.length>=MAX_CALLERS};
}

function findingImpactMarkup(item,packet){
 const impact=findingImpact(item,packet);
 const note='<p class="impact-note">Callers come from the baseline’s resolved Java call graph, up to three calls away. Messages and HTTP calls between services are not traced here, so a service missing from this list can still be affected. Traced event routes appear under Cross-service contract.</p>';
 if(impact.status==='unavailable')return '';
 if(impact.status==='ambiguous')return `<section class="finding-impact"><h4>Impact of this change</h4><p>The recorded method signature cannot distinguish this finding’s method from possible overloads, so its callers cannot be identified reliably.</p>${note}</section>`;
 if(impact.status==='unmapped')return `<section class="finding-impact"><h4>Impact of this change</h4><p>This finding’s method is new in this PR or is not in the baseline call graph, so it has no recorded callers.</p>${note}</section>`;
 const button=row=>`<button type="button" class="impact-method" data-impact-method="${escapeHtml(row.id)}" title="${escapeHtml(row.file)}">${escapeHtml(row.name)}</button>`;
 const line=row=>`<li class="${row.demonstrated?'demonstrated':'potential'}">${button(row)}<span class="impact-service">${escapeHtml(placeName(row))}</span><span class="impact-tag">${row.demonstrated?'Demonstrated: this PR also changes its recorded behavior':row.test?'Exercises the changed method':'Potentially affected: calls the changed method'}</span>${row.depth>1?`<small class="impact-path">via ${row.path.slice(1,-1).map(escapeHtml).join(' → ')}</small>`:''}</li>`;
 const code=impact.callers.filter(row=>!row.test),tests=impact.callers.filter(row=>row.test);
 const other=code.filter(row=>row.crossService),same=code.filter(row=>!row.crossService);
 const group=(title,rows)=>rows.length?`<h5>${title} <span>${rows.length}</span></h5><ul>${rows.map(line).join('')}</ul>`:'';
 return `<section class="finding-impact" aria-labelledby="finding-impact-heading"><h4 id="finding-impact-heading">Impact of this change</h4>
  <p class="impact-origin">Changed here: ${impact.origins.map(button).join(', ')}<span class="impact-service">${escapeHtml(placeName(impact.origin))}</span><button type="button" class="impact-map" data-impact-method="${escapeHtml(impact.origin.id)}">Show on impact map</button></p>
  ${impact.inferred?'<p class="impact-note">The finding records only its file; this method is the one whose changed lines match its recorded facts.</p>':''}
  ${impact.declaredFromPatch?'<p class="impact-note">The finding records the method without parameter types; they come from this PR’s declaration of it.</p>':''}
  ${impact.callers.length?group('Other services that call it',other)+group('Same service',same)+group('Tests that call it',tests)+(impact.truncated?`<p class="impact-note">Showing the first ${MAX_CALLERS} callers.</p>`:''):'<p>No other method calls this one in the recorded call graph.</p>'}
  ${note}</section>`;
}

root.codeIntentFindingImpact={findingImpact,findingImpactMarkup,ownerName};
if(typeof module!=='undefined')module.exports=root.codeIntentFindingImpact;
})(typeof window!=='undefined'?window:globalThis);
