import { prisma } from '@/lib/prisma';

export const PAPER_TRADE_LIMIT = 20;

// ─── Check if user is admin ───────────────────────────────────────
export async function isAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role === 'admin';
}

// ─── Check if user has an active subscription ─────────────────────
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
  });
  if (!sub) return false;
  return sub.status === 'active' && sub.currentPeriodEnd > new Date();
}

// ─── Get subscription details ─────────────────────────────────────
export async function getSubscription(userId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: {
      status: true,
      tier: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
    },
  });
  return sub;
}

// ─── Count active paper trades for a user ─────────────────────────
export async function countActivePaperTrades(userId: string): Promise<number> {
  return prisma.paperTrade.count({
    where: {
      userId,
      status: { in: ['active', 'pending'] },
    },
  });
}

// ─── Check if user can create a new paper trade ───────────────────
export async function canCreatePaperTrade(
  userId: string
): Promise<{ allowed: boolean; activeCount: number; limit: number }> {
  const [activeCount, isActive] = await Promise.all([
    countActivePaperTrades(userId),
    hasActiveSubscription(userId),
  ]);

  // Admin bypasses limits
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (user?.role === 'admin') {
    return { allowed: true, activeCount, limit: Infinity };
  }

  if (!isActive) {
    return { allowed: false, activeCount: 0, limit: 0 };
  }

  return {
    allowed: activeCount < PAPER_TRADE_LIMIT,
    activeCount,
    limit: PAPER_TRADE_LIMIT,
  };
}

// ─── Check if user can create a trading strategy ──────────────────
export async function canCreateStrategy(
  userId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (user?.role === 'admin') {
    return { allowed: true };
  }

  const isActive = await hasActiveSubscription(userId);
  if (!isActive) {
    return {
      allowed: false,
      reason: 'Active membership required to create trading strategies',
    };
  }

  return { allowed: true };
}
