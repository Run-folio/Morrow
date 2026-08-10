"use client";

import { BedDouble, ChevronDown, LocateFixed, Utensils } from "lucide-react";
import { useState } from "react";
import type { JourneyCalendarDay, JourneyRestaurant, RestaurantMeal } from "@/lib/journey";
import { JourneyLocalFinder } from "./journey-local-finder";
import styles from "./mobile-trip-companion.module.css";

export function MobileTripCompanion({ day, city, country, coordinates, onRestaurantSelect, onSavePlace }: {
  day: JourneyCalendarDay;
  city: string;
  country: string;
  coordinates: [number, number];
  onRestaurantSelect?: (restaurant?: JourneyRestaurant, meal?: RestaurantMeal) => void;
  onSavePlace?: (place: { name: string; coordinates: [number, number] }, kind: "restaurant" | "stay") => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"today" | "eat" | "stay">("today");
  return <aside className={`${styles.shell} ${open ? styles.open : ""}`} aria-label="Today on your trip">
    <button type="button" className={styles.handle} onClick={() => setOpen((value) => !value)} aria-expanded={open}><span /><span /><span /></button>
    <div className={styles.head}><div><small>{day.date} · {day.label}</small><strong>{day.title}</strong><span>{city}</span></div><button type="button" onClick={() => setOpen((value) => !value)}>{open ? "Close" : "Today"}<ChevronDown /></button></div>
    <div className={styles.tabs}><button type="button" className={mode === "today" ? styles.active : ""} onClick={() => { setMode("today"); setOpen(true); }}>Plan</button><button type="button" className={mode === "eat" ? styles.active : ""} onClick={() => { setMode("eat"); setOpen(true); }}><Utensils /> Eat nearby</button><button type="button" className={mode === "stay" ? styles.active : ""} onClick={() => { setMode("stay"); setOpen(true); }}><BedDouble /> Find a stay</button></div>
    {open && mode === "today" && <div className={styles.plan}><p>{day.travel ? `${day.travel.duration} · ${day.travel.detail}` : "A lighter day — keep room for what you find."}</p><ol>{day.items.slice(0, 4).map((item, index) => <li key={`${item}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b>{item}</li>)}</ol><button type="button" onClick={() => setMode("eat")}><LocateFixed /> Find something nearby</button></div>}
    {open && mode === "eat" && <JourneyLocalFinder kind="restaurant" city={city} country={country} dayId={day.id} coordinates={coordinates} onRestaurantSelect={onRestaurantSelect} onSavePlace={onSavePlace} />}
    {open && mode === "stay" && <JourneyLocalFinder kind="stay" city={city} country={country} dayId={day.id} coordinates={coordinates} onSavePlace={onSavePlace} />}
  </aside>;
}
