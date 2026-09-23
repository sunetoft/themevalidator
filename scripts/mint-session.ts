/**
 * Mint a NextAuth v4 session JWT for local DOM/API verification.
 * Usage: npx tsx scripts/mint-session.ts <email>
 * Prints only the token (no secrets).
 */
import { readFileSync } from 'fs'
import { encode } from 'next-auth/jwt'

const env: Record<string, string> = {}
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
}

async function main() {
  const email = process.argv[2]
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()
  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true, email: true, name: true, role: true },
  })
  await prisma.$disconnect()
  if (!user) throw new Error(`No user with email ${email}`)

  const token = await encode({
    token: {
      sub: user.id,
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      picture: null,
    },
    secret: env.NEXTAUTH_SECRET,
    maxAge: 60 * 60,
    salt: '',
  })
  console.log(token)
}

main()
