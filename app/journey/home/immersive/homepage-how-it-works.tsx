"use client";

import { ArrowRight, Compass, Luggage, Route } from "lucide-react";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import { PRODUCT_TOUR_OPEN_EVENT } from "@/components/easyt/easyt-product-tour";
import { useHomepageLanguage } from "./use-homepage-language";
import styles from "./immersive.module.css";

const steps = {
  en: [
    { title: "Tell us where.", copy: "Choose destinations or describe the trip you have in mind.", icon: Compass },
    { title: "We build your plan.", copy: "Get a suggested route to review, with places and travel between stops.", icon: Route },
    { title: "Make it yours.", copy: "Refine your route, dates and details as your plans take shape.", icon: Luggage },
  ],
  es: [
    { title: "Dinos adónde.", copy: "Elige destinos o describe el viaje que tienes en mente.", icon: Compass },
    { title: "Creamos tu plan.", copy: "Recibe una ruta sugerida para revisar, con lugares y traslados entre paradas.", icon: Route },
    { title: "Hazlo tuyo.", copy: "Ajusta la ruta, las fechas y los detalles a medida que tus planes toman forma.", icon: Luggage },
  ],
};

export default function HomepageHowItWorks() {
  const language = useHomepageLanguage();
  const es = language === "es";

  return <section id="how-it-works" className={styles.howItWorks} aria-labelledby="homepage-how-heading">
    <header className={styles.howHeading}>
      <div><span className={styles.eyebrow}>{es ? "Cómo funciona" : "How it works"}</span><h2 id="homepage-how-heading">{es ? "De idea a viaje." : "From idea to itinerary."}</h2></div>
      <EasyTButton variant="quiet" icon={ArrowRight} onClick={() => window.dispatchEvent(new Event(PRODUCT_TOUR_OPEN_EVENT))}>{es ? "Ver cómo funciona" : "See how it works"}</EasyTButton>
    </header>
    <ol className={styles.howSteps}>
      {steps[language].map(({ title, copy, icon: Icon }, index) => <li key={title}>
        <span className={styles.howStepIcon}><Icon aria-hidden="true" /></span>
        <span className={styles.howStepNumber}>{String(index + 1).padStart(2, "0")}</span>
        <div><h3>{title}</h3><p>{copy}</p></div>
      </li>)}
    </ol>
  </section>;
}
