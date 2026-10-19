import type {ActivityDiagnosticEvent, ActivityDiagnosticOperation, ActivityDiagnosticSink} from './activity-search-diagnostics.server.ts';
import "server-only";
import {createViatorAdmission, viatorRetryAfter, type ViatorAdmission} from "./viator-admission.server.ts";

import { withProviderTimeout } from "./provider-timeout.ts";
import type { ActivityInventoryItem } from "./activity-inventory.ts";
import type {PlanningCacheOutcome,PlanningResultCounts} from './planning-evidence-state.ts';
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
export type ViatorFailureCategory = "configuration" | "identity" | "authentication" | "rate_limited" | "timeout" | "unavailable" | "malformed";

export class ViatorAffiliateError extends Error {
  readonly category: ViatorFailureCategory;
  readonly status?: number;
  readonly lookupAttempted?: boolean;
  readonly retryAfterSeconds?: number;

  constructor(category: ViatorFailureCategory, message = "Viator activities are unavailable.", options: { status?: number; lookupAttempted?: boolean; retryAfterSeconds?: number } = {}) {
    super(message);
    this.name = "ViatorAffiliateError";
    this.category = category;
    this.status = options.status;
    this.lookupAttempted = options.lookupAttempted;
    this.retryAfterSeconds = options.retryAfterSeconds;
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
export type ViatorActivityCache = Map<string, { expiresAt: number; activities: ActivityInventoryItem[]; counts?: PlanningResultCounts }>;
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
type SearchResult = {activities: ActivityInventoryItem[]; counts?: PlanningResultCounts; cacheOutcome: PlanningCacheOutcome};
const sharedProductRequests = new WeakMap<ViatorActivityCache, Map<string, Promise<SearchResult>>>();
const localOutboundWork = new Map<string, number>();
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
  description?: string;
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
      if (url && /(?:^|[\s/_.-])(?:route[-_ ]?map|map|diagram|floor[-_ ]?plan|plan|screenshot|screen[-_ ]?shot|schematic|chart)(?:[\s/_.-]|$)/i.test(url)) return [];
      return url && typeof variant.width === "number" && Number.isFinite(variant.width) && variant.width > 0 ? [{ width: variant.width, url }] : [];
    })
    .sort((left, right) => right.width - left.width)[0]?.url;
}

function conciseDescription(value: unknown) {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
  const concise = sentences.slice(0, 2).join(" ");
  if (concise.length <= 260) return concise;
  const clipped = concise.slice(0, 257).replace(/\s+\S*$/, "").trim();
  return clipped ? `${clipped}…` : undefined;
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
    const title = product.title.replace(/\s+/g, " ").trim();
    const providerDestination = product.destinations?.find((candidate) => candidate.primary) ?? product.destinations?.[0];
    const providerDestinationId = typeof providerDestination?.ref === "string" && providerDestination.ref.trim() ? providerDestination.ref.trim() : destination.providerDestinationId;
    const rating = finiteNonNegative(product.reviews?.combinedAverageRating);
    const reviewCount = finiteNonNegative(product.reviews?.totalReviews);
    const amount = finiteNonNegative(product.pricing?.summary?.fromPrice);
    const currency = product.pricing?.currency?.trim().toUpperCase();
    const image = bestImage(product);
    const duration = normalizedDuration(product);
    const productUrl = validHttpsUrl(product.productUrl, "viator.com");
    const description = conciseDescription(product.description);
    return [{
      provider: "viator" as const,
      source: "viator" as const,
      providerProductId: product.productCode.trim(),
      title,
      ...(description ? { description } : {}),
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
  admission?: ViatorAdmission;
  cache?: ViatorActivityCache;
  taxonomyCache?: ViatorTaxonomyCache;
  destinationResolutionCache?: ViatorDestinationResolutionCache;
  cacheTtlMs?: number;
  taxonomyCacheTtlMs?: number;
  maxCacheEntries?: number;
  timeoutMs?: number;
  diagnostics?: ActivityDiagnosticSink;
  now?: () => number;
  resolveDestination?: ViatorDestinationResolver;
};

export class ViatorAffiliateClient {
  private readonly configuration: ViatorApiConfiguration;
  private readonly request: FetchLike;
  private readonly admission: ViatorAdmission;
  private readonly productRequests: Map<string, Promise<SearchResult>>;
  private readonly cache: ViatorActivityCache;
  private readonly taxonomyCache: ViatorTaxonomyCache;
  private readonly taxonomyRequests: Map<string, Promise<ViatorDestinationTaxonomy>>;
  private readonly destinationResolutionCache: ViatorDestinationResolutionCache;
  private readonly cacheTtlMs: number;
  private readonly taxonomyCacheTtlMs: number;
  private readonly maxCacheEntries: number;
  private readonly timeoutMs: number;
  private readonly diagnostics?: ActivityDiagnosticSink;
  private readonly now: () => number;
  private readonly resolveDestination: ViatorDestinationResolver;

  constructor(configuration: ViatorApiConfiguration = resolveViatorApiConfiguration(), options: ViatorAffiliateClientOptions | FetchLike = {}) {
    const resolvedOptions = typeof options === "function" ? { request: options } : options;
    this.configuration = configuration;
    this.request = resolvedOptions.request ?? fetch;
    this.diagnostics = resolvedOptions.diagnostics;
    this.cache = resolvedOptions.cache ?? sharedActivityCache;
    this.admission = resolvedOptions.admission ?? createViatorAdmission(configuration.environment);
    let requests = sharedProductRequests.get(this.cache);
    if (!requests) { requests = new Map(); sharedProductRequests.set(this.cache, requests); }
    this.productRequests = requests;
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

  private diagnostic(stage:ActivityDiagnosticEvent['stage'], operation:ActivityDiagnosticOperation, outcome:ActivityDiagnosticEvent['outcome'], started:number, error?:unknown, httpStatus?:number) {
    try { this.diagnostics?.({stage,operation,outcome,elapsedMs:performance.now()-started,error,httpStatus}); } catch { /* Non-authoritative observer. */ }
  }

  private async releasePermit(token:string, operation:ActivityDiagnosticOperation) {
    const started=performance.now();this.diagnostic('permit-release',operation,'started',started);
    try { await this.admission.release(token);this.diagnostic('permit-release',operation,'completed',started); }
    catch(error) { this.diagnostic('permit-release',operation,'failed',started,error);throw error; }
  }

  private async providerJson(url: string, label: string, init: RequestInit, operation:ActivityDiagnosticOperation) {
    // A local shedder protects the coordinator itself. Only SQL establishes the
    // cross-instance ceiling; this never waits or substitutes for a SQL claim.
    const scope=this.configuration.environment;
    const active=localOutboundWork.get(scope) ?? 0;
    if (active>=2) {
      this.diagnostic('admission',operation,'denied',performance.now());
      throw new ViatorAffiliateError("rate_limited",undefined,{lookupAttempted:false,retryAfterSeconds:60});
    }
    localOutboundWork.set(scope,active+1);
    let released=false;
    const releaseLocal=()=>{
      if (released) return;
      released=true;localOutboundWork.set(scope,(localOutboundWork.get(scope) ?? 1)-1);
    };
    return this.admittedProviderJson(url,label,init,releaseLocal,operation);
  }

  private async admittedProviderJson(url: string, label: string, init: RequestInit, releaseLocal:()=>void, operation:ActivityDiagnosticOperation) {
    const admissionStarted=performance.now();this.diagnostic('admission',operation,'started',admissionStarted);
    const claiming=Promise.resolve().then(()=>this.admission.claim());
    let claim;
    try { claim = await withProviderTimeout({label:"Activity admission",timeoutMs:2000,request:()=>claiming}); }
    catch(error) {
      this.diagnostic('admission',operation,'failed',admissionStarted,error);
      // Keep the original late-permit cleanup and local-slot ownership.
      void claiming.then(async late=>{if(late.admitted)await this.releasePermit(late.token,operation);})
        .catch(lateError=>{this.diagnostic('admission',operation,'late-failed',admissionStarted,lateError);}).finally(releaseLocal);
      throw new ViatorAffiliateError("unavailable", undefined, {lookupAttempted:false, retryAfterSeconds:60});
    }
    this.diagnostic('admission',operation,claim.admitted?'completed':'denied',admissionStarted);
    if (!claim.admitted) {
      releaseLocal();
      throw new ViatorAffiliateError("rate_limited", undefined, {lookupAttempted:false, retryAfterSeconds:claim.retryAfterSeconds});
    }
    const token=claim.token;
    const providerStarted=performance.now();this.diagnostic('provider',operation,'started',providerStarted);
    try {
      return await withProviderTimeout({label, timeoutMs:this.timeoutMs, request: async signal => {
        let httpStatus:number|undefined;
        try {
          const response=await this.request(url,{...init,cache:"no-store",signal});httpStatus=response.status;
          if (response.status===429) {
            const retryAfterSeconds=viatorRetryAfter(response.headers.get("retry-after"),this.now());
            await this.admission.cooldown(retryAfterSeconds);
            throw new ViatorAffiliateError("rate_limited",undefined,{status:429,retryAfterSeconds});
          }
          if (response.status===401 || response.status===403) throw new ViatorAffiliateError("authentication",undefined,{status:response.status});
          if (!response.ok) throw new ViatorAffiliateError("unavailable",undefined,{status:response.status});
          let payload:unknown;
          try { payload=await response.json(); } catch { throw new ViatorAffiliateError("malformed"); }
          this.diagnostic('provider',operation,'completed',providerStarted,undefined,httpStatus);
          return payload;
        } catch(error) {
          this.diagnostic('provider',operation,'failed',providerStarted,error,httpStatus);throw error;
        } finally {
          // Release remains inside the existing timeout boundary; only observation changes.
          try { await this.releasePermit(token,operation); } catch { /* Retain expiring lease on database failure. */ }
          finally { releaseLocal(); }
        }
      }});
    } catch (error) {
      if (error instanceof ViatorAffiliateError) throw error;
      if (error instanceof Error && (error.name==="TimeoutError" || error.name==="AbortError")) {
        this.diagnostic('request-boundary',operation,'timeout',providerStarted,error);
        throw new ViatorAffiliateError("timeout");
      }
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
      }, "destination-taxonomy");
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
    return (await this.searchActivitiesWithDiagnostics(input)).activities;
  }

  async searchActivitiesWithDiagnostics(input: ViatorProductSearchInput): Promise<{activities: ActivityInventoryItem[]; counts?: PlanningResultCounts; cacheOutcome: PlanningCacheOutcome}> {
    if (!input.destination.canonicalPlaceId.trim() || !input.destination.name.trim()) {
      throw new ViatorAffiliateError('identity', undefined, {lookupAttempted: false});
    }
    const start = pageInteger(input.start, 1);
    const count = pageInteger(input.count, VIATOR_DEFAULT_PAGE_COUNT, VIATOR_MAX_PAGE_COUNT);
    const locale = normalizedLocale(input.locale);
    const currency = normalizedCurrency(input.currency);
    const destination = await this.resolveDestination(input.destination);
    if (!destination) throw new ViatorAffiliateError('identity', 'Viator destination identity is unresolved.', {lookupAttempted: true});
    const cacheKey = JSON.stringify({ environment: this.configuration.environment, destination: destination.canonicalPlaceId, providerDestination: destination.providerDestinationId, locale, currency, start, count });
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) return {activities:cloneActivities(cached.activities),...(cached.counts?{counts:{...cached.counts}}:{}),cacheOutcome:'hit'};
    if (cached) this.cache.delete(cacheKey);

    const pending = this.productRequests.get(cacheKey);
    if (pending) {
      const result=await pending;
      return {...result,activities:cloneActivities(result.activities),...(result.counts?{counts:{...result.counts}}:{})};
    }
    const work=(async () => {
    const payload = await this.providerJson(`${this.configuration.apiBaseUrl}/products/search`, "Viator product search", {
      method: "POST",
      headers: { ...this.providerHeaders(locale), "Content-Type": "application/json" },
      body: JSON.stringify({ filtering: { destination: destination.providerDestinationId }, sorting: { sort: "DEFAULT" }, pagination: { start, count }, currency }),
    }, "product-search");

    const activities = normalizeViatorProducts(payload, destination, new Date(this.now()).toISOString());
    const counts={raw:(payload as {products:unknown[]}).products.length,admitted:activities.length,returned:activities.length};
    this.cache.set(cacheKey, { expiresAt: this.now() + this.cacheTtlMs, activities: cloneActivities(activities),counts });
    while (this.cache.size > this.maxCacheEntries) this.cache.delete(this.cache.keys().next().value!);
    return {activities:cloneActivities(activities),counts,cacheOutcome:'miss' as const};
    })();
    this.productRequests.set(cacheKey,work);
    try {
      const result=await work;
      return {...result,activities:cloneActivities(result.activities),...(result.counts?{counts:{...result.counts}}:{})};
    } finally {
      if (this.productRequests.get(cacheKey)===work) this.productRequests.delete(cacheKey);
    }
  }
}
