import type { DiscoveryTransport } from "@/lib/easyt/route-discovery";
import styles from "./route-transport-pill.module.css";

const tones = { "Rail-focused": styles.rail, "By road": styles.road, "Mixed transport": styles.mixed };
/** One non-interactive transport summary across catalogue, preview and editorial. */
export default function RouteTransportPill({ transport }: { transport: DiscoveryTransport | null }) {
  return transport ? <span className={`${styles.pill} ${tones[transport]}`}>{transport}</span> : null;
}
