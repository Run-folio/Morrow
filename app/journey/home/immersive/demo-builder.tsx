"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Map as MapIcon, Route } from "lucide-react";
import type { ImmersiveRoute } from "@/lib/easyt/immersive-homepage-routes";
import { homepageDemoCanAdjustNight, homepageDemoDate } from "@/lib/easyt/homepage-demo";
import builder from "@/app/journey/new/trip-builder.module.css";
import styles from "./product-demo.module.css";

type Props = {
  route: ImmersiveRoute;
  nights: number[];
  selected: number;
  es: boolean;
  map: React.ReactNode;
  onSelect: (index: number) => void;
  onNight: (index: number, value: number) => void;
};

function dateLabel(value: string, es: boolean) {
  return new Intl.DateTimeFormat(es ? "es" : "en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export default function DemoBuilder({ route, nights, selected, es, map, onSelect, onNight }: Props) {
  const [mapCollapsed, setMapCollapsed] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const total = nights.reduce((sum, value) => sum + value, 0);
  const unknownTransfers = route.stops.slice(0, -1).filter((stop) => !stop.onward?.planningMinutes).length;
  return <div className={styles.builder} aria-label={es ? "Ejemplo del Builder" : "Builder sample"}>
    <section className={styles.tripDetails} aria-label={es ? "Detalles del viaje" : "Trip details"}>
      <dl className={builder.detailsSummary}>
        <div><dt>{es ? "Empieza en" : "Starting from"}</dt><dd>{route.planDraft.origin}</dd></div>
        <div><dt>{es ? "Final del viaje" : "Journey end"}</dt><dd>{route.stops.at(-1)?.name}</dd></div>
        <div><dt>{es ? "Fechas de ejemplo" : "Sample dates"}</dt><dd>{dateLabel(homepageDemoDate(route.key, 1), es)} – {dateLabel(homepageDemoDate(route.key, total + 1), es)}</dd></div>
        <div><dt>{es ? "Viajeros" : "Travellers"}</dt><dd>{es ? "2 viajeros" : "2 travellers"}</dd></div>
      </dl>
    </section>
    <section className={builder.builderRouteWorkspace} aria-label={es ? "Tu ruta" : "Your route"}>
      <header className={builder.builderRouteHeader}>
        <div>
          <p>{es ? "PLAN DE RUTA" : "ROUTE PLAN"}</p>
          <h2>{es ? "Tu ruta" : "Your route"}</h2>
          <span className={builder.builderRouteNightStatus} role="status"><CheckCircle2 aria-hidden="true" /><strong>{total} {es ? "en total" : "total"}</strong><span aria-hidden="true">·</span><b>{es ? "Todas asignadas" : "All allocated"}</b></span>
        </div>
      </header>
      <div className={builder.builderRouteGrid}>
        <section className={builder.builderRouteRows} aria-label={es ? "Paradas de la ruta" : "Route stops"} role="table">
          <div className={builder.builderRouteColumns} role="row"><span role="columnheader">{es ? "Parada" : "Stop"}</span><span role="columnheader">{es ? "Traslado" : "Transfer"}</span><span role="columnheader">{es ? "Noches" : "Nights"}</span><span role="columnheader">{es ? "Tiempo útil" : "Usable time"}</span></div>
          <div role="rowgroup">{route.stops.map((stop, index) => {
            const incoming = index > 0 ? route.stops[index - 1].onward : null;
            const transferMinutes = incoming?.planningMinutes ?? null;
            const transferDays = transferMinutes === null ? null : transferMinutes >= 480 ? 1 : transferMinutes >= 240 ? .5 : transferMinutes >= 120 ? .25 : 0;
            const usable = transferDays === null ? null : Math.max(0, Math.round((nights[index] - transferDays) * 4) / 4);
            return <div key={stop.id} role="row" tabIndex={0} aria-selected={selected === index} className={`${builder.builderRouteRow} ${selected === index ? builder.builderRouteRowSelected : ""} ${styles.demoRouteRow}`} onClick={() => onSelect(index)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(index); } }}>
              <div className={builder.builderRouteIdentity} role="cell"><b>{index + 1}</b><span><strong>{stop.name}</strong><small>{stop.country}</small></span></div>
              <div className={builder.builderRouteTransfer} role="cell"><Route aria-hidden="true" /><span><strong>{incoming ? `${es ? "Desde" : "From"} ${incoming.from} · ${incoming.modeLabel}` : es ? "Empieza aquí" : "Starts here"}</strong><small>{incoming ? (transferMinutes ? incoming.durationLabel : es ? "Tiempo por confirmar" : "Timing to confirm") : es ? "Sin traslado de llegada" : "No arrival transfer"}</small></span></div>
              <div className={builder.builderRouteNights} role="cell"><span className={builder.mobileFieldLabel}>{es ? "Noches" : "Nights"}</span>
                {/* morrovia-ui-audit-allow-next-line native-control -- Compact route-night stepper mirrors the production Builder row control. */}
                <button type="button" aria-label={`${es ? "Quitar una noche de" : "Remove one night from"} ${stop.name}; ${nights[index]}`} disabled={!homepageDemoCanAdjustNight(route, nights, index, -1)} onClick={(event) => { event.stopPropagation(); onNight(index, nights[index] - 1); }}>−</button>
                <strong>{nights[index]}</strong>
                {/* morrovia-ui-audit-allow-next-line native-control -- Compact route-night stepper mirrors the production Builder row control. */}
                <button type="button" aria-label={`${es ? "Añadir una noche a" : "Add one night to"} ${stop.name}; ${nights[index]}`} disabled={!homepageDemoCanAdjustNight(route, nights, index, 1)} onClick={(event) => { event.stopPropagation(); onNight(index, nights[index] + 1); }}>+</button>
              </div>
              <div className={builder.builderRouteUsable} role="cell"><span className={builder.mobileFieldLabel}>{es ? "Tiempo útil" : "Usable time"}</span><strong>{index === 0 ? (es ? "Primer destino" : "First stop") : usable === null ? (es ? "Por confirmar" : "To confirm") : `~${usable} ${es ? (usable === 1 ? "día" : "días") : (usable === 1 ? "day" : "days")}`}</strong>{usable !== null && usable < 1 ? <AlertTriangle aria-label={es ? "Parada ajustada" : "Compressed stop"} /> : null}</div>
            </div>;
          })}</div>
        </section>
        <section className={builder.builderRouteMap} aria-label={es ? "Mapa de la ruta" : "Route map"}>
          {/* morrovia-ui-audit-allow-next-line native-control -- Mobile map disclosure mirrors the production Builder map toggle. */}
          <button type="button" className={builder.builderRouteMapToggle} aria-expanded={!mapCollapsed} onClick={() => setMapCollapsed((current) => !current)}><MapIcon aria-hidden="true" />{mapCollapsed ? (es ? "Mostrar mapa" : "Show map") : (es ? "Ocultar mapa" : "Collapse map")}{mapCollapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}</button>
          <div className={builder.builderRouteMapBody} hidden={mapCollapsed}>{map}</div>
        </section>
      </div>
    </section>
    <section className={builder.timingWarning} aria-label="Route Check">
      {/* morrovia-ui-audit-allow-next-line native-control -- Route Check disclosure uses the production Builder summary treatment. */}
      <button type="button" className={builder.disclosureHead} aria-expanded={checkOpen} onClick={() => setCheckOpen((current) => !current)}><AlertTriangle aria-hidden="true" /><span><strong>Route Check</strong><small>{unknownTransfers ? (es ? `${unknownTransfers} traslados necesitan comprobación.` : `${unknownTransfers} transfers need checking.`) : (es ? "Revisa los traslados antes de viajar." : "Review transfers before travelling.")}</small></span><ChevronRight aria-hidden="true" /></button>
      {checkOpen && <div className={builder.timingWarningContent}><section><strong>{es ? "Qué significa" : "What this means"}</strong><ul><li>{unknownTransfers ? (es ? "Confirma la duración y el modo de los traslados pendientes." : "Confirm the duration and mode of transfers still to check.") : (es ? "Los tiempos de traslado son orientativos." : "Transfer times are planning estimates.")}</li></ul></section></div>}
    </section>
  </div>;
}
