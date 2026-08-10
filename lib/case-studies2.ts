export type CaseStudyMedia = {
  type?: "image" | "video";
  src: string;
  alt?: string;
  caption: string;
  wide?: boolean;
  portrait?: boolean;
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
  intro: {
    challenge: string[];
    outcome: string[];
  };
  metrics: Array<{
    value: string;
    label: string;
  }>;
  overviewMedia?: CaseStudyMedia[];
  challengeMedia?: CaseStudyMedia[];
  challenges: string[];
  sections: Array<{
    eyebrow?: string;
    title: string;
    body?: string;
    bullets?: string[];
    media?: CaseStudyMedia[];
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
        "Queues were building up in stores, staff were turning kiosks off or asking for more. The data pointed to major issues in high volume stores: high drop-out rates, offline kiosks, scanning friction and low CSAT.",
        "Onsite research showed customers struggled to find the scanner, started the flow before finding their QR code, tried to return parcels that did not fit, and sometimes processed up to 20 orders in one visit.",
      ],
      outcome: [
        "A redesigned consumer journey achieved significant improvements across journey time, drop-out, CSAT and kiosk uptime.",
        "The work helped secure a 10x unit order worth $22.5 million and supported more than 40 million returns over three years.",
      ],
    },
    metrics: [
      { value: "+69%", label: "Dropout rate improved from 20.59% to 6.58%." },
      { value: "+28%", label: "Journey time improved from 89.94 to 64.47 seconds." },
      { value: "+6%", label: "CSAT improved from 80.2 to 85.1." },
      { value: "1500+", label: "New kiosks ordered in a 10x expansion worth $22.5M." },
    ],
    overviewMedia: [
      {
        src: cloudinaryImage("amazoncase2_tgcmw0.png"),
        alt: "Research synthesis and opportunity mapping for Amazon returns kiosk",
        caption: "Research synthesis from data, stakeholder interviews and onsite observation.",
      },
      {
        src: cloudinaryImage("amazoncase3_wmo0i6.png"),
        alt: "Amazon returns kiosk design exploration",
        caption: "Design exploration across core journey states and edge cases.",
      },
    ],
    challengeMedia: [
      {
        src: cloudinaryImage("amazoncase5_iojjuv"),
        alt: "Original Amazon returns kiosk home screen before redesign",
        caption: "Before: the original kiosk start state separated scanning from the first action.",
      },
      {
        src: cloudinaryImage("amazoncase7_nqcd5t"),
        alt: "Redesigned Amazon returns kiosk scan screen",
        caption: "After: scanning moved into the home state to remove a step and reduce hesitation.",
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
        eyebrow: "Solution",
        title: "Improving scanning, journey time, drop-outs and uptime",
        body: "The home and scan screens were combined, removing a step and ensuring customers were ready with their QR code before entering the flow.",
        bullets: [
          "Removed a step by enabling scanning from the home screen",
          "Added warning messaging for unsuitable items",
          "Added tooltips to reduce hesitation",
          "Added a scan-success animation",
        ],
      },
      {
        eyebrow: "Solution",
        title: "Supporting multiple returns without slowing everyone down",
        body: "Multiple returns were added for users with more than one QR code, reducing repeat journeys and improving queue flow in high-volume stores.",
        bullets: [
          "Added multiple returns to the decision screen",
          "Designed a dedicated multiple-return journey",
          "Used a dark theme to signal the user was still in-flow",
          "Sped up animations throughout",
        ],
        media: [
      {
        src: cloudinaryImage("amazoncase8_juwrkx.png"),
        alt: "Original multiple returns kiosk flow",
        caption: "Before: returning multiple parcels meant repeating the journey.",
      },
      {
        src: cloudinaryImage("amazoncase9_jhaw9b.png"),
        alt: "Redesigned multiple returns kiosk flow",
        caption: "After: a dedicated multiple-return journey kept high-volume users moving.",
      },
        ],
      },
      {
        eyebrow: "Tradeoffs",
        title: "Balancing revenue pressure with the happy path",
        body: "One stakeholder group wanted to add a screensaver to drive revenue, while another wanted to protect the core journey. The compromise was a QR code on the final screen that linked to a discount voucher in the customer’s Amazon account wallet. It increased sales without affecting happy-path completion.",
      },
      {
        eyebrow: "Process",
        title: "Research, design, prototyping and testing",
        bullets: [
          "Opportunity solution tree",
          "Data analysis",
          "Stakeholder interviews and staff survey",
          "User interviews and onsite field research",
          "Affinity mapping and value / effort matrix",
          "Sketched wireframes, flows, UI design and interaction design",
          "High-fidelity prototypes, usability testing, development handover and QA",
        ],
        media: [
          {
            type: "video",
            src: "https://res.cloudinary.com/dbt3wkwa3/video/upload/v1745499868/kiosk-inwall_ylxpkc.mp4",
            caption: "In-wall kiosk prototype showing the physical return flow in context.",
            portrait: true,
          },
          {
            src: cloudinaryImage("amazoncase4_w6zzqt.jpg"),
            alt: "Amazon returns kiosk prototype testing setup",
            caption: "Prototype testing and handoff work with product and engineering.",
          },
        ],
      },
    ],
    impact: {
      quantitative: [
        "40 million returns taken in three years",
        "Journey time improved to under a minute",
        "High CSAT in high-volume stores",
        "10x order worth $22.5 million",
      ],
      qualitative: [
        "Significantly improved customer experience",
        "Reduced store staff intervention",
        "Improved queues",
        "Increased kiosk uptime",
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
        "Returns are broken: paper returns are unsustainable, staff time can be saved and logistics can be optimized to reduce waste. The platform needed to support merchants, consumers and carriers across a complex reverse-logistics model.",
        "We needed to assess single and multi-item return flows, store tote closure and dispatch flows, task success, time on task, user satisfaction and qualitative feedback from return processing.",
      ],
      outcome: [
        "A unified platform helped merchants customize reverse logistics, manage policies, track returns, process items and connect existing systems in one place.",
        "Testing showed high satisfaction, high completion rates and faster multiple-return processing as users became familiar with the flow.",
      ],
    },
    metrics: [
      { value: "32%", label: "Efficiency increase." },
      { value: "$12M", label: "Cost savings." },
      { value: "88.2%", label: "User satisfaction." },
      { value: "53 sec", label: "Time to process two items." },
    ],
    overviewMedia: [
      {
        src: cloudinaryImage("portal5_v2acug.png"),
        alt: "Returns platform merchant configuration screen",
        caption: "Merchant configuration for rules, branding and return windows.",
      },
      {
        src: cloudinaryImage("portal6_fv7tts.png"),
        alt: "Returns platform orchestration screen",
        caption: "Returns orchestration views connecting policies, routing and inventory.",
      },
    ],
    challenges: ["Sustainability", "Multi-user workflows", "Optimal reverse logistics", "Cost savings"],
    sections: [
      {
        eyebrow: "Discovery",
        title: "Understanding the system before designing the interface",
        body: "The work started with comprehensive research into existing systems and operational requirements.",
        bullets: ["Stakeholder interviews and workshops", "Competitor research", "Hypothesis development", "Client requirements"],
      },
      {
        eyebrow: "Design",
        title: "A platform for rules, branding, routing and processing",
        body: "The design work covered merchant setup, consumer initiation, rules configuration, returns tracking, store processing and carrier handoff.",
        bullets: ["Sketches", "Wireframes", "Lo-fi visuals", "User flows", "Prototype", "Hi-fi designs", "Usability testing and UAT"],
      },
      {
        eyebrow: "Store processing",
        title: "Helping staff process and grade returns",
        body: "Store staff can process and grade returns in a way that optimizes reverse logistics and supports downstream routing decisions.",
        bullets: ["Return acceptance", "Item grading", "Optimized logistics", "Tote management", "Carrier shipping"],
        media: [
          {
            src: cloudinaryImage("store2_oi4zh0.png"),
            alt: "Store processing return acceptance interface",
            caption: "Store processing flow for accepting and identifying returned items.",
          },
          {
            src: cloudinaryImage("store3_g7fkzg.png"),
            alt: "Store processing grading interface",
            caption: "Grading interface to help staff make consistent routing decisions.",
          },
          {
            src: cloudinaryImage("store4_en3nyf.png"),
            alt: "Store processing dispatch interface",
            caption: "Dispatch and tote-management states for carrier handoff.",
          },
        ],
      },
      {
        eyebrow: "Features",
        title: "Real-time inventory and customizable orchestration",
        body: "The platform supports live monitoring of reverse logistics, inventory levels and shipments, alongside rules and recommendations based on historical data and market trends.",
        bullets: ["Real-time returns inventory", "Customizable returns orchestration", "Policy windows", "Branding and rules", "Logistics optimization"],
      },
    ],
    impact: {
      quantitative: [
        "$12M saved through optimized reverse logistics",
        "32% efficiency increase",
        "88.2% user satisfaction",
        "53 seconds to complete processing two items",
      ],
      qualitative: [
        "More sustainable returns flows",
        "Clearer control for merchants",
        "Better store-processing experience",
        "A foundation for warehouse processing, IoT expansion and machine-learning recommendations",
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
        src: cloudinaryImage("v1744679353/ff3_qw3ra4.png"),
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
