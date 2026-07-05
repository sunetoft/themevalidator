// Quick integration test: fetch a completed thesis and sync it to FalkorDB
const { prisma } = require('./lib/prisma')
const { syncThesisToGraph, closeFalkorDB } = require('./lib/falkordb')

async function main() {
  // Find a completed thesis with ecosystem data
  const theses = await prisma.thesis.findMany({
    where: { status: 'completed' },
    include: { theme: { select: { name: true, description: true } } },
    take: 3,
    orderBy: { createdAt: 'desc' },
  })

  console.log(`Found ${theses.length} completed theses`)

  for (const thesis of theses) {
    const eco = thesis.ecosystemData || {}
    console.log(`\n--- ${thesis.title} ---`)
    console.log(`  Theme: ${eco.themeName || thesis.theme?.name || 'N/A'}`)
    console.log(`  Members: ${eco.members?.length || 0}`)
    console.log(`  Bottlenecks: ${thesis.bottlenecks?.items?.length || 0}`)
    console.log(`  Top picks: ${thesis.valuationData?.topPicks?.length || 0}`)

    // Sync to FalkorDB
    const result = await syncThesisToGraph({
      id: thesis.id,
      title: thesis.title,
      description: thesis.description,
      themeId: thesis.themeId,
      sentimentData: thesis.sentimentData,
      ecosystemData: thesis.ecosystemData,
      externalFactors: thesis.externalFactors,
      bottlenecks: thesis.bottlenecks,
      valuationData: thesis.valuationData,
      financialData: thesis.financialData,
      theme: thesis.theme
        ? { name: thesis.theme.name, description: thesis.theme.description }
        : undefined,
    })

    console.log(`  Sync result:`, result)
  }

  await closeFalkorDB()
  await prisma.$disconnect()
}

main().catch(console.error)
