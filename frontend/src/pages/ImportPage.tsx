import { useState } from 'react'
import { Upload, CheckCircle, AlertCircle } from 'lucide-react'
import { apiClient } from '@/api/client'
import { useMarketStore } from '@/store/market'

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importType, setImportType] = useState<'heureka' | 'spreadsheet'>('heureka')
  const [market, setMarket] = useState<'CZ' | 'SK'>('CZ')
  const [mergeExisting, setMergeExisting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string; imported?: number; updated?: number; skipped?: number; errors?: any[] } | null>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      const isValidFile = importType === 'heureka'
        ? droppedFile.name.endsWith('.xml')
        : (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.csv'))

      if (isValidFile) {
        setFile(droppedFile)
        setResult(null)
      }
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
      let data

      if (importType === 'heureka') {
        data = await apiClient.importHeureaFeed(file, market, mergeExisting)
      } else {
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch('http://localhost:8000/api/catalog/import', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) throw new Error('Chyba při importu')
        data = await response.json()
      }

      setResult({
        success: true,
        message: importType === 'heureka'
          ? `Heureka import úspěšný!${mergeExisting ? ' (se slučováním)' : ''}`
          : `Import úspěšný!`,
        imported: data.imported,
        updated: data.updated,
        skipped: data.skipped,
      })
      setFile(null)
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Chyba při importu souboru'
      })
    } finally {
      setImporting(false)
    }
  }

  const acceptFileType = importType === 'heureka' ? '.xml' : '.xlsx,.csv'
  const supportedFormats = importType === 'heureka'
    ? '.xml (Heureka feed)'
    : '.xlsx, .csv'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Import produktů</h1>
        <p className="text-gray-600 mt-2">Importujte produkty přes XML Heureka feed nebo tabulku</p>
      </div>

      {/* Import Type Selection */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Typ importu</h3>
        <div className="flex gap-4">
          <button
            onClick={() => { setImportType('heureka'); setFile(null); setResult(null) }}
            className={`flex-1 px-4 py-3 rounded-lg border-2 transition font-medium ${
              importType === 'heureka'
                ? 'border-blue-600 bg-blue-50 text-blue-900'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            }`}
          >
            📦 Heureka XML Feed
          </button>
          <button
            onClick={() => { setImportType('spreadsheet'); setFile(null); setResult(null) }}
            className={`flex-1 px-4 py-3 rounded-lg border-2 transition font-medium ${
              importType === 'spreadsheet'
                ? 'border-blue-600 bg-blue-50 text-blue-900'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            }`}
          >
            📊 Tabulka (XLSX/CSV)
          </button>
        </div>
      </div>

      {/* Heureka Options */}
      {importType === 'heureka' && (
        <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
          <h3 className="font-semibold text-blue-900 mb-4">Nastavení Heureka importu</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-blue-900 mb-2">Trh</label>
              <div className="flex gap-3">
                {(['CZ', 'SK'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMarket(m)}
                    className={`px-4 py-2 rounded-lg font-medium transition ${
                      market === m
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-100'
                    }`}
                  >
                    {m === 'CZ' ? '🇨🇿 Česko' : '🇸🇰 Slovensko'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="merge"
                checked={mergeExisting}
                onChange={(e) => setMergeExisting(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <label htmlFor="merge" className="text-sm text-blue-900 font-medium cursor-pointer">
                Sloučit s existujícími produkty (aktualizovat duplikáty podle EAN)
              </label>
            </div>
          </div>
        </div>
      )}

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
            accept={acceptFileType}
            onChange={handleFileChange}
            className="hidden"
          />
        </label>

        <p className="text-gray-500 text-sm mt-4">Podporované: {supportedFormats} – Max 20 MB</p>
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
          className={`border rounded-lg p-4 ${
            result.success
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }`}
        >
          <div className="flex items-start space-x-3">
            {result.success ? (
              <>
                <CheckCircle size={24} className="text-green-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <p className="font-medium text-green-900">{result.message}</p>
                  {(result.imported || result.updated || result.skipped) && (
                    <div className="mt-2 text-sm text-green-700 space-y-1">
                      {result.imported !== undefined && <p>Importováno: {result.imported}</p>}
                      {result.updated !== undefined && result.updated > 0 && <p>Aktualizováno: {result.updated}</p>}
                      {result.skipped !== undefined && result.skipped > 0 && <p>Přeskočeno: {result.skipped}</p>}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <AlertCircle size={24} className="text-red-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <p className="font-medium text-red-900">{result.message}</p>
                  {result.errors && result.errors.length > 0 && (
                    <div className="mt-2 text-sm text-red-700">
                      {result.errors.map((err, i) => (
                        <p key={i}>• {typeof err === 'string' ? err : JSON.stringify(err)}</p>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Instructions */}
      {importType === 'heureka' ? (
        <div className="bg-gray-50 rounded-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-3">Heureka XML Feed</h3>
          <p className="text-gray-600 text-sm mb-4">
            Stáhněte si XML feed ze své Heureka integrace. Soubor musí obsahovat elementy ITEM s následujícími poli:
          </p>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-center space-x-2">
              <span className="text-blue-600 font-bold">•</span>
              <span><strong>ID</strong> – Identifikátor (EAN)</span>
            </li>
            <li className="flex items-center space-x-2">
              <span className="text-blue-600 font-bold">•</span>
              <span><strong>TITLE</strong> – Název produktu</span>
            </li>
            <li className="flex items-center space-x-2">
              <span className="text-blue-600 font-bold">•</span>
              <span><strong>CATEGORYTEXT</strong> – Kategorie</span>
            </li>
            <li className="flex items-center space-x-2">
              <span className="text-blue-600 font-bold">•</span>
              <span><strong>PRICE_CZK / PRICE_SKK</strong> – Cena bez DPH</span>
            </li>
            <li className="flex items-center space-x-2">
              <span className="text-blue-600 font-bold">•</span>
              <span><strong>PARAM (DPH)</strong> – Sazba DPH (%)</span>
            </li>
          </ul>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-3">Formát tabulky</h3>
          <p className="text-gray-600 text-sm mb-4">
            Soubor musí obsahovat následující sloupce (v tomto pořadí):
          </p>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-center space-x-2">
              <span className="w-6 h-6 bg-blue-100 rounded text-blue-600 flex items-center justify-center text-xs font-bold">1</span>
              <span><strong>Název produktu</strong> – Povinné</span>
            </li>
            <li className="flex items-center space-x-2">
              <span className="w-6 h-6 bg-blue-100 rounded text-blue-600 flex items-center justify-center text-xs font-bold">2</span>
              <span><strong>SKU</strong> – Povinné, unikátní</span>
            </li>
            <li className="flex items-center space-x-2">
              <span className="w-6 h-6 bg-blue-100 rounded text-blue-600 flex items-center justify-center text-xs font-bold">3</span>
              <span><strong>Kategorie</strong> – Volitelné</span>
            </li>
            <li className="flex items-center space-x-2">
              <span className="w-6 h-6 bg-blue-100 rounded text-blue-600 flex items-center justify-center text-xs font-bold">4</span>
              <span><strong>Popis</strong> – Volitelné</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}
