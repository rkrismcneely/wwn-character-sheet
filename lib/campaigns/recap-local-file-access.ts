/** Local Whisper opt-in recording handle persistence (not a copy of the audio). */
export type RememberedFileHandle={
  getFile():Promise<File>;
  queryPermission(options?:{mode:"read"}):Promise<"granted"|"prompt"|"denied">;
};
const DB_NAME="twe-local-whisper-recording-handles";
const STORE="files";
export function localHandleKey(campaignId:string,recapId:string):string {
  if(!/^cmp_[A-Za-z0-9_-]{22}$/u.test(campaignId)||
    !/^[0-9a-f-]{36}$/iu.test(recapId))throw new Error("Invalid local recap key.");
  return campaignId+":"+recapId;
}
function openDb():Promise<IDBDatabase>{
  if(typeof indexedDB==="undefined")return Promise.reject(new Error("Persistent file handles are unsupported in this browser."));
  return new Promise((resolve,reject)=>{
    const task=indexedDB.open(DB_NAME,1);
    task.onupgradeneeded=()=>{if(!task.result.objectStoreNames.contains(STORE))
      task.result.createObjectStore(STORE);};
    task.onerror=()=>reject(task.error??new Error("Local file store unavailable."));
    task.onsuccess=()=>resolve(task.result);
  });
}
async function transaction<T>(key:string,kind:"get"|"put"|"delete",value?:RememberedFileHandle):Promise<T|undefined>{
  const db=await openDb();
  try{
    return await new Promise<T|undefined>((resolve,reject)=>{
      const transaction=db.transaction(STORE,kind==="get"?"readonly":"readwrite");
      const store=transaction.objectStore(STORE);
      const command=kind==="get"?store.get(key):kind==="put"?store.put(value,key):store.delete(key);
      command.onsuccess=()=>resolve(command.result as T|undefined);
      command.onerror=()=>reject(command.error??new Error("File handle request failed."));
      transaction.onerror=()=>reject(transaction.error??new Error("File handle store failed."));
    });
  }finally{db.close();}
}
export async function rememberLocalRecapFile(key:string,handle:RememberedFileHandle):Promise<void>{
  await transaction(key,"put",handle);
}
export async function readRememberedLocalRecapFile(key:string):Promise<RememberedFileHandle|null>{
  return await transaction<RememberedFileHandle>(key,"get")??null;
}
export async function clearRememberedLocalRecapFile(key:string):Promise<void>{
  await transaction(key,"delete");
}
export async function requestLocalRecapFileHandle():Promise<RememberedFileHandle|null>{
  const picker=(window as Window &{
    showOpenFilePicker?: (options?:{types:{description:string;accept:Record<string,string[]>}[]})=>Promise<RememberedFileHandle[]>;
  }).showOpenFilePicker;
  if(!picker)return null;
  const handles=await picker.call(window,{types:[{description:"Uncompressed PCM WAV",accept:{"audio/wav":[".wav"]}}]});
  return handles[0]??null;
}
