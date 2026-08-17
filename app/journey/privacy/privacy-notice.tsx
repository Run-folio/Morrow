"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Database, Eye, MapPin, Mail, ShieldCheck } from "lucide-react";
import { setAnalyticsConsent } from "@/components/privacy-consent";
import type { EasyTLanguage } from "@/lib/easyt/i18n";
import styles from "./privacy.module.css";
import currentStyles from "./privacy-current.module.css";

const copy = {
  en: {
    eyebrow: "EASYT PRIVACY",
    title: "Your travel data, explained plainly.",
    intro: "This notice explains what Morrovia stores, why we use it and the choices you have. It reflects the product as it is today, not a promise of features that do not exist.",
    updated: "Last updated 10 August 2026",
    summary: "The short version",
    summaryText: "Morrovia stores the details you choose to save so your plans, preferences and stamps work across devices. We use location only when you ask us to find somewhere nearby. Optional analytics are off until you allow them.",
    collect: "What we collect",
    collectItems: [
      ["Account details", "Your name, email address, account identifier and authentication records. Passwords are handled by the authentication system and are never shown inside Morrovia."],
      ["Trip information", "Your trip title, dates, destinations, selected places, plan items, notes, pins and the practical route details you save."],
      ["Profile and memories", "Your travel-profile choices, language preference, country stamps, country notes and any photo you choose to attach to a stamp. If you choose to personalise trip-preparation reminders, this can include nationality or nationalities, country of residence and passport-expiry month only — never a passport number, scan or image."],
      ["Feedback and email records", "Ratings and comments you send, plus a record of transactional email delivery such as verification, password reset and trip-gift emails."],
    ],
    location: "Location and nearby search",
    locationText: "If you choose “Use my location” or start a nearby search, your browser asks first. The coordinates are sent to Morrovia to return nearby places and may be passed to OpenStreetMap-powered search services. Morrovia does not add those coordinates to your saved profile or trip unless you deliberately save a place or pin.",
    device: "Data kept on this device",
    deviceText: "Morrovia keeps some information locally on your device so the product works reliably: trip drafts and active plans, language and UI preferences, travel profile and readiness information, finder choices, and stamps or memories. This data stays on the device until it is saved to an account where applicable or you clear your browser’s site data.",
    cookies: "Necessary cookies and browser technology",
    cookiesText: "When you sign in, Morrovia uses necessary session and security cookies to keep your account secure and working. We also use functional Cache Storage and a service worker for the public application shell where your browser supports them.",
    providers: "Services we rely on",
    providersText: "Morrovia uses a database and authentication service to operate accounts and saved plans, Resend to deliver transactional email, CARTO and OpenStreetMap-based services including Nominatim, Overpass and Photon for maps, place search and nearby results. External map and booking links take you to those services under their own policies.",
    analytics: "Optional analytics",
    analyticsText: "When configured for the live site, Google Analytics and Microsoft Clarity help us understand aggregate use and product issues. They do not load until you choose to allow optional analytics, and declining them does not affect core Morrovia functionality. You can change this choice here at any time. Changing your choice controls future analytics activity; it does not claim to remove third-party cookies that may already exist.",
    allow: "Allow optional analytics",
    decline: "Continue without analytics",
    sharing: "Sharing a trip",
    sharingText: "A trip gift is a private, time-limited claim link sent to the recipient email you enter. The recipient must sign in with that email to claim their own editable copy. Do not forward a claim link unless you intend to share it.",
    retention: "Keeping and removing data",
    retentionText: "You can delete individual trips from Trips and remove stamps, notes and photos from Stamps. We retain account and saved data while your account is active, plus limited operational records needed for security and transactional email history. Account deletion is currently handled by support so we can safely verify the request and remove the associated Morrovia data.",
    contact: "Your choices and contact",
    contactText: "To request access to, correction of or deletion of your Morrovia account data, email us from the address on your account. We may need to verify ownership before acting on the request.",
    email: "Email Morrovia support",
    back: "Back to Morrovia",
    note: "This is a product privacy notice, not legal advice. We will update it as EasyT’s data practices change.",
  },
  es: {
    eyebrow: "PRIVACIDAD DE EASYT",
    title: "Tus datos de viaje, explicados con claridad.",
    intro: "Este aviso explica qué guarda Morrovia, por qué lo usamos y qué opciones tienes. Describe el producto tal como existe hoy, no funciones que aún no existen.",
    updated: "Última actualización: 10 de agosto de 2026",
    summary: "En pocas palabras",
    summaryText: "Morrovia guarda los detalles que eliges para que tus planes, preferencias y sellos funcionen en todos tus dispositivos. Usamos tu ubicación solo cuando nos pides encontrar algo cercano. La analítica opcional permanece desactivada hasta que la permites.",
    collect: "Qué recopilamos",
    collectItems: [
      ["Datos de la cuenta", "Tu nombre, correo electrónico, identificador de cuenta y registros de autenticación. El sistema de autenticación gestiona las contraseñas y nunca se muestran dentro de Morrovia."],
      ["Información del viaje", "El título, las fechas, destinos, lugares seleccionados, elementos del plan, notas, pines y detalles prácticos de ruta que guardas."],
      ["Perfil y recuerdos", "Las elecciones de tu perfil de viaje, idioma, sellos de países, notas de países y cualquier foto que adjuntes a un sello. Si eliges personalizar los recordatorios antes de salir, puede incluir nacionalidad o nacionalidades, país de residencia y mes de caducidad del pasaporte, pero nunca un número, escaneo o imagen del pasaporte."],
      ["Comentarios y registros de correo", "Las valoraciones y comentarios que envías, además de un registro de la entrega de correos transaccionales como verificación, restablecimiento de contraseña y regalos de viajes."],
    ],
    location: "Ubicación y búsqueda cercana",
    locationText: "Si eliges “Usar mi ubicación” o inicias una búsqueda cercana, tu navegador pide permiso primero. Las coordenadas se envían a Morrovia para mostrar lugares cercanos y pueden compartirse con servicios de búsqueda basados en OpenStreetMap. Morrovia no añade estas coordenadas a tu perfil ni a tus viajes, a menos que guardes deliberadamente un lugar o un pin.",
    device: "Datos guardados en este dispositivo",
    deviceText: "Morrovia guarda parte de la información localmente en tu dispositivo para que el producto funcione de forma fiable: borradores y planes activos, idioma y preferencias de interfaz, perfil e información de preparación, elecciones del buscador y sellos o recuerdos. Estos datos permanecen en el dispositivo hasta que se guardan en una cuenta cuando corresponde o borras los datos del sitio en tu navegador.",
    cookies: "Cookies necesarias y tecnología del navegador",
    cookiesText: "Al iniciar sesión, Morrovia usa cookies necesarias de sesión y seguridad para que tu cuenta siga siendo segura y funcione. También usamos Cache Storage funcional y un service worker para la aplicación pública cuando tu navegador los admite.",
    providers: "Servicios que utilizamos",
    providersText: "Morrovia usa una base de datos y un servicio de autenticación para operar cuentas y planes guardados, Resend para enviar correos transaccionales, CARTO y servicios basados en OpenStreetMap, incluidos Nominatim, Overpass y Photon, para mapas, búsqueda de lugares y resultados cercanos. Los enlaces externos de mapas y reservas te llevan a esos servicios con sus propias políticas.",
    analytics: "Analítica opcional",
    analyticsText: "Cuando están configurados para el sitio en vivo, Google Analytics y Microsoft Clarity nos ayudan a comprender el uso general y los problemas del producto. No se cargan hasta que permites la analítica opcional, y rechazarlos no afecta a las funciones principales de Morrovia. Puedes cambiar esta elección aquí en cualquier momento. Cambiar tu elección controla la actividad analítica futura; no afirma eliminar cookies de terceros que ya puedan existir.",
    allow: "Permitir analítica opcional",
    decline: "Continuar sin analítica",
    sharing: "Compartir un viaje",
    sharingText: "Un regalo de viaje es un enlace privado y temporal enviado al correo del destinatario que introduces. El destinatario debe iniciar sesión con ese correo para reclamar su propia copia editable. No reenvíes un enlace de reclamación salvo que quieras compartirlo.",
    retention: "Conservación y eliminación de datos",
    retentionText: "Puedes eliminar viajes individuales desde Viajes y quitar sellos, notas y fotos desde Sellos. Conservamos los datos de la cuenta y los guardados mientras tu cuenta está activa, además de registros operativos limitados necesarios para la seguridad y el historial de correos transaccionales. La eliminación de cuentas se gestiona actualmente mediante soporte para verificar la solicitud de forma segura y retirar los datos de Morrovia asociados.",
    contact: "Tus opciones y contacto",
    contactText: "Para solicitar acceso, corrección o eliminación de los datos de tu cuenta de Morrovia, escríbenos desde el correo de tu cuenta. Es posible que necesitemos verificar la titularidad antes de atender la solicitud.",
    email: "Escribir a soporte de Morrovia",
    back: "Volver a Morrovia",
    note: "Este es un aviso de privacidad del producto, no asesoramiento legal. Lo actualizaremos cuando cambien las prácticas de datos de Morrovia.",
  },
} as const;

export default function PrivacyNotice() {
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [choice, setChoice] = useState<"granted" | "declined" | null>(null);

  useEffect(() => {
    const refresh = () => {
      setLanguage(window.localStorage.getItem("easyt-language") === "es" ? "es" : "en");
      const consent = window.localStorage.getItem("easyt-analytics-consent");
      setChoice(consent === "granted" || consent === "declined" ? consent : null);
    };
    refresh();
    window.addEventListener("easyt-language-change", refresh);
    window.addEventListener("easyt-analytics-consent-change", refresh);
    return () => {
      window.removeEventListener("easyt-language-change", refresh);
      window.removeEventListener("easyt-analytics-consent-change", refresh);
    };
  }, []);

  const t = copy[language];
  const setChoiceAndRefresh = (next: "granted" | "declined") => {
    setAnalyticsConsent(next);
    setChoice(next);
  };

  return (
    <div className={`${styles.page} ${currentStyles.page}`}>
      <a className={`${styles.skipLink} ${currentStyles.skipLink}`} href="#privacy-content">Skip to privacy notice</a>
      <section className={`${styles.hero} ${currentStyles.hero}`} aria-labelledby="privacy-title">
        <p>{t.eyebrow}</p>
        <h1 id="privacy-title">{t.title}</h1>
        <span>{t.intro}</span>
        <small>{t.updated}</small>
      </section>

      <section id="privacy-content" className={`${styles.content} ${currentStyles.content}`} tabIndex={-1}>
        <article className={`${styles.card} ${styles.summary}`}>
          <ShieldCheck aria-hidden="true" />
          <div><h2>{t.summary}</h2><p>{t.summaryText}</p></div>
        </article>

        <section className={styles.section} aria-labelledby="collect-title">
          <p className={styles.kicker}>{t.collect}</p>
          <div className={styles.dataGrid}>
            {t.collectItems.map(([title, text]) => <article className={styles.card} key={title}><Database aria-hidden="true" /><h2>{title}</h2><p>{text}</p></article>)}
          </div>
        </section>

        <section className={styles.split}>
          <article className={styles.card}><MapPin aria-hidden="true" /><h2>{t.location}</h2><p>{t.locationText}</p></article>
          <article className={styles.card}><Database aria-hidden="true" /><h2>{t.device}</h2><p>{t.deviceText}</p></article>
        </section>

        <article className={styles.card}><ShieldCheck aria-hidden="true" /><h2>{t.cookies}</h2><p>{t.cookiesText}</p></article>

        <article className={styles.card}><Eye aria-hidden="true" /><h2>{t.providers}</h2><p>{t.providersText}</p></article>

        <section id="analytics-settings" className={`${styles.card} ${styles.analytics}`} aria-labelledby="analytics-title">
          <div><p className={styles.kicker}>{t.analytics}</p><h2 id="analytics-title">{t.analytics}</h2><p>{t.analyticsText}</p><small>{choice === "granted" ? (language === "es" ? "La analítica opcional está permitida." : "Optional analytics are currently allowed.") : choice === "declined" ? (language === "es" ? "La analítica opcional está desactivada." : "Optional analytics are currently off.") : ""}</small></div>
          <div className={styles.choiceButtons}>
            <button type="button" onClick={() => setChoiceAndRefresh("declined")}>{t.decline}</button>
            <button type="button" onClick={() => setChoiceAndRefresh("granted")}>{t.allow}</button>
          </div>
        </section>

        <section className={styles.split}>
          <article className={styles.card}><Mail aria-hidden="true" /><h2>{t.sharing}</h2><p>{t.sharingText}</p></article>
          <article className={styles.card}><Database aria-hidden="true" /><h2>{t.retention}</h2><p>{t.retentionText}</p></article>
        </section>

        <section className={`${styles.card} ${styles.contact}`}>
          <div><h2>{t.contact}</h2><p>{t.contactText}</p></div>
          <a href="mailto:sw@shaunwhiting.com">{t.email} <Mail aria-hidden="true" /></a>
        </section>
        <p className={styles.note}>{t.note}</p>
        <Link className={styles.back} href="/journey/home"><ChevronLeft aria-hidden="true" />{t.back}</Link>
      </section>
    </div>
  );
}
