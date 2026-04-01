import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, XCircle, AlertCircle, TrendingUp, Play, Clock, ThumbsUp } from 'lucide-react'
import { apiClient } from '@/api/client'

interface Recommendation {
  id: string; product_id: string
  recommended_price_without_vat: number; recommended_price_with_vat: number
  current_price_with_vat: number | null; margin_change_percent: number | null
  expected_revenue_impact_percent: number | null; status: string
  reasoning: any; created_at: string; approved_at: string | null; applied_at: string | null
}

export default function RecommendationsPage() {
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'applied' | 'rejected'>('pending')
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
    { id: 'pending',  label: 'Čekající',  icon: Clock,       color: 'text-yellow-600', bg: 'bg-yellow-100' },
    { id: 'approved', label: 'Schválené', icon: ThumbsUp,    color: 'text-blue-600',   bg: 'bg-blue-100'   },
    { id: 'applied',  label: 'Aplikované',icon: CheckCircle, color: 'text-green-600',  bg: 'bg-green-100'  },
    { id: 'rejected', label: 'Zamítnuté', icon: XCircle,     color: 'text-red-600',    bg: 'bg-red-100'    },
  ] as const

  return (
    <div className="space-y-5">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Doporučení cen</h1>
        <p className="text-sm text-gray-400 mt-0.5">Analýza a schvalování doporučených změn cen</p>
      </div>

      {/* ── KPI STRIP ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tabs.map(tab => {
          const Icon = tab.icon
          const count = counts[tab.id]
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`text-left border rounded-xl p-4 transition ${activeTab === tab.id ? 'border-blue-300 shadow-sm bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{tab.label}</p>
                <span className={`w-7 h-7 rounded-full flex items-center justify-center ${tab.bg}`}>
                  <Icon size={13} className={tab.color} />
                </span>
              </div>
              <p className={`text-2xl font-bold ${count > 0 && tab.id === 'pending' ? 'text-yellow-600' : 'text-gray-900'}`}>{count}</p>
            </button>
          )
        })}
      </div>

      {/* ── TAB FILTER ─────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {tab.label}
            {counts[tab.id] > 0 && (
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                {counts[tab.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── CONTENT ────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">Načítám...</div>
      ) : recs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <AlertCircle size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-gray-500 font-medium">Žádná doporučení v kategorii „{tabs.find(t => t.id === activeTab)?.label}"</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recs.map(rec => {
            const priceDiff = rec.current_price_with_vat
              ? rec.recommended_price_with_vat - rec.current_price_with_vat : null
            const priceDiffPct = rec.current_price_with_vat && priceDiff != null
              ? (priceDiff / rec.current_price_with_vat) * 100 : null
            const isIncrease = priceDiff != null && priceDiff > 0

            return (
              <div key={rec.id} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-start gap-5">

                  {/* Left: Price comparison */}
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-center">
                      <p className="text-xs text-gray-400 mb-1">Aktuální</p>
                      <p className="text-lg font-bold text-gray-700">
                        {rec.current_price_with_vat ? `${rec.current_price_with_vat.toFixed(0)} Kč` : '—'}
                      </p>
                    </div>
                    <div className="flex flex-col items-center">
                      <TrendingUp size={16} className={isIncrease ? 'text-green-500' : 'text-blue-400'} />
                      {priceDiffPct != null && (
                        <span className={`text-xs font-medium mt-0.5 ${isIncrease ? 'text-green-600' : 'text-blue-600'}`}>
                          {isIncrease ? '+' : ''}{priceDiffPct.toFixed(1)} %
                        </span>
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-400 mb-1">Doporučení</p>
                      <p className="text-lg font-bold text-blue-700">{rec.recommended_price_with_vat.toFixed(0)} Kč</p>
                    </div>
                  </div>

                  {/* Middle: Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-mono text-gray-500">Produkt {rec.product_id.slice(0, 8)}…</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        rec.status === 'pending' ? 'bg-yellow-100 text-yellow-700'
                        : rec.status === 'approved' ? 'bg-blue-100 text-blue-700'
                        : rec.status === 'applied' ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                      }`}>
                        {rec.status === 'pending' ? '⏳ Čeká' : rec.status === 'approved' ? '✓ Schváleno' : rec.status === 'applied' ? '✓ Aplikováno' : '✗ Zamítnuto'}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-sm">
                      {rec.margin_change_percent != null && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400">Změna marže:</span>
                          <span className={`text-xs font-semibold ${rec.margin_change_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {rec.margin_change_percent > 0 ? '+' : ''}{rec.margin_change_percent.toFixed(1)} %
                          </span>
                        </div>
                      )}
                      {rec.expected_revenue_impact_percent != null && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400">Dopad na tržby:</span>
                          <span className={`text-xs font-semibold ${rec.expected_revenue_impact_percent >= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                            {rec.expected_revenue_impact_percent > 0 ? '+' : ''}{rec.expected_revenue_impact_percent.toFixed(1)} %
                          </span>
                        </div>
                      )}
                    </div>

                    {rec.reasoning && (
                      <p className="text-xs text-gray-400 mt-2">
                        Elasticita {rec.reasoning.elasticity} · Marže {rec.reasoning.margin_target} %
                      </p>
                    )}

                    <p className="text-xs text-gray-300 mt-1">
                      Vytvořeno {new Date(rec.created_at).toLocaleDateString('cs-CZ')}
                      {rec.applied_at && ` · Aplikováno ${new Date(rec.applied_at).toLocaleDateString('cs-CZ')}`}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {rec.status === 'pending' && (
                      <>
                        <button onClick={() => approveMutation.mutate(rec.id)} disabled={approveMutation.isPending}
                          className="flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition">
                          <CheckCircle size={13} /> Schválit
                        </button>
                        <button onClick={() => rejectMutation.mutate(rec.id)} disabled={rejectMutation.isPending}
                          className="flex items-center gap-1 bg-white border border-red-200 hover:bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-sm font-medium transition">
                          <XCircle size={13} /> Zamítnout
                        </button>
                      </>
                    )}
                    {rec.status === 'approved' && (
                      <button onClick={() => applyMutation.mutate(rec.id)} disabled={applyMutation.isPending}
                        className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition">
                        <Play size={13} /> Aplikovat
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
