/* Fetch saved review detail only; this helper never starts analysis or model work. */
async function loadPinnedDetail(reference, expected, schema, limit=524288){
 const unavailable=reason=>({available:false,reason});
 const pinnedExpected={...expected}, pinnedDigest=reference.sha256;
 try{
  const url=new URL(reference.url,location.href);
  if(url.origin!==location.origin)throw Error('Detail must be same-origin.');
  let response, bytes;
  for(let attempt=0;attempt<3;attempt++){
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),8000);
   try{
    response=await fetch(url,{cache:'no-store',signal:controller.signal});
    if(response.ok){bytes=await response.arrayBuffer();break;}
    if(![408,429,500,502,503,504].includes(response.status)||attempt===2)break;
   }catch(error){if(attempt===2)throw error;}
   finally{clearTimeout(timeout);}
   await new Promise(resolve=>setTimeout(resolve,200*(attempt+1)));
  }
  if(!response.ok)throw Error('Saved detail unavailable (HTTP '+response.status+').');

  if(bytes.byteLength>limit)throw Error('Saved detail exceeds 512 KiB.');
  const digest=await reviewSha256(bytes);
  if(digest!==pinnedDigest)throw Error('Saved detail checksum mismatch.');
  const value=JSON.parse(new TextDecoder().decode(bytes));
  if(value.schema!==schema||!value.identity||Object.keys(pinnedExpected).some(key=>value.identity[key]!==pinnedExpected[key]))throw Error('Saved detail belongs to another run.');
  return {available:true,value};
 }catch(error){return unavailable(error.message||'Saved detail unavailable.');}
}

if(typeof module!=='undefined')module.exports={loadPinnedDetail};
