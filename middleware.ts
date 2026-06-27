import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

// Routes that are fully public (no auth required)
const PUBLIC_ROUTES = [
  "/",
  "/themes",
  "/pricing",
  "/auth",
  "/signup",
];

const PUBLIC_PATTERNS = [
  /^\/themes\/.+/,           // /themes/[id] detail pages
  /^\/api\/public\/.+/,       // public API endpoints
  /^\/api\/themes\/.+/,       // public theme data
];

// Routes that require auth (but not necessarily subscription)
const AUTH_REQUIRED_PATTERNS = [
  /^\/dashboard\/.*/,
  /^\/strategies\/.*/,
  /^\/paper-trades\/.*/,
  /^\/api\/theses\/.*/,
  /^\/api\/strategies\/.*/,
  /^\/api\/paper-trade\/.*/,
  /^\/api\/paper-trades\/.*/,
  /^\/api\/analyze\/.*/,
  /^\/api\/upload\/.*/,
  /^\/api\/stripe\/checkout/,
  /^\/api\/stripe\/portal/,
  /^\/settings\/.*/,
  /^\/admin\/.*/,
  /^\/api\/admin\/.*/,
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always skip auth for Stripe webhook (uses signature verification)
  if (pathname === "/api/stripe/webhook") {
    return NextResponse.next();
  }

  // Skip auth for cron endpoints — use Bearer token instead
  if (pathname === '/api/paper-trade/check-prices' || pathname === '/api/cron/stock-update' || pathname === '/api/cron/thesis-monitor') {
    return NextResponse.next()
  }

  // Check if route is public
  const isPublicRoute =
    PUBLIC_ROUTES.includes(pathname) ||
    PUBLIC_PATTERNS.some((p) => p.test(pathname));

  // If it's public, allow through
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Check if route requires auth
  const requiresAuth = AUTH_REQUIRED_PATTERNS.some((p) => p.test(pathname));

  if (!requiresAuth) {
    return NextResponse.next();
  }

  // Verify auth token
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    const signInUrl = new URL("/auth", req.url);
    signInUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protect these route groups
    "/dashboard/:path*",
    "/analyze/:path*",
    "/strategies/:path*",
    "/paper-trades/:path*",
    "/thesis/:path*",
    "/api/theses/:path*",
    "/api/strategies/:path*",
    "/api/paper-trade/:path*",
    "/api/paper-trades/:path*",
    "/api/analyze/:path*",
    "/api/upload/:path*",
    "/api/stripe/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
    // Public routes (middleware runs but allows through)
    "/themes/:path*",
  ],
};
