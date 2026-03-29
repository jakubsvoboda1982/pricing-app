import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ExternalLink, Link, ChevronDown, ChevronUp, Package } from 'lucide-react'
import { apiClient } from '@/api/client'
import MarketSelector from '@/components/MarketSelector'
import { useNavigate } from 'react-router-dom'

interface CompetitorUrl {
  url: string
  name: string
  market: string
}

interface Product {
  id: string
  name: string
  sku: string
  category?: string
  ean?: string
  thumbnail_url?: string
  url_reference?: string
  competitor_urls?: CompetitorUrl[]
  created_at: string
}

export default function ProductsPage() {
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', sku: '', category: '' })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addUrlProductId, setAddUrlProductId] = useState<string | null>(null)
  const [newUrl, setNewUrl] = useState('')
  const [newUrlMarket, setNewUrlMarket] = useState<'CZ' | 'SK'>('CZ')
  const [addingUrl, setAddingUrl] = useState(false)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: products = [], isLoading, refetch } = useQuery({
    queryKey: ['products'],
    queryFn: () => apiClient.getProducts(),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.createProduct(data),
    onSuccess: () => {
      setFormData({ name: '', sku: '', category: '' })
      setShowForm(false)
      refetch()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteProduct(id),
    onSuccess: () => refetch(),
  })

  const handleAddUrl = async (productId: string) => {
    if (!newUrl.trim()) return
    setAddingUrl(true)
    try {
      await apiClient.addCompetitorUrl(productId, newUrl, undefined, newUrlMarket)
      setNewUrl('')
      setAddUrlProductId(null)
      queryClient.invalidateQueries({ queryKey: ['products'] })
    } catch {
      // ignore
    } finally {
      setAddingUrl(false)
    }
  }

  const handleRemoveUrl = async (productId: string, url: string) => {
    try {
      await apiClient.removeCompetitorUrl(productId, url)
      queryClient.invalidateQueries({ queryKey: ['products'] })
    } catch { /* ignore */ }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.sku) return
    createMutation.mutate(formData)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sledované produkty</h1>
          <p className="text-gray-600 mt-1">{products.length} produktů · Sledujeme jejich ceny u konkurence</p>
        </div>
        <div className="flex items-center gap-3">
          <MarketSelector />
          <button
            onClick={() => navigate('/catalog')}
            className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg"
          >
            <Package size={18} />
            <span>Z katalogu</span>
          </button>
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
          <h2 className="text-xl font-semibold mb-4">Přidat produkt ručně</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input
                type="text"
                placeholder="Název produktu *"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="SKU / EAN *"
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
            </div>
            <div className="flex space-x-3">
              <button type="submit" disabled={createMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg disabled:opacity-50">
                {createMutation.isPending ? 'Přidávám...' : 'Přidat'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2 rounded-lg">
                Zrušit
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Products List */}
      {isLoading ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">Načítám produkty...</div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <Package size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 mb-4">Žádné produkty. Přidejte si svůj první produkt!</p>
          <button onClick={() => navigate('/catalog')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">
            Vybrat z katalogu
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((product: Product) => {
            const isExpanded = expandedId === product.id
            const competitorUrls = product.competitor_urls || []

            return (
              <div key={product.id} className="bg-white rounded-lg shadow border border-gray-100">
                {/* Product Header */}
                <div className="p-4 flex items-start gap-4">
                  {/* Thumbnail */}
                  {product.thumbnail_url ? (
                    <img src={product.thumbnail_url} alt={product.name}
                      className="w-14 h-14 object-contain rounded bg-gray-50 border flex-shrink-0"
                      onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  ) : (
                    <div className="w-14 h-14 bg-blue-50 rounded border flex items-center justify-center flex-shrink-0">
                      <Package size={24} className="text-blue-300" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-gray-900 truncate">{product.name}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {product.ean && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">EAN: {product.ean}</span>}
                          {product.category && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{product.category}</span>}
                          {product.url_reference && (
                            <a href={product.url_reference} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                              <ExternalLink size={12} /> vlastní web
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : product.id)}
                          className="flex items-center gap-1 text-sm text-blue-600 hover:bg-blue-50 px-3 py-1 rounded-lg transition"
                        >
                          <Link size={14} />
                          <span>{competitorUrls.length} URL</span>
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        <button onClick={() => deleteMutation.mutate(product.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Competitor URLs Panel */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-3 bg-gray-50 rounded-b-lg">
                    <p className="text-sm font-medium text-gray-700 mb-3">
                      URL produktu u konkurentů
                      <span className="text-xs text-gray-500 font-normal ml-2">Přidejte URL tohoto produktu na jiných e-shopech ke sledování cen</span>
                    </p>

                    {/* Existing URLs */}
                    {competitorUrls.length > 0 ? (
                      <div className="space-y-2 mb-3">
                        {competitorUrls.map((item: CompetitorUrl) => (
                          <div key={item.url} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-200">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${item.market === 'CZ' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                              {item.market === 'CZ' ? '🇨🇿' : '🇸🇰'}
                            </span>
                            <span className="text-sm font-medium text-gray-700 flex-shrink-0 w-28 truncate">{item.name}</span>
                            <a href={item.url} target="_blank" rel="noopener noreferrer"
                              className="text-sm text-blue-500 hover:underline truncate flex-1 flex items-center gap-1">
                              <ExternalLink size={12} className="flex-shrink-0" />
                              {item.url}
                            </a>
                            <button onClick={() => handleRemoveUrl(product.id, item.url)}
                              className="text-red-400 hover:text-red-600 flex-shrink-0">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 mb-3">Zatím žádné URL. Přidejte níže.</p>
                    )}

                    {/* Add URL Form */}
                    {addUrlProductId === product.id ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <div className="flex gap-1">
                            {(['CZ', 'SK'] as const).map(m => (
                              <button key={m} onClick={() => setNewUrlMarket(m)}
                                className={`px-2 py-1 rounded text-xs font-medium ${newUrlMarket === m ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`}>
                                {m === 'CZ' ? '🇨🇿' : '🇸🇰'}
                              </button>
                            ))}
                          </div>
                          <input
                            type="url"
                            value={newUrl}
                            onChange={(e) => setNewUrl(e.target.value)}
                            placeholder="https://grizly.cz/produkt/kešu-ořechy-1kg"
                            autoFocus
                            className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleAddUrl(product.id)} disabled={addingUrl || !newUrl.trim()}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-50">
                            {addingUrl ? 'Přidávám...' : 'Přidat URL'}
                          </button>
                          <button onClick={() => { setAddUrlProductId(null); setNewUrl('') }}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-1.5 rounded-lg text-sm">
                            Zrušit
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddUrlProductId(product.id); setNewUrl('') }}
                        className="flex items-center gap-2 text-sm text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition border border-dashed border-blue-300"
                      >
                        <Plus size={14} />
                        Přidat URL konkurenta
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
