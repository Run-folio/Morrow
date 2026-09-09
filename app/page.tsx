import type { Metadata, Viewport } from "next";
import MorroviaHomepage from "@/components/easyt/morrovia-homepage";
import "./journey/journey-design.css";

export const metadata: Metadata = {
  title: { absolute: "Travel your way · Morrovia" },
  description:
    "Shape thoughtful trips, find useful places nearby, and keep the memories that matter.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Morrovia · Travel your way",
    description:
      "A flexible trip planner for routes with room to breathe, useful local finds, and memories worth keeping.",
    url: "/",
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

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <div className="morroviaProductShell">
    <div className="morroviaProductContent"><MorroviaHomepage /></div>
  </div>;
}
