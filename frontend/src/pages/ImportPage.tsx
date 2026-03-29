import { useState, useEffect } from 'react'
import { Upload, CheckCircle, AlertCircle, Link, Plus, Trash2, RefreshCw, Globe } from 'lucide-react'
import { apiClient, API_BASE_URL } from '@/api/client'

interface FeedSubscription {
  id: string
  name: string
  feed_url: string
  market: string
  merge_existing: boolean
  is_active: boolean
  last_fetched_at?: string
  last_fetch_status?: string
  last_fetch_message?: string
  last_imported_count: number
  last_updated_count: number
}

export default function ImportPage() {
  const [activeTab, setActiveTab] = useState<'file' | 'url' | 'feeds'>('file')

  // --- File import state ---
  const [file, setFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importType, setImportType] = useState<'heureka' | 'spreadsheet'>('heureka')
  const [market, setMarket] = useState<'CZ' | 'SK'>('CZ')
  const [mergeExisting, setMergeExisting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string; imported?: number; updated?: number; skipped?: number; errors?: any[] } | null>(null)

  // --- URL import state ---
  const [urlInput, setUrlInput] = useState('')
  const [urlName, setUrlName] = useState('')
  const [urlMarket, setUrlMarket] = useState<'CZ' | 'SK'>('CZ')
  const [urlType, setUrlType] = useState<'own' | 'competitor'>('own')
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlResult, setUrlResult] = useState<{ success: boolean; message: string } | null>(null)

  // --- Feed subscriptions state ---
  const [feeds, setFeeds] = useState<FeedSubscription[]>([])
  const [feedsLoading, setFeedsLoading] = useState(false)
  const [newFeedName, setNewFeedName] = useState('')
  const [newFeedUrl, setNewFeedUrl] = useState('')
  const [newFeedMarket, setNewFeedMarket] = useState<'CZ' | 'SK'>('CZ')
  const [newFeedMerge, setNewFeedMerge] = useState(true)
  const [addingFeed, setAddingFeed] = useState(false)
  const [fetchingFeedId, setFetchingFeedId] = useState<string | null>(null)
  const [feedResult, setFeedResult] = useState<{ success: boolean; message: string } | null>(null)

  // Load feeds when tab is active
  useEffect(() => {
    if (activeTab === 'feeds') loadFeeds()
  }, [activeTab])

  const loadFeeds = async () => {
    setFeedsLoading(true)
    try {
      const data = await apiClient.getFeedSubscriptions()
      setFeeds(data)
    } catch {
      // ignore
    } finally {
      setFeedsLoading(false)
    }
  }

  // --- File import handlers ---
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      const isValidFile = importType === 'heureka'
        ? droppedFile.name.endsWith('.xml')
        : (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.csv'))
      if (isValidFile) { setFile(droppedFile); setResult(null) }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) { setFile(selectedFile); setResult(null) }
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
        const response = await fetch(`${API_BASE_URL}/catalog/import`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` },
          body: formData,
        })
        if (!response.ok) throw new Error('Chyba při importu')
        data = await response.json()
      }
      setResult({
        success: true,
        message: importType === 'heureka'
          ? `Heureka XML import úspěšný!${mergeExisting ? ' (se slučováním)' : ''}`
          : `Import tabulky úspěšný!`,
        imported: data.imported,
        updated: data.updated,
        skipped: data.skipped,
      })
      setFile(null)
    } catch (error) {
      setResult({ success: false, message: error instanceof Error ? error.message : 'Chyba při importu souboru' })
    } finally {
      setImporting(false)
    }
  }

  // --- URL import handler ---
  const handleUrlImport = async () => {
    if (!urlInput.trim()) return
    setUrlLoading(true)
    setUrlResult(null)
    try {
      const data = await apiClient.importProductFromUrl(urlInput, urlMarket, urlType, urlName || undefined)
      setUrlResult({ success: true, message: data.message })
      setUrlInput('')
      setUrlName('')
    } catch (error) {
      setUrlResult({ success: false, message: error instanceof Error ? error.message : 'Chyba při importu' })
    } finally {
      setUrlLoading(false)
    }
  }

  // --- Feed subscription handlers ---
  const handleAddFeed = async () => {
    if (!newFeedUrl.trim() || !newFeedName.trim()) return
    setAddingFeed(true)
    setFeedResult(null)
    try {
      await apiClient.createFeedSubscription({ name: newFeedName, feed_url: newFeedUrl, market: newFeedMarket, merge_existing: newFeedMerge })
      setNewFeedName('')
      setNewFeedUrl('')
      setFeedResult({ success: true, message: 'Feed byl přidán' })
      await loadFeeds()
    } catch (error) {
      setFeedResult({ success: false, message: error instanceof Error ? error.message : 'Chyba při přidávání feedu' })
    } finally {
      setAddingFeed(false)
    }
  }

  const handleDeleteFeed = async (id: string) => {
    try {
      await apiClient.deleteFeedSubscription(id)
      await loadFeeds()
    } catch { /* ignore */ }
  }

  const handleFetchFeed = async (id: string) => {
    setFetchingFeedId(id)
    try {
      const data = await apiClient.triggerFeedFetch(id)
      await loadFeeds()
      setFeedResult({ success: data.status === 'success', message: data.message })
    } catch (error) {
      setFeedResult({ success: false, message: error instanceof Error ? error.message : 'Chyba při načítání feedu' })
    } finally {
      setFetchingFeedId(null)
    }
  }

  const acceptFileType = importType === 'heureka' ? '.xml' : '.xlsx,.csv'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Import produktů</h1>
        <p className="text-gray-600 mt-2">Importujte produkty ze souboru, URL adresy nebo automaticky z XML feedu</p>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow p-1 flex gap-1">
        <button
          onClick={() => setActiveTab('file')}
          className={`flex-1 px-4 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2 ${
            activeTab === 'file' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Upload size={18} />
          Ze souboru
        </button>
        <button
          onClick={() => setActiveTab('url')}
          className={`flex-1 px-4 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2 ${
            activeTab === 'url' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Link size={18} />
          Z URL adresy
        </button>
        <button
          onClick={() => setActiveTab('feeds')}
          className={`flex-1 px-4 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2 ${
            activeTab === 'feeds' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Globe size={18} />
          Automatické feedy
          {feeds.length > 0 && (
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
              {feeds.length}
            </span>
          )}
        </button>
      </div>

      {/* ===== TAB: Ze souboru ===== */}
      {activeTab === 'file' && (
        <>
          {/* Import Type Selection */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Typ souboru</h3>
            <div className="flex gap-4">
              <button
                onClick={() => { setImportType('heureka'); setFile(null); setResult(null) }}
                className={`flex-1 px-4 py-3 rounded-lg border-2 transition font-medium ${
                  importType === 'heureka' ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                📦 Heureka XML Feed
              </button>
              <button
                onClick={() => { setImportType('spreadsheet'); setFile(null); setResult(null) }}
                className={`flex-1 px-4 py-3 rounded-lg border-2 transition font-medium ${
                  importType === 'spreadsheet' ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                📊 Tabulka (XLSX/CSV)
              </button>
            </div>
          </div>

          {/* Heureka Options */}
          {importType === 'heureka' && (
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
              <h3 className="font-semibold text-blue-900 mb-4">Nastavení importu</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-blue-900 mb-2">Trh</label>
                  <div className="flex gap-3">
                    {(['CZ', 'SK'] as const).map((m) => (
                      <button key={m} onClick={() => setMarket(m)}
                        className={`px-4 py-2 rounded-lg font-medium transition ${market === m ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-100'}`}
                      >
                        {m === 'CZ' ? '🇨🇿 Česko' : '🇸🇰 Slovensko'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="merge" checked={mergeExisting} onChange={(e) => setMergeExisting(e.target.checked)} className="w-4 h-4 rounded border-gray-300" />
                  <label htmlFor="merge" className="text-sm text-blue-900 font-medium cursor-pointer">
                    Sloučit s existujícími produkty (aktualizovat duplikáty podle EAN nebo PRODUCTNO)
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
            className={`border-2 border-dashed rounded-lg p-12 text-center transition ${isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'}`}
          >
            <Upload size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Přetáhněte soubor sem</h3>
            <p className="text-gray-600 mb-4">nebo</p>
            <label className="inline-block">
              <span className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg cursor-pointer">
                Vybrat soubor
              </span>
              <input type="file" accept={acceptFileType} onChange={handleFileChange} className="hidden" />
            </label>
            <p className="text-gray-500 text-sm mt-4">
              {importType === 'heureka' ? '.xml (Heureka feed)' : '.xlsx, .csv'} – Max 20 MB
            </p>
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
                <button onClick={() => setFile(null)} className="text-gray-500 hover:text-gray-700">✕</button>
              </div>
              <button onClick={handleImport} disabled={importing} className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50">
                {importing ? 'Importuji...' : 'Začít import'}
              </button>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`border rounded-lg p-4 ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-start space-x-3">
                {result.success ? (
                  <>
                    <CheckCircle size={24} className="text-green-600 flex-shrink-0 mt-1" />
                    <div className="flex-1">
                      <p className="font-medium text-green-900">{result.message}</p>
                      <div className="mt-2 text-sm text-green-700 space-y-1">
                        {result.imported !== undefined && <p>Importováno: {result.imported}</p>}
                        {result.updated !== undefined && result.updated > 0 && <p>Aktualizováno: {result.updated}</p>}
                        {result.skipped !== undefined && result.skipped > 0 && <p>Přeskočeno: {result.skipped}</p>}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertCircle size={24} className="text-red-600 flex-shrink-0 mt-1" />
                    <div className="flex-1">
                      <p className="font-medium text-red-900">{result.message}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== TAB: Z URL adresy ===== */}
      {activeTab === 'url' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Import produktu z URL adresy</h3>
            <p className="text-sm text-gray-600">
              Zadejte URL adresu produktu. Systém automaticky načte název stránky a přidá produkt.
            </p>

            {/* URL Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Typ produktu</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setUrlType('own')}
                  className={`flex-1 py-2 px-4 rounded-lg border-2 font-medium transition ${urlType === 'own' ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}
                >
                  🏪 Vlastní produkt
                </button>
                <button
                  onClick={() => setUrlType('competitor')}
                  className={`flex-1 py-2 px-4 rounded-lg border-2 font-medium transition ${urlType === 'competitor' ? 'border-orange-500 bg-orange-50 text-orange-900' : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}
                >
                  🔍 Produkt konkurenta
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {urlType === 'own'
                  ? 'Přidá URL produktu do katalogu ke sledování'
                  : 'Přidá doménu jako konkurenta a uloží URL produktu ke sledování'}
              </p>
            </div>

            {/* Market */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Trh</label>
              <div className="flex gap-3">
                {(['CZ', 'SK'] as const).map((m) => (
                  <button key={m} onClick={() => setUrlMarket(m)}
                    className={`px-4 py-2 rounded-lg font-medium transition ${urlMarket === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    {m === 'CZ' ? '🇨🇿 Česko' : '🇸🇰 Slovensko'}
                  </button>
                ))}
              </div>
            </div>

            {/* URL Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">URL adresa produktu *</label>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://www.example.cz/produkt/nazev-produktu"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Optional name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Název produktu (volitelné)</label>
              <input
                type="text"
                value={urlName}
                onChange={(e) => setUrlName(e.target.value)}
                placeholder="Vyplňte název, nebo nechte prázdné pro automatické načtení"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {urlResult && (
              <div className={`border rounded-lg p-4 ${urlResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center space-x-3">
                  {urlResult.success
                    ? <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
                    : <AlertCircle size={20} className="text-red-600 flex-shrink-0" />}
                  <p className={`text-sm font-medium ${urlResult.success ? 'text-green-900' : 'text-red-900'}`}>{urlResult.message}</p>
                </div>
              </div>
            )}

            <button
              onClick={handleUrlImport}
              disabled={urlLoading || !urlInput.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50"
            >
              {urlLoading ? 'Načítám...' : urlType === 'own' ? 'Přidat do katalogu' : 'Přidat ke sledování'}
            </button>
          </div>
        </div>
      )}

      {/* ===== TAB: Automatické feedy ===== */}
      {activeTab === 'feeds' && (
        <div className="space-y-6">
          {/* Add New Feed */}
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Přidat XML feed</h3>
            <p className="text-sm text-gray-600">
              URL feedy se automaticky načítají každý den v 02:00 UTC. Můžete je také spustit ručně.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Název feedy *</label>
                <input
                  type="text"
                  value={newFeedName}
                  onChange={(e) => setNewFeedName(e.target.value)}
                  placeholder="Např. Nuties CZ Heureka feed"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Trh</label>
                <div className="flex gap-2">
                  {(['CZ', 'SK'] as const).map((m) => (
                    <button key={m} onClick={() => setNewFeedMarket(m)}
                      className={`flex-1 py-2 rounded-lg font-medium transition text-sm ${newFeedMarket === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      {m === 'CZ' ? '🇨🇿 CZ' : '🇸🇰 SK'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">URL XML feedy *</label>
              <input
                type="url"
                value={newFeedUrl}
                onChange={(e) => setNewFeedUrl(e.target.value)}
                placeholder="https://www.nuties.cz/heureka-cz.xml"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-3">
              <input type="checkbox" id="feedMerge" checked={newFeedMerge} onChange={(e) => setNewFeedMerge(e.target.checked)} className="w-4 h-4 rounded" />
              <label htmlFor="feedMerge" className="text-sm text-gray-700 cursor-pointer">Sloučit s existujícími produkty (aktualizovat duplicity)</label>
            </div>

            {feedResult && (
              <div className={`border rounded-lg p-3 ${feedResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center space-x-3">
                  {feedResult.success
                    ? <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
                    : <AlertCircle size={18} className="text-red-600 flex-shrink-0" />}
                  <p className={`text-sm font-medium ${feedResult.success ? 'text-green-900' : 'text-red-900'}`}>{feedResult.message}</p>
                </div>
              </div>
            )}

            <button
              onClick={handleAddFeed}
              disabled={addingFeed || !newFeedUrl.trim() || !newFeedName.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
            >
              <Plus size={18} />
              {addingFeed ? 'Přidávám...' : 'Přidat feed'}
            </button>
          </div>

          {/* Feed List */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Aktivní feedy ({feeds.length})</h3>
              <button onClick={loadFeeds} className="text-gray-500 hover:text-gray-700 p-1 rounded" title="Obnovit seznam">
                <RefreshCw size={18} className={feedsLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            {feedsLoading ? (
              <div className="p-6 text-center text-gray-500">Načítám feedy...</div>
            ) : feeds.length === 0 ? (
              <div className="p-6 text-center text-gray-500">Žádné feedy. Přidejte první výše.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {feeds.map((feed) => (
                  <div key={feed.id} className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h4 className="font-medium text-gray-900">{feed.name}</h4>
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${feed.market === 'CZ' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                            {feed.market === 'CZ' ? '🇨🇿 CZ' : '🇸🇰 SK'}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded ${feed.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            {feed.is_active ? 'Aktivní' : 'Neaktivní'}
                          </span>
                        </div>
                        <p className="text-sm text-blue-600 break-all">{feed.feed_url}</p>
                        {feed.last_fetched_at && (
                          <div className="mt-2 text-xs text-gray-500 space-x-3">
                            <span>Naposledy: {new Date(feed.last_fetched_at).toLocaleString('cs-CZ')}</span>
                            <span className={feed.last_fetch_status === 'success' ? 'text-green-600' : 'text-red-600'}>
                              {feed.last_fetch_status === 'success' ? `✓ ${feed.last_fetch_message}` : `✗ ${feed.last_fetch_message}`}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => handleFetchFeed(feed.id)}
                          disabled={fetchingFeedId === feed.id}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition disabled:opacity-50"
                          title="Spustit načtení nyní"
                        >
                          <RefreshCw size={18} className={fetchingFeedId === feed.id ? 'animate-spin' : ''} />
                        </button>
                        <button
                          onClick={() => handleDeleteFeed(feed.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Smazat feed"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
