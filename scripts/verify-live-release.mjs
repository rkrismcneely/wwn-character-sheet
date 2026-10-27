#!/usr/bin/env node
// Check which exact Git commit is visible on the production site.
// Usage: node scripts/verify-live-release.mjs [expected-40-character-sha]
const expected=process.argv[2]??"";
if(expected&&!/^[a-f0-9]{40}$/i.test(expected)){
 console.error("Expected commit must be a full 40-character Git SHA.");
 process.exit(2);
}
const url="https://taleswithoutend.com/twe-build-version.json?check="+encodeURIComponent(expected||Date.now().toString());
let response;
try{
 response=await fetch(url,{headers:{"cache-control":"no-cache"},signal:AbortSignal.timeout(12000)});
}catch(error){
 console.error("Could not reach the public release marker:",error.message);
 process.exit(1);
}
if(!response.ok){console.error("Release marker HTTP "+response.status);process.exit(1);}
let data;
try{data=await response.json();}catch{console.error("Release marker is not valid JSON.");process.exit(1);}
if(!/^[a-f0-9]{40}$/i.test(data?.commit??"")){
 console.error("Release marker does not contain a valid Git SHA.");
 process.exit(1);
}
console.log("Live production commit: "+data.commit);
if(expected&&expected.toLowerCase()!==data.commit.toLowerCase()){
 console.error("Expected "+expected+" but production is still serving "+data.commit);
 process.exit(1);
}
let health;
try{
 health=await fetch("https://taleswithoutend.com/",{signal:AbortSignal.timeout(12000)});
}catch(error){
 console.error("Could not reach the production homepage:",error.message);
 process.exit(1);
}
if(!health.ok){console.error("Production root HTTP "+health.status);process.exit(1);}
console.log(expected?"Verified exact production release and homepage.":"Verified release marker and homepage.");
