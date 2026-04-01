import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, AlertTriangle, CheckCircle, Star, BarChart2, Shield } from 'lucide-react'
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
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">
        Načítám data...
      </div>
    )
  }

  const score = analytics.hero_score ?? 0
  const scoreColor = score >= 75 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600'
  const scoreBg   = score >= 75 ? 'bg-green-50'   : score >= 50 ? 'bg-yellow-50'   : 'bg-red-50'
  const riskColor = analytics.margin_risk === 'Low' ? 'text-green-700' : analytics.margin_risk === 'Medium' ? 'text-yellow-700' : 'text-red-700'
  const riskBg    = analytics.margin_risk === 'Low' ? 'bg-green-50'    : analytics.margin_risk === 'Medium' ? 'bg-yellow-50'    : 'bg-red-50'

  return (
    <div className="space-y-5">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
        <p className="text-sm text-gray-400 mt-0.5">SKU: {product.sku} · Hero analýza produktu</p>
      </div>

      {/* ── KPI STRIP ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`border border-gray-200 rounded-xl p-4 ${scoreBg}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Hero skóre</p>
            <Star size={14} className={scoreColor} />
          </div>
          <p className={`text-2xl font-bold ${scoreColor}`}>{score}</p>
          <p className="text-xs text-gray-400 mt-0.5">z 100 bodů</p>
        </div>
        <div className={`border border-gray-200 rounded-xl p-4 ${riskBg}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Marže risk</p>
            <Shield size={14} className={riskColor} />
          </div>
          <p className={`text-2xl font-bold ${riskColor}`}>{analytics.margin_risk ?? '—'}</p>
          <p className="text-xs text-gray-400 mt-0.5">úroveň rizika</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Pozice</p>
            <TrendingUp size={14} className="text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-blue-700">Premium</p>
          <p className="text-xs text-gray-400 mt-0.5">tržní pozice</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Repeat</p>
            <BarChart2 size={14} className="text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-purple-700">42 %</p>
          <p className="text-xs text-gray-400 mt-0.5">opakované nákupy</p>
        </div>
      </div>

      {/* ── HERO SCORE BREAKDOWN ───────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Složky Hero skóre</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-xs font-medium text-blue-600 mb-1">Bestseller status</p>
            <p className="text-base font-bold text-blue-900">Aktivní</p>
            <p className="text-xs text-blue-500 mt-1">42% opakovaných nákupů</p>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
            <p className="text-xs font-medium text-indigo-600 mb-1">Broad appeal</p>
            <p className="text-base font-bold text-indigo-900">Silný</p>
            <p className="text-xs text-indigo-500 mt-1">Vysoký zájem v reklamách</p>
          </div>
          <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
            <p className="text-xs font-medium text-purple-600 mb-1">Everyday hero</p>
            <p className="text-base font-bold text-purple-900 leading-tight">Vrací zákazníky</p>
            <p className="text-xs text-purple-500 mt-1">Primární akviziční produkt CZ</p>
          </div>
        </div>
      </div>

      {/* ── TWO-COLUMN DETAIL ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Margin Risk */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Margin Risk</h3>
            {analytics.margin_risk === 'Low'
              ? <CheckCircle size={18} className="text-green-500" />
              : <AlertTriangle size={18} className={analytics.margin_risk === 'Medium' ? 'text-yellow-500' : 'text-red-500'} />
            }
          </div>
          <p className={`text-xl font-bold mb-2 ${riskColor}`}>{analytics.margin_risk}</p>
          <p className="text-sm text-gray-500">
            {analytics.margin_risk === 'Low'
              ? 'Marže stabilní, náklady pod kontrolou.'
              : analytics.margin_risk === 'Medium'
                ? 'Některé cenové pohyby zaznamenány.'
                : 'Vysoká volatilita cen — zkontroluj ceník.'}
          </p>
        </div>

        {/* Positioning */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Positioning</h3>
            <TrendingUp size={18} className="text-blue-500" />
          </div>
          <p className="text-xl font-bold text-blue-700 mb-2">Premium pozice</p>
          <p className="text-sm text-gray-500 mb-3">
            „Everyday Nuties hero — produkt, který přivádí zákazníky zpět."
          </p>
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Doporučené</p>
            <p className="text-sm text-gray-700">Primární akviziční produkt pro CZ trh</p>
          </div>
        </div>
      </div>

      {/* ── PRICE CORRIDOR ─────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Cenový Koridor</h3>
        <div className="space-y-4">
          {[
            { label: 'Naše cena', value: 88, color: 'bg-blue-500' },
            { label: 'Průměr konkurence', value: 85, color: 'bg-gray-400' },
            { label: 'Min. cena (koridor)', value: 78, color: 'bg-yellow-500' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-gray-600">{label}</span>
                <span className="font-semibold text-gray-900">{value}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className={`${color} h-2 rounded-full`} style={{ width: `${value}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
          <p className="text-sm text-yellow-800">
            <span className="font-semibold">Doporučení:</span> Zachovat aktuální cenu. Nárůst v prosinci je v koridoru.
          </p>
        </div>
      </div>

      {/* ── RECOMMENDATIONS ────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Doporučení</h3>
        <div className="space-y-2">
          <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
            <CheckCircle size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-900">Přijmout doporučení enginu</p>
              <p className="text-xs text-gray-500 mt-0.5">Prosincová cena 89 Kč — zachová marži</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg">
            <AlertTriangle size={16} className="text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-900">Sezónní promo kampaň</p>
              <p className="text-xs text-gray-500 mt-0.5">Zkontroluj efektivitu promo pro březnové období</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
