export type OptionalAffiliatePartner = "car_hire" | "saily" | "ground_transport";

export type OptionalAffiliateUrls = {
  carHireUrl?: string;
  sailyUrl?: string;
  groundTransportUrl?: string;
};

export type OptionalAffiliateConfigurationWarning = {
  partner: OptionalAffiliatePartner;
  configKey: string;
  enabledKey?: string;
  reason: "missing" | "invalid";
};

export type OptionalAffiliateConfiguration = {
  urls: OptionalAffiliateUrls;
  warnings: OptionalAffiliateConfigurationWarning[];
};

type Environment = Record<string, string | undefined>;

const partners = [
  { partner: "car_hire", urlKey: "CAR_HIRE_AFFILIATE_URL", enabledKey: "CAR_HIRE_AFFILIATE_ENABLED", target: "carHireUrl" },
  { partner: "saily", urlKey: "SAILY_AFFILIATE_URL", enabledKey: "SAILY_AFFILIATE_ENABLED", target: "sailyUrl" },
  { partner: "ground_transport", urlKey: "GROUND_TRANSPORT_AFFILIATE_URL", enabledKey: "GROUND_TRANSPORT_AFFILIATE_ENABLED", target: "groundTransportUrl" },
] as const;

const isEnabled = (value: string | undefined) => value?.trim().toLowerCase() === "true";

/** Returns a safe URL only; caller-facing warnings deliberately never contain its value. */
export function validateOptionalAffiliateUrl(value: string | undefined): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (value !== value.trim() || /\s/.test(value) || !/^https?:\/\//i.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (!url.hostname || url.hostname === "." || url.hostname.startsWith(".") || url.username || url.password) return undefined;
    // Validation must not normalize or re-encode an approved attribution URL.
    return url.protocol === "http:" || url.protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Optional URLs continue to enable their partner by themselves for backward
 * compatibility. The matching *_ENABLED=true flag only declares intent so a
 * missing URL can be surfaced without making disabled local/dev builds noisy.
 */
export function resolveOptionalAffiliateConfiguration(environment: Environment = process.env): OptionalAffiliateConfiguration {
  const urls: OptionalAffiliateUrls = {};
  const warnings: OptionalAffiliateConfigurationWarning[] = [];
  for (const definition of partners) {
    const raw = environment[definition.urlKey];
    const url = validateOptionalAffiliateUrl(raw);
    if (url) {
      urls[definition.target] = url;
      continue;
    }
    if (raw !== undefined && raw !== "") {
      warnings.push({ partner: definition.partner, configKey: definition.urlKey, enabledKey: definition.enabledKey, reason: "invalid" });
    } else if (isEnabled(environment[definition.enabledKey])) {
      warnings.push({ partner: definition.partner, configKey: definition.urlKey, enabledKey: definition.enabledKey, reason: "missing" });
    }
  }
  return { urls, warnings };
}

/** Emits concise configuration identity only—never a partner URL or its query parameters. */
export function warnOptionalAffiliateConfiguration(configuration: OptionalAffiliateConfiguration, warn: (message: string) => void = console.warn) {
  configuration.warnings.forEach(({ partner }) => {
    warn(`[Morrovia config] Optional partner "${partner}" is enabled or configured but its URL is missing or invalid. The partner action remains disabled.`);
  });
}
