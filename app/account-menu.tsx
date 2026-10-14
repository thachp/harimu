'use client';
import {useEffect,useRef,useState} from 'react';
import {useClerk} from '@clerk/nextjs';
import styles from './account-menu.module.css';
/** Keep Clerk account/session actions inside a clearly dismissible native modal. */
export function AccountMenu(){
  const clerk=useClerk();
  const menu=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false);
  const trigger=useRef<HTMLButtonElement>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  const close=()=>{dialog.current?.close();setOpen(false);trigger.current?.focus();};
  useEffect(()=>{
    const element=dialog.current;
    if(!element)return;
    if(open&&!element.open)element.showModal();
    if(!open&&element.open)element.close();
  },[open]);
  useEffect(()=>{
    const element=menu.current;
    if(!open||!element)return;
    clerk.mountUserButton(element,{defaultOpen:true,__experimental_asStandalone:opened=>{if(!opened){dialog.current?.close();setOpen(false);trigger.current?.focus();}},appearance:{elements:{userButtonPopoverCard:styles.menu,userButtonPopoverFooter:styles.footer}}});
    const user=clerk.user;
    const label=`${user?.fullName?.trim()||user?.username||user?.primaryEmailAddress?.emailAddress||'Account'} avatar`;
    const fixAlt=()=>element.querySelectorAll?.('img').forEach(img=>{const alt=img.getAttribute('alt')?.trim()??'';if(!alt||/^'s\b/.test(alt))img.setAttribute('alt',label);});
    const observer=typeof MutationObserver==='undefined'?null:new MutationObserver(fixAlt);
    observer?.observe(element,{childList:true,subtree:true,attributes:true,attributeFilter:['alt','src']});
    fixAlt();
    return ()=>{observer?.disconnect();clerk.unmountUserButton(element);};
  },[clerk,open]);
  return <><button ref={trigger} className={styles.trigger} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls="harimu-account-menu" onClick={()=>setOpen(true)}>Account</button><dialog id="harimu-account-menu" ref={dialog} className={styles.dialog} aria-labelledby="harimu-account-title" onKeyDown={event=>{if(event.key==='Escape')event.stopPropagation();}} onCancel={event=>{event.preventDefault();close();}} onClose={()=>setOpen(false)} onClick={event=>{if(event.target===event.currentTarget)close();}}><div className={styles.content}><header><h2 id="harimu-account-title">Account menu</h2><button type="button" onClick={close} aria-label="Close account menu">Close</button></header><div ref={menu} /></div></dialog></>;
}
