import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Public browser-local demo remains usable without Clerk configuration.
// Citizen API routes independently require authenticated server credentials.
export default process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ? clerkMiddleware()
  : () => NextResponse.next();

export const config = {
  matcher: ['/:path*'],
};
