/**
 * BunnyStocks SSO Client Provider for NextAuth
 *
 * This module provides a custom NextAuth provider that delegates authentication
 * to dashboard.bunnystocks.com (the Identity Provider).
 *
 * Flow:
 * 1. User clicks "Sign in with BunnyStocks" on ThemeInvestor
 * 2. NextAuth redirects to dashboard.bunnystocks.com/api/sso/authorize?client=themeinvestor&redirect_uri=...&state=...
 * 3. If user has session on dashboard, they get an authorization code redirect back
 * 4. NextAuth's callback handler exchanges the code at /api/sso/token for a JWT
 * 5. The JWT is used to fetch user profile from /api/sso/userinfo
 * 6. The user is auto-provisioned in the local app's DB by email
 *
 * Installation:
 * 1. Add this provider to lib/auth.ts providers array
 * 2. Set env vars: SSO_PROVIDER_URL, SSO_CLIENT_ID, SSO_CLIENT_SECRET
 * 3. Add callback route handler for /api/auth/callback/bunnystocks-sso
 */

// Use inline type to avoid module resolution issues across apps

interface SsoProviderOptions {
  /** The dashboard IdP URL (e.g., https://dashboard.bunnystocks.com) */
  issuer: string;
  /** This app's client ID (e.g., "themeinvestor") */
  clientId: string;
  /** Shared secret (CROSS_SITE_API_KEY) */
  clientSecret: string;
  /** This app's name for display */
  name?: string;
}

/**
 * Create a custom BunnyStocks SSO provider for NextAuth.
 *
 * This implements a simplified OAuth2 authorization code flow:
 * - authorization endpoint: {issuer}/api/sso/authorize
 * - token endpoint: {issuer}/api/sso/token
 * - userinfo endpoint: {issuer}/api/sso/userinfo
 *
 * Auto-provisions users by email in the local DB.
 */
export function BunnyStocksSsoProvider(options: SsoProviderOptions): any {
  const { issuer, clientId, clientSecret, name = "BunnyStocks" } = options;

  const authorizationEndpoint = `${issuer}/api/sso/authorize`;
  const tokenEndpoint = `${issuer}/api/sso/token`;
  const userinfoEndpoint = `${issuer}/api/sso/userinfo`;

  return {
    id: "bunnystocks-sso",
    name,
    type: "oauth",
    clientId,
    clientSecret,
    authorization: {
      url: authorizationEndpoint,
      params: {
        client_id: clientId,
      },
    },
    token: {
      url: tokenEndpoint,
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
      },
    },
    userinfo: {
      url: userinfoEndpoint,
      params: {},
    },
    profile(profile: any) {
      return {
        id: profile.sub,
        email: profile.email,
        name: profile.name,
        image: profile.image || null,
        role: profile.role || "user",
      };
    },
  };
}
