import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, TrendingDown, AlertCircle, ArrowRight } from 'lucide-react'

interface Product {
  id: string
  name: string
  category?: string
}

interface MetricCard {
  label: string
  value: number | string
  unit?: string
  icon?: string
  trend?: number
  color: 'blue' | 'orange' | 'red' | 'green'
}

export default function DashboardPage() {
  const navigate = useNavigate()

  // Fetch products for calculating metrics
  const { data: products = [] } = useQuery({
    queryKey: ['dashboardProducts'],
    queryFn: async () => {
      try {
        const response = await fetch('http://localhost:8000/api/products/')
        if (!response.ok) throw new Error('Failed to fetch products')
        return await response.json()
      } catch (error) {
        console.error('Error fetching products:', error)
        return []
      }
    },
  })

  // Calculate metrics
  const totalProducts = products.length
  const requiredChanges = Math.floor(totalProducts * 0.15) // ~15% need changes
  const verifiedAlerts = Math.floor(totalProducts * 0.12) // ~12% have alerts
  const averageMargin = 60.6 // Static for now
  const overpriced = Math.floor(totalProducts * 0.05) // ~5% overpriced
  const underpriced = Math.floor(totalProducts * 0.15) // ~15% underpriced
  const competitorUpdates = 3 // Days old
  const dataFreshness = 20 // Percentage

  const metrics: MetricCard[] = [
    { label: 'CELKEM PRODUKTŮ', value: totalProducts, unit: 'Aktivní v systému', color: 'blue' },
    { label: 'POTŘEBNÉ ZMĚNY', value: requiredChanges, unit: 'Cenová doporučení', color: 'orange' },
    { label: 'OVĚŘENÁ UPOZORNĚNÍ', value: verifiedAlerts, unit: '1 kritických', color: 'red' },
    { label: 'PRŮMĚRNÁ MARŽE', value: `${averageMargin}%`, unit: 'Přes všechny produkty', color: 'green' },
    { label: 'PŘEDRAŽENÉ', value: overpriced, unit: 'vs medián konkurence', color: 'blue' },
    { label: 'PODHODNOCENÉ', value: underpriced, unit: 'Nechávají peníze na stole', color: 'green' },
    { label: 'AKTUALIZACE KONKURENTŮ', value: competitorUpdates, unit: 'Dnes', color: 'blue' },
    { label: 'ČERSTVOST DAT', value: `${dataFreshness}%`, unit: 'Data o konkurenci', color: 'green' },
  ]

  const colorClasses = {
    blue: 'from-blue-50 to-blue-100 text-blue-900',
    orange: 'from-orange-50 to-orange-100 text-orange-900',
    red: 'from-red-50 to-red-100 text-red-900',
    green: 'from-green-50 to-green-100 text-green-900',
  }

  const samplePriceActions = [
    { product: 'Freeze-Dried Strawberries', type: 'Freeze-Dried', current: 69, recommended: 74, change: '+7.2%', action: 'Zvýšit' },
    { product: 'Christmas Nut Gift Box', type: 'Gift Packs', current: 299, recommended: 299, change: '0.8%', action: 'Kontrola' },
    { product: 'Energy Trail Mix', type: 'Mixes', current: 99, recommended: 99, change: '8.0%', action: 'Bundle' },
    { product: 'Cashews Roasted & Salted', type: 'Nuts', current: 89, recommended: 86, change: '-3.4%', action: 'Slevit' },
    { product: 'Premium Nut Mix', type: 'Mixes', current: 189, recommended: 199, change: '+5.3%', action: 'Zvýšit' },
  ]

  const categoryMargins = [
    { category: 'Nuts', margin: 65, width: '65%' },
    { category: 'Dried', margin: 48, width: '48%' },
    { category: 'Created', margin: 72, width: '72%' },
    { category: 'Freeze-Dried', margin: 58, width: '58%' },
    { category: 'Mixes', margin: 42, width: '42%' },
    { category: 'Packs', margin: 35, width: '35%' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Denní přehled</h1>
        <p className="text-gray-600 mt-1">
          ne 29.3.2026 · Nutles.cz · CZK
        </p>
      </div>

      {/* Alert Banner */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <AlertCircle className="text-red-600" size={20} />
          <div>
            <p className="text-sm font-medium text-red-900">Scrape failed: Oriesky.sk — 3 days</p>
          </div>
        </div>
        <button onClick={() => navigate('/audit')} className="text-red-600 hover:text-red-700 text-sm font-medium">Zobrazit upozornění →</button>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => navigate('/opportunities')}
          className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-4 hover:shadow-md transition text-left"
        >
          <p className="text-sm font-medium text-purple-900">Nové příležitosti</p>
          <p className="text-xs text-purple-700 mt-1">Objevuj růstové potenciály</p>
          <ArrowRight size={16} className="text-purple-600 mt-3" />
        </button>
        <button
          onClick={() => navigate('/simulator')}
          className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4 hover:shadow-md transition text-left"
        >
          <p className="text-sm font-medium text-blue-900">Simulátor</p>
          <p className="text-xs text-blue-700 mt-1">Testuj cenové strategie</p>
          <ArrowRight size={16} className="text-blue-600 mt-3" />
        </button>
        <button
          onClick={() => navigate('/products')}
          className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-4 hover:shadow-md transition text-left"
        >
          <p className="text-sm font-medium text-green-900">Produkty</p>
          <p className="text-xs text-green-700 mt-1">Spravuj svůj katalog</p>
          <ArrowRight size={16} className="text-green-600 mt-3" />
        </button>
        <button
          onClick={() => navigate('/seasonality')}
          className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-4 hover:shadow-md transition text-left"
        >
          <p className="text-sm font-medium text-orange-900">Sezónnost</p>
          <p className="text-xs text-orange-700 mt-1">Průběh poptávky v čase</p>
          <ArrowRight size={16} className="text-orange-600 mt-3" />
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <div key={metric.label} className={`bg-gradient-to-br ${colorClasses[metric.color]} rounded-lg p-6 shadow-sm`}>
            <p className="text-xs font-semibold uppercase mb-2 opacity-75">{metric.label}</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold">{metric.value}</p>
                <p className="text-xs opacity-75 mt-1">{metric.unit}</p>
              </div>
              {metric.color === 'blue' && <TrendingUp size={20} className="opacity-40" />}
              {metric.color === 'green' && <TrendingUp size={20} className="opacity-40" />}
              {metric.color === 'orange' && <TrendingDown size={20} className="opacity-40" />}
              {metric.color === 'red' && <TrendingDown size={20} className="opacity-40" />}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Price Actions */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Dnešní cenové akce</h2>
            <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">Zobrazit vše →</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs font-semibold text-gray-600 py-3 px-0">Produkt</th>
                  <th className="text-left text-xs font-semibold text-gray-600 py-3 px-0">Aktuální</th>
                  <th className="text-left text-xs font-semibold text-gray-600 py-3 px-0">Doporučená</th>
                  <th className="text-left text-xs font-semibold text-gray-600 py-3 px-0">Akce</th>
                  <th className="text-left text-xs font-semibold text-gray-600 py-3 px-0">Jistota</th>
                </tr>
              </thead>
              <tbody>
                {samplePriceActions.map((row, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-0 cursor-pointer" onClick={() => navigate('/products')}>
                      <p className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline">{row.product}</p>
                      <p className="text-xs text-gray-500">{row.type}</p>
                    </td>
                    <td className="py-3 px-0 text-sm text-gray-900">{row.current} CZK</td>
                    <td className="py-3 px-0">
                      <span className="text-sm font-medium text-gray-900">{row.recommended} CZK</span>
                      <span className={`text-xs block ${row.change.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
                        {row.change}
                      </span>
                    </td>
                    <td className="py-3 px-0">
                      <span className={`inline-block text-xs px-2 py-1 rounded ${
                        row.action === 'Zvýšit' ? 'bg-green-100 text-green-700' :
                        row.action === 'Kontrola' ? 'bg-yellow-100 text-yellow-700' :
                        row.action === 'Bundle' ? 'bg-blue-100 text-blue-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {row.action}
                      </span>
                    </td>
                    <td className="py-3 px-0">
                      <div className="flex items-center">
                        <div className="w-12 h-2 bg-gray-200 rounded-full mr-2">
                          <div className="h-full bg-blue-600 rounded-full" style={{ width: '75%' }}></div>
                        </div>
                        <span className="text-xs text-gray-600">75%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Margin by Category & Price Position */}
        <div className="space-y-6">
          {/* Margin by Category */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Marže podle kategorie</h3>
            <div className="space-y-3">
              {categoryMargins.map((item) => (
                <div key={item.category}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">{item.category}</span>
                    <span className="text-xs font-semibold text-gray-600">{item.margin}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full">
                    <div
                      className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full"
                      style={{ width: item.width }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Price Position */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Cenová pozice</h3>
            <div className="h-32 bg-gray-50 rounded-lg flex items-end justify-around px-4 py-4 gap-2">
              {[40, 35, 42, 38, 45, 41, 39, 43].map((h, i) => (
                <div key={i} className="flex-1 h-full flex flex-col justify-end">
                  <div
                    className="w-full bg-gradient-to-t from-green-400 to-green-500 rounded-t opacity-75 hover:opacity-100 transition"
                    style={{ height: `${(h / 50) * 100}%` }}
                  ></div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 text-center mt-3">Poslední 8 dní</p>
          </div>
        </div>
      </div>
    </div>
  )
}
