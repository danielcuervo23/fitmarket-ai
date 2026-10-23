// Minimal Deno typings so the Edge Functions can be type-checked with `tsc`
// (npm run typecheck:functions) without installing Deno.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};
