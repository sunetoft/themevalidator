import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// POST — Sync a ticker to the logged-in user's TradeScouter dashboard.
// Auth: NextAuth session (called by ThemeInvestor's own UI).
// Body: { ticker: string, action: "add" | "remove" }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const tsUrl = process.env.TRADESCOUTER_INTERNAL_URL;
  const apiKey = process.env.CROSS_SITE_API_KEY;
  if (!tsUrl || !apiKey) {
    return NextResponse.json({ success: false }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { ticker, action } = body as { ticker?: unknown; action?: unknown };

  if (!ticker || typeof ticker !== 'string') {
    return NextResponse.json({ success: false }, { status: 400 });
  }
  if (action !== 'add' && action !== 'remove') {
    return NextResponse.json({ success: false, error: 'action must be "add" or "remove"' }, { status: 400 });
  }

  const payload = {
    email: session.user.email,
    ticker: ticker.toUpperCase(),
    source: 'themeinvestor',
  };

  try {
    const method = action === 'add' ? 'POST' : 'DELETE';
    const resp = await fetch(`${tsUrl}/api/external/import-stock`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    return NextResponse.json({ success: resp.ok });
  } catch {
    return NextResponse.json({ success: false });
  }
}
