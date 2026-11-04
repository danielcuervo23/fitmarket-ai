import { z } from "zod";

// Shape of scripts/prices/policy.json. The price runner validates the file
// with this schema and ENFORCES it (see fetcher.ts and run.ts): every field is
// declared here and unknown fields are rejected instead of silently stripped.
// `bucaramanga.how` is documentation only; code never parses it. Each store
// module owns its own Bucaramanga selector as constants.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ownerAuthorizationSchema = z
  .object({
    date: isoDate,
    by: z.string().min(1),
    note: z.string().min(1),
    legalReviewBeforePublicLaunch: z.enum(["pending", "done"]),
  })
  .strict();

export const precautionsSchema = z
  .object({
    cadence: z.literal("weekly"),
    minDelayMs: z.number().int().min(5000),
    stopOnStatus: z.array(z.number().int().min(100).max(599)),
    stopOnBlock: z.boolean(),
    onlyPages: z.string().min(1),
    neverRequest: z.array(z.string().min(1)),
    storeOnly: z.array(z.string().min(1)),
    neverStore: z.array(z.string().min(1)),
    onStoreRequestToStop: z.string().min(1),
  })
  .strict();

export const storePolicySchema = z
  .object({
    allowed: z.boolean(),
    reason: z.string().min(1),
    robotsUrl: z.string().url().startsWith("https://"),
    disallowedPaths: z.array(z.string()),
    termsUrl: z.string().url().startsWith("https://"),
    termsSummary: z.string().min(1),
    method: z.enum(["vtex_api", "jsonld_html", "vtex_io_state", "next_data", "json_api", "none"]),
    bucaramanga: z.object({ available: z.boolean(), how: z.string() }).strict(),
    minDelayMs: z.number().int().min(0),
    readOnly: z.literal("product_pages").optional(),
    productPathPattern: z
      .string()
      .regex(/^\/(?:<slug>|[A-Za-z0-9._~-]+)(?:\/(?:<slug>|[A-Za-z0-9._~-]+))*$/)
      .optional(),
  })
  .strict()
  .superRefine((store, ctx) => {
    if (!store.allowed) return;
    if (!store.productPathPattern) {
      ctx.addIssue({ code: "custom", message: "an allowed store needs productPathPattern" });
    }
    if (store.readOnly !== "product_pages") {
      ctx.addIssue({ code: "custom", message: "an allowed store must be readOnly: product_pages" });
    }
    if (store.minDelayMs < 5000) {
      ctx.addIssue({ code: "custom", message: "an allowed store needs minDelayMs >= 5000" });
    }
  });

export const policySchema = z
  .object({
    checkedOn: isoDate,
    userAgent: z.string().regex(/^FitMarketPriceBot\/\d+\.\d+ \(\+https:\/\/.+\)$/),
    ownerAuthorization: ownerAuthorizationSchema,
    precautions: precautionsSchema,
    stores: z.record(z.string(), storePolicySchema),
  })
  .strict();

export type StorePolicy = z.infer<typeof storePolicySchema>;
export type Policy = z.infer<typeof policySchema>;
