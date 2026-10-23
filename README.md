# FitMarket AI

A mobile-first web app that builds a **weekly meal plan and a shopping list with
AI**, around the user's budget, goals, supermarkets and dietary restrictions
(prices in Colombian pesos). The interface is available in **Spanish and
English**.

Live demo: https://fitmarket-ai.vercel.app  
Original design: [Figma](https://www.figma.com/design/x4unrU1CJpA4L5KXWmyQUo/FitMarket-AI-Mobile-App-Design)

## Features

- Email sign-up / sign-in (Supabase Auth) with a privacy-policy consent step
- 5-step setup: body data, goals, weekly budget, supermarkets, restrictions
- AI-generated weekly menu + consolidated shopping list, validated on the
  server (budget, chosen stores, dietary restrictions, goals, portions)
- Per-store shopping checklist with progress, plan history, settings
- Language setting (ES / EN) that follows the user across devices
- Delete-account option (removes all personal data)
- Not built yet: the AI chat (the screen says so)

## Tech stack

| Layer | Technology |
| --- | --- |
| UI | React 18, TypeScript (strict), Vite, Tailwind CSS v4, Motion |
| Routing | wouter (URL routes, protected routes) |
| Backend | Supabase: Auth, Postgres with Row Level Security, Edge Functions (Deno) |
| AI | OpenAI Chat Completions, called **only** from an Edge Function |
| Quality | `tsc` for app + functions, `node --test`, GitHub Actions CI |

## Project structure

```
src/
  app/            Screens, routes (AppRoutes.tsx, routes.ts), design system (ui/)
  contexts/       Auth and plan state
  i18n/           Typed translations (messages/*.ts) and the provider
  lib/            Data access and domain logic (one file per feature)
  hooks/          Data hooks
supabase/
  migrations/     SQL schema, RLS policies, limits (apply in order)
  functions/
    _shared/      Domain logic shared by the functions AND the browser
      catalog.ts          Ingredient catalog: nutrition, allergens, prices
      nutrition.ts        Calorie / protein targets (Mifflin-St Jeor)
      planner/            The plan generator (see below)
    generate-weekly-plan/   Auth, daily quota, calls the planner
    delete-account/         Permanent account deletion
data/price-samples/       Private research notes used to calibrate prices
scripts/eval-plans.mjs    Quality evaluation of the generator
```

## How plans are generated

The AI no longer invents prices, calories or quantities. It only **chooses
catalog ingredient ids and amounts**; the server computes the rest:

1. `nutrition.ts` computes the user's daily calories and protein from their
   body data and goals.
2. `restrictions.ts` removes every forbidden ingredient (allergies, vegan,
   free text) from the list the AI sees, so a restriction is enforced by
   construction and in any language.
3. The AI (strict JSON schema, ingredient ids as an enum) composes 7 days of
   Colombian-style meals.
4. `build.ts` scales each day to the calorie target, sums the shopping list
   into whole packs, prices it from the catalog, and swaps expensive foods for
   cheaper equivalents until it fits the budget. If it cannot fit, the user is
   told the real amount needed and can raise the budget and regenerate on the
   same screen.
5. Menu and shopping list are rendered in Spanish and English.

Prices in `catalog.ts` are national references (regular prices, not
promotions). Entries marked `priceSource: "sample"` were read from store pages;
`"estimate"` entries are placeholders to refine. Keep them current.

The plan schema in `supabase/functions/_shared` is imported by the browser too
(`@shared` alias), so client and server always agree on its shape.

## Getting started

```bash
npm install
cp .env.example .env     # then fill in your Supabase URL and anon key
npm run dev              # http://localhost:5173
```

### Supabase setup

1. Create a Supabase project and run the files in `supabase/migrations/` in
   order (SQL editor, or `supabase db push` after `supabase link`).
2. Set the function secrets and deploy:

   ```bash
   supabase secrets set OPENAI_API_KEY=sk-...        # required
   supabase secrets set OPENAI_MODEL=gpt-4o          # optional (default gpt-4o)
   supabase secrets set GENERATION_DAILY_LIMIT=10    # optional (default 10)
   supabase secrets set ALLOWED_ORIGINS=https://your-domain.app,http://localhost:5173
   supabase functions deploy generate-weekly-plan
   supabase functions deploy delete-account
   ```

3. In the Supabase dashboard (Authentication): require email confirmation,
   raise the minimum password length, and add your site URL to the redirect
   allow-list. Set a monthly spending limit in the OpenAI dashboard.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | Type-check the app |
| `npm run typecheck:functions` | Type-check the Edge Functions |
| `npm test` | Unit tests: catalog, targets, planner pipeline (fake model), helpers |
| `npm run eval` | Runs the real generator on 12 profiles and prints quality metrics (needs `OPENAI_API_KEY`, costs a little) |
| `npm run check` | All of the above checks |

In development, `/__preview/<screen>` (for example `/__preview/dashboard`)
renders screens with sample data and no account. It is excluded from
production builds.

## Adding or changing text

All user-facing text lives in `src/i18n/messages/`. Each block declares Spanish
and English together with `defineMessages`; a missing key in either language is
a compile error. Use `t("key")` from `useI18n()`, never hard-coded strings.
Library code returns message **keys** (`ErrorKey`), not text.

## Security notes

- Row Level Security is enabled on every table; each user only sees their rows.
- The OpenAI key and the service-role key exist only as Supabase secrets.
  `VITE_*` values are public by design.
- `generate-weekly-plan` verifies the user's JWT, enforces a daily quota per
  user, limits CORS to known origins, and logs events without personal data.
- Restriction text is length-limited in the database and the UI.
- The plan is a guide, not medical advice; the UI says so. Dietary validation
  uses Spanish food terms, so the generated menu stays in Spanish even when the
  interface is in English.

## Status

Course project in active development. The privacy policy is an informational
draft and should be reviewed before real users rely on the app.
