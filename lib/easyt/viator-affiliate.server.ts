import "server-only";

export type ViatorApiEnvironment = "sandbox" | "production";
export type ViatorFailureCategory = "configuration" | "authentication" | "rate_limited" | "timeout" | "unavailable" | "malformed";

export class ViatorAffiliateError extends Error {
  readonly category: ViatorFailureCategory;

  constructor(
    category: ViatorFailureCategory,
    message = "Viator activities are unavailable.",
  ) {
    super(message);
    this.name = "ViatorAffiliateError";
    this.category = category;
  }
}

export type ViatorApiConfiguration = {
  environment: ViatorApiEnvironment;
  apiBaseUrl: string;
  apiKey: string;
};

export type ViatorActivity = {
  id: string;
  title: string;
  destination: { id: string; name?: string };
  image?: string;
  rating?: number;
  reviewCount?: number;
  durationMinutes?: number;
  price?: { amount: number; currency: string };
  bookingUrl?: string;
  source: "viator-affiliate-api";
};

type Environment = Record<string, string | undefined>;
type FetchLike = typeof fetch;

const apiBaseByEnvironment: Record<ViatorApiEnvironment, string> = {
  sandbox: "https://api.sandbox.viator.com/partner",
  production: "https://api.viator.com/partner",
};

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
  pricing?: { summary?: { fromPrice?: number }; currency?: string };
  productUrl?: string;
  destinations?: Array<{ ref?: string; primary?: boolean }>;
};

function bestImage(product: ViatorProduct) {
  const image = product.images?.find((candidate) => candidate.isCover) ?? product.images?.[0];
  return [...(image?.variants ?? [])]
    .filter((variant): variant is Required<ViatorImageVariant> => typeof variant.url === "string" && typeof variant.width === "number")
    .sort((left, right) => right.width - left.width)[0]?.url;
}

function validHttpsUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith("viator.com") ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeViatorProducts(value: unknown, fallbackDestination: { id: string; name?: string }): ViatorActivity[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { products?: unknown }).products)) {
    throw new ViatorAffiliateError("malformed");
  }
  return (value as { products: unknown[] }).products.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const product = entry as ViatorProduct;
    if (typeof product.productCode !== "string" || !product.productCode.trim() || typeof product.title !== "string" || !product.title.trim()) return [];
    const destination = product.destinations?.find((candidate) => candidate.primary) ?? product.destinations?.[0];
    const rating = typeof product.reviews?.combinedAverageRating === "number" && Number.isFinite(product.reviews.combinedAverageRating)
      ? product.reviews.combinedAverageRating
      : undefined;
    const reviewCount = typeof product.reviews?.totalReviews === "number" && Number.isFinite(product.reviews.totalReviews)
      ? product.reviews.totalReviews
      : undefined;
    const durationMinutes = typeof product.durationInMinutes === "number" && Number.isFinite(product.durationInMinutes)
      ? product.durationInMinutes
      : undefined;
    const amount = product.pricing?.summary?.fromPrice;
    const currency = product.pricing?.currency;
    return [{
      id: product.productCode.trim(),
      title: product.title.trim(),
      destination: { id: typeof destination?.ref === "string" && destination.ref ? destination.ref : fallbackDestination.id, ...(fallbackDestination.name ? { name: fallbackDestination.name } : {}) },
      ...(bestImage(product) ? { image: bestImage(product) } : {}),
      ...(rating !== undefined ? { rating } : {}),
      ...(reviewCount !== undefined ? { reviewCount } : {}),
      ...(durationMinutes !== undefined ? { durationMinutes } : {}),
      ...(typeof amount === "number" && Number.isFinite(amount) && typeof currency === "string" && currency.trim() ? { price: { amount, currency: currency.trim() } } : {}),
      ...(validHttpsUrl(product.productUrl) ? { bookingUrl: validHttpsUrl(product.productUrl) } : {}),
      source: "viator-affiliate-api" as const,
    }];
  });
}

export class ViatorAffiliateClient {
  private readonly configuration: ViatorApiConfiguration;
  private readonly request: FetchLike;

  constructor(
    configuration: ViatorApiConfiguration = resolveViatorApiConfiguration(),
    request: FetchLike = fetch,
  ) {
    this.configuration = configuration;
    this.request = request;
  }

  async searchActivities(input: { destinationId: string; destinationName?: string; count?: number; currency?: string; language?: string }): Promise<ViatorActivity[]> {
    const destinationId = input.destinationId.trim();
    if (!destinationId) throw new ViatorAffiliateError("malformed");
    const count = Math.max(1, Math.min(10, Math.floor(input.count ?? 3)));
    let response: Response;
    try {
      response = await this.request(`${this.configuration.apiBaseUrl}/products/search`, {
        method: "POST",
        headers: {
          "Accept-Language": input.language ?? "en-US",
          "Content-Type": "application/json",
          Accept: "application/json;version=2.0",
          "exp-api-key": this.configuration.apiKey,
        },
        body: JSON.stringify({
          filtering: { destination: destinationId },
          sorting: { sort: "DEFAULT", order: "ASCENDING" },
          pagination: { start: 1, count },
          currency: input.currency ?? "USD",
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new ViatorAffiliateError("timeout");
      throw new ViatorAffiliateError("unavailable");
    }
    if (response.status === 401 || response.status === 403) throw new ViatorAffiliateError("authentication");
    if (response.status === 429) throw new ViatorAffiliateError("rate_limited");
    if (!response.ok) throw new ViatorAffiliateError("unavailable");
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ViatorAffiliateError("malformed");
    }
    return normalizeViatorProducts(payload, { id: destinationId, name: input.destinationName });
  }
}
