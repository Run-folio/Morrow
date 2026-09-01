export type HelpTopicIcon =
  | "getting-started"
  | "building"
  | "routes"
  | "itinerary"
  | "map"
  | "health"
  | "before-you-go"
  | "account"
  | "booking"
  | "passport"
  | "privacy";

export type HelpQuestion = {
  id: string;
  title: string;
  answer: string[];
  popularAnswer?: string[];
};

export type HelpTopic = {
  id: string;
  icon: HelpTopicIcon;
  title: string;
  description: string;
  questions: HelpQuestion[];
  links?: Array<{ href: string; label: string }>;
};

export const helpTopics: HelpTopic[] = [
  {
    id: "getting-started",
    icon: "getting-started",
    title: "Getting started",
    description: "Turn your trip idea into your first plan.",
    questions: [
      {
        id: "what-morrovia-does",
        title: "What can Morrovia help me plan?",
        answer: ["Morrovia is made for trips with several stops, routes and practical decisions. It builds a connected starting plan that you can review and change."],
      },
      {
        id: "start-first-trip",
        title: "How do I start my first trip?",
        answer: ["Choose New trip and describe the journey in your own words. Add the places you are considering, dates or trip length, traveller count and anything that must not move."],
      },
      {
        id: "natural-language",
        title: "Do I need every detail before I start?",
        answer: ["No. Start with what you know and add pace, interests or fixed plans as the trip takes shape."],
      },
    ],
    links: [{ href: "/journey/new", label: "Start a new trip" }],
  },
  {
    id: "building-a-trip",
    icon: "building",
    title: "Building a trip",
    description: "Add destinations, dates and preferences, then refine the plan.",
    questions: [
      {
        id: "change-destinations",
        title: "How do I add or remove a destination?",
        answer: ["Edit the destinations in your trip brief. For a saved trip, review the proposed route changes before applying them so affected days and transfers stay clear."],
        popularAnswer: ["Edit the destinations in your trip brief. For a saved trip, review the proposed route changes before applying them so connected days and transfers stay clear."],
      },
      {
        id: "change-details",
        title: "Can I change dates or traveller details?",
        answer: ["Yes. Update the trip brief, then review any changes to nights, transfers and itinerary days before saving."],
      },
      {
        id: "preferences",
        title: "Where do interests and preferences go?",
        answer: ["Add pace, transport preferences, accessibility needs and fixed commitments to the trip description or matching fields. Say clearly when something is essential."],
      },
    ],
  },
  {
    id: "routes-and-nights",
    icon: "routes",
    title: "Routes & nights",
    description: "Understand route order, night suggestions and travel-time estimates.",
    questions: [
      {
        id: "different-route-order",
        title: "Why did Morrovia suggest a different route order?",
        answer: ["Morrovia may spot an order that cuts backtracking or makes a difficult transfer easier. It explains the trade-off, and you can keep your preferred order."],
        popularAnswer: ["Morrovia may spot a route that cuts backtracking or makes a difficult transfer easier. It will show the reasoning, and you can keep your preferred order."],
      },
      {
        id: "night-suggestions",
        title: "How does Morrovia decide how many nights to suggest?",
        answer: ["It balances total trip length, travel time, arrival-day impact and the pace you chose. Use the suggestion as a starting point and adjust it to suit you."],
        popularAnswer: ["It balances total trip length, travel time, arrival-day impact and the pace you chose. Treat the result as a starting point and adjust it to suit you."],
      },
      {
        id: "estimated-journey",
        title: "Why is a journey marked as estimated?",
        answer: ["Morrovia has useful planning information, but not a verified live service or exact door-to-door time. Check current schedules and connections before booking."],
        popularAnswer: ["Morrovia has enough information for planning, but not a verified live service or exact door-to-door time. Check current schedules before booking."],
      },
    ],
  },
  {
    id: "using-itinerary",
    icon: "itinerary",
    title: "Using the Itinerary",
    description: "Shape each day, add plans and keep useful details together.",
    questions: [
      {
        id: "navigate-days",
        title: "How do I move between days?",
        answer: ["Open Itinerary and choose a day from the day list. The timeline, logistics and day context update together."],
      },
      {
        id: "edit-day",
        title: "Can I add or edit an activity or note?",
        answer: ["Yes. Add activities or notes to a day, then edit or remove the items you created. Saved changes stay with the trip."],
      },
      {
        id: "protected-content",
        title: "Why can’t I edit some items?",
        answer: ["An item may be protected because it is tied to a booking or another part of the trip. Morrovia will point you to the right place to change it safely."],
      },
    ],
  },
  {
    id: "using-map",
    icon: "map",
    title: "Using the Map",
    description: "Explore your route, discover places and add them to the trip.",
    questions: [
      {
        id: "map-stops",
        title: "How do I explore a stop?",
        answer: ["Open Map and choose a route stop. You can look around without changing the saved trip."],
      },
      {
        id: "find-places",
        title: "What can I find on the map?",
        answer: ["Where available, Morrovia can show places, food and accommodation near a stop. Provider details can be incomplete or change."],
      },
      {
        id: "add-mapped-place",
        title: "How do I add a place to my trip?",
        answer: ["Open a result, choose the relevant day when asked and select Add. Simply viewing a place does not change the trip."],
      },
    ],
  },
  {
    id: "trip-health",
    icon: "health",
    title: "Trip Health",
    description: "See what looks good and what still needs attention.",
    questions: [
      {
        id: "health-checks",
        title: "What does Trip Health check?",
        answer: ["It looks for issues such as difficult pacing, tight transfers, route conflicts and missing details, then puts the most important checks first."],
      },
      {
        id: "needs-review",
        title: "What does “Needs review” mean?",
        answer: ["Something is worth checking before you rely on it or book around it. Open the item to see what needs attention and why."],
        popularAnswer: ["Something needs a closer look before you rely on it, such as a tight transfer or missing detail. Open the item to see why it was flagged."],
      },
      {
        id: "health-limitations",
        title: "What can Trip Health not confirm?",
        answer: ["It cannot guarantee live timetables, prices, availability, entry permission or a completed third-party booking. Check time-sensitive details with the provider or authority."],
      },
    ],
  },
  {
    id: "before-you-go",
    icon: "before-you-go",
    title: "Before you go",
    description: "Keep practical trip preparation visible in Overview.",
    questions: [
      {
        id: "where-before-you-go",
        title: "Where are my before-you-go tasks?",
        answer: ["Open your trip’s Overview. Practical tasks sit alongside Trip Health, planning progress and your route."],
      },
      {
        id: "practical-tasks",
        title: "What can I prepare there?",
        answer: ["Keep track of stays, transport, passport and entry checks, insurance, connectivity and other useful trip tasks."],
      },
      {
        id: "official-guidance",
        title: "Does Morrovia confirm I am ready to travel?",
        answer: ["No. Morrovia helps organise preparation, but official advice, entry rules, insurance cover and booking terms still need to be checked."],
      },
    ],
  },
  {
    id: "saving-and-account",
    icon: "account",
    title: "Saving & account",
    description: "Save trips, reopen them and protect changes across devices.",
    questions: [
      {
        id: "how-saving-works",
        title: "How does saving work?",
        answer: ["Morrovia keeps your current work on the device. When you are signed in, supported changes also save to your account so you can reopen the trip from Trips."],
      },
      {
        id: "reopen-trip",
        title: "How do I reopen a saved trip?",
        answer: ["Sign in with the same account and open Trips. A draft stored only on one device will not appear automatically on another device."],
      },
      {
        id: "sync-conflict",
        title: "What if the trip changed somewhere else?",
        answer: ["If Morrovia spots a newer saved version, it protects your changes rather than overwriting them. Follow the message on screen to choose what to review."],
      },
    ],
    links: [{ href: "/journey/dashboard", label: "Open Trips" }],
  },
  {
    id: "booking-links",
    icon: "booking",
    title: "Booking links",
    description: "Understand what happens when Morrovia opens a booking provider.",
    questions: [
      {
        id: "third-party-booking",
        title: "Where is a booking completed?",
        answer: ["Accommodation, transport or activity bookings are completed with the provider under its prices, availability, terms and cancellation policy."],
      },
      {
        id: "click-not-booked",
        title: "Does opening a booking link mean it is booked?",
        answer: ["No. The link only opens the provider. A booking exists only after that provider confirms availability and payment."],
        popularAnswer: ["No. The link only opens the provider. A booking exists only after that provider confirms availability and payment."],
      },
      {
        id: "affiliate-links",
        title: "Does Morrovia use affiliate links?",
        answer: ["Some links may earn Morrovia a commission if you complete an eligible purchase, normally at no extra cost to you."],
      },
    ],
    links: [{ href: "/journey/affiliate-disclosure", label: "Read the Affiliate disclosure" }],
  },
  {
    id: "passport-and-travel-info",
    icon: "passport",
    title: "Passport & travel info",
    description: "Use travel guidance as a starting point and verify important details.",
    questions: [
      {
        id: "passport-information",
        title: "What does Passport information show?",
        answer: ["Morrovia can show planning guidance for a passport and destination combination. Treat it as a starting point and check important entry requirements with official sources."],
      },
      {
        id: "stored-passport-data",
        title: "Does Morrovia store my passport number or scan?",
        answer: ["No. Morrovia does not need your passport number or a scan to provide planning reminders."],
      },
    ],
    links: [
      { href: "/journey/passport", label: "Open Passport information" },
      { href: "/journey/privacy", label: "Read the Privacy notice" },
    ],
  },
  {
    id: "privacy-and-analytics",
    icon: "privacy",
    title: "Privacy & analytics",
    description: "Understand saved data and optional analytics controls.",
    questions: [
      {
        id: "analytics-choice",
        title: "Can I use Morrovia without optional analytics?",
        answer: ["Yes. Optional analytics stay off until you allow them, and declining does not affect core planning features."],
      },
      {
        id: "analytics-data",
        title: "What is sent to analytics?",
        answer: ["When allowed, Morrovia sends broad product-use information. Trip prompts, notes, passport details, email addresses and booking references are not sent as analytics properties."],
      },
      {
        id: "privacy-choices",
        title: "Where can I change my privacy choice?",
        answer: ["Open Privacy & cookies to review saved-data information and update your analytics choice."],
      },
    ],
    links: [{ href: "/journey/privacy#analytics-settings", label: "Open Privacy & cookies settings" }],
  },
];

export const popularQuestionIds = [
  "different-route-order",
  "night-suggestions",
  "needs-review",
  "estimated-journey",
  "change-destinations",
  "click-not-booked",
] as const;

function searchText(value: string) {
  return value.toLocaleLowerCase("en").replace(/[’‘]/g, "'").trim();
}

export function filterHelpTopics(topics: HelpTopic[], query: string): HelpTopic[] {
  const terms = searchText(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return topics;

  const matches = (value: string) => {
    const haystack = searchText(value);
    return terms.every((term) => haystack.includes(term));
  };

  return topics.flatMap((topic) => {
    const topicMatch = matches([
      topic.title,
      topic.description,
      ...(topic.links?.map((link) => link.label) ?? []),
    ].join(" "));
    const matchingQuestions = topic.questions.filter((question) => matches([
      question.title,
      ...question.answer,
      ...(question.popularAnswer ?? []),
    ].join(" ")));

    if (!topicMatch && !matchingQuestions.length) return [];
    return [{ ...topic, questions: topicMatch ? topic.questions : matchingQuestions }];
  });
}

export function allHelpQuestions(topics: HelpTopic[]) {
  return topics.flatMap((topic) => topic.questions);
}
