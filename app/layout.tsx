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
      <body className="bg-paper font-sans text-ink antialiased dark:bg-[#0d0d0c] dark:text-[#f4f3ef]">
        {children}
        <script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async />
        <Analytics />
        <PrivacyConsent />
        <EasyTPwaRegister />
      </body>
    </html>
  );
}
