import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, Sliders, BarChart2, DollarSign,
  ShoppingCart, Users, Package,
} from 'lucide-react'
import { API_BASE_URL, authFetch } from '@/api/client'

interface Product {
  id: string
  name: string
  base_price: number
  base_margin: number
  base_sales: number
  purchase_price_with_vat?: number | null
}

const FALLBACK_PRODUCTS: Product[] = [
  { id: '1', name: 'Protein Nut Clusters',                           base_price: 149, base_margin: 28, base_sales: 145 },
  { id: '2', name: 'Protein Nut Cluster Bites',                      base_price: 199, base_margin: 31, base_sales: 132 },
  { id: '3', name: 'Premium Freeze-Dried Fruit Chocolate Bites',     base_price: 175, base_margin: 27, base_sales: 118 },
  { id: '4', name: 'Freeze-Dried Fruit Chocolate Snack Pack 5-pack', base_price: 245, base_margin: 24, base_sales: 96  },
]

type ScenarioTab = 'custom' | 'competitor' | 'cost'

const SCENARIO_TABS: { id: ScenarioTab; label: string; desc: string }[] = [
  { id: 'custom',     label: 'Vlastní změna',         desc: 'Nastav libovolnou cenu a sleduj dopad' },
  { id: 'competitor', label: 'Konkurence sníží',       desc: 'Co kdyby konkurent zlevnil o X %?' },
  { id: 'cost',       label: 'Náklady vzrostou',       desc: 'Co kdyby se nákupní cena zvýšila o Y %?' },
]

function calcRevenue(basePrice: number, baseSales: number, newPrice: number, elasticity: number) {
  const priceChangePct = (newPrice - basePrice) / basePrice * 100
  const salesChangePct = priceChangePct * elasticity * -1
  const newSales = Math.max(5, baseSales + baseSales * salesChangePct / 100)
  const revenue = newPrice * newSales
  const baseRevenue = basePrice * baseSales
  const revenueChangePct = (revenue - baseRevenue) / baseRevenue * 100
  return {
    newPrice: Math.max(0.01, newPrice),
    newSales: Math.round(newSales),
    salesDelta: Math.round(newSales) - baseSales,
    salesChangePct,
    revenue: Math.round(revenue),
    baseRevenue: Math.round(baseRevenue),
    revenueChangePct,
  }
}

export default function SimulatorPage() {
  const location = useLocation()
  const locationState = (location.state as any) ?? {}

  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    locationState.selectedProductId || null
  )
  const [scenarioTab, setScenarioTab] = useState<ScenarioTab>('custom')
  const [elasticity, setElasticity] = useState(1.0)

  // Scénář 1: Vlastní
  const [customPriceChange, setCustomPriceChange] = useState(0)

  // Scénář 2: Konkurence sníží
  const [competitorDropPct, setCompetitorDropPct] = useState(10)

  // Scénář 3: Náklady vzrostou
  const [costIncreasePct, setCostIncreasePct] = useState(10)

  const { data: products = FALLBACK_PRODUCTS, isLoading: productsLoading } = useQuery({
    queryKey: ['simulatorProducts'],
    queryFn: async () => {
      try {
        const response = await authFetch(`${API_BASE_URL}/simulator/products`)
        if (!response.ok) throw new Error('Failed')
        return await response.json() as Product[]
      } catch {
        return FALLBACK_PRODUCTS
      }
    },
  })

  const activeProductId = selectedProductId || products[0]?.id || FALLBACK_PRODUCTS[0].id
  const rawProduct = products.find(p => p.id === activeProductId) || products[0] || FALLBACK_PRODUCTS[0]
  const product: Product = {
    ...rawProduct,
    base_price: locationState.basePrice != null && selectedProductId === locationState.selectedProductId
      ? Number(locationState.basePrice)
      : rawProduct.base_price,
    base_margin: locationState.baseMargin != null && selectedProductId === locationState.selectedProductId
      ? Number(locationState.baseMargin)
      : rawProduct.base_margin,
  }

  const basePrice = product.base_price
  const baseSales = product.base_sales
  const baseCost = product.purchase_price_with_vat ?? basePrice * (1 - product.base_margin / 100)

  // Compute new price per scenario
  const getNewPrice = () => {
    if (scenarioTab === 'custom') return basePrice + customPriceChange
    if (scenarioTab === 'competitor') {
      // Reakce: snížíme o polovinu poklesu konkurence
      return basePrice * (1 - competitorDropPct / 100 * 0.5)
    }
    // cost_increase: přeneseme nárůst nákladů při zachování marže
    const newCost = baseCost * (1 + costIncreasePct / 100)
    const priceRatio = baseCost > 0 ? basePrice / baseCost : 1.35
    return newCost * priceRatio
  }

  const newPrice = Math.max(0.01, getNewPrice())
  const result = calcRevenue(basePrice, baseSales, newPrice, elasticity)

  const newMargin = newPrice > 0 ? ((newPrice - baseCost) / newPrice) * 100 : 0

  let recommendation = ''
  if (result.revenueChangePct > 10)     recommendation = 'Strategie zvyšuje příjem — zvažte implementaci.'
  else if (result.revenueChangePct > 0) recommendation = 'Malý nárůst příjmu. Zkuste jinou kombinaci.'
  else                                  recommendation = 'Tato strategie snižuje příjem. Nedoporučuji.'

  const recBg = result.revenueChangePct > 10 ? 'bg-green-50 border-green-200 text-green-800'
    : result.revenueChangePct > 0 ? 'bg-blue-50 border-blue-200 text-blue-800'
    : 'bg-yellow-50 border-yellow-200 text-yellow-800'

  return (
    <div className="space-y-5">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Simulátor co-když</h1>
        <p className="text-sm text-gray-400 mt-0.5">Modeluj cenové scénáře a odhadni obchodní dopad</p>
      </div>

      {/* ── KPI STRIP ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`border rounded-xl p-4 ${result.revenueChangePct > 0 ? 'bg-green-50 border-green-200' : result.revenueChangePct < 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Příjem</p>
            {result.revenueChangePct > 0
              ? <TrendingUp size={14} className="text-green-500" />
              : result.revenueChangePct < 0
              ? <TrendingDown size={14} className="text-red-500" />
              : <BarChart2 size={14} className="text-gray-300" />}
          </div>
          <p className={`text-2xl font-bold ${result.revenueChangePct > 0 ? 'text-green-700' : result.revenueChangePct < 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {result.revenueChangePct > 0 ? '+' : ''}{result.revenueChangePct.toFixed(1)} %
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{result.revenue.toLocaleString()} Kč</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Nová cena</p>
            <DollarSign size={14} className="text-blue-300" />
          </div>
          <p className="text-2xl font-bold text-blue-700">{newPrice.toFixed(0)} Kč</p>
          <p className={`text-xs mt-0.5 ${newPrice !== basePrice ? (newPrice > basePrice ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>
            {newPrice > basePrice ? '+' : ''}{(newPrice - basePrice).toFixed(0)} Kč
            {' '}({((newPrice - basePrice) / basePrice * 100) > 0 ? '+' : ''}{((newPrice - basePrice) / basePrice * 100).toFixed(1)} %)
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Prodeje</p>
            <ShoppingCart size={14} className="text-gray-300" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{result.newSales} ks</p>
          <p className={`text-xs mt-0.5 ${result.salesDelta > 0 ? 'text-green-600' : result.salesDelta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {result.salesDelta > 0 ? '+' : ''}{result.salesDelta} ks
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

      {/* ── SCENARIO TABS ──────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-gray-200">
        {SCENARIO_TABS.map(tab => (
          <button key={tab.id} onClick={() => setScenarioTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              scenarioTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── CONTROLS + RESULT ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Controls */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">
              {SCENARIO_TABS.find(t => t.id === scenarioTab)?.label}
            </p>
            <p className="text-xs text-gray-400">{SCENARIO_TABS.find(t => t.id === scenarioTab)?.desc}</p>
          </div>

          {/* Product select */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Produkt</label>
            <select value={activeProductId} onChange={e => setSelectedProductId(e.target.value)}
              disabled={productsLoading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50">
              {(products.length ? products : FALLBACK_PRODUCTS).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Scénář 1: Vlastní */}
          {scenarioTab === 'custom' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cena</label>
                <span className="text-sm font-bold text-blue-600">{newPrice.toFixed(0)} Kč</span>
              </div>
              <input type="range"
                min={Math.max(1, basePrice - Math.round(basePrice * 0.4))}
                max={basePrice + Math.round(basePrice * 0.4)}
                step={1}
                value={newPrice}
                onChange={e => setCustomPriceChange(parseFloat(e.target.value) - basePrice)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>-40 %</span>
                <span className={customPriceChange !== 0 ? (customPriceChange > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium') : ''}>
                  {customPriceChange > 0 ? '+' : ''}{customPriceChange.toFixed(0)} Kč
                </span>
                <span>+40 %</span>
              </div>
              <p className="text-xs text-center text-gray-500 mt-1">
                Základní cena: <b>{basePrice} Kč</b>
              </p>
            </div>
          )}

          {/* Scénář 2: Konkurence sníží */}
          {scenarioTab === 'competitor' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pokles ceny konkurence</label>
                <span className="text-sm font-bold text-orange-600">−{competitorDropPct} %</span>
              </div>
              <input type="range" min={1} max={40} step={1} value={competitorDropPct}
                onChange={e => setCompetitorDropPct(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1"><span>−1 %</span><span>−40 %</span></div>
              <div className="mt-3 p-3 bg-orange-50 border border-orange-100 rounded-lg">
                <p className="text-xs text-orange-700 font-medium">Naše reakce</p>
                <p className="text-xs text-orange-600 mt-0.5">
                  Snížíme cenu o {(competitorDropPct * 0.5).toFixed(0)} % (polovina poklesu)
                  → nová cena: <b>{newPrice.toFixed(0)} Kč</b>
                </p>
              </div>
            </div>
          )}

          {/* Scénář 3: Náklady vzrostou */}
          {scenarioTab === 'cost' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nárůst nákupní ceny</label>
                <span className="text-sm font-bold text-purple-600">+{costIncreasePct} %</span>
              </div>
              <input type="range" min={1} max={50} step={1} value={costIncreasePct}
                onChange={e => setCostIncreasePct(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1"><span>+1 %</span><span>+50 %</span></div>
              <div className="mt-3 p-3 bg-purple-50 border border-purple-100 rounded-lg">
                <p className="text-xs text-purple-700 font-medium">Aby marže zůstala {product.base_margin.toFixed(0)} %</p>
                <p className="text-xs text-purple-600 mt-0.5">
                  Nákupní cena: <b>{(baseCost * (1 + costIncreasePct / 100)).toFixed(0)} Kč</b>
                  {' '}→ nová prodejní cena: <b>{newPrice.toFixed(0)} Kč</b>
                </p>
              </div>
            </div>
          )}

          {/* Elasticita */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cenová elasticita</label>
              <span className="text-sm font-bold text-purple-600">{elasticity.toFixed(2)}</span>
            </div>
            <input type="range" min={0.1} max={2.5} step={0.1} value={elasticity}
              onChange={e => setElasticity(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Nízká (0.1)</span><span>Vysoká (2.5)</span>
            </div>
            <div className="flex gap-2 mt-2">
              {[{ l: 'Konzervativní', v: 0.5 }, { l: 'Normální', v: 1.0 }, { l: 'Agresivní', v: 1.8 }].map(p => (
                <button key={p.l} onClick={() => setElasticity(p.v)}
                  className={`flex-1 text-xs py-1.5 rounded-lg border transition ${
                    Math.abs(elasticity - p.v) < 0.05
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                  }`}>
                  {p.l}
                </button>
              ))}
            </div>
          </div>

          {/* Výchozí hodnoty */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Výchozí hodnoty</p>
            <div className="space-y-1">
              {[
                { label: 'Základní cena', value: `${basePrice} Kč` },
                { label: 'Základní marže', value: `${product.base_margin.toFixed(0)} %` },
                { label: 'Nákupní cena s DPH', value: baseCost > 0 ? `${baseCost.toFixed(0)} Kč` : '—' },
                { label: 'Odh. prodeje', value: `${baseSales} ks` },
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

            <div className={`p-4 rounded-xl border mb-4 ${result.revenueChangePct > 10 ? 'bg-green-50 border-green-200' : result.revenueChangePct > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Odhadovaný příjem</p>
              <div className="flex items-baseline justify-between">
                <span className={`text-3xl font-bold ${result.revenueChangePct > 10 ? 'text-green-800' : result.revenueChangePct > 0 ? 'text-blue-800' : 'text-gray-800'}`}>
                  {result.revenue.toLocaleString()} Kč
                </span>
                <span className={`flex items-center gap-1 text-lg font-semibold ${result.revenueChangePct > 0 ? 'text-green-600' : result.revenueChangePct < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                  {result.revenueChangePct > 0 ? <TrendingUp size={18} /> : result.revenueChangePct < 0 ? <TrendingDown size={18} /> : null}
                  {result.revenueChangePct > 0 ? '+' : ''}{result.revenueChangePct.toFixed(1)} %
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Z {result.baseRevenue.toLocaleString()} Kč (základní)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg">
                <p className="text-xs text-purple-600 font-medium mb-1">Elasticita → prodeje</p>
                <p className="text-xl font-bold text-purple-800">
                  {result.salesChangePct > 0 ? '+' : ''}{result.salesChangePct.toFixed(1)} %
                </p>
                <p className="text-xs text-purple-500 mt-0.5">
                  {result.salesDelta > 0 ? '+' : ''}{result.salesDelta} ks
                </p>
              </div>
              <div className={`p-3 rounded-lg border ${result.revenueChangePct > 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                <p className={`text-xs font-medium mb-1 ${result.revenueChangePct > 0 ? 'text-green-600' : 'text-red-600'}`}>Revenue delta</p>
                <p className={`text-xl font-bold ${result.revenueChangePct > 0 ? 'text-green-800' : 'text-red-700'}`}>
                  {result.revenueChangePct > 0 ? '+' : ''}
                  {(result.revenue - result.baseRevenue).toLocaleString()} Kč
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

          {/* Scenario comparison mini-table */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Přehled všech scénářů</p>
            <div className="space-y-1.5">
              {SCENARIO_TABS.map(tab => {
                let p = basePrice
                if (tab.id === 'custom') p = basePrice + customPriceChange
                else if (tab.id === 'competitor') p = basePrice * (1 - competitorDropPct / 100 * 0.5)
                else {
                  const nc = baseCost * (1 + costIncreasePct / 100)
                  p = nc * (baseCost > 0 ? basePrice / baseCost : 1.35)
                }
                p = Math.max(0.01, p)
                const r = calcRevenue(basePrice, baseSales, p, elasticity)
                return (
                  <div key={tab.id}
                    onClick={() => setScenarioTab(tab.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition text-xs ${
                      scenarioTab === tab.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'
                    }`}>
                    <span className="text-gray-700 font-medium">{tab.label}</span>
                    <div className="flex items-center gap-3 text-right">
                      <span className="text-gray-500">{p.toFixed(0)} Kč</span>
                      <span className={`font-semibold w-14 text-right ${r.revenueChangePct > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {r.revenueChangePct > 0 ? '+' : ''}{r.revenueChangePct.toFixed(1)} %
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
