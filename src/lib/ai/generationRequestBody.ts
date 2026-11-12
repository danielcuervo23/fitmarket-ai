// The body the web sends to generate-weekly-plan (Plan 2, Task 15).
// No runtime "@/" imports so `node --test` can load this file.
//
// Contract (supabase/functions/_shared/generationRequest.ts): only
// `appVersion` ("MAJOR.MINOR.PATCH", no leading zeros) and `allowPartial`
// (exactly `true`). Nothing else is ever sent.

export interface GenerationRequestBody {
  appVersion?: string;
  allowPartial?: true;
}

export interface GenerationRequestOptions {
  /** "Quiero el plan igual": accept a plan that misses level 2-5 rules. */
  allowPartial?: boolean;
}

// Same pattern as the server: each part 0-999 without leading zeros.
const VERSION_PATTERN = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;

export function buildGenerationRequestBody(
  appVersion: string,
  options: GenerationRequestOptions = {},
): GenerationRequestBody {
  const body: GenerationRequestBody = {};

  if (VERSION_PATTERN.test(appVersion)) {
    body.appVersion = appVersion;
  }
  if (options.allowPartial === true) {
    body.allowPartial = true;
  }

  return body;
}
