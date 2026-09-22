import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { BunnyStocksSsoProvider } from "@/lib/sso-provider";

/**
 * openid-client (used by NextAuth for every Google / OIDC callback) hard-codes a
 * **3500ms cap with no retry** on all of its outgoing HTTP requests — see
 * node_modules/openid-client/lib/helpers/request.js (`timeout: 3500`).
 *
 * The id_token/JWKS validation runs *inside* that budget during the callback. On a
 * momentary slow DNS lookup or TLS handshake to Google the whole login fails with
 * `OAUTH_CALLBACK_ERROR: outgoing request timed out after 3500ms` →
 * /auth?error=OAuthCallback. That is what users see as "Google rejected the
 * sign-in" — Google had actually already authenticated them and returned a code.
 *
 * openid-client 5.7.1 offers no per-client override: its `custom.http_options`
 * symbol is dropped by the Client constructor, and `provider.client` metadata
 * (which next-auth does spread) is not read for HTTP options. The request helper
 * is also not reachable via the package `exports` map. So we resolve the module by
 * absolute path and raise the process-wide default instead.
 *
 * Defensive by design: if openid-client is ever upgraded and these internals move,
 * we warn and keep the stock 3500ms rather than breaking sign-in.
 */
const OAUTH_HTTP_TIMEOUT_MS = 15_000;
try {
  // `eval("require")` is deliberate: webpack rewrites literal `require(...)` calls and
  // shims `module`'s createRequire (verified — the shimmed one has no `.resolve`), but it
  // leaves an eval'd require alone. That hands us Node's real loader, so we (a) reach a
  // file the package `exports` map hides, and (b) get the SAME module instance NextAuth
  // already loaded — patching a second copy would be a silent no-op.
  // eslint-disable-next-line no-eval
  const nativeRequire = eval("require") as NodeRequire;
  const requestHelpers = nativeRequire(
    path.join(path.dirname(nativeRequire.resolve("openid-client")), "helpers", "request.js")
  ) as { setDefaults?: (opts: { timeout: number }) => void };

  if (typeof requestHelpers.setDefaults !== "function") {
    console.warn("[auth] openid-client request helper has no setDefaults; keeping 3500ms default");
  } else {
    requestHelpers.setDefaults({ timeout: OAUTH_HTTP_TIMEOUT_MS });
    console.log(`[auth] openid-client HTTP timeout raised to ${OAUTH_HTTP_TIMEOUT_MS}ms`);
  }
} catch (err) {
  console.warn("[auth] could not raise openid-client HTTP timeout; keeping 3500ms default:", err);
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? (() => { throw new Error('ADMIN_EMAIL is required') })();

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      // Users created via email/password signup have NO Account row. Without this,
      // NextAuth's callback-handler (core/lib/callback-handler.js:152-158) finds the
      // existing user by email, sees no matching provider account, and throws
      // AccountNotLinkedError -> /auth?error=OAuthAccountNotLinked -> "Google auth doesn't work".
      // Safe: Google signs its `email_verified` claim, so the email match is trustworthy.
      allowDangerousEmailAccountLinking: true,
    }),
    BunnyStocksSsoProvider({
      issuer: process.env.SSO_PROVIDER_URL || "https://dashboard.bunnystocks.com",
      clientId: process.env.SSO_CLIENT_ID || "themeinvestor",
      clientSecret: (process.env.SSO_CLIENT_SECRET || process.env.CROSS_SITE_API_KEY || "") as string,
      name: "BunnyStocks SSO",
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });

        if (!user || !user.password) {
          return null;
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "user";

        // Auto-assign admin role if email matches ADMIN_EMAIL
        if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
          token.role = "admin";
        }
      }

      // Handle client-side session update (e.g., name change on settings page)
      if (trigger === "update" && session?.name !== undefined) {
        token.name = session.name;
      }

      // Refresh subscription status on each JWT creation/refresh
      if (token.id) {
        const sub = await prisma.subscription.findUnique({
          where: { userId: token.id as string },
          select: { status: true, currentPeriodEnd: true },
        });
        token.hasSubscription =
          sub?.status === "active" && sub.currentPeriodEnd > new Date();
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role ?? "user") as string;
        session.user.hasSubscription = token.hasSubscription ?? false;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
