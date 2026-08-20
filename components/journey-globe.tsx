"use client";

import { geoGraticule10, geoInterpolate, geoMercator, geoNaturalEarth1, geoPath } from "d3-geo";
import { BusFront, ExternalLink, MapPin, Minus, Plane, Plus, Scan, TrainFront, Utensils, X } from "lucide-react";
import { feature } from "topojson-client";
import worldTopology from "world-atlas/countries-50m.json";
import { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { JourneyImage, JourneyLeg, JourneyRestaurant, JourneyStop, RestaurantMeal } from "@/lib/journey";
import type { PlannerMapPin } from "@/lib/easyt/trip";

const width = 1440;
const height = 760;
const minZoom = 1.08;
const maxZoom = 72;
const topology = worldTopology as unknown as { objects: { countries: object } };
const countries = feature(topology as never, topology.objects.countries as never) as unknown as { features: Array<{ id?: string | number; properties?: { name?: string } }> };
const land = countries as never;

type View = { x: number; y: number; scale: number };
export type JourneyMapPlace = {
  name: string;
  coordinates: [number, number];
  address?: string;
  kind?: "stay" | "visit";
  label?: [number, number];
  anchor?: "start" | "end";
  aliases?: string[];
  image?: JourneyImage;
  imageOffset?: [number, number];
  summary?: string;
};
type Place = JourneyMapPlace;

const places: Record<string, Place[]> = {
  guatemala: [{ name: "Guatemala City", coordinates: [-90.5069, 14.6349], kind: "stay" }],
  "los-angeles-out": [{ name: "LAX", coordinates: [-118.4085, 33.9416], kind: "visit" }],
  tokyo: [
    { name: "Ginza", coordinates: [139.7671, 35.6717], address: "Ginza, Chuo City, Tokyo, Japan", kind: "stay", label: [28, 28], aliases: ["check into ginza", "ginza"], image: { src: "/journey/tokyo.jpg", alt: "Tokyo skyline", caption: "Ginza base", sourceUrl: "https://en.wikipedia.org/wiki/Ginza" }, imageOffset: [34, 36], summary: "Your Tokyo base keeps the arrival days compact and gives direct rail access across the city." },
    { name: "Imperial Palace Loop", coordinates: [139.7528, 35.6852], address: "1-1 Chiyoda, Chiyoda City, Tokyo, Japan", label: [-25, -23], anchor: "end", aliases: ["easy shakeout run", "keep sightseeing local", "short run only"], image: { src: "/journey/imperial-palace-run.jpg", alt: "Waterside running route around the Imperial Palace", caption: "Shakeout route", sourceUrl: "https://en.wikipedia.org/wiki/Tokyo_Imperial_Palace" }, imageOffset: [-132, -103], summary: "A convenient central loop for an easy shakeout run without turning the taper days into major sightseeing missions." },
    { name: "Tokyo Marathon Expo", coordinates: [139.7958, 35.6298], address: "Tokyo Big Sight, 3-11-1 Ariake, Koto City, Tokyo, Japan", label: [70, 60], aliases: ["collect the race pack", "race pack", "race kit and fuel"], image: { src: "/journey/tokyo-big-sight.jpg", alt: "Tokyo Big Sight exhibition centre", caption: "Race expo", sourceUrl: "https://en.wikipedia.org/wiki/Tokyo_Big_Sight" }, imageOffset: [38, 40], summary: "The race-pack stop gets its own visual moment without using race-day photography before the marathon." },
    { name: "Tokyo Marathon", coordinates: [139.6917, 35.6896], address: "Tokyo Metropolitan Government Building, 2-8-1 Nishi-Shinjuku, Tokyo, Japan", label: [28, -30], aliases: ["race morning", "tokyo marathon"], image: { src: "/journey/tokyo-marathon.jpg", alt: "Tokyo Marathon runners", caption: "Tokyo Marathon", sourceUrl: "https://en.wikipedia.org/wiki/Tokyo_Marathon" }, imageOffset: [36, -112], summary: "The trip’s centrepiece: race morning, the finish, and a deliberately quiet recovery afternoon." },
    { name: "Mt. Takao", coordinates: [139.2436, 35.6255], address: "Takaomachi, Hachioji, Tokyo, Japan", label: [-20, -18], anchor: "end", aliases: ["summit route", "takao"], image: { src: "/journey/takao.jpg", alt: "Forest scenery on Mount Takao", caption: "Mt. Takao", sourceUrl: "https://en.wikipedia.org/wiki/Mount_Takao" }, imageOffset: [-126, -102], summary: "A low-risk nature break west of Tokyo, with several summit approaches and an easy rail return." },
    { name: "Ryogoku", coordinates: [139.7932, 35.6968], address: "Ryogoku, Sumida City, Tokyo, Japan", label: [76, -8] },
  ],
  kanazawa: [
    { name: "Omicho Market", coordinates: [136.6565, 36.5716], label: [-22, -26], anchor: "end", aliases: ["omicho"], image: { src: "/journey/omicho-market.jpg", alt: "Seafood at Omicho Market", caption: "Omicho Market", sourceUrl: "https://commons.wikimedia.org/wiki/File:Kanazawa_fish_market.jpg" }, imageOffset: [-132, -104] },
    { name: "Kenroku-en", coordinates: [136.6627, 36.5623], label: [24, 27], aliases: ["kenrokuen"], image: { src: "/journey/kenrokuen.jpg", alt: "Kenroku-en garden", caption: "Kenroku-en", sourceUrl: "https://en.wikipedia.org/wiki/Kenroku-en" }, imageOffset: [-40, 43] },
    { name: "Higashi Chaya", coordinates: [136.6662, 36.5722], label: [31, -10], aliases: ["higashi chaya"], image: { src: "/journey/higashi-chaya.jpg", alt: "Traditional street in Higashi Chaya", caption: "Higashi Chaya", sourceUrl: "https://commons.wikimedia.org/wiki/File:Higashi_Chaya_district,_Kanazawa_(3810720612).jpg" }, imageOffset: [45, -105] },
  ],
  takayama: [
    { name: "Takayama Old Town", coordinates: [137.2604, 36.1407], aliases: ["old-town", "old town", "morning markets", "local exploring"], image: { src: "/journey/takayama-old-town.jpg", alt: "Historic timber streets in Takayama old town", caption: "Takayama Old Town", sourceUrl: "https://commons.wikimedia.org/wiki/File:Hida_Takayama_old_town_streets_(48519369602).jpg" }, imageOffset: [34, -101], summary: "The preserved Sanmachi streets hold merchant houses, sake breweries and the compact evening walk built into the plan." },
    { name: "Shirakawa-go", coordinates: [136.9062, 36.2579], image: { src: "/journey/shirakawa-go.jpg", alt: "Snow-covered gassho-zukuri houses in Shirakawa-go", caption: "Shirakawa-go", sourceUrl: "https://en.wikipedia.org/wiki/Historic_Villages_of_Shirakawa-g%C5%8D_and_Gokayama" }, imageOffset: [-130, -102], summary: "The bus stopover is known for steep-roofed gassho-zukuri farmhouses adapted to heavy winter snow." },
    { name: "Hounoki Daira", coordinates: [137.382, 36.176], aliases: ["snowboarding", "snow"], image: { src: "/journey/hounoki-daira.jpg", alt: "Snowy slopes at Hounoki Daira ski area", caption: "Hounoki Daira", sourceUrl: "https://commons.wikimedia.org/wiki/File:%E9%A3%9B%E9%A8%A8%E3%81%BB%E3%81%86%E3%81%AE%E3%81%8D%E5%B9%B3%E3%82%B9%E3%82%AD%E3%83%BC%E5%A0%B4_-_panoramio.jpg" }, imageOffset: [42, 40], summary: "The convenient ski option from Takayama, making the mountain day possible without adding Hokkaido." },
  ],
  hirayu: [
    { name: "Hirayu Onsen", coordinates: [137.505, 36.182], kind: "stay", aliases: ["ryokan", "onsen", "outdoor onsen"], image: { src: "/journey/hirayu-onsen.jpg", alt: "Outdoor bath at Hirayu Onsen", caption: "Hirayu Onsen", sourceUrl: "https://en.wikipedia.org/wiki/Okuhida_Onsen_Villages" }, imageOffset: [-130, -102], summary: "A one-night ryokan pause where dinner and the outdoor onsen are the experience rather than extra sightseeing." },
    { name: "Shin-Hotaka", coordinates: [137.573, 36.283], aliases: ["shin-hotaka ropeway", "ropeway"], image: { src: "/journey/shinhotaka-ropeway.jpg", alt: "Shin-Hotaka Ropeway over the Japanese Alps", caption: "Shin-Hotaka Ropeway", sourceUrl: "https://commons.wikimedia.org/wiki/File:Shinhotaka_Ropeway_001.jpg" }, imageOffset: [37, -101], summary: "Japan’s distinctive double-decker ropeway climbs into high alpine scenery before the ryokan evening." },
  ],
  matsumoto: [
    { name: "Matsumoto Castle", coordinates: [137.969, 36.238], aliases: ["castle"], image: { src: "/journey/matsumoto.jpg", alt: "Matsumoto Castle and its reflecting moat", caption: "Matsumoto Castle", sourceUrl: "https://en.wikipedia.org/wiki/Matsumoto_Castle" }, imageOffset: [36, -102], summary: "One of Japan’s surviving original castles anchors the compact afternoon before the flight to China." },
    { name: "Nakamachi", coordinates: [137.9697, 36.2324], aliases: ["nakamachi"], image: { src: "/journey/matsumoto-nakamachi.jpg", alt: "Traditional merchant buildings along Nakamachi Street", caption: "Nakamachi", sourceUrl: "https://commons.wikimedia.org/wiki/File:Nakamachi_street_Matsumoto_Nagano_pref_Japan01s3.jpg" }, imageOffset: [-132, 40], summary: "A compact merchant quarter of white-and-black kura storehouses, reached naturally after the castle." },
  ],
  chengdu: [
    { name: "Panda Base", coordinates: [104.146, 30.738], address: "四川省成都市成华区熊猫大道1375号 · 成都大熊猫繁育研究基地", aliases: ["panda valley", "pandas"], image: { src: "/journey/panda.jpg", alt: "Giant panda", caption: "Panda morning", sourceUrl: "https://en.wikipedia.org/wiki/Chengdu_Research_Base_of_Giant_Panda_Breeding" }, imageOffset: [36, -102], summary: "An opening-time visit gives the best chance of seeing the pandas active before the day warms up." },
    { name: "Wuhou Shrine", coordinates: [104.048, 30.646], address: "四川省成都市武侯区武侯祠大街231号", image: { src: "/journey/wuhou-shrine.jpg", alt: "Historic architecture at Wuhou Shrine in Chengdu", caption: "Wuhou Shrine", sourceUrl: "https://en.wikipedia.org/wiki/Wuhou_Shrine" }, imageOffset: [-132, -103], summary: "A temple and museum complex dedicated to figures from the Three Kingdoms period, paired naturally with nearby Jinli." },
    { name: "People's Park", coordinates: [104.055, 30.662], address: "四川省成都市青羊区少城路12号", aliases: ["people’s park"], image: { src: "/journey/peoples-park-chengdu.jpg", alt: "Lake and greenery in Chengdu People's Park", caption: "People’s Park", sourceUrl: "https://en.wikipedia.org/wiki/People%27s_Park_(Chengdu)" }, imageOffset: [42, 42], summary: "A central pause for tea-house culture, gardens and a slower view of everyday Chengdu." },
  ],
  fanjingshan: [
    { name: "East Gate", coordinates: [108.659, 27.895], address: "贵州省铜仁市江口县梵净山景区东门", kind: "stay" },
    { name: "Golden Summit", coordinates: [108.698, 27.917], address: "贵州省铜仁市江口县梵净山红云金顶", aliases: ["red clouds golden summit", "summit"], image: { src: "/journey/fanjingshan.jpg", alt: "Temples on Fanjingshan", caption: "Golden Summit", sourceUrl: "https://en.wikipedia.org/wiki/Fanjingshan" }, imageOffset: [34, -102] },
  ],
  wulingyuan: [
    { name: "Yuanjiajie", coordinates: [110.431, 29.326], address: "湖南省张家界市武陵源区张家界国家森林公园袁家界", aliases: ["bailong elevator"], image: { src: "/journey/wulingyuan.jpg", alt: "Wulingyuan sandstone pillars", caption: "Yuanjiajie", sourceUrl: "https://en.wikipedia.org/wiki/Zhangjiajie_National_Forest_Park" }, imageOffset: [-130, -100], summary: "The elevated sandstone-pillar circuit reached via the Bailong Elevator forms the dramatic first half of the park day." },
    { name: "Tianzi Mountain", coordinates: [110.45, 29.39], address: "湖南省张家界市武陵源区天子山风景区", image: { src: "/journey/tianzi-mountain.jpg", alt: "Sandstone pillars at Tianzi Mountain", caption: "Tianzi Mountain", sourceUrl: "https://commons.wikimedia.org/wiki/File:1_tianzishan_wulingyuan_zhangjiajie_2012.jpg" }, imageOffset: [40, -103], summary: "A separate high viewpoint area with dense ranks of quartz-sandstone towers and broad valley panoramas." },
    { name: "Golden Whip Stream", coordinates: [110.452, 29.323], address: "湖南省张家界市武陵源区张家界国家森林公园金鞭溪", image: { src: "/journey/golden-whip-stream.jpg", alt: "Forest and water along Golden Whip Stream", caption: "Golden Whip Stream", sourceUrl: "https://commons.wikimedia.org/wiki/File:%E9%87%91%E9%9E%AD%E6%BA%AA_-_panoramio_(1).jpg" }, imageOffset: [42, 39], summary: "A lower, forested walking route beside clear water—quieter and more intimate than the clifftop viewpoints." },
  ],
  zhangjiajie: [
    { name: "Tianmen Cableway", coordinates: [110.478, 29.117], address: "湖南省张家界市永定区大庸路天门山索道下站", kind: "stay", aliases: ["cable car", "cableway"], image: { src: "/journey/tianmen-cableway.jpg", alt: "Cableway climbing Tianmen Mountain", caption: "Tianmen Cableway", sourceUrl: "https://commons.wikimedia.org/wiki/File:Tianmen_Mountain_20180326_094808.jpg" }, imageOffset: [-130, -102], summary: "The long city-to-summit cableway starts a full mountain circuit directly beside the final-night guesthouse." },
    { name: "Heaven's Gate", coordinates: [110.476, 29.05], address: "湖南省张家界市永定区天门山国家森林公园天门洞", aliases: ["heaven’s gate", "heavens gate", "cliff paths", "glass walk"], image: { src: "/journey/zhangjiajie.jpg", alt: "Tianmen Mountain natural arch", caption: "Heaven's Gate", sourceUrl: "https://en.wikipedia.org/wiki/Tianmen_Mountain" }, imageOffset: [35, -102], summary: "The huge natural arch and 999-step stair are the visual finale after Tianmen’s cliff paths." },
  ],
  "hong-kong": [
    { name: "Victoria Peak", coordinates: [114.144, 22.275], image: { src: "/journey/hong-kong.jpg", alt: "Victoria Harbour from the Peak", caption: "Victoria Peak", sourceUrl: "https://en.wikipedia.org/wiki/Victoria_Peak" }, imageOffset: [-132, -101], summary: "The high city panorama links Central’s vertical streets with the harbour and Kowloon beyond." },
    { name: "Star Ferry", coordinates: [114.169, 22.294], image: { src: "/journey/star-ferry.jpg", alt: "Tsim Sha Tsui Star Ferry Pier on Victoria Harbour", caption: "Star Ferry", sourceUrl: "https://en.wikipedia.org/wiki/Star_Ferry" }, imageOffset: [35, -103], summary: "A short harbour crossing that doubles as one of the city’s simplest and most memorable skyline views." },
    { name: "Dragon's Back", coordinates: [114.242, 22.236], aliases: ["dragon’s back", "shek o", "big wave bay"], image: { src: "/journey/dragons-back.jpg", alt: "Dragon's Back trail", caption: "Dragon's Back", sourceUrl: "https://en.wikipedia.org/wiki/Dragon%27s_Back" }, imageOffset: [34, -101], summary: "An exposed ridge walk above the island’s southeast coast, finishing naturally toward Big Wave Bay or Shek O." },
  ],
  "los-angeles-back": [{ name: "LAX", coordinates: [-118.4085, 33.9416], kind: "visit" }],
};

function countryCode(stop: JourneyStop) {
  if (stop.country === "Guatemala") return "320";
  if (stop.country === "United States") return "840";
  if (stop.country === "Japan") return "392";
  if (stop.country === "China") return "156";
  if (stop.country === "Hong Kong") return "344";
  return undefined;
}

function countryZoom(stop: JourneyStop) {
  if (stop.country === "United States") return 4.2;
  if (stop.country === "Guatemala") return 9;
  if (stop.id === "tokyo") return 14;
  if (stop.country === "Japan") return 18;
  if (stop.id === "chengdu") return 10;
  if (stop.id === "fanjingshan") return 15;
  if (stop.id === "wulingyuan") return 17;
  if (stop.id === "zhangjiajie") return 19;
  if (stop.country === "Hong Kong") return 22;
  if (stop.id.startsWith("custom-")) return 16;
  return 8;
}

function hasCoordinates(stop: JourneyStop): stop is JourneyStop & { coordinates: [number, number] } {
  return Array.isArray(stop.coordinates) && Number.isFinite(stop.coordinates[0]) && Number.isFinite(stop.coordinates[1]);
}

function greatCircle(from: JourneyStop & { coordinates: [number, number] }, to: JourneyStop & { coordinates: [number, number] }) {
  const interpolate = geoInterpolate(from.coordinates, to.coordinates);
  return { type: "LineString" as const, coordinates: Array.from({ length: 64 }, (_, index) => interpolate(index / 63)) };
}

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function normalized(value: string) {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function placeAddress(place: Place, stop: JourneyStop) {
  return place.address ?? `${place.name}, ${stop.city}, ${stop.country}`;
}

function placeMapUrl(place: Place, stop: JourneyStop) {
  const query = placeAddress(place, stop);
  return stop.country === "China"
    ? `https://www.amap.com/search?query=${encodeURIComponent(query)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function TransportGlyph({ mode, angle = 0 }: { mode: JourneyLeg["mode"]; angle?: number }) {
  const props = { x: -9, y: -9, width: 18, height: 18, strokeWidth: 1.6, vectorEffect: "non-scaling-stroke" as const };
  // Plane's native heading is north-east (-45°), so compensate before aiming
  // it along the actual direction of travel.
 if (mode === "flight") return <Plane {...props} transform={`rotate(${angle + 45}) scale(-1 1)`} />;
  if (mode === "rail") return <TrainFront {...props} />;
  return <BusFront {...props} />;
}

export function JourneyGlobe({ stops, legs, selectedId, selectedDayId, activeItems, previewImage, detailImageSrc, dayPlace, restaurant, plannerPins = [], pinPlacementMode = false, onMapPinDrop, onPlannerPinSelect, onZoomIntoDetail, onSelect, variant = "story" }: { stops: JourneyStop[]; legs: JourneyLeg[]; selectedId: string; selectedDayId: string; activeItems: string[]; previewImage?: JourneyImage; detailImageSrc?: string; dayPlace?: JourneyMapPlace; restaurant?: { restaurant: JourneyRestaurant; meal?: RestaurantMeal }; plannerPins?: PlannerMapPin[]; pinPlacementMode?: boolean; onMapPinDrop?: (coordinates: [number, number]) => void; onPlannerPinSelect?: (pin: PlannerMapPin) => void; onZoomIntoDetail?: () => void; onSelect: (id: string) => void; variant?: "story" | "planner" }) {
  const [routeOpen, setRouteOpen] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [restaurantOpen, setRestaurantOpen] = useState(false);
  const [openPlannerPin, setOpenPlannerPin] = useState<PlannerMapPin | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const mappedStops = useMemo(() => stops.filter(hasCoordinates), [stops]);
  const selected = mappedStops.find((stop) => stop.id === selectedId) ?? mappedStops[0];
  if (!selected) return <div className="journey-map journey-map--unmapped">This route needs a verified map location before it can be shown.</div>;
  // The original proof uses a Pacific-centred globe as part of its visual
  // story. Generated Morrovia plans instead use a standard Mercator map so every
  // city, including European routes, is positioned and zoomed consistently.
  const projection = useMemo(() => variant === "planner"
    ? geoMercator().fitExtent([[22, 62], [width - 22, height - 22]], land)
    : geoNaturalEarth1().rotate([-180, 0]).fitExtent([[22, 112], [width - 22, height - 22]], land), [variant]);
  const path = useMemo(() => geoPath(projection), [projection]);
  const selectedPoint = projection(selected.coordinates) ?? [width / 2, height / 2];
  const selectedCountry = countries.features.find((country) => String(country.id) === countryCode(selected) || normalized(country.properties?.name ?? "") === normalized(selected.country));
  // The selected geography sits in the clear stage between the two side panels.
  useEffect(() => {
    const media = window.matchMedia("(max-width: 980px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const focusPoint: [number, number] = [width * 0.5, isMobile ? height * 0.46 : height * 0.52];
  const targetView = useMemo(() => {
    const scale = Math.min(maxZoom, countryZoom(selected) * (isMobile ? 1.35 : 1));
    return { x: focusPoint[0] - selectedPoint[0] * scale, y: focusPoint[1] - selectedPoint[1] * scale, scale };
  }, [focusPoint, isMobile, selected.id, selectedPoint[0], selectedPoint[1]]);
  const routeView = useMemo(() => {
    if (variant !== "planner" || mappedStops.length < 2) return targetView;
    // Pins are part of the traveller's plan too. Keeping them in the fitted
    // overview prevents an added pin from landing outside the visible map.
    const points = [
      ...mappedStops.map((stop) => projection(stop.coordinates)),
      ...plannerPins.map((pin) => projection([pin.longitude, pin.latitude])),
    ].filter((point): point is [number, number] => Boolean(point));
    if (points.length < 2) return targetView;
    const minX = Math.min(...points.map(([x]) => x));
    const maxX = Math.max(...points.map(([x]) => x));
    const minY = Math.min(...points.map(([, y]) => y));
    const maxY = Math.max(...points.map(([, y]) => y));
    const safe = { left: 310, right: 1130, top: 112, bottom: 670 };
    const spreadX = Math.max(110, maxX - minX);
    const spreadY = Math.max(110, maxY - minY);
    const scale = Math.max(minZoom, Math.min(maxZoom, Math.min((safe.right - safe.left) / spreadX, (safe.bottom - safe.top) / spreadY) * .82));
    const centreX = (minX + maxX) / 2;
    const centreY = (minY + maxY) / 2;
    return { x: (safe.left + safe.right) / 2 - centreX * scale, y: (safe.top + safe.bottom) / 2 - centreY * scale, scale };
  }, [mappedStops, plannerPins, projection, targetView, variant]);
  const viewRef = useRef<View>(targetView);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; origin: View } | null>(null);
  const didPanRef = useRef(false);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; centerX: number; centerY: number; scale: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<SVGGElement>(null);
  const zoomReadoutRef = useRef<HTMLDivElement>(null);
  const transitionFrameRef = useRef(0);
  const wheelFrameRef = useRef(0);
  const wheelTargetRef = useRef<View | null>(null);
  const mountedRef = useRef(false);
  const detailOpenedRef = useRef(false);

  useLayoutEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      writeView(variant === "planner" ? routeView : targetView);
    } else {
      // Keep the planner's branded overview fitted to the complete plan (and
      // its pins) after any update. The prior active-city target could leave
      // a valid pin just outside the canvas.
      animateTo(variant === "planner" ? routeView : targetView, 880);
    }
    return () => cancelAnimationFrame(transitionFrameRef.current);
  }, [selectedId, routeView, targetView, variant]);

  useLayoutEffect(() => {
    const handleResize = () => writeView(viewRef.current);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const routes = useMemo(() => legs.flatMap((leg) => {
    const from = stops.find((stop) => stop.id === leg.from);
    const to = stops.find((stop) => stop.id === leg.to);
    return from && to && hasCoordinates(from) && hasCoordinates(to) ? [{ leg, from, to, route: greatCircle(from, to) }] : [];
  }), [legs, stops]);
  const activeRoute = routes.find(({ leg }) => leg.to === selectedId) ?? routes.find(({ leg }) => leg.from === selectedId);
  const activeRoutePath = activeRoute ? path(activeRoute.route) ?? "" : "";
  const routeMidpoint = activeRoute ? projection(geoInterpolate(activeRoute.from.coordinates, activeRoute.to.coordinates)(.5)) : null;
  const routeAngle = activeRoute ? (() => {
    const interpolate = geoInterpolate(activeRoute.from.coordinates, activeRoute.to.coordinates);
    const before = projection(interpolate(.49));
    const after = projection(interpolate(.51));
    return before && after ? Math.atan2(after[1] - before[1], after[0] - before[0]) * 180 / Math.PI : 0;
  })() : 0;
  const activeRoutePoint: [number, number] | null = routeMidpoint
    ? [Number(routeMidpoint[0].toFixed(6)), Number(routeMidpoint[1].toFixed(6))]
    : null;
  const currentPlaces = dayPlace ? [dayPlace] : (places[selected.id] ?? []);
  const dayCopy = normalized(activeItems.join(" "));
  const picturedPlaces = currentPlaces.filter((place) => place.image && (Boolean(dayPlace) || (place.image.src !== detailImageSrc && [place.name, ...(place.aliases ?? [])].some((term) => dayCopy.includes(normalized(term))))));
  const restaurantPoint = restaurant ? projection(restaurant.restaurant.coordinates) : null;

  useEffect(() => { setRouteOpen(false); setSelectedPlace(null); setRestaurantOpen(false); setOpenPlannerPin(null); }, [selectedDayId, selectedId]);

  function writeView(next: View) {
    viewRef.current = next;
    viewportRef.current?.setAttribute("transform", `translate(${next.x} ${next.y}) scale(${next.scale})`);
    const rect = svgRef.current?.getBoundingClientRect();
    const outerScale = rect ? Math.min(rect.width / width, rect.height / height) : 1;
    const screenScale = 1 / (next.scale * Math.max(outerScale, .001));
    viewportRef.current?.querySelectorAll<SVGGElement>(".journey-map__screen-scale").forEach((element) => element.setAttribute("transform", `scale(${screenScale})`));
    if (zoomReadoutRef.current) zoomReadoutRef.current.textContent = `${Math.round(next.scale * 10) / 10}×`;
  }

  function animateTo(next: View, duration = 560) {
    cancelAnimationFrame(transitionFrameRef.current);
    cancelAnimationFrame(wheelFrameRef.current);
    wheelFrameRef.current = 0;
    wheelTargetRef.current = null;
    const from = viewRef.current;
    const started = performance.now();
    const animate = (now: number) => {
      const progress = Math.min((now - started) / duration, 1);
      const eased = easeInOutCubic(progress);
      writeView({
        x: from.x + (next.x - from.x) * eased,
        y: from.y + (next.y - from.y) * eased,
        scale: from.scale + (next.scale - from.scale) * eased,
      });
      if (progress < 1) transitionFrameRef.current = requestAnimationFrame(animate);
    };
    transitionFrameRef.current = requestAnimationFrame(animate);
  }

  function zoomedView(current: View, nextScale: number, anchorX = focusPoint[0], anchorY = focusPoint[1]) {
    const scale = Math.max(minZoom, Math.min(maxZoom, nextScale));
    const ratio = scale / current.scale;
    return { scale, x: anchorX - (anchorX - current.x) * ratio, y: anchorY - (anchorY - current.y) * ratio };
  }

  function openLocalDetailIfNeeded(nextScale: number) {
    // One deliberate zoom step from the branded route overview should take a
    // traveller into the useful, street-level planning mode for that stop.
    const threshold = Math.max(1.55, routeView.scale * 1.3);
    if (variant !== "planner" || !onZoomIntoDetail || detailOpenedRef.current || nextScale < threshold) return false;
    detailOpenedRef.current = true;
    onZoomIntoDetail();
    return true;
  }

  function zoomAt(nextScale: number, anchorX = focusPoint[0], anchorY = focusPoint[1]) {
    if (openLocalDetailIfNeeded(nextScale)) return;
    animateTo(zoomedView(viewRef.current, nextScale, anchorX, anchorY));
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const anchorX = ((event.clientX - rect.left) / rect.width) * width;
    const anchorY = ((event.clientY - rect.top) / rect.height) * height;
    cancelAnimationFrame(transitionFrameRef.current);
    const base = wheelTargetRef.current ?? viewRef.current;
    wheelTargetRef.current = zoomedView(base, base.scale * Math.exp(-event.deltaY * 0.001), anchorX, anchorY);
    if (openLocalDetailIfNeeded(wheelTargetRef.current.scale)) return;
    if (wheelFrameRef.current) return;
    const smoothWheel = () => {
      const target = wheelTargetRef.current;
      if (!target) return;
      const current = viewRef.current;
      const next = {
        x: current.x + (target.x - current.x) * .22,
        y: current.y + (target.y - current.y) * .22,
        scale: current.scale + (target.scale - current.scale) * .22,
      };
      writeView(next);
      if (Math.abs(next.scale - target.scale) > .002 || Math.abs(next.x - target.x) > .08 || Math.abs(next.y - target.y) > .08) {
        wheelFrameRef.current = requestAnimationFrame(smoothWheel);
      } else {
        writeView(target);
        wheelTargetRef.current = null;
        wheelFrameRef.current = 0;
      }
    };
    wheelFrameRef.current = requestAnimationFrame(smoothWheel);
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    cancelAnimationFrame(transitionFrameRef.current);
    cancelAnimationFrame(wheelFrameRef.current);
    wheelFrameRef.current = 0;
    wheelTargetRef.current = null;
    didPanRef.current = false;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2) {
      const points = [...pointersRef.current.values()];
      const [first, second] = points;
      pinchRef.current = {
        distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
        centerX: (first.x + second.x) / 2,
        centerY: (first.y + second.y) / 2,
        scale: viewRef.current.scale,
      };
      dragRef.current = null;
    } else {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, origin: viewRef.current };
    }
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const points = [...pointersRef.current.values()];
      const [first, second] = points;
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      const centerX = (first.x + second.x) / 2;
      const centerY = (first.y + second.y) / 2;
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect) {
        const anchorX = ((centerX - rect.left) / rect.width) * width;
        const anchorY = ((centerY - rect.top) / rect.height) * height;
        const next = zoomedView(viewRef.current, pinchRef.current.scale * (distance / pinchRef.current.distance), anchorX, anchorY);
        if (openLocalDetailIfNeeded(next.scale)) return;
        writeView(next);
      }
      event.preventDefault();
      return;
    }
    const drag = dragRef.current;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!drag || drag.pointerId !== event.pointerId || !rect) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 7) didPanRef.current = true;
    writeView({ ...drag.origin, x: drag.origin.x + ((event.clientX - drag.x) / rect.width) * width, y: drag.origin.y + ((event.clientY - drag.y) / rect.height) * height });
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  // New day-specific cards can mount while the user is manually zoomed. Seed
  // them from the live view, rather than the destination's default zoom.
  const liveScreenScale = 1 / viewRef.current.scale;
  const selectedPlaceAddress = selectedPlace ? placeAddress(selectedPlace, selected) : "";
  const selectedPlaceMapUrl = selectedPlace ? placeMapUrl(selectedPlace, selected) : "";
  const selectedPlaceMapProvider = selected.country === "China" ? "Amap" : "Google Maps";

  const placePinAt = (event: ReactPointerEvent<SVGSVGElement> | ReactMouseEvent<SVGSVGElement>) => {
    if (!pinPlacementMode || !onMapPinDrop || dragRef.current || didPanRef.current) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const screenPoint: [number, number] = [((event.clientX - rect.left) / rect.width) * width, ((event.clientY - rect.top) / rect.height) * height];
    const point: [number, number] = [(screenPoint[0] - viewRef.current.x) / viewRef.current.scale, (screenPoint[1] - viewRef.current.y) / viewRef.current.scale];
    const coordinates = projection.invert?.(point);
    if (coordinates && Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1])) onMapPinDrop([coordinates[0], coordinates[1]]);
  };

  return <div className={`journey-map ${pinPlacementMode ? "is-pin-placement" : ""}`} data-pin-hint={isMobile ? "Tap map to place this pin" : "Double-click the map to place this pin"} aria-label={variant === "planner" ? "Interactive journey map" : "Interactive Pacific journey map"}>
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={variant === "planner" ? "Interactive geographic route map" : "Geographic Pacific route from Guatemala to Los Angeles, Japan, China and Hong Kong"} onWheel={handleWheel} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onPointerLeave={handlePointerUp} onClick={(event) => { if (pinPlacementMode && isMobile) placePinAt(event); }} onDoubleClick={(event) => { if (!isMobile) placePinAt(event); }}>
      <defs>
        <linearGradient id="ocean" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#f9f9f7" /><stop offset="1" stopColor="#eceff3" /></linearGradient>
        <filter id="traveller-glow" x="-300%" y="-300%" width="600%" height="600%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <rect width={width} height={height} fill="url(#ocean)" />
      <g ref={viewportRef} className="journey-map__viewport">
        <path d={path(geoGraticule10()) ?? undefined} className="journey-map__graticule" />
        <path d={path(land) ?? undefined} className="journey-map__land" />
        {variant === "story" ? <text className="journey-map__ocean-label" x="195" y="389">Pacific Ocean</text> : null}
        {selectedCountry ? <path d={path(selectedCountry as never) ?? undefined} className="journey-map__selected-country" /> : null}
        <g className="journey-map__routes">
          {routes.map(({ leg, route }) => <path pathLength={1} key={`${leg.from}-${leg.to}-${leg.from === activeRoute?.leg.from ? selectedId : "idle"}`} d={path(route) ?? undefined} className={leg === activeRoute?.leg ? "is-active" : ""} />)}
        </g>
        {activeRoutePath ? <g key={`traveller-${selectedId}`} className="journey-map__traveller"><animateMotion path={activeRoutePath} dur="1.05s" calcMode="spline" keyTimes="0;1" keySplines="0.45 0 0.2 1" fill="freeze" /><g className="journey-map__screen-scale" transform={`scale(${liveScreenScale})`}><circle r="4" filter="url(#traveller-glow)" /></g></g> : null}
        <g className="journey-map__stops">
          {mappedStops.map((stop) => {
            const point = projection(stop.coordinates);
            const active = stop.id === selected.id;
            if (!point) return null;
            return <g key={stop.id} className={`journey-map__stop ${active ? "is-selected" : ""}`} transform={`translate(${point[0]} ${point[1]})`} onPointerDown={(event) => { event.stopPropagation(); onSelect(stop.id); }} onClick={(event) => { event.stopPropagation(); onSelect(stop.id); }} role="button" tabIndex={0} aria-label={`Select ${stop.city}`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(stop.id); }}>
              <g className="journey-map__screen-scale" transform={`scale(${liveScreenScale})`}>
                <circle r="5.5" className="journey-map__hit" />
                {active ? <circle r="15" className="journey-map__pulse" /> : null}
                <circle r={active ? 6 : 3.25} className="journey-map__dot" />
                <text className="journey-map__stop-label" x="12" y="4">{stop.city}</text>
              </g>
            </g>;
          })}
        </g>
        <g className="journey-map__places">
          {currentPlaces.map((place, index) => {
            const point = projection(place.coordinates);
            if (!point) return null;
            const [labelX, labelY] = place.label ?? [12, -12];
            return <g key={place.name} className={`journey-map__place ${place.kind === "stay" ? "is-stay" : ""}`} transform={`translate(${point[0]} ${point[1]})`} style={{ "--place-delay": `${430 + index * 75}ms` } as CSSProperties}><g className="journey-map__screen-scale" transform={`scale(${liveScreenScale})`}>
                <circle r="3.5" />
                <path d={`M0 0 L${labelX * .72} ${labelY * .72}`} />
                <text x={labelX} y={labelY} textAnchor={place.anchor ?? "start"} role="button" tabIndex={0} aria-label={`Open details for ${place.name}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setSelectedPlace(place); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedPlace(place); } }}>{place.name}</text>
              </g></g>;
          })}
        </g>
        {variant === "planner" ? <g className="journey-map__planner-pins">
          {plannerPins.map((pin) => {
            const point = projection([pin.longitude, pin.latitude]);
            if (!point) return null;
            return <g key={pin.id} className={`journey-map__planner-pin is-${pin.category} ${openPlannerPin?.id === pin.id ? "is-open" : ""}`} transform={`translate(${point[0]} ${point[1]})`} role="button" tabIndex={0} aria-label={`Open ${pin.title} pin details`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setOpenPlannerPin(pin); onPlannerPinSelect?.(pin); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpenPlannerPin(pin); onPlannerPinSelect?.(pin); } }}>
              <g className="journey-map__screen-scale" transform={`scale(${liveScreenScale})`}>
                <circle r="6" />
                <text x="10" y="3">{pin.title}</text>
              </g>
            </g>;
          })}
        </g> : null}
        <g className="journey-map__step-photos">
          {picturedPlaces.map((place, index) => {
            const point = projection(place.coordinates);
            if (!point || !place.image) return null;
            const [offsetX, offsetY] = place.imageOffset ?? [28, -91];
            return <g key={`${selectedId}-${place.name}-${place.image.src}`} className="journey-map__step-photo" transform={`translate(${point[0]} ${point[1]})`} style={{ "--photo-delay": `${180 + index * 110}ms` } as CSSProperties}>
              <g className="journey-map__screen-scale" transform={`scale(${liveScreenScale})`}>
                <path d={`M0 0 L${offsetX + (offsetX < 0 ? 100 : 0)} ${offsetY + 52}`} />
                <g className="journey-map__step-photo-card" transform={`translate(${offsetX} ${offsetY})`} role="button" tabIndex={0} aria-label={`More about ${place.name}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setSelectedPlace(place); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedPlace(place); } }}>
                  <rect width="104" height="67" />
                  <image href={place.image.src} x="5" y="5" width="94" height="44" preserveAspectRatio="xMidYMid slice" />
                  <text x="7" y="60">{place.image.caption.length > 19 ? `${place.image.caption.slice(0, 19)}…` : place.image.caption}</text>
                </g>
              </g>
            </g>;
          })}
        </g>
        {!picturedPlaces.length && previewImage ? <g key={`${selectedId}-${previewImage.src}`} className="journey-map__photo" transform={`translate(${selectedPoint[0]} ${selectedPoint[1]})`}>
          <g className="journey-map__screen-scale" transform={`scale(${liveScreenScale})`}>
            <path d="M8 -8 L28 -27" />
            <g className="journey-map__photo-card" transform="translate(28 -107)">
              <rect width="124" height="80" />
              <image href={previewImage.src} x="5" y="5" width="114" height="57" preserveAspectRatio="xMidYMid slice" />
              <text x="7" y="73">{previewImage.caption.length > 24 ? `${previewImage.caption.slice(0, 24)}…` : previewImage.caption}</text>
            </g>
          </g>
        </g> : null}
        {restaurant && restaurantPoint ? <g key={`${selectedDayId}-${restaurant.restaurant.name}`} className={`journey-map__restaurant ${restaurantOpen ? "is-open" : ""}`} transform={`translate(${restaurantPoint[0]} ${restaurantPoint[1]})`}>
          <g className="journey-map__screen-scale" transform={`scale(${liveScreenScale})`}>
            <g className="journey-map__restaurant-trigger" role="button" tabIndex={0} aria-label={`${restaurantOpen ? "Hide" : "Show"} ${restaurant.meal ?? "meal"} pick: ${restaurant.restaurant.name}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setRestaurantOpen((open) => !open); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setRestaurantOpen((open) => !open); } }}>
              <circle r="7" />
              <Utensils x="-4" y="-4" width="8" height="8" />
            </g>
            {restaurantOpen ? <>
              <path className="journey-map__restaurant-leader" d="M5 -5 L19 -19" />
              <g className="journey-map__restaurant-card" transform="translate(19 -48)" role="link" tabIndex={0} aria-label={`Open ${restaurant.restaurant.name} in maps`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); window.open(restaurant.restaurant.mapsUrl, "_blank", "noopener,noreferrer"); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); window.open(restaurant.restaurant.mapsUrl, "_blank", "noopener,noreferrer"); } }}>
                <rect width="184" height="42" />
                <circle cx="20" cy="21" r="12" />
                <Utensils x="13" y="14" width="14" height="14" />
                <text className="journey-map__restaurant-eyebrow" x="39" y="15">{restaurant.meal ?? "meal"} pick</text>
                <text className="journey-map__restaurant-name" x="39" y="30">{restaurant.restaurant.name.length > 24 ? `${restaurant.restaurant.name.slice(0, 24)}…` : restaurant.restaurant.name}</text>
              </g>
            </> : null}
          </g>
        </g> : null}
        {openPlannerPin ? (() => {
          const point = projection([openPlannerPin.longitude, openPlannerPin.latitude]);
          if (!point) return null;
          const mapUrl = `https://www.google.com/maps/search/?api=1&query=${openPlannerPin.latitude},${openPlannerPin.longitude}`;
          return <g className="journey-map__planner-pin-card" transform={`translate(${point[0]} ${point[1]})`}>
            <g className="journey-map__screen-scale" transform={`scale(${liveScreenScale})`}>
              <path d="M6 -6 L20 -20" />
              <g transform="translate(20 -52)"><rect width="190" height="48" /><text x="10" y="15">{openPlannerPin.category} · DAY {openPlannerPin.dayNumber}</text><text x="10" y="31">{openPlannerPin.title.length > 26 ? `${openPlannerPin.title.slice(0, 26)}…` : openPlannerPin.title}</text><a href={mapUrl} target="_blank" rel="noreferrer"><text x="180" y="15" textAnchor="end">MAP ↗</text></a></g>
            </g>
          </g>;
        })() : null}
        {activeRoute && activeRoutePoint ? <g key={`route-info-${activeRoute.leg.from}-${activeRoute.leg.to}-${selectedId}`} className={`journey-map__route-info ${routeOpen ? "is-open" : ""}`} transform={`translate(${activeRoutePoint[0].toFixed(3)} ${activeRoutePoint[1].toFixed(3)})`}>
          <g className="journey-map__screen-scale" transform={`scale(${liveScreenScale})`}>
            <g className="journey-map__route-trigger" role="button" tabIndex={0} aria-label={`${routeOpen ? "Hide" : "Show"} ${activeRoute.leg.mode} details for ${activeRoute.leg.label}`} onClick={(event) => { event.stopPropagation(); setRouteOpen((open) => !open); }} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setRouteOpen((open) => !open); } }}>
              <circle r="15" />
              <g><TransportGlyph mode={activeRoute.leg.mode} angle={routeAngle} /></g>
            </g>
            <path className="journey-map__route-leader" d="M14 8 L18 23" />
            <g className={`journey-map__route-card ${routeOpen ? "is-open" : ""}`} transform="translate(18 23)">
              <rect width="184" height="54" />
              <text className="journey-map__route-mode" x="10" y="14">{activeRoute.leg.mode}</text>
              <text className="journey-map__route-title" x="10" y="30">{activeRoute.leg.label.length > 30 ? `${activeRoute.leg.label.slice(0, 30)}…` : activeRoute.leg.label}</text>
              <text className="journey-map__route-detail" x="10" y="44">{activeRoute.leg.detail}</text>
              {activeRoute.leg.duration ? <text className="journey-map__route-duration" x="174" y="14" textAnchor="end">{activeRoute.leg.duration}</text> : null}
            </g>
          </g>
        </g> : null}
      </g>
    </svg>
    <div className="journey-map__controls" aria-label="Map controls">
      <button type="button" onClick={() => zoomAt(viewRef.current.scale * 1.45)} aria-label="Zoom in map" title="Zoom in"><Plus size={17} /></button>
      <button type="button" onClick={() => zoomAt(viewRef.current.scale / 1.45)} aria-label="Zoom out map" title="Zoom out"><Minus size={17} /></button>
      <button type="button" onClick={() => animateTo(variant === "planner" ? routeView : targetView)} aria-label={variant === "planner" ? "Fit all route destinations" : `Reset map to ${selected.city}`} title={variant === "planner" ? "Fit destination" : `Reset map to ${selected.city}`}><Scan size={16} /></button>
    </div>
    <div ref={zoomReadoutRef} className="journey-map__zoom-readout">{Math.round(targetView.scale * 10) / 10}×</div>
    {selectedPlace ? <aside className={`journey-map__place-detail ${selectedPlace.image ? "" : "is-text-only"}`} aria-live="polite">
      {selectedPlace.image ? <img src={selectedPlace.image.src} alt={selectedPlace.image.alt} /> : null}
      <div><small>On this day</small><h3>{selectedPlace.name}</h3><address><MapPin />{selectedPlaceAddress}</address><p>{selectedPlace.summary ?? `A planned stop in ${selected.city}.`}</p><div className="journey-map__place-links"><a href={selectedPlaceMapUrl} target="_blank" rel="noreferrer">Open in {selectedPlaceMapProvider} <ExternalLink /></a>{selectedPlace.image ? <a href={selectedPlace.image.sourceUrl} target="_blank" rel="noreferrer">Learn more <ExternalLink /></a> : null}</div></div>
      <button type="button" aria-label={`Close ${selectedPlace.name} details`} onClick={() => setSelectedPlace(null)}><X /></button>
    </aside> : null}
  </div>;
}
