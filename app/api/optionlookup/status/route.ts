import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET — Check whether the logged-in ThemeInvestor user is also registered on OptionLookup.
// Auth: NextAuth session (called by ThemeInvestor's own UI).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ registered: false }, { status: 401 });
  }

  const olUrl = process.env.OPTIONLOOKUP_INTERNAL_URL;
  const apiKey = process.env.CROSS_SITE_API_KEY;
  if (!olUrl || !apiKey) {
    return NextResponse.json({ registered: false });
  }

  try {
    const resp = await fetch(
      `${olUrl}/api/external/user-exists?email=${encodeURIComponent(session.user.email)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    if (!resp.ok) return NextResponse.json({ registered: false });
    const data = await resp.json();
    return NextResponse.json({ registered: data.exists === true });
  } catch {
    return NextResponse.json({ registered: false });
  }
}
