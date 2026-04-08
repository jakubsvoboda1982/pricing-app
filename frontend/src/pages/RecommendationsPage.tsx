import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle, XCircle, AlertCircle, TrendingUp, TrendingDown,
  Play, Clock, ThumbsUp, Zap, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react'
import { apiClient } from '@/api/client'

interface Recommendation {
  id: string
  product_id: string
  product_name: string | null
  recommended_price_without_vat: number
  recommended_price_with_vat: number
  current_price_with_vat: number | null
  margin_change_percent: number | null
  expected_revenue_impact_percent: number | null
  status: string
  reasoning: {
    type?: string
    text?: string
    confidence?: number
    competitors_avg?: number | null
    competitors_count?: number
    current_price?: number | null
  } | null
  created_at: string
  approved_at: string | null
  applied_at: string | null
}

const REC_TYPE_LABEL: Record<string, { label: string; color: string }> = {
  raise:        { label: 'Zdraž',          color: 'bg-green-100 text-green-700'  },
  lower:        { label: 'Zlevni',          color: 'bg-blue-100 text-blue-700'   },
  floor_alert:  { label: 'Floor alert',     color: 'bg-red-100 text-red-700'     },
  minor_raise:  { label: 'Mírné zvýšení',  color: 'bg-teal-100 text-teal-700'   },
  cost_plus:    { label: 'Cost-plus',       color: 'bg-purple-100 text-purple-700'},
  set_price:    { label: 'Nastavit cenu',   color: 'bg-orange-100 text-orange-700'},
  no_data:      { label: 'Bez dat',         color: 'bg-gray-100 text-gray-500'   },
}

export default function RecommendationsPage() {
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'applied' | 'rejected'>('pending')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [genAllLoading, setGenAllLoading] = useState(false)
  const [genAllResult, setGenAllResult] = useState<{ generated: number; skipped: number } | null>(null)
  const qc = useQueryClient()

  const { data: recommendations = [], isLoading } = useQuery({
    queryKey: ['recommendations', activeTab],
    queryFn: () => apiClient.listRecommendations(activeTab),
  })

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.approveRecommendation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recommendations'] }),
  })
  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiClient.rejectRecommendation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recommendations'] }),
  })
  const applyMutation = useMutation({
    mutationFn: (id: string) => apiClient.applyRecommendation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recommendations'] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })

  const recs = recommendations as Recommendation[]

  const counts = {
    pending:  recs.filter(r => r.status === 'pending').length,
    approved: recs.filter(r => r.status === 'approved').length,
    applied:  recs.filter(r => r.status === 'applied').length,
    rejected: recs.filter(r => r.status === 'rejected').length,
  }

  const tabs = [
    { id: 'pending',  label: 'Čekající',   icon: Clock,       color: 'text-yellow-600', bg: 'bg-yellow-100' },
    { id: 'approved', label: 'Schválené',  icon: ThumbsUp,    color: 'text-blue-600',   bg: 'bg-blue-100'   },
    { id: 'applied',  label: 'Aplikované', icon: CheckCircle, color: 'text-green-600',  bg: 'bg-green-100'  },
    { id: 'rejected', label: 'Zamítnuté',  icon: XCircle,     color: 'text-red-600',    bg: 'bg-red-100'    },
  ] as const

  const handleGenerateAll = async () => {
    setGenAllLoading(true)
    setGenAllResult(null)
    try {
      const res = await apiClient.generateAllRecommendations()
      setGenAllResult(res)
      qc.invalidateQueries({ queryKey: ['recommendations'] })
    } catch (e: any) {
      alert(e?.message || 'Chyba při generování')
    } finally {
      setGenAllLoading(false)
    }
  }

  return (
    <div className="space-y-5 max-w-5xl">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Doporučení cen</h1>
          <p className="text-sm text-gray-400 mt-0.5">Analýza a schvalování doporučených změn cen</p>
        </div>
        <button
          onClick={handleGenerateAll}
          disabled={genAllLoading}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex-shrink-0"
        >
          {genAllLoading
            ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generuji…</>
            : <><Zap size={15} /> Generovat pro všechny</>
          }
        </button>
      </div>

      {genAllResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 flex items-center gap-2">
          <CheckCircle size={15} className="flex-shrink-0" />
          Vygenerováno {genAllResult.generated} nových doporučení
          {genAllResult.skipped > 0 && ` · ${genAllResult.skipped} přeskočeno (již čeká)`}
        </div>
      )}

      {/* ── KPI STRIP ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tabs.map(tab => {
          const Icon = tab.icon
          const count = counts[tab.id]
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`text-left border rounded-xl p-4 transition ${
                activeTab === tab.id ? 'border-blue-300 shadow-sm bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{tab.label}</p>
                <span className={`w-7 h-7 rounded-full flex items-center justify-center ${tab.bg}`}>
                  <Icon size={13} className={tab.color} />
                </span>
              </div>
              <p className={`text-2xl font-bold ${count > 0 && tab.id === 'pending' ? 'text-yellow-600' : 'text-gray-900'}`}>
                {count}
              </p>
            </button>
          )
        })}
      </div>

      {/* ── TAB BAR ────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}>
            {tab.label}
            {counts[tab.id] > 0 && (
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {counts[tab.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── LIST ───────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">
          Načítám…
        </div>
      ) : recs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <AlertCircle size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-gray-500 font-medium">
            Žádná doporučení v kategorii „{tabs.find(t => t.id === activeTab)?.label}"
          </p>
          {activeTab === 'pending' && (
            <p className="text-xs text-gray-400 mt-1">
              Klikni na „Generovat pro všechny" nebo otevři detail produktu
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {recs.map(rec => {
            const priceDiff = rec.current_price_with_vat != null
              ? rec.recommended_price_with_vat - rec.current_price_with_vat : null
            const priceDiffPct = rec.current_price_with_vat && priceDiff != null
              ? (priceDiff / rec.current_price_with_vat) * 100 : null
            const isIncrease = priceDiff != null && priceDiff > 0
            const recTypeInfo = rec.reasoning?.type ? REC_TYPE_LABEL[rec.reasoning.type] : null
            const isExpanded = expandedId === rec.id
            const confidence = rec.reasoning?.confidence ?? null

            return (
              <div key={rec.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-4 p-4">

                  {/* Price comparison */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 uppercase mb-0.5">Aktuální</p>
                      <p className="text-base font-bold text-gray-600">
                        {rec.current_price_with_vat != null ? `${rec.current_price_with_vat.toFixed(0)} Kč` : '—'}
                      </p>
                    </div>
                    <div className="flex flex-col items-center px-1">
                      {isIncrease
                        ? <TrendingUp size={14} className="text-green-500" />
                        : priceDiff != null
                        ? <TrendingDown size={14} className="text-blue-400" />
                        : null}
                      {priceDiffPct != null && (
                        <span className={`text-[10px] font-medium ${isIncrease ? 'text-green-600' : 'text-blue-600'}`}>
                          {isIncrease ? '+' : ''}{priceDiffPct.toFixed(1)} %
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase mb-0.5">Doporučení</p>
                      <p className="text-base font-bold text-blue-700">{rec.recommended_price_with_vat.toFixed(0)} Kč</p>
                    </div>
                  </div>

                  {/* Product + badges */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800 truncate">
                        {rec.product_name || `Produkt ${rec.product_id.slice(0, 8)}…`}
                      </span>
                      {recTypeInfo && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${recTypeInfo.color}`}>
                          {recTypeInfo.label}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        rec.status === 'pending'  ? 'bg-yellow-100 text-yellow-700'
                        : rec.status === 'approved' ? 'bg-blue-100 text-blue-700'
                        : rec.status === 'applied'  ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                      }`}>
                        {rec.status === 'pending' ? '⏳ Čeká'
                          : rec.status === 'approved' ? '✓ Schváleno'
                          : rec.status === 'applied' ? '✓ Aplikováno'
                          : '✗ Zamítnuto'}
                      </span>
                      {confidence != null && (
                        <span className="text-[10px] text-gray-400">
                          Jistota {Math.round(confidence * 100)} %
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1.5">
                      {rec.margin_change_percent != null && (
                        <span className={`text-xs ${rec.margin_change_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          Marže {rec.margin_change_percent > 0 ? '+' : ''}{rec.margin_change_percent.toFixed(1)} %
                        </span>
                      )}
                      {rec.expected_revenue_impact_percent != null && (
                        <span className={`text-xs ${rec.expected_revenue_impact_percent >= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                          Tržby {rec.expected_revenue_impact_percent > 0 ? '+' : ''}{rec.expected_revenue_impact_percent.toFixed(1)} %
                        </span>
                      )}
                      {rec.reasoning?.competitors_count != null && rec.reasoning.competitors_count > 0 && (
                        <span className="text-xs text-gray-400">
                          {rec.reasoning.competitors_count} konkurentů · ∅ {rec.reasoning.competitors_avg?.toFixed(0)} Kč
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {rec.status === 'pending' && (
                      <>
                        <button onClick={() => approveMutation.mutate(rec.id)}
                          disabled={approveMutation.isPending}
                          className="flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
                          <CheckCircle size={12} /> Schválit
                        </button>
                        <button onClick={() => rejectMutation.mutate(rec.id)}
                          disabled={rejectMutation.isPending}
                          className="flex items-center gap-1 border border-red-200 hover:bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium transition">
                          <XCircle size={12} /> Zamítnout
                        </button>
                      </>
                    )}
                    {rec.status === 'approved' && (
                      <button onClick={() => applyMutation.mutate(rec.id)}
                        disabled={applyMutation.isPending}
                        className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
                        <Play size={12} /> Aplikovat
                      </button>
                    )}
                    <button onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                      className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 transition">
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  </div>
                </div>

                {/* Expanded reasoning */}
                {isExpanded && rec.reasoning && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Zdůvodnění</p>
                    {rec.reasoning.text && (
                      <p className="text-sm text-gray-700 mb-2">{rec.reasoning.text}</p>
                    )}
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
                      {rec.reasoning.competitors_avg != null && (
                        <span>Průměr konkurence: <b className="text-gray-700">{rec.reasoning.competitors_avg.toFixed(0)} Kč</b></span>
                      )}
                      {rec.reasoning.competitors_count != null && (
                        <span>Počet konkurentů: <b className="text-gray-700">{rec.reasoning.competitors_count}</b></span>
                      )}
                      {rec.reasoning.confidence != null && (
                        <span>Jistota: <b className="text-gray-700">{Math.round(rec.reasoning.confidence * 100)} %</b></span>
                      )}
                      <span>
                        Vytvořeno: <b className="text-gray-700">{new Date(rec.created_at).toLocaleDateString('cs-CZ')}</b>
                      </span>
                      {rec.applied_at && (
                        <span>
                          Aplikováno: <b className="text-gray-700">{new Date(rec.applied_at).toLocaleDateString('cs-CZ')}</b>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
