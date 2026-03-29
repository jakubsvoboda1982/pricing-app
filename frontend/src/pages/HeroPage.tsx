import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react'
import { apiClient } from '@/api/client'

export default function HeroPage() {
  const { productId } = useParams<{ productId: string }>()

  const { data: product } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => productId ? apiClient.getProduct(productId) : null,
    enabled: !!productId,
  })

  const { data: analytics } = useQuery({
    queryKey: ['analytics', productId],
    queryFn: () => productId ? apiClient.getAnalytics(productId) : null,
    enabled: !!productId,
  })

  if (!product || !analytics) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Načítám data...</p>
      </div>
    )
  }

  const scoreColor = analytics.hero_score >= 75 ? 'green' : analytics.hero_score >= 50 ? 'yellow' : 'red'
  const riskColor = analytics.margin_risk === 'Low' ? 'green' : analytics.margin_risk === 'Medium' ? 'yellow' : 'red'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{product.name}</h1>
        <p className="text-gray-600 mt-1">SKU: {product.sku}</p>
      </div>

      {/* Hero Score */}
      <div className="bg-white rounded-lg shadow p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">Hero Score</h2>
          <span className={`text-6xl font-bold ${scoreColor === 'green' ? 'text-green-600' : scoreColor === 'yellow' ? 'text-yellow-600' : 'text-red-600'}`}>
            {analytics.hero_score}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-gray-600 text-sm">Bestseller status</p>
            <p className="text-xl font-semibold text-gray-900 mt-2">Active</p>
            <p className="text-xs text-gray-500 mt-1">42% repeat purchase</p>
          </div>

          <div className="p-4 bg-indigo-50 rounded-lg">
            <p className="text-gray-600 text-sm">Broad appeal</p>
            <p className="text-xl font-semibold text-gray-900 mt-2">Strong</p>
            <p className="text-xs text-gray-500 mt-1">Good appeal in ads</p>
          </div>

          <div className="p-4 bg-purple-50 rounded-lg">
            <p className="text-gray-600 text-sm">Everyday hero</p>
            <p className="text-xl font-semibold text-gray-900 mt-2">The product that brings customers back</p>
            <p className="text-xs text-gray-500 mt-1">Primary acquisition product for CZ market</p>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Margin Risk */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Margin Risk</h3>
            {analytics.margin_risk === 'Low' ? (
              <CheckCircle className="text-green-600" size={24} />
            ) : analytics.margin_risk === 'Medium' ? (
              <AlertTriangle className="text-yellow-600" size={24} />
            ) : (
              <AlertTriangle className="text-red-600" size={24} />
            )}
          </div>

          <p
            className={`text-lg font-semibold mb-3 ${
              riskColor === 'green'
                ? 'text-green-700'
                : riskColor === 'yellow'
                  ? 'text-yellow-700'
                  : 'text-red-700'
            }`}
          >
            {analytics.margin_risk}
          </p>

          <p className="text-sm text-gray-600">
            {analytics.margin_risk === 'Low'
              ? 'Margin at risk: cost increases continue'
              : analytics.margin_risk === 'Medium'
                ? 'Some price changes detected'
                : 'High price volatility detected'}
          </p>
        </div>

        {/* Positioning */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Positioning</h3>
            <TrendingUp className="text-blue-600" size={24} />
          </div>

          <p className="text-lg font-semibold text-blue-700 mb-3">Premium Position</p>

          <p className="text-sm text-gray-600">
            "The everyday Nuties hero — the product that brings customers back."
          </p>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-600 font-medium">RECOMMENDED POSITIONING</p>
            <p className="text-sm text-gray-900 mt-2">
              Primary acquisition product for CZ market
            </p>
          </div>
        </div>
      </div>

      {/* Cenovy Koridor */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Cenový Koridor</h3>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">Prozess (Prosince)</span>
              <span className="font-medium text-gray-900">88</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full" style={{ width: '88%' }}></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">Konkurence (Průměr)</span>
              <span className="font-medium text-gray-900">85</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-green-600 h-2 rounded-full" style={{ width: '85%' }}></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">Opakovali (Min. Cena)</span>
              <span className="font-medium text-gray-900">78</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-yellow-600 h-2 rounded-full" style={{ width: '78%' }}></div>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>Doporučení:</strong> Zachovat aktuální cenu. Okrajový nárůst pojistné ceny v prosinci by měl
            pokračovat.
          </p>
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Doporučení</h3>

        <div className="space-y-3">
          <div className="flex items-start space-x-3 p-3 bg-green-50 rounded-lg">
            <CheckCircle className="text-green-600 flex-shrink-0 mt-1" size={20} />
            <div>
              <p className="font-medium text-gray-900">Akseptuj engine recommendation</p>
              <p className="text-sm text-gray-600">Prosince pro price 89 -- keep margin</p>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-3 bg-yellow-50 rounded-lg">
            <AlertTriangle className="text-yellow-600 flex-shrink-0 mt-1" size={20} />
            <div>
              <p className="font-medium text-gray-900">Seasonal promo campaign</p>
              <p className="text-sm text-gray-600">Review promo effectiveness for March period</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
