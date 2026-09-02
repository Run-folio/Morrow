"use client";

import { ArrowLeft, ArrowRight, Check, MoreHorizontal, X } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefCallback,
} from "react";
import { trackEvent } from "@/lib/analytics";
import {
  readWorkspaceOrientationState,
  shouldAutoStartWorkspaceOrientation,
  WORKSPACE_ORIENTATION_VERSIONS,
  workspaceOrientationStorageKey,
  writeWorkspaceOrientationState,
  type WorkspaceOrientationSource,
  type WorkspaceOrientationWorkspace,
} from "@/lib/easyt/workspace-orientation";
import { EasyTButton } from "./easyt-controls";
import { PRODUCT_TOUR_OPEN_EVENT, PRODUCT_TOUR_STATE_EVENT } from "./easyt-product-tour";
import styles from "./workspace-orientation.module.css";

export type WorkspaceOrientationTarget =
  | "overview-next"
  | "overview-progress"
  | "workspace-navigation"
  | "map-stop"
  | "map-explore"
  | "map-result-actions"
  | "itinerary-days"
  | "itinerary-planner"
  | "itinerary-suggestions";

type OrientationStep = {
  target: WorkspaceOrientationTarget;
  eyebrow: string;
  title: string;
  body: string;
  mobileBody?: string;
};

const steps: Record<WorkspaceOrientationWorkspace, readonly OrientationStep[]> = {
  overview: [
    { target: "overview-next", eyebrow: "Overview", title: "Start with the next action", body: "Morrovia brings the most useful thing to do next to the top of your trip." },
    { target: "overview-progress", eyebrow: "Overview", title: "See what still needs planning", body: "Review route issues, stays, transport and practical preparation without searching through the whole trip." },
    { target: "workspace-navigation", eyebrow: "Overview", title: "Three views, one trip", body: "Use Map to explore places and Itinerary to organise each day. Your trip stays connected across all three views." },
  ],
  map: [
    { target: "map-stop", eyebrow: "Map", title: "Focus on a destination", body: "Select a stop to explore useful places around that part of your trip." },
    { target: "map-explore", eyebrow: "Map", title: "Find useful options", body: "Use Stay for accommodation and See for attractions and experiences around the selected destination." },
    { target: "map-result-actions", eyebrow: "Map", title: "Save it or add it to a day", body: "Save keeps an idea for later. Add to Day schedules it in your itinerary." },
  ],
  itinerary: [
    { target: "itinerary-days", eyebrow: "Itinerary", title: "Plan one day at a time", body: "Choose a day to see its travel, activities, accommodation and ideas." },
    { target: "itinerary-planner", eyebrow: "Itinerary", title: "Use the broad parts of the day", body: "Add activities to Morning, Midday, Afternoon or Evening. Travel and Tonight stay separate." },
    { target: "itinerary-suggestions", eyebrow: "Itinerary", title: "Add ideas to the plan", body: "Add an idea to a day part, or drag it into the planner on desktop. Save keeps it unscheduled for later.", mobileBody: "Add an idea to a day, then choose Morning, Midday, Afternoon or Evening. Save keeps it unscheduled for later." },
  ],
};

type Registration = { element: HTMLElement; workspace: WorkspaceOrientationWorkspace };
type ReadyState = { ready: boolean; attentionRequired: boolean };
type OrientationSession = { workspace: WorkspaceOrientationWorkspace; source: WorkspaceOrientationSource; stepIndex: number; available: OrientationStep[] };

type WorkspaceOrientationContextValue = {
  registerTarget: (target: WorkspaceOrientationTarget, workspace: WorkspaceOrientationWorkspace, element: HTMLElement | null) => void;
  setReady: (workspace: WorkspaceOrientationWorkspace, state: ReadyState | null) => void;
  replay: (launcher: HTMLElement | null) => void;
  setBlocked: (id: string, blocked: boolean) => void;
  canReplay: boolean;
};

const WorkspaceOrientationContext = createContext<WorkspaceOrientationContextValue | null>(null);

function workspaceFromPathname(pathname: string): WorkspaceOrientationWorkspace {
  if (pathname.includes("/itinerary")) return "itinerary";
  if (pathname.includes("/map")) return "map";
  return "overview";
}

function visibleTarget(element: HTMLElement | undefined) {
  if (!element?.isConnected) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
}

function anchoredPosition(element: HTMLElement): CSSProperties {
  const rect = element.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 32);
  const left = Math.max(16, Math.min(window.innerWidth - width - 16, rect.left + Math.min(24, rect.width / 3)));
  const roomBelow = window.innerHeight - rect.bottom;
  const desiredTop = roomBelow >= 260 ? rect.bottom + 12 : rect.top - 250;
  const top = Math.max(16, Math.min(window.innerHeight - 266, desiredTop));
  return { left, top, width };
}

export function WorkspaceOrientationProvider({ ownerId, children, autoStart = true }: { ownerId: string | null; children: ReactNode; autoStart?: boolean }) {
  const pathname = usePathname();
  const workspace = workspaceFromPathname(pathname);
  const targetsRef = useRef(new Map<WorkspaceOrientationTarget, Registration>());
  const readyRef = useRef(new Map<WorkspaceOrientationWorkspace, ReadyState>());
  const blockersRef = useRef(new Set<string>());
  const [registryRevision, setRegistryRevision] = useState(0);
  const [session, setSession] = useState<OrientationSession | null>(null);
  const [productTourOpen, setProductTourOpen] = useState(false);
  const [userInteracted, setUserInteracted] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const [mobile, setMobile] = useState(false);
  const launcherRef = useRef<HTMLElement | null>(null);
  const sessionFinalizedRef = useRef(false);
  const autoStartAttemptedRef = useRef<string | null>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const registerTarget = useCallback((target: WorkspaceOrientationTarget, targetWorkspace: WorkspaceOrientationWorkspace, element: HTMLElement | null) => {
    const current = targetsRef.current.get(target)?.element;
    if (element) targetsRef.current.set(target, { element, workspace: targetWorkspace });
    else if (current) targetsRef.current.delete(target);
    setRegistryRevision((value) => value + 1);
  }, []);

  const setReady = useCallback((targetWorkspace: WorkspaceOrientationWorkspace, state: ReadyState | null) => {
    if (state) readyRef.current.set(targetWorkspace, state);
    else readyRef.current.delete(targetWorkspace);
    setRegistryRevision((value) => value + 1);
  }, []);

  const setBlocked = useCallback((id: string, blocked: boolean) => {
    if (blocked) {
      blockersRef.current.add(id);
      setSession(null);
    }
    else blockersRef.current.delete(id);
    setRegistryRevision((value) => value + 1);
  }, []);

  const availableSteps = useCallback((targetWorkspace: WorkspaceOrientationWorkspace) => steps[targetWorkspace].filter((step) => {
    const registration = targetsRef.current.get(step.target);
    return registration?.workspace === targetWorkspace && visibleTarget(registration.element);
  }), []);

  const begin = useCallback((source: WorkspaceOrientationSource, launcher: HTMLElement | null = null) => {
    const competingAttention = blockersRef.current.size > 0
      || productTourOpen
      || Boolean(document.querySelector('[role="dialog"]:not([data-workspace-orientation-ui="true"]), [data-product-tour-prompt="true"]'));
    if (competingAttention) return false;
    const available = availableSteps(workspace);
    if (!available.length) return false;
    launcherRef.current = launcher;
    sessionFinalizedRef.current = false;
    setSession({ workspace, source, stepIndex: 0, available });
    trackEvent("workspace_orientation_started", {
      workspace,
      orientation_version: WORKSPACE_ORIENTATION_VERSIONS[workspace],
      source,
      total_steps: available.length,
    });
    return true;
  }, [availableSteps, productTourOpen, workspace]);

  const replay = useCallback((launcher: HTMLElement | null) => { begin("replay", launcher); }, [begin]);

  useEffect(() => {
    setSession(null);
    setUserInteracted(false);
    autoStartAttemptedRef.current = null;
  }, [ownerId, workspace]);

  useEffect(() => {
    const onTourOpen = () => { setProductTourOpen(true); setSession(null); };
    const onTourState = (event: Event) => setProductTourOpen(Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open));
    window.addEventListener(PRODUCT_TOUR_OPEN_EVENT, onTourOpen);
    window.addEventListener(PRODUCT_TOUR_STATE_EVENT, onTourState);
    return () => {
      window.removeEventListener(PRODUCT_TOUR_OPEN_EVENT, onTourOpen);
      window.removeEventListener(PRODUCT_TOUR_STATE_EVENT, onTourState);
    };
  }, []);

  useEffect(() => {
    const onFirstInteraction = (event: Event) => {
      if (session || (event.target instanceof HTMLElement && event.target.closest(`[data-workspace-orientation-ui="true"]`))) return;
      setUserInteracted(true);
    };
    window.addEventListener("pointerdown", onFirstInteraction, { once: true, capture: true });
    window.addEventListener("keydown", onFirstInteraction, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", onFirstInteraction, true);
      window.removeEventListener("keydown", onFirstInteraction, true);
    };
  }, [session, workspace]);

  useEffect(() => {
    if (!autoStart || session) return;
    const readiness = readyRef.current.get(workspace) ?? { ready: false, attentionRequired: false };
    const key = workspaceOrientationStorageKey(ownerId, workspace);
    if (autoStartAttemptedRef.current === key) return;
    const available = availableSteps(workspace);
    const state = readWorkspaceOrientationState(window.localStorage, ownerId, workspace);
    const competingDialog = Boolean(document.querySelector('[role="dialog"]:not([data-workspace-orientation-ui="true"])'));
    const productTourPromptVisible = Boolean(document.querySelector('[data-product-tour-prompt="true"]'));
    if (!shouldAutoStartWorkspaceOrientation({ state, ready: readiness.ready, hasMeaningfulTargets: available.length > 0, attentionRequired: readiness.attentionRequired || blockersRef.current.size > 0 || competingDialog, productTourOpen: productTourOpen || productTourPromptVisible, userInteracted })) return;
    autoStartAttemptedRef.current = key;
    window.requestAnimationFrame(() => begin("automatic"));
  }, [autoStart, availableSteps, begin, ownerId, productTourOpen, registryRevision, session, userInteracted, workspace]);

  useEffect(() => {
    const key = workspaceOrientationStorageKey(ownerId, workspace);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key || !event.newValue) return;
      if (session?.source === "automatic") setSession(null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [ownerId, session?.source, workspace]);

  const activeStep = session?.available[session.stepIndex];
  const activeTarget = activeStep ? targetsRef.current.get(activeStep.target)?.element : null;

  useEffect(() => {
    if (!session || (activeStep && visibleTarget(activeTarget ?? undefined))) return;
    const available = availableSteps(session.workspace);
    if (!available.length) { setSession(null); return; }
    setSession({ ...session, available, stepIndex: Math.min(session.stepIndex, available.length - 1) });
  }, [activeStep, activeTarget, availableSteps, registryRevision, session]);

  useEffect(() => {
    if (!session || !activeStep || !visibleTarget(activeTarget ?? undefined)) {
      if (session && !activeStep) setSession(null);
      return;
    }
    const target = activeTarget!;
    const previousDescribedBy = target.getAttribute("aria-describedby");
    target.dataset.workspaceOrientationActive = "true";
    target.setAttribute("aria-describedby", [previousDescribedBy, descriptionId].filter(Boolean).join(" "));
    const update = () => {
      const isMobile = window.matchMedia("(max-width: 700px)").matches;
      setMobile(isMobile);
      setPosition(isMobile ? {} : anchoredPosition(target));
    };
    update();
    const targetRect = target.getBoundingClientRect();
    const targetNeedsAlignment = targetRect.top < 12 || targetRect.bottom > window.innerHeight - 12;
    if (targetNeedsAlignment) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    }
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const frame = window.requestAnimationFrame(() => primaryActionRef.current?.focus({ preventScroll: true }));
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      delete target.dataset.workspaceOrientationActive;
      if (previousDescribedBy) target.setAttribute("aria-describedby", previousDescribedBy);
      else target.removeAttribute("aria-describedby");
    };
  }, [activeStep, activeTarget, descriptionId, session]);

  const finish = useCallback((outcome: "completed" | "dismissed") => {
    if (!session || sessionFinalizedRef.current) return;
    sessionFinalizedRef.current = true;
    if (session.source === "automatic") writeWorkspaceOrientationState(window.localStorage, ownerId, session.workspace, outcome);
    trackEvent(outcome === "completed" ? "workspace_orientation_completed" : "workspace_orientation_dismissed", {
      workspace: session.workspace,
      orientation_version: WORKSPACE_ORIENTATION_VERSIONS[session.workspace],
      source: session.source,
      total_steps: session.available.length,
      last_step_reached: session.stepIndex + 1,
    });
    const focusTarget = session.source === "replay" ? launcherRef.current : activeTarget;
    if (session.source === "automatic" && focusTarget) {
      const hadTabIndex = focusTarget.hasAttribute("tabindex");
      const previousTabIndex = focusTarget.getAttribute("tabindex");
      if (!hadTabIndex) focusTarget.setAttribute("tabindex", "-1");
      focusTarget.focus({ preventScroll: true });
      if (!hadTabIndex) focusTarget.removeAttribute("tabindex");
      else if (previousTabIndex !== null) focusTarget.setAttribute("tabindex", previousTabIndex);
    }
    setSession(null);
    if (session.source === "replay") window.requestAnimationFrame(() => focusTarget?.focus({ preventScroll: true }));
  }, [activeTarget, ownerId, session]);

  useEffect(() => {
    if (!session || !activeStep) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      finish("dismissed");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeStep, finish, session]);

  useEffect(() => {
    if (!session) return;
    const observer = new MutationObserver(() => {
      const competingDialog = document.querySelector('[role="dialog"]:not([data-workspace-orientation-ui="true"])');
      if (competingDialog) finish("dismissed");
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [finish, session]);

  const next = () => {
    if (!session) return;
    if (session.stepIndex >= session.available.length - 1) { finish("completed"); return; }
    setSession({ ...session, stepIndex: session.stepIndex + 1 });
  };

  const value = useMemo<WorkspaceOrientationContextValue>(() => ({
    registerTarget,
    setReady,
    setBlocked,
    replay,
    canReplay: availableSteps(workspace).length > 0 && blockersRef.current.size === 0 && !productTourOpen,
  }), [availableSteps, registerTarget, replay, setBlocked, setReady, workspace, registryRevision]);

  return <WorkspaceOrientationContext.Provider value={value}>
    <div className={styles.scope}>
      {children}
      {session && activeStep && activeTarget ? <section
      className={`${styles.coachmark} ${mobile ? styles.sheet : styles.popover}`}
      style={position}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-workspace-orientation-ui="true"
      data-presentation={mobile ? "sheet" : "anchored"}
    >
      <div className={styles.heading}>
        <div><p>{activeStep.eyebrow}</p><span aria-live="polite">Step {session.stepIndex + 1} of {session.available.length}</span></div>
        <EasyTButton icon={X} iconOnly size="small" variant="quiet" aria-label="Skip workspace guide" onClick={() => finish("dismissed")}>Skip workspace guide</EasyTButton>
      </div>
      <h2 id={titleId}>{activeStep.title}</h2>
      <p id={descriptionId}>{mobile && activeStep.mobileBody ? activeStep.mobileBody : activeStep.body}</p>
      <div className={styles.actions}>
        {session.stepIndex > 0 ? <EasyTButton icon={ArrowLeft} size="small" variant="secondary" onClick={() => setSession({ ...session, stepIndex: session.stepIndex - 1 })}>Back</EasyTButton> : <EasyTButton size="small" variant="quiet" onClick={() => finish("dismissed")}>Skip</EasyTButton>}
        <EasyTButton ref={primaryActionRef} icon={session.stepIndex === session.available.length - 1 ? Check : ArrowRight} size="small" onClick={next}>{session.stepIndex === session.available.length - 1 ? "Done" : "Next"}</EasyTButton>
      </div>
      </section> : null}
    </div>
  </WorkspaceOrientationContext.Provider>;
}

export function useWorkspaceOrientationTarget(workspace: WorkspaceOrientationWorkspace, target: WorkspaceOrientationTarget): RefCallback<HTMLElement> {
  const context = useContext(WorkspaceOrientationContext);
  const registerTarget = context?.registerTarget;
  return useCallback((element) => registerTarget?.(target, workspace, element), [registerTarget, target, workspace]);
}

export function useWorkspaceOrientationReady(workspace: WorkspaceOrientationWorkspace, ready: boolean, attentionRequired = false) {
  const context = useContext(WorkspaceOrientationContext);
  const setReady = context?.setReady;
  useEffect(() => {
    setReady?.(workspace, { ready, attentionRequired });
    return () => setReady?.(workspace, null);
  }, [attentionRequired, ready, setReady, workspace]);
}

export function useWorkspaceOrientationBlocker(blocked: boolean) {
  const context = useContext(WorkspaceOrientationContext);
  const setBlocked = context?.setBlocked;
  const id = useId();
  useEffect(() => {
    setBlocked?.(id, blocked);
    return () => setBlocked?.(id, false);
  }, [blocked, id, setBlocked]);
}

export function WorkspaceOrientationLauncher() {
  const context = useContext(WorkspaceOrientationContext);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node) || buttonRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, [open]);

  return <div className={styles.launcher} data-workspace-orientation-ui="true">
    <EasyTButton ref={buttonRef} icon={MoreHorizontal} size="small" variant="quiet" aria-haspopup="menu" aria-expanded={open} aria-controls="workspace-more-menu" onClick={() => setOpen((value) => !value)}>More</EasyTButton>
    {open ? <div ref={menuRef} id="workspace-more-menu" role="menu" className={styles.menu}>
      <EasyTButton role="menuitem" size="small" variant="quiet" disabled={!context?.canReplay} onClick={() => { setOpen(false); context?.replay(buttonRef.current); }}>Show me around</EasyTButton>
    </div> : null}
  </div>;
}
