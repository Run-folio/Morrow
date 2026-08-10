import type { EasyTTrip } from "./trip";

const ascii = (value: string) => value.normalize("NFKD").replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();
const escapePdf = (value: string) => ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

function wrap(value: string, width = 88) {
  const words = ascii(value).split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!word) continue;
    if ((current + (current ? " " : "") + word).length > width && current) {
      lines.push(current);
      current = word;
    } else current += `${current ? " " : ""}${word}`;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function tripLines(trip: EasyTTrip) {
  const lines = [
    trip.title,
    `${trip.startDate} - ${trip.endDate} | ${trip.travellers} traveller${trip.travellers === 1 ? "" : "s"} | ${trip.brief.pace} pace | ${trip.currency}`,
    `Generated ${new Date().toISOString().slice(0, 10)} | Last updated ${trip.updatedAt.slice(0, 10)}`,
    "",
    "ROUTE OVERVIEW",
    `Origin: ${trip.brief.origin}`,
    ...trip.stops.map((stop, index) => `${index + 1}. ${stop.name}, ${stop.country} - ${stop.nights ?? 0} night${stop.nights === 1 ? "" : "s"}`),
    "",
    "TRAVEL LEGS",
    ...trip.legs.map((leg) => {
      const from = trip.stops.find((stop) => stop.id === leg.fromStopId)?.name ?? "Origin";
      const to = trip.stops.find((stop) => stop.id === leg.toStopId)?.name ?? "Next stop";
      const duration = leg.durationMinutes === null ? "confirm duration" : `${Math.floor(leg.durationMinutes / 60)}h ${leg.durationMinutes % 60}m`;
      return `${from} -> ${to} | ${leg.mode} | ${duration}${leg.distanceKm ? ` | ${leg.distanceKm.toLocaleString()} km` : ""}`;
    }),
    "",
    "PLAN REVIEW",
    ...(trip.recommendations.length ? trip.recommendations.map((item) => `[${item.status.toUpperCase()}] ${item.severity}: ${item.message}`) : ["No saved review signals."]),
    "",
    "DAY-BY-DAY ITINERARY",
  ];
  for (const item of [...trip.planItems].sort((a, b) => a.dayNumber - b.dayNumber)) {
    lines.push(`Day ${item.dayNumber} | ${item.date} | ${item.title}`);
    for (const note of item.notes) lines.push(`  - ${note}`);
    if (item.reason) lines.push(`  ${item.reason}`);
    lines.push("");
  }
  return lines.flatMap((line) => wrap(line));
}

export function createTripPdf(trip: EasyTTrip): Uint8Array {
  const lines = tripLines(trip);
  const pages: string[][] = [];
  const perPage = 46;
  let current: string[] = [];
  for (const line of lines) {
    if (/^Day \d+ \|/.test(line) && current.length > perPage - 5) {
      pages.push(current);
      current = [];
    }
    if (current.length >= perPage) {
      pages.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length) pages.push(current);
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  const pageIds: number[] = [];
  pages.forEach((page, pageIndex) => {
    const content = ["BT", "/F1 16 Tf", "50 790 Td", `(${escapePdf(page[0] ?? trip.title)}) Tj`, "/F1 9 Tf", "0 -25 Td", ...page.slice(1).flatMap((line) => [`(${escapePdf(line)}) Tj`, "0 -14 Td"]), `0 -8 Td (Page ${pageIndex + 1} of ${pages.length}) Tj`, "ET"].join("\n");
    const contentId = objects.length;
    objects[contentId] = `<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}\nendstream`;
    const pageId = objects.length;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    pageIds.push(pageId);
  });
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, "binary");
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, "binary"));
}
