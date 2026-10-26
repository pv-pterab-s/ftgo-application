/* Keep implementation and provider names out of reviewer-facing prose. */
(function(root){
'use strict';
function text(value){
 return String(value??'')
  .replace(/\btype\s*safe\b/gi,'analysis service')
  .replace(/\b(?:gherkin|gerkin)\b/gi,'behavior model');
}
function sanitize(container){
 if(!container)return;
 const document=container.ownerDocument||root.document;
 const showText=root.NodeFilter?.SHOW_TEXT??4;
 const walker=document.createTreeWalker(container,showText);
 for(let node=walker.nextNode();node;node=walker.nextNode()){
  if(node.parentElement?.closest('pre,code'))continue;
  node.nodeValue=text(node.nodeValue);
 }
 for(const element of container.querySelectorAll('[title],[aria-label]')){
  if(element.closest('pre,code'))continue;
  for(const name of ['title','aria-label'])if(element.hasAttribute(name))element.setAttribute(name,text(element.getAttribute(name)));
 }
}
const api={text,sanitize};
root.codeIntentCustomerLanguage=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
