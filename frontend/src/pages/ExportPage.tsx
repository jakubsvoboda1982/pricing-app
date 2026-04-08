import { useState, useEffect } from 'react'
import { Download, FileText, Check, FileSpreadsheet, Filter, X } from 'lucide-react'
import { API_BASE_URL } from '@/api/client'

const ALL_FIELDS = [
  { id: 'id',            label: 'Product ID',   defaultChecked: true  },
  { id: 'sku',           label: 'SKU',           defaultChecked: true  },
  { id: 'name',          label: 'Název',         defaultChecked: true  },
  { id: 'category',      label: 'Kategorie',     defaultChecked: true  },
  { id: 'description',   label: 'Popis',         defaultChecked: true  },
  { id: 'current_price', label: 'Aktuální cena', defaultChecked: true  },
  { id: 'old_price',     label: 'Stará cena',    defaultChecked: false },
  { id: 'created_at',    label: 'Vytvořeno',     defaultChecked: true  },
  { id: 'updated_at',    label: 'Upraveno',      defaultChecked: true  },
]

const MARKET_OPTIONS = [
  { value: '',   label: 'Všechny trhy' },
  { value: 'CZ', label: '🇨🇿 CZ' },
  { value: 'SK', label: '🇸🇰 SK' },
  { value: 'HU', label: '🇭🇺 HU' },
]

export default function ExportPage() {
  const [exporting, setExporting]     = useState<'xlsx' | 'csv' | null>(null)
  const [exported, setExported]       = useState<'xlsx' | 'csv' | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const [checkedFields, setCheckedFields] = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_FIELDS.map(f => [f.id, f.defaultChecked]))
  )

  // Filtry
  const [categories, setCategories]   = useState<string[]>([])
  const [totalProducts, setTotalProducts] = useState<number | null>(null)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterMarket, setFilterMarket]     = useState('')
  const [filterSearch, setFilterSearch]     = useState('')
  const [filterMinPrice, setFilterMinPrice] = useState('')
  const [filterMaxPrice, setFilterMaxPrice] = useState('')

  const selectedCount = Object.values(checkedFields).filter(Boolean).length
  const hasFilters = !!(filterCategory || filterMarket || filterSearch || filterMinPrice || filterMaxPrice)

  // Načti metadata (kategorie, trhy)
  useEffect(() => {
    const token = localStorage.getItem('access_token')
    fetch(`${API_BASE_URL}/export/products/meta`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setCategories(data.categories || [])
          setTotalProducts(data.total ?? null)
        }
      })
      .catch(() => {})
  }, [])

  const buildUrl = (format: 'xlsx' | 'csv') => {
    const fields = Object.entries(checkedFields)
      .filter(([, v]) => v).map(([k]) => k).join(',')
    const params = new URLSearchParams()
    if (fields)           params.set('fields', fields)
    if (filterCategory)   params.set('category', filterCategory)
    if (filterMarket)     params.set('market', filterMarket)
    if (filterSearch)     params.set('search', filterSearch)
    if (filterMinPrice)   params.set('min_price', filterMinPrice)
    if (filterMaxPrice)   params.set('max_price', filterMaxPrice)
    const qs = params.toString()
    return `${API_BASE_URL}/export/products/${format}${qs ? `?${qs}` : ''}`
  }

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setExporting(format)
    setExportError(null)
    try {
      const response = await fetch(buildUrl(format), {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
      })
      if (!response.ok) {
        const txt = await response.text().catch(() => '')
        setExportError(`Chyba ${response.status}: ${txt.slice(0, 120) || 'Server error'}`)
        return
      }
      const blob = await response.blob()
      const objUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = `products-${new Date().toISOString().split('T')[0]}.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(objUrl)
      document.body.removeChild(a)
      setExported(format)
      setTimeout(() => setExported(null), 3000)
    } catch (e: any) {
      setExportError(e?.message || 'Nepodařilo se stáhnout soubor')
    } finally {
      setExporting(null)
    }
  }

  const clearFilters = () => {
    setFilterCategory('')
    setFilterMarket('')
    setFilterSearch('')
    setFilterMinPrice('')
    setFilterMaxPrice('')
  }

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Export centrum</h1>
        <p className="text-sm text-gray-400 mt-0.5">Stáhni cenová a produktová data do XLSX nebo CSV</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Formáty</p>
          <p className="text-2xl font-bold text-gray-900">2</p>
          <p className="text-xs text-gray-400 mt-0.5">XLSX + CSV</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Vybraných polí</p>
          <p className="text-2xl font-bold text-blue-700">{selectedCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">z {ALL_FIELDS.length} dostupných</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 sm:col-span-1 col-span-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Produktů celkem</p>
          <p className="text-2xl font-bold text-gray-900">{totalProducts ?? '—'}</p>
          <p className="text-xs text-gray-400 mt-0.5">{hasFilters ? 'filtr aktivní' : 'bez filtru'}</p>
        </div>
      </div>

      {/* Výběr polí */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Vybraná pole</p>
          <div className="flex gap-2">
            <button onClick={() => setCheckedFields(Object.fromEntries(ALL_FIELDS.map(f => [f.id, true])))}
              className="text-xs text-blue-600 hover:underline">Vše</button>
            <span className="text-gray-300">|</span>
            <button onClick={() => setCheckedFields(Object.fromEntries(ALL_FIELDS.map(f => [f.id, false])))}
              className="text-xs text-gray-500 hover:underline">Žádné</button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {ALL_FIELDS.map(field => (
            <label key={field.id} className="flex items-center gap-2.5 cursor-pointer group">
              <input type="checkbox" checked={!!checkedFields[field.id]}
                onChange={e => setCheckedFields(prev => ({ ...prev, [field.id]: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300 accent-blue-600" />
              <span className="text-sm text-gray-700 group-hover:text-gray-900 transition">{field.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Filtry */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
            <Filter size={13} /> Filtrovat produkty
          </p>
          {hasFilters && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition">
              <X size={12} /> Zrušit filtry
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">

          {/* Hledání */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Hledat název</label>
            <input type="text" value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              placeholder="pistácie, mandle…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Kategorie */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Kategorie</label>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Všechny kategorie</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Trh */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Trh</label>
            <select value={filterMarket} onChange={e => setFilterMarket(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {MARKET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Cenové rozmezí */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Min. cena</label>
            <input type="number" value={filterMinPrice}
              onChange={e => setFilterMinPrice(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Max. cena</label>
            <input type="number" value={filterMaxPrice}
              onChange={e => setFilterMaxPrice(e.target.value)}
              placeholder="99999"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

        </div>

        {hasFilters && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {filterSearch    && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">Hledám: {filterSearch}</span>}
            {filterCategory  && <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-100">Kategorie: {filterCategory}</span>}
            {filterMarket    && <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-100">Trh: {filterMarket}</span>}
            {filterMinPrice  && <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full border border-orange-100">Min: {filterMinPrice}</span>}
            {filterMaxPrice  && <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full border border-orange-100">Max: {filterMaxPrice}</span>}
          </div>
        )}
      </div>

      {/* Chybová hláška */}
      {exportError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <X size={14} className="mt-0.5 flex-shrink-0" />
          <span>{exportError}</span>
        </div>
      )}

      {/* Export tlačítka */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* XLSX */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <FileSpreadsheet size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">XLSX Export</p>
              <p className="text-xs text-gray-400">Excel formát — nejlepší pro tabulkové zpracování</p>
            </div>
          </div>
          <button onClick={() => handleExport('xlsx')} disabled={!!exporting}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-60 ${
              exported === 'xlsx'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}>
            {exported === 'xlsx' ? <><Check size={16} /> Staženo!</>
              : exporting === 'xlsx' ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Exportuji...</>
              : <><Download size={16} /> Stáhnout XLSX</>}
          </button>
        </div>

        {/* CSV */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <FileText size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">CSV Export</p>
              <p className="text-xs text-gray-400">Textový formát — kompatibilní se všemi editory</p>
            </div>
          </div>
          <button onClick={() => handleExport('csv')} disabled={!!exporting}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-60 ${
              exported === 'csv'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}>
            {exported === 'csv' ? <><Check size={16} /> Staženo!</>
              : exporting === 'csv' ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Exportuji...</>
              : <><Download size={16} /> Stáhnout CSV</>}
          </button>
        </div>
      </div>
    </div>
  )
}
