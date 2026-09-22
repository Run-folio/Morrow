/** Promote a source handoff URL to the durable Builder recovery identity. */
export function durableBuilderRecoveryUrl(currentHref: string, tripId: string) {
  const url = new URL(currentHref);
  if (url.searchParams.has("trip")) return null;
  if (!url.searchParams.has("inspire") && url.searchParams.get("homeDraft") !== "1") return null;

  url.searchParams.delete("inspire");
  url.searchParams.delete("homeDraft");
  url.searchParams.set("trip", tripId);
  url.searchParams.set("recover", "1");
  return url;
}
