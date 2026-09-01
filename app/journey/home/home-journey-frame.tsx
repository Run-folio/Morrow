import { MapPin } from "lucide-react";
import styles from "./home.module.css";

const scenes = [
  ["japan", "/journey/illustrations/homepage-frame/japan.webp"],
  ["angkor", "/journey/illustrations/homepage-frame/angkor.webp"],
  ["rome", "/journey/illustrations/homepage-frame/rome.webp"],
  ["sydney", "/journey/illustrations/homepage-frame/sydney.webp"],
] as const;

export default function HomeJourneyFrame() {
  return <div className={styles.journeyFrame} aria-hidden="true">
    {scenes.map(([scene, src]) => <img
      alt=""
      className={`${styles.journeyScene} ${styles[`journeyScene${scene[0].toUpperCase()}${scene.slice(1)}`]}`}
      decoding="async"
      height="600"
      key={scene}
      loading={scene === "japan" || scene === "angkor" ? "eager" : "lazy"}
      src={src}
      width="900"
    />)}
    <svg className={styles.journeyRoute} viewBox="0 0 1000 700" fill="none" preserveAspectRatio="none">
      <path d="M 245 196 C 292 270, 180 313, 310 388 S 252 494, 365 566 C 468 614, 535 546, 628 590 S 720 584, 765 574 C 842 515, 690 450, 786 378 S 820 292, 895 210" />
    </svg>
    <span className={`${styles.journeyPin} ${styles.journeyPinJapan}`}><MapPin /></span>
    <span className={`${styles.journeyPin} ${styles.journeyPinAngkor}`}><MapPin /></span>
    <span className={`${styles.journeyPin} ${styles.journeyPinRome}`}><MapPin /></span>
    <span className={`${styles.journeyPin} ${styles.journeyPinSydney}`}><MapPin /></span>
  </div>;
}
