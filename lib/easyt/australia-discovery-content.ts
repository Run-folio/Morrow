import type { DiscoveryEvidenceRow, DiscoveryPlace } from "./discovery-content.ts";
import { discoveryPlaceForId } from "./discovery-content.ts";

const reviewedAt = "2026-09-24";
const tourism = (id: string, url: string, supports: string) => ({
  id: `tourism-australia:${id}`, label: "Tourism Australia", kind: "official" as const,
  url, reviewedAt, supports,
});
const row = (
  id: string, group: string, en: string, es: string, url: string, supports: string,
  options: { stay?: string; stayUrl?: string; access?: string; tags?: string[] } = {},
): DiscoveryEvidenceRow => {
  const source = tourism(id, url, supports);
  return {
    id, group, tags: options.tags ?? [], imageKey: null,
    relevance: { en, es, sources: [source] },
    stayEvidence: options.stay ? [tourism(`${id}:stay`, options.stayUrl ?? url, options.stay)] : [],
    accessEvidence: options.access ? [tourism(`${id}:access`, url, options.access)] : [],
  };
};

/** Tourism Australia pages were reviewed individually; rows do not assert route fit. */
export const AUSTRALIA_DISCOVERY_EVIDENCE: readonly DiscoveryEvidenceRow[] = [
  row("sydney", "New South Wales", "Explore Sydney's harbour and city culture.", "Explora el puerto y la cultura urbana de Sídney.", "https://www.australia.com/en/places/sydney-and-surrounds/guide-to-sydney.html", "Sydney guide documents harbour icons, ferry visits and First Nations culture.", { stay: "Tourism Australia documents hotels in multiple Sydney neighbourhoods as overnight accommodation, without availability claims.", stayUrl: "https://www.australia.com/en/places/sydney-and-surrounds/where-to-stay.html" }),
  row("byron-bay", "New South Wales", "Explore Byron Bay's relaxed coast.", "Explora la costa tranquila de Byron Bay.", "https://www.australia.com/en/places/sydney-and-surrounds/guide-to-byron-bay.html", "Byron Bay visitor guide documents its coastal experiences."),
  row("melbourne", "Victoria", "Explore Melbourne's food, culture and sport.", "Explora la gastronomía, cultura y deporte de Melbourne.", "https://www.australia.com/en/places/melbourne-and-surrounds/guide-to-melbourne.html", "Melbourne visitor guide documents food, culture and sport experiences.", { stay: "Tourism Australia documents Melbourne hotels as overnight accommodation, without availability claims.", stayUrl: "https://www.australia.com/en/places/melbourne-and-surrounds/where-to-stay.html" }),
  row("hobart", "Tasmania", "Explore Hobart's art and food scene.", "Explora el arte y la gastronomía de Hobart.", "https://www.australia.com/en-us/places/hobart-and-surrounds/guide-to-hobart.html", "Hobart's visitor guide highlights MONA, food and the city's history."),
  row("adelaide", "South Australia", "Explore Adelaide's art and dining.", "Explora el arte y la gastronomía de Adelaida.", "https://www.australia.com/en/places/south-australia.html", "South Australia guide identifies Adelaide's art and dining scene."),
  row("brisbane", "Queensland", "Explore Brisbane's galleries and city culture.", "Explora las galerías y la cultura urbana de Brisbane.", "https://www.australia.com/en/places/brisbane-and-surrounds/guide-to-brisbane.html", "Brisbane visitor guide presents its galleries and urban experiences."),
  row("cairns", "Queensland", "Explore Cairns for reef and rainforest experiences.", "Explora Cairns por el arrecife y la selva tropical.", "https://www.australia.com/en/places/cairns-and-surrounds/guide-to-cairns.html", "Cairns guide presents Great Barrier Reef and tropical rainforest experiences."),
  row("airlie-beach", "Queensland", "Explore Airlie Beach and the Whitsundays coast.", "Explora Airlie Beach y la costa de las Whitsundays.", "https://www.australia.com/en/places/whitsundays-and-surrounds/guide-to-airlie-beach.html", "Airlie Beach visitor guide presents its Whitsundays coastal setting.", { stay: "Tourism Australia explicitly calls Airlie Beach a base for exploring the Whitsunday Islands and Great Barrier Reef.", access: "Guide identifies Airlie Beach as Whitsundays gateway with Shute Harbour boat transfer access." }),
  row("gold-coast", "Queensland", "Explore the Gold Coast's beaches and hinterland.", "Explora las playas y el interior de Gold Coast.", "https://www.australia.com/en/places/gold-coast-and-surrounds/guide-to-the-gold-coast.html", "Gold Coast guide highlights beaches and hinterland experiences."),
  row("noosa", "Queensland", "Explore Noosa's beaches, lakes and national park.", "Explora las playas, lagos y parque nacional de Noosa.", "https://www.australia.com/en/places/brisbane-and-surrounds/guide-to-noosa.html", "Noosa guide identifies beaches, lakes and Noosa National Park."),
  row("port-douglas", "Queensland", "Explore Port Douglas for reef and rainforest visits.", "Explora Port Douglas para visitar el arrecife y la selva tropical.", "https://www.australia.com/en/places/cairns-and-surrounds/what-to-do-at-great-barrier-reef.html", "Tourism Australia identifies Port Douglas as a town for reef and rainforest exploration.", { stay: "Port Douglas is described as an ideal base for reef and rainforest exploration.", access: "Port Douglas is about an hour's drive north of Cairns in this reef guide." }),
  row("townsville", "Queensland", "Explore Townsville and the central reef coast.", "Explora Townsville y la costa del arrecife central.", "https://www.australia.com/en/places/cairns-and-surrounds/what-to-do-at-great-barrier-reef.html", "Townsville is described as a gateway to the central Great Barrier Reef.", { access: "Townsville guide identifies access to reef tours and Magnetic Island ferry." }),
  row("darwin", "Northern Territory", "Explore Darwin and the tropical Top End.", "Explora Darwin y el Top End tropical.", "https://www.australia.com/en/places/darwin-and-surrounds/guide-to-darwin.html", "Darwin guide presents tropical Top End city experiences."),
  row("alice-springs", "Northern Territory", "Explore Alice Springs and the Red Centre.", "Explora Alice Springs y el Red Centre.", "https://www.australia.com/en/places/alice-springs-and-surrounds/guide-to-alice-springs.html", "Alice Springs guide presents its Red Centre visitor context.", { stay: "Tourism Australia lists overnight accommodation in Alice Springs, without availability claims.", stayUrl: "https://www.australia.com/en/places/alice-springs-and-surrounds/where-to-stay.html", access: "The Alice Springs guide identifies its Central Australia access role." }),
  row("uluru-kata-tjuta", "Northern Territory", "Visit Uluru and Kata Tjuta for Anangu culture and desert walks.", "Visita Uluru y Kata Tjuta por la cultura anangu y los paseos en el desierto.", "https://www.australia.com/en/places/alice-springs-and-surrounds/guide-to-uluru-and-kata-tjuta.html", "Guide describes designated viewpoints, walks at Kata Tjuta and the Anangu Cultural Centre.", { access: "The guide identifies Ayers Rock and Alice Springs airports as arrival gateways; it does not establish a park lodging base." }),
  row("kakadu", "Northern Territory", "Visit Kakadu for wetlands, rock art and Aboriginal culture.", "Visita Kakadu por sus humedales, arte rupestre y cultura aborigen.", "https://www.australia.com/en/places/kakadu.html", "Kakadu guide documents wetlands, rock art and Bininj/Mungguy cultural experiences.", { access: "Kakadu guide documents Darwin as an access gateway and car or tour travel; it does not establish a particular stay." }),
  row("perth", "Western Australia", "Explore Perth's city life and nearby coast.", "Explora la vida urbana y la costa cercana de Perth.", "https://www.australia.com/en/places/perth-and-surrounds/guide-to-perth.html", "Perth guide highlights urban and coastal visitor experiences."),
  row("fremantle", "Western Australia", "Explore Fremantle's port history, art and cafés.", "Explora la historia portuaria, el arte y los cafés de Fremantle.", "https://www.australia.com/en-gb/places/perth-and-surrounds/guide-to-fremantle.html", "Fremantle guide documents historic streets, street art and cafés."),
  row("broome", "Western Australia", "Explore Broome's pearling history and tropical coast.", "Explora la historia perlífera y la costa tropical de Broome.", "https://www.australia.com/en/places/broome-and-surrounds/guide-to-broome.html", "Broome guide describes pearling history, coastal experiences and Cable Beach.", { stay: "Broome guide explicitly refers to hotels in town and their airport transfer services." }),
  row("esperance", "Western Australia", "Explore Esperance's coast and nearby Lucky Bay.", "Explora la costa de Esperance y la cercana Lucky Bay.", "https://www.australia.com/en/places/perth-and-surrounds/guide-to-esperance.html", "Esperance guide describes its coast and Lucky Bay in Cape Le Grand National Park."),
  row("launceston", "Tasmania", "Explore Launceston's heritage, food and northern Tasmania nature.", "Explora el patrimonio, la gastronomía y la naturaleza del norte de Tasmania en Launceston.", "https://www.australia.com/en/places/hobart-and-surrounds/guide-to-launceston.html", "Launceston guide describes historic towns, regional dining and nearby nature."),
  row("freycinet", "Tasmania", "Visit Freycinet for Wineglass Bay and coastal walks.", "Visita Freycinet por Wineglass Bay y sus caminatas costeras.", "https://www.australia.com/en-us/places/hobart-and-surrounds/guide-to-freycinet.html", "Freycinet guide describes Wineglass Bay and coastal walking in the national park.", { access: "The guide says travel within the park is by driving and hiking or tours from Hobart; no park-wide lodging base is inferred." }),
  row("cradle-mountain", "Tasmania", "Visit Cradle Mountain for alpine walks and glacial lakes.", "Visita Cradle Mountain por sus senderos alpinos y lagos glaciares.", "https://www.australia.com/en-us/places/hobart-and-surrounds/guide-to-cradle-mountain-lake-st-clair-national-park.html", "Park guide identifies hiking, glacial lakes and wildlife at Cradle Mountain-Lake St Clair.", { access: "Guide identifies separate northern and southern entrances with no direct connecting link; park is not treated as one base." }),
  row("kangaroo-island", "South Australia", "Visit Kangaroo Island for wildlife and dramatic coast.", "Visita Kangaroo Island por su fauna y costa espectacular.", "https://www.australia.com/en/places/adelaide-and-surrounds/guide-to-kangaroo-island.html", "Kangaroo Island guide documents sea lions, kangaroos, coastal formations and local produce.", { access: "The guide describes a flight or Cape Jervis ferry and says exploring the island requires a car or tour; no island-wide base is inferred." }),
];

export function australiaDiscoveryPlaces(): DiscoveryPlace[] {
  return AUSTRALIA_DISCOVERY_EVIDENCE.flatMap(row => {
    const place = discoveryPlaceForId(row.id);
    return place ? [place] : [];
  });
}
