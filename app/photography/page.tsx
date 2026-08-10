import Link from "next/link";
import { Footer, Navigation } from "@/components/ui";
import { travelPhotos } from "@/lib/photography";
import { PhotographyGrid } from "./photography-grid";

export const metadata = {
  title: "Photography | Shaun Whiting",
  description:
    "Travel photography from Shaun Whiting: places that made him slow down, look closer and pay attention.",
  alternates: {
    canonical: "/photography",
  },
};

export default function PhotographyPage() {
  return (
    <>
      <Navigation />
      <main id="main" className="pt-[92px]">
        <section className="container-pad py-16 sm:py-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end lg:gap-20">
            <div>
              <p className="mb-6 font-mono text-xs uppercase tracking-[0.16em] text-signal">Photography</p>
              <h1 className="max-w-5xl text-balance text-6xl font-[320] leading-[0.98] tracking-[-0.045em] text-ink dark:text-white sm:text-7xl lg:text-[7.6rem]">
                What I see<span className="text-signal">.</span>
              </h1>
            </div>
            <p className="max-w-2xl text-2xl font-[330] leading-[1.35] tracking-[-0.02em] text-ink dark:text-white sm:text-3xl">
              Places that made me slow down, look closer and pay attention.
            </p>
          </div>
        </section>

        <section className="container-pad border-t border-black/10 py-14 dark:border-white/10 sm:py-20">
          <PhotographyGrid photos={travelPhotos} />
        </section>

        <section className="container-pad pb-14 sm:pb-20">
          <Link
            href="/more-about-me"
            className="inline-flex rounded-full border border-ink px-6 py-3 text-base font-[520] tracking-[-0.01em] text-ink transition duration-200 hover:bg-ink hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-4 focus-visible:ring-offset-paper dark:border-white dark:text-white dark:hover:bg-white dark:hover:text-ink dark:focus-visible:ring-offset-[#0d0d0c]"
          >
            Back to Beyond Design
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
