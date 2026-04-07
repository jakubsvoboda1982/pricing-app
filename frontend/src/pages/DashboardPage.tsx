import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, Package, Star, AlertCircle, ArrowRight,
  BarChart2, Target, Upload, Zap, ShoppingBag,
} from 'lucide-react'
import { API_BASE_URL, authFetch } from '@/api/client'

interface Product {
  id: string; name: string; sku: string; product_code?: string | null
  category?: string; thumbnail_url?: string; current_price?: number | null
  purchase_price_without_vat?: number | null; purchase_vat_rate?: number | null
  purchase_price_with_vat?: number | null; margin?: number | null
  hero_score?: number | null; lowest_competitor_price?: number | null
  market?: string; competitor_urls?: { url: string; name: string; market: string }[]
  stock_quantity?: number | null
}

export default function DashboardPage() {
  const navigate = useNavigate()

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['dashboardProducts'],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE_URL}/products/`)
      if (!r.ok) return []
      return r.json()
    },
  })

  // ── Metrics ────────────────────────────────────────────────────────────────
  const totalProducts   = products.length
  const withPrice       = products.filter(p => p.current_price != null).length
  const withMargin      = products.filter(p => p.margin != null)
  const avgMargin       = withMargin.length ? withMargin.reduce((s, p) => s + Number(p.margin), 0) / withMargin.length : null
  const withHero        = products.filter(p => p.hero_score != null)
  const avgHero         = withHero.length ? Math.round(withHero.reduce((s, p) => s + Number(p.hero_score), 0) / withHero.length) : null
  const lowMarginCount  = withMargin.filter(p => Number(p.margin) < 10).length
  const noCompetitor    = products.filter(p => !p.competitor_urls || p.competitor_urls.length === 0).length
  const noPriceCount    = products.filter(p => p.current_price == null).length
  const lowStockCount   = products.filter(p => p.stock_quantity != null && p.stock_quantity <= 0).length

  const withCompPrice   = products.filter(p => p.lowest_competitor_price != null)
  const prodWithComp    = withCompPrice.length

  // Top / attention products
  const needAttention   = [...products].filter(p => p.hero_score != null && p.hero_score < 50)
    .sort((a, b) => Number(a.hero_score) - Number(b.hero_score)).slice(0, 6)
  const topProducts     = [...products].filter(p => p.hero_score != null)
    .sort((a, b) => Number(b.hero_score) - Number(a.hero_score)).slice(0, 6)
  const displayList     = needAttention.length > 0 ? needAttention : topProducts

  // Category breakdown
  const catMap: Record<string, { count: number; margins: number[] }> = {}
  products.forEach(p => {
    const cat = p.category?.split('|').pop()?.trim() || 'Ostatní'
    if (!catMap[cat]) catMap[cat] = { count: 0, margins: [] }
    catMap[cat].count++
    if (p.margin != null) catMap[cat].margins.push(Number(p.margin))
  })
  const categories = Object.entries(catMap)
    .map(([name, d]) => ({ name, count: d.count, avgMargin: d.margins.length ? d.margins.reduce((a, b) => a + b) / d.margins.length : null }))
    .sort((a, b) => b.count - a.count).slice(0, 6)

  const today = new Date().toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const alertCount = (noPriceCount > 0 ? 1 : 0) + (lowMarginCount > 0 ? 1 : 0) + (noCompetitor > 0 ? 1 : 0)

  return (
    <div className="space-y-5">

      {/* ── HEADER ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Přehled</h1>
          <p className="text-sm text-gray-400 mt-0.5 capitalize">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          {alertCount > 0 && (
            <span className="flex items-center gap-1.5 bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg text-sm font-medium">
              <AlertCircle size={14} /> {alertCount} upozornění
            </span>
          )}
          <button onClick={() => navigate('/products')}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition">
            <Package size={14} /> Sledované produkty
          </button>
        </div>
      </div>

      {/* ── KPI STRIP ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">

        <div onClick={() => navigate('/products')}
          className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-blue-300 hover:shadow-sm transition">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Produkty</p>
          <p className="text-2xl font-bold text-gray-900">{totalProducts}</p>
          <p className="text-xs text-gray-400 mt-0.5">{withPrice} s cenou</p>
        </div>

        <div className={`border border-gray-200 rounded-xl p-4 ${avgMargin != null && avgMargin < 10 ? 'bg-red-50' : avgMargin != null && avgMargin < 20 ? 'bg-yellow-50' : 'bg-white'}`}>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Průměrná marže</p>
          {avgMargin != null ? (
            <>
              <p className={`text-2xl font-bold ${avgMargin >= 20 ? 'text-green-700' : avgMargin >= 10 ? 'text-yellow-700' : 'text-red-600'}`}>
                {avgMargin.toFixed(1)} %
              </p>
              <p className="text-xs text-gray-400 mt-0.5">z {withMargin.length} produktů</p>
            </>
          ) : (
            <><p className="text-2xl font-bold text-gray-300">—</p><p className="text-xs text-gray-400 mt-0.5">Nastav nákupní ceny</p></>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Hero Score</p>
          {avgHero != null ? (
            <>
              <p className={`text-2xl font-bold ${avgHero >= 80 ? 'text-green-700' : avgHero >= 60 ? 'text-yellow-600' : avgHero >= 40 ? 'text-orange-600' : 'text-red-600'}`}>{avgHero}</p>
              <div className="mt-1.5 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${avgHero >= 80 ? 'bg-green-500' : avgHero >= 60 ? 'bg-yellow-400' : avgHero >= 40 ? 'bg-orange-400' : 'bg-red-400'}`}
                  style={{ width: `${avgHero}%` }} />
              </div>
            </>
          ) : (
            <><p className="text-2xl font-bold text-gray-300">—</p><p className="text-xs text-gray-400 mt-0.5">Nastav ceny</p></>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">S konkurencí</p>
          <p className="text-2xl font-bold text-gray-900">{prodWithComp}</p>
          <p className="text-xs text-gray-400 mt-0.5">z {totalProducts} produktů</p>
        </div>

        <div className={`border border-gray-200 rounded-xl p-4 ${lowMarginCount > 0 ? 'bg-red-50' : 'bg-white'}`}>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Nízká marže</p>
          <p className={`text-2xl font-bold ${lowMarginCount > 0 ? 'text-red-600' : 'text-green-700'}`}>{lowMarginCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">produktů pod 10 %</p>
        </div>

        <div className={`border border-gray-200 rounded-xl p-4 ${noCompetitor > 0 ? 'bg-orange-50' : 'bg-white'}`}>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Bez konkurence</p>
          <p className={`text-2xl font-bold ${noCompetitor > 0 ? 'text-orange-600' : 'text-green-700'}`}>{noCompetitor}</p>
          <p className="text-xs text-gray-400 mt-0.5">produktů bez URL</p>
        </div>
      </div>

      {/* ── ALERTS ───────────────────────────────────────────────────────── */}
      {alertCount > 0 && (
        <div className="space-y-2">
          {noPriceCount > 0 && (
            <div onClick={() => navigate('/products')}
              className="cursor-pointer bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-center justify-between hover:bg-orange-100 transition">
              <div className="flex items-center gap-2.5">
                <AlertCircle size={15} className="text-orange-600 flex-shrink-0" />
                <p className="text-sm text-orange-800"><span className="font-semibold">{noPriceCount} produktů</span> nemá nastavenou prodejní cenu</p>
              </div>
              <ArrowRight size={14} className="text-orange-400 flex-shrink-0" />
            </div>
          )}
          {lowMarginCount > 0 && (
            <div onClick={() => navigate('/products')}
              className="cursor-pointer bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between hover:bg-red-100 transition">
              <div className="flex items-center gap-2.5">
                <TrendingDown size={15} className="text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-800"><span className="font-semibold">{lowMarginCount} produktů</span> má marži pod 10 % — zkontroluj nákupní ceny</p>
              </div>
              <ArrowRight size={14} className="text-red-400 flex-shrink-0" />
            </div>
          )}
          {noCompetitor > 0 && (
            <div onClick={() => navigate('/products')}
              className="cursor-pointer bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between hover:bg-blue-100 transition">
              <div className="flex items-center gap-2.5">
                <Target size={15} className="text-blue-600 flex-shrink-0" />
                <p className="text-sm text-blue-800"><span className="font-semibold">{noCompetitor} produktů</span> nemá sledované URL konkurence</p>
              </div>
              <ArrowRight size={14} className="text-blue-400 flex-shrink-0" />
            </div>
          )}
        </div>
      )}

      {/* ── MAIN GRID ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Products needing attention */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              {needAttention.length > 0 ? (
                <><AlertCircle size={14} className="text-orange-500" /> Produkty potřebující pozornost</>
              ) : (
                <><Star size={14} className="text-yellow-500" /> Top produkty podle Hero Score</>
              )}
            </h2>
            <button onClick={() => navigate('/products')} className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
              Zobrazit vše <ArrowRight size={11} />
            </button>
          </div>

          {isLoading ? (
            <div className="p-10 text-center text-sm text-gray-400">Načítám...</div>
          ) : totalProducts === 0 ? (
            <div className="p-10 text-center">
              <Package size={40} className="mx-auto text-gray-200 mb-3" />
              <p className="text-sm text-gray-500 font-medium mb-4">Zatím žádné sledované produkty</p>
              <button onClick={() => navigate('/catalog')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                Vybrat z katalogu
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {displayList.map(p => {
                const score = p.hero_score ?? 0
                const scoreColor = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-400' : score >= 40 ? 'bg-orange-400' : 'bg-red-400'
                return (
                  <div key={p.id} onClick={() => navigate(`/products/${p.id}`)}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer transition">
                    {p.thumbnail_url ? (
                      <img src={p.thumbnail_url} alt="" className="w-8 h-8 object-contain rounded bg-gray-50 border flex-shrink-0"
                        onError={(e) => { e.currentTarget.style.display = 'none' }} />
                    ) : (
                      <div className="w-8 h-8 bg-blue-50 rounded border flex items-center justify-center flex-shrink-0">
                        <Package size={13} className="text-blue-300" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.category?.split('|').pop()?.trim() || p.sku}</p>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      {p.current_price != null && (
                        <span className="text-sm font-semibold text-gray-700">
                          {Number(p.current_price).toLocaleString('cs-CZ')} Kč
                        </span>
                      )}
                      {p.margin != null && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          Number(p.margin) >= 20 ? 'bg-green-100 text-green-700'
                          : Number(p.margin) >= 10 ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                        }`}>
                          {Number(p.margin).toFixed(1)} %
                        </span>
                      )}
                      <div className="flex items-center gap-1.5">
                        <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${scoreColor}`} style={{ width: `${score}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 w-5 text-right">{score}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Category breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-1.5">
              <BarChart2 size={13} className="text-gray-400" /> Marže podle kategorie
            </h3>
            {categories.length === 0 ? (
              <p className="text-xs text-gray-400">Žádné kategorie</p>
            ) : (
              <div className="space-y-3">
                {categories.map(cat => (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600 truncate max-w-[130px]" title={cat.name}>{cat.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{cat.count} ks</span>
                        <span className={`text-xs font-semibold w-12 text-right ${
                          cat.avgMargin == null ? 'text-gray-400'
                          : cat.avgMargin >= 20 ? 'text-green-700'
                          : cat.avgMargin >= 10 ? 'text-yellow-600'
                          : 'text-red-600'
                        }`}>
                          {cat.avgMargin != null ? `${cat.avgMargin.toFixed(1)} %` : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${
                        cat.avgMargin == null ? 'bg-gray-200'
                        : cat.avgMargin >= 20 ? 'bg-green-400'
                        : cat.avgMargin >= 10 ? 'bg-yellow-400'
                        : 'bg-red-400'
                      }`} style={{ width: cat.avgMargin != null ? `${Math.min(cat.avgMargin, 100)}%` : '0%' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
              <Zap size={13} className="text-gray-400" /> Rychlé akce
            </h3>
            <div className="space-y-1">
              {[
                { label: 'Přidat z katalogu', path: '/catalog', icon: ShoppingBag, color: 'text-blue-500' },
                { label: 'Importovat produkty', path: '/import', icon: Upload, color: 'text-green-500' },
                { label: 'Přidat konkurenta', path: '/competitors', icon: Target, color: 'text-purple-500' },
                { label: 'Simulátor cen', path: '/simulator', icon: BarChart2, color: 'text-orange-500' },
                { label: 'Doporučení cen', path: '/recommendations', icon: TrendingUp, color: 'text-cyan-500' },
              ].map(({ label, path, icon: Icon, color }) => (
                <button key={path} onClick={() => navigate(path)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition text-left group">
                  <Icon size={14} className={`${color} flex-shrink-0`} />
                  {label}
                  <ArrowRight size={11} className="ml-auto text-gray-200 group-hover:text-gray-400 transition" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
