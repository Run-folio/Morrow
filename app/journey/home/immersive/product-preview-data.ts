/** Fixed illustrative sample. Never a saved trip or input to the real planner.
 * Rail estimates are snapshots of existing planning allowances, corroborated by reviewed intercity-network
 * evidence, validated against its owner in homepage-preview-data.test.ts.
 * Generalized door-to-door allowances, not schedules or availability.
 */
export const previewStops = [
  { id: "tokyo", name: "Tokyo", coordinates: [139.6917, 35.6895] as [number, number], nights: 4, image: "place-tokyo-384.webp" },
  { id: "kanazawa", name: "Kanazawa", coordinates: [136.6562, 36.5613] as [number, number], nights: 2, image: "place-kanazawa-768.webp" },
  { id: "kyoto", name: "Kyoto", coordinates: [135.7681, 35.0116] as [number, number], nights: 4, image: "place-kyoto-768.webp" },
  { id: "osaka", name: "Osaka", coordinates: [135.5023, 34.6937] as [number, number], nights: 2, image: "place-osaka-384.webp" },
] as const;
export const previewConnections = [
  { from: "tokyo", to: "kanazawa", mode: "train", minutes: 190, source: "planner:legacy-connection-allowances-v1" },
  { from: "kanazawa", to: "kyoto", mode: "train", minutes: 120, source: "morrovia:reviewed-intercity-rail-networks-v1" },
  // Published Japan route supports rail, but supplies no qualified timing.
  { from: "kyoto", to: "osaka", mode: "train", minutes: null, source: "JR West network" },
] as const;
