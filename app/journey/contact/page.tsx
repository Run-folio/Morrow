import type { Metadata } from "next";
import EasyTNavigation from "../easyt-navigation";
import ContactForm from "./contact-form";
import { contactTopic } from "@/lib/easyt/contact-message";
import styles from "./contact.module.css";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Morrovia about planning, support, privacy or another question.",
  alternates: { canonical: "/journey/contact" },
};

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  return <main id="main-content" className={`${styles.page} morrovia-editorial-page`}>
    <EasyTNavigation landing />
    <section className={styles.content} aria-labelledby="contact-title">
      <header className={styles.heading}>
        <p>CONTACT MORROVIA</p>
        <h1 id="contact-title">How can we help?</h1>
        <span>Ask about planning, your account, privacy or anything that is getting in the way of your trip.</span>
      </header>
      <div className={styles.surface}>
        <ContactForm topic={contactTopic(topic)} />
      </div>
    </section>
  </main>;
}
