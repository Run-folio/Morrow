"use client";

import { Check, UsersRound } from "lucide-react";
import { useEffect, useLayoutEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { MotionButton } from "./app-motion";
import { MorroviaPlannerFieldContent, plannerFieldButtonClassName } from "./morrovia-planner-field";
import styles from "./morrovia-traveller-listbox.module.css";

/** Homepage-only select-list using the planner trigger and existing portalled menu pattern. */
export function MorroviaTravellerListbox({className,disabled,label,value,min,max,noun,nounPlural,onChange}: {
  className?: string; disabled?: boolean; label: string; value: number; min: number; max: number;
  noun: string; nounPlural: string; onChange: (value: number) => void;
}) {
  const id=useId(), trigger=useRef<HTMLButtonElement>(null), panel=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false), [active,setActive]=useState(value);
  const [position,setPosition]=useState<CSSProperties>({});
  const typed=useRef({text:'',time:0});
  const text=(n:number)=>`${n} ${n===1?noun:nounPlural}`;
  const show=()=>{setActive(value);typed.current={text:'',time:0};setOpen(true);};
  const choose=(n:number)=>{if(disabled)return;onChange(n);setOpen(false);trigger.current?.focus();};
  useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
  useLayoutEffect(()=>{
    if(!open)return;
    const place=()=>{
      const r=trigger.current?.getBoundingClientRect();if(!r)return;
      const width=Math.min(r.width,window.innerWidth-24), below=window.innerHeight-r.bottom-12, above=r.top-12;
      const down=below>=Math.min(320,above), height=Math.min(320,Math.max(88,down?below:above));
      setPosition({position:'fixed',left:Math.max(12,Math.min(r.left,window.innerWidth-width-12)),width,maxHeight:height,...(down?{top:r.bottom+6}:{bottom:window.innerHeight-r.top+6})});
    };
    const outside=(event:Event)=>{const target=event.target as Node;if(!trigger.current?.contains(target)&&!panel.current?.contains(target))setOpen(false);};
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    document.addEventListener('pointerdown',outside);document.addEventListener('focusin',outside);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);document.removeEventListener('pointerdown',outside);document.removeEventListener('focusin',outside);};
  },[open]);
  useEffect(()=>{if(open)panel.current?.querySelector(`[data-quantity="${active}"]`)?.scrollIntoView({block:'nearest'});},[active,open]);
  const key=(event:KeyboardEvent<HTMLButtonElement>)=>{
    if(event.key==='Tab'){setOpen(false);return;}
    if(event.key==='Escape'){if(open){event.preventDefault();setOpen(false);}return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();if(!open){show();if(event.key==='Home')setActive(min);if(event.key==='End')setActive(max);}
      else setActive(event.key==='Home'?min:event.key==='End'?max:Math.max(min,Math.min(max,active+(event.key==='ArrowDown'?1:-1))));return;
    }
    if(event.key==='Enter'||event.key===' '){event.preventDefault();if(open)choose(active);else show();return;}
    if(/^\d$/.test(event.key)){
      event.preventDefault();const now=Date.now();const query=now-typed.current.time<700?typed.current.text+event.key:event.key;
      const options=Array.from({length:max-min+1},(_,i)=>min+i);
      const match=options.find(n=>String(n).startsWith(query))??options.find(n=>String(n).startsWith(event.key));
      typed.current={text:match!==undefined&&String(match).startsWith(query)?query:event.key,time:now};
      if(match!==undefined){setActive(match);setOpen(true);}
    }
  };
  return <div className={className}>
    <MotionButton ref={trigger} type="button" className={`${plannerFieldButtonClassName} ${styles.trigger}`}
      data-morrovia-planner-trigger role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?id:undefined}
      aria-activedescendant={open?`${id}-${active}`:undefined} disabled={disabled} onKeyDown={key}
      onClick={()=>open?setOpen(false):show()}>
      <MorroviaPlannerFieldContent icon={UsersRound} value={text(value)} />
    </MotionButton>
    {open&&typeof document!=='undefined'?createPortal(<div ref={panel} id={id} role="listbox" aria-label={label}
      className={`morrovia-editorial-page ${styles.menu}`} style={position}>
      {Array.from({length:max-min+1},(_,i)=>min+i).map(n=><MotionButton key={n} id={`${id}-${n}`} type="button" role="option" tabIndex={-1}
        data-quantity={n} data-active={n===active||undefined} aria-selected={n===value}
        onPointerDown={event=>event.preventDefault()} onClick={()=>choose(n)}>
        <span>{text(n)}</span>{n===value?<Check aria-hidden="true"/>:null}
      </MotionButton>)}
    </div>,document.body):null}
  </div>;
}
