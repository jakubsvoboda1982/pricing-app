import { useState, useEffect } from 'react'
import { Download, FileText, Check, FileSpreadsheet, Filter, X, ChevronDown, ChevronUp } from 'lucide-react'
import { API_BASE_URL } from '@/api/client'

// ── Field group types ───────────────────────────────────────────────────────
interface FieldDef  { id: string; label: string; default: boolean }
interface FieldGroup { label: string; color: string; fields: FieldDef[] }

const MARKET_OPTIONS = [
  { value: '',   label: 'Všechny trhy' },
  { value: 'CZ', label: '🇨🇿 CZ' },
  { value: 'SK', label: '🇸🇰 SK' },
  { value: 'HU', label: '🇭🇺 HU' },
]

// Static fallback if meta fails to load — mirrors backend FIELD_GROUPS
const FALLBACK_GROUPS: FieldGroup[] = [
  {
    label: 'Identifikace produktu', color: '#1E3A5F',
    fields: [
      { id: 'name',         label: 'Název produktu',   default: true  },
      { id: 'sku',          label: 'SKU',               default: true  },
      { id: 'product_code', label: 'PRODUCTNO',         default: true  },
      { id: 'ean',          label: 'EAN',               default: true  },
      { id: 'manufacturer', label: 'Výrobce',           default: true  },
      { id: 'category',     label: 'Kategorie',         default: true  },
      { id: 'description',  label: 'Popis',             default: false },
      { id: 'url_reference',label: 'URL e-shop (CZ)',   default: false },
      { id: 'id',           label: 'Product ID',        default: false },
    ],
  },
  {
    label: 'Ceny – vlastní', color: '#1B6B3A',
    fields: [
      { id: 'current_price_czk',          label: 'Aktuální cena CZK',     default: true  },
      { id: 'current_price_eur',          label: 'Aktuální cena EUR (SK)', default: true  },
      { id: 'old_price',                  label: 'Předchozí cena',         default: false },
      { id: 'purchase_price_without_vat', label: 'Nákupní cena bez DPH',  default: true  },
      { id: 'purchase_price_with_vat',    label: 'Nákupní cena s DPH',    default: true  },
      { id: 'min_price',                  label: 'Min. cena s DPH',        default: true  },
      { id: 'margin_czk',                 label: 'Marže CZ (%)',           default: true  },
      { id: 'margin_sk',                  label: 'Marže SK (%)',           default: false },
    ],
  },
  {
    label: 'Sklad & pozice', color: '#5B2C8D',
    fields: [
      { id: 'stock_quantity', label: 'Skladem (ks)', default: true  },
      { id: 'hero_score',     label: 'Hero skóre',   default: true  },
      { id: 'market',         label: 'Primární trh', default: false },
    ],
  },
  {
    label: 'Konkurence', color: '#9B3A1A',
    fields: [
      { id: 'lowest_competitor_price', label: 'Nejnižší konkurent',      default: true  },
      { id: 'competitors_count',       label: 'Počet sledov. URL',        default: true  },
      { id: 'price_vs_competition',    label: 'Naše cena vs min. konk.',  default: false },
    ],
  },
  {
    label: 'Doporučení cen', color: '#0E4C7A',
    fields: [
      { id: 'recommended_price',         label: 'Doporučená cena (s DPH)', default: true  },
      { id: 'recommended_price_source',  label: 'Zdroj doporučení',        default: true  },
      { id: 'rec_margin_change',         label: 'Změna marže (%)',          default: false },
      { id: 'rec_revenue_impact',        label: 'Dopad na tržby (%)',       default: false },
      { id: 'rec_status',                label: 'Stav doporučení',          default: false },
    ],
  },
  {
    label: 'Systémové', color: '#555555',
    fields: [
      { id: 'created_at', label: 'Vytvořeno', default: false },
      { id: 'updated_at', label: 'Upraveno',  default: false },
    ],
  },
]

export default function ExportPage() {
  const [exporting, setExporting]     = useState<'xlsx' | 'csv' | null>(null)
  const [exported, setExported]       = useState<'xlsx' | 'csv' | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  // Field groups (loaded from API meta)
  const [fieldGroups, setFieldGroups] = useState<FieldGroup[]>(FALLBACK_GROUPS)
  const [checkedFields, setCheckedFields] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(FALLBACK_GROUPS.flatMap(g => g.fields.map(f => [f.id, f.default])))
  )
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  // Filtry
  const [categories, setCategories]         = useState<string[]>([])
  const [totalProducts, setTotalProducts]   = useState<number | null>(null)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterMarket, setFilterMarket]     = useState('')
  const [filterSearch, setFilterSearch]     = useState('')
  const [filterMinPrice, setFilterMinPrice] = useState('')
  const [filterMaxPrice, setFilterMaxPrice] = useState('')

  const allFields = fieldGroups.flatMap(g => g.fields)
  const selectedCount = allFields.filter(f => checkedFields[f.id]).length
  const hasFilters = !!(filterCategory || filterMarket || filterSearch || filterMinPrice || filterMaxPrice)

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
          if (data.field_groups?.length) {
            const groups = data.field_groups as FieldGroup[]
            setFieldGroups(groups)
            // Init checked state from API defaults (keep user selections if already set)
            setCheckedFields(prev => {
              const next = { ...prev }
              for (const g of groups) {
                for (const f of g.fields) {
                  if (!(f.id in next)) next[f.id] = f.default
                }
              }
              return next
            })
          }
        }
      })
      .catch(() => {})
  }, [])

  const buildUrl = (format: 'xlsx' | 'csv') => {
    const fields = allFields.filter(f => checkedFields[f.id]).map(f => f.id).join(',')
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
    setFilterCategory(''); setFilterMarket('')
    setFilterSearch(''); setFilterMinPrice(''); setFilterMaxPrice('')
  }

  const selectAll = () => setCheckedFields(Object.fromEntries(allFields.map(f => [f.id, true])))
  const selectNone = () => setCheckedFields(Object.fromEntries(allFields.map(f => [f.id, false])))
  const selectDefault = () => setCheckedFields(Object.fromEntries(allFields.map(f => [f.id, f.default])))
  const toggleGroup = (label: string, val: boolean) =>
    setCheckedFields(prev => {
      const next = { ...prev }
      const g = fieldGroups.find(g => g.label === label)
      g?.fields.forEach(f => { next[f.id] = val })
      return next
    })

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Export centrum</h1>
          <p className="text-sm text-gray-400 mt-0.5">Stáhni cenová a produktová data do XLSX nebo CSV</p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Formáty</p>
          <p className="text-2xl font-bold text-gray-900">2</p>
          <p className="text-xs text-gray-400 mt-0.5">XLSX + CSV</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Vybraných polí</p>
          <p className="text-2xl font-bold text-blue-700">{selectedCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">z {allFields.length} dostupných</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Produktů celkem</p>
          <p className="text-2xl font-bold text-gray-900">{totalProducts ?? '—'}</p>
          <p className="text-xs text-gray-400 mt-0.5">{hasFilters ? 'filtr aktivní' : 'bez filtru'}</p>
        </div>
      </div>

      {/* Field groups selector */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Header row */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Vybraná pole pro export</p>
          <div className="flex items-center gap-3">
            <button onClick={selectDefault} className="text-xs text-gray-500 hover:text-gray-800 transition">Výchozí</button>
            <span className="text-gray-200">|</span>
            <button onClick={selectAll} className="text-xs text-blue-600 hover:text-blue-800 transition font-medium">Vše</button>
            <span className="text-gray-200">|</span>
            <button onClick={selectNone} className="text-xs text-gray-400 hover:text-gray-600 transition">Žádné</button>
          </div>
        </div>

        {/* Groups */}
        <div className="divide-y divide-gray-50">
          {fieldGroups.map(g => {
            const groupChecked = g.fields.filter(f => checkedFields[f.id]).length
            const collapsed = !!collapsedGroups[g.label]
            return (
              <div key={g.label}>
                {/* Group header */}
                <div className="flex items-center gap-3 px-5 py-2.5 bg-gray-50 cursor-pointer select-none"
                  onClick={() => setCollapsedGroups(prev => ({ ...prev, [g.label]: !prev[g.label] }))}>
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                  <span className="text-xs font-semibold text-gray-700 flex-1">{g.label}</span>
                  <span className="text-xs text-gray-400 tabular-nums">{groupChecked}/{g.fields.length}</span>
                  <div className="flex items-center gap-2 ml-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => toggleGroup(g.label, true)}
                      className="text-xs px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 transition">Vše</button>
                    <button onClick={() => toggleGroup(g.label, false)}
                      className="text-xs px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-400 hover:bg-gray-100 transition">Žádné</button>
                  </div>
                  {collapsed ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronUp size={13} className="text-gray-400" />}
                </div>

                {/* Fields grid */}
                {!collapsed && (
                  <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {g.fields.map(field => (
                      <label key={field.id} className="flex items-center gap-2 cursor-pointer group py-1">
                        <input type="checkbox"
                          checked={!!checkedFields[field.id]}
                          onChange={e => setCheckedFields(prev => ({ ...prev, [field.id]: e.target.checked }))}
                          className="w-3.5 h-3.5 rounded border-gray-300 flex-shrink-0"
                          style={{ accentColor: g.color }}
                        />
                        <span className="text-xs text-gray-600 group-hover:text-gray-900 transition leading-tight">{field.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
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
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Hledat název</label>
            <input type="text" value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
              placeholder="pistácie, mandle…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Kategorie</label>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Všechny kategorie</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Trh</label>
            <select value={filterMarket} onChange={e => setFilterMarket(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {MARKET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Min. cena</label>
            <input type="number" value={filterMinPrice} onChange={e => setFilterMinPrice(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Max. cena</label>
            <input type="number" value={filterMaxPrice} onChange={e => setFilterMaxPrice(e.target.value)}
              placeholder="99999"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        {hasFilters && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {filterSearch   && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">Hledám: {filterSearch}</span>}
            {filterCategory && <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-100">Kategorie: {filterCategory}</span>}
            {filterMarket   && <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-100">Trh: {filterMarket}</span>}
            {filterMinPrice && <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full border border-orange-100">Min: {filterMinPrice} Kč</span>}
            {filterMaxPrice && <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full border border-orange-100">Max: {filterMaxPrice} Kč</span>}
          </div>
        )}
      </div>

      {/* Error */}
      {exportError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <X size={14} className="mt-0.5 flex-shrink-0" />
          <span>{exportError}</span>
        </div>
      )}

      {/* Export buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* XLSX */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <FileSpreadsheet size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">XLSX Export</p>
              <p className="text-xs text-gray-400">Excel — barevné skupiny sloupců, snadné filtrování</p>
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

      {/* Field legend */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">Legenda skupin</p>
        <div className="flex flex-wrap gap-3">
          {fieldGroups.map(g => (
            <div key={g.label} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
              <span className="text-xs text-gray-600">{g.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
