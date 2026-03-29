import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Eye, CheckCircle } from 'lucide-react'
import { apiClient, API_BASE_URL } from '@/api/client'
import { useMarketStore } from '@/store/market'
import MarketSelector from '@/components/MarketSelector'
import PriceDisplay from '@/components/PriceDisplay'

interface CatalogProduct {
  id: string
  name: string
  ean?: string
  category?: string
  manufacturer?: string
  price_without_vat?: number
  purchase_price?: number
  vat_rate?: number
  quantity_in_stock?: number
  unit_of_measure: string
  is_active: boolean
  market?: string
  created_at: string
  imported_at: string
}

export default function CatalogPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [addedProducts, setAddedProducts] = useState<Set<string>>(new Set())
  const [addingId, setAddingId] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const selectedMarket = useMarketStore((state) => state.selectedMarket)

  // Načti kategorii
  const { data: categories = [] } = useQuery({
    queryKey: ['catalogCategories'],
    queryFn: async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/catalog/categories`)
        if (!response.ok) throw new Error('Chyba')
        return await response.json()
      } catch (error) {
        return []
      }
    },
  })

  // Načti produkty z katalogu
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['catalogProducts', selectedCategory, searchTerm, selectedMarket],
    queryFn: async () => {
      try {
        let url = `${API_BASE_URL}/catalog/products`
        const params = new URLSearchParams()

        if (selectedCategory) params.append('category', selectedCategory)
        if (searchTerm) params.append('search', searchTerm)
        if (selectedMarket && selectedMarket !== 'ALL') params.append('market', selectedMarket)

        if (params.toString()) url += `?${params.toString()}`

        const response = await fetch(url)
        if (!response.ok) throw new Error('Chyba')
        return await response.json()
      } catch (error) {
        return []
      }
    },
  })

  const handleAddToWatchlist = async (product: CatalogProduct) => {
    setAddingId(product.id)
    try {
      await apiClient.createProduct({
        name: product.name,
        sku: product.ean || `catalog-${product.id}`,
        category: product.category,
        catalog_product_id: product.id,
        ean: product.ean,
        thumbnail_url: (product as any).thumbnail_url,
        url_reference: (product as any).url_reference,
      })
      setAddedProducts(new Set(addedProducts).add(product.id))
      queryClient.invalidateQueries({ queryKey: ['products'] })
      // Po přidání naviguj na sledované produkty
      setTimeout(() => navigate('/products'), 800)
    } catch {
      // ignore - produkt pravděpodobně již existuje
      setAddedProducts(new Set(addedProducts).add(product.id))
      setTimeout(() => navigate('/products'), 800)
    } finally {
      setAddingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Katalog produktů</h1>
          <p className="text-gray-600 mt-1">
            {products.length} produktů v katalogu · Vyber které chceš sledovat
          </p>
        </div>
        <MarketSelector />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => window.location.pathname = '/import'}
          className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4 hover:shadow-md transition text-left"
        >
          <p className="text-sm font-medium text-blue-900">Importovat produkty</p>
          <p className="text-xs text-blue-700 mt-1">Přidej nové produkty ze souboru</p>
        </button>
        <button
          onClick={() => window.location.pathname = '/products'}
          className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-4 hover:shadow-md transition text-left"
        >
          <p className="text-sm font-medium text-green-900">Sledované produkty</p>
          <p className="text-xs text-green-700 mt-1">Moje vybraná monitorování</p>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="space-y-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Hledej produkty</label>
            <div className="relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Název, EAN, kategorie..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Category Filter */}
          {categories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Kategorie</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`px-3 py-1 rounded-full text-sm transition ${
                    selectedCategory === null
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Všechny
                </button>
                {categories.map((cat: string) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-full text-sm transition ${
                      selectedCategory === cat
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isLoading ? (
          <div className="col-span-2 text-center py-12">
            <p className="text-gray-500">Načítám produkty...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="col-span-2 text-center py-12">
            <p className="text-gray-500 mb-4">Žádné produkty nenalezeny.</p>
            <button
              onClick={() => window.location.pathname = '/import'}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
            >
              Importuj produkty
            </button>
          </div>
        ) : (
          products.map((product: CatalogProduct) => {
            return (
              <div
                key={product.id}
                className="bg-white rounded-lg shadow-md hover:shadow-lg transition p-6 border-l-4 border-l-blue-500"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">{product.name}</h3>
                    <div className="flex gap-2 mt-1 items-center flex-wrap">
                      {product.market && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">
                          {product.market === 'CZ' ? '🇨🇿 CZ' : '🇸🇰 SK'}
                        </span>
                      )}
                      {product.manufacturer && (
                        <p className="text-sm text-gray-600">{product.manufacturer}</p>
                      )}
                      {product.category && (
                        <p className="text-sm text-gray-600">{product.category}</p>
                      )}
                    </div>
                  </div>
                  {product.ean && (
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded whitespace-nowrap">
                      EAN: {product.ean}
                    </span>
                  )}
                </div>

                {/* Cena */}
                <div className="mb-4 grid grid-cols-1 gap-3">
                  {product.price_without_vat && product.vat_rate !== undefined && (
                    <PriceDisplay
                      priceWithoutVat={product.price_without_vat}
                      vatRate={product.vat_rate}
                      currency="Kč"
                      showBreakdown={true}
                      className="bg-blue-50 rounded-lg p-3"
                    />
                  )}
                  {product.purchase_price && (
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-600">Nákupní cena</p>
                      <p className="font-semibold text-gray-900">{product.purchase_price} Kč</p>
                    </div>
                  )}
                </div>

                {/* Sklad */}
                {product.quantity_in_stock !== null && (
                  <div className="mb-4 grid grid-cols-2 gap-3">
                    <div className="p-2 bg-green-50 rounded">
                      <p className="text-xs text-green-600">Sklad</p>
                      <p className="font-semibold text-green-900">
                        {product.quantity_in_stock} {product.unit_of_measure}
                      </p>
                    </div>
                  </div>
                )}

                {/* Action Button */}
                <button
                  onClick={() => handleAddToWatchlist(product)}
                  disabled={addedProducts.has(product.id) || addingId === product.id}
                  className={`w-full py-2 rounded-lg transition flex items-center justify-center space-x-2 font-medium ${
                    addedProducts.has(product.id)
                      ? 'bg-green-100 text-green-700 cursor-default'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {addedProducts.has(product.id) ? (
                    <>
                      <CheckCircle size={16} />
                      <span>Přidáno → přesměrovávám...</span>
                    </>
                  ) : addingId === product.id ? (
                    <span>Přidávám...</span>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span>Přidat k sledování</span>
                    </>
                  )}
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
