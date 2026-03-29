import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { TrendingUp, TrendingDown, DollarSign, ArrowRight } from 'lucide-react'
import { API_BASE_URL } from '@/api/client'

interface Product {
  id: string
  name: string
  base_price: number
  base_margin: number
  base_sales: number
}

interface SimulationResult {
  price: number
  margin: number
  estimated_sales: number
  revenue: number
  change_percent: number
  recommendation: string
}

const FALLBACK_PRODUCTS: Product[] = [
  { id: '1', name: 'Protein Nut Clusters', base_price: 100, base_margin: 28, base_sales: 145 },
  { id: '2', name: 'Protein Nut Cluster Bites', base_price: 150, base_margin: 31, base_sales: 132 },
  { id: '3', name: 'Premium Freeze-Dried Fruit Chocolate Bites', base_price: 115, base_margin: 27, base_sales: 118 },
  { id: '4', name: 'Freeze-Dried Fruit Chocolate Snack Pack 5-pack', base_price: 145, base_margin: 24, base_sales: 96 },
]

export default function SimulatorPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    (location.state as any)?.selectedProductId || null
  )
  const [priceChange, setPriceChange] = useState(0)
  const [marginTarget, setMarginTarget] = useState(28)
  const [elasticity, setElasticity] = useState(1)

  // Fetch products from backend
  const { data: products = FALLBACK_PRODUCTS, isLoading: productsLoading } = useQuery({
    queryKey: ['simulatorProducts'],
    queryFn: async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/simulator/products`)
        if (!response.ok) throw new Error('Failed to fetch products')
        const data = await response.json()
        return data as Product[]
      } catch (error) {
        console.error('Error fetching simulator products:', error)
        return FALLBACK_PRODUCTS
      }
    },
  })

  // Set default product on load
  const activeProductId = selectedProductId || products[0]?.id || FALLBACK_PRODUCTS[0].id
  const product = products.find((p) => p.id === activeProductId) || products[0]

  // Calculate simulation locally for instant feedback
  const newPrice = product.base_price + priceChange
  const priceChangePercent = (priceChange / product.base_price) * 100
  const salesChange = priceChangePercent * elasticity * -1
  const newSales = Math.max(10, product.base_sales + (product.base_sales * (salesChange / 100)))
  const newMargin = Math.min(50, marginTarget)
  const revenue = newPrice * newSales
  const baseRevenue = product.base_price * product.base_sales
  const revenueChange = ((revenue - baseRevenue) / baseRevenue) * 100

  // Generate recommendation
  let recommendation = ''
  if (revenueChange > 10) {
    recommendation = 'Tato strategie ceníku zvyšuje příjem. Zvažte implementaci.'
  } else if (revenueChange > 0) {
    recommendation = 'Malý nárůst příjmu. Zkuste jinou kombinaci.'
  } else {
    recommendation = 'Tato strategie snižuje příjem. Nedoporučuji ji.'
  }

  const result: SimulationResult = {
    price: newPrice,
    margin: newMargin,
    estimated_sales: Math.round(newSales),
    revenue: Math.round(revenue),
    change_percent: revenueChange,
    recommendation,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Simulátor co-když</h1>
        <p className="text-gray-600 mt-1">Modulujte scénáře změn cen a zjistěte odhadovaný obchodní dopad</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => navigate('/opportunities')}
          className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-4 hover:shadow-md transition text-left"
        >
          <p className="text-sm font-medium text-purple-900">Nové příležitosti</p>
          <p className="text-xs text-purple-700 mt-1">Zpět k příležitostem</p>
          <ArrowRight size={16} className="text-purple-600 mt-3" />
        </button>
        <button
          onClick={() => navigate('/products')}
          className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-4 hover:shadow-md transition text-left"
        >
          <p className="text-sm font-medium text-green-900">Produkty</p>
          <p className="text-xs text-green-700 mt-1">Přehled všech produktů</p>
          <ArrowRight size={16} className="text-green-600 mt-3" />
        </button>
        <button
          onClick={() => navigate('/seasonality')}
          className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-4 hover:shadow-md transition text-left"
        >
          <p className="text-sm font-medium text-orange-900">Sezónnost</p>
          <p className="text-xs text-orange-700 mt-1">Sezónní vzory poptávky</p>
          <ArrowRight size={16} className="text-orange-600 mt-3" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Side - Controls */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center space-x-2">
            <span className="text-2xl">⚙️</span>
            <span>Ovládací simulace</span>
          </h2>

          {/* Product Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">PRODUKT</label>
            <select
              value={activeProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              disabled={productsLoading}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 disabled:text-gray-500"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-600 mt-2">
              {productsLoading ? 'Načítám produkty...' : 'Vyberte produkt pro zahájení simulace'}
            </p>
          </div>

          {/* Price Slider */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">CENA</label>
              <span className="text-lg font-bold text-blue-600">{result.price.toFixed(0)} CZK</span>
            </div>
            <input
              type="range"
              min={product.base_price - 50}
              max={product.base_price + 50}
              value={newPrice}
              onChange={(e) => setPriceChange(parseFloat(e.target.value) - product.base_price)}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-2">
              <span>{(product.base_price - 50).toFixed(0)} CZK</span>
              <span className={priceChange > 0 ? 'text-green-600 font-medium' : priceChange < 0 ? 'text-red-600 font-medium' : ''}>
                {priceChange > 0 ? '+' : ''}{priceChangePercent.toFixed(1)}%
              </span>
              <span>{(product.base_price + 50).toFixed(0)} CZK</span>
            </div>
          </div>

          {/* Margin Slider */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">MARŽE</label>
              <span className="text-lg font-bold text-green-600">{result.margin.toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={50}
              value={marginTarget}
              onChange={(e) => setMarginTarget(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-2">
              <span>10%</span>
              <span></span>
              <span>50%</span>
            </div>
          </div>

          {/* Elasticity Slider */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">CENOVÁ ELASTICITA</label>
              <span className="text-lg font-bold text-purple-600">{elasticity.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={elasticity}
              onChange={(e) => setElasticity(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            <p className="text-xs text-gray-600 mt-2">Jak citlivé jsou prodeje na změnu ceny</p>
          </div>

          {/* Current Values */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-xs font-semibold text-gray-600 uppercase mb-3">Aktuální hodnoty</p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-700">Základní cena:</span>
                <span className="font-medium text-gray-900">{product.base_price} CZK</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-700">Základní marže:</span>
                <span className="font-medium text-gray-900">{product.base_margin}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-700">Základní prodeje:</span>
                <span className="font-medium text-gray-900">{product.base_sales} ks</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Results */}
        <div className="space-y-6">
          {/* Results Cards */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center space-x-2">
              <span className="text-2xl">📊</span>
              <span>Výsledky simulace</span>
            </h2>

            {/* Revenue Card */}
            <div className="mb-6 p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
              <p className="text-xs font-semibold text-blue-600 uppercase mb-2">Odhadovaný příjem</p>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold text-blue-900">{result.revenue.toLocaleString()} CZK</span>
                <span
                  className={`text-lg font-semibold flex items-center space-x-1 ${
                    result.change_percent > 0 ? 'text-green-600' : result.change_percent < 0 ? 'text-red-600' : 'text-gray-600'
                  }`}
                >
                  {result.change_percent > 0 ? <TrendingUp size={20} /> : result.change_percent < 0 ? <TrendingDown size={20} /> : null}
                  <span>{result.change_percent > 0 ? '+' : ''}{result.change_percent.toFixed(1)}%</span>
                </span>
              </div>
              <p className="text-xs text-blue-700 mt-2">
                Z {(product.base_price * product.base_sales).toLocaleString()} CZK
              </p>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Price */}
              <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200">
                <p className="text-xs font-semibold text-purple-600 uppercase mb-2">Nová cena</p>
                <p className="text-2xl font-bold text-purple-900">{result.price.toFixed(0)} CZK</p>
                <p className="text-xs text-purple-700 mt-1">
                  {priceChange > 0 ? '+' : ''}{priceChange.toFixed(0)} CZK
                </p>
              </div>

              {/* Sales */}
              <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
                <p className="text-xs font-semibold text-green-600 uppercase mb-2">Prodeje</p>
                <p className="text-2xl font-bold text-green-900">{result.estimated_sales} ks</p>
                <p className={`text-xs mt-1 ${(result.estimated_sales - product.base_sales) < 0 ? 'text-red-700' : 'text-green-700'}`}>
                  {result.estimated_sales - product.base_sales > 0 ? '+' : ''}{result.estimated_sales - product.base_sales} ks
                </p>
              </div>

              {/* Margin */}
              <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg border border-orange-200">
                <p className="text-xs font-semibold text-orange-600 uppercase mb-2">Marže</p>
                <p className="text-2xl font-bold text-orange-900">{result.margin.toFixed(0)}%</p>
                <p className={`text-xs mt-1 ${result.margin - product.base_margin > 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {result.margin - product.base_margin > 0 ? '+' : ''}{(result.margin - product.base_margin).toFixed(1)}%
                </p>
              </div>

              {/* Elasticity Impact */}
              <div className="p-4 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg border border-indigo-200">
                <p className="text-xs font-semibold text-indigo-600 uppercase mb-2">Dopad elasticity</p>
                <p className="text-2xl font-bold text-indigo-900">{salesChange.toFixed(1)}%</p>
                <p className="text-xs text-indigo-700 mt-1">Změna prodejů</p>
              </div>
            </div>
          </div>

          {/* Recommendation */}
          <div
            className={`p-4 rounded-lg border ${
              result.change_percent > 10
                ? 'bg-green-50 border-green-200'
                : result.change_percent > 0
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-yellow-50 border-yellow-200'
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                result.change_percent > 10
                  ? 'text-green-900'
                  : result.change_percent > 0
                    ? 'text-blue-900'
                    : 'text-yellow-900'
              }`}
            >
              💡 Doporučení:
            </p>
            <p
              className={`text-sm mt-1 ${
                result.change_percent > 10
                  ? 'text-green-800'
                  : result.change_percent > 0
                    ? 'text-blue-800'
                    : 'text-yellow-800'
              }`}
            >
              {result.recommendation}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
