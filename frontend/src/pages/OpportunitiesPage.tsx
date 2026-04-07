import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, AlertCircle, Zap, Target, BarChart2 } from 'lucide-react'
import { API_BASE_URL, authFetch } from '@/api/client'
import { useMarketStore } from '@/store/market'
import MarketSelector from '@/components/MarketSelector'

interface Opportunity {
  id: string
  name: string
  score: number
  priority: 'high' | 'medium' | 'low'
  price_range: string
  price_without_vat?: { min: number; max: number }
  vat_rate?: number
  description: string
  tags: string[]
  sales: string
  margin: string
}

const FALLBACK: Opportunity[] = [
  { id: '1', name: 'Protein Nut Clusters',                          score: 88, priority: 'high',   price_range: '89–119 Kč',  description: 'Vysoká poptávka s potenciálem pro zvýšení marže',   tags: ['vysoká priorita', 'klíčový'], sales: '145 ks', margin: '28%' },
  { id: '2', name: 'Protein Nut Cluster Bites',                     score: 88, priority: 'high',   price_range: '129–169 Kč', description: 'Post-workout / daily protein snacking',             tags: ['klíčový'],                    sales: '132 ks', margin: '31%' },
  { id: '3', name: 'Premium Freeze-Dried Fruit Chocolate Bites',    score: 84, priority: 'medium', price_range: '99–129 Kč',  description: 'Zdravé a lákavé balení pro trh',                    tags: ['klíčový'],                    sales: '118 ks', margin: '27%' },
  { id: '4', name: 'Freeze-Dried Fruit Chocolate Snack Pack 5-pack',score: 81, priority: 'medium', price_range: '129–159 Kč', description: 'Zdravější alternativa k tradičním sladkostem',       tags: ['střední priorita'],           sales: '96 ks',  margin: '24%' },
  { id: '5', name: 'Sweet & Salty Pretzel Nut Mix',                  score: 79, priority: 'low',    price_range: '89–119 Kč',  description: 'Office snacking, entertainment',                    tags: ['nízká priorita'],             sales: '87 ks',  margin: '22%' },
  { id: '6', name: 'Premium On-The-Go Snack Pack 5-pack',           score: 76, priority: 'low',    price_range: '149–199 Kč', description: 'Cestování a aktivní životní styl',                  tags: ['nízká priorita'],             sales: '65 ks',  margin: '20%' },
]

export default function OpportunitiesPage() {
  const navigate = useNavigate()
  const selectedMarket = useMarketStore((state) => state.selectedMarket)
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all')

  const { data: opportunities = FALLBACK, isLoading } = useQuery({
    queryKey: ['opportunities'],
    queryFn: async () => {
      try {
        const response = await authFetch(`${API_BASE_URL}/opportunities/`)
        if (!response.ok) throw new Error('Failed')
        return await response.json() as Opportunity[]
      } catch {
        return FALLBACK
      }
    },
  })

  const filtered = opportunities.filter(o => priorityFilter === 'all' || o.priority === priorityFilter)
  const highCount   = opportunities.filter(o => o.priority === 'high').length
  const mediumCount = opportunities.filter(o => o.priority === 'medium').length
  const lowCount    = opportunities.filter(o => o.priority === 'low').length

  const priorityTabs = [
    { id: 'all',    label: 'Všechny',  count: opportunities.length, color: 'text-gray-700', activeBg: 'bg-blue-600 text-white' },
    { id: 'high',   label: 'Vysoká',   count: highCount,            color: 'text-red-700',  activeBg: 'bg-red-600 text-white'  },
    { id: 'medium', label: 'Střední',  count: mediumCount,          color: 'text-yellow-700', activeBg: 'bg-yellow-500 text-white' },
    { id: 'low',    label: 'Nízká',    count: lowCount,             color: 'text-green-700', activeBg: 'bg-green-600 text-white' },
  ] as const

  return (
    <div className="space-y-5">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Příležitosti</h1>
          <p className="text-sm text-gray-400 mt-0.5">Produkty s potenciálem pro optimalizaci ceny</p>
        </div>
        <MarketSelector />
      </div>

      {/* ── KPI STRIP ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Celkem</p>
            <Target size={14} className="text-gray-300" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{opportunities.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">příležitostí</p>
        </div>
        <div className={`border border-gray-200 rounded-xl p-4 ${highCount > 0 ? 'bg-red-50' : 'bg-white'}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Vysoká</p>
            <Zap size={14} className={highCount > 0 ? 'text-red-400' : 'text-gray-300'} />
          </div>
          <p className={`text-2xl font-bold ${highCount > 0 ? 'text-red-600' : 'text-gray-300'}`}>{highCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">priorita</p>
        </div>
        <div className={`border border-gray-200 rounded-xl p-4 ${mediumCount > 0 ? 'bg-yellow-50' : 'bg-white'}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Střední</p>
            <BarChart2 size={14} className={mediumCount > 0 ? 'text-yellow-400' : 'text-gray-300'} />
          </div>
          <p className={`text-2xl font-bold ${mediumCount > 0 ? 'text-yellow-600' : 'text-gray-300'}`}>{mediumCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">priorita</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Nízká</p>
            <TrendingUp size={14} className="text-gray-300" />
          </div>
          <p className="text-2xl font-bold text-gray-300">{lowCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">priorita</p>
        </div>
      </div>

      {/* ── PRIORITY FILTER ────────────────────────────────────────────── */}
      <div className="flex gap-1.5 flex-wrap">
        {priorityTabs.map(tab => (
          <button key={tab.id} onClick={() => setPriorityFilter(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              priorityFilter === tab.id ? tab.activeBg : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {tab.label}
            {tab.count > 0 && (
              <span className={`ml-1.5 text-xs px-1 py-0.5 rounded-full ${
                priorityFilter === tab.id ? 'bg-white/20' : 'bg-gray-200 text-gray-500'
              }`}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── CONTENT ────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">Načítám...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <AlertCircle size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-gray-500">Žádné příležitosti pro vybraný filtr</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(opp => {
            const priorityBadge = opp.priority === 'high'
              ? 'bg-red-100 text-red-700'
              : opp.priority === 'medium'
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-gray-100 text-gray-600'
            const priorityLabel = opp.priority === 'high' ? 'Vysoká' : opp.priority === 'medium' ? 'Střední' : 'Nízká'
            const scoreColor = opp.score >= 85 ? 'text-green-700 bg-green-100' : opp.score >= 75 ? 'text-blue-700 bg-blue-100' : 'text-gray-700 bg-gray-100'

            return (
              <div key={opp.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900 truncate">{opp.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${priorityBadge}`}>
                        {priorityLabel}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">{opp.description}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${scoreColor}`}>
                    <span className="text-lg font-bold">{opp.score}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3 p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Tržby</p>
                    <p className="text-sm font-semibold text-gray-800">{opp.sales}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Marže</p>
                    <p className="text-sm font-semibold text-gray-800">{opp.margin}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Cenový rozsah</p>
                    <p className="text-xs font-semibold text-gray-800">{opp.price_range}</p>
                  </div>
                </div>

                {opp.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {opp.tags.map(tag => (
                      <span key={tag} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">{tag}</span>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => navigate('/simulator', { state: { selectedProductId: opp.id, productName: opp.name } })}
                  className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition">
                  <TrendingUp size={14} /> Prozkoumat příležitost
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
