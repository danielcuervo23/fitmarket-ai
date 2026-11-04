/** Builds the USDA FoodData Central lookup. The key goes in a header so it never ends up in a URL or a log. */
export function usdaRequest(
  nutritionRef: string,
  apiKey: string | undefined,
): { url: string; headers: Record<string, string> } {
  return {
    url: `https://api.nal.usda.gov/fdc/v1/food/${encodeURIComponent(nutritionRef)}?format=abridged`,
    headers: { "X-Api-Key": apiKey || "DEMO_KEY" },
  };
}
