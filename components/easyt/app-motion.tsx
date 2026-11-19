"use client";

import { Children, forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode, type RefObject } from 'react';
import { canSpring, createRevealGate, scheduleReveal } from '@/lib/easyt/app-motion';
import Link from "next/link";

/** A non-layout sentinel animates existing children without reparenting controls.
 * Content is never hidden/disabled. Keyboard or pointer input immediately finishes the reveal.
 * Keep this sentinel mounted when an opening closes, so ready/query changes cannot replay it.
 */
export function EntryReveal({active = true, ready = true, selector}: {active?: boolean; ready?: boolean; selector?: string}) {
  const ref = useRef<HTMLSpanElement>(null);
  const gate = useRef(createRevealGate());
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!active) gate.current(false,ready);
    if (!parent || !active || !ready) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animations: Animation[] = [];
    // Consume the opening only on a real frame, not StrictMode's transient setup.
    const cancelFrame = scheduleReveal(gate.current, () => {
      if (preference.matches) return;
      const targets = selector ? Array.from(parent.querySelectorAll<HTMLElement>(selector)) : Array.from(parent.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== ref.current && !node.hidden);
      animations = targets.filter(node => typeof node.animate === 'function').map((node,index) => node.animate(
        [{opacity:.55,translate:'0 5px'},{opacity:1,translate:'0 0'}],
        {duration:420,delay:Math.min(index,4)*45,easing:'cubic-bezier(.2,.7,.2,1)',fill:'backwards'}));
    }, requestAnimationFrame, cancelAnimationFrame);
    const cancel = () => {cancelFrame();animations.forEach(animation => animation.cancel());};
    // Real input wins even before the first frame; it must not replay on refinement.
    const finish = () => {gate.current(true,true);cancel();};
    parent.addEventListener('keydown',finish); parent.addEventListener('pointerdown',finish);
    preference.addEventListener('change',finish);
    return () => {cancel();parent.removeEventListener('keydown',finish);parent.removeEventListener('pointerdown',finish);preference.removeEventListener('change',finish);};
  }, [active,ready,selector]);
  return <span hidden ref={ref} data-entry-reveal aria-hidden="true" />;
}

/** Shared visual feedback; never changes the native control rectangle or handlers. */
function useControlSpring(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const control = ref.current;
    if (!control || !enabled) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animations: Animation[] = [];
    const cancel = () => animations.forEach(a=>a.cancel());
    const play = (event: Event) => {
      if (event instanceof KeyboardEvent && (event.repeat || !['Enter',' '].includes(event.key))) return;
      if (event instanceof PointerEvent && (!event.isPrimary || event.button !== 0)) return;
      if (!canSpring({reduced:preference.matches,disabled:control.matches(':disabled,[aria-disabled="true"],[aria-busy="true"]'),excluded:Boolean(control.closest('[draggable="true"],[data-motion-exclude],[data-drag-handle],[data-itinerary-drag-handle]'))})) return;
      cancel();
      animations = Array.from(control.children).filter((n): n is HTMLElement | SVGElement => (n instanceof HTMLElement || n instanceof SVGElement) && typeof n.animate === 'function').map(n=>n.animate([{scale:'1',transformOrigin:'center',transformBox:'fill-box'},{scale:'.94',offset:.22},{scale:'1.025',offset:.62},{scale:'1',transformOrigin:'center',transformBox:'fill-box'}],{duration:340,easing:'ease-out'}));
    };
    control.addEventListener('pointerdown',play);control.addEventListener('keydown',play);preference.addEventListener('change',cancel);
    return()=>{cancel();control.removeEventListener('pointerdown',play);control.removeEventListener('keydown',play);preference.removeEventListener('change',cancel);};
  },[enabled,ref]);
}
// Preserve existing element children/direct-child CSS. Only raw text needs a visual span.
function motionLabels(children: ReactNode) {
  return Children.map(children,child=>(typeof child==='string' && child.trim().length>0)||typeof child==='number'?<span data-motion-label style={{display:'inline-block'}}>{child}</span>:child);
}
/** Class/ref/ARIA/handler-preserving adapter for native action controls. */
export const MotionButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {motion?: boolean}>(function MotionButton({children,motion = true,...props},forwardedRef) {
  const ref = useRef<HTMLButtonElement | null>(null);
  useControlSpring(ref,motion);
  // morrovia-ui-audit-allow-next-line native-control -- Shared native host preserves refs, ARIA and handlers while animating visual children only.
  return <button {...props} data-motion-button={motion || undefined} ref={node=>{ref.current=node;if(typeof forwardedRef==='function')forwardedRef(node);else if(forwardedRef)forwardedRef.current=node;}}>{motion ? motionLabels(children) : children}</button>;
});
/** Opt-in for button-like navigation only; ordinary anchors remain untouched. */
export const MotionLink = forwardRef<HTMLAnchorElement, ComponentProps<typeof Link>>(function MotionLink({children,...props},forwardedRef) {
  const ref=useRef<HTMLAnchorElement|null>(null);
  useControlSpring(ref,true);
  return <Link {...props} data-motion-button ref={node=>{ref.current=node;if(typeof forwardedRef==='function')forwardedRef(node);else if(forwardedRef)forwardedRef.current=node;}}>{motionLabels(children)}</Link>;
});
