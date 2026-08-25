export const PRODUCT_TOUR_COMPLETE_KEY = "easyt-product-tour-complete";

export function shouldShowProductTourPrompt(completion: string | null) {
  return completion !== "1";
}
