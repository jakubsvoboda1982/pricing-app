import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { TrendingUp, TrendingDown, Sliders, BarChart2, DollarSign, ShoppingCart } from 'lucide-react'
import { API_BASE_URL } from '@/api/client'

interface Product {
  id: string
  name: string
  base_price: number
  base_margin: number
  base_sales: number
}

const FALLBACK_PRODUCTS: Product[] = [
  { id: '1', name: 'Protein Nut Clusters',                           base_price: 100, base_margin: 28, base_sales: 145 },
  { id: '2', name: 'Protein Nut Cluster Bites',                      base_price: 150, base_margin: 31, base_sales: 132 },
  { id: '3', name: 'Premium Freeze-Dried Fruit Chocolate Bites',     base_price: 115, base_margin: 27, base_sales: 118 },
  { id: '4', name: 'Freeze-Dried Fruit Chocolate Snack Pack 5-pack', base_price: 145, base_margin: 24, base_sales: 96  },
]

export default function SimulatorPage() {
  const location = useLocation()
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    (location.state as any)?.selectedProductId || null
  )
  const [priceChange, setPriceChange] = useState(0)
  const [marginTarget, setMarginTarget] = useState(28)
  const [elasticity, setElasticity] = useState(1)

  const { data: products = FALLBACK_PRODUCTS, isLoading: productsLoading } = useQuery({
    queryKey: ['simulatorProducts'],
    queryFn: async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/simulator/products`)
        if (!response.ok) throw new Error('Failed')
        return await response.json() as Product[]
      } catch {
        return FALLBACK_PRODUCTS
      }
    },
  })

  const activeProductId = selectedProductId || products[0]?.id || FALLBACK_PRODUCTS[0].id
  const product = products.find(p => p.id === activeProductId) || products[0]

  const newPrice = product.base_price + priceChange
  const priceChangePercent = (priceChange / product.base_price) * 100
  const salesChange = priceChangePercent * elasticity * -1
  const newSales = Math.max(10, product.base_sales + (product.base_sales * (salesChange / 100)))
  const newMargin = Math.min(50, marginTarget)
  const revenue = newPrice * newSales
  const baseRevenue = product.base_price * product.base_sales
  const revenueChange = ((revenue - baseRevenue) / baseRevenue) * 100
  const salesDelta = Math.round(newSales) - product.base_sales

  let recommendation = ''
  if (revenueChange > 10)     recommendation = 'Strategie zvyšuje příjem — zvažte implementaci.'
  else if (revenueChange > 0) recommendation = 'Malý nárůst příjmu. Zkuste jinou kombinaci.'
  else                        recommendation = 'Tato strategie snižuje příjem. Nedoporučuji.'

  const recBg  = revenueChange > 10 ? 'bg-green-50 border-green-200 text-green-800' : revenueChange > 0 ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-yellow-50 border-yellow-200 text-yellow-800'

  return (
    <div className="space-y-5">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Simulátor co-když</h1>
        <p className="text-sm text-gray-400 mt-0.5">Modeluj cenové scénáře a odhadni obchodní dopad</p>
      </div>

      {/* ── KPI STRIP (live results) ───────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`border border-gray-200 rounded-xl p-4 ${revenueChange > 0 ? 'bg-green-50' : revenueChange < 0 ? 'bg-red-50' : 'bg-white'}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Příjem</p>
            {revenueChange > 0 ? <TrendingUp size={14} className="text-green-500" /> : revenueChange < 0 ? <TrendingDown size={14} className="text-red-500" /> : <BarChart2 size={14} className="text-gray-300" />}
          </div>
          <p className={`text-2xl font-bold ${revenueChange > 0 ? 'text-green-700' : revenueChange < 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {revenueChange > 0 ? '+' : ''}{revenueChange.toFixed(1)} %
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{Math.round(revenue).toLocaleString()} Kč</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Nová cena</p>
            <DollarSign size={14} className="text-blue-300" />
          </div>
          <p className="text-2xl font-bold text-blue-700">{newPrice.toFixed(0)} Kč</p>
          <p className={`text-xs mt-0.5 ${priceChange !== 0 ? (priceChange > 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>
            {priceChange > 0 ? '+' : ''}{priceChange.toFixed(0)} Kč ({priceChangePercent > 0 ? '+' : ''}{priceChangePercent.toFixed(1)} %)
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Prodeje</p>
            <ShoppingCart size={14} className="text-gray-300" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{Math.round(newSales)} ks</p>
          <p className={`text-xs mt-0.5 ${salesDelta > 0 ? 'text-green-600' : salesDelta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {salesDelta > 0 ? '+' : ''}{salesDelta} ks
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Marže</p>
            <Sliders size={14} className="text-gray-300" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{newMargin.toFixed(0)} %</p>
          <p className={`text-xs mt-0.5 ${newMargin - product.base_margin > 0 ? 'text-green-600' : newMargin - product.base_margin < 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {newMargin - product.base_margin > 0 ? '+' : ''}{(newMargin - product.base_margin).toFixed(1)} %
          </p>
        </div>
      </div>

      {/* ── CONTROLS + RESULT ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Controls */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Ovládání simulace</h2>

          {/* Product select */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Produkt</label>
            <select value={activeProductId} onChange={e => setSelectedProductId(e.target.value)}
              disabled={productsLoading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50">
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Price slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cena</label>
              <span className="text-sm font-bold text-blue-600">{newPrice.toFixed(0)} Kč</span>
            </div>
            <input type="range"
              min={product.base_price - 50} max={product.base_price + 50}
              value={newPrice}
              onChange={e => setPriceChange(parseFloat(e.target.value) - product.base_price)}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1.5">
              <span>{(product.base_price - 50).toFixed(0)} Kč</span>
              <span className={priceChange !== 0 ? (priceChange > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium') : ''}>
                {priceChange > 0 ? '+' : ''}{priceChangePercent.toFixed(1)} %
              </span>
              <span>{(product.base_price + 50).toFixed(0)} Kč</span>
            </div>
          </div>

          {/* Margin slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cílová marže</label>
              <span className="text-sm font-bold text-green-600">{newMargin.toFixed(0)} %</span>
            </div>
            <input type="range" min={10} max={50} value={marginTarget}
              onChange={e => setMarginTarget(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1.5"><span>10 %</span><span>50 %</span></div>
          </div>

          {/* Elasticity slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cenová elasticita</label>
              <span className="text-sm font-bold text-purple-600">{elasticity.toFixed(2)}</span>
            </div>
            <input type="range" min={0.5} max={2} step={0.1} value={elasticity}
              onChange={e => setElasticity(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1.5">
              <span>Nízká (0.5)</span>
              <span>Vysoká (2.0)</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Citlivost prodejů na změnu ceny</p>
          </div>

          {/* Current baseline */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Výchozí hodnoty</p>
            <div className="space-y-1.5">
              {[
                { label: 'Základní cena', value: `${product.base_price} Kč` },
                { label: 'Základní marže', value: `${product.base_margin} %` },
                { label: 'Základní prodeje', value: `${product.base_sales} ks` },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-xs">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-semibold text-gray-700">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {/* Revenue card */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Výsledky simulace</h2>

            <div className={`p-4 rounded-xl border mb-4 ${revenueChange > 10 ? 'bg-green-50 border-green-200' : revenueChange > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Odhadovaný příjem</p>
              <div className="flex items-baseline justify-between">
                <span className={`text-3xl font-bold ${revenueChange > 10 ? 'text-green-800' : revenueChange > 0 ? 'text-blue-800' : 'text-gray-800'}`}>
                  {Math.round(revenue).toLocaleString()} Kč
                </span>
                <span className={`flex items-center gap-1 text-lg font-semibold ${revenueChange > 0 ? 'text-green-600' : revenueChange < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                  {revenueChange > 0 ? <TrendingUp size={18} /> : revenueChange < 0 ? <TrendingDown size={18} /> : null}
                  {revenueChange > 0 ? '+' : ''}{revenueChange.toFixed(1)} %
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Z {Math.round(baseRevenue).toLocaleString()} Kč (základní)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg">
                <p className="text-xs text-purple-600 font-medium mb-1">Dopad elasticity</p>
                <p className="text-xl font-bold text-purple-800">{salesChange.toFixed(1)} %</p>
                <p className="text-xs text-purple-500 mt-0.5">změna objemu</p>
              </div>
              <div className={`p-3 rounded-lg border ${revenueChange > 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                <p className={`text-xs font-medium mb-1 ${revenueChange > 0 ? 'text-green-600' : 'text-red-600'}`}>Revenue delta</p>
                <p className={`text-xl font-bold ${revenueChange > 0 ? 'text-green-800' : 'text-red-700'}`}>
                  {revenueChange > 0 ? '+' : ''}{Math.round(revenue - baseRevenue).toLocaleString()} Kč
                </p>
                <p className="text-xs text-gray-400 mt-0.5">vs. základní</p>
              </div>
            </div>
          </div>

          {/* Recommendation */}
          <div className={`border rounded-xl px-4 py-3 ${recBg}`}>
            <p className="text-sm font-semibold mb-0.5">💡 Doporučení</p>
            <p className="text-sm">{recommendation}</p>
          </div>

          {/* Elasticity presets */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Přednastavené elasticity</p>
            <div className="flex gap-2">
              {[
                { label: 'Konzervativní', value: 0.5, color: 'text-green-700 bg-green-50 border-green-200' },
                { label: 'Normální',      value: 1.0, color: 'text-blue-700 bg-blue-50 border-blue-200'   },
                { label: 'Agresivní',     value: 1.8, color: 'text-red-700 bg-red-50 border-red-200'      },
              ].map(preset => (
                <button key={preset.label} onClick={() => setElasticity(preset.value)}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition hover:opacity-80 ${
                    Math.abs(elasticity - preset.value) < 0.05 ? preset.color : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}>
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
