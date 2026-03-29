import { useState } from 'react'
import { Upload, CheckCircle, AlertCircle } from 'lucide-react'
import { apiClient } from '@/api/client'

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string; count?: number } | null>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.csv'))) {
      setFile(droppedFile)
      setResult(null)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setResult(null)
    }
  }

  const handleImport = async () => {
    if (!file) return
    setImporting(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      // Import do katalogu produktů
      const response = await fetch('http://localhost:8000/api/catalog/import', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()
        setResult({
          success: true,
          message: `Import úspěšný! Importováno ${data.imported} produktů.${data.skipped > 0 ? ` Přeskočeno ${data.skipped}.` : ''}`,
          count: data.imported,
        })
        setFile(null)
      } else {
        const error = await response.json()
        setResult({ success: false, message: error.detail || 'Chyba při importu' })
      }
    } catch (error) {
      setResult({ success: false, message: 'Chyba při importu souboru' })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Import produktů</h1>
        <p className="text-gray-600 mt-2">Importujte cenová data a doprovodnou data do XLSX nebo CSV</p>
      </div>

      {/* Upload Area */}
      <div
        onDrop={handleDrop}
        onDragOver={() => setIsDragOver(true)}
        onDragLeave={() => setIsDragOver(false)}
        className={`border-2 border-dashed rounded-lg p-12 text-center transition ${
          isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'
        }`}
      >
        <Upload size={48} className="mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Přetáhněte soubor sem</h3>
        <p className="text-gray-600 mb-4">nebo</p>

        <label className="inline-block">
          <span className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg cursor-pointer">
            Vybrat soubor
          </span>
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>

        <p className="text-gray-500 text-sm mt-4">Podporované: .xlsx, .csv – Max 20 MB</p>
      </div>

      {/* Selected File */}
      {file && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-blue-100 rounded flex items-center justify-center">
                <Upload size={24} className="text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-600">{(file.size / 1024).toFixed(2)} KB</p>
              </div>
            </div>
            <button
              onClick={() => setFile(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          <button
            onClick={handleImport}
            disabled={importing}
            className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50"
          >
            {importing ? 'Importuji...' : 'Začít import'}
          </button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div
          className={`border rounded-lg p-4 flex items-center space-x-3 ${
            result.success
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }`}
        >
          {result.success ? (
            <>
              <CheckCircle size={24} className="text-green-600" />
              <div>
                <p className="font-medium text-green-900">{result.message}</p>
                {result.count && (
                  <p className="text-sm text-green-700">Importováno {result.count} produktů</p>
                )}
              </div>
            </>
          ) : (
            <>
              <AlertCircle size={24} className="text-red-600" />
              <p className="font-medium text-red-900">{result.message}</p>
            </>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="font-semibold text-gray-900 mb-3">Formát souboru</h3>
        <p className="text-gray-600 text-sm mb-4">
          Soubor musí obsahovat následující sloupce (v tomto pořadí):
        </p>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-center space-x-2">
            <span className="w-6 h-6 bg-blue-100 rounded text-blue-600 flex items-center justify-center text-xs font-bold">
              1
            </span>
            <span>
              <strong>Název produktu</strong> – Povinné
            </span>
          </li>
          <li className="flex items-center space-x-2">
            <span className="w-6 h-6 bg-blue-100 rounded text-blue-600 flex items-center justify-center text-xs font-bold">
              2
            </span>
            <span>
              <strong>SKU</strong> – Povinné, unikátní
            </span>
          </li>
          <li className="flex items-center space-x-2">
            <span className="w-6 h-6 bg-blue-100 rounded text-blue-600 flex items-center justify-center text-xs font-bold">
              3
            </span>
            <span>
              <strong>Kategorie</strong> – Volitelné
            </span>
          </li>
          <li className="flex items-center space-x-2">
            <span className="w-6 h-6 bg-blue-100 rounded text-blue-600 flex items-center justify-center text-xs font-bold">
              4
            </span>
            <span>
              <strong>Popis</strong> – Volitelné
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}
