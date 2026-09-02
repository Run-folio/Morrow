import {
  evaluateViatorDestinationResolution,
  normalizeViatorDestinationTaxonomy,
  type ActivityDestinationIdentity,
} from "../lib/easyt/viator-destination-resolver.server.ts";

// Developer-only bounded sample. These are acceptance inputs, never a runtime
// destination-ID mapping and never shipped to the client.
const sample: ActivityDestinationIdentity[] = [
  ["paris", "Paris", "France", 48.8566, 2.3522, "city"],
  ["tokyo", "Tokyo", "Japan", 35.6762, 139.6503, "city"],
  ["kyoto", "Kyoto", "Japan", 35.0116, 135.7681, "city"],
  ["bangkok", "Bangkok", "Thailand", 13.7563, 100.5018, "city"],
  ["rome", "Rome", "Italy", 41.9028, 12.4964, "city"],
  ["barcelona", "Barcelona", "Spain", 41.3874, 2.1686, "city"],
  ["new-york", "New York", "United States", 40.7128, -74.006, "city", ["New York City"]],
  ["mexico-city", "Mexico City", "Mexico", 19.4326, -99.1332, "city"],
  ["singapore", "Singapore", "Singapore", 1.3521, 103.8198, "city"],
  ["sydney", "Sydney", "Australia", -33.8688, 151.2093, "city"],
  ["london", "London", "United Kingdom", 51.5072, -0.1276, "city"],
  ["lisbon", "Lisbon", "Portugal", 38.7223, -9.1393, "city"],
  ["madrid", "Madrid", "Spain", 40.4168, -3.7038, "city"],
  ["seville", "Seville", "Spain", 37.3891, -5.9845, "city"],
  ["florence", "Florence", "Italy", 43.7696, 11.2558, "city"],
  ["venice", "Venice", "Italy", 45.4408, 12.3155, "city"],
  ["athens", "Athens", "Greece", 37.9838, 23.7275, "city"],
  ["istanbul", "Istanbul", "Türkiye", 41.0082, 28.9784, "city"],
  ["dubai", "Dubai", "United Arab Emirates", 25.2048, 55.2708, "city"],
  ["marrakech", "Marrakech", "Morocco", 31.6295, -7.9811, "city"],
  ["cairo", "Cairo", "Egypt", 30.0444, 31.2357, "city"],
  ["cape-town", "Cape Town", "South Africa", -33.9249, 18.4241, "city"],
  ["nairobi", "Nairobi", "Kenya", -1.2921, 36.8219, "city"],
  ["delhi", "Delhi", "India", 28.6139, 77.209, "city", ["New Delhi"]],
  ["mumbai", "Mumbai", "India", 19.076, 72.8777, "city", ["Bombay"]],
  ["hanoi", "Hanoi", "Vietnam", 21.0278, 105.8342, "city"],
  ["ho-chi-minh-city", "Ho Chi Minh City", "Vietnam", 10.8231, 106.6297, "city", ["Saigon"]],
  ["hong-kong", "Hong Kong", "Hong Kong", 22.3193, 114.1694, "city"],
  ["seoul", "Seoul", "South Korea", 37.5665, 126.978, "city"],
  ["beijing", "Beijing", "China", 39.9042, 116.4074, "city"],
  ["shanghai", "Shanghai", "China", 31.2304, 121.4737, "city"],
  ["bali", "Bali", "Indonesia", -8.3405, 115.092, "island"],
  ["honolulu", "Honolulu", "United States", 21.3099, -157.8581, "city"],
  ["auckland", "Auckland", "New Zealand", -36.8509, 174.7645, "city"],
  ["queenstown", "Queenstown", "New Zealand", -45.0312, 168.6626, "town"],
  ["buenos-aires", "Buenos Aires", "Argentina", -34.6037, -58.3816, "city"],
  ["rio-de-janeiro", "Rio de Janeiro", "Brazil", -22.9068, -43.1729, "city"],
  ["lima", "Lima", "Peru", -12.0464, -77.0428, "city"],
  ["cusco", "Cusco", "Peru", -13.5319, -71.9675, "city", ["Cuzco"]],
  ["san-jose-costa-rica", "San José", "Costa Rica", 9.9281, -84.0907, "city", ["San Jose"]],
  ["granada-spain", "Granada", "Spain", 37.1773, -3.5986, "city"],
  ["victoria-canada", "Victoria", "Canada", 48.4284, -123.3656, "city"],
  ["cambridge-uk", "Cambridge", "United Kingdom", 52.2053, 0.1218, "city"],
  ["tikal", "Tikal", "Guatemala", 17.222, -89.6237, "landmark"],
].map(([canonicalPlaceId, name, country, latitude, longitude, placeType, aliases]) => ({
  canonicalPlaceId: canonicalPlaceId as string,
  name: name as string,
  country: country as string,
  coordinates: { latitude: latitude as number, longitude: longitude as number },
  placeType: placeType as string,
  ...(aliases ? { aliases: aliases as string[] } : {}),
}));

const environment = process.env.VIATOR_API_ENV === "production" ? "production" : "sandbox";
const apiBaseUrl = environment === "production" ? "https://api.viator.com/partner" : "https://api.sandbox.viator.com/partner";
const apiKey = environment === "production" ? process.env.VIATOR_API_KEY_PRODUCTION : process.env.VIATOR_API_KEY_SANDBOX;
if (!apiKey) throw new Error(`Missing server-only Viator ${environment} key.`);

const response = await fetch(`${apiBaseUrl}/destinations`, {
  headers: { "Accept-Language": "en-US", Accept: "application/json;version=2.0", "exp-api-key": apiKey },
});
if (!response.ok) throw new Error(`Viator destinations returned HTTP ${response.status}.`);
const taxonomy = normalizeViatorDestinationTaxonomy(await response.json());
const results = sample.map((destination) => ({ destination: destination.name, ...evaluateViatorDestinationResolution(destination, taxonomy) }));
const counts = Object.fromEntries(["resolved_automatically", "resolved_via_provider_parent", "ambiguous", "unsupported"]
  .map((status) => [status, results.filter((result) => result.status === status).length]));
const safe = counts.resolved_automatically + counts.resolved_via_provider_parent;
console.log(JSON.stringify({
  environment,
  sampleSize: sample.length,
  counts,
  safeResolutionRate: safe / sample.length,
  results: results.map(({ destination, status, resolution }) => ({ destination, status, ...(resolution ? { providerDestinationName: resolution.destinationName, resolvedFrom: resolution.resolvedFrom } : {}) })),
}, null, 2));
