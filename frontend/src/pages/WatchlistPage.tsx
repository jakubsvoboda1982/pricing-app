import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Bell, BellOff, Eye, Package, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '@/api/client'

interface WatchedProduct {
  id: string; product_id: string; product_name: string; product_sku: string
  is_price_alert_enabled: boolean; is_stock_alert_enabled: boolean; added_at: string
}

export default function WatchlistPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data: watchlist = [], isLoading } = useQuery({
    queryKey: ['watchlist'],
    queryFn: () => apiClient.listWatchlist(),
  })

  const removeMutation      = useMutation({ mutationFn: (pid: string) => apiClient.removeFromWatchlist(pid), onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist'] }) })
  const togglePriceMutation = useMutation({ mutationFn: (wid: string) => apiClient.togglePriceAlert(wid),    onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist'] }) })
  const toggleStockMutation = useMutation({ mutationFn: (wid: string) => apiClient.toggleStockAlert(wid),    onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist'] }) })

  const list = watchlist as WatchedProduct[]
  const priceAlertsOn = list.filter(w => w.is_price_alert_enabled).length
  const stockAlertsOn = list.filter(w => w.is_stock_alert_enabled).length

  return (
    <div className="space-y-5">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Watchlist</h1>
          <p className="text-sm text-gray-400 mt-0.5">Monitoruj tržní změny u vybraných produktů</p>
        </div>
        {list.length > 0 && (
          <button onClick={() => navigate('/products')}
            className="flex items-center gap-1.5 text-sm text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition">
            <Package size={13} /> Přidat produkty <ArrowRight size={12} />
          </button>
        )}
      </div>

      {/* ── KPI STRIP ──────────────────────────────────────────────────── */}
      {list.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Sledovaných</p>
            <p className="text-2xl font-bold text-gray-900">{list.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">produktů</p>
          </div>
          <div className={`border border-gray-200 rounded-xl p-4 ${priceAlertsOn > 0 ? 'bg-blue-50' : 'bg-white'}`}>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Cenová upoz.</p>
            <p className={`text-2xl font-bold ${priceAlertsOn > 0 ? 'text-blue-700' : 'text-gray-300'}`}>{priceAlertsOn}</p>
            <p className="text-xs text-gray-400 mt-0.5">aktivních</p>
          </div>
          <div className={`border border-gray-200 rounded-xl p-4 ${stockAlertsOn > 0 ? 'bg-green-50' : 'bg-white'}`}>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Skladová upoz.</p>
            <p className={`text-2xl font-bold ${stockAlertsOn > 0 ? 'text-green-700' : 'text-gray-300'}`}>{stockAlertsOn}</p>
            <p className="text-xs text-gray-400 mt-0.5">aktivních</p>
          </div>
        </div>
      )}

      {/* ── CONTENT ────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">Načítám...</div>
      ) : list.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Eye size={44} className="mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-gray-500 font-medium mb-1">Watchlist je prázdný</p>
          <p className="text-xs text-gray-400 mb-5">Přidejte produkty ze stránky Sledované produkty.</p>
          <button onClick={() => navigate('/products')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            Přejít na produkty
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center px-5 py-3 border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-400 uppercase tracking-wide">
            <div className="flex-1">Produkt</div>
            <div className="w-40 text-center">Upoz. na cenu</div>
            <div className="w-40 text-center">Upoz. na sklad</div>
            <div className="w-20 text-center">Přidáno</div>
            <div className="w-12" />
          </div>

          <div className="divide-y divide-gray-50">
            {list.map(watched => (
              <div key={watched.id} className="flex items-center px-5 py-3.5 hover:bg-gray-50 transition">
                {/* Product */}
                <div className="flex-1 min-w-0">
                  <button onClick={() => navigate(`/products/${watched.product_id}`)}
                    className="text-sm font-medium text-blue-600 hover:underline truncate block max-w-xs text-left">
                    {watched.product_name}
                  </button>
                  <span className="text-xs font-mono text-gray-400">{watched.product_sku}</span>
                </div>

                {/* Price alert */}
                <div className="w-40 flex justify-center">
                  <button onClick={() => togglePriceMutation.mutate(watched.id)} disabled={togglePriceMutation.isPending}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      watched.is_price_alert_enabled ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}>
                    {watched.is_price_alert_enabled ? <><Bell size={12} /> Zapnuto</> : <><BellOff size={12} /> Vypnuto</>}
                  </button>
                </div>

                {/* Stock alert */}
                <div className="w-40 flex justify-center">
                  <button onClick={() => toggleStockMutation.mutate(watched.id)} disabled={toggleStockMutation.isPending}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      watched.is_stock_alert_enabled ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}>
                    {watched.is_stock_alert_enabled ? <><Bell size={12} /> Zapnuto</> : <><BellOff size={12} /> Vypnuto</>}
                  </button>
                </div>

                {/* Date */}
                <div className="w-20 text-center text-xs text-gray-400">
                  {new Date(watched.added_at).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' })}
                </div>

                {/* Remove */}
                <div className="w-12 flex justify-center">
                  <button onClick={() => removeMutation.mutate(watched.product_id)} disabled={removeMutation.isPending}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
