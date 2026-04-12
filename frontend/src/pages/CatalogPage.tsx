import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Plus, CheckCircle, Package, ExternalLink, ChevronDown,
  ArrowUpDown, ArrowUp, ArrowDown, X, Eye, SlidersHorizontal, Weight,
  Bookmark, Tag, Star, Save,
} from 'lucide-react'
import { apiClient, API_BASE_URL, authFetch } from '@/api/client'
import { useMarketStore } from '@/store/market'

// Parse weight (in grams) from product name, e.g. "Ananas 500 g" → 500, "Kešu 1 kg" → 1000
function parseWeightG(name: string): number | null {
  const kgMatch = name.match(/(\d+[.,]?\d*)\s*kg/i)
  if (kgMatch) return Math.round(parseFloat(kgMatch[1].replace(',', '.')) * 1000)
  const gMatch = name.match(/(\d+[.,]?\d*)\s*g(?!\w)/i)
  if (gMatch) return Math.round(parseFloat(gMatch[1].replace(',', '.')))
  return null
}

const WEIGHT_RANGES = [
  { label: 'Vše', min: null, max: null },
  { label: '< 100 g',    min: 0,    max: 99   },
  { label: '100–250 g',  min: 100,  max: 250  },
  { label: '251–500 g',  min: 251,  max: 500  },
  { label: '501 g–1 kg', min: 501,  max: 1000 },
  { label: '> 1 kg',     min: 1001, max: null },
]

const PRICE_RANGES = [
  { label: 'Vše',         min: null, max: null },
  { label: '< 50 Kč',    min: null, max: 50   },
  { label: '50–150 Kč',  min: 50,   max: 150  },
  { label: '150–300 Kč', min: 150,  max: 300  },
  { label: '300–500 Kč', min: 300,  max: 500  },
  { label: '> 500 Kč',   min: 500,  max: null },
]

interface CompetitorUrlInfo {
  url: string
  name: string
  market: string
}

interface CatalogProduct {
  id: string
  name: string
  product_code?: string | null
  ean?: string
  category?: string
  manufacturer?: string
  price_without_vat?: number
  price_vat?: number
  purchase_price?: number
  vat_rate?: number
  quantity_in_stock?: number
  unit_of_measure: string
  market?: string
  thumbnail_url?: string
  url_reference?: string
  imported_from?: string
  is_active: boolean
  watched_product_id?: string
  competitor_urls?: CompetitorUrlInfo[]
  created_at: string
  imported_at: string
}

type SortField = 'name' | 'price_vat' | 'quantity_in_stock'
type SortDir = 'asc' | 'desc'

const FLAG: Record<string, string> = { CZ: '🇨🇿', SK: '🇸🇰' }

function formatPrice(price?: number | null, decimals = 2) {
  if (price == null) return null
  return Number(price).toLocaleString('cs-CZ', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// ── Oblíbené filtry ──────────────────────────────────────────────────────────

interface SavedFilter {
  id: string
  name: string
  market: string
  category: string | null
  manufacturer: string | null
  search: string
  weightRangeIdx: number
  priceRangeIdx: number
  stockFilter: 'all' | 'in_stock'
}

const SAVED_FILTERS_KEY = 'catalog_saved_filters'

function loadSavedFilters(): SavedFilter[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_FILTERS_KEY) || '[]')
  } catch {
    return []
  }
}

function persistSavedFilters(filters: SavedFilter[]) {
  localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(filters))
}

// ────────────────────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedManufacturer, setSelectedManufacturer] = useState<string | null>(null)
  const [weightRangeIdx, setWeightRangeIdx] = useState(0)
  const [priceRangeIdx, setPriceRangeIdx] = useState(0)
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock'>('all')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [addedProducts, setAddedProducts] = useState<Set<string>>(new Set())
  const [addingId, setAddingId] = useState<string | null>(null)
  const [manufacturerOpen, setManufacturerOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(loadSavedFilters)
  const [savingFilter, setSavingFilter] = useState(false)
  const [saveFilterName, setSaveFilterName] = useState('')
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAdding, setBulkAdding] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  const limit = 10000  // Načti vše najednou

  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const selectedMarket = useMarketStore((state) => state.selectedMarket)

  // Categories — filtrované dle aktuálního trhu
  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ['catalogCategories', selectedMarket],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (selectedMarket && selectedMarket !== 'ALL') params.set('market', selectedMarket)
      const r = await authFetch(`${API_BASE_URL}/catalog/categories?${params.toString()}`)
      if (!r.ok) return []
      return r.json()
    },
    // Reset vybrané kategorie při změně trhu
    placeholderData: [],
  })

  // Manufacturers
  const { data: manufacturers = [] } = useQuery<string[]>({
    queryKey: ['catalogManufacturers'],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API_BASE_URL}/catalog/manufacturers`)
        if (!r.ok) return []
        return r.json()
      } catch {
        return []
      }
    },
  })

  // Resetuj vybranou kategorii při změně trhu
  useEffect(() => {
    setSelectedCategory(null)
  }, [selectedMarket])

  const priceRange = PRICE_RANGES[priceRangeIdx]

  const resetLimit = () => {}  // Limit je fixní, reset není potřeba

  // Products — server-side filters; weight is client-side
  const { data: products = [], isLoading } = useQuery<CatalogProduct[]>({
    queryKey: ['catalogProducts', selectedCategory, selectedManufacturer, searchTerm, selectedMarket, stockFilter, priceRangeIdx],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (selectedCategory) params.append('category', selectedCategory)
      if (selectedManufacturer) params.append('manufacturer', selectedManufacturer)
      if (searchTerm) params.append('search', searchTerm)
      if (selectedMarket && selectedMarket !== 'ALL') params.append('market', selectedMarket)
      if (stockFilter === 'in_stock') params.append('in_stock', 'true')
      if (priceRange.min != null) params.append('min_price', String(priceRange.min))
      if (priceRange.max != null) params.append('max_price', String(priceRange.max))
      params.append('limit', String(limit))
      const r = await authFetch(`${API_BASE_URL}/catalog/products?${params.toString()}`)
      if (!r.ok) return []
      return r.json()
    },
  })

  // Weight filter (client-side — weight is parsed from name)
  const weightRange = WEIGHT_RANGES[weightRangeIdx]
  const weightFiltered = useMemo(() => {
    if (weightRange.min == null && weightRange.max == null) return products
    return products.filter(p => {
      const w = parseWeightG(p.name)
      if (w == null) return false
      if (weightRange.min != null && w < weightRange.min) return false
      if (weightRange.max != null && w > weightRange.max) return false
      return true
    })
  }, [products, weightRange])

  // Sort
  const sorted = useMemo(() => {
    return [...weightFiltered].sort((a, b) => {
      let av: any, bv: any
      if (sortField === 'name') { av = a.name; bv = b.name }
      else if (sortField === 'price_vat') { av = a.price_vat ?? -1; bv = b.price_vat ?? -1 }
      else { av = a.quantity_in_stock ?? -1; bv = b.quantity_in_stock ?? -1 }

      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv, 'cs') : bv.localeCompare(av, 'cs')
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [products, sortField, sortDir])

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={13} className="text-gray-400" />
    return sortDir === 'asc'
      ? <ArrowUp size={13} className="text-blue-600" />
      : <ArrowDown size={13} className="text-blue-600" />
  }

  const handleAddToWatchlist = async (product: CatalogProduct) => {
    setAddingId(product.id)
    try {
      await apiClient.createProduct({
        name: product.name,
        sku: product.ean || `catalog-${product.id}`,
        category: product.category,
        catalog_product_id: product.id,
        ean: product.ean,
        thumbnail_url: product.thumbnail_url,
        url_reference: product.url_reference,
      })
      setAddedProducts(prev => new Set(prev).add(product.id))
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['catalogProducts'] })
      // Stay on this page, just show success state
    } catch {
      // Still mark as added even if error (probably already exists)
      setAddedProducts(prev => new Set(prev).add(product.id))
    } finally {
      setAddingId(null)
    }
  }

  // Selection helpers — only non-watched products can be selected
  const selectableIds = useMemo(
    () => sorted.filter(p => !p.watched_product_id && !addedProducts.has(p.id)).map(p => p.id),
    [sorted, addedProducts]
  )
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id))
  const someSelected = selectedIds.size > 0

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectableIds))
    }
  }

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBulkAddToWatchlist = async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    setBulkAdding(true)
    setBulkProgress({ done: 0, total: ids.length })
    let done = 0
    for (const id of ids) {
      const product = sorted.find(p => p.id === id)
      if (!product) { done++; continue }
      try {
        await apiClient.createProduct({
          name: product.name,
          sku: product.ean || `catalog-${product.id}`,
          category: product.category,
          catalog_product_id: product.id,
          ean: product.ean,
          thumbnail_url: product.thumbnail_url,
          url_reference: product.url_reference,
        })
        setAddedProducts(prev => new Set(prev).add(id))
      } catch {
        setAddedProducts(prev => new Set(prev).add(id))
      }
      done++
      setBulkProgress({ done, total: ids.length })
    }
    setSelectedIds(new Set())
    setBulkAdding(false)
    setBulkProgress(null)
    queryClient.invalidateQueries({ queryKey: ['products'] })
    queryClient.invalidateQueries({ queryKey: ['catalogProducts'] })
  }

  const activeFiltersCount = [
    selectedCategory,
    selectedManufacturer,
    weightRangeIdx > 0 ? 'weight' : null,
    priceRangeIdx > 0 ? 'price' : null,
    stockFilter !== 'all' ? 'stock' : null,
  ].filter(Boolean).length

  const clearAllFilters = () => {
    setSelectedCategory(null)
    setSelectedManufacturer(null)
    setWeightRangeIdx(0)
    setPriceRangeIdx(0)
    setStockFilter('all')
    resetLimit()
  }

  const handleSaveFilter = () => {
    const name = saveFilterName.trim() || `Filtr ${savedFilters.length + 1}`
    const newFilter: SavedFilter = {
      id: Date.now().toString(),
      name,
      market: selectedMarket,
      category: selectedCategory,
      manufacturer: selectedManufacturer,
      search: searchTerm,
      weightRangeIdx,
      priceRangeIdx,
      stockFilter,
    }
    const updated = [...savedFilters, newFilter]
    setSavedFilters(updated)
    persistSavedFilters(updated)
    setSavingFilter(false)
    setSaveFilterName('')
  }

  const handleApplyFilter = (f: SavedFilter) => {
    useMarketStore.setState({ selectedMarket: f.market as any })
    setSelectedCategory(f.category)
    setSelectedManufacturer(f.manufacturer)
    setSearchTerm(f.search)
    setWeightRangeIdx(f.weightRangeIdx)
    setPriceRangeIdx(f.priceRangeIdx)
    setStockFilter(f.stockFilter)
    resetLimit()
  }

  const handleDeleteFilter = (id: string) => {
    const updated = savedFilters.filter(f => f.id !== id)
    setSavedFilters(updated)
    persistSavedFilters(updated)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Katalog produktů</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isLoading
              ? 'Načítám...'
              : `${sorted.length}${sorted.length !== products.length ? ` z ${products.length}` : ''} produktů · Vyber které chceš sledovat`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
            {(['ALL', 'CZ', 'SK'] as const).map((m) => (
              <button
                key={m}
                onClick={() => useMarketStore.setState({ selectedMarket: m })}
                className={`px-3 py-1 rounded text-sm font-medium transition ${
                  selectedMarket === m ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {m === 'ALL' ? 'Všechny trhy' : m === 'CZ' ? '🇨🇿 CZ' : '🇸🇰 SK'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Oblíbené filtry */}
      {(savedFilters.length > 0 || savingFilter) && (
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 flex items-center gap-1 flex-shrink-0">
            <Star size={12} className="text-yellow-500 fill-yellow-400" /> Oblíbené
          </span>
          {savedFilters.map(f => (
            <div key={f.id} className="flex items-center gap-0.5 bg-yellow-50 border border-yellow-200 rounded-lg overflow-hidden">
              <button
                onClick={() => handleApplyFilter(f)}
                className="px-2.5 py-1 text-xs font-medium text-yellow-800 hover:bg-yellow-100 transition flex items-center gap-1.5">
                {f.market !== 'ALL' && <span>{f.market === 'SK' ? '🇸🇰' : '🇨🇿'}</span>}
                {f.name}
              </button>
              <button
                onClick={() => handleDeleteFilter(f.id)}
                className="px-1.5 py-1 text-yellow-500 hover:text-red-500 hover:bg-red-50 transition">
                <X size={11} />
              </button>
            </div>
          ))}
          {savingFilter ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={saveFilterName}
                onChange={e => setSaveFilterName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveFilter()
                  if (e.key === 'Escape') { setSavingFilter(false); setSaveFilterName('') }
                }}
                placeholder="Název filtru…"
                className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-yellow-400 w-36"
              />
              <button onClick={handleSaveFilter}
                className="text-xs bg-yellow-500 hover:bg-yellow-600 text-white px-2 py-1 rounded transition">Uložit</button>
              <button onClick={() => { setSavingFilter(false); setSaveFilterName('') }}
                className="text-xs text-gray-400 hover:text-gray-600"><X size={12} /></button>
            </div>
          ) : null}
        </div>
      )}

      {/* Filters bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        {/* Row 1: Search + dropdowns + filters toggle */}
        <div className="flex gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); resetLimit() }}
              placeholder="Název, EAN, kategorie, výrobce..."
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Manufacturer dropdown */}
          {manufacturers.length > 0 && (
            <div className="relative">
              <button onClick={() => setManufacturerOpen(o => !o)}
                className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm transition ${
                  selectedManufacturer ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}>
                <span>{selectedManufacturer || 'Výrobce'}</span>
                <ChevronDown size={13} className={manufacturerOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>
              {manufacturerOpen && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                  <button onClick={() => { setSelectedManufacturer(null); setManufacturerOpen(false) }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${!selectedManufacturer ? 'text-blue-600 font-medium' : 'text-gray-700'}`}>
                    Všichni výrobci
                  </button>
                  {manufacturers.map((m) => (
                    <button key={m} onClick={() => { setSelectedManufacturer(m); setManufacturerOpen(false) }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${selectedManufacturer === m ? 'text-blue-600 font-medium' : 'text-gray-700'}`}>
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Categories toggle */}
          <button onClick={() => setCategoriesOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm transition ${
              categoriesOpen || selectedCategory ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}>
            <Tag size={14} />
            Kategorie
            {selectedCategory && (
              <span className="bg-blue-600 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">1</span>
            )}
            <ChevronDown size={13} className={categoriesOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>

          {/* More filters toggle */}
          <button onClick={() => setFiltersOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm transition ${
              filtersOpen || activeFiltersCount > 0 ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}>
            <SlidersHorizontal size={14} />
            Filtry
            {activeFiltersCount > 0 && (
              <span className="bg-blue-600 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {/* Clear all */}
          {activeFiltersCount > 0 && (
            <button onClick={clearAllFilters}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition">
              <X size={13} /> Zrušit vše
            </button>
          )}

          {/* Save filter as favourite */}
          {!savingFilter ? (
            <button
              onClick={() => setSavingFilter(true)}
              title="Uložit aktuální filtr jako oblíbený"
              className="flex items-center gap-1.5 px-3 py-2 border border-yellow-300 text-yellow-700 bg-yellow-50 hover:bg-yellow-100 rounded-lg text-sm transition ml-auto">
              <Star size={13} className="fill-yellow-400" /> Uložit filtr
            </button>
          ) : (
            <div className="flex items-center gap-1.5 ml-auto">
              <input
                autoFocus
                value={saveFilterName}
                onChange={e => setSaveFilterName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveFilter()
                  if (e.key === 'Escape') { setSavingFilter(false); setSaveFilterName('') }
                }}
                placeholder="Název filtru…"
                className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-yellow-400 w-40"
              />
              <button onClick={handleSaveFilter}
                className="flex items-center gap-1 px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white text-sm rounded-lg transition">
                <Save size={13} /> Uložit
              </button>
              <button onClick={() => { setSavingFilter(false); setSaveFilterName('') }}
                className="p-1.5 text-gray-400 hover:text-gray-600"><X size={14} /></button>
            </div>
          )}
        </div>

        {/* Expanded filters panel */}
        {filtersOpen && (
          <div className="border-t border-gray-100 pt-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Weight */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Weight size={12} /> Hmotnost
              </p>
              <div className="flex flex-wrap gap-1.5">
                {WEIGHT_RANGES.map((r, i) => (
                  <button key={r.label} onClick={() => setWeightRangeIdx(i)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                      weightRangeIdx === i ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Price */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Cena s DPH</p>
              <div className="flex flex-wrap gap-1.5">
                {PRICE_RANGES.map((r, i) => (
                  <button key={r.label} onClick={() => setPriceRangeIdx(i)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                      priceRangeIdx === i ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Stock */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Dostupnost</p>
              <div className="flex gap-1.5">
                {([['all', 'Vše'], ['in_stock', 'Skladem']] as const).map(([val, label]) => (
                  <button key={val} onClick={() => setStockFilter(val)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                      stockFilter === val ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Kategorie — skryté, zobrazí se po kliknutí na tlačítko */}
        {categoriesOpen && categories.length > 0 && (
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Tag size={11} />
                {selectedMarket === 'SK' ? '🇸🇰 SK' : selectedMarket === 'CZ' ? '🇨🇿 CZ' : ''} Kategorie
              </span>
              {selectedCategory && (
                <button onClick={() => setSelectedCategory(null)}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                  <X size={10} /> Zrušit
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setSelectedCategory(null)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  selectedCategory === null ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                Vše
              </button>
              {categories.map((cat) => (
                <button key={cat} onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)} title={cat}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition max-w-[200px] truncate ${
                    selectedCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Product list */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          Načítám produkty...
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Package size={48} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium mb-1">Žádné produkty nenalezeny</p>
          <p className="text-sm text-gray-400 mb-5">Zkuste jiný vyhledávací výraz nebo importujte produkty.</p>
          <button
            onClick={() => navigate('/import')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            Importovat produkty
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Bulk action bar */}
          {someSelected && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border-b border-blue-200">
              <span className="text-sm font-medium text-blue-800">
                Vybráno {selectedIds.size} produktů
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Zrušit výběr
                </button>
                <button
                  onClick={handleBulkAddToWatchlist}
                  disabled={bulkAdding}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition disabled:opacity-60"
                >
                  <Bookmark size={13} />
                  {bulkAdding && bulkProgress
                    ? `Přidávám ${bulkProgress.done}/${bulkProgress.total}...`
                    : `Přidat do Sledovaných (${selectedIds.size})`}
                </button>
              </div>
            </div>
          )}

          {/* Table header */}
          <div className="flex items-center px-4 py-3 border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
            {/* Select all checkbox */}
            <div className="w-8 flex-shrink-0 flex items-center">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                disabled={selectableIds.length === 0}
                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 cursor-pointer disabled:opacity-30"
              />
            </div>
            <div className="flex-1 min-w-0">
              <button
                onClick={() => handleSort('name')}
                className="flex items-center gap-1 hover:text-gray-700 transition"
              >
                Produkt <SortIcon field="name" />
              </button>
            </div>
            <div className="w-36 text-right">
              <button
                onClick={() => handleSort('price_vat')}
                className="flex items-center gap-1 ml-auto hover:text-gray-700 transition"
              >
                Cena s DPH <SortIcon field="price_vat" />
              </button>
            </div>
            <div className="w-44 text-right">Konkurence</div>
            <div className="w-28 text-right">
              <button
                onClick={() => handleSort('quantity_in_stock')}
                className="flex items-center gap-1 ml-auto hover:text-gray-700 transition"
              >
                Sklad <SortIcon field="quantity_in_stock" />
              </button>
            </div>
            <div className="w-36 text-right">Akce</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-50">
            {sorted.map((product) => {
              const isAdded = addedProducts.has(product.id)
              const isAdding = addingId === product.id
              const isWatched = !!product.watched_product_id
              const isSelected = selectedIds.has(product.id)
              const isSelectable = !isWatched && !isAdded
              const hasCompetitors = (product.competitor_urls?.length ?? 0) > 0
              const currency = product.market === 'SK' ? 'EUR' : 'Kč'

              return (
                <div
                  key={product.id}
                  className={`flex items-center px-4 py-3.5 hover:bg-gray-50 transition ${
                    isSelected ? 'bg-blue-50 hover:bg-blue-50' : ''
                  } ${isWatched ? 'border-l-2 border-l-green-400' : ''}`}
                >
                  {/* Checkbox */}
                  <div className="w-8 flex-shrink-0 flex items-center">
                    {isSelectable ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(product.id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="w-3.5 h-3.5" />
                    )}
                  </div>
                  {/* Product info */}
                  <div className="flex-1 min-w-0 flex items-center gap-3">
                    {product.thumbnail_url ? (
                      <img
                        src={product.thumbnail_url}
                        alt={product.name}
                        className="w-10 h-10 object-contain rounded bg-gray-50 border flex-shrink-0"
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-10 h-10 bg-blue-50 rounded border flex items-center justify-center flex-shrink-0">
                        <Package size={16} className="text-blue-300" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                        {isWatched && (
                          <span className="flex-shrink-0 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                            Sledován
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {product.product_code && (
                          <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono">#{product.product_code}</span>
                        )}
                        {product.ean && (
                          <span className="text-xs text-gray-400">{product.ean}</span>
                        )}
                        {product.manufacturer && (
                          <span className="text-xs text-gray-500">· {product.manufacturer}</span>
                        )}
                        {product.category && (
                          <span className="text-xs text-gray-400 truncate max-w-[180px]" title={product.category}>
                            · {product.category.split('|').pop()?.trim() || product.category}
                          </span>
                        )}
                        {product.market && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            product.market === 'CZ' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                          }`}>
                            {FLAG[product.market] || product.market} {product.market}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Price from XML feed */}
                  <div className="w-36 text-right flex-shrink-0">
                    {product.price_vat != null ? (
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {formatPrice(product.price_vat)} {currency}
                        </p>
                        {product.vat_rate != null && (
                          <p className="text-xs text-gray-400">
                            DPH {Number(product.vat_rate).toFixed(0)} %
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </div>

                  {/* Competitor URLs */}
                  <div className="w-44 flex-shrink-0 flex flex-col items-end gap-1">
                    {hasCompetitors ? (
                      product.competitor_urls!.map((cu) => (
                        <a
                          key={cu.url}
                          href={cu.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={cu.url}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline max-w-full"
                        >
                          <ExternalLink size={11} className="flex-shrink-0" />
                          <span className="truncate max-w-[140px]">{cu.name}</span>
                        </a>
                      ))
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </div>

                  {/* Stock */}
                  <div className="w-28 text-right flex-shrink-0">
                    {product.quantity_in_stock != null ? (
                      <span className={`text-sm font-medium ${
                        product.quantity_in_stock > 10
                          ? 'text-green-600'
                          : product.quantity_in_stock > 0
                          ? 'text-yellow-600'
                          : 'text-red-500'
                      }`}>
                        {product.quantity_in_stock} {product.unit_of_measure}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="w-36 flex-shrink-0 flex items-center justify-end gap-2">
                    {/* Link to own e-shop */}
                    {product.url_reference && (
                      <a
                        href={product.url_reference}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                        title="Otevřít na e-shopu"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}

                    {/* View watched product detail */}
                    {isWatched && (
                      <button
                        onClick={() => navigate(`/products/${product.watched_product_id}`)}
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition"
                        title="Zobrazit sledovaný produkt"
                      >
                        <Eye size={14} />
                      </button>
                    )}

                    {/* Add to watchlist */}
                    {!isWatched && (
                      <button
                        onClick={() => handleAddToWatchlist(product)}
                        disabled={isAdded || isAdding}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                          isAdded
                            ? 'bg-green-100 text-green-700 cursor-default'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        {isAdded ? (
                          <><CheckCircle size={12} /><span>Přidáno</span></>
                        ) : isAdding ? (
                          <span>Přidávám...</span>
                        ) : (
                          <><Plus size={12} /><span>Sledovat</span></>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

        </div>
      )}
    </div>
  )
}
