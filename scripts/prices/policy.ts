import { z } from "zod";

// Shape of scripts/prices/policy.json. The price runner validates the file
// with this schema and reads only the stores where `allowed` is true.
// `bucaramanga.how` is documentation only; code never parses it.
export const storePolicySchema = z.object({
  allowed: z.boolean(),
  reason: z.string().min(1),
  robotsUrl: z.string().url().startsWith("https://"),
  disallowedPaths: z.array(z.string()),
  termsUrl: z.string().url().startsWith("https://"),
  termsSummary: z.string().min(1),
  method: z.enum(["vtex_api", "jsonld_html", "json_api", "none"]),
  bucaramanga: z.object({ available: z.boolean(), how: z.string() }),
  minDelayMs: z.number().int().min(0),
});

export const policySchema = z.object({
  checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  userAgent: z.string().regex(/^FitMarketPriceBot\/\d+\.\d+ \(\+https:\/\/.+\)$/),
  stores: z.record(z.string(), storePolicySchema),
});

export type StorePolicy = z.infer<typeof storePolicySchema>;
export type Policy = z.infer<typeof policySchema>;
