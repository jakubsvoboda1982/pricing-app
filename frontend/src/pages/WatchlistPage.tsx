import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Bell, BellOff, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '@/api/client'

interface WatchedProduct {
  id: string
  product_id: string
  product_name: string
  product_sku: string
  is_price_alert_enabled: boolean
  is_stock_alert_enabled: boolean
  added_at: string
}

export default function WatchlistPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data: watchlist = [], isLoading } = useQuery({
    queryKey: ['watchlist'],
    queryFn: () => apiClient.listWatchlist(),
  })

  const removeMutation = useMutation({
    mutationFn: (productId: string) => apiClient.removeFromWatchlist(productId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watchlist'] })
    },
  })

  const togglePriceMutation = useMutation({
    mutationFn: (watchedId: string) => apiClient.togglePriceAlert(watchedId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watchlist'] })
    },
  })

  const toggleStockMutation = useMutation({
    mutationFn: (watchedId: string) => apiClient.toggleStockAlert(watchedId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watchlist'] })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Načítám watchlist...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Sledované produkty</h1>
        <p className="text-gray-600 mt-1">Monitoruj tržní změny u vybraných produktů</p>
      </div>

      {/* Empty State */}
      {watchlist.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Eye size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500 text-lg mb-4">Žádné produkty na watchlistu</p>
          <button
            onClick={() => navigate('/products')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            Přejít na produkty
          </button>
        </div>
      )}

      {/* Watchlist Table */}
      {watchlist.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Produkt</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">SKU</th>
                <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Upozornění ceny</th>
                <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Upozornění skladu</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Akce</th>
              </tr>
            </thead>
            <tbody>
              {watchlist.map((watched: WatchedProduct) => (
                <tr key={watched.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                  <td className="px-6 py-4">
                    <button
                      onClick={() => navigate(`/products/${watched.product_id}`)}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {watched.product_name}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{watched.product_sku}</td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => togglePriceMutation.mutate(watched.id)}
                      disabled={togglePriceMutation.isPending}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded transition ${
                        watched.is_price_alert_enabled
                          ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {watched.is_price_alert_enabled ? (
                        <>
                          <Bell size={14} />
                          Zapnuto
                        </>
                      ) : (
                        <>
                          <BellOff size={14} />
                          Vypnuto
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => toggleStockMutation.mutate(watched.id)}
                      disabled={toggleStockMutation.isPending}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded transition ${
                        watched.is_stock_alert_enabled
                          ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {watched.is_stock_alert_enabled ? (
                        <>
                          <Bell size={14} />
                          Zapnuto
                        </>
                      ) : (
                        <>
                          <BellOff size={14} />
                          Vypnuto
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => removeMutation.mutate(watched.product_id)}
                      disabled={removeMutation.isPending}
                      className="text-red-600 hover:text-red-700 disabled:text-red-300 transition"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
