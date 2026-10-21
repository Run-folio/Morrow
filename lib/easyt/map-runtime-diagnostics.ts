import type { MorroviaBasemapSnapshot } from "./map-basemap-lifecycle.ts";

type DiagnosticEnvironment = {
  origin: string;
  search: string;
  nodeEnv: string | undefined;
  buildCommit: string | undefined;
};
type DiagnosticEntry = {
  event: string;
  reason: string | null;
  elapsedMs: number;
  status: string;
  styleLoaded: boolean | null;
  detailedSourcePresent: boolean | null;
  detailedSourceLoaded: boolean | null;
  visibleDetailedLayers: boolean | null;
  errorClass?: string;
};
type ObservableMap = {
  on(type: string, listener: (event: unknown) => void): unknown;
  off(type: string, listener: (event: unknown) => void): unknown;
};

const events = new Set([
  "initial", "fallback-requested", "fallback-style.load", "detailed-style.load",
  "detailed-style.ready", "detailed-sourcedata.ready", "detailed-idle.ready",
  "zoomend", "retry-requested", "map-error", "initialization-error",
  "webglcontextlost", "webglcontextrestored",
]);
const reasons = new Map([
  ["The detailed basemap did not become ready in time.", "deadline"],
  ["The detailed basemap style loaded without a usable source and visible layers.", "style-contract"],
  ["The detailed basemap source or layers disappeared after zooming in.", "zoom-contract"],
  ["The detailed basemap provider could not load its style or tiles.", "provider-resource"],
]);
const errorClasses = new Map([
  ["AbortError", "abort"], ["SecurityError", "security"], ["SyntaxError", "syntax"],
  ["TypeError", "type"], ["RangeError", "range"], ["NetworkError", "network"],
]);
// One module-owned, bounded tab buffer. No persistence, logging or delivery.
const entries: DiagnosticEntry[] = [];
let lastSignature: string | null = null;
const boolean = (value: unknown) => typeof value === "boolean" ? value : null;

export function mapDiagnosticsEnabled(environment: DiagnosticEnvironment) {
  try {
    const optIn = new URLSearchParams(environment.search).get("morroviaMapDiagnostics");
    const origin = new URL(environment.origin);
    if (environment.nodeEnv === "development" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
      && ["http:", "https:"].includes(origin.protocol) && optIn === "1") return true;
    return environment.origin === "https://staging.morrovia.com"
      && /^[a-f0-9]{40}$/.test(environment.buildCommit ?? "")
      && optIn === environment.buildCommit;
  } catch { return false; }
}

/** Inspector access only; returned copies cannot mutate the captured evidence. */
export function readMorroviaMapDiagnostics() {
  return entries.map(entry => ({ ...entry }));
}

function classifyError(value: unknown) {
  try {
    if (!value || typeof value !== "object") return "unknown";
    const nested = (value as { error?: unknown }).error;
    const error = nested && typeof nested === "object" ? nested : value;
    const name = (error as { name?: unknown }).name;
    return typeof name === "string" ? errorClasses.get(name) ?? "unknown" : "unknown";
  } catch { return "unknown"; }
}

export function createMorroviaMapDiagnostics(environment: DiagnosticEnvironment & { now?: () => number }) {
  const enabled = mapDiagnosticsEnabled(environment);
  const now = environment.now ?? (() => performance.now());
  const clock = () => { try { const value = now(); return Number.isFinite(value) ? value : 0; } catch { return 0; } };
  const started = enabled ? clock() : 0;
  const cleanup: Array<() => void> = [];
  let disposed = false;
  if (enabled && typeof window !== "undefined") {
    try {
      Object.defineProperty(window, "__MORROVIA_MAP_DIAGNOSTICS__", {
        configurable: true, get: readMorroviaMapDiagnostics,
      });
    } catch { /* Inspector access must never change map availability. */ }
  }
  const record = (event: string, snapshot?: Partial<MorroviaBasemapSnapshot>, errorClass?: string) => {
    if (!enabled || disposed || !events.has(event)) return;
    try {
      const entry = {
        event,
        reason: snapshot?.reason == null ? null : reasons.get(snapshot.reason) ?? "unknown",
        status: ["loading", "detailed", "fallback"].includes(snapshot?.status ?? "") ? snapshot!.status! : "unknown",
        styleLoaded: boolean(snapshot?.styleLoaded),
        detailedSourcePresent: boolean(snapshot?.detailedSourcePresent),
        detailedSourceLoaded: boolean(snapshot?.detailedSourceLoaded),
        visibleDetailedLayers: typeof snapshot?.visibleDetailedLayerCount === "number" ? snapshot.visibleDetailedLayerCount > 0 : null,
        ...(errorClass ? { errorClass } : {}),
      };
      // Elapsed time is excluded from deduplication, so idle/source storms with
      // identical readiness cannot grow the buffer merely by waiting.
      const signature = JSON.stringify(entry);
      if (signature === lastSignature) return;
      lastSignature = signature;
      entries.push({ ...entry, elapsedMs: Math.round(Math.max(0, Math.min(86_400_000, clock() - started))) });
      while (entries.length > 64 || new TextEncoder().encode(JSON.stringify(entries)).byteLength > 16 * 1024) entries.shift();
    } catch { /* Do not allow diagnostic getters or clocks to break rendering. */ }
  };
  return {
    trace: (event: string, snapshot: MorroviaBasemapSnapshot) => record(event, snapshot),
    error: (event: "map-error" | "initialization-error", value: unknown, snapshot?: MorroviaBasemapSnapshot) => {
      if (!enabled || disposed) return;
      record(event, snapshot, classifyError(value));
    },
    observe(map: ObservableMap, getSnapshot: () => MorroviaBasemapSnapshot) {
      if (!enabled || disposed) return;
      const current = () => { try { return getSnapshot(); } catch { return undefined; } };
      for (const type of ["error", "webglcontextlost", "webglcontextrestored"]) {
        const listener = (value: unknown) => {
          if (disposed) return;
          record(type === "error" ? "map-error" : type, current(), type === "error" ? classifyError(value) : undefined);
        };
        try {
          map.on(type, listener);
          cleanup.push(() => { map.off(type, listener); });
        } catch { /* Observing a diagnostic event is optional. */ }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const remove of cleanup.splice(0)) { try { remove(); } catch { /* Best effort for an already removed map. */ } }
    },
  };
}
