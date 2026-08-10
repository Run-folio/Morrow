import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Compass,
  Gauge,
  Handshake,
  Layers3,
  Mail,
  Mountain,
  Network,
  Repeat2,
  Route,
  Store,
} from "lucide-react";
import { CountUp, Magnetic, Reveal, StaggerGroup, StaggerItem } from "./motion";
import { MountainScene } from "./mountain-scene";
import { SiteNavigation } from "./site-navigation";
import { TrackedAnchor, TrackedLink } from "./tracked-link";
import { journey, principles, projects, testimonials } from "@/lib/content";

const capabilityTags = ["AI", "B2B SaaS", "Logistics", "Ecommerce", "Design systems", "UX strategy"];

type HeroStat = {
  label: string;
  value?: number;
  prefix?: string;
  suffix?: string;
  text?: string;
};

const heroStats: HeroStat[] = [
  { value: 16, label: "Years designing" },
  { value: 67, suffix: "M+", label: "Users reached" },
  { value: 72, prefix: "$", suffix: "M", label: "Measured savings" },
  { text: "AI · Systems", label: "Focus areas" },
];

const principleIcons = [Route, Network, Gauge, Handshake, Repeat2];
const journeyIcons = [Compass, Layers3, Store, Mountain];

export function Navigation() {
  return <SiteNavigation />;
}

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-paper text-ink dark:bg-[#0d0d0c] dark:text-[#f4f3ef]">
      <MountainScene />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[30svh] bg-[linear-gradient(to_top,#ffffff_0%,rgba(255,255,255,0.92)_38%,rgba(255,255,255,0.4)_62%,rgba(255,255,255,0)_100%)] dark:bg-[linear-gradient(to_top,#0d0d0c_0%,rgba(13,13,12,0.92)_38%,rgba(13,13,12,0.4)_62%,rgba(13,13,12,0)_100%)]" />
      <div className="relative z-10 px-6 pt-[92px] sm:px-8 lg:pl-36 lg:pr-20 xl:pr-24">
        <Reveal className="grid min-h-[calc(76svh-92px)] items-center gap-8 py-10 sm:min-h-[calc(80svh-92px)] sm:gap-10 sm:py-14 lg:min-h-[calc(82svh-92px)] lg:grid-cols-[minmax(0,0.82fr)_minmax(340px,0.56fr)] lg:gap-12 lg:py-20 xl:gap-14">
          <div className="relative min-w-0">
            <p className="mb-6 font-mono text-[0.76rem] uppercase tracking-[0.28em] text-ink dark:text-white sm:mb-8 sm:text-[0.84rem] lg:mb-14 lg:text-[clamp(0.8rem,0.92vw,1.15rem)] lg:tracking-[0.36em]">
              Staff Product Designer
            </p>
            <h1 className="max-w-[60rem] text-[clamp(3.95rem,18vw,6.6rem)] font-[310] leading-[0.92] tracking-[-0.055em] text-ink dark:text-[#f4f3ef] lg:text-[clamp(5.2rem,10.8vw,12rem)]">
              <span className="block">Complexity</span>
              <span className="block">
                solved<span className="text-signal">.</span>
              </span>
            </h1>
          </div>
          <div className="relative z-20 max-w-[34rem] self-center">
            <p className="text-[clamp(1.45rem,7vw,2rem)] font-[330] leading-[1.22] tracking-[-0.025em] text-ink dark:text-white lg:text-[clamp(2rem,2.32vw,2.95rem)] lg:leading-[1.24]">
              Helping teams make complex products feel simple.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 sm:mt-10 lg:mt-12">
              <Magnetic strength={0.28}>
                <TrackedAnchor
                  href="#work"
                  eventName="case_study_cta_clicked"
                  eventData={{
                    cta_label: "View Case Studies",
                    destination_url: "#work",
                    location: "hero",
                  }}
                  className="inline-flex min-h-12 items-center rounded-full bg-signal px-6 text-base font-[480] tracking-[-0.01em] text-white transition-[transform,box-shadow,background-color] duration-300 ease-premium hover:-translate-y-[1.5px] hover:bg-ink hover:shadow-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper dark:hover:bg-white dark:hover:text-ink sm:min-h-14 sm:px-7 sm:text-lg lg:min-h-[68px] lg:px-9 lg:text-2xl lg:tracking-[-0.02em]"
                >
                  View Case Studies
                </TrackedAnchor>
              </Magnetic>
            </div>
          </div>
        </Reveal>
      </div>
      <div className="relative z-10 bg-ink py-7 text-white sm:py-8">
        <StaggerGroup
          className="container-pad grid grid-cols-2 gap-y-7 sm:flex sm:items-stretch sm:justify-between sm:gap-0"
          staggerDelay={0.1}
        >
          {heroStats.map((stat) => (
            <StaggerItem
              key={stat.label}
              className="flex flex-col gap-2 px-0 sm:flex-1 sm:border-l sm:border-white/15 sm:px-6 sm:first:border-l-0 sm:first:pl-0 lg:px-8"
            >
              <span className="text-[clamp(2rem,3.4vw,2.9rem)] font-[320] leading-none tracking-[-0.03em]">
                {stat.text !== undefined ? (
                  stat.text
                ) : (
                  <CountUp value={stat.value ?? 0} prefix={stat.prefix ?? ""} suffix={stat.suffix ?? ""} />
                )}
              </span>
              <span className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-white/55">
                {stat.label}
              </span>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}

export function Button({
  href,
  variant,
  children,
}: {
  href: string;
  variant: "primary" | "secondary";
  children: React.ReactNode;
}) {
  const classes =
    variant === "primary"
      ? "bg-ink text-white hover:bg-signal dark:bg-white dark:text-ink dark:hover:bg-signal dark:hover:text-white"
      : "bg-white text-ink hover:bg-mist dark:bg-white/[0.1] dark:text-white dark:hover:bg-white/[0.16]";

  return (
    <a
      href={href}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-[480] tracking-[-0.01em] transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper dark:focus-visible:ring-offset-[#0d0d0c] ${classes}`}
    >
      {children}
    </a>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  text,
  tone = "light",
}: {
  eyebrow: string;
  title: React.ReactNode;
  text?: string;
  tone?: "light" | "dark";
}) {
  const eyebrowClass = tone === "dark" ? "text-signal" : "text-signal";
  const textClass = tone === "dark" ? "text-white/62" : "text-black/62 dark:text-white/62";

  return (
    <Reveal className="mb-10 grid gap-5 md:grid-cols-[0.72fr_1fr] md:items-end">
      <div>
        <p className={`mb-4 font-mono text-xs uppercase tracking-[0.16em] ${eyebrowClass}`}>{eyebrow}</p>
        <h2 className="max-w-3xl text-balance text-4xl font-[340] leading-[1.04] tracking-[-0.025em] sm:text-5xl lg:text-[4rem]">{title}</h2>
      </div>
      {text ? <p className={`max-w-xl text-xl font-[330] leading-[1.4] tracking-[-0.01em] ${textClass}`}>{text}</p> : null}
    </Reveal>
  );
}

export function AboutPreview() {
  return (
    <section id="about" className="container-pad scroll-mt-28 py-16 sm:py-20 lg:py-24">
      <Reveal className="grid gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1fr)] lg:gap-20">
        <div>
          <p className="mb-5 font-mono text-xs uppercase tracking-[0.16em] text-signal">About</p>
          <h2 className="max-w-3xl text-balance text-5xl font-[340] leading-[1.02] tracking-[-0.035em] text-ink dark:text-white sm:text-6xl lg:text-[5.25rem]">
            Turning complexity into clarity<span className="text-signal">.</span>
          </h2>
        </div>
        <div className="max-w-3xl space-y-8 pt-1 text-xl font-[330] leading-[1.38] tracking-[-0.015em] text-ink dark:text-white sm:text-2xl lg:text-[1.68rem]">
          <p>
            I&apos;m a Staff Product Designer with 16 years&apos; experience designing AI, SaaS and enterprise products, from zero-to-one concepts to platforms used by more than 67 million people. I specialise in untangling complex systems, workflows and operational software so teams can build products that feel simple, capable and intuitive.
          </p>
        </div>
      </Reveal>
      <Reveal delay={0.08} className="mt-10 flex flex-wrap gap-2.5 sm:mt-12">
        {capabilityTags.map((tag) => (
          <span key={tag} className="rounded-full bg-mist px-3.5 py-2 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-ink dark:bg-white/[0.08] dark:text-white">
            {tag}
          </span>
        ))}
      </Reveal>
    </section>
  );
}

export function FeaturedWork() {
  return (
    <section id="work" className="scroll-mt-28 border-y border-black/10 bg-paper py-16 text-ink dark:border-white/10 dark:bg-[#0d0d0c] dark:text-[#f4f3ef] sm:py-24">
      <div className="container-pad">
        <Reveal className="mb-16 max-w-5xl">
          <p className="mb-7 font-mono text-xs uppercase tracking-[0.16em] text-signal">Selected work</p>
          <h2 className="max-w-5xl text-balance text-5xl font-[340] leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-[5.25rem]">
            Complex problems, measurable outcomes<span className="text-signal">.</span>
          </h2>
          <p className="mt-8 max-w-4xl text-xl font-[330] leading-[1.4] tracking-[-0.01em] text-black/72 dark:text-white/72 sm:text-2xl">
            A closer look at the systems, product decisions and measurable outcomes behind the work.
          </p>
        </Reveal>
        <div className="grid gap-12 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-28 space-y-5 pt-2">
              {projects.map((project, index) => (
                <TrackedAnchor
                  key={project.title}
                  href={project.href}
                  eventName="case_study_cta_clicked"
                  eventData={{
                    case_study_slug: project.href.split("/").pop(),
                    case_study_title: project.title,
                    cta_label: "Selected work rail",
                  }}
                  className="block rounded-sm text-sm font-medium text-black/36 transition duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-4 focus-visible:ring-offset-paper dark:text-white/36 dark:hover:text-white dark:focus-visible:ring-offset-[#0d0d0c]"
                >
                  <span className="mr-3 text-signal">0{index + 1}</span>
                  {project.title}
                </TrackedAnchor>
              ))}
            </div>
          </aside>
          <div className="grid gap-16 sm:gap-20">
            {projects.map((project, index) => (
              <Reveal key={project.title} delay={index * 0.03}>
                <article className="grid gap-6 border-t border-hairline pt-8 dark:border-white/10">
                  <TrackedLink
                    href={project.href}
                    eventName="case_study_cta_clicked"
                    eventData={{
                      case_study_slug: project.href.split("/").pop(),
                      case_study_title: project.title,
                      cta_label: "Project image",
                    }}
                    aria-label={`Read ${project.title} case study`}
                    className="group relative block overflow-hidden rounded-[24px] bg-mist transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-4 focus-visible:ring-offset-paper dark:bg-white/6 dark:focus-visible:ring-offset-[#0d0d0c]"
                  >
                    <Image
                      src={project.image}
                      alt={`${project.title} interface`}
                      width={1600}
                      height={1000}
                      sizes="(min-width: 1024px) 72vw, 100vw"
                      className="h-auto w-full transition duration-300 group-hover:scale-[1.015]"
                    />
                  </TrackedLink>
                  <div className="grid gap-8 rounded-[24px] bg-white p-6 dark:bg-[#151514] lg:grid-cols-[minmax(0,0.42fr)_minmax(360px,0.58fr)] lg:p-8">
                    <div>
                      <p className="mb-5 font-mono text-xs uppercase tracking-[0.16em] text-signal">0{index + 1} / {project.industry}</p>
                      <h3 className="text-balance text-4xl font-[540] leading-[1.02] tracking-[-0.025em] sm:text-5xl">
                        <TrackedLink
                          href={project.href}
                          eventName="case_study_cta_clicked"
                          eventData={{
                            case_study_slug: project.href.split("/").pop(),
                            case_study_title: project.title,
                            cta_label: "Project title",
                          }}
                          className="rounded-sm transition duration-200 hover:text-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-4 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#151514]"
                        >
                          {project.title}
                        </TrackedLink>
                      </h3>
                    </div>
                    <div className="flex flex-col justify-between">
                      <div>
                        <p className="mt-6 max-w-2xl text-xl font-[330] leading-[1.42] tracking-[-0.015em] text-ink dark:text-white">
                          {project.summary}
                        </p>
                        <div className="mt-9">
                          <p className="font-mono text-xs uppercase tracking-[0.16em] text-ink dark:text-white">Key outcomes</p>
                          <div className="mt-5 grid gap-5 sm:grid-cols-3">
                            {project.outcomes.map((outcome) => (
                              <div key={`${project.title}-${outcome.value}`} className="border-t border-black/12 pt-4 dark:border-white/16">
                                <p className="text-4xl font-[340] leading-none tracking-[-0.025em] text-ink dark:text-white">
                                  {outcome.value}
                                </p>
                                <p className="mt-3 text-sm font-[540] leading-[1.25] tracking-[-0.01em] text-ink dark:text-white">
                                  {outcome.label}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <TrackedLink
                        href={project.href}
                        eventName="case_study_cta_clicked"
                        eventData={{
                          case_study_slug: project.href.split("/").pop(),
                          case_study_title: project.title,
                          cta_label: "Read case study",
                        }}
                        className="mt-8 inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-[480] tracking-[-0.01em] text-white transition duration-200 hover:bg-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper dark:bg-white dark:text-ink dark:hover:bg-signal dark:hover:text-white dark:focus-visible:ring-offset-[#151514]"
                      >
                        Read case study <ArrowRight size={16} aria-hidden="true" />
                      </TrackedLink>
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function DesignPhilosophy() {
  return (
    <section id="approach" className="container-pad scroll-mt-28 py-16 sm:py-24">
      <div className="rounded-[24px] bg-block-lime p-8 text-ink sm:p-12 lg:p-14">
        <SectionHeader
          eyebrow="Design philosophy"
          title="Design born from challenge, driven by heart."
          text="The accident and recovery are part of my story, but not the whole story. They taught me to move through uncertainty patiently, to keep solving when the easy route disappears and to respect progress that compounds."
        />
        <StaggerGroup className="grid gap-4 md:grid-cols-2 lg:grid-cols-5" staggerDelay={0.06}>
          {principles.map((principle, index) => (
            <StaggerItem
              key={principle.title}
              className="group rounded-lg bg-white/54 p-6 ring-1 ring-transparent transition-[transform,box-shadow] duration-[180ms] ease-premium hover:-translate-y-[3px] hover:bg-white/72 hover:shadow-lift hover:ring-black/5"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-[0.16em] text-ink">0{index + 1}</span>
                <IconBadge icon={principleIcons[index % principleIcons.length]} size="sm" accentOnHover />
              </div>
              <h3 className="mt-8 text-balance text-2xl font-[540] tracking-[-0.01em]">{principle.title}</h3>
              <p className="mt-4 text-base font-[330] leading-[1.45] tracking-[-0.01em] text-ink">{principle.text}</p>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}

export function ExperienceJourney() {
  return (
    <section id="journey" className="container-pad scroll-mt-28 py-16 sm:py-24">
      <div className="rounded-[24px] bg-block-navy p-8 text-white sm:p-12 lg:p-14">
        <SectionHeader
          eyebrow="Experience"
          title="A journey through products, systems and difficult terrain."
          tone="dark"
        />
        <StaggerGroup className="divide-y divide-white/16" staggerDelay={0.07}>
          {journey.map((item, index) => (
            <StaggerItem key={item.title}>
              <div className="grid gap-4 py-8 md:grid-cols-[140px_1fr_1fr]">
                <div className="flex items-center gap-3 md:block">
                  <IconBadge
                    icon={journeyIcons[index % journeyIcons.length]}
                    size="sm"
                    className="bg-white text-signal ring-1 ring-white/30 md:mb-4"
                  />
                  <p className="font-mono text-xs uppercase tracking-[0.16em] text-white">{item.period}</p>
                </div>
                <div className="min-w-0">
                  <h3 className="text-balance text-2xl font-[540] tracking-[-0.01em]">{item.title}</h3>
                  <p className="mt-3 text-base font-[330] leading-[1.45] tracking-[-0.01em] text-white">{item.detail}</p>
                </div>
                <p className="text-base font-[330] leading-[1.45] tracking-[-0.01em] text-white">{item.impact}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}

export function Testimonials() {
  return (
    <section className="container-pad py-16 sm:py-24">
      <SectionHeader eyebrow="Testimonials" title="The kind of collaboration I try to create." />
      <StaggerGroup className="grid gap-4 md:grid-cols-3">
        {testimonials.map((testimonial) => (
          <StaggerItem
            key={testimonial.name}
            className="rounded-lg bg-mist p-7 ring-1 ring-transparent transition-[transform,box-shadow] duration-[180ms] ease-premium hover:-translate-y-[3px] hover:shadow-lift hover:ring-black/5 dark:bg-white/[0.06]"
          >
            <blockquote className="text-pretty text-xl font-[540] leading-[1.45] tracking-[-0.01em]">“{testimonial.quote}”</blockquote>
            <p className="mt-8 text-sm font-[540]">{testimonial.name}</p>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-ink dark:text-white/72">{testimonial.role}</p>
          </StaggerItem>
        ))}
      </StaggerGroup>
    </section>
  );
}

export function RunningAdventure() {
  return (
    <section className="container-pad pt-14 pb-6 sm:pt-20 sm:pb-8">
      <Reveal className="rounded-[24px] bg-mist p-8 text-ink dark:bg-white/[0.06] dark:text-white sm:p-10 lg:p-12">
        <Link
          href="/more-about-me"
          className="group flex flex-col gap-6 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-4 focus-visible:ring-offset-mist dark:focus-visible:ring-offset-[#151514] sm:flex-row sm:items-center sm:justify-between"
        >
          <h2 className="text-balance text-3xl font-[340] leading-[1.08] tracking-[-0.025em] sm:text-4xl">
            Beyond design, movement keeps me curious.
          </h2>
          <span className="inline-flex shrink-0 items-center gap-2 text-base font-[540] tracking-[-0.01em] text-ink transition duration-200 group-hover:text-signal dark:text-white">
            More about me <ArrowRight size={17} aria-hidden="true" />
          </span>
        </Link>
      </Reveal>
    </section>
  );
}

export function Contact() {
  return (
    <section id="contact" className="container-pad scroll-mt-28 pt-6 pb-16 sm:pt-8 sm:pb-24">
      <Reveal className="rounded-[24px] bg-block-lime p-8 text-ink sm:p-12 lg:p-14">
        <p className="mb-5 font-mono text-xs uppercase tracking-[0.16em] text-ink">Contact</p>
        <h2 className="max-w-4xl text-balance text-4xl font-[340] leading-[1.04] tracking-[-0.025em] sm:text-6xl">
          Complex problems deserve thoughtful design.
        </h2>
        <p className="mt-6 max-w-2xl text-xl font-[330] leading-[1.4] tracking-[-0.01em] text-ink">
          I&apos;m always interested in teams tackling ambitious products, complex systems and meaningful challenges. If that sounds like what you&apos;re building, I&apos;d love to hear from you.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <TrackedAnchor
            href="mailto:sw@shaunwhiting.com"
            eventName="email_contact_clicked"
            eventData={{
              cta_label: "Email Shaun",
              destination_url: "mailto:sw@shaunwhiting.com",
              location: "contact_panel",
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-[480] tracking-[-0.01em] text-white transition duration-200 hover:bg-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-block-lime"
          >
            Email Shaun <Mail size={17} aria-hidden="true" />
          </TrackedAnchor>
          <TrackedAnchor
            href="https://www.linkedin.com/in/shaunwhiting/"
            eventName="linkedin_clicked"
            eventData={{
              cta_label: "LinkedIn",
              destination_url: "https://www.linkedin.com/in/shaunwhiting/",
              location: "contact_panel",
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-[15px] font-[480] tracking-[-0.01em] text-ink transition duration-200 hover:bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-block-lime"
          >
            LinkedIn <ArrowRight size={17} aria-hidden="true" />
          </TrackedAnchor>
        </div>
      </Reveal>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="container-pad pb-8">
      <div className="flex flex-col gap-4 border-t hairline pt-8 text-sm text-black/55 dark:text-white/55 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Shaun Whiting</p>
        <p>Product design, systems thinking and careful execution.</p>
      </div>
    </footer>
  );
}

function IconBadge({
  icon: Icon,
  size = "md",
  className = "",
  accentOnHover = false,
}: {
  icon: LucideIcon;
  size?: "sm" | "md";
  className?: string;
  accentOnHover?: boolean;
}) {
  const badgeSize = size === "sm" ? "h-9 w-9" : "h-11 w-11";
  const iconSize = size === "sm" ? 16 : 19;
  const accentClasses = accentOnHover
    ? "transition-colors duration-[180ms] ease-premium group-hover:bg-signal group-hover:text-white dark:group-hover:bg-signal dark:group-hover:text-white"
    : "";

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white text-ink dark:bg-white/[0.12] dark:text-white ${badgeSize} ${accentClasses} ${className}`}
    >
      <Icon size={iconSize} strokeWidth={1.8} aria-hidden="true" />
    </span>
  );
}
