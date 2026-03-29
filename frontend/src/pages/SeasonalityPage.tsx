import { useState } from 'react'
import { TrendingUp, AlertCircle, CheckCircle } from 'lucide-react'

interface SeasonalPeriod {
  month: string
  shortMonth: string
  season: string
  demand: number
  recommendedPrice: number
  recommendedDiscount: number
  strategy: string
  risk: 'low' | 'medium' | 'high'
}

const SEASONAL_DATA: SeasonalPeriod[] = [
  {
    month: 'Leden',
    shortMonth: 'Leden',
    season: 'Nový rok',
    demand: 85,
    recommendedPrice: 120,
    recommendedDiscount: 0,
    strategy: 'Zdravý životní styl',
    risk: 'low',
  },
  {
    month: 'Únor',
    shortMonth: 'Únor',
    season: 'Valentýn',
    demand: 70,
    recommendedPrice: 130,
    recommendedDiscount: 5,
    strategy: 'Premium balení',
    risk: 'low',
  },
  {
    month: 'Březen',
    shortMonth: 'Březen',
    season: 'Jaro',
    demand: 90,
    recommendedPrice: 110,
    recommendedDiscount: 0,
    strategy: 'Jarní očista',
    risk: 'low',
  },
  {
    month: 'Duben',
    shortMonth: 'Duben',
    season: 'Velikonoce',
    demand: 95,
    recommendedPrice: 100,
    recommendedDiscount: 10,
    strategy: 'Sváteční balení',
    risk: 'medium',
  },
  {
    month: 'Květen',
    shortMonth: 'Květen',
    season: 'Léto',
    demand: 88,
    recommendedPrice: 115,
    recommendedDiscount: 0,
    strategy: 'Outdoor aktivita',
    risk: 'low',
  },
  {
    month: 'Červen',
    shortMonth: 'Červen',
    season: 'Léto',
    demand: 92,
    recommendedPrice: 105,
    recommendedDiscount: 5,
    strategy: 'Letní energie',
    risk: 'low',
  },
  {
    month: 'Červenec',
    shortMonth: 'Červenec',
    season: 'Léto',
    demand: 98,
    recommendedPrice: 95,
    recommendedDiscount: 15,
    strategy: 'Dovolená',
    risk: 'high',
  },
  {
    month: 'Srpen',
    shortMonth: 'Srpen',
    season: 'Léto',
    demand: 96,
    recommendedPrice: 100,
    recommendedDiscount: 10,
    strategy: 'Letní party',
    risk: 'high',
  },
  {
    month: 'Září',
    shortMonth: 'Září',
    season: 'Podzim',
    demand: 85,
    recommendedPrice: 115,
    recommendedDiscount: 0,
    strategy: 'Back to school',
    risk: 'low',
  },
  {
    month: 'Říjen',
    shortMonth: 'Říjen',
    season: 'Podzim',
    demand: 78,
    recommendedPrice: 125,
    recommendedDiscount: 0,
    strategy: 'Halloween',
    risk: 'medium',
  },
  {
    month: 'Listopad',
    shortMonth: 'Listopad',
    season: 'Vánoce',
    demand: 110,
    recommendedPrice: 85,
    recommendedDiscount: 20,
    strategy: 'Black Friday',
    risk: 'high',
  },
  {
    month: 'Prosinec',
    shortMonth: 'Prosinec',
    season: 'Vánoce',
    demand: 115,
    recommendedPrice: 90,
    recommendedDiscount: 25,
    strategy: 'Vánoční dárky',
    risk: 'high',
  },
]

export default function SeasonalityPage() {
  const [selectedMonth, setSelectedMonth] = useState(0)
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar')

  const current = SEASONAL_DATA[selectedMonth]
  const avgDemand = Math.round(SEASONAL_DATA.reduce((sum, d) => sum + d.demand, 0) / 12)

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low':
        return 'bg-green-50 border-green-200 text-green-900'
      case 'medium':
        return 'bg-yellow-50 border-yellow-200 text-yellow-900'
      case 'high':
        return 'bg-red-50 border-red-200 text-red-900'
      default:
        return 'bg-gray-50 border-gray-200 text-gray-900'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Sezónní engine</h1>
        <p className="text-gray-600 mt-1">Aktuální měsíc: Březen · 1 aktivní sezón · 0 nadcházejících</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side - Calendar */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Roční sezónní kalendář</h2>

            {/* Month Grid */}
            <div className="grid grid-cols-6 gap-2 mb-6">
              {SEASONAL_DATA.map((period, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedMonth(idx)}
                  className={`p-3 rounded-lg text-sm font-medium transition ${
                    selectedMonth === idx
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                  title={period.month}
                >
                  {period.shortMonth.substring(0, 3)}
                </button>
              ))}
            </div>

            {/* Demand Chart */}
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-3">Poptávka během roku</p>
              <div className="flex items-end justify-between h-32 gap-2 bg-gray-50 p-4 rounded-lg">
                {SEASONAL_DATA.map((period, idx) => (
                  <div
                    key={idx}
                    className={`flex-1 rounded-t-md transition ${
                      selectedMonth === idx ? 'bg-blue-600' : 'bg-gray-300 hover:bg-gray-400'
                    }`}
                    style={{ height: `${(period.demand / 115) * 100}%` }}
                    title={`${period.month}: ${period.demand}`}
                  />
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-2">Průměr: {avgDemand}/115</p>
            </div>

            {/* Selected Month Details */}
            <div className={`p-4 rounded-lg border ${getRiskColor(current.risk)}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold">{current.month}</p>
                  <p className="text-sm opacity-75">{current.season}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{current.demand}</p>
                  <p className="text-xs opacity-75">Poptávka</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-current border-opacity-20">
                <div>
                  <p className="text-xs opacity-75">Cena</p>
                  <p className="font-bold">{current.recommendedPrice} CZK</p>
                </div>
                <div>
                  <p className="text-xs opacity-75">Sleva</p>
                  <p className="font-bold">{current.recommendedDiscount}%</p>
                </div>
                <div>
                  <p className="text-xs opacity-75">Riziko</p>
                  <p className="font-bold uppercase text-sm">{current.risk}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Details */}
        <div className="space-y-4">
          {/* Strategy Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center space-x-2">
              <span>💡</span>
              <span>Strategie</span>
            </h3>
            <p className="text-sm text-gray-700 mb-4">{current.strategy}</p>
            <p className="text-xs text-gray-600">
              Cílená strategie prodeje pro maximalizaci tržeb v {current.month.toLowerCase()}
            </p>
          </div>

          {/* Action Items */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center space-x-2">
              <span>✓</span>
              <span>Akční items</span>
            </h3>
            <div className="space-y-3">
              <div className="flex items-start space-x-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={16} />
                <div>
                  <p className="text-sm font-medium text-blue-900">Nastavit cenu</p>
                  <p className="text-xs text-blue-700">na {current.recommendedPrice} CZK</p>
                </div>
              </div>
              {current.recommendedDiscount > 0 && (
                <div className="flex items-start space-x-3 p-3 bg-yellow-50 rounded-lg">
                  <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={16} />
                  <div>
                    <p className="text-sm font-medium text-yellow-900">Připravit slevu</p>
                    <p className="text-xs text-yellow-700">{current.recommendedDiscount}% pro {current.season}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start space-x-3 p-3 bg-purple-50 rounded-lg">
                <TrendingUp className="text-purple-600 flex-shrink-0 mt-0.5" size={16} />
                <div>
                  <p className="text-sm font-medium text-purple-900">Marketingová kampaň</p>
                  <p className="text-xs text-purple-700">Cílená komunikace na sociální sítě</p>
                </div>
              </div>
            </div>
          </div>

          {/* Risk Indicator */}
          <div className={`p-4 rounded-lg border ${getRiskColor(current.risk)}`}>
            <p className="text-sm font-semibold mb-2">Úroveň rizika: {current.risk.toUpperCase()}</p>
            <p className="text-xs">
              {current.risk === 'high'
                ? 'Vysoká poptávka může vést k nedostatku zásob'
                : current.risk === 'medium'
                  ? 'Umírněné riziko se zvýšenou poptávkou'
                  : 'Stabilní poptávka, nízké riziko'}
            </p>
          </div>
        </div>
      </div>

      {/* Bottom - Statistics */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Sezónní statistiky</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">1100</p>
            <p className="text-xs text-gray-600">Celkový objem</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">115</p>
            <p className="text-xs text-gray-600">Peak měsíc</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-purple-600">70</p>
            <p className="text-xs text-gray-600">Low měsíc</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-orange-600">92</p>
            <p className="text-xs text-gray-600">Průměr</p>
          </div>
        </div>
      </div>
    </div>
  )
}
