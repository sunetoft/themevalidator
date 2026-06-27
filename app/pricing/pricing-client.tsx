'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Zap, Check, TrendingUp, Target, BarChart3, ArrowRight, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

export default function PricingClient({
  session,
  hasSubscription,
  price,
  interval,
  productName,
}: {
  session: boolean
  hasSubscription: boolean
  price: string
  interval: string
  productName: string
}) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubscribe = async () => {
    if (!session) {
      router.push('/auth?callbackUrl=/pricing')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
      const data = await res.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        toast.error(data.error || 'Failed to start checkout')
      }
    } catch {
      toast.error('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const features = [
    { icon: Target, text: 'Create unlimited trading strategies on any theme' },
    { icon: TrendingUp, text: 'Run up to 20 paper trades (baskets of stocks)' },
    { icon: BarChart3, text: 'Track P&L, Sharpe ratios, and position performance' },
    { icon: Sparkles, text: 'AI-generated strategy recommendations per theme' },
    { icon: Check, text: 'Browse all public themes & paper trade results' },
  ]

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />

      <div className="relative z-10 container mx-auto max-w-4xl py-20 px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className="font-display text-2xl font-bold tracking-tight">ThemeInvestor</span>
          </div>
          <h1 className="text-4xl font-bold mb-3">Upgrade to Pro</h1>
          <p className="text-muted-foreground text-lg">
            Create strategies and run paper trades on every investment theme
          </p>
        </div>

        {/* Pricing card */}
        <div className="max-w-md mx-auto">
          <div className="bg-card border-2 border-primary/50 rounded-2xl p-8 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-bold px-4 py-1 rounded-full">
              PRO MEMBERSHIP
            </div>

            <div className="text-center mb-8 mt-4">
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-5xl font-bold">{price}</span>
                <span className="text-muted-foreground">/{interval}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Cancel anytime · Secure payment via Stripe
              </p>
            </div>

            <div className="space-y-3 mb-8">
              {features.map((f, i) => (
                <div key={i} className="flex items-start gap-3">
                  <f.icon className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{f.text}</span>
                </div>
              ))}
            </div>

            {hasSubscription ? (
              <button
                onClick={() => router.push('/dashboard')}
                className="w-full py-3 bg-primary text-white font-medium rounded-lg text-sm flex items-center justify-center gap-2"
              >
                You're Pro — Go to Dashboard
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubscribe}
                disabled={loading}
                className="w-full py-3 bg-primary hover:bg-primary text-white font-medium rounded-lg text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    {session ? 'Subscribe Now' : 'Sign In to Subscribe'}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>

          {!session && (
            <p className="text-center text-sm text-muted-foreground mt-6">
              Already have an account?{' '}
              <button onClick={() => signIn()} className="text-primary hover:underline font-medium">
                Sign in
              </button>
            </p>
          )}

          <div className="text-center mt-4">
            <a href="/themes" className="text-sm text-muted-foreground hover:text-foreground">
              Browse themes for free →
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
