"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import styles from "./home-explorer.module.css";

const routes = [
  { place: "Peru · Bolivia", title: ["Andean highlands, gently", "Las alturas andinas, sin prisa"], detail: ["Altitude, big landscapes and a Peru–Bolivia route with time to properly land.", "Altitud, grandes paisajes y una ruta por Perú y Bolivia con tiempo para aterrizar bien."], image: "/journey/peru-sacred-valley-route.jpg", href: "/journey/routes/andean-highlands", tag: ["South America · 12 days", "Sudamérica · 12 días"], bases: "Cusco · Valle Sagrado · Arequipa" },
  { place: "Portugal · Spain", title: ["Iberia by rail and coast", "Iberia entre trenes y costa"], detail: ["Lisbon, Seville and Barcelona with distinct chapters and no frantic moves.", "Lisboa, Sevilla y Barcelona con capítulos distintos y sin correr de un lado a otro."], image: "/journey/portugal-atlantic-route.jpg", href: "/journey/routes/portugal-spain", tag: ["Europe · 16 days", "Europa · 16 días"], bases: "Lisbon · Seville · Barcelona" },
  { place: "Thailand · Vietnam · Cambodia", title: ["Southeast Asia, with room to land", "Sudeste Asiático, con tiempo para llegar"], detail: ["Bangkok, Hoi An and Angkor, with travel days treated as part of the journey.", "Bangkok, Hoi An y Angkor, tratando los días de traslado como parte del viaje."], image: "/journey/hong-kong-central-tram.jpg", href: "/journey/routes/thailand-vietnam-cambodia", tag: ["Asia · 18 days", "Asia · 18 días"], bases: "Bangkok · Hoi An · Siem Reap" },
];

const copy = { en: { eyebrow: "Start with a good idea", title: "Choose a route with a point of view.", featured: "Featured route", bases: "Bases", call: "Your call", editable: "Change any stop, day or suggestion", build: "Build this route", open: "Open route", blank: "Want a completely blank canvas?", scratch: "Start a trip from scratch", browse: "Browse all routes" }, es: { eyebrow: "Empieza con una buena idea", title: "Elige una ruta con una mirada propia.", featured: "Ruta destacada", bases: "Bases", call: "Tú decides", editable: "Cambia cualquier parada, día o sugerencia", build: "Crea esta ruta", open: "Abrir ruta", blank: "¿Quieres empezar con un lienzo totalmente en blanco?", scratch: "Empieza un viaje desde cero", browse: "Ver todas las rutas" } } as const;

export default function InspirationExplorer() {
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  useEffect(() => { setLanguage(languageFromStorage()); const update = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail); window.addEventListener("easyt-language-change", update); return () => window.removeEventListener("easyt-language-change", update); }, []);
  const index = language === "es" ? 1 : 0; const text = copy[language];
  return <section className={styles.explorer} id="routes"><header className={styles.explorerHead}><div><p className={styles.eyebrow}>{text.eyebrow}</p><h2>{text.title}</h2></div><Link className={styles.browseLink} href="/journey/discover">{text.browse} <ArrowRight aria-hidden="true" /></Link></header><div className={styles.routeGrid}>{routes.map((route) => <Link className={styles.routeCard} key={route.place} href={route.href}><div className={styles.routeImage} style={{ backgroundImage: `url(${route.image})` }}><span>{route.tag[index]}</span></div><div><small>{route.place}</small><strong>{route.title[index]}</strong><p>{route.detail[index]}</p><i>{text.open} <ArrowRight aria-hidden="true" /></i></div></Link>)}</div><p className={styles.routeFooter}>{text.blank} <Link href="/journey/new">{text.scratch} <ArrowRight aria-hidden="true" /></Link> · <Link href="/journey/discover">{text.browse} <ArrowRight aria-hidden="true" /></Link></p></section>;
}
