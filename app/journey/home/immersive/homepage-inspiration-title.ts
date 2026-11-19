import type { ImmersiveRoute } from "@/lib/easyt/immersive-homepage-routes";

const spanishCountries: Record<string, string> = {
  Japan: "Japón",
  "South Korea": "Corea del Sur",
  Iceland: "Islandia",
  Vietnam: "Vietnam",
  Cambodia: "Camboya",
  Namibia: "Namibia",
  Peru: "Perú",
  Bolivia: "Bolivia",
  Mexico: "México",
  Guatemala: "Guatemala",
};

export function homepageInspirationTitle(route: Pick<ImmersiveRoute, "key" | "countries" | "title">, es: boolean) {
  if (route.key === "balkans-overland") return es ? "Los Balcanes" : "The Balkans";
  return route.countries.map((country) => es ? (spanishCountries[country] ?? country) : country).join(" + ") || route.title;
}
