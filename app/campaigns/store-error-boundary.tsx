"use client";
import {Component,type ErrorInfo,type ReactNode} from "react";
type Props={children:ReactNode};
type State={error:string|null;attempt:number};
export class StoreErrorBoundary extends Component<Props,State>{
 state:State={error:null,attempt:0};
 static getDerivedStateFromError(error:Error){return {error:error.message||"Unknown Store rendering error."};}
 componentDidCatch(error:Error,info:ErrorInfo){console.error("Campaign Stores failed:",error,info.componentStack);}
 render(){
  if(this.state.error)return <section className="campaign-panel" role="alert">
    <h2>Stores could not be displayed</h2>
    <p>The rest of the campaign remains available. No Store data has been changed.</p>
    <p style={{fontFamily:"monospace",fontSize:12,overflowWrap:"anywhere"}}>{this.state.error}</p>
    <button type="button" className="campaign-secondary" onClick={()=>this.setState(s=>({error:null,attempt:s.attempt+1}))}>Retry Stores</button>
  </section>;
  return <div key={this.state.attempt}>{this.props.children}</div>;
 }
}
