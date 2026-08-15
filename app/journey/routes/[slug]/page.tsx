import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CloudSun,
  ExternalLink,
  MapPin,
  Route,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import EasyTNavigation from "../../easyt-navigation";
import { getAuth } from "@/lib/auth";
import { listEasyTRouteControls } from "@/lib/easyt/admin-content";
import { isEasyTAuthConfigured } from "@/lib/easyt/auth-environment";
import { inspirationByKey, type InspirationStop } from "@/lib/easyt/inspiration";
import { ensureEasyTUser, getEasyTUserPreferences } from "@/lib/easyt/repository";
import { routeFamilyByKey } from "@/lib/easyt/route-catalog";
import { routeImages } from "@/lib/easyt/route-images";
import { countryFlagFor, touristEntryRequirementFor } from "@/lib/easyt/visa-requirements";
import RouteHeroImage from "./route-hero-image";
import RouteAttractionImage from "./route-attraction-image";
import RouteStopImage from "./route-stop-image";
import RouteLiveMap from "./route-live-map";
import styles from "./route-overview.module.css";

type RouteStory = {
  eyebrow: string;
  title: string;
  summary: string;
  image: string;
  duration: string;
  rhythm: string;
  bestFor: string;
  promise: string;
  notes: string[];
};

const routeStories: Record<string, RouteStory> = {
  "japan-slow": { eyebrow: "Asia · food and mountains", title: "Japan, one good day at a time", summary: "A first-time Japan route that moves from Tokyo’s energy into smaller mountain towns, then ends with Kyoto at a human pace.", image: "/journey/japan-evening-route.jpg", duration: "10 days", rhythm: "3 bases · 2 rail days", bestFor: "Food, culture and an unhurried first visit", promise: "The route is designed to leave a little room in every place: for an unexpected counter seat, a slower morning or one more walk.", notes: ["Tokyo is your energetic opening chapter, not a checklist.", "Takayama adds mountain air and a softer rhythm between the cities.", "Kyoto is saved for last, with enough time to wander properly."] },
  "portugal-coast": { eyebrow: "Europe · city to coast", title: "The Atlantic reset", summary: "Start with Lisbon’s colour and energy, ease into Comporta, then finish on the Algarve with nowhere to rush back from.", image: "/journey/portugal-atlantic-route.jpg", duration: "7 days", rhythm: "3 bases · easy road route", bestFor: "Sea air, good food and a genuinely slower week", promise: "This is deliberately light on hotel changes and full of days that can flex around the weather, a long lunch or a beach you did not expect to find.", notes: ["Lisbon brings the buzz, without trying to see every neighbourhood.", "Comporta creates the pause between the city and the coast.", "Lagos gives the final wide-open days by the Atlantic."] },
  "andean-highlands": { eyebrow: "South America · altitude and landscapes", title: "Andean highlands, gently", summary: "A highland route that gives your body time to acclimatise before asking for its biggest days, with Cusco, the Sacred Valley and Arequipa in a calm sequence.", image: "/journey/peru-sacred-valley-route.jpg", duration: "9 days", rhythm: "3 bases · altitude-aware pacing", bestFor: "Big landscapes without overfilling every day", promise: "The plan protects the important things: recovery at altitude, weather buffer and a little freedom to decide which big day feels right once you are there.", notes: ["Cusco starts slowly, so the altitude does not set the agenda.", "The Sacred Valley gets proper space rather than a rushed day trip.", "Arequipa gives the trip a graceful, lower-key final chapter."] },
  "taiwan-rail": { eyebrow: "Asia · rail and night markets", title: "Taiwan by train", summary: "A fast, delicious route south through Taipei, Taichung and Tainan, held together by easy rail legs and nights that stay open for eating.", image: "/journey/taiwan-rail-route.jpg", duration: "8 days", rhythm: "3 bases · rail-first", bestFor: "Night markets, tea hills and low-friction movement", promise: "The rail route keeps transfers simple, so you can arrive, drop your bag and spend your energy on the places that make Taiwan memorable.", notes: ["Taipei starts with neighbourhood energy and room to eat your way around it.", "Taichung breaks the journey with slower streets and green space.", "Tainan is the warm, food-led finish with time to follow your appetite."] },
};

const routeDetails: Record<string, { country: string; bestTime: string; weather: string; attractions: string[] }> = {
  "japan-slow": {
    country: "Japan is exceptionally easy to move through by rail, but the most rewarding version of this route leaves space between the headline sights. Tokyo, the Japanese Alps and Kyoto each have a distinct rhythm.",
    bestTime: "March to May or October to November",
    weather: "Spring is mild with busy blossom periods. Autumn is cooler and usually comfortable for walking. Summer is hot and humid in the cities, while mountain conditions can change quickly.",
    attractions: ["Meiji Shrine and Tokyo neighbourhoods", "Takayama old town and morning markets", "Hida folk villages and alpine scenery", "Kyoto temples and eastern hillside walks"],
  },
  "portugal-coast": {
    country: "Portugal works particularly well as a city-to-coast trip. Distances are manageable, food is part of the route, and each base creates a noticeably different chapter.",
    bestTime: "April to June or September to October",
    weather: "Late spring and early autumn are generally warm without the peak summer heat. Atlantic wind and cooler evenings are common on the coast.",
    attractions: ["Lisbon’s Alfama and riverside districts", "Sintra’s palaces and wooded hills", "Comporta’s dunes and rice fields", "Lagos cliffs and coastal paths"],
  },
  "andean-highlands": {
    country: "Peru’s highland highlights are connected by extraordinary landscapes, but altitude changes the pace. This route protects the first days and treats the Sacred Valley as a base, not a rushed excursion.",
    bestTime: "May to September",
    weather: "The dry season brings clearer highland days and cold nights. Rain is more frequent from November to March, and conditions can shift quickly at altitude.",
    attractions: ["Cusco’s historic centre", "Pisac and Ollantaytambo", "Machu Picchu", "Arequipa and the volcanic landscape"],
  },
  "taiwan-rail": {
    country: "Taiwan’s fast rail spine makes a multi-city trip unusually simple. The route pairs modern city life, tea country and historic southern streets without losing days to transfers.",
    bestTime: "October to April",
    weather: "Winters are mild in the south and cooler in Taipei. Summers are hot, humid and wet, and typhoons can disrupt travel from summer into early autumn.",
    attractions: ["Taipei night markets and hot springs", "Sun Moon Lake or tea country", "Taichung’s arts districts", "Tainan temples and old streets"],
  },
};

function storyForRoute(slug: string): RouteStory | null {
  const existing = routeStories[slug];
  if (existing) return existing;
  const route = routeFamilyByKey[slug];
  if (!route) return null;
  return {
    eyebrow: `${route.region.replaceAll("-", " ")} · ${route.interests.slice(0, 2).join(" and ")}`,
    title: route.title,
    summary: route.bestFor,
    image: routeImages[route.key] ?? "",
    duration: `${route.suggestedDays.ideal} days`,
    rhythm: `${route.bases.length} bases · editable pacing`,
    bestFor: route.bestFor,
    promise: `A considered first route through ${route.bases.join(", ")}, with practical connections and room to change the shape once you know what matters to you.`,
    notes: route.stops.map((stop) => stop.reason),
  };
}

function RouteMap({ title, stops }: { title: string; stops: InspirationStop[] }) {
  return <div className={styles.mapCard}>
    <div className={styles.cardHeading}><div><p className={styles.eyebrow}>Route overview</p><h2>See the shape before the detail</h2></div><span>{stops.length} stops</span></div>
    <RouteLiveMap title={title} stops={stops} className={styles.liveRouteMap} />
    <p className={styles.mapNote}>Explore the route, then make a personal editable copy.</p>
  </div>;
}

function formatMinutes(minutes: number | null) {
  if (!minutes) return "Timing to confirm";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours ? `${hours}h ` : ""}${remainder ? `${remainder}m` : ""}`.trim();
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = storyForRoute(slug);
  return { title: story ? `${story.title} · Morrovia` : "Route · Morrovia" };
}

export const dynamic = "force-dynamic";

export default async function RouteOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const seed = inspirationByKey[slug];
  const story = storyForRoute(slug);
  const route = routeFamilyByKey[slug];
  if (!seed || !story) notFound();
  const controls = await listEasyTRouteControls().catch(() => []);
  if (controls.find((control) => control.routeKey === slug)?.published === false) notFound();

  let session: any = null;
  let preferences: Awaited<ReturnType<typeof getEasyTUserPreferences>> | null = null;
  try {
    if (isEasyTAuthConfigured()) {
      session = await getAuth().api.getSession({ headers: await headers() });
      if (session?.user) {
        await ensureEasyTUser(session.user.id, session.user.email, session.user.name);
        preferences = await getEasyTUserPreferences(session.user.id);
      }
    }
  } catch {
    session = null;
  }

  const detail = routeDetails[slug];
  const countryNames = route?.countries ?? [...new Set(seed.stops.map((stop) => stop.country))];
  const seasonalNotes = route?.seasonalNotes ?? [];
  const attractions = detail?.attractions ?? route?.highlights ?? seed.stops.map((stop) => `Explore ${stop.name}`);
  const bestTime = detail?.bestTime ?? seasonalNotes[0] ?? "Check the seasonal pattern for each stop before choosing dates";
  const weather = detail?.weather ?? seasonalNotes[1] ?? seasonalNotes[0] ?? "Conditions vary across this route. Check each stop again when your dates are set.";
  const countryContext = detail?.country ?? `${countryNames.join(" and ")} give this route its character. The sequence balances ${route?.interests.slice(0, 3).join(", ") || "major sights and local time"} while keeping the route editable.`;
  const primaryNationality = preferences?.travelReadinessProfile.nationalities[0];
  const entryChecks = primaryNationality ? countryNames.map((country) => ({ country, requirement: touristEntryRequirementFor(primaryNationality, country, preferences?.language) })) : [];

  return <main className={styles.page}>
    <EasyTNavigation current="home" account={session?.user ? { name: session.user.name, email: session.user.email, language: preferences?.language } : undefined} />

    <section className={styles.hero}>
      <RouteHeroImage image={story.image} routeKey={slug} query={route?.imageQuery ?? `${route?.bases[0] ?? story.title} ${route?.countries[0] ?? "travel"}`} fallbackQueries={[`${route?.bases[0] ?? story.title} ${route?.countries[0] ?? "travel"}`, `${route?.countries[0] ?? story.title} travel`]} eyebrow={story.eyebrow} duration={story.duration} />
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>A route with room to breathe</p>
        <h1>{story.title}</h1>
        <p>{story.summary}</p>
        <dl>
          <div><dt><CalendarDays aria-hidden="true" /> Time</dt><dd>{story.duration}</dd></div>
          <div><dt><Route aria-hidden="true" /> Shape</dt><dd>{story.rhythm}</dd></div>
          <div><dt><Sparkles aria-hidden="true" /> Best for</dt><dd>{story.bestFor}</dd></div>
        </dl>
        <Link className={styles.primary} href={`/journey/new?inspire=${encodeURIComponent(seed.key)}`}>Make this trip mine <ArrowRight aria-hidden="true" /></Link>
        <small>Choose dates, adjust the pace and change every stop next.</small>
      </div>
    </section>

    <section className={styles.routeBody}>
      <RouteMap title={story.title} stops={seed.stops} />
      <aside className={styles.tripContext}>
        <p className={styles.eyebrow}>Plan around the place</p>
        <h2>When this route works best</h2>
        <div className={styles.contextItem}><CalendarDays aria-hidden="true" /><div><b>Best time</b><p>{bestTime}</p></div></div>
        <div className={styles.contextItem}><CloudSun aria-hidden="true" /><div><b>Typical conditions</b><p>{weather}</p></div></div>
        <div className={styles.contextItem}><MapPin aria-hidden="true" /><div><b>Countries</b><p>{countryNames.join(" · ")}</p></div></div>
        {session?.user && <div className={styles.entryCheck}><div className={styles.entryCheckHeading}><ShieldCheck aria-hidden="true" /><div><b>Your entry check</b><p>{primaryNationality ? `${countryFlagFor(primaryNationality)} ${primaryNationality} passport` : "Add your nationality to personalise this route."}</p></div></div>{primaryNationality ? <ul>{entryChecks.map(({ country, requirement }) => <li key={country}><div><span aria-hidden="true">{countryFlagFor(country)}</span><b>{country}</b><p>{requirement.statusLabel} · {requirement.permittedStay}</p></div><a href={requirement.sourceHref} target="_blank" rel="noreferrer" aria-label={`Verify ${country} entry requirements`}><ExternalLink aria-hidden="true" /></a></li>)}</ul> : <Link href="/journey/profile">Add traveller details <ArrowRight aria-hidden="true" /></Link>}</div>}
      </aside>
    </section>

    <section className={styles.sequenceSection}>
      <div className={styles.sectionIntro}><div><p className={styles.eyebrow}>The route · {story.rhythm}</p><h2>A clear sequence, with room to change it</h2></div><p>{story.promise}</p></div>
      <ol className={styles.stops}>{seed.stops.map((stop, index) => {
        const connection = route?.connections.find((item) => item.from === stop.name);
        return <li key={stop.id}>
          <RouteStopImage routeKey={slug} stop={stop.name} country={stop.country} index={index} />
          <div className={styles.stopCopy}><b>{String(index + 1).padStart(2, "0")}</b><div><p><MapPin aria-hidden="true" /> {stop.country}</p><h3>{stop.name}</h3><span>{story.notes[index] ?? `Use ${stop.name} as an editable base for this part of the route.`}</span>{connection && <small>{connection.mode} · {formatMinutes(connection.planningMinutes)} to {connection.to}</small>}</div></div>
        </li>;
      })}</ol>
    </section>

    <section className={styles.attractionsSection}>
      <div className={styles.sectionIntro}><div><p className={styles.eyebrow}>Worth making time for</p><h2>Key attractions along the route</h2></div><p>Use these as anchors, not a checklist. The builder keeps every day editable.</p></div>
      <div className={styles.attractionGrid}>{attractions.map((attraction, index) => {
        const stop = seed.stops[index % seed.stops.length];
        return <article key={attraction}>
          <RouteAttractionImage routeKey={slug} attraction={attraction} stop={stop?.name ?? route?.bases[0] ?? story.title} country={stop?.country ?? countryNames[0] ?? "travel"} index={index} />
          <div className={styles.attractionCopy}><span>{String(index + 1).padStart(2, "0")}</span><h3>{attraction}</h3><p>{stop?.name}</p></div>
        </article>;
      })}</div>
    </section>

    <section className={styles.countrySection}>
      <div><p className={styles.eyebrow}>Know the route</p><h2>{countryNames.join(" and ")}</h2><p>{countryContext}</p></div>
      <div className={styles.seasonPanel}><p className={styles.eyebrow}>Before choosing dates</p>{seasonalNotes.length > 0 ? <ul>{seasonalNotes.map((note) => <li key={note}>{note}</li>)}</ul> : <p>Check current entry requirements, transport schedules and seasonal closures before booking.</p>}{route && <p className={styles.reviewed}>Editorial route reviewed {route.reviewedAt} · confidence: {route.confidence.replace("-", " ")}</p>}</div>
    </section>

    {route && route.sourceLinks.length > 0 && <section className={styles.sources}><p>Planning sources</p><div>{route.sourceLinks.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}<ExternalLink aria-hidden="true" /><small>{source.covers}</small></a>)}</div></section>}

    <section className={styles.cta}><div><p>Ready to shape it?</p><h2>Start with the route. Make every day your own.</h2></div><Link className={styles.primary} href={`/journey/new?inspire=${encodeURIComponent(seed.key)}`}>Personalise this trip <ArrowRight aria-hidden="true" /></Link></section>
  </main>;
}
