import test from "node:test";
import assert from "node:assert/strict";
import { readBoundedJournalForm, JournalUploadTooLargeError } from "../lib/campaigns/journal-upload.ts";

async function makeRequest(){
 const data=new FormData();
 data.set("entryId","page-123");
 data.set("file",new File([new Uint8Array([37,80,68,70,45])],"guide.pdf",{type:"application/pdf"}));
 const encoded=new Request("https://example.org/upload",{method:"POST",body:data});
 // Materialize the client encoder before simulating the server request. Node's
 // lazy FormData encoder can otherwise reject after server-side cancellation.
 return new Request(encoded.url,{method:"POST",headers:encoded.headers,body:await encoded.arrayBuffer()});
}

test("accepts multipart form-data even without Content-Length",async()=>{
 const request=await makeRequest();
 assert.equal(request.headers.has("content-length"),false);
 const form=await readBoundedJournalForm(request);
 assert.equal(form.get("entryId"),"page-123");
 assert.equal(form.get("file").name,"guide.pdf");
});
test("rejects a declared oversized upload before reading",async()=>{
 const request=await makeRequest();
 request.headers.set("content-length","99999999");
 await assert.rejects(readBoundedJournalForm(request),JournalUploadTooLargeError);
});
test("rejects an oversized multipart body despite missing Content-Length",async()=>{
 const request=await makeRequest();
 await assert.rejects(readBoundedJournalForm(request,30),JournalUploadTooLargeError);
});
test("malformed upload is rejected instead of parsed as a file",async()=>{
 const request=new Request("https://example.org/upload",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
 await assert.rejects(readBoundedJournalForm(request));
});
