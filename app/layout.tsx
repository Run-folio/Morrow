import type { Metadata } from "next";
import { Analytics } from "@/components/analytics";
import { EasyTPwaRegister } from "@/components/easyt-pwa-register";
import PrivacyConsent from "@/components/privacy-consent";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://morrovia.com"),
  title: "Morrovia | Travel planning that fits you",
  description:
    "Shape thoughtful trips, find useful places nearby, and keep the memories that matter.",
  openGraph: {
    title: "Morrovia | Travel planning that fits you",
    description: "A flexible trip planner for routes with room to breathe, useful local finds, and memories worth keeping.",
    url: "https://morrovia.com",
    siteName: "Morrovia",
    locale: "en_US",
    type: "website",
  },
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
  icons: {
    icon: "/brand/morrow-route-mark-512.png",
    shortcut: "/brand/morrow-route-mark-512.png",
    apple: "/brand/morrow-route-mark-512.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          id="omio-impact-tracking"
          type="text/javascript"
          dangerouslySetInnerHTML={{
            __html: `(function(i,m,p,a,c,t){
  c.ire_o=p;
  c[p]=c[p]||function(){
    (c[p].a=c[p].a||[]).push(arguments)
  };
  t=a.createElement(m);
  var z=a.getElementsByTagName(m)[0];
  t.async=1;
  t.src=i;
  z.parentNode.insertBefore(t,z)
})(
  'https://utt.impactcdn.com/P-A7643967-7b19-4f3a-b9eb-e714bcf1e1f81.js',
  'script',
  'impactStat',
  document,
  window
);

impactStat('transformLinks');
impactStat('trackImpression');`,
          }}
        />
      </head>
      <body className="bg-paper font-sans text-ink antialiased dark:bg-[#0d0d0c] dark:text-[#f4f3ef]">
        {children}
        {process.env.NODE_ENV === "development" ? <script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async /> : null}
        <Analytics />
        <PrivacyConsent />
        <EasyTPwaRegister />
      </body>
    </html>
  );
}
