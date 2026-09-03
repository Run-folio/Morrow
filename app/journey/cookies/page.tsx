import Link from "next/link";
import CookiePreferences from "@/components/cookie-preferences";
import EasyTNavigation from "../easyt-navigation";
import { morroviaLegalIdentity } from "@/lib/morrovia-legal-identity";
import readingStyles from "../privacy/privacy-current.module.css";
import styles from "./cookies.module.css";

export const metadata = {
  title: "Cookie notice",
  description: "The cookies and browser technologies Morrovia currently uses, and how to control optional tracking.",
};

const technologies = [
  {
    name: "Better Auth session cookie",
    detail: "First-party, strictly necessary. Keeps a signed-in account session working and secure. In HTTPS production the expected name is __Secure-better-auth.session_token; local HTTP uses better-auth.session_token. It is HttpOnly, SameSite=Lax, Path=/ and normally lasts seven days under the installed Better Auth defaults. Secure is enabled for HTTPS/production. It is not controlled by optional tracking consent.",
  },
  {
    name: "Better Auth OAuth state cookie",
    detail: "First-party, strictly necessary when Google sign-in is started. The expected HTTPS production name is __Secure-better-auth.state; local HTTP uses better-auth.state. It is HttpOnly, SameSite=Lax, Path=/ and normally lasts five minutes. It protects the temporary sign-in handoff and is not controlled by optional tracking consent.",
  },
  {
    name: "Morrovia consent record",
    detail: "First-party localStorage under easyt-analytics-consent. Necessary to remember the policy version, decision time and optional category choices. It remains until replaced or browser site data is cleared.",
  },
  {
    name: "Trip planning and recovery storage",
    detail: "First-party localStorage for the home-trip draft, trip cache, recovery copy, active trip, owner boundary, profile, readiness, saved finder choices, stamps and memories. Strictly necessary or functional depending on the feature. These records are created by the relevant planning action, are not tracking, and are not removed when optional tracking is rejected.",
  },
  {
    name: "Language, theme and interface preferences",
    detail: "First-party localStorage or sessionStorage. Functional preferences created when a traveller changes or dismisses the relevant interface. They generally remain until replaced, the browser tab closes for sessionStorage, or site data is cleared.",
  },
  {
    name: "Public application-shell cache",
    detail: "First-party Cache Storage named easyt-public-shell-v6. Functional technology created by the production service worker for public Journey pages and static assets. It remains until service-worker version cleanup or browser site data is cleared; account and API responses are excluded.",
  },
  {
    name: "PostHog",
    detail: "Optional product analytics. Loaded only after Product analytics is allowed and only when its key and host are configured. Morrovia disables autocapture, dead-click and exception capture, heatmaps, performance/web-vitals capture, automatic page views and page leaves, session recording, surveys and remote feature configuration. PostHog may create its own first-party browser identifier after consent; its exact lifetime is vendor-controlled rather than set by Morrovia.",
  },
  {
    name: "Google Analytics 4",
    detail: "Optional product analytics. Loaded only after Product analytics is allowed, in production, and when a GA measurement ID is configured. Morrovia sends manual page views and deliberately limited product events. GA may create first-party _ga-family cookies after consent; their exact lifetime is not configured in this repository.",
  },
  {
    name: "Omio Impact",
    detail: "Optional commercial and affiliate attribution. Loaded only after Affiliate attribution is allowed. It can transform eligible Omio links and measure impressions. Normal approved Omio links remain usable when this category is off. Impact controls any vendor identifiers and their lifetime; Morrovia does not have a verified API that deletes all vendor state after loading.",
  },
] as const;

export default function CookieNoticePage() {
  return (
    <main id="main-content">
      <EasyTNavigation />
      <div className={readingStyles.page}>
        <a className={readingStyles.skipLink} href="#cookie-content">Skip to cookie notice</a>
        <section className={readingStyles.hero} aria-labelledby="cookie-title">
          <p>Cookie notice</p>
          <h1 id="cookie-title">The browser technology Morrovia uses.</h1>
          <span>This notice describes the cookies, local storage and optional tracking implemented in Morrovia today, and gives you control over optional categories.</span>
          <small>Last updated 30 August 2026</small>
        </section>

        <article id="cookie-content" className={`${readingStyles.content} ${styles.content}`} tabIndex={-1}>
          <CookiePreferences />

          <section className={readingStyles.section} aria-labelledby="categories-title">
            <h2 id="categories-title">How the categories work</h2>
            <p><strong>Necessary</strong> technology keeps authentication, security, trip planning, recovery and your privacy choice working. <strong>Functional</strong> storage remembers choices such as language, theme or interface state. <strong>Product analytics</strong> and <strong>affiliate attribution</strong> are optional and remain off without a current saved choice.</p>
          </section>

          <section className={readingStyles.section} aria-labelledby="inventory-title">
            <h2 id="inventory-title">Current technology inventory</h2>
            <div className={styles.inventory}>
              {technologies.map((technology) => <article key={technology.name}><h3>{technology.name}</h3><p>{technology.detail}</p></article>)}
            </div>
          </section>

          <section className={readingStyles.section} aria-labelledby="control-title">
            <h2 id="control-title">Changing or withdrawing your choice</h2>
            <p>You can return to Cookie settings without signing in. Withdrawal stops future Morrovia analytics dispatch, removes Morrovia-owned analytics deduplication state, invokes supported provider opt-out/reset controls, and prevents optional SDKs from loading on the next page. It does not remove authentication, saved trips, recovery copies, language, theme or other functional data.</p>
            <p>Microsoft Clarity is currently disabled in Morrovia because the deployed project’s replay and masking configuration has not been verified against Morrovia’s private-trip boundary.</p>
          </section>

          <section className={styles.links} aria-label="Related information">
            <Link href="/journey/privacy">Read the Privacy notice</Link>
            <a href="#cookie-settings">Open Cookie settings</a>
          </section>
          <p className={styles.operator}>{morroviaLegalIdentity.operatorTradingAs} operates the Morrovia product.</p>
        </article>
      </div>
    </main>
  );
}
