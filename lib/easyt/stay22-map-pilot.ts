export type Stay22MapInput = {
  affiliateId?: string;
  approved: boolean;
  latitude: number | null;
  longitude: number | null;
  checkIn: string | null;
  checkOut: string | null;
  adults: number;
};

export function hasStay22PilotId(id: string | undefined): id is string {
  return !!id && /^[a-z0-9_-]+$/i.test(id) && !/^(demo)([_-]|$)/i.test(id);
}

function isCalendarDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function buildStay22MapUrl(input: Stay22MapInput, view: "all" | "listview"): string | null {
  const { affiliateId, approved, latitude, longitude, checkIn, checkOut, adults } = input;
  if (!approved || !hasStay22PilotId(affiliateId) || latitude == null || longitude == null
    || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180
    || !isCalendarDate(checkIn) || !isCalendarDate(checkOut) || checkOut <= checkIn
    || !Number.isSafeInteger(adults) || adults < 1 || adults > 12) return null;
  const url = new URL("https://www.stay22.com/embed/gm");
  url.search = new URLSearchParams({
    aid: affiliateId, lat: String(latitude), lng: String(longitude), checkin: checkIn, checkout: checkOut,
    adults: String(adults), zoom: "13", viewmode: view, ...(view === "all" ? { listviewexpand: "true" } : {}),
  }).toString();
  return url.href;
}
