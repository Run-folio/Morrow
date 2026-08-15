"use client";

import Link from "next/link";
import { ArrowRight, Clock3, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import styles from "./home-explorer.module.css";

const routes = [
  { place: "Peru + Bolivia", title: ["Peru + Bolivia", "Perú + Bolivia"], detail: ["High-altitude history, local culture, and otherworldly landscapes.", "Historia de altura, cultura local y paisajes extraordinarios."], href: "/journey/routes/andean-highlands", bases: "Lima → Cusco → La Paz", art: "left", stats: "2–3 stops · 10–14 days" },
  { place: "Spain + Portugal", title: ["Spain + Portugal", "España + Portugal"], detail: ["Timeless cities, coastal escapes, and world-class foodscapes.", "Ciudades atemporales, costas y gastronomía memorable."], href: "/journey/routes/portugal-spain", bases: "Barcelona → Lisbon → Porto", art: "center", stats: "2–3 stops · 10–14 days" },
  { place: "Vietnam + Thailand + Cambodia", title: ["Vietnam + Thailand + Cambodia", "Vietnam + Tailandia + Camboya"], detail: ["Temples, street food, beaches, and slow moments that stay with you.", "Templos, comida callejera, playas y momentos que se quedan contigo."], href: "/journey/routes/thailand-vietnam-cambodia", bases: "Hanoi → Bangkok → Siem Reap", art: "right", stats: "2–4 stops · 14–20 days" },
];

const copy = { en: { eyebrow: "Start with a good idea", title: "Choose a route with a point of view.", featured: "Featured route", bases: "Bases", call: "Your call", editable: "Change any stop, day or suggestion", build: "Build this route", open: "Open route", blank: "Want a completely blank canvas?", scratch: "Start a trip from scratch", browse: "Browse all routes" }, es: { eyebrow: "Empieza con una buena idea", title: "Elige una ruta con una mirada propia.", featured: "Ruta destacada", bases: "Bases", call: "Tú decides", editable: "Cambia cualquier parada, día o sugerencia", build: "Crea esta ruta", open: "Abrir ruta", blank: "¿Quieres empezar con un lienzo totalmente en blanco?", scratch: "Empieza un viaje desde cero", browse: "Ver todas las rutas" } } as const;

export default function InspirationExplorer() {
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  useEffect(() => { setLanguage(languageFromStorage()); const update = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail); window.addEventListener("easyt-language-change", update); return () => window.removeEventListener("easyt-language-change", update); }, []);
  const index = language === "es" ? 1 : 0; const text = copy[language];
  return <section className={styles.explorer} id="routes"><header className={styles.explorerHead}><div><p className={styles.eyebrow}>{language === "es" ? "EXPLORA RUTAS MULTIPAÍS" : "EXPLORE MULTI-COUNTRY ROUTES"}</p><h2>{text.title}</h2></div><Link className={styles.browseLink} href="/journey/discover">{language === "es" ? "Ver todas las rutas" : "View all routes"} <ArrowRight aria-hidden="true" /></Link></header><div className={styles.routeGrid}>{routes.map((route) => <Link className={styles.routeCard} key={route.place} href={route.href}><div className={`${styles.routeImage} ${styles[`art${route.art[0].toUpperCase()}${route.art.slice(1)}`]}`} /><div><strong>{route.title[index]}</strong><span className={styles.routeBases}>{route.bases}</span><span className={styles.routeStats}><MapPin aria-hidden="true" /> {route.stats.split(" · ")[0]} <Clock3 aria-hidden="true" /> {route.stats.split(" · ")[1]}</span><p>{route.detail[index]}</p><i>{language === "es" ? "Explorar ruta" : "Explore route"} <ArrowRight aria-hidden="true" /></i></div></Link>)}</div></section>;
}
