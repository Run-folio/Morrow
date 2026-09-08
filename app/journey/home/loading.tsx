import JourneyLoading from "../loading";

export default function HomeLoading() {
  // The shell’s direct-main rule intentionally removes minimum height. Keep
  // the loader’s viewport reservation so the footer cannot flash above the
  // streamed immersive page and eagerly prefetch unrelated bundles.
  return <div><JourneyLoading /></div>;
}
