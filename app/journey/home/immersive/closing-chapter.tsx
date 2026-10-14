"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import MorroviaFooter from "@/components/morrovia-footer";
import { beginNewTripNavigation, loadRememberedOwner } from "@/lib/easyt/storage";
import { useHomepageLanguage } from "./use-homepage-language";
import styles from "./immersive.module.css";
import { useNewTripNavigationScope } from "../../use-new-trip-navigation-scope";

export default function ClosingChapter() {
  const es = useHomepageLanguage() === "es";
  const [ownerId,setOwnerId]=useState<string|null>(null);
  const [addressReady,setAddressReady]=useState(false);
  useEffect(()=>{let active=true;void loadRememberedOwner().then(owner=>{if(active){setOwnerId(owner);setAddressReady(true);}});return()=>{active=false;};},[]);
  const newTripNavigation = useNewTripNavigationScope(()=>ownerId, "new");
  return <section id="closing" className={styles.closing}>
    <img src="/journey/immersive/closing-1536.webp" srcSet="/journey/immersive/closing-480.webp 480w, /journey/immersive/closing-768.webp 768w, /journey/immersive/closing-1536.webp 1536w" sizes="100vw" width={1536} height={1024} loading="lazy" decoding="async" alt="" />
    <div className={styles.closingContent}><span className={styles.eyebrow}>{es ? "Lo mejor está por venir." : "The best part is still ahead."}</span><h2>{es ? "Ve a un lugar" : "Go somewhere"}<em>{es ? "que se quede contigo." : "that stays with you."}</em></h2><EasyTButton icon={ArrowUpRight} onClick={async (event) => {
      event.preventDefault();
      if(!addressReady)return;
      const request = newTripNavigation.start();
      if (!request) return;
      try {
        if (await beginNewTripNavigation(request.ownerId, window, request.isCurrent) !== true || !request.isCurrent()) return;
        window.location.assign("/journey/new");
      } catch {
        // Keep the current page available when preservation refuses.
      } finally {
        request.finish();
      }
    }}>{es ? "Planificar mi viaje" : "Plan my trip"}</EasyTButton></div>
    <div className={styles.closingFoot}><a href="/journey/immersive/credits.html">{es ? "Créditos de imágenes" : "Image credits"}</a></div>
    <MorroviaFooter overImage />
  </section>;
}
