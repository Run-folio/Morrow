"use client";

import { MountainScene } from "@/components/mountain-scene";
import EasyTNavigation from "../easyt-navigation";
import TripBuilder from "./trip-builder";
import styles from "./new-trip.module.css";

export default function NewTripPage() {
  return (
    <main className={styles.page}>
      <MountainScene />
      <EasyTNavigation current="new" showBack={false} />

      <section className={styles.intro}>
        <p className={styles.eyebrow}>TAKE THE LEAP</p>
        <h1>Build your trip.</h1>
      </section>

      <TripBuilder />
    </main>
  );
}
