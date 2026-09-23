import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight, ChevronDown, Globe2, MapPin, MoonStar } from "lucide-react";
import Link from "next/link";
import type { PublicRouteDetail } from "@/lib/easyt/public-route";
import { affiliateProviderLabel, getCurrentPartnerAction, type ResolvedAffiliateAction } from "@/lib/easyt/booking-readiness";
import { affiliateDisclosure, MorroviaAffiliateLink } from "@/components/easyt/affiliate-link";
import { MorroviaStatusBanner } from "@/components/easyt/morrovia-feedback";
import EasyTNavigation from "../../easyt-navigation";
import RouteDetailPhoto from "./route-detail-photo";
import RouteMapSummary from "./route-map-summary";
import RoutePlanLink from "./route-plan-link";
import { routeDetailPresentation, routeDiscoveryPresentation } from "./route-detail-presentation";
import { nightLabel, transferStatus } from "./route-detail-labels";
import type { RouteMapSelection } from "./route-map-selection";
import styles from "./route-overview.module.css";

export default function RouteDetailView({ detail, activityAction, navigation, initialMapSelection = null }: {
  detail: PublicRouteDetail;
  activityAction?: ResolvedAffiliateAction | null;
  navigation?: ReactNode;
  hiddenRouteKeys?: string[];
  initialMapSelection?: RouteMapSelection;
}) {
  const visual = routeDetailPresentation(detail);
  const discovery = routeDiscoveryPresentation(detail);
  const experienceAction = activityAction === undefined ? getCurrentPartnerAction("activities") : activityAction;
  const release = visual.release;
  const pendingConnections = detail.stops.filter(stop => stop.onward && (stop.onward.planningMinutes === null || stop.onward.confidence === "needs-review")).length;
  const practical = discovery.practical.filter(item => item !== detail.conditions);
  const distinctArc = discovery.story.arc && discovery.story.arc !== discovery.story.promise ? discovery.story.arc : null;
  const distinctBestFor = discovery.story.bestFor !== discovery.story.promise ? discovery.story.bestFor : null;
  const showFallbackReasons = !distinctArc && !discovery.story.rhythm && !distinctBestFor;
  const practicalCards: Array<{ title: string; strong?: string; copy?: string }> = [
    ...((detail.bestTime || detail.conditions) ? [{ title: "When to go", strong: detail.bestTime, copy: detail.conditions }] : []),
    ...practical.map(note => ({ title: "Worth knowing", copy: note })),
    ...(pendingConnections > 0 ? [{ title: "Connections to confirm", strong: `${pendingConnections} ${pendingConnections === 1 ? "leg" : "legs"}`, copy: "Confirm current schedules, changes and reservations for your dates." }] : []),
  ];

  return <>
    <a className={styles.skipLink} href="#route-title">Skip to this route</a>
    <section className={`${styles.hero} ${visual.hero ? "" : styles.heroMissing}`} aria-labelledby="route-title">
      <RouteDetailPhoto photo={visual.hero} label={detail.title} eager landscape className={styles.heroPhoto} />
      <div className={styles.navigation}>{navigation ?? <EasyTNavigation current="routes" deferPrefetch />}</div>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>{detail.countries.join(" · ")} · {detail.stops.length} stops</p>
        <h1 id="route-title" tabIndex={-1} aria-label={detail.title}>{visual.title}{visual.emphasis && <><span className={styles.srOnly}>,</span><em>{visual.emphasis}</em></>}</h1>
        <p className={styles.heroPromise}>{discovery.story.promise}</p>
        <p className={styles.routeOrder}>{detail.stops.map(stop => stop.name).join(" → ")}</p>
        <div className={styles.heroActions}><RoutePlanLink className={styles.onPhoto} draft={detail.planDraft} placement="hero">Plan this route</RoutePlanLink></div>
        <p className={styles.editable}>Use this reviewed route as your starting point, then shape the dates and nights in Builder.</p>
      </div>
    </section>

    <section className={`${styles.whySection} ${styles.wrap}`} id="route-why" aria-labelledby="route-why-heading">
      <header className={styles.sectionHeading}><p className={styles.eyebrow}>Why this route</p><h2 id="route-why-heading">A journey with a <em>clear shape.</em></h2></header>
      <div className={styles.whyLayout}>
        <div className={styles.whyStory}>
          {distinctArc && <p>{distinctArc}</p>}
          {discovery.story.rhythm && <p><strong>Trip rhythm</strong>{discovery.story.rhythm}</p>}
          {distinctBestFor && <p><strong>Best for</strong>{distinctBestFor}</p>}
          {showFallbackReasons && <ul className={styles.whyFallback}>{discovery.story.fallbackReasons.map(item => <li key={item.name}><strong>{item.name}</strong><span>{item.reason}</span></li>)}</ul>}
          <ul className={styles.styleSignals} aria-label="Travel styles">{discovery.story.styleSignals.map(signal => <li key={signal}>{signal}</li>)}</ul>
        </div>
        <dl className={styles.heroFacts}>
          <div><dt>Duration</dt><dd>{detail.durationDays} days</dd></div>
          <div><dt>Places</dt><dd>{detail.stops.length}</dd></div>
          <div><dt>{detail.countries.length === 1 ? "Country" : "Countries"}</dt><dd>{detail.countries.length}</dd></div>
        </dl>
      </div>
    </section>

    {discovery.isRich && <section className={`${styles.highlightsSection} ${styles.wrap}`} id="route-highlights" aria-labelledby="route-highlights-heading">
      <header className={styles.sectionHeading}><p className={styles.eyebrow}>Trip highlights</p><h2 id="route-highlights-heading">What stays with <em>you.</em></h2></header>
      <ol className={styles.highlightGrid}>{discovery.highlights.map((highlight, index) => <li className={styles.highlightCard} key={highlight.id}>
        <RouteDetailPhoto photo={highlight.photo} label={highlight.title} landscape />
        <div><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><h3>{highlight.title}</h3><p>{highlight.context}</p><small>{highlight.stopName}</small></div>
      </li>)}</ol>
    </section>}

    <section className={`${styles.journeySection} ${styles.wrap}`} id="route-journey" aria-labelledby="route-journey-heading">
      <header className={styles.sectionHeading}><p className={styles.eyebrow}>Journey and geography</p><h2 id="route-journey-heading">See why each place <em>belongs.</em></h2><p>The sequence, pacing and connections are one coordinated journey.</p></header>
      <div className={styles.journeyLayout}>
        <ol className={styles.journeyList}>{detail.stops.map((stop, index) => {
          const guide = visual.nights[index];
          return <li className={styles.journeyStop} key={stop.id} id={`route-stop-${index}`}>
            {(index === 0 || stop.country !== detail.stops[index - 1].country) && <p className={styles.countryTransition}><Globe2 aria-hidden="true" />{index === 0 ? "Begin in" : `${detail.stops[index - 1].country} →`} <strong>{stop.country}</strong></p>}
            <article>
              {visual.photos[index] && <div className={styles.journeyStopPhoto}><RouteDetailPhoto photo={visual.photos[index]} label={`${stop.name}, ${stop.country}`} landscape />{visual.photoCaptions[index] && <p className={styles.editorialCaption}>{visual.photoCaptions[index]}</p>}</div>}
              <div className={styles.journeyStopBody}>
                <p className={styles.eyebrow}>Stop {String(index + 1).padStart(2, "0")} · {stop.country}</p>
                <h3><Link className={styles.journeyStopHeading} href={`#route-map-stop-${index}`} prefetch={false}>{stop.name}<MapPin aria-hidden="true" /></Link></h3>
                <p>{stop.reason}</p>
                <div className={styles.journeyStopMeta}>
                  <span><MoonStar aria-hidden="true" />{guide.recommended !== null ? `${nightLabel(guide.recommended)} recommended` : `${nightLabel(stop.nights)} example stay`}</span>
                  {guide.minimum !== null && <span>Minimum {nightLabel(guide.minimum)}</span>}
                </div>
                {guide.rationale && <small>{guide.rationale}</small>}
              </div>
            </article>
            {stop.onward && <Link href={`#route-map-connection-${index}`} className={styles.journeyConnection} prefetch={false}>
              <span>{stop.onward.from}<ArrowRight aria-hidden="true" />{stop.onward.to}</span><small>{transferStatus(stop.onward)}</small><ArrowUpRight aria-hidden="true" />
            </Link>}
          </li>;
        })}</ol>
        <div className={styles.journeyMap} id="route-map" tabIndex={-1}>
          <RouteMapSummary title={detail.title} stops={detail.stops} countries={detail.countries} nights={visual.nights} durationDays={detail.durationDays} totalNights={detail.totalNights} character={visual.character} rationale={release?.routeOrderRationale} warning={detail.warnings.at(-1)} initialSelection={initialMapSelection} />
          <p className={styles.mapNote}>The line shows the sequence between bases, not an exact road, rail or flight path.</p>
        </div>
      </div>
    </section>

    {discovery.experiences.length > 0 && <section className={`${styles.experiencesSection} ${styles.wrap}`} id="route-experiences" aria-labelledby="route-experiences-heading">
      <header className={styles.experienceHeading}><div><p className={styles.eyebrow}>Explore this route</p><h2 id="route-experiences-heading">Signature moments, <em>in context.</em></h2></div><p>Reviewed experiences that fit the route without changing its overnight bases.</p></header>
      <ol className={styles.experienceGrid}>{discovery.experiences.map((experience, index) => <li key={`${experience.name}-${experience.stopName}`} className={styles.experienceCard}><RouteDetailPhoto photo={experience.photo} label={experience.name} landscape /><div className={styles.experienceCopy}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div><h3>{experience.name}</h3><p>From {experience.stopName}</p><small>{experience.context}</small></div></div></li>)}</ol>
      {experienceAction && <aside className={styles.experienceBooking} aria-label="Activity booking options"><div><span>Booking options from {affiliateProviderLabel(experienceAction.provider)}</span><p>Browse tours, activities and tickets around these bases. Availability and details remain with the provider.</p></div><div><MorroviaAffiliateLink action={experienceAction} context={{ placement: "route_detail_experiences", destinationCount: detail.stops.length }} /><small>{affiliateDisclosure}</small></div></aside>}
    </section>}

    {practicalCards.length > 0 && <section className={`${styles.practicalSection} ${styles.wrap}`} id="route-notes" aria-labelledby="route-notes-heading">
      <header className={styles.sectionHeading}><p className={styles.eyebrow}>Practical context</p><h2 id="route-notes-heading">What matters <em>before booking.</em></h2></header>
      <div className={styles.practicalGrid}>
        {practicalCards.map((card, index) => <article key={`${card.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><h3>{card.title}</h3>{card.strong && <strong>{card.strong}</strong>}{card.copy && <p>{card.copy}</p>}</article>)}
      </div>
    </section>}

    <section className={`${styles.sourcesSection} ${styles.wrap}`} aria-label="Sources and editorial review"><details className={`${styles.disclosure} ${styles.sourcesDisclosure}`}><summary><span><strong>Sources &amp; review</strong><small>Full provenance, editorial status and known unknowns</small></span><span>{detail.sources.length} sources · reviewed {detail.reviewedAt}</span><ChevronDown aria-hidden="true" /></summary><div className={styles.sourcesBody}><div><MorroviaStatusBanner tone={detail.confidence === "needs-review" ? "warning" : "info"} title={`Editorial record · ${detail.confidence.replaceAll("-", " ")} confidence`} detail={`Reviewed ${detail.reviewedAt}`} />{release?.editorialOwner && <p>Prepared by {release.editorialOwner}</p>}{release?.editorialReviewer && <p>Reviewed by {release.editorialReviewer}</p>}<p>{detail.eyebrow}</p></div><div>{release?.explicitUnknowns?.map((unknown, index) => <p key={index}><strong>{unknown.reference}</strong><br />{unknown.reason}</p>)}{detail.sources.map(source => <a className={styles.sourceLink} key={source.url} href={source.url} target="_blank" rel="noreferrer"><strong>{source.label}<ArrowUpRight aria-hidden="true" /></strong><span>{source.covers}</span>{source.checkedAt && <small>Checked {source.checkedAt}</small>}{source.limitations && <small>{source.limitations}</small>}</a>)}</div></div></details></section>

    <section className={styles.finalCta} id="route-plan" aria-labelledby="route-closing-heading"><RouteDetailPhoto photo={visual.closing} label={detail.title} landscape className={styles.heroPhoto} /><div className={styles.closingCopy}><p className={styles.eyebrow}>{detail.countries.join(" · ")} · Your next chapter</p><h2 id="route-closing-heading">Take this route.<br /><em>Make it yours.</em></h2><p>Keep the reviewed sequence, or shape the dates and nights around your trip.</p><div className={styles.heroActions}><RoutePlanLink className={styles.onPhoto} draft={detail.planDraft} placement="final">Plan this route</RoutePlanLink></div></div></section>
  </>;
}
