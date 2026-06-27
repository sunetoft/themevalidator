'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { motion } from 'framer-motion'
import {
  Zap,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Target,
  BarChart3,
  Brain,
  ShieldCheck,
  Layers,
  LineChart,
  Globe,
  Search,
  PieChart,
  Check,
} from 'lucide-react'

export default function LandingClient() {
  const { data: session } = useSession()
  const isLoggedIn = !!session?.user

  const benefits = [
    {
      icon: Brain,
      title: 'AI-Powered Analysis',
      desc: 'Upload any investment thesis — a URL, PDF, or plain text — and get an instant multi-dimensional analysis powered by large language models.',
    },
    {
      icon: Layers,
      title: 'Ecosystem Mapping',
      desc: 'Automatically identify the key companies in a theme, their roles, competitive moats, and how they connect to each other.',
    },
    {
      icon: TrendingUp,
      title: 'Sentiment & Momentum',
      desc: 'Gauge market sentiment, news flow, and momentum signals across every stock in your theme basket.',
    },
    {
      icon: ShieldCheck,
      title: 'Risk Assessment',
      desc: 'Get a structured risk profile — bottlenecks, external factors, and valuation red flags — before you commit capital.',
    },
    {
      icon: Globe,
      title: 'Public Theme Gallery',
      desc: 'Browse analyses created by the community. See scores, stock baskets, and paper-trading results without signing up.',
    },
    {
      icon: BarChart3,
      title: 'Scored Across 5 Dimensions',
      desc: 'Every thesis is scored on sentiment, ecosystem strength, risk, opportunity, and moat — so you see the full picture at a glance.',
    },
  ]

  const memberFeatures = [
    {
      icon: Sparkles,
      title: 'AI-Generated Trading Strategies',
      desc: 'Turn any thesis into a concrete trading plan. Define your capital, risk profile, and let AI generate a stock-by-stock entry/exit strategy.',
    },
    {
      icon: Target,
      title: 'Paper Trade with Real Data',
      desc: 'Run up to 20 simultaneous paper trades using live market prices. Test your thesis with zero capital at risk.',
    },
    {
      icon: LineChart,
      title: 'Track P&L & Sharpe Ratios',
      desc: 'Monitor unrealized gains, position-level performance, and risk-adjusted returns with automatic Sharpe ratio calculation.',
    },
    {
      icon: PieChart,
      title: 'Basket Monitoring',
      desc: 'Watch every ticker in your trade basket with real-time price updates, order status, and per-stock performance metrics.',
    },
    {
      icon: Search,
      title: 'Deep-Dive Thesis Builder',
      desc: 'Upload research from any source — financial blogs, analyst PDFs, earnings transcripts. The AI extracts and structures the signal.',
    },
    {
      icon: Check,
      title: 'Full Access to All Themes',
      desc: 'Browse every public analysis, see detailed scores, view member stocks, and paper-trade on any theme in the gallery.',
    },
  ]

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Ambient glow backgrounds */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10">
        {/* ── 1. Hero Section ── */}
        <section className="hero-gradient relative py-24 md:py-32">
          <div className="container mx-auto max-w-4xl text-center px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 mb-6">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-primary">AI-Powered Investment Theme Analysis</span>
              </div>

              <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight mb-6">
                Validate Investment Themes
                <br />
                <span className="text-primary">Before You Commit Capital</span>
              </h1>

              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
                Upload any investment thesis and get instant AI-driven analysis, ecosystem mapping,
                risk scoring, and paper-trading strategies — all in one platform.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href={isLoggedIn ? '/dashboard' : '/auth'}
                  className="group inline-flex items-center gap-2 rounded-lg bg-primary px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-primary/20 hover:bg-primary transition-all active:scale-[0.98]"
                >
                  {isLoggedIn ? 'Go to Dashboard' : 'Get Started Free'}
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link
                  href="/themes"
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-7 py-3.5 text-base font-semibold hover:bg-muted transition-all active:scale-[0.98]"
                >
                  Browse Themes
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── 2. What is ThemeInvestor ── */}
        <section className="py-16 md:py-24">
          <div className="container mx-auto max-w-5xl px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="text-center mb-12"
            >
              <span className="font-mono text-sm tracking-widest uppercase text-primary">What is it</span>
                <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight mt-2 mb-4">
                What is ThemeInvestor?
              </h2>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-8 items-center">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="space-y-4 text-muted-foreground"
              >
                <p className="text-lg leading-relaxed">
                  ThemeInvestor is an AI-powered platform that helps you <span className="text-foreground font-medium">research, validate, and test</span> emerging investment themes before you put real money on the line.
                </p>
                <p className="text-base leading-relaxed">
                  Whether it's AI infrastructure, nuclear energy, GLP-1 pharmaceuticals, or space
                  economy — paste a research link, upload an analyst report, or write your own thesis.
                  The AI decomposes it into actionable intelligence:
                </p>
                <ul className="space-y-3 pt-2">
                  {[
                    'Sentiment analysis across news and market data',
                    'Ecosystem maps showing key players and their moats',
                    'Structured risk and valuation scoring',
                    'Identified stock baskets with per-company ratings',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="bg-card border border-border rounded-xl p-6 shadow-lg"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Brain className="w-5 h-5 text-primary" />
                  </div>
                  <span className="font-display font-semibold">Analysis Pipeline</span>
                </div>
                <div className="space-y-4">
                  {[
                    { step: '1', label: 'Input', desc: 'URL, PDF, or text', icon: Globe },
                    { step: '2', label: 'AI Analysis', desc: '5-dimension scoring', icon: Brain },
                    { step: '3', label: 'Ecosystem Map', desc: 'Stock basket + moats', icon: Layers },
                    { step: '4', label: 'Strategy', desc: 'Entry/exit plan per stock', icon: Target },
                    { step: '5', label: 'Paper Trade', desc: 'Test with live prices', icon: LineChart },
                  ].map((s) => {
                    const Icon = s.icon
                    return (
                      <div key={s.step} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold font-mono text-primary shrink-0">
                          {s.step}
                        </div>
                        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div>
                          <span className="text-sm font-medium">{s.label}</span>
                          <span className="text-sm text-muted-foreground"> — {s.desc}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── 3. Benefits for Investors ── */}
        <section className="py-16 md:py-24 bg-muted/30 border-y border-border/40">
          <div className="container mx-auto max-w-6xl px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="text-center mb-14"
            >
              <span className="font-mono text-sm tracking-widest uppercase text-primary">Why use it</span>
              <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight mt-2 mb-4">
                Benefits for Investors
              </h2>
              <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                Stop relying on gut feelings and hype. Get structured, data-driven analysis on every theme.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {benefits.map((b, i) => {
                const Icon = b.icon
                return (
                  <motion.div
                    key={b.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.05 }}
                    className="bg-card border border-border rounded-xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
                  >
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-display text-lg font-semibold mb-2">{b.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── 4. Member Features ── */}
        <section className="py-16 md:py-24">
          <div className="container mx-auto max-w-6xl px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="text-center mb-14"
            >
              <span className="font-mono text-sm tracking-widest uppercase text-primary">Membership</span>
              <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight mt-2 mb-4">
                What You Can Do as a Member
              </h2>
              <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                Unlock the full toolkit — from AI strategy generation to live paper trading with Sharpe ratio tracking.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {memberFeatures.map((f, i) => {
                const Icon = f.icon
                return (
                  <motion.div
                    key={f.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.05 }}
                    className="bg-card border border-border rounded-xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <h3 className="font-display text-base font-semibold">{f.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                  </motion.div>
                )
              })}
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="mt-12 text-center"
            >
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary transition-colors"
              >
                See full pricing details
                <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>
          </div>
        </section>

        {/* ── 5. CTA: Become a Member ── */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto max-w-4xl px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-10 md:p-16 text-center"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10">
                <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight mb-4">
                  Become a Member Now
                </h2>
                <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
                  Start validating investment themes with AI today. Create unlimited strategies,
                  run paper trades, and track real performance — all in one platform.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link
                    href={isLoggedIn ? '/pricing' : '/auth'}
                    className="group inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-4 text-base font-semibold text-white shadow-xl shadow-primary/20 hover:bg-primary transition-all active:scale-[0.98]"
                  >
                    {isLoggedIn ? 'View Membership Plans' : 'Get Started Now'}
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                  {!isLoggedIn && (
                    <Link
                      href="/themes"
                      className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Or browse public themes first
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      </div>
    </div>
  )
}
