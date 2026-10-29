/* Display-only candidate localization. Never changes a finding or its severity. */
(function(root){
'use strict';
function locate(item,rows){
 const finding=item.findings?.[0];
 if(item.comparison?.scope!=='method'||finding?.detected_by!=='static'||finding.static_check!=='ref_eq')return [];
 let block=false;const candidates=[];
 rows.forEach(([mark,text],row)=>{
  if(mark==='-'||String(text).startsWith('@@'))return;
  let clean='',quote=null;
  for(let i=0;i<text.length;i++){
   const ch=text[i],next=text[i+1];
   if(block){clean+=' ';if(ch==='*'&&next==='/'){clean+=' ';i++;block=false;}continue;}
   if(quote){clean+=' ';if(ch==='\\'){clean+=' ';i++;}else if(ch===quote)quote=null;continue;}
   if(ch==='/'&&next==='*'){block=true;clean+='  ';i++;continue;}
   if(ch==='/'&&next==='/'){clean+=' '.repeat(text.length-i);break;}
   if(ch==='"'||ch==="'"){quote=ch;clean+=' ';continue;}
   clean+=ch;
  }
  if(mark!=='+')return;
  for(const hit of clean.matchAll(/==|!=/g)){
   const left=clean.slice(0,hit.index).trim(),right=clean.slice(hit.index+2).trim();
   if(/\bnull$/.test(left)||/^null\b/.test(right))continue;
   if(/(?:\b\d+|\btrue|\bfalse)$/.test(left)||/^(?:\d+\b|true\b|false\b)/.test(right))continue;
   candidates.push({row,start:hit.index,end:hit.index+2});
  }
 });
 // More than one possible comparison is ambiguous; do not guess the operator.
 return candidates.length===1?candidates:[];
}
root.codeIntentStandardsFocus={locate};
if(typeof module!=='undefined')module.exports={locate};
})(typeof window!=='undefined'?window:globalThis);
