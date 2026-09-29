/** Local, bounded User Timing diagnostics. This is not trip state or analytics. */
export type PlanningMilestone = "submit" | "durable-intake" | "shell-visible" | "first-actionable" | "required-complete" | "route-ready" | "optional-complete";
export type PlanningOutcome = "error" | "abandoned";

type Timeline = { marks: Partial<Record<PlanningMilestone, number>>; last: number; outcome?: PlanningOutcome };
const attempts = new Map<string, Timeline>();
const milestones = new Set<PlanningMilestone>(["submit", "durable-intake", "shell-visible", "first-actionable", "required-complete", "route-ready", "optional-complete"]);
const MAX_ATTEMPTS = 24;

function opaqueAttempt(id: string) {
  return /^[a-zA-Z0-9_-]{8,128}$/.test(id);
}

function timeline(id: string) {
  let existing = attempts.get(id);
  if (!existing) {
    if (attempts.size >= MAX_ATTEMPTS) attempts.delete(attempts.keys().next().value!);
    existing = { marks: {}, last: -Infinity };
    attempts.set(id, existing);
  }
  return existing;
}

export function markPlanningMilestone(attemptId: string, milestone: PlanningMilestone, at = globalThis.performance?.now() ?? Date.now()): void {
  if (!opaqueAttempt(attemptId) || !milestones.has(milestone) || !Number.isFinite(at)) return;
  if (milestone === "submit" && attempts.get(attemptId)?.outcome) {
    attempts.delete(attemptId);
    if (typeof window !== "undefined") {
      for (const stage of [...milestones, "error", "abandoned"]) {
        try { window.performance.clearMarks(`morrovia-planning:${attemptId}:${stage}`); }
        catch { /* Timing diagnostics must never affect planning. */ }
      }
    }
  }
  if (milestone !== "submit" && attempts.get(attemptId)?.marks.submit === undefined) return;
  const current = timeline(attemptId);
  if (current.outcome || current.marks[milestone] !== undefined || at < current.last) return;
  current.marks[milestone] = at;
  current.last = at;
  if (typeof window !== "undefined") {
    try { window.performance.mark(`morrovia-planning:${attemptId}:${milestone}`); }
    catch { /* Timing diagnostics must never affect planning. */ }
  }
}

export function planningAttemptOutcome(attemptId: string, outcome: PlanningOutcome, at = globalThis.performance?.now() ?? Date.now()): void {
  const current = attempts.get(attemptId);
  if (current?.marks.submit === undefined || current.outcome || !Number.isFinite(at) || at < current.last) return;
  current.outcome = outcome;
  current.last = at;
  if (typeof window !== "undefined") {
    try { window.performance.mark(`morrovia-planning:${attemptId}:${outcome}`); }
    catch { /* Local diagnostics only. */ }
  }
}

export function planningAttemptDurations(attemptId: string): Partial<Record<PlanningMilestone, number>> {
  const marks = attempts.get(attemptId)?.marks;
  if (marks?.submit === undefined) return {};
  const elapsed: Partial<Record<PlanningMilestone, number>> = {};
  for (const milestone of milestones) {
    const at = marks[milestone];
    if (at !== undefined) elapsed[milestone] = Math.max(0, Math.round(at - marks.submit));
  }
  return elapsed;
}

export function planningContentIsActionable(input: {
  mode: "stops" | "describe";
  editableCanonicalOccurrences: number;
  selectableClarification: boolean;
  controlsEnabled: boolean;
}): boolean {
  if (!input.controlsEnabled) return false;
  if (input.editableCanonicalOccurrences > 0) return true;
  return input.mode === "describe" && input.selectableClarification;
}

/** Required interpretation is complete when the traveller can act on either
 * a route occurrence or an existing Discovery decision. Route feasibility and
 * the traveller's decisions remain separately measured by route-ready. */
export function planningRequiredInterpretationIsComplete(input: {
  pendingInterpretation: boolean;
  pendingLookup: boolean;
  failedLookup: boolean;
  routeOccurrences: number;
  selectableDiscovery: boolean;
}): boolean {
  return !input.pendingInterpretation && !input.pendingLookup && !input.failedLookup
    && (input.routeOccurrences > 0 || input.selectableDiscovery);
}
