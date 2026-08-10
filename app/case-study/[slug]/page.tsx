import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { CaseStudyAnalytics } from "@/components/case-study-analytics";
import { CaseStudyImage } from "@/components/case-study-image";
import { CaseStudyRail } from "@/components/case-study-rail";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/motion";
import { Footer, Navigation } from "@/components/ui";
import { TrackedLink } from "@/components/tracked-link";
import { ViewportVideo } from "@/components/viewport-video";
import type { CaseStudyMedia } from "@/lib/case-studies";
import { caseStudies, getCaseStudy } from "@/lib/case-studies";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<{
    layout?: string;
  }>;
};

export function generateStaticParams() {
  return caseStudies.map((study) => ({ slug: study.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const study = getCaseStudy(slug);

  if (!study) {
    return {
      title: "Case Study | Shaun Whiting",
    };
  }

  return {
    title: `${study.title} | Shaun Whiting`,
    description: study.summary,
    alternates: {
      canonical: `/case-study/${study.slug}`,
    },
  };
}

export default async function CaseStudyPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const study = getCaseStudy(slug);

  if (!study) {
    notFound();
  }

  const currentIndex = caseStudies.findIndex((item) => item.slug === study.slug);
  const nextStudy = caseStudies[(currentIndex + 1) % caseStudies.length];
  const usesStructuredDecisions = study.slug === "rio" || study.slug === "returns-kiosk" || study.slug === "returns-platform";
  const heroComparison = study.slug === "returns-kiosk" ? undefined : study.challengeComparisons?.[0];
  const heroArtifact = study.overviewMedia?.[0] ?? study.challengeMedia?.[0];
  const decisions = usesStructuredDecisions
    ? study.sections.filter((section) => section.eyebrow?.toLowerCase().startsWith("decision"))
    : study.sections.filter((section) => section.eyebrow?.toLowerCase() !== "process");
  const callout = study.sections.find((section) => {
    const eyebrow = section.eyebrow?.toLowerCase() ?? "";
    return eyebrow.includes("tradeoff") || eyebrow.includes("foundation");
  });
  const processSection = study.sections.find((section) => section.eyebrow?.toLowerCase() === "process");
  const isHeroArtifactTest = slug === "rio" && (resolvedSearchParams?.layout === "hero-artifact" || resolvedSearchParams?.layout === "hero-artifact-labeled");
  const showHeroArtifactLabel = resolvedSearchParams?.layout === "hero-artifact-labeled";
  const heroTestArtifact = slug === "rio" ? study.sections[0]?.media?.[0] ?? heroArtifact : heroArtifact;
  const heroTestMedia = study.heroTestMedia ?? (heroTestArtifact ? { desktop: heroTestArtifact, mobile: heroTestArtifact } : undefined);
  const imageGallery = [
    ...(study.heroTestMedia ? [study.heroTestMedia.desktop, study.heroTestMedia.mobile] : []),
    ...(study.overviewMedia ?? []),
    ...(study.challengeMedia ?? []),
    ...(study.challengeComparisons?.flatMap((comparison) => [comparison.before, comparison.after]) ?? []),
    ...study.sections.flatMap((section) => section.media ?? []),
    ...(study.postDecisionsShowcase ? [study.postDecisionsShowcase.media] : []),
  ].filter(
    (media, index, allMedia) =>
      (media.type === undefined || media.type === "image") && allMedia.findIndex((candidate) => candidate.src === media.src) === index,
  );

  const railItems = [
    { id: "overview", label: "Overview" },
    { id: "artifact", label: "Artifact" },
    { id: "decisions", label: "Decisions" },
    { id: "impact", label: "Impact" },
    ...(processSection ? [{ id: "process", label: "Process" }] : []),
    ...(study.nextSteps ? [{ id: "next-steps", label: "What's next" }] : []),
  ];

  return (
    <>
      <CaseStudyAnalytics slug={study.slug} title={study.shortTitle ?? study.title} />
      <Navigation />
      <CaseStudyRail items={railItems} />
      <main className="bg-paper text-ink dark:bg-[#0d0d0c] dark:text-[#f4f3ef]">
        <article>
          <header id="overview" className={`px-6 ${isHeroArtifactTest ? "pb-0" : "pb-12"} pt-28 sm:px-8 lg:px-20 lg:pt-32 xl:px-24`}>
            <div className="mx-auto max-w-[1400px]">
              <Link
                href="/#work"
                className="mb-8 inline-flex items-center gap-2 text-sm font-[480] tracking-[-0.01em] text-black/58 transition duration-200 hover:text-signal dark:text-white/58 dark:hover:text-signal lg:mb-10"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Back to selected work
              </Link>
              <div className="grid gap-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(320px,0.42fr)] lg:items-end lg:gap-14">
                <Reveal>
                  <p className="mb-5 font-mono text-xs uppercase tracking-[0.22em] text-signal">{study.eyebrow}</p>
                  <h1 className="max-w-5xl text-balance text-[clamp(3.15rem,6.6vw,7.1rem)] font-[310] leading-[0.94] tracking-[-0.055em]">
                    {study.title}
                    <span className="text-signal">.</span>
                  </h1>
                </Reveal>
                <Reveal delay={0.08} className="max-w-xl">
                  <p className="text-[clamp(1.3rem,1.75vw,2rem)] font-[330] leading-[1.23] tracking-[-0.025em]">
                    {study.summary}
                  </p>
                  <dl className="mt-8 grid gap-4 border-t border-black/10 pt-5 text-sm dark:border-white/10 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                    <Meta label="Role" value={study.role} />
                    <Meta label="Team" value={study.team ?? study.industry} />
                    <Meta label="Company" value={study.duration ?? study.year} />
                  </dl>
                </Reveal>
              </div>
              {isHeroArtifactTest && heroTestMedia ? (
                <div className="mt-12 sm:mt-14">
                  {showHeroArtifactLabel ? <SectionEyebrow>The redesign at a glance</SectionEyebrow> : null}
                  <div className={`${showHeroArtifactLabel ? "mt-5" : ""} mx-auto max-w-[1100px]`}>
                    <HeroArtifact desktop={heroTestMedia.desktop} mobile={heroTestMedia.mobile} gallery={imageGallery} />
                  </div>
                </div>
              ) : null}
            </div>
          </header>

          <StatBand metrics={study.metrics} />

          <section id="context" className="px-6 py-12 sm:px-8 sm:py-14 lg:px-20 lg:py-16 xl:px-24">
            <div className="mx-auto grid max-w-[1400px] gap-8 lg:grid-cols-3 lg:gap-12">
              <TldrColumn title="The Problem" paragraphs={study.intro.challenge} />
              <TldrColumn title="What I Did" paragraphs={study.intro.approach ?? study.challenges.slice(0, 2)} />
              <TldrColumn title="The Outcome" paragraphs={study.intro.outcome} />
            </div>
          </section>

          {(heroComparison || heroArtifact) ? (
            <section id="artifact" className="bg-mist px-6 py-14 dark:bg-[#151514] sm:px-8 sm:py-16 lg:px-20 lg:py-20 xl:px-24">
              <Reveal className="mx-auto max-w-[1100px]">
                <SectionEyebrow>The redesign at a glance</SectionEyebrow>
                <div className="mt-6">
                  {heroComparison ? (
                    <BeforeAfterSlider
                      before={heroComparison.before}
                      after={heroComparison.after}
                      label="One screen where there were three: scanning moved into the start state so customers could begin with confidence."
                    />
                  ) : heroArtifact ? (
                    <MediaFigure item={{ ...heroArtifact, wide: true }} gallery={imageGallery} />
                  ) : null}
                </div>
              </Reveal>
            </section>
          ) : null}

          {decisions.length ? (
            <section id="decisions" className="px-6 py-16 sm:px-8 sm:py-20 lg:px-20 lg:py-28 xl:px-24">
              <div className="mx-auto max-w-[1200px] space-y-20">
                {decisions.slice(0, 3).map((section, index) => (
                  <DecisionSection key={section.title} section={section} index={index} gallery={imageGallery} />
                ))}
              </div>
            </section>
          ) : null}

          {study.postDecisionsShowcase ? (
            <section className="bg-mist px-6 py-14 dark:bg-[#151514] sm:px-8 sm:py-16 lg:px-20 lg:py-20 xl:px-24">
              <Reveal className="mx-auto max-w-[1100px]">
                <SectionEyebrow>{study.postDecisionsShowcase.eyebrow}</SectionEyebrow>
                <div className="mt-6">
                  <MediaFigure item={{ ...study.postDecisionsShowcase.media, wide: true }} gallery={imageGallery} />
                </div>
              </Reveal>
            </section>
          ) : null}

          {callout ? (
            <section className="border-y border-black/10 px-6 py-14 dark:border-white/10 sm:px-8 lg:px-20 xl:px-24">
              <Reveal className="mx-auto grid max-w-[1200px] gap-8 lg:grid-cols-[minmax(0,0.34fr)_minmax(0,0.66fr)] lg:items-start">
                <div>
                  <SectionEyebrow>{callout.eyebrow ?? "Callout"}</SectionEyebrow>
                  <h2 className="mt-4 max-w-sm text-balance text-3xl font-[340] leading-[1.08] tracking-[-0.025em]">
                    {callout.title}
                    <span className="text-signal">.</span>
                  </h2>
                </div>
                <div className="rounded-lg bg-block-lime p-7 text-ink sm:p-8">
                  <p className="text-balance text-[clamp(1.15rem,1.6vw,1.55rem)] font-[340] leading-[1.34] tracking-[-0.02em]">
                    {callout.body}
                  </p>
                </div>
              </Reveal>
            </section>
          ) : null}

          <section id="impact" className="px-6 py-16 sm:px-8 sm:py-20 lg:px-20 lg:py-24 xl:px-24">
            <Reveal className="mx-auto grid max-w-[1200px] gap-8 lg:grid-cols-[minmax(0,0.32fr)_minmax(0,0.68fr)]">
              <div>
                <SectionEyebrow>Impact</SectionEyebrow>
                <h2 className="mt-4 text-3xl font-[340] leading-[1.08] tracking-[-0.025em]">
                  What changed<span className="text-signal">.</span>
                </h2>
              </div>
              <ImpactTable items={[...study.impact.quantitative, ...study.impact.qualitative]} />
            </Reveal>
          </section>

          {processSection ? (
            <section id="process" className="border-y border-black/10 px-6 py-14 dark:border-white/10 sm:px-8 lg:px-20 xl:px-24">
              <Reveal className="mx-auto max-w-[1200px]">
                <div className="grid gap-8 lg:grid-cols-[minmax(0,0.32fr)_minmax(0,0.68fr)]">
                  <div>
                    <SectionEyebrow>{processSection.eyebrow ?? "Process"}</SectionEyebrow>
                    <h2 className="mt-4 max-w-xs text-balance text-2xl font-[340] leading-[1.1] tracking-[-0.02em]">
                      {processSection.title}
                    </h2>
                  </div>
                  <div>
                    {processSection.body ? (
                      <p className="max-w-4xl text-base font-[330] leading-[1.55] tracking-[-0.01em] text-black/68 dark:text-white/68">
                        {processSection.body}
                      </p>
                    ) : null}
                    {processSection.media?.length ? (
                      <MediaGrid items={processSection.media.slice(0, 3)} gallery={imageGallery} className="mt-8" compact />
                    ) : null}
                  </div>
                </div>
              </Reveal>
            </section>
          ) : null}

          {study.nextSteps ? (
            <section id="next-steps" className="px-6 pb-16 sm:px-8 sm:pb-20 lg:px-20 lg:pb-28 xl:px-24">
              <div className="mx-auto max-w-[1200px]">
                <Reveal>
                  <SectionEyebrow>Future opportunities</SectionEyebrow>
                </Reveal>
                <StaggerGroup className="mt-8 grid gap-4 md:grid-cols-3" staggerDelay={0.07}>
                  {study.nextSteps.map((step) => (
                    <StaggerItem
                      key={step.title}
                      className="rounded-lg bg-mist p-6 ring-1 ring-transparent transition-[transform,box-shadow] duration-[180ms] ease-premium hover:-translate-y-[3px] hover:shadow-lift hover:ring-black/5 dark:bg-[#151514]"
                    >
                      <h3 className="text-xl font-[540] tracking-[-0.015em]">{step.title}</h3>
                      <p className="mt-3 text-base font-[330] leading-[1.45] text-black/64 dark:text-white/64">{step.text}</p>
                    </StaggerItem>
                  ))}
                </StaggerGroup>
              </div>
            </section>
          ) : null}

          <section className="px-6 pb-20 pt-14 sm:px-8 lg:px-20 xl:px-24">
            <Reveal className="mx-auto max-w-[1200px]">
              <div className="rounded-lg border border-black/5 bg-block-lime/80 p-8 text-ink shadow-[0_20px_60px_rgba(0,0,0,0.08)] backdrop-blur-lg transition-[transform,box-shadow] duration-300 ease-premium hover:-translate-y-1 hover:shadow-[0_28px_80px_rgba(0,0,0,0.12)] dark:border-white/10 sm:p-10 lg:p-14">
                <p className="font-mono text-xs uppercase tracking-[0.18em]">Next case study</p>
                <div className="mt-8 flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
                  <h2 className="max-w-3xl text-balance text-4xl font-[340] leading-[1.06] tracking-[-0.03em] sm:text-5xl">
                    {nextStudy.title}
                    <span className="text-signal">.</span>
                  </h2>
                  <TrackedLink
                    href={`/case-study/${nextStudy.slug}`}
                    eventName="case_study_cta_clicked"
                    eventData={{
                      case_study_slug: nextStudy.slug,
                      case_study_title: nextStudy.shortTitle ?? nextStudy.title,
                      cta_label: "Read next",
                      location: "next_case_study",
                    }}
                    className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-[480] tracking-[-0.01em] text-white transition duration-200 hover:bg-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-block-lime"
                  >
                    Read next <ArrowRight size={16} aria-hidden="true" />
                  </TrackedLink>
                </div>
              </div>
            </Reveal>
          </section>
        </article>
      </main>
      <Footer />
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-signal">{label}</dt>
      <dd className="mt-2 font-[330] leading-[1.35] text-black/70 dark:text-white/70">{value}</dd>
    </div>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-xs uppercase tracking-[0.18em] text-signal">{children}</p>;
}

function StatBand({ metrics }: { metrics: Array<{ value: string; label: string }> }) {
  return (
    <section className="bg-ink px-6 py-6 text-white sm:px-8 lg:px-20 xl:px-24">
      <div className="mx-auto grid max-w-[1400px] gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.slice(0, 4).map((metric) => (
          <div key={`${metric.value}-${metric.label}`}>
            <p className="text-[clamp(1.85rem,2.5vw,2.6rem)] font-[340] leading-none tracking-[-0.03em]">{metric.value}</p>
            <p className="mt-2 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-white/48">{metric.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function TldrColumn({ title, paragraphs }: { title: string; paragraphs: string[] }) {
  return (
    <Reveal>
      <p className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-signal">{title}</p>
      <div className="space-y-4 text-base font-[330] leading-[1.5] tracking-[-0.01em] text-black/72 dark:text-white/72">
        {paragraphs.slice(0, 1).map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </Reveal>
  );
}

function DecisionSection({
  section,
  index,
  gallery,
}: {
  section: {
    eyebrow?: string;
    title: string;
    body?: string;
    resultChip?: string;
    media?: CaseStudyMedia[];
    comparison?: { before: CaseStudyMedia; after: CaseStudyMedia; label?: string };
  };
  index: number;
  gallery: CaseStudyMedia[];
}) {
  const media = section.media;
  const text = (
    <div className="max-w-xl">
      {section.eyebrow ? <p className="mb-5 font-mono text-xs uppercase tracking-[0.18em] text-signal">{section.eyebrow}</p> : null}
      <h2 className="text-balance text-3xl font-[340] leading-[1.08] tracking-[-0.025em] sm:text-4xl">
        {section.title}
        <span className="text-signal">.</span>
      </h2>
      {section.body ? (
        <div className="mt-5 space-y-4 text-base font-[330] leading-[1.55] tracking-[-0.01em] text-black/70 dark:text-white/70">
          {splitDecisionBody(section.body).map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      ) : null}
      {section.resultChip ? (
        <p className="mt-6 inline-block rounded-md bg-block-lime px-3 py-2 font-mono text-[0.68rem] font-[540] uppercase tracking-[0.08em] text-ink">
          {section.resultChip}
        </p>
      ) : null}
    </div>
  );
  const visual = section.comparison ? (
    <BeforeAfterSlider before={section.comparison.before} after={section.comparison.after} label={section.comparison.label} />
  ) : media?.length ? (
    <MediaGrid items={media} gallery={gallery} />
  ) : null;

  return (
    <Reveal className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-14">
      {index % 2 === 0 ? (
        <>
          {text}
          {visual}
        </>
      ) : (
        <>
          <div className="lg:order-2 lg:justify-self-end">{text}</div>
          <div className="lg:order-1">{visual}</div>
        </>
      )}
    </Reveal>
  );
}

function splitDecisionBody(body: string) {
  const sentences = body.match(/[^.!?]+[.!?]+/g);
  if (!sentences || sentences.length < 3) {
    return [body];
  }

  const midpoint = Math.ceil(sentences.length / 2);
  return [sentences.slice(0, midpoint).join(" ").trim(), sentences.slice(midpoint).join(" ").trim()];
}

function ImpactTable({ items }: { items: string[] }) {
  return (
    <div className="grid gap-x-10 lg:grid-cols-2">
      {items.map((item) => {
        const [label, value] = item.includes("|") ? item.split("|") : item.split(/:\s(.+)/);

        return (
          <div key={item} className="grid grid-cols-[minmax(0,1fr)_auto] gap-6 border-t border-black/12 py-4 text-sm dark:border-white/12">
            <p className="font-[330] leading-[1.35] text-black/62 dark:text-white/62">{label}</p>
            <p className="text-right font-[560] leading-[1.35] text-ink dark:text-white">{value ?? ""}</p>
          </div>
        );
      })}
    </div>
  );
}

function MediaFigure({ item, gallery = [item] }: { item: CaseStudyMedia; gallery?: CaseStudyMedia[] }) {
  return (
    <figure className="overflow-hidden rounded-lg bg-mist dark:bg-white/6">
      <div
        className={
          item.type === "video" || item.type === "embed"
            ? `relative ${
                item.portrait
                  ? "mx-auto aspect-[9/16] w-[min(100%,640px)] min-w-0"
                  : "aspect-video"
              }`
            : "relative"
        }
      >
        {item.type === "video" ? (
          <ViewportVideo src={item.src} autoplayOnView={item.autoplayOnView} className="h-full w-full object-contain" />
        ) : item.type === "embed" ? (
          <iframe
            src={item.src}
            title={item.alt ?? item.caption}
            allowFullScreen
            className="h-full w-full border-0"
            loading="lazy"
          />
        ) : (
          <CaseStudyImage item={item} gallery={gallery} />
        )}
        {item.callouts?.length
          ? item.callouts.map((callout, index) => (
              <span
                key={`${callout.x}-${callout.y}-${callout.label}`}
                className="group absolute z-10 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${callout.x}%`, top: `${callout.y}%` }}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-signal font-mono text-xs font-[540] text-white shadow-[0_2px_10px_rgba(0,0,0,0.25)] ring-2 ring-white/80">
                  {index + 1}
                </span>
                <span className="pointer-events-none absolute left-9 top-1/2 w-max max-w-[220px] -translate-y-1/2 rounded-md bg-ink/92 px-3 py-1.5 text-xs font-[400] leading-snug text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  {callout.label}
                </span>
              </span>
            ))
          : null}
      </div>
      <figcaption className="border-t border-black/10 px-5 py-4 text-sm font-[330] leading-[1.45] text-black/62 dark:border-white/10 dark:text-white/62">
        {item.caption}
      </figcaption>
    </figure>
  );
}

function HeroArtifact({ desktop, mobile, gallery }: { desktop: CaseStudyMedia; mobile: CaseStudyMedia; gallery: CaseStudyMedia[] }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-t-lg sm:aspect-[16/5]">
      <div className="absolute inset-0 sm:hidden">
        <CaseStudyImage item={mobile} gallery={gallery} />
      </div>
      <div className="absolute inset-0 hidden sm:block">
        <CaseStudyImage item={desktop} gallery={gallery} />
      </div>
    </div>
  );
}

function MediaGrid({
  items,
  gallery,
  className = "",
  compact = false,
}: {
  items: CaseStudyMedia[];
  gallery: CaseStudyMedia[];
  className?: string;
  compact?: boolean;
}) {
  const wideItems = items.filter((item) => item.wide);
  const gridItems = items.filter((item) => !item.wide);
  const hasPortrait = gridItems.some((item) => item.portrait);

  return (
    <div className={`space-y-5 ${className}`}>
      {wideItems.map((item) => (
        <MediaFigure key={`${item.src}-${item.caption}`} item={item} gallery={gallery} />
      ))}
      {gridItems.length ? (
        <div
          className={`grid gap-5 ${
            compact
              ? "sm:grid-cols-3"
              : hasPortrait && gridItems.length > 1
                ? "md:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]"
                : gridItems.length > 1
                  ? "sm:grid-cols-2"
                  : ""
          }`}
        >
          {gridItems.map((item) => (
            <MediaFigure key={`${item.src}-${item.caption}`} item={item} gallery={gallery} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
