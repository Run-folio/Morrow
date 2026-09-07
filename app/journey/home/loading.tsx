import JourneyLoading from "../loading";
import { immersiveHomepageEnabled } from "@/lib/easyt/immersive-homepage-config";

export default function HomeLoading() {
  // The shell’s direct-main rule intentionally removes minimum height. Keep
  // the existing loader’s viewport reservation so the footer cannot flash
  // above the streamed immersive page and eagerly prefetch unrelated bundles.
  if (immersiveHomepageEnabled(process.env.IMMERSIVE_HOMEPAGE_V2)) {
    return <div><JourneyLoading /></div>;
  }
  return <JourneyLoading />;
}
