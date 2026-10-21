import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';
export const Context=createContext();
export const useApp=()=>useContext(Context);
export function useLoad(path,version=0) {
  const [state,set]=useState({data:null,error:null,loading:true});
  const [retry,retrySet]=useState(0);
  useEffect(()=>{
    let alive=true;
    set(s=>({...s,error:null,loading:true}));
    api(path).then(data=>alive&&set({data,error:null,loading:false})).catch(e=>alive&&set(s=>({...s,error:e.message,loading:false})));
    return ()=>{alive=false;};
  },[path,version,retry]);
  return {...state,retry:()=>retrySet(x=>x+1)};
}
