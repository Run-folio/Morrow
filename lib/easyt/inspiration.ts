export type InspirationStop = {
  id: string;
  name: string;
  country: string;
  coordinates: [number, number];
};

export type InspirationSeed = {
  key: string;
  title: string;
  origin: string;
  originCoordinates: [number, number];
  stops: InspirationStop[];
  budget: "value" | "mid" | "high";
};

/**
 * Editorial prompts are intentionally light. They give the builder a useful
 * first route, while leaving the traveller in control of dates, places and pace.
 */
export const inspirationSeeds: InspirationSeed[] = [
  {
    key: "guatemala-slow",
    title: "A slower Guatemala",
    origin: "Guatemala City",
    originCoordinates: [-90.5069, 14.6349],
    stops: [
      { id: "seed-antigua", name: "Antigua Guatemala", country: "Guatemala", coordinates: [-90.734, 14.5586] },
      { id: "seed-atitlan", name: "Lake Atitlán", country: "Guatemala", coordinates: [-91.185, 14.69] },
      { id: "seed-flores", name: "Flores", country: "Guatemala", coordinates: [-89.9, 16.93] },
    ],
    budget: "mid",
  },
  {
    key: "japan-slow",
    title: "Japan, one good day at a time",
    origin: "Tokyo",
    originCoordinates: [139.6917, 35.6895],
    stops: [
      { id: "seed-tokyo", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895] },
      { id: "seed-takayama", name: "Takayama", country: "Japan", coordinates: [137.2523, 36.146] },
      { id: "seed-kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] },
    ],
    budget: "mid",
  },
  {
    key: "mountain-route",
    title: "The mountain route",
    origin: "Tokyo",
    originCoordinates: [139.6917, 35.6895],
    stops: [
      { id: "seed-takao", name: "Mount Takao", country: "Japan", coordinates: [139.273, 35.625] },
      { id: "seed-takayama-mountain", name: "Takayama", country: "Japan", coordinates: [137.2523, 36.146] },
      { id: "seed-hirayu", name: "Hirayu Onsen", country: "Japan", coordinates: [137.551, 36.197] },
    ],
    budget: "mid",
  },
  {
    key: "food-first",
    title: "A food-first Mexico",
    origin: "Mexico City",
    originCoordinates: [-99.1332, 19.4326],
    stops: [
      { id: "seed-mexico-city", name: "Mexico City", country: "Mexico", coordinates: [-99.1332, 19.4326] },
      { id: "seed-oaxaca", name: "Oaxaca", country: "Mexico", coordinates: [-96.7266, 17.0732] },
    ],
    budget: "mid",
  },
  {
    key: "nature-reset",
    title: "A proper nature reset",
    origin: "San José",
    originCoordinates: [-84.0907, 9.9281],
    stops: [
      { id: "seed-arenal", name: "La Fortuna", country: "Costa Rica", coordinates: [-84.6453, 10.471] },
      { id: "seed-monteverde", name: "Monteverde", country: "Costa Rica", coordinates: [-84.826, 10.3] },
    ],
    budget: "mid",
  },
  {
    key: "portugal-coast",
    title: "Lisbon to the Atlantic",
    origin: "Lisbon",
    originCoordinates: [-9.1393, 38.7223],
    stops: [
      { id: "seed-lisbon", name: "Lisbon", country: "Portugal", coordinates: [-9.1393, 38.7223] },
      { id: "seed-alentejo", name: "Comporta", country: "Portugal", coordinates: [-8.79, 38.38] },
      { id: "seed-lagos", name: "Lagos", country: "Portugal", coordinates: [-8.6742, 37.1028] },
    ],
    budget: "mid",
  },
  {
    key: "morocco-colour",
    title: "Morocco in colour",
    origin: "Marrakech",
    originCoordinates: [-7.9811, 31.6295],
    stops: [
      { id: "seed-marrakech", name: "Marrakech", country: "Morocco", coordinates: [-7.9811, 31.6295] },
      { id: "seed-atlas", name: "Imlil", country: "Morocco", coordinates: [-8.079, 31.136] },
      { id: "seed-essaouira", name: "Essaouira", country: "Morocco", coordinates: [-9.769, 31.508] },
    ],
    budget: "value",
  },
  {
    key: "andean-highlands",
    title: "Andean highlands, gently",
    origin: "Cusco",
    originCoordinates: [-71.9785, -13.517],
    stops: [
      { id: "seed-cusco", name: "Cusco", country: "Peru", coordinates: [-71.9785, -13.517] },
      { id: "seed-sacred-valley", name: "Sacred Valley", country: "Peru", coordinates: [-72.115, -13.308] },
      { id: "seed-arequipa", name: "Arequipa", country: "Peru", coordinates: [-71.5375, -16.409] },
    ],
    budget: "mid",
  },
  {
    key: "mediterranean-rail",
    title: "Mediterranean by rail",
    origin: "Barcelona",
    originCoordinates: [2.1734, 41.3851],
    stops: [
      { id: "seed-barcelona", name: "Barcelona", country: "Spain", coordinates: [2.1734, 41.3851] },
      { id: "seed-valencia", name: "Valencia", country: "Spain", coordinates: [-0.3763, 39.4699] },
      { id: "seed-granada", name: "Granada", country: "Spain", coordinates: [-3.5986, 37.1773] },
    ],
    budget: "mid",
  },
  {
    key: "northern-vietnam",
    title: "Northern Vietnam, with space",
    origin: "Hanoi",
    originCoordinates: [105.8342, 21.0278],
    stops: [
      { id: "seed-hanoi", name: "Hanoi", country: "Vietnam", coordinates: [105.8342, 21.0278] },
      { id: "seed-ninh-binh", name: "Ninh Bình", country: "Vietnam", coordinates: [105.9745, 20.2506] },
      { id: "seed-sapa", name: "Sapa", country: "Vietnam", coordinates: [103.872, 22.336] },
    ],
    budget: "value",
  },
  {
    key: "south-korea-slow",
    title: "South Korea beyond Seoul",
    origin: "Seoul",
    originCoordinates: [126.978, 37.5665],
    stops: [
      { id: "seed-seoul", name: "Seoul", country: "South Korea", coordinates: [126.978, 37.5665] },
      { id: "seed-gyeongju", name: "Gyeongju", country: "South Korea", coordinates: [129.2247, 35.8562] },
      { id: "seed-busan", name: "Busan", country: "South Korea", coordinates: [129.0756, 35.1796] },
    ],
    budget: "mid",
  },
  {
    key: "taiwan-rail",
    title: "Taiwan by train",
    origin: "Taipei",
    originCoordinates: [121.5654, 25.033],
    stops: [
      { id: "seed-taipei", name: "Taipei", country: "Taiwan", coordinates: [121.5654, 25.033] },
      { id: "seed-taichung", name: "Taichung", country: "Taiwan", coordinates: [120.6736, 24.1477] },
      { id: "seed-tainan", name: "Tainan", country: "Taiwan", coordinates: [120.227, 22.9997] },
    ],
    budget: "value",
  },
  {
    key: "colombia-colour",
    title: "Colombia, city to coffee hills",
    origin: "Bogotá",
    originCoordinates: [-74.0721, 4.711],
    stops: [
      { id: "seed-bogota", name: "Bogotá", country: "Colombia", coordinates: [-74.0721, 4.711] },
      { id: "seed-medellin", name: "Medellín", country: "Colombia", coordinates: [-75.5812, 6.2442] },
      { id: "seed-salento", name: "Salento", country: "Colombia", coordinates: [-75.57, 4.637] },
    ],
    budget: "mid",
  },
  {
    key: "patagonia-edges",
    title: "Patagonia at the edges",
    origin: "Santiago",
    originCoordinates: [-70.6693, -33.4489],
    stops: [
      { id: "seed-santiago", name: "Santiago", country: "Chile", coordinates: [-70.6693, -33.4489] },
      { id: "seed-puerto-natales", name: "Puerto Natales", country: "Chile", coordinates: [-72.506, -51.729] },
      { id: "seed-el-calafate", name: "El Calafate", country: "Argentina", coordinates: [-72.276, -50.337] },
    ],
    budget: "high",
  },
  {
    key: "italy-table",
    title: "Italy between tables",
    origin: "Bologna",
    originCoordinates: [11.3426, 44.4949],
    stops: [
      { id: "seed-bologna", name: "Bologna", country: "Italy", coordinates: [11.3426, 44.4949] },
      { id: "seed-florence", name: "Florence", country: "Italy", coordinates: [11.2558, 43.7696] },
      { id: "seed-rome", name: "Rome", country: "Italy", coordinates: [12.4964, 41.9028] },
    ],
    budget: "mid",
  },
];

const catalogSeeds: InspirationSeed[] = routeFamilies
  .filter((route) => !inspirationSeeds.some((seed) => seed.key === route.key))
  .map((route) => ({
    key: route.key,
    title: route.title,
    origin: route.stops[0]?.name ?? route.bases[0] ?? "",
    originCoordinates: route.stops[0]?.coordinates ?? [0, 0],
    stops: route.stops.map((stop, index) => ({
      id: `catalog-${route.key}-${index}`,
      name: stop.name,
      country: stop.country,
      coordinates: stop.coordinates,
    })),
    budget: "mid",
  }));

export const inspirationByKey = Object.fromEntries(
  [...inspirationSeeds, ...catalogSeeds].map((seed) => [seed.key, seed]),
);
import { routeFamilies } from "./route-catalog.ts";
