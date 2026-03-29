import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Plus, Trash2, Edit2, TrendingUp } from 'lucide-react'
import { apiClient } from '@/api/client'
import { Product } from '@/types'
import MarketSelector from '@/components/MarketSelector'
import { useMarketStore } from '@/store/market'

export default function ProductsPage() {
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', sku: '', category: '', description: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const selectedMarket = useMarketStore((state) => state.selectedMarket)

  const { data: products, isLoading, refetch } = useQuery({
    queryKey: ['products', selectedMarket],
    queryFn: () => apiClient.getProducts(),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.createProduct(data),
    onSuccess: () => {
      setFormData({ name: '', sku: '', category: '', description: '' })
      setShowForm(false)
      refetch()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteProduct(id),
    onSuccess: () => refetch(),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.sku) return
    createMutation.mutate(formData)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <h1 className="text-3xl font-bold text-gray-900">Sledované produkty</h1>
        <div className="flex flex-col items-end gap-4">
          <MarketSelector />
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
          >
            <Plus size={20} />
            <span>Nový produkt</span>
          </button>
        </div>
      </div>

      {/* Add Product Form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Přidat nový produkt</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Název produktu"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="SKU"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Kategorie"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                placeholder="Popis"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg disabled:opacity-50"
              >
                {createMutation.isPending ? 'Přidávám...' : 'Přidat'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-900 px-6 py-2 rounded-lg"
              >
                Zrušit
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Products Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-gray-500">Načítám produkty...</div>
        ) : products && products.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">SKU</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Název</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Kategorie</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Score</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {products.map((product: Product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{product.sku}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{product.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{product.category || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-sm bg-green-50 text-green-700">
                        <TrendingUp size={16} />
                        <span>87</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                      <button className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-700">
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(product.id)}
                        className="inline-flex items-center space-x-1 text-red-600 hover:text-red-700"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">Žádné produkty. Přidejte si svůj první produkt!</div>
        )}
      </div>
    </div>
  )
}
