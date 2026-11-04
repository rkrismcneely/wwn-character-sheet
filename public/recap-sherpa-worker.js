/* Experimental, user-activated local Sherpa-ONNX diarization worker.
 * No recording samples are sent to the model host. Only publicly downloadable JS/WASM/model
 * files are fetched. Attribution and asset documentation:
 * https://huggingface.co/Transcripta/sherpa-onnx-speaker-diarization-wasm
 */
const ROOT="https://huggingface.co/Transcripta/sherpa-onnx-speaker-diarization-wasm/resolve/main/";
let engine=null, loading=false, ready=false;
self.onmessage=event=>{
  const message=event.data;
  if(message?.type==="init"){
    if(ready){self.postMessage({type:"ready"});return;}
    if(loading)return;
    loading=true;
    try{
      self.Module={
        locateFile(path){return ROOT+path;},
        onRuntimeInitialized(){
          try{
            importScripts(ROOT+"sherpa-onnx-speaker-diarization.js");
            if(typeof self.createOfflineSpeakerDiarization!=="function")
              throw Error("Sherpa speaker API is unavailable.");
            engine=self.createOfflineSpeakerDiarization(self.Module);
            ready=true;self.postMessage({type:"ready"});
          }catch(error){self.postMessage({type:"error",message:String(error)});}
        },
        onAbort(reason){self.postMessage({type:"error",message:"Sherpa stopped: "+String(reason)});},
      };
      importScripts(ROOT+"sherpa-onnx-wasm-main-speaker-diarization.js");
    }catch(error){self.postMessage({type:"error",message:String(error)});}
    return;
  }
  if(message?.type==="process"){
    if(!ready||!engine){self.postMessage({type:"error",message:"Sherpa is not ready."});return;}
    try{
      const samples=message.samples;
      if(!(samples instanceof Float32Array)||samples.length<16000||
        samples.length>16000*15*60)throw Error("Use a 1-second to 15-minute 16 kHz mono section.");
      const turns=engine.process(samples);
      if(!Array.isArray(turns)||turns.length>2000)
        throw Error("Sherpa returned an unsupported speaker timeline.");
      self.postMessage({type:"result",turns});
    }catch(error){self.postMessage({type:"error",message:String(error)});}
  }
};
