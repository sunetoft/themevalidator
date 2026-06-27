import type { MetadataRoute } from 'next'

const SITE_URL = 'https://themeinvestor.bunnystocks.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const routes = [
    { path: '', changeFrequency: 'daily' as const, priority: 1.0 },
    { path: '/themes', changeFrequency: 'daily' as const, priority: 0.9 },
    { path: '/analyze', changeFrequency: 'weekly' as const, priority: 0.8 },
    { path: '/dashboard', changeFrequency: 'daily' as const, priority: 0.7 },
    { path: '/about', changeFrequency: 'monthly' as const, priority: 0.5 },
  ]

  return routes.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }))
}
