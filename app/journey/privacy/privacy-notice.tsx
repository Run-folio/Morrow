"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, ChevronLeft, Database, Eye, MapPin, Mail, Mic, ShieldCheck } from "lucide-react";
import { EasyTLinkButton } from "@/components/easyt/easyt-controls";
import type { EasyTLanguage } from "@/lib/easyt/i18n";
import { morroviaLegalIdentity } from "@/lib/morrovia-legal-identity";
import styles from "./privacy.module.css";
import currentStyles from "./privacy-current.module.css";

const copy = {
  en: {
    eyebrow: "MORROVIA PRIVACY",
    title: "Your travel data, explained plainly.",
    intro: "This notice explains what Morrovia stores, why we use it and the choices you have. It reflects the product as it is today, not a promise of features that do not exist.",
    updated: "Last updated 30 August 2026",
    summary: "The short version",
    summaryText: "Morrovia stores the details you choose to save so your plans, preferences and stamps work across devices. We use location only when you ask us to find somewhere nearby. Optional analytics are off until you allow them.",
    collect: "What we collect",
    collectItems: [
      ["Account details", "Your name, email address, account identifier and authentication records. Passwords are handled by the authentication system and are never shown inside Morrovia."],
      ["Trip information", "Your trip title, dates, destinations, selected places, plan items, notes, pins and the practical route details you save."],
      ["Profile and memories", "Your travel-profile choices, language preference, country stamps, country notes and any photo you choose to attach to a stamp. If you choose to personalise trip-preparation reminders, this can include nationality or nationalities, country of residence and passport-expiry month only. It never includes a passport number, scan or image."],
      ["Feedback and email records", "Ratings and comments you send, plus a record of transactional email delivery such as verification, password reset and trip-gift emails."],
      ["Forwarded booking confirmations", "If you create a private forwarding address and deliberately send a confirmation, Resend receives that individual message. Morrovia verifies the private address and your account sender, rejects attachments, and stores only the extracted booking candidate and a categorical processing record. The Morrovia database does not keep the raw subject, body or HTML."],
    ],
    location: "Location and nearby search",
    locationText: "If you choose “Use my location” or start a nearby search, your browser asks first. The coordinates are sent to Morrovia to return nearby places and may be passed to OpenStreetMap-powered search services. Morrovia does not add those coordinates to your saved profile or trip unless you deliberately save a place or pin.",
    device: "Data kept on this device",
    deviceText: "Morrovia keeps some information locally on your device so the product works reliably: trip drafts and active plans, language and UI preferences, travel profile and readiness information, finder choices, and stamps or memories. This data stays on the device until it is saved to an account where applicable or you clear your browser’s site data.",
    cookies: "Necessary cookies and browser technology",
    cookiesText: "When you sign in, Morrovia uses necessary session and security cookies to keep your account secure and working. We also use functional Cache Storage and a service worker for the public application shell where your browser supports them.",
    providers: "Services we rely on",
    providersText: "Morrovia uses a database and authentication service to operate accounts and saved plans, Resend to deliver transactional email and—only if you enable a private forwarding address—to receive the individual booking confirmations you forward, and CARTO and OpenStreetMap-based services including Nominatim, Overpass and Photon for maps, place search and nearby results. External map and booking links take you to those services under their own policies.",
    analytics: "Optional analytics",
    analyticsText: "When configured and allowed, PostHog and Google Analytics help us understand product use through deliberately limited events. Optional affiliate attribution is controlled separately. Microsoft Clarity is currently disabled while its replay and masking configuration is verified. Declining optional technology does not affect core planning or account functionality. Review the current technology inventory or change either optional category in Cookie settings.",
    cookieSettings: "Open Cookie settings",
    ai: "AI-assisted planning",
    aiText: "Luna is Morrovia’s AI travel assistant and uses the server-side OpenAI Responses API. Initial trip capture may send up to 600 characters from the brief so Luna can help interpret it. Signed-in co-pilot requests send the question, up to 500 characters, with a reduced trip projection. The co-pilot projection excludes canonical IDs, coordinates, URLs, confirmation references, provider payloads, owner and authentication data, change history and the raw initial brief. Requests use store:false, but this configuration does not prove that provider retention is zero. Current production logs keep aggregate model, usage, count and state diagnostics rather than raw briefs, questions, answers or full projections. Morrovia stores bounded server-side preview records so an authenticated traveller can explicitly apply a proposed change; a broader retention period has not been set. OpenAI processing, retention and international-transfer terms require separate review. Luna can make mistakes, and proposed changes are not saved until you explicitly apply a deterministic preview.",
    speech: "Speech input",
    speechText: "Speak uses your browser’s SpeechRecognition or webkitSpeechRecognition service in the selected English or Spanish mode. Recognition is one-shot and uses final transcripts. Your browser or its speech provider may process audio; Morrovia receives transcript text rather than an uploaded audio blob. The transcript remains editable and is then handled like text you type: it may be kept in a draft, sent for trip capture and saved with the resulting trip. Morrovia cannot prove that speech audio stays on-device or state a browser-provider retention period.",
    sharing: "Sharing a trip",
    sharingText: "A trip gift is a private, time-limited claim link sent to the recipient email you enter. The recipient must sign in with that email to claim their own editable copy. Do not forward a claim link unless you intend to share it.",
    retention: "Keeping and removing data",
    retentionText: "You can delete individual trips from Trips and remove stamps, notes and photos from Stamps. Morrovia does not copy the raw body of a forwarded confirmation into its database; the received message remains subject to Resend's provider retention. Extracted booking candidates and categorical security records are account data. A specific deletion schedule for those new records still needs an operating decision and legal review. Account deletion is currently handled by support so we can safely verify the request and remove the associated Morrovia data.",
    contact: "Your choices and contact",
    contactText: "To request access to, correction of or deletion of your Morrovia account data, email us from the address on your account. We may need to verify ownership before acting on the request.",
    email: "Email Morrovia support",
    back: "Back to Morrovia",
    note: "This is a product privacy notice, not legal advice. We will update it as Morrovia’s data practices change.",
  },
  es: {
    eyebrow: "PRIVACIDAD DE MORROVIA",
    title: "Tus datos de viaje, explicados con claridad.",
    intro: "Este aviso explica qué guarda Morrovia, por qué lo usamos y qué opciones tienes. Describe el producto tal como existe hoy, no funciones que aún no existen.",
    updated: "Última actualización: 30 de agosto de 2026",
    summary: "En pocas palabras",
    summaryText: "Morrovia guarda los detalles que eliges para que tus planes, preferencias y sellos funcionen en todos tus dispositivos. Usamos tu ubicación solo cuando nos pides encontrar algo cercano. La analítica opcional permanece desactivada hasta que la permites.",
    collect: "Qué recopilamos",
    collectItems: [
      ["Datos de la cuenta", "Tu nombre, correo electrónico, identificador de cuenta y registros de autenticación. El sistema de autenticación gestiona las contraseñas y nunca se muestran dentro de Morrovia."],
      ["Información del viaje", "El título, las fechas, destinos, lugares seleccionados, elementos del plan, notas, pines y detalles prácticos de ruta que guardas."],
      ["Perfil y recuerdos", "Las elecciones de tu perfil de viaje, idioma, sellos de países, notas de países y cualquier foto que adjuntes a un sello. Si eliges personalizar los recordatorios antes de salir, puede incluir nacionalidad o nacionalidades, país de residencia y mes de caducidad del pasaporte, pero nunca un número, escaneo o imagen del pasaporte."],
      ["Comentarios y registros de correo", "Las valoraciones y comentarios que envías, además de un registro de la entrega de correos transaccionales como verificación, restablecimiento de contraseña y regalos de viajes."],
      ["Confirmaciones de reserva reenviadas", "Si creas una dirección privada y reenvías deliberadamente una confirmación, Resend recibe ese mensaje individual. Morrovia verifica la dirección privada y el remitente de tu cuenta, rechaza los adjuntos y guarda solo la propuesta de reserva extraída y un registro categórico del proceso. La base de datos de Morrovia no conserva el asunto, cuerpo ni HTML sin procesar."],
    ],
    location: "Ubicación y búsqueda cercana",
    locationText: "Si eliges “Usar mi ubicación” o inicias una búsqueda cercana, tu navegador pide permiso primero. Las coordenadas se envían a Morrovia para mostrar lugares cercanos y pueden compartirse con servicios de búsqueda basados en OpenStreetMap. Morrovia no añade estas coordenadas a tu perfil ni a tus viajes, a menos que guardes deliberadamente un lugar o un pin.",
    device: "Datos guardados en este dispositivo",
    deviceText: "Morrovia guarda parte de la información localmente en tu dispositivo para que el producto funcione de forma fiable: borradores y planes activos, idioma y preferencias de interfaz, perfil e información de preparación, elecciones del buscador y sellos o recuerdos. Estos datos permanecen en el dispositivo hasta que se guardan en una cuenta cuando corresponde o borras los datos del sitio en tu navegador.",
    cookies: "Cookies necesarias y tecnología del navegador",
    cookiesText: "Al iniciar sesión, Morrovia usa cookies necesarias de sesión y seguridad para que tu cuenta siga siendo segura y funcione. También usamos Cache Storage funcional y un service worker para la aplicación pública cuando tu navegador los admite.",
    providers: "Servicios que utilizamos",
    providersText: "Morrovia usa una base de datos y un servicio de autenticación para operar cuentas y planes guardados, Resend para enviar correos transaccionales y—solo si activas una dirección privada—recibir las confirmaciones de reserva individuales que reenvíes, y CARTO y servicios basados en OpenStreetMap, incluidos Nominatim, Overpass y Photon, para mapas, búsqueda de lugares y resultados cercanos. Los enlaces externos de mapas y reservas te llevan a esos servicios con sus propias políticas.",
    analytics: "Analítica opcional",
    analyticsText: "Cuando se configuran y permites su uso, PostHog y Google Analytics ayudan a comprender el uso del producto mediante eventos deliberadamente limitados. La atribución de afiliados opcional se controla por separado. Microsoft Clarity está desactivado mientras se verifica su configuración de repetición y enmascaramiento. Rechazar la tecnología opcional no afecta a la planificación ni a la cuenta. Consulta el inventario actual o cambia cada categoría opcional en Ajustes de cookies.",
    cookieSettings: "Abrir Ajustes de cookies",
    ai: "Planificación asistida por IA",
    aiText: "Luna es el asistente de viaje con IA de Morrovia y utiliza la API Responses de OpenAI desde el servidor. La captura inicial puede enviar hasta 600 caracteres del texto para ayudar a interpretarlo. Las consultas del copiloto con sesión iniciada envían la pregunta, de hasta 500 caracteres, junto con una proyección reducida del viaje. Esta proyección excluye identificadores canónicos, coordenadas, URL, referencias de confirmación, datos de proveedores, datos de propietario y autenticación, historial de cambios y el texto inicial sin procesar. Las solicitudes usan store:false, pero esta configuración no demuestra que la retención del proveedor sea cero. Los registros actuales de producción conservan diagnósticos agregados de modelo, uso, recuentos y estado, no textos, preguntas, respuestas ni proyecciones completas. Morrovia guarda registros acotados de previsualización en el servidor para que un viajero autenticado aplique explícitamente un cambio propuesto; no se ha fijado un periodo de retención más amplio. El tratamiento, la retención y las transferencias internacionales de OpenAI requieren una revisión aparte. Luna puede equivocarse y los cambios propuestos no se guardan hasta que aplicas explícitamente una previsualización determinista.",
    speech: "Entrada por voz",
    speechText: "Hablar usa el servicio SpeechRecognition o webkitSpeechRecognition del navegador en el modo de inglés o español seleccionado. El reconocimiento es de una sola toma y utiliza transcripciones finales. El navegador o su proveedor de voz pueden procesar el audio; Morrovia recibe el texto transcrito en lugar de un archivo de audio cargado. La transcripción sigue siendo editable y después se trata como el texto que escribes: puede guardarse en un borrador, enviarse para capturar el viaje y conservarse con el viaje resultante. Morrovia no puede demostrar que el audio permanezca en el dispositivo ni indicar un periodo de retención del proveedor del navegador.",
    sharing: "Compartir un viaje",
    sharingText: "Un regalo de viaje es un enlace privado y temporal enviado al correo del destinatario que introduces. El destinatario debe iniciar sesión con ese correo para reclamar su propia copia editable. No reenvíes un enlace de reclamación salvo que quieras compartirlo.",
    retention: "Conservación y eliminación de datos",
    retentionText: "Puedes eliminar viajes individuales desde Viajes y quitar sellos, notas y fotos desde Sellos. Morrovia no copia el cuerpo sin procesar de una confirmación reenviada en su base de datos; el mensaje recibido queda sujeto a la retención de Resend. Las propuestas extraídas y los registros categóricos de seguridad son datos de la cuenta. Aún hace falta una decisión operativa y revisión legal para fijar su plazo de eliminación. La eliminación de cuentas se gestiona mediante soporte para verificar la solicitud y retirar los datos asociados.",
    contact: "Tus opciones y contacto",
    contactText: "Para solicitar acceso, corrección o eliminación de los datos de tu cuenta de Morrovia, escríbenos desde el correo de tu cuenta. Es posible que necesitemos verificar la titularidad antes de atender la solicitud.",
    email: "Escribir a soporte de Morrovia",
    back: "Volver a Morrovia",
    note: "Este es un aviso de privacidad del producto, no asesoramiento legal. Lo actualizaremos cuando cambien las prácticas de datos de Morrovia.",
  },
} as const;

export default function PrivacyNotice() {
  const [language, setLanguage] = useState<EasyTLanguage>("en");

  useEffect(() => {
    const refresh = () => {
      setLanguage(window.localStorage.getItem("easyt-language") === "es" ? "es" : "en");
    };
    refresh();
    window.addEventListener("easyt-language-change", refresh);
    return () => {
      window.removeEventListener("easyt-language-change", refresh);
    };
  }, []);

  const t = copy[language];

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
          <div><p className={styles.kicker}>{t.analytics}</p><h2 id="analytics-title">{t.analytics}</h2><p>{t.analyticsText}</p></div>
          <div className={styles.choiceButtons}>
            <EasyTLinkButton href="/journey/cookies#cookie-settings">{t.cookieSettings}</EasyTLinkButton>
          </div>
        </section>

        <section id="ai-and-speech" className={styles.split} aria-label={language === "es" ? "IA y voz" : "AI and speech"}>
          <article className={styles.card}><Bot aria-hidden="true" /><h2>{t.ai}</h2><p>{t.aiText}</p></article>
          <article className={styles.card}><Mic aria-hidden="true" /><h2>{t.speech}</h2><p>{t.speechText}</p></article>
        </section>

        <section className={styles.split}>
          <article className={styles.card}><Mail aria-hidden="true" /><h2>{t.sharing}</h2><p>{t.sharingText}</p></article>
          <article className={styles.card}><Database aria-hidden="true" /><h2>{t.retention}</h2><p>{t.retentionText}</p></article>
        </section>

        <section className={`${styles.card} ${styles.contact}`}>
          <div><h2>{t.contact}</h2><p>{t.contactText}</p></div>
          <a href={`mailto:${morroviaLegalIdentity.privacyContact}`}>{t.email} <Mail aria-hidden="true" /></a>
        </section>
        <p className={styles.note}>{t.note}</p>
        <Link className={styles.back} href="/journey/home"><ChevronLeft aria-hidden="true" />{t.back}</Link>
      </section>
    </div>
  );
}
