import type { ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, CalendarDays, Globe2, ImageOff, MapPin, MoonStar } from "lucide-react";
import { EasyTLinkButton } from "@/components/easyt/easyt-controls";
import { MorroviaStatusBanner } from "@/components/easyt/morrovia-feedback";
import ResilientImage from "@/components/easyt/resilient-image";
import type { PersonalRouteImage, PersonalRoutePresentation } from "@/lib/easyt/personal-route";
import { personalRouteBackHref, personalRouteNightLabel } from "@/lib/easyt/personal-route";
import RouteMapSummary from "@/app/journey/routes/[slug]/route-map-summary";
import routeStyles from "@/app/journey/routes/[slug]/route-overview.module.css";
import styles from "./personal-route.module.css";

function PersonalRoutePhoto({ image, label, className = "" }: { image: PersonalRouteImage | null; label: string; className?: string }) {
  return <figure className={`${routeStyles.photo} ${image ? "" : routeStyles.photoMissing} ${className}`}>
    <ResilientImage
      key={image?.src ?? label}
      src={image?.src}
      alt={image?.alt ?? ""}
      loading={className.includes(routeStyles.heroPhoto) ? "eager" : "lazy"}
      fetchPriority={className.includes(routeStyles.heroPhoto) ? "high" : "auto"}
      decoding="async"
      fallback={<div className={routeStyles.photoFallback}><ImageOff aria-hidden="true" /><span>{label}</span><small>Photography not yet available for this stop</small></div>}
    />
  </figure>;
}

export default function PersonalRouteView({ presentation, navigation }: { presentation: PersonalRoutePresentation; navigation: ReactNode }) {
  const mappedCount = presentation.stops.filter((stop) => stop.coordinates).length;
  const knownNightCount = presentation.stops.filter((stop) => stop.nights !== null).length;
  const highlightStops = new Map(presentation.stops.map((stop) => [stop.id, stop.name]));
  return <main className={`${routeStyles.page} ${styles.page}`}>
    <a className={routeStyles.skipLink} href="#personal-route-title">Skip to your route</a>
    <section className={`${routeStyles.hero} ${presentation.hero ? "" : `${routeStyles.heroMissing} ${styles.heroMissing}`}`} aria-labelledby="personal-route-title">
      <PersonalRoutePhoto image={presentation.hero} label={presentation.title} className={routeStyles.heroPhoto} />
      <div className={routeStyles.navigation}>{navigation}</div>
      <div className={routeStyles.heroCopy}>
        <p className={routeStyles.eyebrow}>Your journey · {presentation.stops.length} {presentation.stops.length === 1 ? "stop" : "stops"}</p>
        <h1 className={styles.title} id="personal-route-title" tabIndex={-1}>{presentation.title}</h1>
        <p className={routeStyles.routeOrder}>{presentation.routeOrder}</p>
        <p className={routeStyles.heroMeta}><span>{presentation.dateLabel}</span><span>{presentation.character}</span></p>
        <div className={routeStyles.heroActions}>
          <EasyTLinkButton className={routeStyles.onPhoto} href={personalRouteBackHref(presentation.tripId)} variant="secondary">Back to planning</EasyTLinkButton>
          <EasyTLinkButton href="#route-map" variant="quiet" className={routeStyles.photoLink} icon={ArrowDown}>See the whole route</EasyTLinkButton>
        </div>
        <p className={routeStyles.editable}>A read-only view of the plan you have shaped in Morrovia.</p>
      </div>
    </section>

    <div className={`${routeStyles.intro} ${routeStyles.wrap}`}>
      <div><p className={routeStyles.eyebrow}>Your finished plan</p><h2>The stops, dates and choices.<br /><em>One connected journey.</em></h2></div>
      <div><p>{presentation.summary}</p><dl className={routeStyles.heroFacts}>
        <div><dt>Stops</dt><dd>{presentation.stops.length}</dd></div>
        <div><dt>{presentation.countries.length === 1 ? "Country" : "Countries"}</dt><dd>{presentation.countries.length || "—"}</dd></div>
        <div><dt>Nights</dt><dd>{presentation.totalNights ?? "—"}</dd></div>
      </dl></div>
    </div>

    <nav className={`${routeStyles.routeNavigation} ${routeStyles.wrap}`} aria-label="Your route sections">
      <EasyTLinkButton href="#route-places" variant="quiet">The places</EasyTLinkButton>
      <EasyTLinkButton href="#route-pacing" variant="quiet">The nights</EasyTLinkButton>
      <EasyTLinkButton href="#route-map" variant="quiet">The whole route</EasyTLinkButton>
      {presentation.highlights.length ? <EasyTLinkButton href="#route-highlights" variant="quiet">Planned highlights</EasyTLinkButton> : null}
    </nav>

    <div className={routeStyles.journeyFlow}>
      <section className={`${routeStyles.sequenceSection} ${routeStyles.wrap}`} id="route-places" aria-labelledby="personal-route-sequence-heading">
        <header className={routeStyles.sectionHeading}><p className={routeStyles.eyebrow}>The places, in order</p><h2 id="personal-route-sequence-heading">Let your route <em>unfold.</em></h2><p>Each visit keeps its own identity, including return stops.</p></header>
        {presentation.stops.length ? <ol className={routeStyles.chapterList}>{presentation.stops.map((stop, index) => <li className={routeStyles.chapter} key={stop.id} id={`route-stop-${index}`}>
          {(index === 0 || stop.country !== presentation.stops[index - 1]?.country) ? <div className={routeStyles.countryTransition}><Globe2 aria-hidden="true" /><span>{index === 0 ? "Beginning in" : "Continuing through"}</span><strong>{stop.country}</strong></div> : null}
          <article className={routeStyles.chapterContent}>
            <div className={routeStyles.chapterVisual}><PersonalRoutePhoto image={stop.image} label={stop.name} /><span className={routeStyles.chapterNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span></div>
            <div className={routeStyles.chapterCopy}>
              <p className={routeStyles.eyebrow}>{stop.dayLabel}</p>
              <h3>{stop.name}</h3>
              <p className={routeStyles.stopRole}>{stop.reason}</p>
              <p className={routeStyles.minimum}><MoonStar aria-hidden="true" />{personalRouteNightLabel(stop.nights)}</p>
              {stop.coordinates ? <EasyTLinkButton href={`#route-map-stop-${index}`} variant="quiet" icon={MapPin}>See {stop.name} on the map</EasyTLinkButton> : <p className={styles.unknownFact}><MapPin aria-hidden="true" />Map position to confirm</p>}
            </div>
          </article>
          {stop.onward ? <a href={`#route-map-connection-${index}`} className={routeStyles.transfer}>
            <span className={routeStyles.connectionTrack} aria-hidden="true" /><span>{stop.onward.from}<ArrowRight aria-hidden="true" />{stop.onward.to}</span><small>{stop.onward.modeLabel} · {stop.onward.durationLabel}</small><ArrowUpRight aria-hidden="true" />
          </a> : null}
        </li>)}</ol> : <MorroviaStatusBanner title="Your route needs a first stop" detail="Return to planning to add the first place in this journey." />}
      </section>

      <section className={routeStyles.itinerarySection} id="route-pacing" aria-labelledby="personal-route-pacing-heading">
        <div className={`${routeStyles.wrap} ${routeStyles.pacingLayout}`}>
          <header className={routeStyles.pacingIntro}><p className={routeStyles.eyebrow}>The shape of your trip</p><h2 id="personal-route-pacing-heading">Time in each place.<br /><em>As you planned it.</em></h2><p>Only dates and nights saved on this trip are shown. Missing details remain clearly marked.</p><p className={routeStyles.pacingTotal}><strong>{presentation.totalNights ?? "—"}</strong><span>{presentation.totalNights === null ? `${knownNightCount} of ${presentation.stops.length} stops have known nights` : `nights across ${presentation.durationDays ?? "your"} days`}</span></p></header>
          <ol className={routeStyles.nightLedger}>{presentation.stops.map((stop, index) => <li key={stop.id}><article className={routeStyles.pacingStop}><span className={routeStyles.pacingIndex} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div className={routeStyles.pacingCopy}><p>{stop.country}</p><h3>{stop.name}</h3><p>{stop.dayLabel}</p></div><div className={routeStyles.nightValues}><span>Planned stay<b>{personalRouteNightLabel(stop.nights)}</b></span></div></article>{stop.onward ? <a href={`#route-map-connection-${index}`} className={routeStyles.pacingTransfer}><span>{stop.onward.from} → {stop.onward.to}</span><small>{stop.onward.modeLabel} · {stop.onward.durationLabel}</small><ArrowUpRight aria-hidden="true" /></a> : null}</li>)}</ol>
        </div>
      </section>
    </div>

    <section className={`${routeStyles.overviewSection} ${routeStyles.wrap}`} id="route-map" aria-labelledby="personal-route-map-heading" tabIndex={-1}>
      <header className={routeStyles.sectionHeading}><p className={routeStyles.eyebrow}>The geography of your journey</p><h2 id="personal-route-map-heading" tabIndex={-1}>See how it <em>fits together.</em></h2></header>
      {presentation.stops.length ? <RouteMapSummary title={presentation.title} stops={presentation.stops} countries={presentation.countries.length ? presentation.countries : ["Countries to confirm"]} nights={presentation.stops.map((stop) => ({ minimum: null, recommended: stop.nights }))} durationDays={presentation.durationDays} totalNights={presentation.totalNights} character={presentation.character} rationale={presentation.summary} warning={mappedCount < presentation.stops.length ? `${presentation.stops.length - mappedCount} ${presentation.stops.length - mappedCount === 1 ? "stop does" : "stops do"} not yet have trustworthy coordinates.` : undefined} tripFacts /> : null}
      <p className={routeStyles.mapNote}>The line shows the sequence between mapped stops, not an exact road, rail or flight path.</p>
    </section>

    {presentation.highlights.length ? <section className={`${routeStyles.experiencesSection} ${routeStyles.wrap} ${styles.highlights}`} id="route-highlights" aria-labelledby="personal-route-highlights-heading">
      <header className={routeStyles.experienceHeading}><div><p className={routeStyles.eyebrow}>Already in your plan</p><h2 id="personal-route-highlights-heading">Highlights you <em>chose.</em></h2></div><p>These are selected or scheduled items from the current trip, not new recommendations.</p></header>
      <ol className={routeStyles.experienceGrid}>{presentation.highlights.slice(0, 6).map((highlight, index) => <li key={highlight.id} className={routeStyles.experienceCard}><PersonalRoutePhoto image={highlight.image} label={highlight.title} /><div className={routeStyles.experienceCopy}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div><h3>{highlight.title}</h3><p>{highlightStops.get(highlight.stopId) ?? "Stop to confirm"}</p><small><CalendarDays aria-hidden="true" />{highlight.dateLabel}</small></div></div></li>)}</ol>
    </section> : null}

    {presentation.missingFacts.length ? <section className={`${routeStyles.sourcesSection} ${routeStyles.wrap} ${styles.truth}`} aria-label="Details still to confirm"><MorroviaStatusBanner tone="warning" title="A few details are still to confirm" detail={presentation.missingFacts.join(" ")} /></section> : null}

    <section className={`${styles.closing} ${routeStyles.wrap}`} aria-labelledby="personal-route-closing-heading">
      <p className={routeStyles.eyebrow}>Your plan remains the source of truth</p>
      <h2 id="personal-route-closing-heading">Keep shaping the trip.<br /><em>This view will follow.</em></h2>
      <EasyTLinkButton href={personalRouteBackHref(presentation.tripId)} variant="secondary">Back to planning</EasyTLinkButton>
    </section>
  </main>;
}
