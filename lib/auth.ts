import { createClerkClient } from '@clerk/backend';
import { env } from 'cloudflare:workers';

export async function authenticatedUserId(request: Request) {
  const bindings = env as unknown as {
    CLERK_SECRET_KEY?: string;
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
  };

  if (!bindings.CLERK_SECRET_KEY || !bindings.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return null;
  }

  const requestState = await createClerkClient({
    secretKey: bindings.CLERK_SECRET_KEY,
    publishableKey: bindings.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  }).authenticateRequest(request, { acceptsToken: 'session_token' });

  return requestState.isAuthenticated ? requestState.toAuth().userId : null;
}

