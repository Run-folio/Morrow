export type CaseStudyCallout = {
  /** Horizontal position as a percentage of the image width (0–100). */
  x: number;
  /** Vertical position as a percentage of the image height (0–100). */
  y: number;
  /** Short annotation shown beside the numbered pin. */
  label: string;
};

export type CaseStudyMedia = {
  type?: "image" | "video" | "embed";
  src: string;
  alt?: string;
  caption: string;
  /** When true, this item breaks out to full width instead of sitting in the grid. */
  wide?: boolean;
  portrait?: boolean;
  /** Optional numbered annotation pins layered over the image. */
  callouts?: CaseStudyCallout[];
  /** When true, muted video begins playback once it enters the viewport. */
  autoplayOnView?: boolean;
};

export type CaseStudy = {
  slug: string;
  shortTitle?: string;
  eyebrow: string;
  title: string;
  summary: string;
  image: string;
  imageAlt: string;
  role: string;
  industry: string;
  year: string;
  /** Team context, e.g. "Sole product designer" or "Design team of 4". */
  team?: string;
  /** How long the project ran, e.g. "6 months". */
  duration?: string;
  intro: {
    challenge: string[];
    approach?: string[];
    outcome: string[];
  };
  metrics: Array<{
    value: string;
    label: string;
  }>;
  overviewMedia?: CaseStudyMedia[];
  /** Optional art-directed assets for the case-study hero test treatment. */
  heroTestMedia?: {
    desktop: CaseStudyMedia;
    mobile: CaseStudyMedia;
  };
  challengeMedia?: CaseStudyMedia[];
  /** Real before/after pairs for the challenge section, rendered as a draggable comparison slider. */
  challengeComparisons?: Array<{ before: CaseStudyMedia; after: CaseStudyMedia; label?: string }>;
  /** Optional full-width artifact shown immediately after the three decision sections. */
  postDecisionsShowcase?: {
    eyebrow: string;
    media: CaseStudyMedia;
  };
  challenges: string[];
  sections: Array<{
    eyebrow?: string;
    title: string;
    body?: string;
    bullets?: string[];
    resultChip?: string;
    media?: CaseStudyMedia[];
    comparison?: { before: CaseStudyMedia; after: CaseStudyMedia; label?: string };
  }>;
  impact: {
    quantitative: string[];
    qualitative: string[];
  };
  nextSteps?: Array<{
    title: string;
    text: string;
  }>;
};

const cloudinaryImage = (publicId: string) => `https://res.cloudinary.com/dbt3wkwa3/image/upload/f_auto,q_auto/${publicId}`;

export const caseStudies: CaseStudy[] = [
  {
    slug: "rio",
    shortTitle: "Rio",
    eyebrow: "Convergent IS / Energy / AI Workflows",
    title: "87% fewer manual touch-points in field ticketing with Rio",
    summary:
      "Rio turns hydrocarbon field tickets into approved SAP service entry sheets through AI extraction, exception handling and orchestrated approvals.",
    image: "/rio/rio-field-ticket.png",
    imageAlt: "A complex paper field ticket processed by Rio",
    role: "Staff Product Designer, end-to-end UX",
    industry: "Energy / AI Workflows",
    year: "Convergent IS",
    team: "North American energy operator",
    intro: {
      challenge: [
        "Contractor labour, equipment and materials sheets arrived as paper tickets, duplicated, error-prone and re-keyed by hand into SAP through multiple touch-points.",
      ],
      approach: [
        "Led the design of an AI-powered workflow for automated ticket extraction, purchase-order validation, exception-first review and orchestrated approvals.",
      ],
      outcome: [
        "Rio cut manual touch-points by 87%, replacing manual re-keying with one connected system across field and back-office operations.",
      ],
    },
    metrics: [
      { value: "87%", label: "Fewer manual touch-points" },
      { value: "Zero", label: "Re-keying into SAP" },
      { value: "One", label: "Connected operational workflow" },
      { value: "SAP", label: "Automated service-entry posting" },
    ],
    overviewMedia: [
      {
        type: "video",
        src: "/rio/ses-flow-video.mp4",
        caption: "SES flow prototype showing how Rio moves field tickets through extraction, review, approval and SAP posting.",
        wide: true,
        autoplayOnView: true,
      },
    ],
    heroTestMedia: {
      desktop: {
        src: "/rio/rio-hero-desktop.png",
        alt: "Rio service-entry workspace shown in the case-study hero",
        caption: "Rio hero artwork for desktop layouts.",
      },
      mobile: {
        src: "/rio/rio-hero-mobile.png",
        alt: "Rio service-entry workspace shown in the case-study hero",
        caption: "Rio hero artwork for mobile layouts.",
      },
    },
    challenges: [
      "Paper tickets duplicated across teams",
      "Manual data entry into SAP",
      "Rates and quantities drifting between systems",
      "Approvals managed through inboxes",
      "No shared view of status or ownership",
      "Errors discovered late in the process",
    ],
    sections: [
      {
        eyebrow: "Decision 01 / 03",
        title: "Let extraction do the typing",
        body: "Field tickets carry dozens of labour, equipment and materials lines. Rio extracts them into structured draft sheets automatically, shifting the reviewer's job from data entry to verification while keeping every value traceable to its source.",
        resultChip: "Result → manual touch-points down 87%",
        media: [
          {
            src: "/Rio.png",
            alt: "Rio field-ticket extraction interface",
            caption: "Rio extracts field-ticket data into a structured draft ready for verification.",
          },
        ],
      },
      {
        eyebrow: "Decision 02 / 03",
        title: "Review only what needs reviewing",
        body: "Every extracted line is validated against the purchase order. Clean sheets flow through untouched; only mismatches ask for human attention, with a reason captured for every accepted exception or rejected line.",
        resultChip: "Result → errors caught before they reach SAP",
        media: [
          {
            src: "/Exceptions.png",
            alt: "Rio exception-review interface",
            caption: "Exception handling focuses attention on mismatches that need human judgment.",
            wide: true,
          },
        ],
      },
      {
        eyebrow: "Decision 03 / 03",
        title: "Approvals as a workflow, not an inbox",
        body: "Construction managers, coordinators and back-office roles see the sheets waiting on them as sequenced tasks with clear statuses. When the final approval lands, Rio posts the service entry sheet into SAP automatically.",
        resultChip: "Result → zero re-keying into SAP",
        media: [
          {
            src: "/Approve.png",
            alt: "Rio approval workflow interface",
            caption: "Role-based approvals are sequenced and tracked through to SAP posting.",
            wide: true,
          },
        ],
      },
      {
        eyebrow: "The tradeoff",
        title: "Automate the work, not the judgment",
        body: "Full automation was technically possible, but these sheets move real money against contracts. Rio keeps people exactly where judgment matters: exceptions, rate disputes and final approval. Everything routine is automated; everything consequential is reviewed.",
      },
      {
        eyebrow: "Process",
        title: "Mapping Rio's flow before designing the screens",
        body: "Stakeholder and field-team interviews, legacy ticket and SAP audit, end-to-end workflow mapping across roles and statuses, SAP Fiori alignment, high-fidelity flows and prototypes, and iteration with operations and back-office users.",
        media: [
          {
            src: "/Approvals.jpg",
            alt: "Rio approvals workflow and task states",
            caption: "A single approval workflow, from exception review through to SAP posting.",
            wide: true,
          },
          {
            src: "/rio/rio-approval-stages.jpg",
            alt: "Rio approval stages and task flow",
            caption: "Approval stages and role-based task flow.",
            wide: true,
          },
        ],
      },
    ],
    impact: {
      quantitative: [
        "Manual touch-points|-87%",
        "SAP entry|Re-keying → automated posting",
        "Ticket intake|Paper → extracted drafts",
        "Systems in the flow|Many → one connected workflow",
      ],
      qualitative: [
        "Errors and duplicates|Caught before posting",
        "Operational visibility|A shared queue replaced the paper pile",
        "Human review|Focused on consequential exceptions",
        "Status model|Shared across field and back-office teams",
      ],
    },
  },
  {
    slug: "returns-kiosk",
    shortTitle: "Amazon Returns Kiosk",
    eyebrow: "Amazon / Logistics / Retail",
    title: "$60 million in cost savings through Amazon Return Kiosks",
    summary: "A major improvement to the customer journey led to a 10x order worth $22.5 million.",
    image: "/amazon-returns-kiosk.jpg",
    imageAlt: "Amazon Returns Kiosk interface and physical kiosk",
    role: "Founding / Sr Staff Product Designer, end-to-end UX",
    industry: "Logistics / Retail",
    year: "Doddle / Blue Yonder",
    intro: {
      challenge: [
        "Queues were building in high-volume stores and staff were turning kiosks off. Customers could not find the scanner, started the flow before finding their QR code and often dropped out before completing a return.",
      ],
      approach: [
        "I led end-to-end UX from field research to handoff, combining the home and scan states, adding clearer parcel constraints and designing a multiple-return path for customers processing several orders.",
      ],
      outcome: [
        "The redesigned journey cut completion time from 90 seconds to 56 seconds, reduced drop-out from 20.59% to 6.58% and helped secure a 10x unit order worth $22.5 million.",
      ],
    },
    metrics: [
      { value: "$60M", label: "Operational cost savings" },
      { value: "40M+", label: "Returns in three years" },
      { value: "56 sec", label: "Journey time, down from 90 sec" },
      { value: "$22.5M", label: "10x follow-on kiosk order" },
    ],
    overviewMedia: [
      {
        src: "/Multi-Kiosk.png",
        alt: "Amazon Returns Kiosk multiple-return redesign screens",
        caption: "The redesigned kiosk flow brought scanning, constraints and multiple returns into a clearer customer journey.",
        wide: true,
      },
      {
        src: cloudinaryImage("amazoncase3_wmo0i6.png"),
        alt: "Amazon returns kiosk design exploration",
        caption: "Design exploration across core journey states and edge cases.",
      },
    ],
    challengeComparisons: [
      {
        before: {
          src: cloudinaryImage("amazoncase7_nqcd5t"),
          alt: "Original Amazon returns kiosk home screen before redesign",
          caption: "The original kiosk start state separated scanning from the first action.",
        },
        after: {
          src: cloudinaryImage("amazoncase5_iojjuv"),
          alt: "Redesigned Amazon returns kiosk scan screen",
          caption: "Scanning moved into the home state to remove a step and reduce hesitation.",
        },
        label: "Drag to compare the original kiosk flow against the redesign",
      },
    ],
    challenges: [
      "Long time to complete",
      "High drop-out rate",
      "Low customer satisfaction in high-volume stores",
      "Issues with kiosk uptime",
      "Scanning issues",
      "Large items jammed in the kiosk",
      "Customers returning many orders",
    ],
    sections: [
      {
        eyebrow: "Decision 01 / 03",
        title: "Scan from the very first screen",
        body: "Onsite research showed customers spent up to 45 seconds looking for their QR code mid-flow, or for the scanner itself. Combining the home and scan screens removed a full step and made the scanner location explicit. Warning messaging kept oversized, sharp and fragile items out of the kiosk before they could jam it, while a scan-success animation confirmed progress the moment customers needed reassurance.",
        resultChip: "Result → 25 fewer steps in 450 journeys",
        media: [
          {
            src: cloudinaryImage("amazoncase8_juwrkx.png"),
            alt: "Amazon returns kiosk scan return QR code screen",
            caption: "Before: scanning and guidance were split across the journey.",
          },
        ],
      },
      {
        eyebrow: "Decision 02 / 03",
        title: "Multiple returns, without slowing the queue",
        body: "Some customers processed up to 20 orders in a single visit, restarting the journey each time while the queue grew. A dedicated multiple-return path let them chain QR codes in one session. A dark theme signalled they were still in-flow, and animations were sped up throughout to keep the line moving.",
        resultChip: "Result → fewer repeat journeys, faster queues",
        media: [
          {
            type: "embed",
            src: "https://embed.figma.com/proto/UsS0AkbvzdqwtZ54w4v1sw/AMAZON-Kiosk-V2?node-id=6168-1473&embed-host=share&scaling=scale-down&content-scaling=fixed",
            caption: "Interactive Figma prototype showing the multiple-return flow in motion.",
            portrait: true,
          },
        ],
      },
      {
        eyebrow: "Decision 03 / 03",
        title: "Designed in the store, not the studio",
        body: "Drop-out data pointed at the screens, but the failures were physical: hidden scanners, jammed hatch doors, parcels that did not fit and staff workarounds. I validated against real kiosk hardware, observed handover with engineering and used store context to protect uptime as much as screen completion.",
        resultChip: "Result → increased kiosk uptime",
        comparison: {
          before: {
            src: cloudinaryImage("amazoncase7_nqcd5t"),
            alt: "Original Amazon returns kiosk home screen before redesign",
            caption: "Before: the original kiosk start state separated scanning from the first action.",
          },
          after: {
            src: cloudinaryImage("amazoncase5_iojjuv"),
            alt: "Redesigned Amazon returns kiosk scan screen",
            caption: "After: scanning moved into the home state to remove a step and reduce hesitation.",
          },
          label: "Before and after: scanning moved into the start state so customers could begin with confidence.",
        },
        media: [
          {
            src: cloudinaryImage("amazoncase4_w6zzqt.jpg"),
            alt: "Amazon returns kiosk prototype testing setup",
            caption: "Prototype testing and handoff work with product and engineering.",
          },
        ],
      },
      {
        eyebrow: "The tradeoff",
        title: "Balancing revenue pressure with the happy path",
        body: "One stakeholder group wanted a screensaver to drive revenue; another wanted to protect the core journey. The compromise was a QR code on the final screen linking to a discount voucher in the customer’s Amazon account wallet, increasing sales without touching happy-path completion.",
      },
      {
        eyebrow: "Process",
        title: "Research, design, prototyping and testing",
        body: "Opportunity solution tree, data analysis, stakeholder interviews and staff surveys, user interviews and onsite field research, affinity mapping and value / effort matrix, flows, UI design, usability testing, development handoff and QA.",
        media: [
          {
            src: cloudinaryImage("amazoncase2_tgcmw0.png"),
            alt: "Research synthesis and opportunity mapping for Amazon returns kiosk",
            caption: "Research synthesis: data, interviews and onsite observation.",
          },
          {
            src: cloudinaryImage("amazoncase3_wmo0i6.png"),
            alt: "Amazon returns kiosk design exploration",
            caption: "Journey states and edge-case exploration.",
          },
          {
            src: cloudinaryImage("amazoncase4_w6zzqt.jpg"),
            alt: "Amazon returns kiosk prototype testing setup",
            caption: "Onsite prototype testing in context.",
          },
        ],
      },
    ],
    impact: {
      quantitative: [
        "Journey time|90s → 56s",
        "Drop-out rate|20.59% → 6.58%",
        "Returns processed|40M in 3 years",
        "Follow-on unit order|10x, $22.5M",
      ],
      qualitative: [
        "Kiosk uptime|Increased",
        "Store intervention|Reduced",
        "Queue flow|Improved",
        "Scanner confidence|Improved",
      ],
    },
  },
  {
    slug: "returns-platform",
    shortTitle: "Returns Platform",
    eyebrow: "B2B SaaS / Reverse Logistics",
    title: "$12 million saved through optimized reverse logistics",
    summary:
      "Designed an enterprise-level B2B SaaS returns platform used across five continents, covering customer initiation, merchant configuration, returns orchestration and store processing.",
    image: "/returns-platform.png",
    imageAlt: "Returns platform dashboard interface",
    role: "Product strategy, UX architecture, design systems",
    industry: "B2B SaaS / Reverse Logistics",
    year: "Doddle / Blue Yonder",
    intro: {
      challenge: [
        "Returns are broken: paper labels are unsustainable, staff time leaks away and routing decisions waste money. The platform had to serve merchants, consumers and carriers across one complex reverse-logistics model.",
      ],
      approach: [
        "I owned product strategy and UX architecture across the suite: consumer initiation, merchant rules and branding, orchestration and the store staff app, validated through usability testing and UAT on real flows.",
      ],
      outcome: [
        "A unified platform helped merchants run returns across five continents, with 32% more efficient processing, 88.2% user satisfaction and $12 million saved through smarter routing and store handling.",
      ],
    },
    metrics: [
      { value: "$12M", label: "Saved through optimized logistics" },
      { value: "+32%", label: "Processing efficiency" },
      { value: "88.2%", label: "User satisfaction" },
      { value: "53 sec", label: "To process two items" },
    ],
    overviewMedia: [
      {
        src: "/RP1.png",
        alt: "Returns platform overview interface",
        caption: "Returns platform overview showing the redesigned product experience.",
      },
      {
        src: cloudinaryImage("portal6_fv7tts.png"),
        alt: "Returns platform orchestration screen",
        caption: "Returns orchestration views connecting policies, routing and inventory.",
      },
    ],
    challenges: ["Sustainability", "Multi-user workflows", "Optimal reverse logistics", "Cost savings"],
    postDecisionsShowcase: {
      eyebrow: "The grading experience at a glance",
      media: {
        src: "/Grading.png",
        alt: "Returns platform item-grading experience",
        caption: "Grading decisions captured at the point of return, before warehouse routing.",
        wide: true,
      },
    },
    sections: [
      {
        eyebrow: "Decision 01 / 03",
        title: "Returns start in the merchant's brand",
        body: "Customers initiate a paperless return inside the retailer's own look and feel, then get a reason, pick the best drop-off point nearby and continue with a choice shaped by the merchant's rules. The product had to feel simple for shoppers while still respecting the policies, branding and routing logic behind the scenes.",
        resultChip: "Result → paper labels removed from the flow",
        media: [
          {
            src: "/Returns.png",
            alt: "Merchant-branded returns experience",
            caption: "Consumer initiation, label-less and merchant branded.",
          },
        ],
      },
      {
        eyebrow: "Decision 02 / 03",
        title: "Rules merchants can read",
        body: "Reverse logistics is really a policy problem. Instead of vendor tickets and config files, merchants write plain-language if/then rules for carrier selection, return windows, warehouse routing, non-resellable items and re-order them by priority. The same grammar covers branding, policies and routing, so one mental model runs the whole platform.",
        resultChip: "Result → merchants configure routing without tickets",
        media: [
          {
            src: "/rules.png",
            alt: "Returns platform rules interface",
            caption: "Merchant configuration: rules, branding and return windows.",
          },
        ],
      },
      {
        eyebrow: "Decision 03 / 03",
        title: "Grade at the counter, not the warehouse",
        body: "Store staff answer two plain questions about each item's condition. That early grade decides the item's route: resale, repair or warehouse, before it is ever shipped. The flow was measured on task success, time on task and satisfaction, and became sharper as staff learned it.",
        resultChip: "Result → two items processed in 53 seconds",
        media: [
          {
            src: "/Carrier.png",
            alt: "Carrier routing and store processing interface",
            caption: "Grading decisions captured before warehouse routing.",
          },
        ],
      },
      {
        eyebrow: "The foundation",
        title: "Built as a platform, not a feature",
        body: "The same orchestration layer now extends beyond stores: warehouse processing with optimized grading, IoT integrations with kiosks hardware, and machine-learning recommendations built on live returns data and market trends.",
      },
      {
        eyebrow: "Process",
        title: "Understanding the system before designing the interface",
        body: "Stakeholder interviews and workshops, competitor research, hypothesis development, client requirements, sketches, wireframes and user flows, lo-fi and hi-fi design, prototypes, usability testing and UAT.",
        media: [
          {
            src: cloudinaryImage("portal5_v2acug.png"),
            alt: "Returns platform merchant configuration screen",
            caption: "Rules, assumptions and open questions.",
          },
          {
            src: cloudinaryImage("portal6_fv7tts.png"),
            alt: "Returns platform orchestration screen",
            caption: "Service rooms and decisions.",
          },
          {
            src: cloudinaryImage("store4_en3nyf.png"),
            alt: "Store processing dispatch interface",
            caption: "Service rooms and decisions.",
          },
        ],
      },
    ],
    impact: {
      quantitative: [
        "Logistics cost savings|$12M",
        "Processing efficiency|+32%",
        "User satisfaction|88.2%",
        "Two-item processing|53 sec",
      ],
      qualitative: [
        "Merchant control|Clearer",
        "Paper-free focus|Increased",
        "Store-processing confidence|Improved",
        "Platform scope|Expanded",
      ],
    },
    nextSteps: [
      { title: "Warehouse processing", text: "Optimized grading and logistics." },
      { title: "IoT expansion", text: "Kiosk integrations with the store app." },
      { title: "Machine learning", text: "Advanced predictive capabilities." },
    ],
  },
  {
    slug: "farfetch",
    shortTitle: "Farfetch Mobile",
    eyebrow: "Ecommerce / AI Retail",
    title: "Boosted Farfetch IPO with apps tallying 20 million+ downloads",
    summary: "Native ecommerce apps and a future retail concept exhibited at the London Design Museum.",
    image: "/farfetch-mobile.png",
    imageAlt: "Farfetch mobile commerce interface",
    role: "Native app UX, interaction design, design systems",
    industry: "Luxury Ecommerce / AI Retail",
    year: "Farfetch",
    intro: {
      challenge: [
        "Create a seamless luxury shopping experience across iOS and Android while maintaining Farfetch’s brand identity and high-end aesthetic.",
        "The product needed to support a complex catalog across multiple boutiques, high user expectations, cross-platform consistency and a fast checkout process.",
      ],
      outcome: [
        "A shopping experience that blended luxury fashion with digital product quality and future-facing retail technology.",
        "The work supported mobile growth, strong app-store performance and a Store of the Future concept exhibited at the London Design Museum.",
      ],
    },
    metrics: [
      { value: "4.8★", label: "App Store rating." },
      { value: "20M+", label: "App downloads." },
      { value: "+127%", label: "Mobile revenue growth." },
      { value: "68%", label: "Mobile traffic share." },
    ],
    overviewMedia: [
      {
        src: "/farfetch-mobile.png",
        alt: "Farfetch Store of the Future concept",
        caption: "Store of the Future concept connecting digital and physical retail.",
      },
      {
        src: cloudinaryImage("ff4_mhude1.png"),
        alt: "Farfetch fitting room mirror interface",
        caption: "Interactive fitting-room mirror states for personalized retail.",
      },
    ],
    challengeMedia: [
      {
        src: cloudinaryImage("ff-android2_dhic2u.jpg"),
        alt: "Farfetch Android app screens",
        caption: "Android app refinements maintaining brand quality across platforms.",
      },
      {
        src: cloudinaryImage("ff5_ucwlrn.jpg"),
        alt: "Farfetch product detail and shopping screens",
        caption: "Luxury product detail and shopping interactions.",
      },
    ],
    postDecisionsShowcase: {
      eyebrow: "The mobile experience at a glance",
      media: {
        src: "/ff.png",
        alt: "Farfetch mobile app screens showing the redesigned shopping experience",
        caption: "A broader view of the Farfetch mobile shopping experience across discovery, product detail and checkout moments.",
        wide: true,
      },
    },
    challenges: [
      "Complex product catalog with multiple boutiques",
      "High-end user expectations",
      "Cross-platform consistency",
      "Fast checkout process",
    ],
    sections: [
      {
        eyebrow: "Research",
        title: "Understanding luxury mobile shopping",
        body: "The process began with research into how luxury customers discover, evaluate and buy products across mobile and store contexts.",
        bullets: ["User interviews with luxury shoppers", "Competitor analysis", "Store visits", "Brand and product discovery", "Wireframing"],
      },
      {
        eyebrow: "Design",
        title: "Native app UX and design systems",
        body: "The design process focused on interaction quality, visual design, cross-platform consistency and handoff into production.",
        bullets: ["Visual design", "Usability testing", "Interaction design", "Development handover", "Design system"],
        media: [
          {
            src: cloudinaryImage("ff6_qk193d.png"),
            alt: "Farfetch mobile design system screens",
            caption: "Design system and handoff work supporting app quality at scale.",
          },
        ],
      },
      {
        eyebrow: "Retail innovation",
        title: "Store of the Future",
        body: "A future retail experience combined digital and physical shopping through an interactive fitting-room mirror and mobile app integration.",
        bullets: ["Interactive fitting-room mirror", "RFID product recognition", "Mobile app integration", "Personalized recommendations"],
      },
      {
        eyebrow: "Key designs",
        title: "Personalized shopping and virtual try-on",
        body: "The work explored AI-powered recommendations, personalized content and advanced fitting-room interactions that let customers virtually try, order and check out.",
      },
    ],
    impact: {
      quantitative: [
        "4.8★ App Store rating maintained",
        "+127% increase in mobile revenue",
        "20M+ app downloads achieved",
        "68% of traffic from mobile platforms",
      ],
      qualitative: [
        "Enhanced luxury shopping experience on mobile",
        "Pioneered innovative retail technology",
        "Strengthened brand position in luxury market",
        "Recognition through Design Museum exhibition",
      ],
    },
    nextSteps: [
      { title: "Launched in real store", text: "Shoreditch, London." },
      { title: "3D visualization", text: "Enhanced product viewing." },
      { title: "Voice shopping", text: "Voice-activated features." },
    ],
  },
];

export function getCaseStudy(slug: string) {
  return caseStudies.find((study) => study.slug === slug);
}
