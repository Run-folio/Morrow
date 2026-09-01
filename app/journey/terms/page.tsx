import Link from "next/link";
import EasyTNavigation from "../easyt-navigation";
import { morroviaLegalIdentity } from "@/lib/morrovia-legal-identity";
import readingStyles from "../privacy/privacy.module.css";
import styles from "./terms.module.css";

export const metadata = {
  title: "Terms of Use",
  description: "The terms for using Morrovia's travel-planning software and external travel-provider links.",
  robots: { index: true, follow: true },
};

const sections = [
  ["service", "What Morrovia provides"],
  ["travel-information", "Travel information"],
  ["external-bookings", "External bookings"],
  ["ai", "AI and automation"],
  ["content", "Your content"],
  ["accounts", "Accounts and acceptable use"],
  ["availability", "Availability and termination"],
  ["liability", "Responsibility and liability"],
  ["contact", "Complaints and legal terms"],
] as const;

export default function TermsOfUsePage() {
  const complaintHref = `mailto:${morroviaLegalIdentity.supportContact}?subject=${encodeURIComponent("Morrovia Terms complaint")}`;

  return <main id="main-content">
    <EasyTNavigation />
    <div className={readingStyles.page}>
      <a className={readingStyles.skipLink} href="#terms-content">Skip to the Terms of Use</a>
      <section className={readingStyles.hero} aria-labelledby="terms-title">
        <p>Terms of Use</p>
        <h1 id="terms-title">Planning support, with clear travel boundaries.</h1>
        <span>These Terms explain the agreement for using Morrovia and where a third-party travel provider takes over.</span>
        <small>Effective 1 September 2026 · Version 1.0</small>
      </section>

      <article id="terms-content" className={`${readingStyles.content} ${styles.content}`} tabIndex={-1}>
        <nav className={readingStyles.contents} aria-label="On this page">
          <strong>On this page</strong>
          <ul>{sections.map(([id, label]) => <li key={id}><a href={`#${id}`}>{label}</a></li>)}</ul>
        </nav>

        <section className={`${readingStyles.card} ${readingStyles.summary} ${styles.summary}`} aria-labelledby="agreement-title">
          <div>
            <h2 id="agreement-title">Your agreement with Morrovia</h2>
            <p><strong>{morroviaLegalIdentity.operatorTradingAs}</strong> provides Morrovia and is your contracting party for this software service. These Terms apply when you use Morrovia. By creating an account, you agree to them. If you do not agree, do not create an account or continue using the service.</p>
            <p>You must be at least 18 years old to create or use a Morrovia account. Morrovia is currently a travel-planning tool, not the seller or operator of the travel services shown in a plan.</p>
          </div>
        </section>

        <section id="service" className={readingStyles.section} aria-labelledby="service-title">
          <p className={readingStyles.kicker}>THE SERVICE</p>
          <h2 id="service-title">What Morrovia provides</h2>
          <p>Morrovia provides travel-planning software. It can organise routes, stops, nights, dates, itinerary items, preferences and preparation tasks; run deterministic planning checks; and offer automated or AI-assisted recommendations.</p>
          <p>Morrovia does not currently sell flights, accommodation, activities or other travel services, take payment for them, operate a third-party booking, or bundle travel services for one combined price or checkout. A future paid Morrovia subscription would pay for software access, not for a travel booking, and would require separate subscription terms before launch.</p>
        </section>

        <section id="travel-information" className={readingStyles.section} aria-labelledby="travel-title">
          <p className={readingStyles.kicker}>VERIFY BEFORE TRAVEL</p>
          <h2 id="travel-title">Travel information changes</h2>
          <p>Morrovia helps you understand a possible trip, but does not guarantee that a route will remain feasible at the time of travel. Schedules, fares, inventory, opening hours, entry requirements, border conditions, weather, safety conditions and provider performance can change or be incomplete.</p>
          <p>Before booking or travelling, verify material information directly with the booking provider, transport operator, accommodation or activity provider, and the relevant government or official authority. This includes passports, visas, entry approval, health requirements, safety advice, connection times, accessibility needs, insurance and cancellation conditions.</p>
          <p>Confidence, provenance, warning and unknown states are planning aids. They tell you what Morrovia currently knows; they do not turn an estimate into a provider or official guarantee.</p>
        </section>

        <section id="external-bookings" className={`${readingStyles.card} ${styles.boundary}`} aria-labelledby="booking-title">
          <p className={readingStyles.kicker}>THIRD-PARTY SERVICES</p>
          <h2 id="booking-title">A link is not a booking</h2>
          <p>Clicking a provider link opens an external service. It does not complete a booking in Morrovia, reserve inventory or confirm a price. Payment and booking take place with the named third party, and that provider's terms, privacy notice, cancellation and refund rules apply.</p>
          <p>Under the current product model, Morrovia does not become the travel merchant, organiser, retailer, agent or service provider merely because it displayed or referred you to an external option. Morrovia may earn an affiliate commission where this is disclosed, without changing which provider contracts with you.</p>
          <p>Morrovia is not responsible for a provider's inventory, travel service or performance. This does not remove any responsibility Morrovia has for its own software service or its own acts and omissions.</p>
        </section>

        <section id="ai" className={readingStyles.section} aria-labelledby="ai-title">
          <p className={readingStyles.kicker}>AI AND AUTOMATION</p>
          <h2 id="ai-title">Recommendations can be incomplete or wrong</h2>
          <p>Some Morrovia features use automated rules or AI systems to interpret a trip, explain trade-offs and suggest changes. Outputs can be inaccurate, incomplete, outdated or unsuitable for your circumstances. They do not replace provider or official verification.</p>
          <p>Where Luna proposes a supported material trip change, the current product creates a deterministic preview and requires you to review and apply it. Morrovia does not claim that an autonomous agent books or changes travel for you.</p>
        </section>

        <section id="content" className={readingStyles.section} aria-labelledby="content-title">
          <p className={readingStyles.kicker}>CONTENT AND OWNERSHIP</p>
          <h2 id="content-title">Your trip content and Morrovia's software</h2>
          <p>You retain your rights in trip prompts, notes, photos and other content you provide. You give {morroviaLegalIdentity.legalOperator} a non-exclusive, royalty-free licence to host, copy, organise, analyse, transform, display and transmit that content only as reasonably necessary to provide, secure and support the Morrovia service you use, including through the processors described in the <Link href="/journey/privacy">Privacy Notice</Link>.</p>
          <p>You must have the right to provide that content and must not include unlawful material or another person's confidential or personal information without an appropriate basis. The licence ends when the content is deleted from active systems, subject to reasonable technical backups and records Morrovia must retain by law or for legitimate security and dispute purposes.</p>
          <p>Morrovia and its licensors own the software, product design, branding and Morrovia-created content. These Terms let you use the service for personal travel planning; they do not transfer Morrovia intellectual property to you.</p>
        </section>

        <section id="accounts" className={readingStyles.section} aria-labelledby="accounts-title">
          <p className={readingStyles.kicker}>YOUR RESPONSIBILITIES</p>
          <h2 id="accounts-title">Accounts and acceptable use</h2>
          <p>Provide accurate account details, keep your sign-in credentials and private trip links secure, and tell Morrovia promptly if you believe an account or link has been compromised. You are responsible for activity you authorise through your account.</p>
          <p>Do not use Morrovia to break the law, infringe rights, impersonate someone, distribute malicious code, probe or bypass security, interfere with the service, scrape it at unreasonable volume, misuse provider links, or upload content you are not entitled to use. Do not enter passport numbers, passport scans, payment-card details or other unnecessary high-risk information into free-text trip fields.</p>
        </section>

        <section id="availability" className={readingStyles.section} aria-labelledby="availability-title">
          <p className={readingStyles.kicker}>SERVICE CHANGES</p>
          <h2 id="availability-title">Availability, changes and ending access</h2>
          <p>Morrovia may maintain, improve, add, remove or discontinue software features. The service may sometimes be interrupted by maintenance, faults, security work or dependencies outside Morrovia's control. Morrovia does not promise uninterrupted availability, but will provide the service with reasonable care and skill.</p>
          <p>For a material adverse change to an account feature or these Terms, Morrovia will give reasonable notice where practicable and explain when the change takes effect. Changes will not remove rights that already arose under applicable law.</p>
          <p>You can stop using Morrovia at any time and can use the support or privacy contact for the current manual account-deletion process. Morrovia may restrict or suspend access where reasonably necessary for security, legal compliance, serious misuse or a material breach of these Terms. Where appropriate, Morrovia will explain the reason and provide a reasonable opportunity to resolve it or complain. Permanent termination will be proportionate to the circumstances.</p>
        </section>

        <section id="liability" className={`${readingStyles.card} ${styles.consumer}`} aria-labelledby="liability-title">
          <p className={readingStyles.kicker}>CONSUMER RIGHTS</p>
          <h2 id="liability-title">Responsibility and liability</h2>
          <p>Nothing in these Terms excludes or limits liability where doing so would be unlawful. This includes liability for death or personal injury caused by negligence, fraud or fraudulent misrepresentation, and your statutory consumer rights.</p>
          <p>Morrovia is responsible for loss or damage that is a foreseeable result of its breach of these Terms or failure to use reasonable care and skill. Morrovia is not responsible for loss that it did not cause, that was not reasonably foreseeable when the contract began, or that relates to a third-party travel provider's independent acts or omissions. If you use Morrovia as a consumer, Morrovia is not responsible for business losses.</p>
          <p>These Terms do not reduce any mandatory remedy available to you if Morrovia's software service is not provided with reasonable care and skill or does not match its description. The allocation of responsibility in this section, including its treatment of third-party services and free software use, requires solicitor review before formal approval.</p>
        </section>

        <section id="contact" className={readingStyles.section} aria-labelledby="contact-title">
          <p className={readingStyles.kicker}>CONTACT AND LAW</p>
          <h2 id="contact-title">Complaints, changes and governing law</h2>
          <p>For a complaint about Morrovia or these Terms, email <a href={complaintHref}>{morroviaLegalIdentity.supportContact}</a> and include enough information to identify the account or issue. Do not email passwords, passport documents or payment-card information.</p>
          <p>These Terms and the contract for Morrovia are governed by the laws of England and Wales. The courts of England and Wales have non-exclusive jurisdiction. If you are a consumer resident elsewhere, this does not remove mandatory protections or any right to bring proceedings in your home courts that applicable law gives you. This governing-law wording requires solicitor confirmation against the operator's registration and target launch markets.</p>
          <p>Morrovia may update these Terms for changes to the service, law, security or commercial model. A material change will have a new version and effective date and will be brought to account holders' attention with reasonable notice where practicable. Continued use after that date means the updated Terms apply from then; changes do not apply retrospectively to remove accrued rights.</p>
        </section>

        <nav className={styles.related} aria-label="Related legal information">
          <Link href="/journey/privacy">Privacy Notice</Link>
          <Link href="/journey/cookies#cookie-settings">Cookie Notice and settings</Link>
          <Link href="/journey/affiliate-disclosure">Affiliate and Commercial Disclosure</Link>
        </nav>
        <p className={styles.review}>These Terms are an implementation draft matched to the current product. They have not received formal legal approval.</p>
        <Link className={readingStyles.back} href="/journey/home">Back to Morrovia</Link>
      </article>
    </div>
  </main>;
}
