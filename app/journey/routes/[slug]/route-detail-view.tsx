import type { ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, ChevronDown, Globe2, MapPin, MoonStar } from "lucide-react";
import Link from "next/link";
import type { PublicRouteDetail } from "@/lib/easyt/public-route";
import { affiliateProviderLabel, getCurrentPartnerAction, type ResolvedAffiliateAction } from "@/lib/easyt/booking-readiness";
import { affiliateDisclosure, MorroviaAffiliateLink } from "@/components/easyt/affiliate-link";
import { EasyTLinkButton } from "@/components/easyt/easyt-controls";
import { MorroviaStatusBanner } from "@/components/easyt/morrovia-feedback";
import EasyTNavigation from "../../easyt-navigation";
import RouteDetailPhoto from "./route-detail-photo";
import RouteMapSummary from "./route-map-summary";
import RoutePlanLink from "./route-plan-link";
import RouteRelatedRoutes from "./route-related-routes";
import { routeDetailPresentation, relatedRouteDetails } from "./route-detail-presentation";
import { nightLabel, transferStatus } from "./route-detail-labels";
import type { RouteMapSelection } from "./route-map-selection";
import styles from "./route-overview.module.css";

export default function RouteDetailView({ detail, activityAction, navigation, hiddenRouteKeys = [], initialMapSelection = null }: {
  detail: PublicRouteDetail; activityAction?: ResolvedAffiliateAction | null; navigation?: ReactNode; hiddenRouteKeys?: string[]; initialMapSelection?: RouteMapSelection;
}) {
  const visual = routeDetailPresentation(detail);
  const related = relatedRouteDetails(detail, hiddenRouteKeys);
  const experienceAction = activityAction === undefined ? getCurrentPartnerAction("activities") : activityAction;
  const release = visual.release;
  const transportModes = [...new Set(detail.stops.flatMap(stop => stop.onward?.mode ? [stop.onward.mode] : []))];
  const pendingConnections = detail.stops.filter(stop => stop.onward && (stop.onward.planningMinutes === null || stop.onward.confidence === "needs-review")).length;
  const whenGuidance = detail.conditions ?? detail.seasonalNotes[0] ?? "No seasonal guidance is recorded yet.";
  const worthKnowing = (detail.bestTime || detail.conditions ? detail.seasonalNotes : detail.seasonalNotes.slice(1)).join(" ") || detail.countryContext || "No additional route context is recorded yet.";
  return <>
    <a className={styles.skipLink} href="#route-title">Skip to this route</a>
    <section className={`${styles.hero} ${visual.hero ? "" : styles.heroMissing}`} aria-labelledby="route-title">
      <RouteDetailPhoto photo={visual.hero} label={detail.title} eager landscape className={styles.heroPhoto} />
      <div className={styles.navigation}>{navigation ?? <EasyTNavigation current="routes" deferPrefetch />}</div>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>{detail.countries.join(" · ")} · {detail.stops.length} stops</p>
        <h1 id="route-title" tabIndex={-1} aria-label={detail.title}>{visual.title}{visual.emphasis && <><span className={styles.srOnly}>,</span><em>{visual.emphasis}</em></>}</h1>
        <p className={styles.routeOrder}>{detail.stops.map(stop => stop.name).join(" → ")}</p>
        <p className={styles.heroMeta}><span>{visual.character}</span><span>{detail.durationDays} days · example starting point</span></p>
        <div className={styles.heroActions}>
          <RoutePlanLink className={styles.onPhoto} draft={detail.planDraft} placement="hero">Start with this route</RoutePlanLink>
          <EasyTLinkButton href="#route-map" variant="quiet" className={styles.photoLink} icon={ArrowDown}>See the whole route</EasyTLinkButton>
        </div>
        <p className={styles.editable}>A thoughtful first route. Every stop and night is yours to shape.</p>
      </div>
    </section>

    <div className={`${styles.intro} ${styles.wrap}`}>
      <div><p className={styles.eyebrow}>A starting point</p><h2>Different places.<br /><em>One connected journey.</em></h2></div>
      <div><p>{detail.summary}</p><dl className={styles.heroFacts}>
        <div><dt>Bases</dt><dd>{detail.stops.length}</dd></div>
        <div><dt>{detail.countries.length === 1 ? "Country" : "Countries"}</dt><dd>{detail.countries.length}</dd></div>
        <div><dt>Example nights</dt><dd>{detail.totalNights}</dd></div>
      </dl></div>
    </div>

    <nav className={`${styles.routeNavigation} ${styles.wrap}`} aria-label="This route">
      <EasyTLinkButton href="#route-places" variant="quiet">The places</EasyTLinkButton>
      <EasyTLinkButton href="#route-pacing" variant="quiet">The pace</EasyTLinkButton>
      <EasyTLinkButton href="#route-map" variant="quiet">The whole route</EasyTLinkButton>
    </nav>
    <div className={styles.journeyFlow}>
      <section className={`${styles.sequenceSection} ${styles.wrap}`} id="route-places" aria-labelledby="route-sequence-heading">
        <header className={styles.sectionHeading}><p className={styles.eyebrow}>The places, in order</p><h2 id="route-sequence-heading">Let the route <em>unfold.</em></h2><p>Follow each place into the next.</p></header>
        <ol className={styles.chapterList}>{detail.stops.map((stop, index) => {
          const guide = visual.nights[index];
          return <li className={styles.chapter} key={stop.id} id={`route-stop-${index}`}>
            {(index === 0 || stop.country !== detail.stops[index - 1].country) && <p className={styles.countryTransition}><Globe2 aria-hidden="true" />{index === 0 ? "Begin in" : `${detail.stops[index - 1].country} →`} <strong>{stop.country}</strong></p>}
            <article className={styles.chapterContent}>
              <div className={styles.chapterVisual}><RouteDetailPhoto photo={visual.photos[index]} label={`${stop.name}, ${stop.country}`} /><span className={styles.chapterNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{visual.photoCaptions[index] && <p className={styles.editorialCaption}>{visual.photoCaptions[index]}</p>}</div>
              <div className={styles.chapterCopy}><p className={styles.eyebrow}>Stop {String(index + 1).padStart(2, "0")} · {stop.country}</p><h3>{stop.name}</h3><p className={styles.stopRole}>{stop.reason}</p>
                {guide.minimum !== null && <p className={styles.minimum}><MoonStar aria-hidden="true" />Minimum {nightLabel(guide.minimum)}</p>}
                <EasyTLinkButton href={`#route-map-stop-${index}`} variant="quiet" icon={MapPin}>See {stop.name} on the map</EasyTLinkButton>
              </div>
            </article>
            {stop.onward && <Link href={`#route-map-connection-${index}`} className={styles.transfer} prefetch={false}>
              <span className={styles.connectionTrack} aria-hidden="true" /><span>{stop.onward.from}<ArrowRight aria-hidden="true" />{stop.onward.to}</span><small>{transferStatus(stop.onward)}</small><ArrowUpRight aria-hidden="true" />
            </Link>}
          </li>;
        })}</ol>
      </section>

      <section className={styles.itinerarySection} id="route-pacing" aria-labelledby="route-itinerary-heading">
        <div className={`${styles.wrap} ${styles.pacingLayout}`}>
          <header className={styles.pacingIntro}><p className={styles.eyebrow}>Room to be there</p><h2 id="route-itinerary-heading">The places matter.<br /><em>So does the pace.</em></h2><p>Recommended stays give each base a clear role. Minimums show where compressing the route starts to weaken it.</p><p className={styles.pacingTotal}><strong>{detail.totalNights}</strong><span>nights<br />in the {detail.durationDays}-day example</span></p><RoutePlanLink draft={detail.planDraft} placement="hero">Shape the nights in Builder</RoutePlanLink></header>
          <div><ol className={styles.nightLedger}>{detail.stops.map((stop, index) => {
            const guide = visual.nights[index];
            return <li key={stop.id}><article className={styles.pacingStop}><span className={styles.pacingIndex} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div className={styles.pacingCopy}><p>{stop.country}</p><h3>{stop.name}</h3><p>{guide.rationale ?? stop.reason}</p></div><div className={styles.nightValues}><span>{guide.recommended !== null ? "Recommended" : "Example stay"}<b>{nightLabel(guide.recommended ?? stop.nights)}</b></span><span>{guide.minimum !== null ? <>Minimum <b>{nightLabel(guide.minimum)}</b></> : <>Minimum <b>Not recorded</b></>}</span></div></article>{stop.onward && <Link href={`#route-map-connection-${index}`} prefetch={false} className={styles.pacingTransfer}><span>{stop.onward.from} → {stop.onward.to}</span><small>{transferStatus(stop.onward)}</small><ArrowUpRight aria-hidden="true" /></Link>}</li>;
          })}</ol>
          </div>
        </div>
      </section>
    </div>

    <section className={`${styles.overviewSection} ${styles.wrap}`} id="route-map" aria-labelledby="route-map-heading" tabIndex={-1}>
      <header className={styles.sectionHeading}><p className={styles.eyebrow}>The geography of your journey</p><h2 id="route-map-heading" tabIndex={-1}>Now it <em>fits together.</em></h2></header>
      <RouteMapSummary title={detail.title} stops={detail.stops} countries={detail.countries} nights={visual.nights} durationDays={detail.durationDays} totalNights={detail.totalNights} character={visual.character} rationale={release?.routeOrderRationale} warning={detail.warnings.at(-1)} initialSelection={initialMapSelection} />
      <p className={styles.mapNote}>The line shows the sequence between bases, not an exact road, rail or flight path.</p>
      <ul className={styles.geographyReasons}>{detail.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
    </section>

    {visual.experiences.length > 0 && <section className={`${styles.experiencesSection} ${styles.wrap}`} id="route-experiences" aria-labelledby="route-experiences-heading"><header className={styles.experienceHeading}><div><p className={styles.eyebrow}>Make time for</p><h2 id="route-experiences-heading">Moments along <em>the way.</em></h2></div><p>The places you sleep are only the beginning. Make room for what brings you here.</p></header><ol className={styles.experienceGrid}>{visual.experiences.map((experience, index) => <li key={experience.name} className={styles.experienceCard}><RouteDetailPhoto photo={experience.photo} label={experience.name} landscape /><div className={styles.experienceCopy}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div><h3>{experience.name}</h3>{experience.stopName && <p>Base · {experience.stopName}</p>}{experience.photoQualification && <small>{experience.photoQualification}</small>}</div></div></li>)}</ol>
      {experienceAction && <aside className={styles.experienceBooking} aria-label="Activity booking options"><div><span>Booking options from {affiliateProviderLabel(experienceAction.provider)}</span><p>Browse tours, activities and tickets around these bases. Availability and details remain with the provider.</p></div><div><MorroviaAffiliateLink action={experienceAction} context={{ placement: "route_detail_experiences", destinationCount: detail.stops.length }} /><small>{affiliateDisclosure}</small></div></aside>}
    </section>}

    <section className={`${styles.practicalSection} ${styles.wrap}`} id="route-notes" aria-labelledby="route-notes-heading"><header className={styles.sectionHeading}><p className={styles.eyebrow}>Practical route notes</p><h2 id="route-notes-heading">Before you <em>make it yours.</em></h2></header><div className={styles.practicalGrid}>
      <article><span>01</span><h3>When to go</h3>{detail.bestTime && <strong>{detail.bestTime}</strong>}<p>{whenGuidance}</p></article>
      <article><span>02</span><h3>Getting around</h3><strong>{transportModes.length ? transportModes.map(mode => mode[0].toUpperCase() + mode.slice(1)).join(" + ") : "Transport to confirm"}</strong><p>Connections are planning context rather than live schedules.</p></article>
      <article><span>03</span><h3>Worth knowing</h3><p>{worthKnowing}</p></article>
      <article><span>04</span><h3>Still to check</h3><strong>{pendingConnections ? `${pendingConnections} ${pendingConnections === 1 ? "connection" : "connections"}` : "No flagged connections"}</strong><p>{pendingConnections ? "Confirm current schedules, changes and reservations for your dates." : "Review current travel conditions before booking."}</p></article>
    </div></section>

    <section className={`${styles.sourcesSection} ${styles.wrap}`} aria-label="Sources and editorial review"><details className={`${styles.disclosure} ${styles.sourcesDisclosure}`}><summary><span><strong>Sources &amp; review</strong><small>Full provenance, editorial status and known unknowns</small></span><span>{detail.sources.length} sources · reviewed {detail.reviewedAt}</span><ChevronDown aria-hidden="true" /></summary><div className={styles.sourcesBody}><div><MorroviaStatusBanner tone={detail.confidence === "needs-review" ? "warning" : "info"} title={`Editorial record · ${detail.confidence.replaceAll("-", " ")} confidence`} detail={`Reviewed ${detail.reviewedAt}`} />{release?.editorialOwner && <p>Prepared by {release.editorialOwner}</p>}{release?.editorialReviewer && <p>Reviewed by {release.editorialReviewer}</p>}<p>{detail.eyebrow}</p>{detail.rhythm && <p>Pacing: {detail.rhythm}</p>}{detail.countryContext && <p>{detail.countryContext}</p>}</div><div>{release?.explicitUnknowns?.map((unknown, index) => <p key={index}><strong>{unknown.reference}</strong><br />{unknown.reason}</p>)}{detail.sources.map(source => <a className={styles.sourceLink} key={source.url} href={source.url} target="_blank" rel="noreferrer"><strong>{source.label}<ArrowUpRight aria-hidden="true" /></strong><span>{source.covers}</span>{source.checkedAt && <small>Checked {source.checkedAt}</small>}{source.limitations && <small>{source.limitations}</small>}</a>)}</div></div></details></section>

    {related.length > 0 && <section className={`${styles.alternatives} ${styles.wrap}`} aria-labelledby="related-routes-heading"><header><div><p className={styles.eyebrow}>Another way to go</p><h2 id="related-routes-heading">Follow your <em>curiosity.</em></h2></div><EasyTLinkButton href="/journey/discover" variant="quiet" icon={ArrowRight} prefetch={false}>Explore all routes</EasyTLinkButton></header><RouteRelatedRoutes routes={related} /></section>}

    <section className={styles.finalCta} aria-labelledby="route-closing-heading"><RouteDetailPhoto photo={visual.closing} label={detail.title} landscape className={styles.heroPhoto} /><div className={styles.closingCopy}><p className={styles.eyebrow}>{detail.countries.join(" · ")} · Your next chapter</p><h2 id="route-closing-heading">Take this route.<br /><em>Make it yours.</em></h2><p>Our starting point. Your dates, nights and discoveries.</p><div className={styles.heroActions}><RoutePlanLink className={styles.onPhoto} draft={detail.planDraft} placement="final">Start with this route</RoutePlanLink><EasyTLinkButton href="/journey/discover" prefetch={false} variant="quiet" className={styles.photoLink} icon={ArrowUpRight}>Explore other routes</EasyTLinkButton></div></div></section>
  </>;
}
