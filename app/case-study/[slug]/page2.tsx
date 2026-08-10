import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { notFound } from "next/navigation";
import { Navigation, Footer } from "@/components/ui";
import type { CaseStudyMedia } from "@/lib/case-studies";
import { caseStudies, getCaseStudy } from "@/lib/case-studies";

type PageProps = {
  params: Promise<{
    slug: string;
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
  };
}

export default async function CaseStudyPage({ params }: PageProps) {
  const { slug } = await params;
  const study = getCaseStudy(slug);

  if (!study) {
    notFound();
  }

  const currentIndex = caseStudies.findIndex((item) => item.slug === study.slug);
  const nextStudy = caseStudies[(currentIndex + 1) % caseStudies.length];

  return (
    <>
      <Navigation />
      <main className="bg-paper text-ink dark:bg-[#0d0d0c] dark:text-[#f4f3ef]">
        <article>
          <header className="px-6 pb-8 pt-28 sm:px-8 sm:pb-10 lg:px-20 lg:pt-32 xl:px-24">
            <div className="mx-auto max-w-[1400px]">
              <Link
                href="/#work"
                className="mb-8 inline-flex items-center gap-2 text-sm font-[480] tracking-[-0.01em] text-black/58 transition duration-200 hover:text-signal dark:text-white/58 dark:hover:text-signal lg:mb-10"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Back to selected work
              </Link>
              <div className="grid gap-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(320px,0.42fr)] lg:items-end lg:gap-14">
                <div>
                  <p className="mb-5 font-mono text-xs uppercase tracking-[0.22em] text-signal">{study.eyebrow}</p>
                  <h1 className="max-w-5xl text-balance text-[clamp(3.15rem,6.6vw,7.1rem)] font-[310] leading-[0.94] tracking-[-0.055em]">
                    {study.title}
                    <span className="text-signal">.</span>
                  </h1>
                </div>
                <div className="max-w-xl">
                  <p className="text-[clamp(1.3rem,1.75vw,2rem)] font-[330] leading-[1.23] tracking-[-0.025em]">
                    {study.summary}
                  </p>
                  <dl className="mt-8 grid gap-4 border-t border-black/10 pt-5 text-sm dark:border-white/10 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                    <Meta label="Role" value={study.role} />
                    <Meta label="Industry" value={study.industry} />
                    <Meta label="Context" value={study.year} />
                  </dl>
                </div>
              </div>
            </div>
          </header>

          <section className="px-6 sm:px-8 lg:px-20 xl:px-24">
            <div className="mx-auto max-w-[1400px] overflow-hidden rounded-[24px] bg-mist dark:bg-white/6">
              <div className="relative">
                <Image
                  src={study.image}
                  alt={study.imageAlt}
                  width={1800}
                  height={1100}
                  priority
                  sizes="100vw"
                  className="h-auto w-full"
                />
              </div>
            </div>
          </section>

          <section className="px-6 py-12 sm:px-8 sm:py-16 lg:px-20 lg:py-20 xl:px-24">
            <div className="mx-auto grid max-w-[1400px] gap-8 lg:grid-cols-[minmax(0,0.52fr)_minmax(420px,0.48fr)] lg:gap-14">
              <div>
                <SectionEyebrow>Project overview</SectionEyebrow>
                <h2 className="mt-4 max-w-3xl text-balance text-4xl font-[340] leading-[1.06] tracking-[-0.03em] sm:text-5xl lg:text-[3.6rem]">
                  Problem, approach and outcome<span className="text-signal">.</span>
                </h2>
              </div>
              <div className="space-y-6 text-lg font-[330] leading-[1.48] tracking-[-0.01em] text-black/72 dark:text-white/72">
                {study.intro.challenge.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {study.intro.outcome.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </div>
            {study.overviewMedia?.length ? (
              <div className="mx-auto mt-10 max-w-[1400px]">
                <MediaGrid items={study.overviewMedia} />
              </div>
            ) : null}
          </section>

          <section className="bg-ink px-6 py-5 text-white sm:px-8 lg:px-20 xl:px-24">
            <div className="mx-auto grid max-w-[1400px] gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {study.metrics.map((metric) => (
                <div key={`${metric.value}-${metric.label}`}>
                  <p className="text-4xl font-[340] tracking-[-0.025em] lg:text-5xl">{metric.value}</p>
                  <p className="mt-2 max-w-xs text-sm font-[330] leading-[1.4] text-white/70">{metric.label}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="px-6 py-16 sm:px-8 sm:py-20 lg:px-20 lg:py-28 xl:px-24">
            <div className="mx-auto max-w-[1400px]">
              <div className="grid gap-10 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-16">
                <div>
                  <SectionEyebrow>Challenge</SectionEyebrow>
                  <h2 className="text-3xl font-[340] leading-[1.08] tracking-[-0.025em] sm:text-4xl">
                    What needed to be solved<span className="text-signal">.</span>
                  </h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {study.challenges.map((challenge) => (
                    <div key={challenge} className="rounded-lg bg-mist p-5 text-lg font-[330] tracking-[-0.01em] dark:bg-[#151514]">
                      {challenge}
                    </div>
                  ))}
                </div>
              </div>
              {study.challengeMedia?.length ? <MediaGrid items={study.challengeMedia} className="mt-10" /> : null}
            </div>
          </section>

          <section className="border-y border-black/10 px-6 py-16 dark:border-white/10 sm:px-8 sm:py-20 lg:px-20 lg:py-28 xl:px-24">
            <div className="mx-auto max-w-[1400px]">
              <SectionEyebrow>Process and product decisions</SectionEyebrow>
              <div className="mt-8 grid gap-6">
                {study.sections.map((section, index) => (
                  <section
                    key={`${section.title}-${index}`}
                    className="grid gap-8 border-t border-black/10 pt-8 dark:border-white/10 lg:grid-cols-[minmax(0,0.48fr)_minmax(320px,0.52fr)]"
                  >
                    <div>
                      {section.eyebrow ? (
                        <p className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-signal">{section.eyebrow}</p>
                      ) : null}
                      <h3 className="max-w-2xl text-balance text-3xl font-[340] leading-[1.08] tracking-[-0.025em] sm:text-4xl">
                        {section.title}
                      </h3>
                    </div>
                    <div>
                      {section.body ? (
                        <p className="text-xl font-[330] leading-[1.45] tracking-[-0.01em] text-black/72 dark:text-white/72">
                          {section.body}
                        </p>
                      ) : null}
                      {section.bullets ? (
                        <ul className="mt-6 grid gap-3">
                          {section.bullets.map((item) => (
                            <li key={item} className="flex gap-3 text-base font-[330] leading-[1.45] text-black/72 dark:text-white/72">
                              <Check className="mt-1 h-4 w-4 flex-none text-signal" aria-hidden="true" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    {section.media?.length ? (
                      <div className="lg:col-span-2">
                        <MediaGrid items={section.media} />
                      </div>
                    ) : null}
                  </section>
                ))}
              </div>
            </div>
          </section>

          <section className="px-6 py-16 sm:px-8 sm:py-20 lg:px-20 lg:py-28 xl:px-24">
            <div className="mx-auto grid max-w-[1200px] gap-6 lg:grid-cols-2">
              <ImpactList title="Quantitative impact" items={study.impact.quantitative} />
              <ImpactList title="Qualitative impact" items={study.impact.qualitative} />
            </div>
          </section>

          {study.nextSteps ? (
            <section className="px-6 pb-16 sm:px-8 sm:pb-20 lg:px-20 lg:pb-28 xl:px-24">
              <div className="mx-auto max-w-[1200px]">
                <SectionEyebrow>Future opportunities</SectionEyebrow>
                <div className="mt-8 grid gap-4 md:grid-cols-3">
                  {study.nextSteps.map((step) => (
                    <div key={step.title} className="rounded-lg bg-mist p-6 dark:bg-[#151514]">
                      <h3 className="text-xl font-[540] tracking-[-0.015em]">{step.title}</h3>
                      <p className="mt-3 text-base font-[330] leading-[1.45] text-black/64 dark:text-white/64">{step.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          <section className="px-6 pb-20 sm:px-8 lg:px-20 xl:px-24">
            <div className="mx-auto rounded-lg bg-block-lime p-8 text-ink sm:p-10 lg:max-w-[1200px] lg:p-14">
              <p className="font-mono text-xs uppercase tracking-[0.18em]">Next case study</p>
              <div className="mt-8 flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
                <h2 className="max-w-3xl text-balance text-4xl font-[340] leading-[1.06] tracking-[-0.03em] sm:text-5xl">
                  {nextStudy.title}
                  <span className="text-signal">.</span>
                </h2>
                <Link
                  href={`/case-study/${nextStudy.slug}`}
                  className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-[480] tracking-[-0.01em] text-white transition duration-200 hover:bg-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-block-lime"
                >
                  Read next <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>
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

function ImpactList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-lg bg-mist p-6 dark:bg-[#151514] sm:p-8">
      <h2 className="text-3xl font-[340] leading-[1.08] tracking-[-0.025em]">{title}</h2>
      <ul className="mt-8 grid gap-4">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-base font-[330] leading-[1.45] text-black/72 dark:text-white/72">
            <Check className="mt-1 h-4 w-4 flex-none text-signal" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MediaGrid({ items, className = "" }: { items: CaseStudyMedia[]; className?: string }) {
  const hasPortrait = items.some((item) => item.portrait);

  return (
    <div className={`grid gap-5 ${hasPortrait ? "md:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]" : ""} ${className}`}>
      {items.map((item) => (
        <figure
          key={`${item.src}-${item.caption}`}
          className={`overflow-hidden rounded-[24px] bg-mist dark:bg-white/6 ${
            item.type !== "video" && hasPortrait ? "" : ""
          }`}
        >
          <div
            className={
              item.type === "video"
                ? `relative ${item.portrait ? "mx-auto aspect-[9/16] max-h-[620px] max-w-[360px]" : "aspect-video"}`
                : ""
            }
          >
            {item.type === "video" ? (
              <video
                className="h-full w-full object-contain"
                controls
                muted
                playsInline
                preload="metadata"
              >
                <source src={item.src} type="video/mp4" />
              </video>
            ) : (
              <Image
                src={item.src}
                alt={item.alt ?? item.caption}
                width={1800}
                height={1100}
                sizes="100vw"
                className="h-auto w-full"
              />
            )}
          </div>
          <figcaption className="border-t border-black/10 px-5 py-4 text-sm font-[330] leading-[1.45] text-black/62 dark:border-white/10 dark:text-white/62">
            {item.caption}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
