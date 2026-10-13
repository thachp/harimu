'use client';
import { useEffect, useState } from 'react';
import { gameTimerSnapshot } from '../lib/game-time';
import styles from './game-timer.module.css';

/** Presentation only. Local countdown never grants rewards or changes authoritative deadlines. */
export function GameTimer({endsAt,label='Remaining',compact=false}: {endsAt:string|number;label?:string;compact?:boolean}) {
  const [now,setNow]=useState<number|null>(null);
  const [offline,setOffline]=useState(false);
  useEffect(()=>{
    const update=()=>{setNow(Date.now());setOffline(window.navigator.onLine === false);};
    let cancelled=false;
    queueMicrotask(()=>{if(!cancelled)update();});
    const timer=window.setInterval(update,1000);
    window.addEventListener('online',update);window.addEventListener('offline',update);window.addEventListener('focus',update);
    document.addEventListener('visibilitychange',update);
    return()=>{cancelled=true;window.clearInterval(timer);window.removeEventListener('online',update);window.removeEventListener('offline',update);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};
  },[]);
  const value=gameTimerSnapshot(endsAt,now);
  const deadline=value.deadline === null ? null : new Date(value.deadline).toISOString();
  return <span className={`${styles.timer} ${compact?styles.compact:''}`}>
    <span role="timer" aria-live="off" aria-label={`${label}: ${value.real} real time; ${value.game} game time at 12 times speed`}>
      <strong>{label}</strong> · {value.status==='loading' ? 'Checking clock…' : value.status==='invalid' ? 'Deadline unavailable' : <><span>{value.real} real</span><span> · {value.game} game</span></>}
    </span>
    {!compact && deadline && <small>Deadline: <time dateTime={deadline}>{deadline.replace('T',' ').replace('.000Z',' UTC').replace('Z',' UTC')}</time></small>}
    {value.status==='expired' && <small role="status">Deadline reached · refresh to confirm.</small>}
    {offline && <small>Offline · countdown uses your device clock; reconnect to confirm.</small>}
  </span>;
}
