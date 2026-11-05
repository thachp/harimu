'use client';
import { useEffect, useState } from 'react';
import { countdownDualTimeEnabled, dualTimeCountdown, gameTimerSnapshot, type DualTimeLine } from '../lib/game-time';
import {useDisplayTimestamp} from './display-preferences';
import styles from './game-timer.module.css';

/** #1104: the two visible times. Index keys, not the words. Screen readers use the parent's accessible name. */
export function DualTimeParts({ line }: { line: DualTimeLine }) {
  const parts = [line.real, line.game];
  return <span className={styles.dual}>{parts.map((part, index) => <span key={index}>{index ? ' · ' : ''}{part}</span>)}</span>;
}

/** Presentation only. Local countdown never grants rewards or changes authoritative deadlines. */
/** #137: `label` describes the running countdown; `readyLabel` (when given) replaces it only once the deadline has passed. */
/** #1104: `epochMs` is the world-clock epoch. While the dual-time flag is on, a running timer shows real remaining and the game calendar (or the 12× duration when the epoch is unknown). */
export function GameTimer({endsAt,label='Remaining',readyLabel,compact=false,expiredText='Deadline reached · refresh to confirm.',epochMs}: {endsAt:string|number;label?:string;readyLabel?:string;compact?:boolean;expiredText?:string;epochMs?:number}) {
  const formatTime=useDisplayTimestamp();
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
  const shown=value.status==='expired'&&readyLabel?readyLabel:label;
  const dual=value.status==='running'&&now!==null&&countdownDualTimeEnabled()?dualTimeCountdown(endsAt,now,epochMs):null;
  const access=dual?`${shown}: ${dual.access}`:`${shown}: ${value.real} real time; ${value.game} game time at 12 times speed`;
  return <span className={`${styles.timer} ${compact?styles.compact:''}`}>
    <span role="timer" aria-live="off" aria-label={access}>
      <strong>{shown}</strong> · {value.status==='loading' ? 'Checking clock…' : value.status==='invalid' ? 'Deadline unavailable' : dual ? <DualTimeParts line={dual} /> : <><span>{value.real} real</span><span> · {value.game} game</span></>}
    </span>
    {!compact && deadline && <small>Deadline: <time dateTime={deadline}>{formatTime(deadline)}</time></small>}
    {value.status==='expired' && <small role="status">{expiredText}</small>}
    {offline && <small>Offline · countdown uses your device clock; reconnect to confirm.</small>}
  </span>;
}
