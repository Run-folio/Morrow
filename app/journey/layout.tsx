import type { Metadata, Viewport } from "next";
import MorroviaFooter from "@/components/morrovia-footer";
import "./journey-design.css";

export const metadata: Metadata = {
  title: {
    default: "Morrovia · Travel your way",
    template: "%s · Morrovia",
  },
  description:
    "Shape thoughtful trips, find useful places nearby, and keep the memories that matter.",
  alternates: { canonical: "/journey/home" },
  openGraph: {
    title: "Morrovia · Travel your way",
    description:
      "A flexible trip planner for routes with room to breathe, useful local finds, and memories worth keeping.",
    url: "/journey/home",
    siteName: "Morrovia",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f7fb",
};

export default function JourneyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="morroviaProductShell">
    <div className="morroviaProductContent">{children}</div>
    <MorroviaFooter />
  </div>;
}
