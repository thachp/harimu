'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {defaultDisplayPreferences,displayPreferences,displayTimestamp,type DisplayPreferences} from '../lib/display-preferences';
const key='harimu:display-preferences:v1';
const context=createContext<{preferences:DisplayPreferences;save:(value:DisplayPreferences)=>void;storageAvailable:boolean}>({preferences:defaultDisplayPreferences,save:()=>{},storageAvailable:true});
export function DisplayPreferencesProvider({children}:{children:ReactNode}){
 const [preferences,setPreferences]=useState(defaultDisplayPreferences),[storageAvailable,setStorageAvailable]=useState(true);
 useEffect(()=>{let active=true;const load=()=>{try{const raw=localStorage.getItem(key);if(active)setPreferences(displayPreferences(raw?JSON.parse(raw):null));}catch{if(active)setStorageAvailable(false);}};queueMicrotask(load);const sync=(event:StorageEvent)=>{if(event.key===key||event.key===null)load();};window.addEventListener('storage',sync);return()=>{active=false;window.removeEventListener('storage',sync);};},[]);
 const save=(value:DisplayPreferences)=>{const next=displayPreferences(value);setPreferences(next);try{localStorage.setItem(key,JSON.stringify(next));setStorageAvailable(true);}catch{setStorageAvailable(false);}};
 return <context.Provider value={{preferences,save,storageAvailable}}><MotionPreference/>{children}</context.Provider>;
}
export const useDisplayPreferences=()=>useContext(context);
export function useDisplayTimestamp(){const {preferences}=useDisplayPreferences();return (value:string|number)=>displayTimestamp(value,preferences.timeFormat);}

function MotionPreference(){
 const {preferences}=useDisplayPreferences();
 useEffect(()=>{document.documentElement.dataset.harimuMotion=preferences.motion??'system';return()=>{delete document.documentElement.dataset.harimuMotion;};},[preferences.motion]);
 return null;
}
