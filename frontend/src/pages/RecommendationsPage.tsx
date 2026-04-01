import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, XCircle, AlertCircle, TrendingUp, Play } from 'lucide-react'
import { apiClient } from '@/api/client'

interface Recommendation {
  id: string
  product_id: string
  recommended_price_without_vat: number
  recommended_price_with_vat: number
  current_price_with_vat: number | null
  margin_change_percent: number | null
  expected_revenue_impact_percent: number | null
  status: string
  reasoning: any
  created_at: string
  approved_at: string | null
  applied_at: string | null
}

export default function RecommendationsPage() {
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'applied' | 'rejected'>('pending')
  const qc = useQueryClient()

  const { data: recommendations = [], isLoading } = useQuery({
    queryKey: ['recommendations', activeTab],
    queryFn: () => apiClient.listRecommendations(activeTab === 'pending' ? 'pending' : activeTab),
  })

  const approveMutation = useMutation({
    mutationFn: (recId: string) => apiClient.approveRecommendation(recId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recommendations'] })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (recId: string) => apiClient.rejectRecommendation(recId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recommendations'] })
    },
  })

  const applyMutation = useMutation({
    mutationFn: (recId: string) => apiClient.applyRecommendation(recId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recommendations'] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })

  const tabs = [
    { id: 'pending', label: 'Čekající', count: recommendations.filter((r: Recommendation) => r.status === 'pending').length },
    { id: 'approved', label: 'Schválené', count: recommendations.filter((r: Recommendation) => r.status === 'approved').length },
    { id: 'applied', label: 'Aplikované', count: recommendations.filter((r: Recommendation) => r.status === 'applied').length },
    { id: 'rejected', label: 'Zamítnuté', count: recommendations.filter((r: Recommendation) => r.status === 'rejected').length },
  ]

  const statusBadgeColor = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-blue-100 text-blue-800',
    applied: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  }

  const statusLabel = {
    pending: '⏳ Čekající',
    approved: '✓ Schváleno',
    applied: '✓ Aplikováno',
    rejected: '✗ Zamítnuté',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Doporučení cen</h1>
        <p className="text-gray-600 mt-1">Analýza a schvalování doporučených změn cen</p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
            <span className="ml-2 inline-block bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-sm">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Empty State */}
      {!isLoading && recommendations.length === 0 && (
        <div className="text-center py-12">
          <AlertCircle size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500 text-lg">Žádné doporučení pro tuto kategorii</p>
        </div>
      )}

      {/* Recommendations List */}
      <div className="space-y-4">
        {recommendations.map((rec: Recommendation) => (
          <div key={rec.id} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-semibold text-gray-900">Produkt {rec.product_id.slice(0, 8)}</h3>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${statusBadgeColor[rec.status as keyof typeof statusBadgeColor]}`}>
                    {statusLabel[rec.status as keyof typeof statusLabel]}
                  </span>
                </div>

                {/* Price Comparison */}
                <div className="grid grid-cols-3 gap-4 my-3">
                  <div>
                    <p className="text-xs text-gray-600">Aktuální cena</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {rec.current_price_with_vat ? `${rec.current_price_with_vat.toFixed(2)} Kč` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Doporučená cena</p>
                    <p className="text-lg font-semibold text-blue-600">
                      {rec.recommended_price_with_vat.toFixed(2)} Kč
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Změna marže</p>
                    <p className={`text-lg font-semibold ${(rec.margin_change_percent || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {rec.margin_change_percent ? `${rec.margin_change_percent > 0 ? '+' : ''}${rec.margin_change_percent.toFixed(2)} %` : '—'}
                    </p>
                  </div>
                </div>

                {/* Reasoning */}
                {rec.reasoning && (
                  <div className="bg-gray-50 rounded p-2 text-xs text-gray-600">
                    <p><strong>Zdůvodnění:</strong> Elasticita {rec.reasoning.elasticity}, Cílová marže {rec.reasoning.margin_target}%</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="ml-4 flex gap-2">
                {rec.status === 'pending' && (
                  <>
                    <button
                      onClick={() => approveMutation.mutate(rec.id)}
                      disabled={approveMutation.isPending}
                      className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm font-medium transition disabled:bg-green-300"
                    >
                      <CheckCircle size={14} />
                      Schválit
                    </button>
                    <button
                      onClick={() => rejectMutation.mutate(rec.id)}
                      disabled={rejectMutation.isPending}
                      className="flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-sm font-medium transition disabled:bg-red-300"
                    >
                      <XCircle size={14} />
                      Zamítnout
                    </button>
                  </>
                )}

                {rec.status === 'approved' && (
                  <button
                    onClick={() => applyMutation.mutate(rec.id)}
                    disabled={applyMutation.isPending}
                    className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium transition disabled:bg-blue-300"
                  >
                    <Play size={14} />
                    Aplikovat
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
