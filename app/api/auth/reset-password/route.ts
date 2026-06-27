import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { token, password } = body;

  if (!token || !password) {
    return NextResponse.json({ error: 'Token and password required' }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  }

  try {
    // Use transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      const reset = await tx.passwordReset.findUnique({ where: { token } });

      if (!reset || reset.used || reset.expiresAt < new Date()) {
        return { error: 'Invalid or expired reset link', status: 400 };
      }

      const hash = bcrypt.hashSync(password, 10);

      await tx.user.update({
        where: { id: reset.userId },
        data: { password: hash },
      });

      await tx.passwordReset.update({
        where: { token },
        data: { used: true },
      });

      return { success: true };
    });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[reset-password] Error:', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
