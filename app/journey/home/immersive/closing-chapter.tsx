"use client";

import { ArrowUpRight } from "lucide-react";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import { useHomepageLanguage } from "./use-homepage-language";
import styles from "./immersive.module.css";

export default function ClosingChapter() {
  const es = useHomepageLanguage() === "es";
  return <section id="closing" className={styles.closing}>
    <img src="/journey/immersive/closing-1536.webp" srcSet="/journey/immersive/closing-480.webp 480w, /journey/immersive/closing-768.webp 768w, /journey/immersive/closing-1536.webp 1536w" sizes="100vw" width={1536} height={1024} loading="lazy" decoding="async" alt="" />
    <div className={styles.closingContent}><span className={styles.eyebrow}>{es ? "Lo mejor está por venir." : "The best part is still ahead."}</span><h2>{es ? "Ve a un lugar" : "Go somewhere"}<em>{es ? "que se quede contigo." : "that stays with you."}</em></h2><EasyTButton icon={ArrowUpRight} onClick={() => {
      // Focus the existing form immediately; no delayed focus steal after a
      // smooth-scroll timer, and no second submission path.
      const prompt = document.querySelector<HTMLTextAreaElement>("#start-building textarea");
      prompt?.focus({ preventScroll: true });
      prompt?.scrollIntoView({ block: "center", behavior: "instant" });
    }}>{es ? "Planificar mi viaje" : "Plan my trip"}</EasyTButton></div>
    <div className={styles.closingFoot}><span>{es ? "Viajes complejos, hechos sencillos." : "Complex trips, made simple."}</span><a href="/journey/immersive/credits.html">{es ? "Créditos de imágenes" : "Image credits"}</a></div>
  </section>;
}
