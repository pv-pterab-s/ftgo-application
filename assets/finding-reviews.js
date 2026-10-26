/* Anonymous FTGO demo: GitHub credentials stay on the server. */
(function(root){
'use strict';
function command(answer,sha,scope){
 if(!['yes','no'].includes(answer)||!/^[0-9a-f]{40}$/.test(sha)||!/^[0-9a-f]{64}$/.test(scope))throw Error('Recorded review evidence is unavailable.');
 return `/codeintent-review ${answer} ${sha} ${scope}`;
}
function targets(item,items,packet,summary,checks){
 const out=[];
 for(const check of checks)for(const finding of check.findings||[]){
  if(!finding.review?.scope)continue;
  const matched=root.walkthroughPipeline.descriptionItem(items,packet,summary,checks,check.id,finding.id||finding.ref);
  if(matched?.id===item.id)out.push({check,finding});
 }
 return out;
}
function recorded(target,body){
 const r=target?.finding.review;
 return !!r?.record&&['accepted','unresolved'].includes(r.decision)&&body.includes(`<!-- codeintent-review:${r.scope}:${r.decision}:${r.record} -->`);
}
const ENDPOINT='https://qgd63ljozc.execute-api.us-east-1.amazonaws.com/demo/review-decisions';
function createClient(endpoint=ENDPOINT,transport=(...args)=>fetch(...args)){
 async function save(body){
  const response=await transport(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',credentials:'omit'});
  const value=await response.json();
  if(!response.ok){const error=Error(value.error||'Review service unavailable.');error.status=response.status;error.signIn=value.sign_in===true;error.confirm=value.confirm_on_github===true;throw error;}
  return value;
 }
 return {save};
}
const client=createClient();
async function submit(request){return client.save(request);}
/* GitHub identity for Yes. The page bounces through GitHub (already signed in there),
   and comes back with a short-lived session signed by the review API. It lives in this
   tab's sessionStorage only; the nonce ties the returning session to the click that asked. */
const SESSION='codeintent.reviewSession',NONCE='codeintent.signInNonce',PENDING='codeintent.pendingReview';
function storage(){try{return root.sessionStorage||null;}catch(error){return null;}}
function session(store=storage(),now=Date.now()){
 try{
  const token=store?.getItem(SESSION);if(!token)return null;
  const body=token.split('.')[0].replace(/-/g,'+').replace(/_/g,'/');
  const claims=JSON.parse(atob(body+'='.repeat((4-body.length%4)%4)));
  // Treat a session within a minute of expiry as gone, so the save cannot race it.
  if(claims.exp*1000>now+60000)return token;
  store.removeItem(SESSION);
 }catch(error){}
 return null;
}
function forget(store=storage()){try{store?.removeItem(SESSION);}catch(error){}}
function signIn(pending,returnTo,{store=storage(),assign=url=>location.assign(url),random=n=>crypto.getRandomValues(new Uint8Array(n))}={}){
 const nonce=btoa(String.fromCharCode(...random(24))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 if(!store)throw Error('This browser blocks the storage needed to sign in with GitHub.');
 store.setItem(NONCE,nonce);store.setItem(PENDING,JSON.stringify(pending));
 assign(ENDPOINT+'/oauth/start?'+new URLSearchParams({return_to:returnTo,nonce}));
}
function finishSignIn({store=storage(),href=location.href,replace=url=>history.replaceState(null,'',url)}={}){
 const url=new URL(href),fragment=new URLSearchParams(url.hash.slice(1));
 if(!fragment.has('codeintent_session')&&!fragment.has('codeintent_signin_error'))return null;
 url.hash='';replace(url.href);
 const nonce=store?.getItem(NONCE),raw=store?.getItem(PENDING);
 store?.removeItem(NONCE);store?.removeItem(PENDING);
 let pending=null;try{pending=raw?JSON.parse(raw):null;}catch(error){}
 if(fragment.has('codeintent_signin_error'))return {error:fragment.get('codeintent_signin_error'),pending};
 if(!nonce||fragment.get('codeintent_nonce')!==nonce)return {error:'GitHub sign-in did not match this page. Try again.',pending:null};
 store.setItem(SESSION,fragment.get('codeintent_session'));
 return {session:fragment.get('codeintent_session'),pending};
}
root.codeIntentFindingReviews={command,targets,recorded,createClient,submit,session,forget,signIn,finishSignIn};
if(typeof module!=='undefined')module.exports=root.codeIntentFindingReviews;
})(typeof window==='undefined'?globalThis:window);
