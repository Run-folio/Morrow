import EasyTNavigation from "../easyt-navigation";
import TripModeClient from "./trip-mode-client";

export const metadata = { title: "Trip mode" };

export default function TripModePage() {
  return <main><EasyTNavigation current="trips" /><TripModeClient /></main>;
}
