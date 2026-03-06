'use client'

import { useState, useEffect } from 'react'
import { Loader2, Bookmark, Sparkles, CheckCircle } from 'lucide-react'
import type { Node, Edge } from '@xyflow/react'
import dynamic from 'next/dynamic'

const MindmapCanvas = dynamic(
  () => import('@/components/mindmap/mindmap-canvas'),
  { ssr: false, loading: () => <CanvasLoader /> }
)

interface MindmapData {
  nodes: Node[]
  edges: Edge[]
}

interface CategoryLegendItem {
  name: string
  color: string
  slug: string
}

function CanvasLoader() {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <Loader2 size={32} className="text-indigo-400 animate-spin" />
    </div>
  )
}

function Legend({ categories }: { categories: CategoryLegendItem[] }) {
  if (categories.length === 0) return null

  return (
    <div className="absolute top-4 left-4 z-10 bg-zinc-900/90 backdrop-blur-sm border border-zinc-800 rounded-xl p-4 max-w-52">
      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Categories</p>
      <div className="space-y-2">
        {categories.map((cat) => (
          <div key={cat.slug} className="flex items-center gap-2">
            <Bookmark size={12} className="shrink-0" style={{ color: cat.color, fill: cat.color }} />
            <span className="text-xs text-zinc-300 truncate">{cat.name}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-zinc-600 mt-3">Click a category to expand</p>
    </div>
  )
}

function extractLegend(nodes: Node[]): CategoryLegendItem[] {
  return nodes
    .filter((n) => n.type === 'category')
    .map((n) => {
      const d = n.data as { name: string; color: string; slug: string }
      return { name: d.name, color: d.color, slug: d.slug }
    })
}

type CategorizeStage = 'vision' | 'entities' | 'enrichment' | 'categorize' | null

interface CategorizeStatus {
  status: 'idle' | 'running' | 'stopping'
  stage: CategorizeStage
  done: number
  total: number
}

const STAGE_LABELS: Record<NonNullable<CategorizeStage>, string> = {
  entities: 'Extracting entities…',
  vision: 'Analyzing images…',
  enrichment: 'Generating semantic tags…',
  categorize: 'Categorizing bookmarks…',
}

function UncategorizedState({ totalBookmarks }: { totalBookmarks: number }) {
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [status, setStatus] = useState<CategorizeStatus | null>(null)
  const [error, setError] = useState('')

  async function startCategorization() {
    setError('')
    setRunning(true)
    try {
      const res = await fetch('/api/categorize', { method: 'POST' })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? 'Failed to start')
      }
      pollStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start')
      setRunning(false)
    }
  }

  function pollStatus() {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/categorize')
        const data = await res.json() as CategorizeStatus
        setStatus(data)
        if (data.status === 'idle') {
          clearInterval(interval)
          setDone(true)
          setRunning(false)
          // Reload to show the populated mindmap
          setTimeout(() => window.location.reload(), 800)
        }
      } catch {
        clearInterval(interval)
        setRunning(false)
      }
    }, 1500)
  }

  const progress = status?.stage === 'categorize' && status.total > 0
    ? Math.round((status.done / status.total) * 100)
    : null

  const stageLabel = status?.stage ? STAGE_LABELS[status.stage] : 'Starting…'

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3">
        <CheckCircle size={36} className="text-emerald-400" />
        <p className="text-zinc-200 font-semibold">Categorization complete!</p>
        <p className="text-zinc-500 text-sm">Loading your mindmap…</p>
        <Loader2 size={18} className="text-indigo-400 animate-spin mt-1" />
      </div>
    )
  }

  if (running) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <Loader2 size={36} className="text-indigo-400 animate-spin" />
        <div>
          <p className="text-zinc-200 font-semibold">{stageLabel}</p>
          {status?.stage === 'categorize' && status.total > 0 && (
            <p className="text-zinc-500 text-sm mt-1">
              {status.done} / {status.total} bookmarks
              {progress !== null && ` (${progress}%)`}
            </p>
          )}
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-5 text-center max-w-sm">
      <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
        <Sparkles size={28} className="text-indigo-400" />
      </div>
      <div>
        <p className="text-xl font-semibold text-zinc-100">Bookmarks not categorized yet</p>
        <p className="text-zinc-500 text-sm mt-1.5 leading-relaxed">
          You have <span className="text-zinc-300 font-medium">{totalBookmarks.toLocaleString()}</span> bookmarks imported.
          Run AI categorization to populate the mindmap.
        </p>
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        onClick={() => void startCategorization()}
        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
      >
        <Sparkles size={16} />
        Start AI Categorization
      </button>
    </div>
  )
}

export default function MindmapPage() {
  const [data, setData] = useState<MindmapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [totalBookmarks, setTotalBookmarks] = useState(0)

  useEffect(() => {
    Promise.all([
      fetch('/api/mindmap').then((r) => {
        if (!r.ok) throw new Error('Failed to load mindmap')
        return r.json() as Promise<MindmapData>
      }),
      fetch('/api/stats').then((r) => r.json() as Promise<{ totalBookmarks?: number }>),
    ])
      .then(([mindmapData, stats]) => {
        setData(mindmapData)
        setTotalBookmarks(stats.totalBookmarks ?? 0)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen w-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="text-indigo-400 animate-spin" />
          <p className="text-zinc-400 text-sm">Loading mindmap...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen w-full">
        <p className="text-zinc-400">{error}</p>
      </div>
    )
  }

  // Bookmarks exist but nothing is categorized yet → show AI categorize CTA
  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen w-full">
        {totalBookmarks > 0 ? (
          <UncategorizedState totalBookmarks={totalBookmarks} />
        ) : (
          <div className="text-center">
            <p className="text-xl font-semibold text-zinc-400">No data to display</p>
            <p className="text-zinc-600 text-sm mt-1">Import and categorize bookmarks first.</p>
          </div>
        )}
      </div>
    )
  }

  const legend = extractLegend(data.nodes)

  return (
    <div className="relative w-full h-screen">
      <Legend categories={legend} />
      <MindmapCanvas initialNodes={data.nodes} initialEdges={data.edges} />
    </div>
  )
}
