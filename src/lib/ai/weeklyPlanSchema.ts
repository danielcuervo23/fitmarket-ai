/**
 * The plan schema is defined once, in the Edge Function's shared code, and
 * re-used here so the client and the server can never disagree about the shape
 * of a weekly plan. See vite.config.ts / tsconfig.json for the `@shared` alias.
 */
export {
  parseWeeklyPlanJson,
  weeklyPlanSchema,
  type WeeklyPlanParsed,
} from "@shared/weeklyPlanSchema.ts";
