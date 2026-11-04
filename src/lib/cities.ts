// No runtime "@/" imports: `node --test` loads this file directly. The
// Supabase client is received as a parameter.

export interface City {
  slug: string;
  name: string;
}

export const CITY_SLUG_PATTERN = /^[a-z_]{2,40}$/;

/** Same 12 cities as the seed in supabase/migrations/010. Launch city first. */
export const FALLBACK_CITIES: readonly City[] = [
  { slug: "bucaramanga", name: "Bucaramanga" },
  { slug: "bogota", name: "Bogotá" },
  { slug: "medellin", name: "Medellín" },
  { slug: "cali", name: "Cali" },
  { slug: "barranquilla", name: "Barranquilla" },
  { slug: "cartagena", name: "Cartagena" },
  { slug: "cucuta", name: "Cúcuta" },
  { slug: "pereira", name: "Pereira" },
  { slug: "manizales", name: "Manizales" },
  { slug: "ibague", name: "Ibagué" },
  { slug: "villavicencio", name: "Villavicencio" },
  { slug: "santa_marta", name: "Santa Marta" },
];

/** True when the value looks like a city slug (shape only). */
export function isCitySlug(value: unknown): value is string {
  return typeof value === "string" && CITY_SLUG_PATTERN.test(value);
}

/** A well-formed slug that is in the known list, or null. */
export function normalizeCity(
  value: unknown,
  known: readonly City[],
): string | null {
  if (!isCitySlug(value)) {
    return null;
  }

  return known.some((city) => city.slug === value) ? value : null;
}

interface CitiesResult {
  data: { slug: unknown; name: unknown }[] | null;
  error: unknown;
}

/**
 * The part of the Supabase client we use. `from` is loosely typed on purpose:
 * the real query builder is a deep generic type that a hand-written interface
 * cannot match structurally. The result is checked at runtime below.
 */
export interface CitiesClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
}

let cached: Promise<City[]> | null = null;

/** For tests. */
export function resetCitiesCache(): void {
  cached = null;
}

async function loadCities(client: CitiesClient): Promise<City[]> {
  try {
    const { data, error } = (await client
      .from("cities")
      .select("slug, name")
      .eq("is_active", true)
      .order("sort_order")) as CitiesResult;

    if (error || !data) {
      return [...FALLBACK_CITIES];
    }

    const cities = data.flatMap((row) =>
      typeof row.slug === "string" &&
      CITY_SLUG_PATTERN.test(row.slug) &&
      typeof row.name === "string"
        ? [{ slug: row.slug, name: row.name }]
        : [],
    );

    return cities.length ? cities : [...FALLBACK_CITIES];
  } catch {
    return [...FALLBACK_CITIES];
  }
}

/** Active cities by sort_order. Memoised for the session; fallback on error. */
export function fetchCities(client: CitiesClient): Promise<City[]> {
  cached ??= loadCities(client);
  return cached;
}
