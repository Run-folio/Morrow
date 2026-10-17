// Netlify owns the IP/domain key, request counting and 429 response. Keep the
// original body unread for Next.js and avoid starting another request chain.
export default async function viatorInventoryGuard(
  _request: Request,
  context: { next(): Promise<Response> },
) {
  return context.next();
}

// A native Edge Function declaration, separate from the Next.js route handler.
// Omitted method means all methods share this narrowly scoped rule.
export const config = {
  // Netlify's native path compiler adds an optional trailing slash. Declaring
  // the slash alias again would create overlapping bindings for that request.
  path: "/api/journey-activity-inventory",
  rateLimit: {
    action: "rate_limit",
    windowLimit: 20,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
