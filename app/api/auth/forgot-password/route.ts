import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendAndLog, forgotPasswordEmail } from '@/lib/email';

const APP_URL = process.env.NEXTAUTH_URL || 'https://themeinvestor.bunnystocks.com';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = (body.email as string | undefined)?.toLowerCase();

  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    // Skip Google-only accounts (no password set)
    if (!user || !user.password) {
      return NextResponse.json({ success: true });
    }

    // Create reset token — double UUID for length + randomness
    const token = crypto.randomUUID() + crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

    await prisma.passwordReset.create({
      data: { token, userId: user.id, expiresAt },
    });

    const resetUrl = `${APP_URL}/reset-password?token=${token}`;
    const template = forgotPasswordEmail(user.name || '', resetUrl);

    await sendAndLog(
      user.email,
      template.subject,
      template.html,
      template.text,
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[forgot-password] Error:', err);
    // Still return success to prevent enumeration
    return NextResponse.json({ success: true });
  }
}
