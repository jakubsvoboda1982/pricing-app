import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, AlertCircle, ArrowRight } from 'lucide-react'
import { apiClient } from '@/api/client'
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

export default function OpportunitiesPage() {
  const navigate = useNavigate()
  const selectedMarket = useMarketStore((state) => state.selectedMarket)
  const [priceFilter, setPriceFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all')

  const { data: opportunities = [], isLoading } = useQuery({
    queryKey: ['opportunities'],
    queryFn: async () => {
      try {
        const response = await fetch('http://localhost:8000/api/opportunities/')
        if (!response.ok) throw new Error('Failed to fetch opportunities')
        const data = await response.json()
        return data as Opportunity[]
      } catch (error) {
        console.error('Error fetching opportunities:', error)
        // Fallback to mock data if API fails
        return [
          {
            id: '1',
            name: 'Protein Nut Clusters',
            score: 88,
            priority: 'high' as const,
            price_range: '89–119 CZK',
            description: 'Vysoká poptávka s potenciálem pro zvýšení marže',
            tags: ['vysoká priorita', 'klíčový'],
            sales: '145 ks',
            margin: '28%',
          },
          {
            id: '2',
            name: 'Protein Nut Cluster Bites',
            score: 88,
            priority: 'high' as const,
            price_range: '129–169 CZK',
            description: 'Post-workout / daily protein snacking',
            tags: ['klíčový'],
            sales: '132 ks',
            margin: '31%',
          },
          {
            id: '3',
            name: 'Premium Freeze-Dried Fruit Chocolate Bites',
            score: 84,
            priority: 'medium' as const,
            price_range: '99–129 CZK',
            description: 'Zdravé a lákavé balení pro trh',
            tags: ['klíčový'],
            sales: '118 ks',
            margin: '27%',
          },
          {
            id: '4',
            name: 'Freeze-Dried Fruit Chocolate Snack Pack 5-pack',
            score: 81,
            priority: 'medium' as const,
            price_range: '129–159 CZK',
            description: 'Zdravější alternativa k tradičním sladkostem',
            tags: ['středí priorita'],
            sales: '96 ks',
            margin: '24%',
          },
          {
            id: '5',
            name: 'Sweet & Salty Pretzel Nut Mix',
            score: 79,
            priority: 'low' as const,
            price_range: '89–119 CZK',
            description: 'Office snacking, entertainment',
            tags: ['nízká priorita'],
            sales: '87 ks',
            margin: '22%',
          },
          {
            id: '6',
            name: 'Premium On-The-Go Snack Pack 5-pack',
            score: 76,
            priority: 'low' as const,
            price_range: '149–199 CZK',
            description: 'Cestování a aktivní životní styl',
            tags: ['nízká priorita'],
            sales: '65 ks',
            margin: '20%',
          },
        ]
      }
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Načítám příležitosti...</p>
      </div>
    )
  }

  const filteredOpportunities = opportunities.filter((opp) => {
    if (priceFilter === 'all') return true
    if (priceFilter === 'high') return opp.priority === 'high'
    if (priceFilter === 'medium') return opp.priority === 'medium'
    return opp.priority === 'low'
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Nové produktové příležitosti</h1>
          <p className="text-gray-600 mt-1">
            {opportunities.length} příležitostí identifikováno · 4 vysoká priorita
          </p>
        </div>
        <MarketSelector />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <button
          onClick={() => navigate('/simulator')}
          className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4 hover:shadow-md transition text-left"
        >
          <p className="text-sm font-medium text-blue-900">Simulátor co-když</p>
          <p className="text-xs text-blue-700 mt-1">Testuj ceny a scenáře</p>
          <ArrowRight size={16} className="text-blue-600 mt-2" />
        </button>
        <button
          onClick={() => navigate('/products')}
          className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-4 hover:shadow-md transition text-left"
        >
          <p className="text-sm font-medium text-green-900">Sledované produkty</p>
          <p className="text-xs text-green-700 mt-1">Přehled všech produktů</p>
          <ArrowRight size={16} className="text-green-600 mt-2" />
        </button>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium text-gray-700">Filtr priorit:</span>
          <div className="flex space-x-2">
            {(['all', 'high', 'medium', 'low'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setPriceFilter(filter)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  priceFilter === filter
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {filter === 'all' ? 'Všechny' : filter === 'high' ? 'Vysoká' : filter === 'medium' ? 'Střední' : 'Nízká'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Opportunities Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredOpportunities.map((opportunity) => (
          <div
            key={opportunity.id}
            className={`bg-white rounded-lg shadow-md hover:shadow-lg transition p-6 border-l-4 ${
              opportunity.priority === 'high'
                ? 'border-l-red-500'
                : opportunity.priority === 'medium'
                  ? 'border-l-yellow-500'
                  : 'border-l-green-500'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <h3 className="font-semibold text-gray-900">{opportunity.name}</h3>
                  {opportunity.priority === 'high' && (
                    <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded">
                      vysoká priorita
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600">{opportunity.description}</p>
              </div>
              <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-400 to-green-600 rounded-full">
                <span className="text-2xl font-bold text-white">{opportunity.score}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 my-4 p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-xs text-gray-600">Tržby</p>
                <p className="font-semibold text-gray-900">{opportunity.sales}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Marže</p>
                <p className="font-semibold text-gray-900">{opportunity.margin}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Cenový rozsah</p>
                <p className="font-semibold text-gray-900 text-sm">{opportunity.price_range}</p>
                {opportunity.price_without_vat && opportunity.vat_rate && (
                  <p className="text-xs text-gray-600 mt-1">
                    s DPH ({opportunity.vat_rate}%): {Math.round(opportunity.price_without_vat.min * (1 + opportunity.vat_rate / 100))}–{Math.round(opportunity.price_without_vat.max * (1 + opportunity.vat_rate / 100))} Kč
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2 flex-wrap gap-2 mb-4">
              {opportunity.tags.map((tag) => (
                <span key={tag} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                  {tag}
                </span>
              ))}
            </div>

            <button
              onClick={() => navigate('/simulator', { state: { selectedProductId: opportunity.id, productName: opportunity.name } })}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition flex items-center justify-center space-x-2"
            >
              <TrendingUp size={16} />
              <span>Prozkoumat příležitost</span>
            </button>
          </div>
        ))}
      </div>

      {filteredOpportunities.length === 0 && (
        <div className="text-center py-12">
          <AlertCircle className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-600">Žádné příležitosti pro vybraný filtr</p>
        </div>
      )}
    </div>
  )
}
