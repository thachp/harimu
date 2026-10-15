'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {defaultDisplayPreferences,displayPreferences,displayTimestamp,effectiveReducedMotion,type DisplayPreferences} from '../lib/display-preferences';
const key='harimu:display-preferences:v1';
const context=createContext<{preferences:DisplayPreferences;save:(value:DisplayPreferences)=>void;storageAvailable:boolean}>({preferences:defaultDisplayPreferences,save:()=>{},storageAvailable:true});
export function DisplayPreferencesProvider({children}:{children:ReactNode}){
 const [preferences,setPreferences]=useState(defaultDisplayPreferences),[storageAvailable,setStorageAvailable]=useState(true);
 useEffect(()=>{let active=true;const load=()=>{try{const raw=localStorage.getItem(key);if(active)setPreferences(displayPreferences(raw?JSON.parse(raw):null));}catch{if(active)setStorageAvailable(false);}};queueMicrotask(load);const sync=(event:StorageEvent)=>{if(event.key===key||event.key===null)load();};window.addEventListener('storage',sync);return()=>{active=false;window.removeEventListener('storage',sync);};},[]);
 const save=(value:DisplayPreferences)=>{const next=displayPreferences(value);setPreferences(next);try{localStorage.setItem(key,JSON.stringify(next));setStorageAvailable(true);}catch{setStorageAvailable(false);}};
 return <context.Provider value={{preferences,save,storageAvailable}}><MotionPreference/><TextScalePreference/>{children}</context.Provider>;
}
export const useDisplayPreferences=()=>useContext(context);
export function useDisplayTimestamp(){const {preferences}=useDisplayPreferences();return (value:string|number)=>displayTimestamp(value,preferences.timeFormat);}

function MotionPreference(){
 const {preferences}=useDisplayPreferences();
 useEffect(()=>{
  const root=document.documentElement;root.dataset.harimuMotion=preferences.motion??'system';
  const query=typeof window.matchMedia==='function'?window.matchMedia('(prefers-reduced-motion: reduce)'):null;
  const apply=()=>{if(effectiveReducedMotion(preferences.motion,Boolean(query?.matches)))root.dataset.harimuReducedMotion='';else delete root.dataset.harimuReducedMotion;};
  apply();query?.addEventListener?.('change',apply);
  return()=>{query?.removeEventListener?.('change',apply);delete root.dataset.harimuMotion;delete root.dataset.harimuReducedMotion;};
 },[preferences.motion]);
 return null;
}

function TextScalePreference(){
 const {preferences}=useDisplayPreferences();
 useEffect(()=>{const root=document.documentElement;const scale=preferences.textScale??100;root.style.setProperty('--text-scale',String(scale/100));root.dataset.harimuTextScale=String(scale);return()=>{root.style.removeProperty('--text-scale');delete root.dataset.harimuTextScale;};},[preferences.textScale]);
 return null;
}
