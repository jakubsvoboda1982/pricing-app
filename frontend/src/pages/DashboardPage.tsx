import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, TrendingDown, Package, Star, AlertCircle, ArrowRight, BarChart2, Target, ShoppingCart } from 'lucide-react'
import { API_BASE_URL } from '@/api/client'

interface Product {
  id: string
  name: string
  sku: string
  category?: string
  thumbnail_url?: string
  current_price?: number | null
  purchase_price?: number | null
  margin?: number | null
  hero_score?: number | null
  market?: string
  competitor_urls?: { url: string; name: string; market: string }[]
}

export default function DashboardPage() {
  const navigate = useNavigate()

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['dashboardProducts'],
    queryFn: async () => {
      const r = await fetch(`${API_BASE_URL}/products/`)
      if (!r.ok) return []
      return r.json()
    },
  })

  // --- Real metrics ---
  const totalProducts = products.length
  const withPrice = products.filter((p) => p.current_price != null).length
  const withMargin = products.filter((p) => p.margin != null)
  const avgMargin = withMargin.length
    ? withMargin.reduce((s, p) => s + Number(p.margin), 0) / withMargin.length
    : null
  const withHero = products.filter((p) => p.hero_score != null)
  const avgHero = withHero.length
    ? Math.round(withHero.reduce((s, p) => s + Number(p.hero_score), 0) / withHero.length)
    : null

  const lowMarginCount = withMargin.filter((p) => Number(p.margin) < 10).length
  const noCompetitorCount = products.filter(
    (p) => !p.competitor_urls || p.competitor_urls.length === 0
  ).length
  const noPriceCount = products.filter((p) => p.current_price == null).length

  // Top 5 products by hero score
  const topProducts = [...products]
    .filter((p) => p.hero_score != null)
    .sort((a, b) => Number(b.hero_score) - Number(a.hero_score))
    .slice(0, 5)

  // Products needing attention (low hero score)
  const needAttention = [...products]
    .filter((p) => p.hero_score != null && p.hero_score < 50)
    .sort((a, b) => Number(a.hero_score) - Number(b.hero_score))
    .slice(0, 5)

  // Category breakdown
  const catMap: Record<string, { count: number; margin: number[]; hero: number[] }> = {}
  products.forEach((p) => {
    const cat = p.category?.split('|').pop()?.trim() || 'Ostatní'
    if (!catMap[cat]) catMap[cat] = { count: 0, margin: [], hero: [] }
    catMap[cat].count++
    if (p.margin != null) catMap[cat].margin.push(Number(p.margin))
    if (p.hero_score != null) catMap[cat].hero.push(Number(p.hero_score))
  })
  const categories = Object.entries(catMap)
    .map(([name, d]) => ({
      name,
      count: d.count,
      avgMargin: d.margin.length ? d.margin.reduce((a, b) => a + b, 0) / d.margin.length : null,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  const today = new Date().toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Denní přehled</h1>
          <p className="text-sm text-gray-500 mt-0.5">{today} · Nuties.cz · CZK</p>
        </div>
        <button
          onClick={() => navigate('/products')}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm transition"
        >
          <Package size={14} />
          Sledované produkty
        </button>
      </div>

      {/* Alerts */}
      {(lowMarginCount > 0 || noPriceCount > 0) && (
        <div className="space-y-2">
          {noPriceCount > 0 && (
            <div
              onClick={() => navigate('/products')}
              className="cursor-pointer bg-orange-50 border border-orange-200 rounded-xl p-3.5 flex items-center justify-between hover:bg-orange-100 transition"
            >
              <div className="flex items-center gap-2.5">
                <AlertCircle size={16} className="text-orange-600 flex-shrink-0" />
                <p className="text-sm text-orange-800">
                  <span className="font-semibold">{noPriceCount} produktů</span> nemá nastavenou prodejní cenu
                </p>
              </div>
              <ArrowRight size={15} className="text-orange-500" />
            </div>
          )}
          {lowMarginCount > 0 && (
            <div
              onClick={() => navigate('/products')}
              className="cursor-pointer bg-red-50 border border-red-200 rounded-xl p-3.5 flex items-center justify-between hover:bg-red-100 transition"
            >
              <div className="flex items-center gap-2.5">
                <TrendingDown size={16} className="text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-800">
                  <span className="font-semibold">{lowMarginCount} produktů</span> má marži pod 10 % — zkontroluj nákupní ceny
                </p>
              </div>
              <ArrowRight size={15} className="text-red-500" />
            </div>
          )}
          {noCompetitorCount > 0 && (
            <div
              onClick={() => navigate('/products')}
              className="cursor-pointer bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex items-center justify-between hover:bg-blue-100 transition"
            >
              <div className="flex items-center gap-2.5">
                <Target size={16} className="text-blue-600 flex-shrink-0" />
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">{noCompetitorCount} produktů</span> nemá sledované URL konkurence
                </p>
              </div>
              <ArrowRight size={15} className="text-blue-500" />
            </div>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => navigate('/products')}
          className="cursor-pointer bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sledované produkty</p>
            <Package size={16} className="text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900">{totalProducts}</p>
          <p className="text-xs text-gray-400 mt-1">{withPrice} s aktuální cenou</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Průměrná marže</p>
            <TrendingUp size={16} className="text-green-500" />
          </div>
          {avgMargin != null ? (
            <>
              <p className={`text-3xl font-bold ${avgMargin >= 20 ? 'text-green-600' : avgMargin >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                {avgMargin.toFixed(1)} %
              </p>
              <p className="text-xs text-gray-400 mt-1">z {withMargin.length} produktů s nák. cenou</p>
            </>
          ) : (
            <>
              <p className="text-3xl font-bold text-gray-300">—</p>
              <p className="text-xs text-gray-400 mt-1">Nastav nákupní ceny</p>
            </>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Průměrný Hero Score</p>
            <Star size={16} className="text-yellow-500" />
          </div>
          {avgHero != null ? (
            <>
              <p className={`text-3xl font-bold ${avgHero >= 80 ? 'text-green-600' : avgHero >= 60 ? 'text-yellow-600' : avgHero >= 40 ? 'text-orange-600' : 'text-red-600'}`}>
                {avgHero}
              </p>
              <div className="mt-2 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${avgHero >= 80 ? 'bg-green-500' : avgHero >= 60 ? 'bg-yellow-400' : avgHero >= 40 ? 'bg-orange-400' : 'bg-red-400'}`}
                  style={{ width: `${avgHero}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-3xl font-bold text-gray-300">—</p>
              <p className="text-xs text-gray-400 mt-1">Přidej ceny a nák. ceny</p>
            </>
          )}
        </div>

        <div
          onClick={() => navigate('/catalog')}
          className="cursor-pointer bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bez konkurence</p>
            <ShoppingCart size={16} className="text-purple-500" />
          </div>
          <p className={`text-3xl font-bold ${noCompetitorCount > 0 ? 'text-orange-600' : 'text-green-600'}`}>
            {noCompetitorCount}
          </p>
          <p className="text-xs text-gray-400 mt-1">produktů bez URL konkurentů</p>
        </div>
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Products needing attention */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-gray-800">
              {needAttention.length > 0 ? '⚠️ Produkty potřebující pozornost' : '✅ Top produkty podle Hero Score'}
            </h2>
            <button onClick={() => navigate('/products')} className="text-xs text-blue-600 hover:underline">
              Zobrazit vše →
            </button>
          </div>

          {totalProducts === 0 ? (
            <div className="text-center py-8">
              <Package size={40} className="mx-auto text-gray-200 mb-3" />
              <p className="text-sm text-gray-400 mb-4">Zatím žádné sledované produkty</p>
              <button
                onClick={() => navigate('/catalog')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
              >
                Vybrat z katalogu
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {(needAttention.length > 0 ? needAttention : topProducts).map((p) => {
                const score = p.hero_score ?? 0
                const scoreColor = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-400' : score >= 40 ? 'bg-orange-400' : 'bg-red-400'
                return (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/products/${p.id}`)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition"
                  >
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
                    <div className="flex items-center gap-3 flex-shrink-0">
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
                          {Number(p.margin).toFixed(1)}%
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

        {/* Right sidebar */}
        <div className="space-y-5">
          {/* Category breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">
              <BarChart2 size={14} className="inline mr-1.5 text-gray-400" />
              Marže podle kategorie
            </h3>
            {categories.length === 0 ? (
              <p className="text-xs text-gray-400">Žádné kategorie</p>
            ) : (
              <div className="space-y-3">
                {categories.map((cat) => (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600 truncate max-w-[120px]" title={cat.name}>{cat.name}</span>
                      <span className="text-xs font-semibold text-gray-700 ml-2">
                        {cat.avgMargin != null ? `${cat.avgMargin.toFixed(1)}%` : '—'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          cat.avgMargin == null ? 'bg-gray-200'
                          : cat.avgMargin >= 20 ? 'bg-green-400'
                          : cat.avgMargin >= 10 ? 'bg-yellow-400'
                          : 'bg-red-400'
                        }`}
                        style={{ width: cat.avgMargin != null ? `${Math.min(cat.avgMargin, 100)}%` : '0%' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Rychlé akce</h3>
            <div className="space-y-2">
              {[
                { label: 'Přidat produkt z katalogu', path: '/catalog', icon: Package },
                { label: 'Importovat produkty', path: '/import', icon: TrendingUp },
                { label: 'Přidat konkurenta', path: '/competitors', icon: Target },
                { label: 'Simulátor cen', path: '/simulator', icon: BarChart2 },
              ].map(({ label, path, icon: Icon }) => (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition text-left"
                >
                  <Icon size={14} className="text-gray-400 flex-shrink-0" />
                  {label}
                  <ArrowRight size={12} className="ml-auto text-gray-300" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
