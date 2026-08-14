import EasyTNavigation from "../easyt-navigation";
import TripModeClient from "./trip-mode-client";

export const metadata = { title: "Trip mode · Morrovia" };

export default function TripModePage() {
  return <main><EasyTNavigation current="trips" /><TripModeClient /></main>;
}
