import { useState, useEffect } from 'react'
import { Upload, CheckCircle, AlertCircle, Link, Plus, Trash2, RefreshCw, Globe } from 'lucide-react'
import { apiClient, API_BASE_URL, authFetch } from '@/api/client'

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
  const [result, setResult] = useState<{ success: boolean; message: string; imported?: number; updated?: number; skipped?: number } | null>(null)

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

  useEffect(() => {
    if (activeTab === 'feeds') loadFeeds()
  }, [activeTab])

  const loadFeeds = async () => {
    setFeedsLoading(true)
    try { setFeeds(await apiClient.getFeedSubscriptions()) } catch {}
    finally { setFeedsLoading(false) }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const f = e.dataTransfer.files[0]
    if (!f) return
    const ok = importType === 'heureka' ? f.name.endsWith('.xml') : (f.name.endsWith('.xlsx') || f.name.endsWith('.csv'))
    if (ok) { setFile(f); setResult(null) }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) { setFile(f); setResult(null) }
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
        const response = await authFetch(`${API_BASE_URL}/catalog/import`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` },
          body: formData,
        })
        if (!response.ok) throw new Error('Chyba při importu')
        data = await response.json()
      }
      setResult({ success: true, message: importType === 'heureka' ? `Heureka XML import úspěšný!` : `Import tabulky úspěšný!`, imported: data.imported, updated: data.updated, skipped: data.skipped })
      setFile(null)
    } catch (error) {
      setResult({ success: false, message: error instanceof Error ? error.message : 'Chyba při importu souboru' })
    } finally { setImporting(false) }
  }

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
    } finally { setUrlLoading(false) }
  }

  const handleAddFeed = async () => {
    if (!newFeedUrl.trim() || !newFeedName.trim()) return
    setAddingFeed(true)
    setFeedResult(null)
    try {
      await apiClient.createFeedSubscription({ name: newFeedName, feed_url: newFeedUrl, market: newFeedMarket, merge_existing: newFeedMerge })
      setNewFeedName(''); setNewFeedUrl('')
      setFeedResult({ success: true, message: 'Feed byl přidán' })
      await loadFeeds()
    } catch (error) {
      setFeedResult({ success: false, message: error instanceof Error ? error.message : 'Chyba při přidávání feedu' })
    } finally { setAddingFeed(false) }
  }

  const handleDeleteFeed = async (id: string) => {
    try { await apiClient.deleteFeedSubscription(id); await loadFeeds() } catch {}
  }

  const handleFetchFeed = async (id: string) => {
    setFetchingFeedId(id)
    try {
      const data = await apiClient.triggerFeedFetch(id)
      await loadFeeds()
      setFeedResult({ success: data.status === 'success', message: data.message })
    } catch (error) {
      setFeedResult({ success: false, message: error instanceof Error ? error.message : 'Chyba' })
    } finally { setFetchingFeedId(null) }
  }

  const tabs = [
    { id: 'file',  label: 'Ze souboru',       icon: Upload },
    { id: 'url',   label: 'Z URL adresy',      icon: Link   },
    { id: 'feeds', label: 'Automatické feedy', icon: Globe, badge: feeds.length || null },
  ] as const

  return (
    <div className="space-y-5">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Import produktů</h1>
        <p className="text-sm text-gray-400 mt-0.5">Importuj produkty ze souboru, URL nebo automaticky z XML feedu</p>
      </div>

      {/* ── TAB BAR ────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}>
              <Icon size={14} />
              {tab.label}
              {'badge' in tab && tab.badge ? (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                  {tab.badge}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {/* ===== TAB: Ze souboru ===== */}
      {activeTab === 'file' && (
        <div className="space-y-4">
          {/* Type selection */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Typ souboru</p>
            <div className="flex gap-3">
              {([['heureka', '📦 Heureka XML Feed'], ['spreadsheet', '📊 Tabulka (XLSX/CSV)']] as const).map(([type, label]) => (
                <button key={type} onClick={() => { setImportType(type); setFile(null); setResult(null) }}
                  className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm transition ${
                    importType === type ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Heureka options */}
          {importType === 'heureka' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4">
              <p className="text-xs font-medium text-blue-700 uppercase tracking-wide">Nastavení importu</p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Trh</label>
                <div className="flex gap-2">
                  {(['CZ', 'SK'] as const).map(m => (
                    <button key={m} onClick={() => setMarket(m)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${market === m ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-100'}`}>
                      {m === 'CZ' ? '🇨🇿 Česko' : '🇸🇰 Slovensko'}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={mergeExisting} onChange={e => setMergeExisting(e.target.checked)} className="w-4 h-4 rounded" />
                <span className="text-sm text-blue-900">Sloučit s existujícími produkty (EAN / PRODUCTNO)</span>
              </label>
            </div>
          )}

          {/* Drop zone */}
          <div onDrop={handleDrop} onDragOver={() => setIsDragOver(true)} onDragLeave={() => setIsDragOver(false)}
            className={`border-2 border-dashed rounded-xl p-12 text-center transition ${isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
            <Upload size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-700 mb-1">Přetáhněte soubor sem</p>
            <p className="text-xs text-gray-400 mb-4">nebo</p>
            <label className="inline-block">
              <span className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium cursor-pointer transition">
                Vybrat soubor
              </span>
              <input type="file" accept={importType === 'heureka' ? '.xml' : '.xlsx,.csv'} onChange={handleFileChange} className="hidden" />
            </label>
            <p className="text-xs text-gray-400 mt-3">
              {importType === 'heureka' ? '.xml (Heureka feed)' : '.xlsx, .csv'} — max 20 MB
            </p>
          </div>

          {/* Selected file */}
          {file && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Upload size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <button onClick={() => setFile(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
              </div>
              <button onClick={handleImport} disabled={importing}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition">
                {importing ? 'Importuji...' : 'Začít import'}
              </button>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`border rounded-xl p-4 ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-start gap-3">
                {result.success
                  ? <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
                  : <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                }
                <div>
                  <p className={`text-sm font-medium ${result.success ? 'text-green-900' : 'text-red-900'}`}>{result.message}</p>
                  {result.success && (
                    <div className="mt-1 text-xs text-green-700 space-y-0.5">
                      {result.imported !== undefined && <p>Importováno: <strong>{result.imported}</strong></p>}
                      {!!result.updated && <p>Aktualizováno: <strong>{result.updated}</strong></p>}
                      {!!result.skipped && <p>Přeskočeno: <strong>{result.skipped}</strong></p>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== TAB: Z URL adresy ===== */}
      {activeTab === 'url' && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Typ produktu</p>
            <p className="text-xs text-gray-400 mb-3">Systém automaticky načte název stránky a přidá produkt.</p>
            <div className="flex gap-3">
              {([['own', '🏪 Vlastní produkt', 'border-blue-600 bg-blue-50 text-blue-900', 'Přidá URL do katalogu ke sledování'] ,
                 ['competitor', '🔍 Produkt konkurenta', 'border-orange-500 bg-orange-50 text-orange-900', 'Přidá doménu jako konkurenta']] as const).map(([type, label, active, hint]) => (
                <button key={type} onClick={() => setUrlType(type)}
                  className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition text-left ${urlType === type ? active : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}>
                  {label}
                  <p className="text-xs font-normal mt-0.5 opacity-60">{hint}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Trh</label>
            <div className="flex gap-2">
              {(['CZ', 'SK'] as const).map(m => (
                <button key={m} onClick={() => setUrlMarket(m)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${urlMarket === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  {m === 'CZ' ? '🇨🇿 Česko' : '🇸🇰 Slovensko'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">URL adresa produktu *</label>
            <input type="url" value={urlInput} onChange={e => setUrlInput(e.target.value)}
              placeholder="https://www.example.cz/produkt/nazev-produktu"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Název produktu (volitelné)</label>
            <input type="text" value={urlName} onChange={e => setUrlName(e.target.value)}
              placeholder="Nechte prázdné pro automatické načtení"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {urlResult && (
            <div className={`border rounded-xl p-3 ${urlResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2">
                {urlResult.success
                  ? <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
                  : <AlertCircle size={16} className="text-red-600 flex-shrink-0" />}
                <p className={`text-sm font-medium ${urlResult.success ? 'text-green-900' : 'text-red-900'}`}>{urlResult.message}</p>
              </div>
            </div>
          )}

          <button onClick={handleUrlImport} disabled={urlLoading || !urlInput.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition">
            {urlLoading ? 'Načítám...' : urlType === 'own' ? 'Přidat do katalogu' : 'Přidat ke sledování'}
          </button>
        </div>
      )}

      {/* ===== TAB: Automatické feedy ===== */}
      {activeTab === 'feeds' && (
        <div className="space-y-4">
          {/* Add feed */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-700 uppercase tracking-wide">Přidat XML feed</p>
              <p className="text-xs text-gray-400 mt-0.5">Feedy se načítají každý den ve 02:00 UTC. Lze spustit ručně.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Název feedy *</label>
                <input type="text" value={newFeedName} onChange={e => setNewFeedName(e.target.value)}
                  placeholder="Nuties CZ Heureka feed"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Trh</label>
                <div className="flex gap-2">
                  {(['CZ', 'SK'] as const).map(m => (
                    <button key={m} onClick={() => setNewFeedMarket(m)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${newFeedMarket === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                      {m === 'CZ' ? '🇨🇿 CZ' : '🇸🇰 SK'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">URL XML feedy *</label>
              <input type="url" value={newFeedUrl} onChange={e => setNewFeedUrl(e.target.value)}
                placeholder="https://www.nuties.cz/heureka-cz.xml"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={newFeedMerge} onChange={e => setNewFeedMerge(e.target.checked)} className="w-4 h-4 rounded" />
              <span className="text-sm text-gray-700">Sloučit s existujícími produkty (aktualizovat duplicity)</span>
            </label>

            {feedResult && (
              <div className={`border rounded-xl p-3 ${feedResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-2">
                  {feedResult.success ? <CheckCircle size={16} className="text-green-600" /> : <AlertCircle size={16} className="text-red-600" />}
                  <p className={`text-sm font-medium ${feedResult.success ? 'text-green-900' : 'text-red-900'}`}>{feedResult.message}</p>
                </div>
              </div>
            )}

            <button onClick={handleAddFeed} disabled={addingFeed || !newFeedUrl.trim() || !newFeedName.trim()}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition">
              <Plus size={15} />
              {addingFeed ? 'Přidávám...' : 'Přidat feed'}
            </button>
          </div>

          {/* Feed list */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Aktivní feedy ({feeds.length})</p>
              <button onClick={loadFeeds} className="p-1 text-gray-400 hover:text-gray-600 rounded" title="Obnovit">
                <RefreshCw size={14} className={feedsLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            {feedsLoading ? (
              <div className="p-6 text-center text-sm text-gray-400">Načítám feedy...</div>
            ) : feeds.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">Žádné feedy. Přidejte první výše.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {feeds.map(feed => (
                  <div key={feed.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-medium text-gray-900">{feed.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${feed.market === 'CZ' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                            {feed.market === 'CZ' ? '🇨🇿 CZ' : '🇸🇰 SK'}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${feed.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {feed.is_active ? 'Aktivní' : 'Neaktivní'}
                          </span>
                        </div>
                        <p className="text-xs text-blue-500 break-all">{feed.feed_url}</p>
                        {feed.last_fetched_at && (
                          <p className="text-xs text-gray-400 mt-1">
                            Naposledy: {new Date(feed.last_fetched_at).toLocaleString('cs-CZ')}
                            {' · '}
                            <span className={feed.last_fetch_status === 'success' ? 'text-green-600' : 'text-red-600'}>
                              {feed.last_fetch_status === 'success' ? '✓' : '✗'} {feed.last_fetch_message}
                            </span>
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => handleFetchFeed(feed.id)} disabled={fetchingFeedId === feed.id}
                          className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition disabled:opacity-50" title="Spustit nyní">
                          <RefreshCw size={14} className={fetchingFeedId === feed.id ? 'animate-spin' : ''} />
                        </button>
                        <button onClick={() => handleDeleteFeed(feed.id)}
                          className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition" title="Smazat">
                          <Trash2 size={14} />
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
