'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Settings,
  User,
  Mail,
  Calendar,
  Crown,
  Shield,
  TrendingUp,
  ExternalLink,
  Clock,
  ArrowLeft,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

interface SubscriptionInfo {
  isSubscribed: boolean
  isActive: boolean
  status: string | null
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
  activePaperTrades: number
  paperTradeLimit: number
  isAdmin: boolean
}

export default function SettingsPage() {
  const { data: session, status: sessionStatus, update } = useSession()
  const router = useRouter()
  const [subInfo, setSubInfo] = useState<SubscriptionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)

  // Editable name state
  const [editName, setEditName] = useState('')
  const [savingName, setSavingName] = useState(false)

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/auth?callbackUrl=/settings')
      return
    }
    if (sessionStatus === 'authenticated') {
      fetchSubscription()
      // Initialise editable name from session
      const currentName = (session?.user as any)?.name || ''
      setEditName(currentName)
    }
  }, [sessionStatus])

  async function fetchSubscription() {
    try {
      const res = await fetch('/api/subscription')
      const data = await res.json()
      setSubInfo(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  async function handleManageSubscription() {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        toast.error(data.error || 'Failed to open billing portal')
      }
    } catch {
      toast.error('Something went wrong')
    } finally {
      setPortalLoading(false)
    }
  }

  async function handleSaveName() {
    const trimmed = editName.trim()
    const currentName = (session?.user as any)?.name || ''
    if (trimmed === currentName) {
      toast.info('No changes to save')
      return
    }

    setSavingName(true)
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to save settings')
        return
      }
      // Update the client-side session so header etc. reflect the new name
      await update({ name: trimmed })
      toast.success('Settings saved successfully')
    } catch {
      toast.error('Something went wrong')
    } finally {
      setSavingName(false)
    }
  }

  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!session) return null

  const user = session.user as any
  const isPro = subInfo?.isActive

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-12">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">User Settings</h1>
              <p className="text-sm text-muted-foreground">Manage your account and subscription</p>
            </div>
          </div>
        </motion.div>

        {/* Profile card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-6 rounded-2xl border border-border bg-card p-6"
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Profile
          </h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Name
              </label>
              <div className="flex items-center gap-3">
                <div className="flex flex-1 items-center gap-3">
                  <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !savingName) handleSaveName()
                    }}
                    placeholder="Your name"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
                <button
                  onClick={handleSaveName}
                  disabled={savingName}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {savingName ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Save'
                  )}
                </button>
              </div>
            </div>
            <div className="border-t border-border" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Email</span>
              </div>
              <span className="text-sm font-medium text-foreground">{user?.email}</span>
            </div>
            <div className="border-t border-border" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Account Type</span>
              </div>
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {user?.role === 'admin' ? (
                  <>
                    <Shield className="h-3.5 w-3.5 text-accent" />
                    <span className="text-accent">Admin</span>
                  </>
                ) : isPro ? (
                  <>
                    <Crown className="h-3.5 w-3.5 text-accent" />
                    <span className="text-accent">Pro Member</span>
                  </>
                ) : (
                  <span className="text-foreground">Free</span>
                )}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Subscription card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6 rounded-2xl border border-border bg-card p-6"
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Subscription
          </h2>

          {isPro ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-accent/5 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
                  <Crown className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Pro Membership</p>
                  <p className="text-sm text-muted-foreground">
                    {subInfo?.cancelAtPeriodEnd
                      ? 'Cancels at end of billing period'
                      : 'Active — renews automatically'}
                  </p>
                </div>
              </div>

              {subInfo?.currentPeriodEnd && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {subInfo.cancelAtPeriodEnd ? 'Expires' : 'Renews'}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {new Date(subInfo.currentPeriodEnd).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Paper Trades</span>
                </div>
                <span className="text-sm font-medium text-foreground">
                  {subInfo?.activePaperTrades ?? 0} / {subInfo?.paperTradeLimit ?? 20} used
                </span>
              </div>

              <div className="border-t border-border pt-4">
                <button
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {portalLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                  Manage Subscription
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Crown className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Free Account</p>
                  <p className="text-sm text-muted-foreground">
                    Upgrade to Pro to create strategies and run paper trades
                  </p>
                </div>
              </div>

              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:brightness-110"
              >
                <Crown className="h-4 w-4" />
                Upgrade to Pro
              </Link>
            </div>
          )}
        </motion.div>

        {/* Quick links card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-border bg-card p-6"
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Quick Links
          </h2>
          <div className="space-y-2">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <TrendingUp className="h-4 w-4" />
              Dashboard
            </Link>
            {user?.role === 'admin' && (
              <Link
                href="/admin"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Shield className="h-4 w-4" />
                Admin Panel
              </Link>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
