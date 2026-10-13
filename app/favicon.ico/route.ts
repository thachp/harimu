/** Conventional browser fallback points to the existing vector icon. */
export function GET(request: Request) {
  return Response.redirect(new URL('/favicon.svg', request.url), 307);
}
