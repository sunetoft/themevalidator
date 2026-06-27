'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users as UsersIcon, Trash2, UserPlus, Shield, Loader2, Mail, X,
  ChevronDown, AlertTriangle, KeyRound
} from 'lucide-react'
import { toast } from 'sonner'

interface UserItem {
  id: string
  name: string | null
  email: string
  role: string
  createdAt: string
  updatedAt: string
  _count: {
    theses: number
    paperTrades: number
    tradeStrategies: number
    sessions: number
    accounts: number
  }
}

export default function UsersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Create form state
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('user')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth')
    }
  }, [status, router])

  useEffect(() => {
    if (session) {
      fetchUsers()
    }
  }, [session])

  async function fetchUsers() {
    setLoading(true)
    try {
      const res = await fetch('/api/users')
      if (res.status === 403) {
        toast.error('Admin access required')
        router.push('/dashboard')
        return
      }
      const data = await res.json()
      setUsers(data.users || [])
    } catch {
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!newEmail || !newPassword) {
      toast.error('Email and password are required')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newPassword, name: newName, role: newRole }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to create user')
        return
      }
      toast.success(`User ${newEmail} created`)
      setShowCreate(false)
      setNewEmail('')
      setNewName('')
      setNewPassword('')
      setNewRole('user')
      fetchUsers()
    } catch {
      toast.error('Failed to create user')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to delete user')
        return
      }
      toast.success(`User ${deleteTarget.email} permanently deleted — all data removed`)
      setDeleteTarget(null)
      fetchUsers()
    } catch {
      toast.error('Failed to delete user')
    } finally {
      setDeleting(false)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-background">
                <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
            <div className="container mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5">
              <UsersIcon className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">User Management</h1>
              <p className="text-sm text-muted-foreground">
                {users.length} user{users.length !== 1 ? 's' : ''} · Delete permanently removes all data
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <UserPlus className="h-4 w-4" />
            New User
          </button>
        </div>

        {/* Warning banner */}
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-amber-500">Hard delete only.</span>{' '}
            Deleting a user permanently removes all their theses, strategies, paper trades, orders, positions,
            snapshots, and session data. The email is immediately freed for re-registration. There is no undo.
          </div>
        </div>

        {/* Users table */}
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Data</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Created</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = session?.user && (session.user as any).id === user.id
                return (
                  <tr key={user.id} className="border-b border-border/50 last:border-0 transition-colors hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                          {(user.name || user.email)[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium">
                            {user.name || '—'}
                            {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {user.role === 'admin' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          <Shield className="h-3 w-3" />
                          Admin
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">User</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {user._count.theses > 0 && <span className="rounded bg-muted px-1.5 py-0.5">{user._count.theses} theses</span>}
                        {user._count.paperTrades > 0 && <span className="rounded bg-muted px-1.5 py-0.5">{user._count.paperTrades} trades</span>}
                        {user._count.tradeStrategies > 0 && <span className="rounded bg-muted px-1.5 py-0.5">{user._count.tradeStrategies} strategies</span>}
                        {user._count.theses === 0 && user._count.paperTrades === 0 && user._count.tradeStrategies === 0 && (
                          <span className="text-muted-foreground/50">No data</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setDeleteTarget(user)}
                        disabled={isSelf}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-30"
                        title={isSelf ? 'Cannot delete your own account' : 'Permanently delete user'}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create user modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <UserPlus className="h-5 w-5 text-primary" />
                  Create User
                </h2>
                <button onClick={() => setShowCreate(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    placeholder="Jane Doe"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    placeholder="jane@example.com"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Role</label>
                  <div className="relative">
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !newEmail || !newPassword}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Create
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-full bg-red-500/10 p-2.5">
                  <AlertTriangle className="h-6 w-6 text-red-500" />
                </div>
                <h2 className="text-lg font-bold">Permanently Delete User?</h2>
              </div>

              <p className="mb-4 text-sm text-muted-foreground">
                This will <span className="font-semibold text-foreground">irrevocably</span> delete:
              </p>

              <div className="mb-5 space-y-2 rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                    {(deleteTarget.name || deleteTarget.email)[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{deleteTarget.name || '—'}</div>
                    <div className="text-xs text-muted-foreground">{deleteTarget.email}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-2 text-xs">
                  {deleteTarget._count.theses > 0 && (
                    <span className="rounded bg-red-500/10 px-2 py-0.5 text-red-400">{deleteTarget._count.theses} theses</span>
                  )}
                  {deleteTarget._count.tradeStrategies > 0 && (
                    <span className="rounded bg-red-500/10 px-2 py-0.5 text-red-400">{deleteTarget._count.tradeStrategies} strategies</span>
                  )}
                  {deleteTarget._count.paperTrades > 0 && (
                    <span className="rounded bg-red-500/10 px-2 py-0.5 text-red-400">{deleteTarget._count.paperTrades} paper trades</span>
                  )}
                  {deleteTarget._count.sessions > 0 && (
                    <span className="rounded bg-red-500/10 px-2 py-0.5 text-red-400">{deleteTarget._count.sessions} sessions</span>
                  )}
                  {deleteTarget._count.accounts > 0 && (
                    <span className="rounded bg-red-500/10 px-2 py-0.5 text-red-400">{deleteTarget._count.accounts} accounts</span>
                  )}
                </div>
                <p className="pt-1 text-xs text-muted-foreground">
                  The email <span className="font-medium text-foreground">{deleteTarget.email}</span> will be immediately available for re-registration.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete Permanently
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
