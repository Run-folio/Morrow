export type LocalFinderQueryContext = {
  kind: "restaurant" | "stay";
  city: string;
  country: string;
  dayId: string;
  coordinates: [number, number];
  locale: string;
  staySearch?: {
    checkIn?: string;
    checkOut?: string;
    adults?: number;
    rooms?: number;
    currency?: string;
    bookerCountry?: string;
  };
};

/**
 * Stable identity for the provider inputs that produce one local-finder result
 * set. Presentation state such as the selected result deliberately stays out.
 */
export function localFinderQueryKey({
  kind,
  city,
  country,
  dayId,
  coordinates: [longitude, latitude],
  locale,
  staySearch,
}: LocalFinderQueryContext) {
  return [
    kind,
    city,
    country,
    dayId,
    latitude,
    longitude,
    locale,
    staySearch?.checkIn ?? "",
    staySearch?.checkOut ?? "",
    staySearch?.adults ?? "",
    staySearch?.rooms ?? "",
    staySearch?.currency ?? "",
    staySearch?.bookerCountry ?? "",
  ].join("|");
}
