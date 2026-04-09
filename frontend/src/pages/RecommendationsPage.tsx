import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle, XCircle, AlertCircle, TrendingUp, TrendingDown,
  Play, Clock, ThumbsUp, Zap, ChevronDown, ChevronUp, ArrowRight,
  Package,
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

const TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  raise:       { label: 'Zdraž',         color: 'bg-emerald-100 text-emerald-700 border-emerald-200',  icon: '↑' },
  lower:       { label: 'Zlevni',        color: 'bg-blue-100 text-blue-700 border-blue-200',           icon: '↓' },
  floor_alert: { label: 'Floor alert',   color: 'bg-red-100 text-red-700 border-red-200',              icon: '⚠' },
  minor_raise: { label: '+2 % mírné',   color: 'bg-teal-100 text-teal-700 border-teal-200',           icon: '↗' },
  cost_plus:   { label: 'Cost-plus',     color: 'bg-violet-100 text-violet-700 border-violet-200',     icon: '∑' },
  set_price:   { label: 'Nastavit cenu', color: 'bg-amber-100 text-amber-700 border-amber-200',        icon: '!' },
  no_data:     { label: 'Bez dat',       color: 'bg-gray-100 text-gray-400 border-gray-200',           icon: '?' },
}

const STATUS_META = {
  pending:  { label: 'Čekající',   color: 'text-amber-600',  bg: 'bg-amber-50',  ring: 'ring-amber-200' },
  approved: { label: 'Schválené',  color: 'text-blue-600',   bg: 'bg-blue-50',   ring: 'ring-blue-200'  },
  applied:  { label: 'Aplikované', color: 'text-emerald-600',bg: 'bg-emerald-50',ring: 'ring-emerald-200'},
  rejected: { label: 'Zamítnuté', color: 'text-red-500',     bg: 'bg-red-50',    ring: 'ring-red-200'   },
}

type StatusKey = keyof typeof STATUS_META

export default function RecommendationsPage() {
  const [activeTab, setActiveTab] = useState<StatusKey>('pending')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [genAllLoading, setGenAllLoading] = useState(false)
  const [genAllResult, setGenAllResult] = useState<{ generated: number; skipped: number } | null>(null)
  const qc = useQueryClient()

  const { data: allRecs = [], isLoading } = useQuery({
    queryKey: ['recommendations', 'all'],
    queryFn: () => apiClient.listRecommendations(),
  })

  const recs = (allRecs as Recommendation[]).filter(r => r.status === activeTab)
  const counts = Object.fromEntries(
    Object.keys(STATUS_META).map(s => [s, (allRecs as Recommendation[]).filter(r => r.status === s).length])
  ) as Record<StatusKey, number>

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

  const handleGenerateAll = async () => {
    setGenAllLoading(true); setGenAllResult(null)
    try {
      const res = await apiClient.generateAllRecommendations()
      setGenAllResult(res)
      qc.invalidateQueries({ queryKey: ['recommendations'] })
    } catch (e: any) { alert(e?.message || 'Chyba') }
    finally { setGenAllLoading(false) }
  }

  const pendingRecs = (allRecs as Recommendation[]).filter(r => r.status === 'pending')

  return (
    <div className="space-y-5 max-w-5xl">

      {/* HEADER */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Doporučení cen</h1>
          <p className="text-sm text-gray-400 mt-0.5">Automatická analýza a schvalování cenových změn</p>
        </div>
        <button onClick={handleGenerateAll} disabled={genAllLoading}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition shadow-sm flex-shrink-0">
          {genAllLoading
            ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generuji…</>
            : <><Zap size={15} /> Generovat pro všechny</>}
        </button>
      </div>

      {genAllResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle size={15} className="flex-shrink-0" />
          <span>
            Vygenerováno <b>{genAllResult.generated}</b> nových doporučení
            {genAllResult.skipped > 0 && ` · ${genAllResult.skipped} přeskočeno`}
          </span>
        </div>
      )}

      {/* STATUS CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.entries(STATUS_META) as [StatusKey, typeof STATUS_META[StatusKey]][]).map(([key, meta]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`text-left rounded-xl p-4 border transition ${
              activeTab === key
                ? `${meta.bg} border-current ring-2 ${meta.ring}`
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">{meta.label}</p>
            <p className={`text-3xl font-bold ${activeTab === key ? meta.color : 'text-gray-900'}`}>
              {counts[key] ?? 0}
            </p>
            {key === 'pending' && counts.pending > 0 && (
              <p className="text-xs text-amber-500 mt-1 font-medium">Vyžaduje akci →</p>
            )}
          </button>
        ))}
      </div>

      {/* TAB BAR */}
      <div className="flex gap-0 border-b border-gray-200">
        {(Object.entries(STATUS_META) as [StatusKey, typeof STATUS_META[StatusKey]][]).map(([key, meta]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === key ? `border-blue-600 ${meta.color}` : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {meta.label}
            {counts[key] > 0 && (
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
              }`}>{counts[key]}</span>
            )}
          </button>
        ))}
      </div>

      {/* BULK ACTION BAR */}
      {activeTab === 'pending' && pendingRecs.length > 1 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <span className="text-amber-700 font-medium flex-1">
            {pendingRecs.length} čekajících doporučení
          </span>
          <button
            onClick={() => pendingRecs.forEach(r => approveMutation.mutate(r.id))}
            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
            <CheckCircle size={12} /> Schválit vše
          </button>
          <button
            onClick={() => pendingRecs.forEach(r => rejectMutation.mutate(r.id))}
            className="flex items-center gap-1 bg-white border border-red-200 hover:bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium transition">
            <XCircle size={12} /> Zamítnout vše
          </button>
        </div>
      )}

      {/* LIST */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Načítám doporučení…</p>
        </div>
      ) : recs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-14 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={24} className="text-gray-300" />
          </div>
          <p className="text-sm font-semibold text-gray-600">
            Žádná doporučení v kategorii „{STATUS_META[activeTab].label}"
          </p>
          {activeTab === 'pending' && (
            <p className="text-xs text-gray-400 mt-1.5 max-w-xs mx-auto">
              Klikni na <b>Generovat pro všechny</b> nebo otevři detail produktu a vygeneruj jednotlivě.
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
            const isUp = priceDiff != null && priceDiff > 0
            const typeMeta = rec.reasoning?.type ? TYPE_META[rec.reasoning.type] : null
            const isExpanded = expandedId === rec.id
            const confidence = rec.reasoning?.confidence ?? null

            return (
              <div key={rec.id}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition">

                <div className="flex items-center gap-3 p-4">

                  {/* Icon */}
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Package size={16} className="text-gray-400" />
                  </div>

                  {/* Product + type badge */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {rec.product_name || `Produkt ${rec.product_id.slice(0, 8)}…`}
                      </span>
                      {typeMeta && (
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${typeMeta.color}`}>
                          <span>{typeMeta.icon}</span> {typeMeta.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      {rec.margin_change_percent != null && (
                        <span className={`text-xs ${rec.margin_change_percent >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          Marže {rec.margin_change_percent > 0 ? '+' : ''}{rec.margin_change_percent.toFixed(1)} %
                        </span>
                      )}
                      {rec.expected_revenue_impact_percent != null && (
                        <span className={`text-xs ${rec.expected_revenue_impact_percent >= 0 ? 'text-emerald-600' : 'text-orange-500'}`}>
                          Tržby {rec.expected_revenue_impact_percent > 0 ? '+' : ''}{rec.expected_revenue_impact_percent.toFixed(1)} %
                        </span>
                      )}
                      {(rec.reasoning?.competitors_count ?? 0) > 0 && (
                        <span className="text-xs text-gray-400">
                          {rec.reasoning!.competitors_count} konk. · ∅ {rec.reasoning!.competitors_avg?.toFixed(0)} Kč
                        </span>
                      )}
                      {confidence != null && (
                        <span className="text-xs text-gray-300">Jistota {Math.round(confidence * 100)} %</span>
                      )}
                    </div>
                  </div>

                  {/* Price arrow */}
                  <div className="flex items-center gap-2 flex-shrink-0 text-center">
                    <div>
                      <p className="text-[10px] text-gray-400 mb-0.5">Aktuální</p>
                      <p className="text-base font-bold text-gray-500">
                        {rec.current_price_with_vat != null ? `${rec.current_price_with_vat.toFixed(0)} Kč` : '—'}
                      </p>
                    </div>
                    <div className="flex flex-col items-center w-10">
                      <ArrowRight size={14} className={isUp ? 'text-emerald-500' : priceDiff != null ? 'text-blue-400' : 'text-gray-300'} />
                      {priceDiffPct != null && (
                        <span className={`text-[10px] font-bold mt-0.5 ${isUp ? 'text-emerald-600' : 'text-blue-600'}`}>
                          {isUp ? '+' : ''}{priceDiffPct.toFixed(1)} %
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 mb-0.5">Nová cena</p>
                      <p className={`text-base font-bold ${isUp ? 'text-emerald-700' : 'text-blue-700'}`}>
                        {rec.recommended_price_with_vat.toFixed(0)} Kč
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {rec.status === 'pending' && (
                      <>
                        <button onClick={() => approveMutation.mutate(rec.id)}
                          disabled={approveMutation.isPending}
                          className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
                          <CheckCircle size={12} /> Schválit
                        </button>
                        <button onClick={() => rejectMutation.mutate(rec.id)}
                          disabled={rejectMutation.isPending}
                          className="flex items-center gap-1 border border-gray-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-gray-500 px-2.5 py-1.5 rounded-lg text-xs font-medium transition">
                          <XCircle size={12} />
                        </button>
                      </>
                    )}
                    {rec.status === 'approved' && (
                      <button onClick={() => applyMutation.mutate(rec.id)}
                        disabled={applyMutation.isPending}
                        className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
                        <Play size={12} /> Aplikovat
                      </button>
                    )}
                    <button onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                      className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 transition">
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  </div>
                </div>

                {/* Expanded reasoning */}
                {isExpanded && rec.reasoning && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                    {rec.reasoning.text && (
                      <p className="text-sm text-gray-700 mb-2.5">{rec.reasoning.text}</p>
                    )}
                    {/* Confidence bar */}
                    {confidence != null && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                          <span>Jistota algoritmu</span>
                          <span className="font-semibold text-gray-600">{Math.round(confidence * 100)} %</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${confidence >= 0.75 ? 'bg-emerald-500' : confidence >= 0.5 ? 'bg-blue-500' : 'bg-amber-400'}`}
                            style={{ width: `${Math.round(confidence * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
                      {rec.reasoning.competitors_avg != null && (
                        <span>Průměr trhu: <b className="text-gray-700">{rec.reasoning.competitors_avg.toFixed(0)} Kč</b></span>
                      )}
                      {rec.reasoning.competitors_count != null && (
                        <span>Konkurentů: <b className="text-gray-700">{rec.reasoning.competitors_count}</b></span>
                      )}
                      <span>Vytvořeno: <b className="text-gray-700">{new Date(rec.created_at).toLocaleDateString('cs-CZ')}</b></span>
                      {rec.applied_at && (
                        <span>Aplikováno: <b className="text-gray-700">{new Date(rec.applied_at).toLocaleDateString('cs-CZ')}</b></span>
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
