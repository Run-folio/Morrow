import {
  AlertTriangle,
  Bus,
  CalendarDays,
  Car,
  Check,
  CheckCircle2,
  CloudSun,
  Compass,
  ExternalLink,
  Gauge,
  Globe2,
  MapPin,
  MoonStar,
  Plane,
  Route,
  Ship,
  Sparkles,
  Train,
  type LucideIcon,
} from "lucide-react";
import type { PublicRouteConnection, PublicRouteDetail } from "@/lib/easyt/public-route";
import RouteAttractionImage from "./route-attraction-image";
import RouteHeroImage from "./route-hero-image";
import RouteLiveMap from "./route-live-map";
import RoutePlanLink from "./route-plan-link";
import RouteStopImage from "./route-stop-image";
import styles from "./route-overview.module.css";

function connectionIcon(mode: PublicRouteConnection["mode"]): LucideIcon {
  if (mode === "train") return Train;
  if (mode === "flight") return Plane;
  if (mode === "road") return Car;
  if (mode === "bus") return Bus;
  if (mode === "ferry") return Ship;
  return Route;
}

function nightLabel(nights: number) {
  return `${nights} ${nights === 1 ? "night" : "nights"}`;
}

export default function RouteDetailView({ detail }: { detail: PublicRouteDetail }) {
  const firstStop = detail.stops[0];
  const lastStop = detail.stops.at(-1);
  return <>
    <section className={styles.hero} aria-labelledby="route-title">
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>A route with room to breathe</p>
        <h1 id="route-title">{detail.title}</h1>
        <p className={styles.heroSummary}>{detail.summary}</p>
        <dl className={styles.heroFacts}>
          <div><dt><CalendarDays aria-hidden="true" /></dt><dd><strong>{detail.durationDays} days</strong><span>{detail.totalNights} nights</span></dd></div>
          <div><dt><MapPin aria-hidden="true" /></dt><dd><strong>{detail.stops.length} stops</strong><span>{firstStop?.name} → {lastStop?.name}</span></dd></div>
          {detail.rhythm && <div><dt><Gauge aria-hidden="true" /></dt><dd><strong>{detail.rhythm}</strong><span>Pacing</span></dd></div>}
          <div><dt><Sparkles aria-hidden="true" /></dt><dd><strong>{detail.interestLabel}</strong><span>Route character</span></dd></div>
        </dl>
        <div className={styles.heroActions}>
          <RoutePlanLink className={styles.planButton} draft={detail.planDraft} placement="hero" />
          <span>Dates, nights and every stop stay editable.</span>
        </div>
      </div>
      <RouteHeroImage
        image={detail.heroImage}
        routeKey={detail.key}
        query={`${firstStop?.name ?? detail.title} ${detail.countries[0] ?? "travel"}`}
        fallbackQueries={[`${detail.countries[0] ?? detail.title} ${detail.interestLabel} travel`]}
        eyebrow={detail.eyebrow}
        duration={`${detail.durationDays} days`}
        alt={`${detail.title} route landscape`}
      />
    </section>

    <section className={styles.overviewSection} aria-labelledby="route-overview-heading">
      <div className={styles.overviewMap}>
        <p className={styles.eyebrow}>Route overview</p>
        <h2 className={styles.srOnly} id="route-overview-heading">Route overview for {detail.title}</h2>
        <RouteLiveMap title={detail.title} stops={detail.stops} className={styles.liveRouteMap} />
        <p className={styles.mapNote}>The line shows the sequence between bases, not an exact road, rail or flight path.</p>
        <ol className={styles.mapRouteList} aria-label={`Ordered stops on ${detail.title}`}>
          {detail.stops.map((stop, index) => <li key={stop.id}><span>{index + 1}</span>{stop.name}</li>)}
        </ol>
      </div>
      <aside className={styles.glance} aria-labelledby="route-glance-heading">
        <p className={styles.eyebrow}>Route at a glance</p>
        <h2 className={styles.srOnly} id="route-glance-heading">Route at a glance</h2>
        <dl className={styles.glanceList}>
          {detail.bestTime && <div><dt><CalendarDays aria-hidden="true" /><span>Best time</span></dt><dd>{detail.bestTime}</dd></div>}
          <div><dt><Globe2 aria-hidden="true" /><span>{detail.countries.length === 1 ? "Country" : "Countries"}</span></dt><dd>{detail.countries.join(" · ")}</dd></div>
          {detail.rhythm && <div><dt><Gauge aria-hidden="true" /><span>Pacing</span></dt><dd>{detail.rhythm}</dd></div>}
          <div><dt><MapPin aria-hidden="true" /><span>Start</span></dt><dd>{firstStop?.name}</dd></div>
          <div><dt><MapPin aria-hidden="true" /><span>End</span></dt><dd>{lastStop?.name}</dd></div>
        </dl>
        <div className={styles.whyPanel}>
          <h3>Why this route works</h3>
          <ul>{detail.reasons.map((reason) => <li key={reason}><CheckCircle2 aria-hidden="true" /><span>{reason}</span></li>)}</ul>
        </div>
        {detail.warnings.length > 0 && <div className={styles.warningPanel}>
          <h3><AlertTriangle aria-hidden="true" /> Worth knowing</h3>
          <ul>{detail.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>}
      </aside>
    </section>

    <section className={styles.sequenceSection} aria-labelledby="route-sequence-heading">
      <header className={styles.sectionHeading}>
        <div><p className={styles.eyebrow}>{detail.stops.length} stops · one connected journey</p><h2 id="route-sequence-heading">See how the route unfolds</h2></div>
        <p>Each base has a clear role. Known transfer allowances are labelled; other legs stay marked for confirmation.</p>
      </header>
      <ol className={styles.stopSequence}>
        {detail.stops.map((stop, index) => {
          const ConnectionIcon = connectionIcon(stop.onward?.mode ?? null);
          return <li className={styles.stopStep} key={stop.id}>
            <article className={styles.stopCard}>
              <div className={styles.stopTitle}><span>{index + 1}</span><h3>{stop.name}</h3><small>{nightLabel(stop.nights)}</small></div>
              <RouteStopImage routeKey={detail.key} stop={stop.name} country={stop.country} index={index} fallbackImage={detail.heroImage} />
              <div className={styles.stopCopy}>
                <p>{stop.reason}</p>
                <small>{stop.country} · {stop.dayLabel}</small>
              </div>
            </article>
            {stop.onward && <div className={`${styles.transfer} ${stop.onward.confidence === "unknown" ? styles.transferUnknown : ""}`} aria-label={`${stop.onward.modeLabel} from ${stop.onward.from} to ${stop.onward.to}: ${stop.onward.durationLabel}`}>
              <span>{stop.onward.modeLabel}</span>
              <ConnectionIcon aria-hidden="true" />
              <strong>{stop.onward.durationLabel}</strong>
            </div>}
          </li>;
        })}
      </ol>
    </section>

    <section className={styles.itinerarySection} aria-labelledby="route-itinerary-heading">
      <header className={styles.compactHeading}>
        <div><p className={styles.eyebrow}>Your itinerary</p><h2 id="route-itinerary-heading">A clear rhythm, stop by stop</h2></div>
        <span>{detail.durationDays} days · {detail.totalNights} nights</span>
      </header>
      <ol className={styles.itineraryList}>
        {detail.stops.map((stop, index) => <li key={stop.id}>
          <span className={styles.itineraryNumber}>{index + 1}</span>
          <div className={styles.itineraryPlace}><strong>{stop.name}</strong><span>{stop.country}</span></div>
          <div className={styles.itineraryDays}>{stop.dayLabel}</div>
          <p>{stop.reason}</p>
          <div className={styles.itineraryStay}><MoonStar aria-hidden="true" /><strong>{nightLabel(stop.nights)}</strong><span>Planned stay</span></div>
        </li>)}
      </ol>
    </section>

    {detail.attractions.length > 0 && <section className={styles.attractionsSection} aria-labelledby="route-attractions-heading">
      <header className={styles.compactHeading}>
        <div><p className={styles.eyebrow}>Key attractions</p><h2 id="route-attractions-heading">The moments worth making time for</h2></div>
        <p>Anchors for the route, not a checklist for every day.</p>
      </header>
      <div className={styles.attractionGrid}>
        {detail.attractions.slice(0, 5).map((attraction, index) => <article key={attraction.name}>
          <RouteAttractionImage
            routeKey={detail.key}
            attraction={attraction.name}
            stop={attraction.stopName}
            country={detail.stops.find((stop) => stop.name === attraction.stopName)?.country ?? detail.countries[0] ?? ""}
            index={index}
            fallbackImage={detail.heroImage}
          />
          <div className={styles.attractionCopy}><h3>{attraction.name}</h3>{attraction.stopName && <p>{attraction.stopName}</p>}</div>
        </article>)}
      </div>
    </section>}

    <section className={styles.notesSection} aria-labelledby="route-notes-heading">
      <header className={styles.compactHeading}>
        <div><p className={styles.eyebrow}>Travel notes</p><h2 id="route-notes-heading">Plan smart, travel better</h2></div>
        <span>Reviewed {detail.reviewedAt}</span>
      </header>
      <div className={styles.notesGrid}>
        {detail.bestTime && <article><CalendarDays aria-hidden="true" /><div><h3>Best time to go</h3><p>{detail.bestTime}</p></div></article>}
        <article><Compass aria-hidden="true" /><div><h3>What this route suits</h3><p>{detail.summary}</p></div></article>
        {detail.conditions && <article><CloudSun aria-hidden="true" /><div><h3>Conditions</h3><p>{detail.conditions}</p></div></article>}
        {detail.seasonalNotes.slice(0, 2).map((note, index) => <article key={note}>{index === 0 ? <Gauge aria-hidden="true" /> : <Globe2 aria-hidden="true" />}<div><h3>{index === 0 ? "Seasonal context" : "Planning context"}</h3><p>{note}</p></div></article>)}
        {detail.countryContext && <article><MapPin aria-hidden="true" /><div><h3>Route character</h3><p>{detail.countryContext}</p></div></article>}
      </div>
      <div className={styles.provenance}>
        <div><Check aria-hidden="true" /><span>Editorial route reviewed {detail.reviewedAt} · confidence: {detail.confidence.replace("-", " ")}</span></div>
        {detail.sources.length > 0 && <div className={styles.sourceLinks}>{detail.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}<ExternalLink aria-hidden="true" /><small>{source.covers}</small></a>)}</div>}
      </div>
    </section>

    <section className={`${styles.finalCta} ${detail.heroImage ? styles.finalCtaWithImage : ""}`}>
      {detail.heroImage && <div className={styles.finalCtaImage} role="img" aria-label={`${detail.title} landscape`} style={{ backgroundImage: `url(${detail.heroImage})` }} />}
      <div className={styles.finalCtaCopy}><p className={styles.eyebrow}>Make it yours</p><h2>Start with this route.<br />Shape every day around you.</h2></div>
      <ul>
        <li><CheckCircle2 aria-hidden="true" /> Change dates, nights and stops</li>
        <li><CheckCircle2 aria-hidden="true" /> Keep the route order as your starting point</li>
        <li><CheckCircle2 aria-hidden="true" /> Build an editable day-by-day plan</li>
      </ul>
      <div><RoutePlanLink className={styles.planButton} draft={detail.planDraft} placement="final" /><span>It takes a couple of minutes to get started.</span></div>
    </section>
  </>;
}
