import { withProviderTimeout } from "./provider-timeout.ts";

export type RoadRoutingFailureCategory =
  | "configuration"
  | "authentication"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "malformed"
  | "no_route";

export class RoadRoutingError extends Error {
  readonly category: RoadRoutingFailureCategory;
  readonly status?: number;

  constructor(category: RoadRoutingFailureCategory, options: { status?: number } = {}) {
    super("Road routing is unavailable.");
    this.name = "RoadRoutingError";
    this.category = category;
    this.status = options.status;
  }
}

export type RoadRoutingProfile = "driving-car";

export type RoadRouteRequest = {
  origin: { canonicalIdentity: string; coordinates: [number, number] };
  destination: { canonicalIdentity: string; coordinates: [number, number] };
  profile?: RoadRoutingProfile;
};

export type RoadRouteResult = {
  mode: "road";
  distanceKm: number;
  durationMinutes: number;
  confidence: "medium";
  provenance: "routed";
  provider: "openrouteservice";
  providerCheckedAt: string;
  profile: RoadRoutingProfile;
  routeGeometry: Array<[number, number]>;
  attribution: string;
};

export interface RoadRoutingProvider {
  readonly provider: RoadRouteResult["provider"];
  route(input: RoadRouteRequest): Promise<RoadRouteResult>;
}

type Environment = Record<string, string | undefined>;
type FetchLike = typeof fetch;
type OpenRouteServiceCache = Map<string, { expiresAt: number; result: RoadRouteResult }>;

export type OpenRouteServiceConfiguration = {
  apiBaseUrl: "https://api.heigit.org/openrouteservice/v2";
  apiKey: string;
  providerVersion: "v2";
};

export type OpenRouteServiceClientOptions = {
  request?: FetchLike;
  cache?: OpenRouteServiceCache;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
  timeoutMs?: number;
  now?: () => number;
};

export const OPENROUTESERVICE_ATTRIBUTION = "© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors";
export const ROAD_ROUTE_CACHE_TTL_MS = 6 * 60 * 60_000;
export const ROAD_ROUTE_MAX_CACHE_TTL_MS = 24 * 60 * 60_000;
export const ROAD_ROUTE_MAX_GEOMETRY_POINTS = 256;

const OPENROUTESERVICE_API_BASE_URL = "https://api.heigit.org/openrouteservice/v2" as const;
const sharedRoadRouteCache: OpenRouteServiceCache = new Map();
const sharedRoadRouteRequests = new Map<string, Promise<RoadRouteResult>>();

export function resolveOpenRouteServiceConfiguration(environment: Environment = process.env): OpenRouteServiceConfiguration {
  const apiKey = environment.OPENROUTESERVICE_API_KEY?.trim();
  if (!apiKey) throw new RoadRoutingError("configuration");
  return { apiBaseUrl: OPENROUTESERVICE_API_BASE_URL, apiKey, providerVersion: "v2" };
}

function validCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === "number"
    && Number.isFinite(value[0])
    && value[0] >= -180
    && value[0] <= 180
    && typeof value[1] === "number"
    && Number.isFinite(value[1])
    && value[1] >= -90
    && value[1] <= 90;
}

function positiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function normalizedGeometry(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) throw new RoadRoutingError("malformed");
  const coordinates = value.map((point) => {
    if (!validCoordinate(point)) throw new RoadRoutingError("malformed");
    return [Number(point[0].toFixed(5)), Number(point[1].toFixed(5))] as [number, number];
  });
  if (coordinates.length < 2) throw new RoadRoutingError("malformed");
  if (coordinates.length <= ROAD_ROUTE_MAX_GEOMETRY_POINTS) return coordinates;
  const lastIndex = coordinates.length - 1;
  return Array.from({ length: ROAD_ROUTE_MAX_GEOMETRY_POINTS }, (_, index) => {
    const sourceIndex = Math.round((index / (ROAD_ROUTE_MAX_GEOMETRY_POINTS - 1)) * lastIndex);
    return coordinates[sourceIndex];
  });
}

type OpenRouteServiceGeoJson = {
  features?: Array<{
    geometry?: { type?: unknown; coordinates?: unknown };
    properties?: { summary?: { distance?: unknown; duration?: unknown } };
  }>;
};

export function normalizeOpenRouteServiceRoute(value: unknown, checkedAt: string, profile: RoadRoutingProfile): RoadRouteResult {
  if (!value || typeof value !== "object") throw new RoadRoutingError("malformed");
  const feature = (value as OpenRouteServiceGeoJson).features?.[0];
  const distanceMetres = positiveNumber(feature?.properties?.summary?.distance);
  const durationSeconds = positiveNumber(feature?.properties?.summary?.duration);
  if (feature?.geometry?.type !== "LineString" || distanceMetres === null || durationSeconds === null) {
    throw new RoadRoutingError("malformed");
  }
  return {
    mode: "road",
    distanceKm: Math.round(distanceMetres / 1000),
    durationMinutes: Math.max(15, Math.round((durationSeconds / 60) / 15) * 15),
    confidence: "medium",
    provenance: "routed",
    provider: "openrouteservice",
    providerCheckedAt: checkedAt,
    profile,
    routeGeometry: normalizedGeometry(feature.geometry.coordinates),
    attribution: OPENROUTESERVICE_ATTRIBUTION,
  };
}

function cloneResult(result: RoadRouteResult): RoadRouteResult {
  return { ...result, routeGeometry: result.routeGeometry.map((point) => [...point] as [number, number]) };
}

function roundedCoordinate(value: number) {
  return Number(value.toFixed(5));
}

export class OpenRouteServiceRoadRoutingProvider implements RoadRoutingProvider {
  readonly provider = "openrouteservice" as const;
  private readonly configuration: OpenRouteServiceConfiguration;
  private readonly request: FetchLike;
  private readonly cache: OpenRouteServiceCache;
  private readonly inFlight: Map<string, Promise<RoadRouteResult>>;
  private readonly cacheTtlMs: number;
  private readonly maxCacheEntries: number;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(
    configuration: OpenRouteServiceConfiguration = resolveOpenRouteServiceConfiguration(),
    options: OpenRouteServiceClientOptions = {},
  ) {
    this.configuration = configuration;
    this.request = options.request ?? fetch;
    this.cache = options.cache ?? sharedRoadRouteCache;
    this.inFlight = options.cache ? new Map() : sharedRoadRouteRequests;
    this.cacheTtlMs = Math.min(ROAD_ROUTE_MAX_CACHE_TTL_MS, Math.max(1, options.cacheTtlMs ?? ROAD_ROUTE_CACHE_TTL_MS));
    this.maxCacheEntries = Math.max(1, Math.min(500, options.maxCacheEntries ?? 250));
    this.timeoutMs = Math.max(1, Math.min(15_000, options.timeoutMs ?? 6_000));
    this.now = options.now ?? Date.now;
  }

  private cacheKey(input: RoadRouteRequest, profile: RoadRoutingProfile) {
    return JSON.stringify({
      provider: this.provider,
      providerVersion: this.configuration.providerVersion,
      profile,
      origin: {
        identity: input.origin.canonicalIdentity,
        coordinates: input.origin.coordinates.map(roundedCoordinate),
      },
      destination: {
        identity: input.destination.canonicalIdentity,
        coordinates: input.destination.coordinates.map(roundedCoordinate),
      },
    });
  }

  async route(input: RoadRouteRequest): Promise<RoadRouteResult> {
    const profile = input.profile ?? "driving-car";
    if (!validCoordinate(input.origin.coordinates) || !validCoordinate(input.destination.coordinates)) {
      throw new RoadRoutingError("malformed");
    }
    const key = this.cacheKey(input, profile);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > this.now()) return cloneResult(cached.result);
    if (cached) this.cache.delete(key);
    const pending = this.inFlight.get(key);
    if (pending) return cloneResult(await pending);

    const providerRequest = (async () => {
      let payload: unknown;
      try {
        payload = await withProviderTimeout({
          label: "OpenRouteService road route",
          timeoutMs: this.timeoutMs,
          request: async (signal) => {
            const response = await this.request(`${this.configuration.apiBaseUrl}/directions/${profile}/geojson`, {
              method: "POST",
              headers: {
                Accept: "application/geo+json, application/json",
                Authorization: this.configuration.apiKey,
                "Content-Type": "application/json",
              },
              cache: "no-store",
              signal,
              body: JSON.stringify({
                coordinates: [input.origin.coordinates, input.destination.coordinates],
                instructions: false,
                options: { avoid_features: ["ferries"] },
              }),
            });
            if (response.status === 401 || response.status === 403) throw new RoadRoutingError("authentication", { status: response.status });
            if (response.status === 429) throw new RoadRoutingError("rate_limited", { status: response.status });
            if (response.status === 400 || response.status === 404 || response.status === 422) throw new RoadRoutingError("no_route", { status: response.status });
            if (!response.ok) throw new RoadRoutingError("unavailable", { status: response.status });
            try { return await response.json(); } catch { throw new RoadRoutingError("malformed"); }
          },
        });
      } catch (error) {
        if (error instanceof RoadRoutingError) throw error;
        if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new RoadRoutingError("timeout");
        throw new RoadRoutingError("unavailable");
      }
      const result = normalizeOpenRouteServiceRoute(payload, new Date(this.now()).toISOString(), profile);
      this.cache.set(key, { expiresAt: this.now() + this.cacheTtlMs, result: cloneResult(result) });
      while (this.cache.size > this.maxCacheEntries) this.cache.delete(this.cache.keys().next().value!);
      return result;
    })();

    this.inFlight.set(key, providerRequest);
    try {
      return cloneResult(await providerRequest);
    } finally {
      if (this.inFlight.get(key) === providerRequest) this.inFlight.delete(key);
    }
  }
}
