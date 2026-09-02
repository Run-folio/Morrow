import "server-only";

import { withProviderTimeout } from "./provider-timeout.ts";
import type { ActivityInventoryItem } from "./activity-inventory.ts";
import {
  normalizeViatorDestinationTaxonomy,
  resolveViatorDestinationFromTaxonomy,
  viatorTaxonomyCachePolicy,
  ViatorDestinationTaxonomyError,
  type ActivityDestinationIdentity,
  type ViatorDestinationResolution,
  type ViatorDestinationTaxonomy,
} from "./viator-destination-resolver.server.ts";

export type { ActivityInventoryItem } from "./activity-inventory.ts";
export { viatorTaxonomyCachePolicy };

export type ViatorApiEnvironment = "sandbox" | "production";
export type ViatorFailureCategory = "configuration" | "authentication" | "rate_limited" | "timeout" | "unavailable" | "malformed";

export class ViatorAffiliateError extends Error {
  readonly category: ViatorFailureCategory;
  readonly status?: number;

  constructor(category: ViatorFailureCategory, message = "Viator activities are unavailable.", options: { status?: number } = {}) {
    super(message);
    this.name = "ViatorAffiliateError";
    this.category = category;
    this.status = options.status;
  }
}

export type ViatorApiConfiguration = { environment: ViatorApiEnvironment; apiBaseUrl: string; apiKey: string };
export type { ActivityDestinationIdentity, ViatorDestinationResolution } from "./viator-destination-resolver.server.ts";
export type ViatorActivity = ActivityInventoryItem;
export type ViatorProductSearchInput = {
  destination: ActivityDestinationIdentity;
  start?: number;
  count?: number;
  currency?: string;
  locale?: string;
};

type Environment = Record<string, string | undefined>;
type FetchLike = typeof fetch;
type ViatorDestinationContext = ActivityDestinationIdentity & { providerDestinationId: string; providerDestinationName?: string; resolution?: ViatorDestinationResolution };
type ViatorDestinationResolver = (destination: ActivityDestinationIdentity) => ViatorDestinationContext | undefined | Promise<ViatorDestinationContext | undefined>;
export type ViatorActivityCache = Map<string, { expiresAt: number; activities: ActivityInventoryItem[] }>;
export type ViatorTaxonomyCache = Map<string, { expiresAt: number; taxonomy: ViatorDestinationTaxonomy }>;
export type ViatorDestinationResolutionCache = Map<string, { expiresAt: number; destination: ViatorDestinationContext }>;

export const VIATOR_MAX_PAGE_COUNT = 50;
export const VIATOR_DEFAULT_PAGE_COUNT = 6;
export const VIATOR_MAX_CACHE_TTL_MS = 60 * 60_000;
export const VIATOR_CACHE_TTL_MS = 55 * 60_000;

const apiBaseByEnvironment: Record<ViatorApiEnvironment, string> = {
  sandbox: "https://api.sandbox.viator.com/partner",
  production: "https://api.viator.com/partner",
};
const sharedActivityCache: ViatorActivityCache = new Map();
const sharedTaxonomyCache: ViatorTaxonomyCache = new Map();
const sharedDestinationResolutionCache: ViatorDestinationResolutionCache = new Map();
const sharedTaxonomyRequests = new Map<string, Promise<ViatorDestinationTaxonomy>>();

/** Selects a server-only key. This configuration deliberately never reaches a client module. */
export function resolveViatorApiConfiguration(environment: Environment = process.env): ViatorApiConfiguration {
  const rawEnvironment = environment.VIATOR_API_ENV?.trim().toLowerCase() || "sandbox";
  if (rawEnvironment !== "sandbox" && rawEnvironment !== "production") {
    throw new ViatorAffiliateError("configuration", "Viator activities are not configured.");
  }
  const apiKey = (rawEnvironment === "sandbox" ? environment.VIATOR_API_KEY_SANDBOX : environment.VIATOR_API_KEY_PRODUCTION)?.trim();
  if (!apiKey) throw new ViatorAffiliateError("configuration", "Viator activities are not configured.");
  return { environment: rawEnvironment, apiBaseUrl: apiBaseByEnvironment[rawEnvironment], apiKey };
}

type ViatorImageVariant = { width?: number; url?: string };
type ViatorProduct = {
  productCode?: string;
  title?: string;
  images?: Array<{ isCover?: boolean; variants?: ViatorImageVariant[] }>;
  reviews?: { combinedAverageRating?: number; totalReviews?: number };
  durationInMinutes?: number;
  duration?: { fixedDurationInMinutes?: number; variableDurationFromMinutes?: number; variableDurationToMinutes?: number };
  pricing?: { summary?: { fromPrice?: number }; currency?: string };
  productUrl?: string;
  destinations?: Array<{ ref?: string; primary?: boolean }>;
};

function validHttpsUrl(value: unknown, hostname?: string) {
  if (typeof value !== "string" || value !== value.trim()) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    if (hostname && url.hostname !== hostname && !url.hostname.endsWith(`.${hostname}`)) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

function bestImage(product: ViatorProduct) {
  const image = product.images?.find((candidate) => candidate.isCover) ?? product.images?.[0];
  return [...(image?.variants ?? [])]
    .flatMap((variant) => {
      const url = validHttpsUrl(variant.url);
      return url && typeof variant.width === "number" && Number.isFinite(variant.width) && variant.width > 0 ? [{ width: variant.width, url }] : [];
    })
    .sort((left, right) => right.width - left.width)[0]?.url;
}

function finiteNonNegative(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function positiveMinutes(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizedDuration(product: ViatorProduct): ActivityInventoryItem["duration"] {
  const fixedMinutes = positiveMinutes(product.duration?.fixedDurationInMinutes ?? product.durationInMinutes);
  if (fixedMinutes !== undefined) return { fixedMinutes };
  const fromMinutes = positiveMinutes(product.duration?.variableDurationFromMinutes);
  const toMinutes = positiveMinutes(product.duration?.variableDurationToMinutes);
  if (fromMinutes === undefined && toMinutes === undefined) return undefined;
  return { ...(fromMinutes !== undefined ? { fromMinutes } : {}), ...(toMinutes !== undefined ? { toMinutes } : {}) };
}

export function normalizeViatorProducts(value: unknown, destination: ViatorDestinationContext, checkedAt: string): ActivityInventoryItem[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { products?: unknown }).products)) {
    throw new ViatorAffiliateError("malformed");
  }
  return (value as { products: unknown[] }).products.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const product = entry as ViatorProduct;
    if (typeof product.productCode !== "string" || !product.productCode.trim() || typeof product.title !== "string" || !product.title.trim()) return [];
    const providerDestination = product.destinations?.find((candidate) => candidate.primary) ?? product.destinations?.[0];
    const providerDestinationId = typeof providerDestination?.ref === "string" && providerDestination.ref.trim() ? providerDestination.ref.trim() : destination.providerDestinationId;
    const rating = finiteNonNegative(product.reviews?.combinedAverageRating);
    const reviewCount = finiteNonNegative(product.reviews?.totalReviews);
    const amount = finiteNonNegative(product.pricing?.summary?.fromPrice);
    const currency = product.pricing?.currency?.trim().toUpperCase();
    const image = bestImage(product);
    const duration = normalizedDuration(product);
    const productUrl = validHttpsUrl(product.productUrl, "viator.com");
    return [{
      provider: "viator" as const,
      source: "viator" as const,
      providerProductId: product.productCode.trim(),
      title: product.title.trim(),
      destination: { canonicalPlaceId: destination.canonicalPlaceId, label: destination.name, providerDestinationId },
      ...(image ? { image } : {}),
      ...(rating !== undefined && rating <= 5 ? { rating } : {}),
      ...(reviewCount !== undefined ? { reviewCount: Math.floor(reviewCount) } : {}),
      ...(duration ? { duration } : {}),
      ...(amount !== undefined && currency && /^[A-Z]{3}$/.test(currency) ? { price: { amount, currency } } : {}),
      ...(productUrl ? { productUrl } : {}),
      provenance: { kind: "live_provider_search" as const, provider: "viator" as const, checkedAt },
    }];
  });
}

function pageInteger(value: number | undefined, fallback: number, maximum?: number) {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1 || (maximum !== undefined && resolved > maximum)) throw new ViatorAffiliateError("malformed");
  return resolved;
}

function normalizedLocale(value: string | undefined) {
  if (!value?.trim()) return "en-US";
  const parts = value.trim().replaceAll("_", "-").split("-");
  if (parts.length > 2 || !/^[A-Za-z]{2,3}$/.test(parts[0]) || (parts[1] && !/^[A-Za-z]{2}$/.test(parts[1]))) throw new ViatorAffiliateError("malformed");
  return parts.length === 2 ? `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}` : parts[0].toLowerCase();
}

function normalizedCurrency(value: string | undefined) {
  const currency = (value ?? "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new ViatorAffiliateError("malformed");
  return currency;
}

function cloneActivities(activities: ActivityInventoryItem[]) {
  return activities.map((activity) => ({
    ...activity,
    destination: { ...activity.destination },
    ...(activity.duration ? { duration: { ...activity.duration } } : {}),
    ...(activity.price ? { price: { ...activity.price } } : {}),
    provenance: { ...activity.provenance },
  }));
}

export type ViatorAffiliateClientOptions = {
  request?: FetchLike;
  cache?: ViatorActivityCache;
  taxonomyCache?: ViatorTaxonomyCache;
  destinationResolutionCache?: ViatorDestinationResolutionCache;
  cacheTtlMs?: number;
  taxonomyCacheTtlMs?: number;
  maxCacheEntries?: number;
  timeoutMs?: number;
  now?: () => number;
  resolveDestination?: ViatorDestinationResolver;
};

export class ViatorAffiliateClient {
  private readonly configuration: ViatorApiConfiguration;
  private readonly request: FetchLike;
  private readonly cache: ViatorActivityCache;
  private readonly taxonomyCache: ViatorTaxonomyCache;
  private readonly taxonomyRequests: Map<string, Promise<ViatorDestinationTaxonomy>>;
  private readonly destinationResolutionCache: ViatorDestinationResolutionCache;
  private readonly cacheTtlMs: number;
  private readonly taxonomyCacheTtlMs: number;
  private readonly maxCacheEntries: number;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly resolveDestination: ViatorDestinationResolver;

  constructor(configuration: ViatorApiConfiguration = resolveViatorApiConfiguration(), options: ViatorAffiliateClientOptions | FetchLike = {}) {
    const resolvedOptions = typeof options === "function" ? { request: options } : options;
    this.configuration = configuration;
    this.request = resolvedOptions.request ?? fetch;
    this.cache = resolvedOptions.cache ?? sharedActivityCache;
    this.taxonomyCache = resolvedOptions.taxonomyCache ?? sharedTaxonomyCache;
    this.taxonomyRequests = resolvedOptions.taxonomyCache ? new Map() : sharedTaxonomyRequests;
    this.destinationResolutionCache = resolvedOptions.destinationResolutionCache ?? sharedDestinationResolutionCache;
    this.cacheTtlMs = Math.min(VIATOR_MAX_CACHE_TTL_MS, Math.max(1, resolvedOptions.cacheTtlMs ?? VIATOR_CACHE_TTL_MS));
    this.taxonomyCacheTtlMs = Math.min(viatorTaxonomyCachePolicy.refreshIntervalMs, Math.max(1, resolvedOptions.taxonomyCacheTtlMs ?? viatorTaxonomyCachePolicy.refreshIntervalMs));
    this.maxCacheEntries = Math.max(1, Math.min(500, resolvedOptions.maxCacheEntries ?? 100));
    this.timeoutMs = Math.max(1, Math.min(30_000, resolvedOptions.timeoutMs ?? 8_000));
    this.now = resolvedOptions.now ?? Date.now;
    this.resolveDestination = resolvedOptions.resolveDestination ?? ((destination) => this.resolveProviderDestination(destination));
  }

  private providerHeaders(locale: string) {
    return { "Accept-Language": locale, Accept: "application/json;version=2.0", "exp-api-key": this.configuration.apiKey };
  }

  private async providerJson(url: string, label: string, init: RequestInit) {
    try {
      return await withProviderTimeout({
        label,
        timeoutMs: this.timeoutMs,
        request: async (signal) => {
          const response = await this.request(url, { ...init, cache: "no-store", signal });
          if (response.status === 401 || response.status === 403) throw new ViatorAffiliateError("authentication", undefined, { status: response.status });
          if (response.status === 429) throw new ViatorAffiliateError("rate_limited", undefined, { status: 429 });
          if (!response.ok) throw new ViatorAffiliateError("unavailable", undefined, { status: response.status });
          try { return await response.json(); } catch { throw new ViatorAffiliateError("malformed"); }
        },
      });
    } catch (error) {
      if (error instanceof ViatorAffiliateError) throw error;
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new ViatorAffiliateError("timeout");
      throw new ViatorAffiliateError("unavailable");
    }
  }

  private async destinationTaxonomy(locale = "en-US") {
    const cacheKey = JSON.stringify({ environment: this.configuration.environment, locale });
    const cached = this.taxonomyCache.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) return cached.taxonomy;
    if (cached) this.taxonomyCache.delete(cacheKey);
    const inFlight = this.taxonomyRequests.get(cacheKey);
    if (inFlight) return inFlight;
    const request = (async () => {
      const payload = await this.providerJson(`${this.configuration.apiBaseUrl}/destinations`, "Viator destination taxonomy", {
        method: "GET",
        headers: this.providerHeaders(locale),
      });
      let taxonomy: ViatorDestinationTaxonomy;
      try {
        taxonomy = normalizeViatorDestinationTaxonomy(payload);
      } catch (error) {
        if (error instanceof ViatorDestinationTaxonomyError) throw new ViatorAffiliateError("malformed");
        throw error;
      }
      this.taxonomyCache.set(cacheKey, { expiresAt: this.now() + this.taxonomyCacheTtlMs, taxonomy });
      while (this.taxonomyCache.size > 4) this.taxonomyCache.delete(this.taxonomyCache.keys().next().value!);
      return taxonomy;
    })();
    this.taxonomyRequests.set(cacheKey, request);
    try {
      return await request;
    } finally {
      if (this.taxonomyRequests.get(cacheKey) === request) this.taxonomyRequests.delete(cacheKey);
    }
  }

  private async resolveProviderDestination(destination: ActivityDestinationIdentity): Promise<ViatorDestinationContext | undefined> {
    const canonicalPlaceId = destination.canonicalPlaceId.trim();
    const name = destination.name.trim();
    if (!canonicalPlaceId || !name) return undefined;
    const normalizedDestination = { ...destination, canonicalPlaceId, name };
    const cacheKey = JSON.stringify({ environment: this.configuration.environment, destination: normalizedDestination });
    const cached = this.destinationResolutionCache.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) return { ...cached.destination };
    if (cached) this.destinationResolutionCache.delete(cacheKey);
    const resolution = resolveViatorDestinationFromTaxonomy(normalizedDestination, await this.destinationTaxonomy());
    if (!resolution) return undefined;
    const context = {
      ...normalizedDestination,
      providerDestinationId: resolution.destinationId,
      providerDestinationName: resolution.destinationName,
      resolution,
    };
    this.destinationResolutionCache.set(cacheKey, { expiresAt: this.now() + this.taxonomyCacheTtlMs, destination: context });
    while (this.destinationResolutionCache.size > 500) this.destinationResolutionCache.delete(this.destinationResolutionCache.keys().next().value!);
    return { ...context };
  }

  async searchActivities(input: ViatorProductSearchInput): Promise<ActivityInventoryItem[]> {
    const start = pageInteger(input.start, 1);
    const count = pageInteger(input.count, VIATOR_DEFAULT_PAGE_COUNT, VIATOR_MAX_PAGE_COUNT);
    const locale = normalizedLocale(input.locale);
    const currency = normalizedCurrency(input.currency);
    const destination = await this.resolveDestination(input.destination);
    if (!destination) throw new ViatorAffiliateError("configuration", "Viator destination mapping is unavailable.");
    const cacheKey = JSON.stringify({ environment: this.configuration.environment, destination: destination.canonicalPlaceId, providerDestination: destination.providerDestinationId, locale, currency, start, count });
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) return cloneActivities(cached.activities);
    if (cached) this.cache.delete(cacheKey);

    const payload = await this.providerJson(`${this.configuration.apiBaseUrl}/products/search`, "Viator product search", {
      method: "POST",
      headers: { ...this.providerHeaders(locale), "Content-Type": "application/json" },
      body: JSON.stringify({ filtering: { destination: destination.providerDestinationId }, sorting: { sort: "DEFAULT" }, pagination: { start, count }, currency }),
    });

    const activities = normalizeViatorProducts(payload, destination, new Date(this.now()).toISOString());
    this.cache.set(cacheKey, { expiresAt: this.now() + this.cacheTtlMs, activities: cloneActivities(activities) });
    while (this.cache.size > this.maxCacheEntries) this.cache.delete(this.cache.keys().next().value!);
    return cloneActivities(activities);
  }
}
