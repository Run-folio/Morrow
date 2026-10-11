import { NextRequest, NextResponse } from "next/server";
import {trustedLocalActivityCentre,trustedPinnedActivityCentre} from "@/lib/easyt/place-reference.server";
import type {PlanningEvidenceState,PlanningFailureReason} from '@/lib/easyt/planning-evidence-state';
import {providerFailureAssessment} from '@/lib/easyt/planning-provider-assessment';
import { isWithinDestinationRadius } from "@/lib/easyt/destination-resolution";
import { conciseExploreDescription, exploreDiscoveryCategory, trustedExploreImage } from "@/lib/easyt/explore";
import { discoveryVisitorRelevance } from "@/lib/easyt/discovery-quality";

type WikiPage = {
  pageid?: number;
  title?: string;
  extract?: string;
  thumbnail?: { source?: string };
  coordinates?: Array<{ lat?: number; lon?: number }>;
};

const WIKIPEDIA_DISCOVERY_TIMEOUT_MS = 6_000;

const irrelevant = /^(tourism|tourist attraction|visitor cent(?:er|re)|tourist gateway|tourist information|list of|travel|tour operator|tourism in|geography of|history of|economy of|line \d+|metro line|bus line|culture of|architecture of)/i;
const nonVisitPage = /\b(administrative division|administrative region|country|continent|province|state of|county|municipality|rapid transit line|metro line|railway station|train station|bus station|airport|transport hub|population density|electoral district|disambiguation|politics of|demographics of|transport in)\b/i;
const strongPlaceSignal = /\b(?:museums?|palaces?|cathedrals?|churches|monaster(?:y|ies)|temples?|castles?|fortresses|squares?|plazas?|piazzas?|markets?|parks?|gardens?|galler(?:y|ies)|theat(?:re|er)s?|monuments?|towers?|bridges?|beaches|mountains?|lakes?|historic|landmarks?|neighbou?rhoods?|quarters?|zoos?|aquariums?|viewpoints?|observator(?:y|ies)|archaeological|ruins?|heritage)\b/i;

function visitorValue(page: WikiPage) {
  const text = `${page.title ?? ""} ${page.extract ?? ""}`;
  let score = page.thumbnail?.source ? 5 : 0;
  if (strongPlaceSignal.test(text)) score += 6;
  if (/one of the (?:best known|most visited|most famous|oldest|largest)|major tourist|popular attraction|world heritage/i.test(text)) score += 5;
  if (nonVisitPage.test(text)) score -= 20;
  return score;
}

function classify(title: string, extract: string) {
  const type = exploreDiscoveryCategory(title, "", extract);
  return { type, tags: [type === "Nature" || type === "Beach" || type === "Hike" || type === "Viewpoint" ? "Nature" : type === "Food" || type === "Restaurant" || type === "Market" ? "Food" : "Cities"] };
}

function suggestedVisitLength(title: string, extract: string) {
  const text = `${title} ${extract}`.toLowerCase();
  if (/mountain|beach|lake|forest|trail|national park|archaeological|zoo|aquarium/.test(text)) return 1;
  return 0.5;
}

export async function GET(request: NextRequest) {
  const started=performance.now();
  let providerAttempted=false;
  const blocked=(reason:PlanningFailureReason,status=200)=>{
    const assessment:PlanningEvidenceState={retrieval:'blocked',evidence:'unqualified',reason,retryable:false,
      checkedAt:new Date().toISOString(),sourceCount:0,diagnostics:{attemptedSources:[],elapsedMs:performance.now()-started,cacheOutcome:'not-used',stage:'identity'}};
    return NextResponse.json({places:[],assessment},{status,headers:{'cache-control':'no-store'}});
  };
  const destination = request.nextUrl.searchParams.get("destination")?.trim();
  const country = request.nextUrl.searchParams.get("country")?.trim();
  const canonicalPlaceId=request.nextUrl.searchParams.get('canonicalPlaceId')?.trim();
  const providerId=request.nextUrl.searchParams.get('providerId')?.trim();
  const rawLat=request.nextUrl.searchParams.get('lat'),rawLon=request.nextUrl.searchParams.get('lon');
  const callerLatitude = rawLat?.trim()?Number(rawLat):NaN;
  const callerLongitude = rawLon?.trim()?Number(rawLon):NaN;
  if (!destination || destination.length > 120 || (country?.length??0)>80 || (canonicalPlaceId?.length??0)>160 || (providerId?.length??0)>512) return blocked('invalid_input',400);

  try {
    // A pinned identity selects its own trusted source point. Saved/caller
    // coordinates are neither rewritten nor treated as approximate proof.
    const centre=canonicalPlaceId||providerId
      ? canonicalPlaceId?trustedPinnedActivityCentre({destination,requestedCountryCode:country??'',canonicalPlaceId,providerId}):null
      : Number.isFinite(callerLatitude)&&Number.isFinite(callerLongitude)
        ? trustedLocalActivityCentre({destination,requestedCountryCode:country??'',coordinates:[callerLongitude,callerLatitude]}) : null;
    if (!centre) return blocked('identity_required');
    const [longitude,latitude]=centre.coordinates;
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "geosearch",
      ggsnamespace: "0",
      ggscoord: `${latitude}|${longitude}`,
      // Wikimedia caps geosearch at 10 km. That keeps the shortlist genuinely
      // local to the selected stop rather than quietly turning into a
      // whole-country recommendation engine.
      ggsradius: "10000",
      ggslimit: "80",
      prop: "extracts|pageimages|coordinates",
      exintro: "1",
      explaintext: "1",
      piprop: "thumbnail",
      pithumbsize: "720",
      colimit: "max",
      origin: "*",
    });
    providerAttempted=true;
    const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
      headers: { "User-Agent": "Morrovia journey planner/1.0 (https://morrovia.com)" },
      next: { revalidate: 60 * 60 * 24 * 7 },
      signal: AbortSignal.timeout(WIKIPEDIA_DISCOVERY_TIMEOUT_MS),
    });
    if (!response.ok) {
      const assessment=providerFailureAssessment(response.status===401||response.status===403?'authentication':'unavailable','organic-discovery',performance.now()-started);
      return NextResponse.json({places:[],unavailable:true,assessment},{headers:{'cache-control':'no-store'}});
    }
    const data = await response.json() as { query?: { pages?: Record<string, WikiPage> } };
    if(!data||typeof data!=='object'||Array.isArray(data)||'error' in data
      ||(data.query?.pages!==undefined&&(!data.query.pages||typeof data.query.pages!=='object'||Array.isArray(data.query.pages))))throw new SyntaxError('Invalid discovery response');
    const pages=Object.values(data.query?.pages??{});
    if(pages.some(page=>!page||typeof page!=='object'))throw new SyntaxError('Invalid discovery pages');
    const seen = new Set<string>();
    const admitted = pages
      .filter((page) => {
        const coordinate = page.coordinates?.[0];
        const key = page.title?.toLowerCase() ?? "";
        const text = `${page.title} ${page.extract}`;
        return Boolean(
          page.title
          && page.extract
          && coordinate
          && isWithinDestinationRadius([longitude, latitude], [coordinate.lon ?? Number.NaN, coordinate.lat ?? Number.NaN])
          && !irrelevant.test(page.title)
          && page.title.trim().toLocaleLowerCase() !== destination.toLocaleLowerCase()
          && !nonVisitPage.test(text)
          && strongPlaceSignal.test(text)
          && !seen.has(key)
          && seen.add(key),
        );
      })
      .filter((page) => {
        const category = classify(page.title!, page.extract!);
        return discoveryVisitorRelevance({
          title: page.title!,
          category: category.type,
          tags: category.tags,
          description: page.extract!,
          qualityScore: visitorValue(page),
          kind: "activity",
        }).eligible;
      });
    const places = admitted.sort((a, b) => visitorValue(b) - visitorValue(a))
      .slice(0, 10)
      .map((page, index) => {
        const coordinate = page.coordinates![0];
        const category = classify(page.title!, page.extract!);
        return {
          id: `${destination.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${page.pageid ?? index}`,
          title: page.title!,
          area: destination,
          type: category.type,
          tags: category.tags,
          qualityScore: visitorValue(page),
          cost: suggestedVisitLength(page.title!, page.extract!),
          description: conciseExploreDescription(page.extract!),
          image: trustedExploreImage(page.thumbnail?.source, "reviewed"),
          sourceUrl: `https://en.wikipedia.org/?curid=${page.pageid}`,
          country: country || destination,
          coordinates: [coordinate.lon, coordinate.lat] as [number, number],
        };
      });
    const assessment:PlanningEvidenceState={retrieval:'completed',evidence:places.length?'conditional':'insufficient',retryable:false,
      ...(!places.length?{reason:pages.length?'filtered_empty' as const:'successful_empty' as const}:{}),
      checkedAt:new Date().toISOString(),sourceCount:places.length,diagnostics:{attemptedSources:['organic-discovery'],elapsedMs:performance.now()-started,cacheOutcome:'unknown',stage:'evidence'}};
    return NextResponse.json({ places,assessment,counts:{raw:pages.length,admitted:admitted.length,returned:places.length} },{headers:{'cache-control':'no-store'}});
  } catch (error) {
    console.error("Journey discovery failed.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    const category=!providerAttempted?'configuration':error instanceof Error&&(error.name==='TimeoutError'||error.name==='AbortError')?'timeout':error instanceof SyntaxError?'malformed':'unavailable';
    return NextResponse.json({ places: [], unavailable: true,assessment:providerFailureAssessment(category,'organic-discovery',performance.now()-started) },{headers:{'cache-control':'no-store'}});
  }
}
