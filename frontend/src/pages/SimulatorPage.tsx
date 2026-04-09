import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, BarChart2, DollarSign,
  ShoppingCart, Sliders, Users, Minus,
} from 'lucide-react'
import { API_BASE_URL, authFetch } from '@/api/client'

interface Product {
  id: string; name: string
  base_price: number; base_margin: number; base_sales: number
  purchase_price_with_vat?: number | null
}

const FALLBACK: Product[] = [
  { id: '1', name: 'Protein Nut Clusters',           base_price: 149, base_margin: 28, base_sales: 145 },
  { id: '2', name: 'Protein Nut Cluster Bites',      base_price: 199, base_margin: 31, base_sales: 132 },
  { id: '3', name: 'Premium Freeze-Dried Fruit Choc',base_price: 175, base_margin: 27, base_sales: 118 },
  { id: '4', name: 'Freeze-Dried Snack Pack 5-pack', base_price: 245, base_margin: 24, base_sales: 96  },
]

type Tab = 'custom' | 'competitor' | 'cost'

const SCENARIOS: { id: Tab; emoji: string; label: string; color: string; activeColor: string }[] = [
  { id: 'custom',     emoji: '🎯', label: 'Vlastní změna',   color: 'border-gray-200 text-gray-600',   activeColor: 'border-blue-500 bg-blue-50 text-blue-700'   },
  { id: 'competitor', emoji: '🏪', label: 'Konkurence sníží', color: 'border-gray-200 text-gray-600',   activeColor: 'border-orange-400 bg-orange-50 text-orange-700' },
  { id: 'cost',       emoji: '📦', label: 'Náklady vzrostou', color: 'border-gray-200 text-gray-600',   activeColor: 'border-purple-500 bg-purple-50 text-purple-700' },
]

function calcResult(basePrice: number, baseSales: number, baseCost: number, newPrice: number, elasticity: number) {
  const priceChangePct = (newPrice - basePrice) / basePrice * 100
  const salesChangePct = priceChangePct * elasticity * -1
  const newSales = Math.max(5, baseSales + baseSales * salesChangePct / 100)
  const newMargin = newPrice > 0 ? (newPrice - baseCost) / newPrice * 100 : 0
  const revenue = newPrice * newSales
  const baseRevenue = basePrice * baseSales
  const revenueChangePct = (revenue - baseRevenue) / baseRevenue * 100
  return {
    newPrice, newSales: Math.round(newSales), salesDelta: Math.round(newSales) - baseSales,
    salesChangePct, newMargin, revenue: Math.round(revenue),
    baseRevenue: Math.round(baseRevenue), revenueChangePct,
  }
}

export default function SimulatorPage() {
  const location = useLocation()
  const state = (location.state as any) ?? {}

  const [productId, setProductId] = useState<string | null>(state.selectedProductId || null)
  const [tab, setTab] = useState<Tab>('custom')
  const [elasticity, setElasticity] = useState(1.0)
  const [customDelta, setCustomDelta] = useState(0)
  const [competitorDrop, setCompetitorDrop] = useState(10)
  const [costIncrease, setCostIncrease] = useState(10)

  const { data: products = FALLBACK, isLoading } = useQuery({
    queryKey: ['simulatorProducts'],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API_BASE_URL}/simulator/products`)
        if (!r.ok) throw new Error()
        return await r.json() as Product[]
      } catch { return FALLBACK }
    },
  })

  const activeId = productId || products[0]?.id || FALLBACK[0].id
  const raw = products.find(p => p.id === activeId) || products[0] || FALLBACK[0]
  const product: Product = {
    ...raw,
    base_price: state.basePrice != null && productId === state.selectedProductId ? Number(state.basePrice) : raw.base_price,
    base_margin: state.baseMargin != null && productId === state.selectedProductId ? Number(state.baseMargin) : raw.base_margin,
  }

  const bp = product.base_price
  const bs = product.base_sales
  const bm = product.base_margin
  const cost = product.purchase_price_with_vat ?? bp * (1 - bm / 100)

  const getNewPrice = (t: Tab = tab): number => {
    if (t === 'custom') return Math.max(0.01, bp + customDelta)
    if (t === 'competitor') return Math.max(0.01, bp * (1 - competitorDrop / 100 * 0.5))
    const nc = cost * (1 + costIncrease / 100)
    return Math.max(0.01, nc * (cost > 0 ? bp / cost : 1.35))
  }

  const active = calcResult(bp, bs, cost, getNewPrice(), elasticity)
  const revUp = active.revenueChangePct > 0
  const revBig = active.revenueChangePct > 10

  return (
    <div className="space-y-5">

      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Simulátor co-když</h1>
        <p className="text-sm text-gray-400 mt-0.5">Modeluj cenové scénáře a odhadni obchodní dopad</p>
      </div>

      {/* KPI STRIP */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Dopad na příjem',
            value: `${active.revenueChangePct > 0 ? '+' : ''}${active.revenueChangePct.toFixed(1)} %`,
            sub: `${active.revenue.toLocaleString()} Kč`,
            icon: active.revenueChangePct > 0 ? TrendingUp : active.revenueChangePct < 0 ? TrendingDown : BarChart2,
            cls: revBig ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : revUp   ? 'bg-blue-50 border-blue-200 text-blue-700'
              :           'bg-red-50 border-red-200 text-red-600',
            valCls: revBig ? 'text-emerald-700' : revUp ? 'text-blue-700' : 'text-red-600',
          },
          {
            label: 'Nová cena',
            value: `${active.newPrice.toFixed(0)} Kč`,
            sub: `${active.newPrice > bp ? '+' : ''}${(active.newPrice - bp).toFixed(0)} Kč (${((active.newPrice - bp) / bp * 100) > 0 ? '+' : ''}${((active.newPrice - bp) / bp * 100).toFixed(1)} %)`,
            icon: DollarSign,
            cls: 'bg-white border-gray-200',
            valCls: 'text-blue-700',
          },
          {
            label: 'Prodeje',
            value: `${active.newSales} ks`,
            sub: `${active.salesDelta > 0 ? '+' : ''}${active.salesDelta} ks`,
            icon: ShoppingCart,
            cls: 'bg-white border-gray-200',
            valCls: active.salesDelta > 0 ? 'text-emerald-700' : active.salesDelta < 0 ? 'text-red-600' : 'text-gray-900',
          },
          {
            label: 'Marže',
            value: `${active.newMargin.toFixed(0)} %`,
            sub: `${active.newMargin - bm > 0 ? '+' : ''}${(active.newMargin - bm).toFixed(1)} %`,
            icon: Sliders,
            cls: 'bg-white border-gray-200',
            valCls: active.newMargin - bm > 0 ? 'text-emerald-700' : active.newMargin - bm < 0 ? 'text-red-600' : 'text-gray-900',
          },
        ].map(({ label, value, sub, icon: Icon, cls, valCls }) => (
          <div key={label} className={`border rounded-xl p-4 ${cls}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
              <Icon size={14} className="text-gray-300" />
            </div>
            <p className={`text-2xl font-bold ${valCls}`}>{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* SCENARIO TABS */}
      <div className="grid grid-cols-3 gap-2">
        {SCENARIOS.map(s => (
          <button key={s.id} onClick={() => setTab(s.id)}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition ${
              tab === s.id ? s.activeColor : `${s.color} hover:bg-gray-50`
            }`}>
            <span className="text-xl leading-none">{s.emoji}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* MAIN LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Controls */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">

          {/* Product */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Produkt</label>
            <select value={activeId} onChange={e => setProductId(e.target.value)}
              disabled={isLoading}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50">
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Scenario-specific controls */}
          {tab === 'custom' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cenová změna</label>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${active.newPrice > bp ? 'text-emerald-600' : active.newPrice < bp ? 'text-red-600' : 'text-gray-500'}`}>
                    {active.newPrice.toFixed(0)} Kč
                  </span>
                  {customDelta !== 0 && (
                    <button onClick={() => setCustomDelta(0)}
                      className="text-xs text-gray-400 hover:text-gray-600 underline">reset</button>
                  )}
                </div>
              </div>
              <input type="range"
                min={Math.max(1, Math.round(bp * 0.6))} max={Math.round(bp * 1.5)}
                step={1} value={active.newPrice}
                onChange={e => setCustomDelta(parseFloat(e.target.value) - bp)}
                className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                <span>−40 % ({Math.round(bp * 0.6)} Kč)</span>
                <span>+50 % ({Math.round(bp * 1.5)} Kč)</span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {[-10, -5, +5, +10].map(pct => {
                  const delta = Math.round(bp * pct / 100)
                  return (
                    <button key={pct} onClick={() => setCustomDelta(delta)}
                      className={`py-1.5 text-xs rounded-lg border transition font-medium ${
                        Math.abs(customDelta - delta) < 1
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}>
                      {pct > 0 ? '+' : ''}{pct} %
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {tab === 'competitor' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pokles ceny konkurence</label>
                <span className="text-sm font-bold text-orange-600">−{competitorDrop} %</span>
              </div>
              <input type="range" min={1} max={40} step={1} value={competitorDrop}
                onChange={e => setCompetitorDrop(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-orange-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1.5"><span>−1 %</span><span>−40 %</span></div>
              <div className="mt-3 p-3.5 bg-orange-50 border border-orange-100 rounded-xl text-sm">
                <p className="text-orange-700 font-semibold mb-1">🏪 Naše reakce</p>
                <p className="text-orange-600 text-xs leading-relaxed">
                  Konkurent zlevní o <b>{competitorDrop} %</b> → snižujeme o <b>{(competitorDrop * 0.5).toFixed(0)} %</b> (polovina poklesu)<br />
                  Nová cena: <b>{active.newPrice.toFixed(0)} Kč</b> (bylo {bp} Kč)
                </p>
              </div>
            </div>
          )}

          {tab === 'cost' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nárůst nákupní ceny</label>
                <span className="text-sm font-bold text-purple-600">+{costIncrease} %</span>
              </div>
              <input type="range" min={1} max={50} step={1} value={costIncrease}
                onChange={e => setCostIncrease(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-purple-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1.5"><span>+1 %</span><span>+50 %</span></div>
              <div className="mt-3 p-3.5 bg-purple-50 border border-purple-100 rounded-xl text-sm">
                <p className="text-purple-700 font-semibold mb-1">📦 Zachování marže</p>
                <p className="text-purple-600 text-xs leading-relaxed">
                  Nákupní cena: <b>{(cost * (1 + costIncrease / 100)).toFixed(0)} Kč</b> (bylo {cost.toFixed(0)} Kč)<br />
                  Aby marže zůstala <b>{bm.toFixed(0)} %</b> → cena musí být <b>{active.newPrice.toFixed(0)} Kč</b>
                </p>
              </div>
            </div>
          )}

          {/* Elasticita */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cenová elasticita</label>
              <span className="text-sm font-bold text-violet-600">{elasticity.toFixed(2)}</span>
            </div>
            <input type="range" min={0.1} max={2.5} step={0.1} value={elasticity}
              onChange={e => setElasticity(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-violet-600"
            />
            <div className="flex gap-1.5 mt-2">
              {[
                { l: 'Konzervativní', v: 0.5, c: 'text-green-700 bg-green-50 border-green-200' },
                { l: 'Normální',      v: 1.0, c: 'text-blue-700 bg-blue-50 border-blue-200'   },
                { l: 'Agresivní',    v: 1.8, c: 'text-red-700 bg-red-50 border-red-200'       },
              ].map(p => (
                <button key={p.l} onClick={() => setElasticity(p.v)}
                  className={`flex-1 text-xs py-1.5 rounded-lg border transition ${
                    Math.abs(elasticity - p.v) < 0.05 ? p.c : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                  }`}>
                  {p.l}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Jak silně reagují prodeje na změnu ceny</p>
          </div>

          {/* Výchozí hodnoty */}
          <div className="bg-gray-50 rounded-xl p-3.5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Výchozí hodnoty produktu</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {[
                ['Základní cena', `${bp} Kč`],
                ['Nákupní cena', `${cost.toFixed(0)} Kč`],
                ['Základní marže', `${bm.toFixed(0)} %`],
                ['Odh. prodeje/měs.', `${bs} ks`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-gray-500">{k}</span>
                  <span className="font-semibold text-gray-700">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-4">

          {/* Main result card */}
          <div className={`rounded-xl border p-5 ${
            revBig ? 'bg-emerald-50 border-emerald-200'
            : revUp ? 'bg-blue-50 border-blue-200'
            :         'bg-gray-50 border-gray-200'
          }`}>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Odhadovaný příjem</p>
            <div className="flex items-baseline justify-between mb-1">
              <span className={`text-4xl font-bold ${revBig ? 'text-emerald-800' : revUp ? 'text-blue-800' : 'text-gray-700'}`}>
                {active.revenue.toLocaleString()} Kč
              </span>
              <span className={`flex items-center gap-1 text-xl font-bold ${revUp ? 'text-emerald-600' : 'text-red-500'}`}>
                {revUp ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                {active.revenueChangePct > 0 ? '+' : ''}{active.revenueChangePct.toFixed(1)} %
              </span>
            </div>
            <p className="text-xs text-gray-400">z {active.baseRevenue.toLocaleString()} Kč (základní hodnota)</p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="bg-white/60 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Dopad elasticity</p>
                <p className="text-lg font-bold text-violet-700">
                  {active.salesChangePct > 0 ? '+' : ''}{active.salesChangePct.toFixed(1)} %
                </p>
                <p className="text-xs text-violet-500">{active.salesDelta > 0 ? '+' : ''}{active.salesDelta} ks prodejů</p>
              </div>
              <div className={`rounded-lg p-3 ${revUp ? 'bg-emerald-100/60' : 'bg-red-100/60'}`}>
                <p className="text-xs text-gray-500 mb-1">Revenue delta</p>
                <p className={`text-lg font-bold ${revUp ? 'text-emerald-700' : 'text-red-600'}`}>
                  {revUp ? '+' : ''}{(active.revenue - active.baseRevenue).toLocaleString()} Kč
                </p>
                <p className="text-xs text-gray-400">vs. základní stav</p>
              </div>
            </div>
          </div>

          {/* Recommendation */}
          <div className={`rounded-xl border px-4 py-3.5 text-sm ${
            revBig ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : revUp ? 'bg-blue-50 border-blue-200 text-blue-800'
            :         'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            <p className="font-semibold mb-0.5">💡 Doporučení</p>
            <p>{revBig ? 'Strategie výrazně zvyšuje příjem — zvažte implementaci.'
              : revUp ? 'Malý nárůst příjmu. Zkuste jinou kombinaci parametrů.'
              : 'Tato strategie snižuje příjem. Nedoporučuji ji implementovat.'}</p>
          </div>

          {/* Scenario comparison */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Porovnání všech scénářů</p>
            <div className="space-y-1">
              {SCENARIOS.map(s => {
                const np = getNewPrice(s.id)
                const r = calcResult(bp, bs, cost, np, elasticity)
                const isActive = tab === s.id
                return (
                  <button key={s.id} onClick={() => setTab(s.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-left border ${
                      isActive ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50 border-transparent'
                    }`}>
                    <span className="text-base">{s.emoji}</span>
                    <span className={`flex-1 text-xs font-medium ${isActive ? 'text-blue-700' : 'text-gray-700'}`}>{s.label}</span>
                    <span className="text-xs text-gray-500 font-mono">{np.toFixed(0)} Kč</span>
                    <span className={`text-xs font-bold w-14 text-right ${r.revenueChangePct > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {r.revenueChangePct > 0 ? '+' : ''}{r.revenueChangePct.toFixed(1)} %
                    </span>
                    {isActive && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
