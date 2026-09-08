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
  return <>
    <a className={styles.skipLink} href="#route-title">Skip to this route</a>
    <section className={styles.hero} aria-labelledby="route-title">
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
              <div className={styles.chapterVisual}><RouteDetailPhoto photo={visual.photos[index]} label={`${stop.name}, ${stop.country}`} /><span className={styles.chapterNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span></div>
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
          <div><p className={styles.eyebrow}>Room to be there</p><h2 id="route-itinerary-heading">The places matter.<br /><em>So does the pace.</em></h2><p>Minimum stays protect time in each place. Reviewed guidance is a starting preference; your dates and nights stay editable.</p><RoutePlanLink draft={detail.planDraft} placement="hero">Shape the nights in Builder</RoutePlanLink></div>
          <div><ol className={styles.nightLedger}>{detail.stops.map((stop, index) => {
            const guide = visual.nights[index];
            return <li key={stop.id}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div><strong>{stop.name}</strong><small>{stop.country}</small>{guide.rationale && <p>{guide.rationale}</p>}</div><div className={styles.nightValues}>{guide.minimum !== null ? <span>Minimum <b>{nightLabel(guide.minimum)}</b></span> : <span>Minimum not recorded</span>}{guide.recommended !== null && <span>Reviewed guidance <b>{nightLabel(guide.recommended)}</b></span>}</div></li>;
          })}</ol>
          <details className={styles.disclosure}><summary>{detail.durationDays}-day example · {detail.totalNights} nights<ChevronDown aria-hidden="true" /></summary><p>A generated starting allocation, not a personalised recommendation.</p><ol className={styles.allocation}>{detail.stops.map(stop => <li key={stop.id}><strong>{stop.name}</strong><span>{stop.dayLabel}</span><span>{nightLabel(stop.nights)}</span></li>)}</ol></details>
          {detail.warnings.length > 0 && <MorroviaStatusBanner tone="warning" title="Worth knowing" detail={detail.warnings.join(" ")} />}
          </div>
        </div>
      </section>
    </div>

    <section className={`${styles.overviewSection} ${styles.wrap}`} id="route-map" aria-labelledby="route-map-heading" tabIndex={-1}>
      <header className={styles.sectionHeading}><p className={styles.eyebrow}>The geography of your journey</p><h2 id="route-map-heading" tabIndex={-1}>Now it <em>fits together.</em></h2></header>
      <RouteMapSummary title={detail.title} stops={detail.stops} countries={detail.countries} nights={visual.nights} initialSelection={initialMapSelection} />
      <p className={styles.mapNote}>The line shows the sequence between bases, not an exact road, rail or flight path.</p>
      <div className={styles.mapActions}><div><strong>A starting point, with room for you.</strong><p>Change the order. Adjust nights. Add a stop in Builder.</p></div><RoutePlanLink draft={detail.planDraft} placement="hero">Start with this route</RoutePlanLink></div>
    </section>

    <section className={`${styles.judgement} ${styles.wrap}`} aria-labelledby="route-reasons-heading">
      <div><p className={styles.eyebrow}>The thinking behind the journey</p><h2 id="route-reasons-heading">Why this <em>shape works.</em></h2></div>
      <div>{release?.routeOrderRationale && <p className={styles.rationale}>{release.routeOrderRationale}</p>}<ul>{detail.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div>
    </section>

    {detail.attractions.length > 0 && <section className={`${styles.attractionsSection} ${styles.wrap}`} aria-labelledby="route-attractions-heading"><p className={styles.eyebrow}>Make time for</p><h2 id="route-attractions-heading">Moments along <em>the way.</em></h2><ul>{detail.attractions.map((attraction, index) => <li key={attraction.name}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div><h3>{attraction.name}</h3>{attraction.stopName && <p>{attraction.stopName}</p>}</div></li>)}</ul></section>}

    <section className={`${styles.notesSection} ${styles.wrap}`} id="route-notes" aria-labelledby="route-notes-heading">
      <header className={styles.sectionHeading}><p className={styles.eyebrow}>A little context goes a long way</p><h2 id="route-notes-heading">Before you <em>make it yours.</em></h2></header>
      <div className={styles.notesLayout}><div><MorroviaStatusBanner tone={detail.confidence === "needs-review" ? "warning" : "info"} title={`Editorial record · ${detail.confidence.replaceAll("-", " ")} confidence`} detail={`Reviewed ${detail.reviewedAt}`} /><p>Night guidance comes from the reviewed route. Transport assumptions are not live schedules.</p></div>
      <div>
        {(detail.bestTime || detail.conditions) && <details className={styles.disclosure}><summary>When to go<ChevronDown aria-hidden="true" /></summary>{detail.bestTime && <p>{detail.bestTime}</p>}{detail.conditions && <p>{detail.conditions}</p>}</details>}
        <details className={styles.disclosure}><summary>Seasonal &amp; travel context<ChevronDown aria-hidden="true" /></summary><p>{detail.eyebrow}</p>{detail.rhythm && <p>Pacing: {detail.rhythm}</p>}{detail.seasonalNotes.map(note => <p key={note}>{note}</p>)}{detail.countryContext && <p>{detail.countryContext}</p>}</details>
        {Boolean(release?.explicitUnknowns?.length) && <details className={styles.disclosure}><summary>What still needs checking<ChevronDown aria-hidden="true" /></summary>{release!.explicitUnknowns!.map((unknown, index) => <p key={index}><strong>{unknown.reference}</strong><br />{unknown.reason}</p>)}</details>}
        <details className={styles.disclosure}><summary>Sources &amp; review<ChevronDown aria-hidden="true" /></summary><p>Editorial route reviewed {detail.reviewedAt} · confidence: {detail.confidence.replaceAll("-", " ")}</p>{release?.editorialOwner && <p>Prepared by {release.editorialOwner}</p>}{release?.editorialReviewer && <p>Reviewed by {release.editorialReviewer}</p>}{detail.sources.map(source => <a className={styles.sourceLink} key={source.url} href={source.url} target="_blank" rel="noreferrer"><strong>{source.label}<ArrowUpRight aria-hidden="true" /></strong><span>{source.covers}</span>{source.checkedAt && <small>Checked {source.checkedAt}</small>}{source.limitations && <small>{source.limitations}</small>}</a>)}</details>
      </div></div>
    </section>

    {experienceAction && <section className={`${styles.experiencesSection} ${styles.wrap}`} aria-labelledby="route-experiences-heading"><div><p className={styles.eyebrow}>Experiences along this route</p><h2 id="route-experiences-heading">Find more ways <em>to explore.</em></h2><p>Browse tours, activities and tickets around the places on this journey. Availability and details remain with the provider.</p></div><div><span>Booking options from {affiliateProviderLabel(experienceAction.provider)}</span><MorroviaAffiliateLink action={experienceAction} context={{ placement: "route_detail_experiences", destinationCount: detail.stops.length }} /><small>{affiliateDisclosure}</small></div></section>}

    <section className={`${styles.alternatives} ${styles.wrap}`} aria-labelledby="related-routes-heading"><div><p className={styles.eyebrow}>Another way to go</p><h2 id="related-routes-heading">Follow your <em>curiosity.</em></h2><EasyTLinkButton href="/journey/discover" variant="quiet" icon={ArrowRight} prefetch={false}>Explore all routes</EasyTLinkButton></div><ul>{related.map(route => <li key={route.key}><Link href={route.href} prefetch={false}><div><h3>{route.title}</h3><p>{route.stopCount} stops · {route.countries.join(" / ")}</p></div><ArrowUpRight aria-hidden="true" /></Link></li>)}</ul></section>

    <section className={styles.finalCta} aria-labelledby="route-closing-heading"><RouteDetailPhoto photo={visual.closing} label={detail.title} landscape className={styles.heroPhoto} /><div className={styles.closingCopy}><p className={styles.eyebrow}>{detail.countries.join(" · ")} · Your next chapter</p><h2 id="route-closing-heading">Take this route.<br /><em>Make it yours.</em></h2><p>Our starting point. Your dates, nights and discoveries.</p><div className={styles.heroActions}><RoutePlanLink className={styles.onPhoto} draft={detail.planDraft} placement="final">Start with this route</RoutePlanLink><EasyTLinkButton href="/journey/discover" prefetch={false} variant="quiet" className={styles.photoLink} icon={ArrowUpRight}>Explore other routes</EasyTLinkButton></div></div></section>
  </>;
}
