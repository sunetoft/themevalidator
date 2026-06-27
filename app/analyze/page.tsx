'use client'

import { useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Globe, FileText, Upload, ArrowRight, Loader2, CheckCircle2,
  AlertCircle, Sparkles, Link2
} from 'lucide-react'
import { toast } from 'sonner'

type InputMode = 'text' | 'url' | 'pdf'

export default function AnalyzePage() {
  const { data: session } = useSession() || {}
  const router = useRouter()
  const [inputMode, setInputMode] = useState<InputMode>('text')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState('')
  const [progressPct, setProgressPct] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAnalyze = async () => {
    if (inputMode === 'text' && !text.trim()) {
      toast.error('Please enter your investment thesis')
      return
    }
    if (inputMode === 'url' && !url.trim()) {
      toast.error('Please enter a URL')
      return
    }
    if (inputMode === 'pdf' && !file) {
      toast.error('Please upload a PDF file')
      return
    }

    setAnalyzing(true)
    setProgress('Initiating analysis...')
    setProgressPct(5)

    try {
      let body: any
      let headers: Record<string, string> = {}

      if (inputMode === 'pdf' && file) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('inputType', 'pdf')
        body = formData
      } else if (inputMode === 'url') {
        body = JSON.stringify({ inputType: 'url', url, text: `Analyze the investment thesis from this URL: ${url}` })
        headers['Content-Type'] = 'application/json'
      } else {
        body = JSON.stringify({ inputType: 'text', text })
        headers['Content-Type'] = 'application/json'
      }

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers,
        body,
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData?.error ?? `Analysis failed (${response.status})`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('Failed to read response stream')

      const decoder = new TextDecoder()
      let partialRead = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        partialRead += decoder.decode(value, { stream: true })
        const lines = partialRead.split('\n')
        partialRead = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              if (parsed?.status === 'processing') {
                setProgress(parsed?.message ?? 'Processing...')
                setProgressPct((prev) => Math.min(prev + 8, 92))
              } else if (parsed?.status === 'completed') {
                setProgress('Analysis complete!')
                setProgressPct(100)
                toast.success('Analysis complete!')
                setTimeout(() => {
                  router.push(`/thesis/${parsed?.thesisId}`)
                }, 500)
                return
              } else if (parsed?.status === 'error') {
                throw new Error(parsed?.message ?? 'Analysis failed')
              }
            } catch (e: any) {
              if (e?.message && !e.message.includes('JSON')) {
                throw e
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error('Analysis error:', err)
      toast.error(err?.message ?? 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  const modes: Array<{ key: InputMode; icon: any; label: string; desc: string }> = [
    { key: 'text', icon: FileText, label: 'Text Input', desc: 'Paste your investment thesis directly' },
    { key: 'url', icon: Globe, label: 'Article URL', desc: 'Extract and analyze from a URL' },
    { key: 'pdf', icon: Upload, label: 'PDF Upload', desc: 'Upload a research document' },
  ]

  return (
    <div className="min-h-screen bg-background">
            <main className="max-w-[800px] mx-auto px-4 py-8">
        <div className="animate-fade-in">
          <h1 className="font-display text-3xl font-bold tracking-tight mb-2">
            New <span className="text-primary">Theme</span> Analysis
          </h1>
          <p className="text-muted-foreground mb-8">Submit an investment thesis for comprehensive AI-powered validation.</p>
        </div>

        {/* Input mode selector */}
        <div className="grid grid-cols-3 gap-3 mb-6 animate-fade-in-d1">
          {modes.map((mode: any) => (
            <button
              key={mode.key}
              onClick={() => setInputMode(mode.key)}
              className={`p-4 rounded-xl border text-left transition-all ${
                inputMode === mode.key
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:border-primary/30'
              }`}
              style={{ boxShadow: 'var(--shadow-sm)' }}
            >
              <mode.icon className={`w-5 h-5 mb-2 ${inputMode === mode.key ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className="font-medium text-sm">{mode.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{mode.desc}</p>
            </button>
          ))}
        </div>

        {/* Input area */}
        <div
          className="bg-card border border-border rounded-xl p-6 mb-6 animate-fade-in-d2"
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          {inputMode === 'text' && (
            <div>
              <label className="block text-sm font-medium mb-2">Investment Thesis</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Describe the emerging investment theme you want to validate. For example: 'Photonics is poised for massive growth as AI models require faster, more energy-efficient interconnects. Silicon photonics companies that enable optical computing in data centers will benefit from the exponential growth in AI inference workloads...'"
                className="w-full h-48 px-4 py-3 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none"
              />
              <p className="text-xs text-muted-foreground mt-2">{(text?.length ?? 0).toLocaleString()} characters</p>
            </div>
          )}

          {inputMode === 'url' && (
            <div>
              <label className="block text-sm font-medium mb-2">Article URL</label>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/article-about-quantum-computing-investment"
                  className="w-full pl-10 pr-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">The AI will extract and analyze the content from this URL.</p>
            </div>
          )}

          {inputMode === 'pdf' && (
            <div>
              <label className="block text-sm font-medium mb-2">Upload PDF Document</label>
              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`w-full py-12 border-2 border-dashed rounded-xl transition-all flex flex-col items-center gap-2 ${
                  file
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border hover:border-primary/30 hover:bg-muted/30'
                }`}
              >
                {file ? (
                  <>
                    <CheckCircle2 className="w-8 h-8 text-primary" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Click to upload a PDF research document</span>
                    <span className="text-xs text-muted-foreground">Max 100MB</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Analyze button */}
        <div className="animate-fade-in-d3">
          {analyzing ? (
            <div className="bg-card border border-primary/30 rounded-xl p-6" style={{ boxShadow: 'var(--shadow-md)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                </div>
                <div>
                  <p className="font-medium text-sm">Analyzing thesis...</p>
                  <p className="text-xs text-muted-foreground">{progress}</p>
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <motion.div
                  className="bg-primary h-2 rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
          ) : (
            <button
              onClick={handleAnalyze}
              className="w-full py-3 bg-primary hover:bg-primary text-white font-medium rounded-xl text-sm transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Analyze Investment Theme
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Info cards */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in-d4">
          {[
            { title: 'Sentiment Analysis', desc: 'Real-time social media sentiment from X/Twitter' },
            { title: 'Ecosystem Mapping', desc: 'Identify key companies and their roles' },
            { title: 'Bottleneck Analysis', desc: 'Find pricing power opportunities' },
            { title: 'Valuation & Moat', desc: 'Discover undervalued companies with strong moats' },
          ].map((item: any, i: number) => (
            <div key={i} className="bg-muted/30 rounded-lg p-4 border border-border/50">
              <p className="text-sm font-medium mb-1">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
