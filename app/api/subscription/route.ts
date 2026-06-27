export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSubscription, countActivePaperTrades, PAPER_TRADE_LIMIT } from '@/lib/subscription';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ isSubscribed: false, isActive: false });
  }

  const userId = (session.user as any).id;
  const sub = await getSubscription(userId);
  const activePaperTrades = await countActivePaperTrades(userId);

  const isActive =
    sub?.status === 'active' && sub.currentPeriodEnd > new Date();

  return NextResponse.json({
    isSubscribed: !!sub,
    isActive,
    status: sub?.status ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    activePaperTrades,
    paperTradeLimit: PAPER_TRADE_LIMIT,
    isAdmin: (session.user as any).role === 'admin',
  });
}
