import { prisma } from "@/lib/prisma";
import type { Directive } from "@prisma/client";

export type DirectiveStatus = "active" | "paused" | "expired" | "archived";
export type DirectiveScope = "collector" | "scanner" | "both";
export type DirectiveDecay = "linear" | "none";

const SECONDS_PER_DAY = 86400;

interface DirectiveLike {
  status: string;
  startedAt: Date;
  ttlDays: number;
  totalPausedSeconds: number;
  nominalWeight: number;
  decayFn: string;
}

function round(n: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

/**
 * Effective expiry = startedAt + ttlDays + total paused time.
 * Freeze-the-clock pause: pausing stops the TTL; resume accrues the paused
 * duration so the remaining window is preserved.
 */
export function effectiveExpiry(d: {
  startedAt: Date;
  ttlDays: number;
  totalPausedSeconds: number;
}): Date {
  const ms =
    d.startedAt.getTime() +
    d.ttlDays * SECONDS_PER_DAY * 1000 +
    d.totalPausedSeconds * 1000;
  return new Date(ms);
}

/**
 * Effective multiplier in force right now (decay-aware). Soft multiplier —
 * never a hard filter. 1.0 == baseline attention.
 *   linear: boost fades linearly to 1.0 over the window.
 *   none:   constant nominal weight until expiry, then 1.0.
 */
export function effectiveWeight(d: DirectiveLike, now: Date = new Date()): number {
  if (d.status !== "active") return 1.0;
  const ttlMs = d.ttlDays * SECONDS_PER_DAY * 1000;
  let activeMs = now.getTime() - d.startedAt.getTime() - d.totalPausedSeconds * 1000;
  if (activeMs < 0) activeMs = 0;
  if (activeMs >= ttlMs) return 1.0;
  if (d.decayFn === "none") return d.nominalWeight;
  const frac = activeMs / ttlMs;
  return 1.0 + (d.nominalWeight - 1.0) * (1.0 - frac);
}

export function remainingDays(
  d: { status: string } & Parameters<typeof effectiveExpiry>[0],
  now: Date = new Date()
): number | null {
  if (d.status !== "active") return null;
  const ms = effectiveExpiry(d).getTime() - now.getTime();
  return Math.max(0, ms / (SECONDS_PER_DAY * 1000));
}

/** Serialize a directive row for the UI/agent, adding computed fields. */
export function serializeDirective(d: Directive, now: Date = new Date()) {
  return {
    ...d,
    tickers: Array.isArray(d.tickers) ? (d.tickers as string[]) : [],
    tags: Array.isArray(d.tags) ? (d.tags as string[]) : [],
    effectiveWeight: round(effectiveWeight(d, now), 4),
    remainingDays:
      d.status === "active" ? round(remainingDays(d, now) ?? 0, 3) : null,
    expiresAt:
      d.status === "active" || d.status === "paused" ? effectiveExpiry(d) : null,
  };
}

/** Append an immutable audit-log row. */
export function logEvent(
  directiveId: string,
  action: string,
  opts: {
    field?: string;
    oldValue?: string | null;
    newValue?: string | null;
    actor?: string | null;
    source?: string | null;
    reason?: string | null;
  } = {}
) {
  return prisma.directiveEvent.create({
    data: { directiveId, action, ...opts },
  });
}

/**
 * Flip overdue active directives to 'expired' (idempotent, lazy). Called on
 * reads so expiry happens without a cron. Returns the number expired.
 */
export async function sweepExpired(): Promise<number> {
  const actives = await prisma.directive.findMany({ where: { status: "active" } });
  const now = new Date();
  let count = 0;
  for (const d of actives) {
    if (now >= effectiveExpiry(d)) {
      await prisma.$transaction([
        prisma.directive.update({
          where: { id: d.id },
          data: { status: "expired" },
        }),
        prisma.directiveEvent.create({
          data: {
            directiveId: d.id,
            action: "expire",
            field: "status",
            oldValue: "active",
            newValue: "expired",
            reason: "ttl reached",
          },
        }),
      ]);
      count++;
    }
  }
  return count;
}

/** Transition helper for pause/resume/archive with freeze-the-clock accounting. */
export async function transitionStatus(
  id: string,
  newStatus: "paused" | "active" | "archived",
  opts: { actor?: string | null; source?: string | null; reason?: string | null } = {}
): Promise<Directive | null> {
  const d = await prisma.directive.findUnique({ where: { id } });
  if (!d) return null;
  const old = d.status;
  if (old === newStatus) return d;

  if (newStatus === "paused") {
    if (old !== "active") throw new Error(`cannot pause directive in status '${old}'`);
    await prisma.$transaction([
      prisma.directive.update({
        where: { id },
        data: { status: "paused", pausedAt: new Date() },
      }),
      logEvent(id, "pause", {
        field: "status",
        oldValue: old,
        newValue: "paused",
        ...opts,
      }),
    ]);
  } else if (newStatus === "active") {
    if (old !== "paused") throw new Error(`cannot resume directive in status '${old}'`);
    const pausedSince = d.pausedAt ?? new Date();
    const pausedSecs = Math.max(0, (new Date().getTime() - pausedSince.getTime()) / 1000);
    await prisma.$transaction([
      prisma.directive.update({
        where: { id },
        data: {
          status: "active",
          resumeAt: new Date(),
          pausedAt: null,
          totalPausedSeconds: { increment: pausedSecs },
        },
      }),
      logEvent(id, "resume", {
        field: "status",
        oldValue: old,
        newValue: "active",
        ...opts,
      }),
    ]);
  } else {
    // archived
    if (old === "archived") throw new Error("directive already archived");
    await prisma.$transaction([
      prisma.directive.update({ where: { id }, data: { status: "archived" } }),
      logEvent(id, "drop", {
        field: "status",
        oldValue: old,
        newValue: "archived",
        ...opts,
      }),
    ]);
  }
  return prisma.directive.findUnique({ where: { id } });
}
