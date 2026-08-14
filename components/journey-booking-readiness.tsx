"use client";

import { ArrowUpRight, BedDouble, CarFront, Landmark, Plane, Smartphone, TrainFront } from "lucide-react";
import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import type { BookingReadinessAction } from "@/lib/easyt/booking-readiness";
import type { EasyTTrip } from "@/lib/easyt/trip";
import styles from "./journey-booking-readiness.module.css";

const iconFor = (category: BookingReadinessAction["category"]) => ({
  accommodation: BedDouble, flight: Plane, activity: Landmark, "car-rental": CarFront, connectivity: Smartphone, "ground-transport": TrainFront,
})[category];

export function JourneyBookingReadiness({ trip, language = "en" }: { trip: EasyTTrip; language?: "en" | "es" }) {
  const [actions, setActions] = useState<BookingReadinessAction[]>([]);
  useEffect(() => {
    let active = true;
    void fetch("/api/journey-booking-readiness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trip }) })
      .then(async (response) => response.ok ? response.json() as Promise<{ actions?: BookingReadinessAction[] }> : { actions: [] })
      .then((payload) => { if (active) setActions(payload.actions ?? []); })
      .catch(() => { if (active) setActions([]); });
    return () => { active = false; };
  }, [trip]);

  if (!actions.length) return null;
  const labels = language === "es"
    ? { eyebrow: "LISTO PARA RESERVAR", title: "Completa el viaje, decisión a decisión.", intro: "Estas acciones utilizan las fechas y lugares estables de tu plan. Los precios y la disponibilidad se confirman siempre con el proveedor.", partner: "Enlace de socio", disclosure: "Algunos enlaces son enlaces de afiliado. Morrovia puede recibir una comisión sin coste adicional para ti." }
    : { eyebrow: "BOOKING READINESS", title: "Complete the trip, one decision at a time.", intro: "These actions use stable dates and places from your plan. Prices and availability are always confirmed by the provider.", partner: "Partner link", disclosure: "Some links are affiliate links. Morrovia may earn a commission at no extra cost to you." };
  return <section className={styles.panel} aria-labelledby="booking-readiness-title">
    <header><div><p>{labels.eyebrow}</p><h2 id="booking-readiness-title">{labels.title}</h2><span>{labels.intro}</span></div><BedDouble aria-hidden="true" /></header>
    <div className={styles.groups}>{actions.map((action) => {
      const Icon = iconFor(action.category);
      return <article key={action.id}><Icon aria-hidden="true" /><div><small>{action.category.replace("-", " ")}{action.affiliate ? ` · ${labels.partner}` : ""}</small><h3>{action.title}</h3><p>{action.detail}</p><a href={action.href} target="_blank" rel={action.affiliate ? "noreferrer sponsored" : "noreferrer"} onClick={() => { if (action.affiliate) trackEvent("affiliate_click", { category: action.category, provider: action.provider, trip_id: action.tripId, stop_id: action.stopId }); }}>{action.cta}<ArrowUpRight /></a></div></article>;
    })}</div>
    {actions.some((action) => action.affiliate) ? <p className={styles.disclosure}>{labels.disclosure}</p> : null}
  </section>;
}
