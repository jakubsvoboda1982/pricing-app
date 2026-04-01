import { useState } from 'react'
import { Download, FileText, Check, FileSpreadsheet } from 'lucide-react'

const ALL_FIELDS = [
  { id: 'id',            label: 'Product ID',    defaultChecked: true  },
  { id: 'sku',           label: 'SKU',            defaultChecked: true  },
  { id: 'name',          label: 'Název',          defaultChecked: true  },
  { id: 'category',      label: 'Kategorie',      defaultChecked: true  },
  { id: 'description',   label: 'Popis',          defaultChecked: true  },
  { id: 'current_price', label: 'Aktuální cena',  defaultChecked: false },
  { id: 'old_price',     label: 'Stará cena',     defaultChecked: false },
  { id: 'created_at',    label: 'Vytvořeno',      defaultChecked: true  },
  { id: 'updated_at',    label: 'Upraveno',       defaultChecked: true  },
]

export default function ExportPage() {
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState<'xlsx' | 'csv' | null>(null)
  const [checkedFields, setCheckedFields] = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_FIELDS.map(f => [f.id, f.defaultChecked]))
  )

  const selectedCount = Object.values(checkedFields).filter(Boolean).length

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setExporting(true)
    try {
      const response = await fetch(`/api/export/products/${format}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
      })
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `products-${new Date().toISOString().split('T')[0]}.${format}`
        document.body.appendChild(link)
        link.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(link)
        setExported(format)
        setTimeout(() => setExported(null), 3000)
      }
    } catch (e) {
      console.error('Export failed:', e)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Export centrum</h1>
        <p className="text-sm text-gray-400 mt-0.5">Stáhni cenová a produktová data do XLSX nebo CSV</p>
      </div>

      {/* ── KPI STRIP ──────────────────────────────────────────────────── */}
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
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Poslední export</p>
          <p className="text-sm font-semibold text-gray-700">products-2024-03-20.xlsx</p>
          <p className="text-xs text-gray-400 mt-0.5">117 produktů · 2.3 MB</p>
        </div>
      </div>

      {/* ── FIELD SELECTION ────────────────────────────────────────────── */}
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

      {/* ── EXPORT BUTTONS ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* XLSX */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <FileSpreadsheet size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">XLSX Export</p>
              <p className="text-xs text-gray-400">Excel formát — nejlepší pro tabulkové zpracování</p>
            </div>
          </div>
          <button onClick={() => handleExport('xlsx')} disabled={exporting}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
              exported === 'xlsx'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}>
            {exported === 'xlsx' ? <><Check size={16} /> Staženo!</> : <><Download size={16} /> {exporting ? 'Exportuji...' : 'Stáhnout XLSX'}</>}
          </button>
        </div>

        {/* CSV */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <FileText size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">CSV Export</p>
              <p className="text-xs text-gray-400">Textový formát — kompatibilní se všemi editory</p>
            </div>
          </div>
          <button onClick={() => handleExport('csv')} disabled={exporting}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
              exported === 'csv'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}>
            {exported === 'csv' ? <><Check size={16} /> Staženo!</> : <><Download size={16} /> {exporting ? 'Exportuji...' : 'Stáhnout CSV'}</>}
          </button>
        </div>
      </div>
    </div>
  )
}
