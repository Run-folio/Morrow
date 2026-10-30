import type { PostHogConfig } from "posthog-js";

/** A build must explicitly opt in, on one exact canonical production origin. */
export function sessionReplayAllowed() {
  if (typeof window === "undefined"
    || process.env.NODE_ENV !== "production"
    || process.env.NEXT_PUBLIC_ANALYTICS_ENVIRONMENT !== "production"
    || process.env.NEXT_PUBLIC_POSTHOG_REPLAY_ENABLED !== "true") return false;
  const origin = process.env.NEXT_PUBLIC_POSTHOG_REPLAY_ORIGIN;
  return (origin === "https://morrovia.com" || origin === "https://www.morrovia.com")
    && window.location.origin === origin;
}

/** Mask by default, including new private UI that has not been individually tagged. */
export const privateSessionRecording: NonNullable<PostHogConfig["session_recording"]> = {
  maskAllInputs: true,
  maskTextSelector: "*",
  maskAllElementAttributes: true,
  // Styles/CSSOM can contain private strings or URLs that text masking skips.
  blockSelector: "head, style, link, img, picture, svg, canvas, video, audio, iframe, object, embed, script, [data-replay-private], .ph-no-capture",
  captureCanvas: { recordCanvas: false },
  recordCrossOriginIframes: false,
  collectFonts: false,
  inlineStylesheet: false,
  // Excludes scripts/JSON-LD, comments and head metadata as well as media above.
  slimDOMOptions: "all",
  recordHeaders: false,
  recordBody: false,
  // Also excludes request URLs and private query strings from network recordings.
  maskNetworkRequestFn: () => null,
  // Keep rrweb JSON inspectable at before_send; HTTP transport compression stays on.
  compress_events: false,
};

// rrweb's public event protocol: FullSnapshot=2, IncrementalSnapshot=3, Meta=4.
// Sources: mutation, pointer/interaction, scroll, resize, input, touch, drag,
// selection. Exclude CSSOM, canvas, fonts, logs, plugins/custom and new schemas.
// https://github.com/rrweb-io/rrweb/blob/main/packages/types/src/index.ts
const interactionSources = new Set([0, 1, 2, 3, 4, 5, 6, 12, 14]);

export function privateReplaySnapshots(value: unknown, pageUrl: string): unknown[] | null {
  if (!Array.isArray(value)) return null;
  const safe: unknown[] = [];
  for (const snapshot of value) {
    if (!snapshot || typeof snapshot !== "object" || typeof snapshot.timestamp !== "number") continue;
    const data = snapshot.data;
    if (!data || typeof data !== "object") continue;
    if (snapshot.type === 2 && data.node && typeof data.node === "object") safe.push(snapshot);
    else if (snapshot.type === 3 && interactionSources.has(data.source)) safe.push(snapshot);
    else if (snapshot.type === 4) safe.push({ ...snapshot, data: { ...data, href: pageUrl } });
  }
  return safe.length ? safe : null;
}
