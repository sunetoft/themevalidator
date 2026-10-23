import { prisma } from '../lib/prisma'

async function main() {
  const id = process.argv[2]
  const t = await prisma.thesis.findUnique({ where: { id }, select: { title: true, timelineData: true } })
  console.log(t?.title)
  console.log(JSON.stringify(t?.timelineData, null, 2))
  await prisma.$disconnect()
}

main()
