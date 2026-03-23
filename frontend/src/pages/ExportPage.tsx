import { useState } from 'react'
import { Download, FileText, Check } from 'lucide-react'

export default function ExportPage() {
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState<'xlsx' | 'csv' | null>(null)

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setExporting(true)
    try {
      const endpoint = `/api/export/products/${format}`
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        },
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
    } catch (error) {
      console.error('Export failed:', error)
    } finally {
      setExporting(false)
    }
  }

  const fields = [
    { id: 'id', label: 'Product ID', checked: true },
    { id: 'sku', label: 'SKU', checked: true },
    { id: 'name', label: 'Název', checked: true },
    { id: 'category', label: 'Kategorie', checked: true },
    { id: 'description', label: 'Popis', checked: true },
    { id: 'current_price', label: 'Aktuální cena', checked: false },
    { id: 'old_price', label: 'Stará cena', checked: false },
    { id: 'created_at', label: 'Vytvořeno', checked: true },
    { id: 'updated_at', label: 'Upraveno', checked: true },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Export centrum</h1>
        <p className="text-gray-600 mt-2">Exportujte cenová data a doprovodná data do XLSX nebo CSV</p>
      </div>

      {/* Export Formats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* XLSX Export */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <FileText size={24} className="text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">XLSX Export</h3>
              <p className="text-sm text-gray-600">Excel formát</p>
            </div>
          </div>

          <p className="text-gray-600 text-sm mb-4">
            Exportuje všechny produkty a jejich ceny do formátu XLSX. Vhodné pro další zpracování v Excelu.
          </p>

          <button
            onClick={() => handleExport('xlsx')}
            disabled={exporting}
            className={`w-full flex items-center justify-center space-x-2 px-6 py-3 rounded-lg font-medium transition ${
              exported === 'xlsx'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-green-600 hover:bg-green-700 text-white'
            } disabled:opacity-50`}
          >
            {exported === 'xlsx' ? (
              <>
                <Check size={20} />
                <span>Staženo!</span>
              </>
            ) : (
              <>
                <Download size={20} />
                <span>{exporting ? 'Exportuji...' : 'Export XLSX'}</span>
              </>
            )}
          </button>
        </div>

        {/* CSV Export */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <FileText size={24} className="text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">CSV Export</h3>
              <p className="text-sm text-gray-600">Text formát</p>
            </div>
          </div>

          <p className="text-gray-600 text-sm mb-4">
            Exportuje všechny produkty a jejich ceny do formátu CSV. Kompatibilní se všemi tabulkovými editory.
          </p>

          <button
            onClick={() => handleExport('csv')}
            disabled={exporting}
            className={`w-full flex items-center justify-center space-x-2 px-6 py-3 rounded-lg font-medium transition ${
              exported === 'csv'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            } disabled:opacity-50`}
          >
            {exported === 'csv' ? (
              <>
                <Check size={20} />
                <span>Staženo!</span>
              </>
            ) : (
              <>
                <Download size={20} />
                <span>{exporting ? 'Exportuji...' : 'Export CSV'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Field Selection */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Vybrané sloupce</h3>
        <div className="grid grid-cols-2 gap-4">
          {fields.map((field) => (
            <label key={field.id} className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                defaultChecked={field.checked}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-gray-700">{field.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Recent Exports */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Poslední exporty</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
            <div>
              <p className="font-medium text-gray-900">products-2024-03-20.xlsx</p>
              <p className="text-sm text-gray-600">117 produktů • 2.3 MB</p>
            </div>
            <button className="text-blue-600 hover:text-blue-700">
              <Download size={20} />
            </button>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
            <div>
              <p className="font-medium text-gray-900">products-2024-03-19.csv</p>
              <p className="text-sm text-gray-600">115 produktů • 1.8 MB</p>
            </div>
            <button className="text-blue-600 hover:text-blue-700">
              <Download size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
