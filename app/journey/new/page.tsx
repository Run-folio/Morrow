import { Suspense } from "react";
import EasyTNavigation from "../easyt-navigation";
import TripBuilder from "./trip-builder";
import styles from "./new-trip.module.css";

export default function NewTripPage() {
  return (
    <main className={`${styles.page} morrovia-editorial-page`}>
      <EasyTNavigation current="new" />
      <Suspense fallback={<div role="status" aria-busy="true">Opening your trip…</div>}>
        <TripBuilder />
      </Suspense>
    </main>
  );
}
