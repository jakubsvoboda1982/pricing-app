import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Link2, CheckCircle, AlertCircle, RefreshCw, Package,
  ChevronDown, Search, X, Link, Unlink, ChevronRight,
} from 'lucide-react'
import { apiClient } from '@/api/client'

interface BaselinkerConfig {
  api_token_masked: string
  inventory_id: number | null
  is_active: boolean
  last_sync_at: string | null
}

interface Inventory {
  inventory_id: number
  name: string
}

interface MatchedProduct {
  id: string
  name: string
  sku: string
  match_id: string
}

interface BLProduct {
  bl_product_id: string
  name: string
  sku: string
  ean: string
  stock: number
  price: number | null
  matched_product: MatchedProduct | null
}

interface OurProduct {
  id: string
  name: string
  sku: string
  ean: string | null
  product_code: string | null
}

export default function BaselinkerPage() {
  const qc = useQueryClient()

  // Config tab state
  const [token, setToken] = useState('')
  const [selectedInventory, setSelectedInventory] = useState<number | null>(null)
  const [showTokenInput, setShowTokenInput] = useState(false)
  const [syncResult, setSyncResult] = useState<{ synced: number; not_found: number; message: string } | null>(null)

  // Tabs
  const [activeTab, setActiveTab] = useState<'config' | 'products'>('config')

  // Products tab state
  const [blSearch, setBlSearch] = useState('')
  const [matchModal, setMatchModal] = useState<BLProduct | null>(null)
  const [productSearch, setProductSearch] = useState('')

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: config, isLoading: configLoading } = useQuery<BaselinkerConfig | null>({
    queryKey: ['baselinkerConfig'],
    queryFn: () => apiClient.getBaselinkerConfig(),
  })

  const { data: inventoriesData } = useQuery<{ inventories: Inventory[] }>({
    queryKey: ['baselinkerInventories'],
    queryFn: () => apiClient.getBaselinkerInventories(),
    enabled: !!config,
    retry: false,
  })

  const {
    data: blData,
    isLoading: blLoading,
    isError: blError,
    refetch: refetchBL,
    isFetching: blFetching,
  } = useQuery<{ products: BLProduct[]; total: number }>({
    queryKey: ['baselinkerProducts'],
    queryFn: () => apiClient.getBaselinkerProducts(),
    enabled: activeTab === 'products' && !!config?.inventory_id,
    staleTime: 5 * 60 * 1000, // 5 min cache
  })

  const { data: ourProductsRaw } = useQuery<OurProduct[]>({
    queryKey: ['products'],
    queryFn: () => apiClient.getProducts(),
    enabled: !!matchModal,
  })

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: (data: { api_token: string; inventory_id: number | null }) =>
      apiClient.saveBaselinkerConfig(data),
    onSuccess: (data: { inventories?: Inventory[] }) => {
      qc.invalidateQueries({ queryKey: ['baselinkerConfig'] })
      qc.invalidateQueries({ queryKey: ['baselinkerInventories'] })
      setToken('')
      setShowTokenInput(false)
      if (data.inventories?.length === 1 && !config?.inventory_id) {
        setSelectedInventory(data.inventories[0].inventory_id)
      }
    },
  })

  const inventoryMutation = useMutation({
    mutationFn: (inventory_id: number) => apiClient.saveBaselinkerInventory(inventory_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['baselinkerConfig'] })
      setSelectedInventory(null)
    },
  })

  const syncMutation = useMutation({
    mutationFn: () => apiClient.syncBaselinkerStock(),
    onSuccess: (data: { synced: number; not_found: number; message: string }) => {
      setSyncResult(data)
      qc.invalidateQueries({ queryKey: ['dashboardProducts'] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })

  const syncByEanMutation = useMutation({
    mutationFn: () => apiClient.syncBaselinkerStockByEan(),
    onSuccess: (data: { synced: number; not_found: number; message: string }) => {
      setSyncResult(data)
      qc.invalidateQueries({ queryKey: ['dashboardProducts'] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })

  const matchMutation = useMutation({
    mutationFn: (data: {
      bl_product_id: string
      bl_sku: string
      bl_ean: string
      bl_name: string
      product_id: string
    }) => apiClient.saveBaselinkerMatch(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['baselinkerProducts'] })
      setMatchModal(null)
      setProductSearch('')
    },
  })

  const unmatchMutation = useMutation({
    mutationFn: (matchId: string) => apiClient.deleteBaselinkerMatch(matchId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['baselinkerProducts'] })
    },
  })

  // ── Derived data ──────────────────────────────────────────────────────────

  const inventories: Inventory[] = inventoriesData?.inventories ?? []
  const hasConfig = !!config

  const filteredBL = useMemo(() => {
    const list: BLProduct[] = blData?.products ?? []
    if (!blSearch.trim()) return list
    const q = blSearch.toLowerCase()
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.ean.toLowerCase().includes(q)
    )
  }, [blData, blSearch])

  const filteredOurProducts = useMemo(() => {
    const list: OurProduct[] = ourProductsRaw ?? []
    if (!productSearch.trim()) return list.slice(0, 50)
    const q = productSearch.toLowerCase()
    return list
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku ?? '').toLowerCase().includes(q) ||
          (p.ean ?? '').toLowerCase().includes(q) ||
          (p.product_code ?? '').toLowerCase().includes(q)
      )
      .slice(0, 50)
  }, [ourProductsRaw, productSearch])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSaveToken = () => {
    if (!token.trim()) return
    saveMutation.mutate({ api_token: token.trim(), inventory_id: config?.inventory_id ?? null })
  }

  const handleMatch = (blProduct: BLProduct, ourProduct: OurProduct) => {
    matchMutation.mutate({
      bl_product_id: blProduct.bl_product_id,
      bl_sku: blProduct.sku,
      bl_ean: blProduct.ean,
      bl_name: blProduct.name,
      product_id: ourProduct.id,
    })
  }

  const handleUnmatch = (matchId: string) => {
    unmatchMutation.mutate(matchId)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={activeTab === 'products' ? 'space-y-6' : 'max-w-2xl space-y-6'}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Baselinker</h1>
          <p className="text-sm text-gray-500 mt-1">Propojení se skladovostí z Baselinker.com</p>
        </div>
      </div>

      {/* Tabs */}
      {hasConfig && (
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('config')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === 'config'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Konfigurace
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'products'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Package size={14} />
            Produkty Baselinker
            {blData && (
              <span className="bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">
                {blData.total}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ── TAB: KONFIGURACE ─────────────────────────────────────────────── */}
      {activeTab === 'config' && (
        <>
          {/* API Token sekce */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Link2 size={18} className="text-blue-600" />
              <h2 className="text-sm font-semibold text-gray-800">API Token</h2>
              {hasConfig && (
                <span className="ml-auto flex items-center gap-1 text-xs text-green-600 font-medium">
                  <CheckCircle size={13} />
                  Připojeno
                </span>
              )}
            </div>

            {hasConfig && !showTokenInput ? (
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                <span className="font-mono text-sm text-gray-600">{config.api_token_masked}</span>
                <button
                  onClick={() => setShowTokenInput(true)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Změnit token
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600">
                  API Token z Baselinker (Můj účet → API)
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveToken()}
                    placeholder="Vložte API token..."
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleSaveToken}
                    disabled={!token.trim() || saveMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                  >
                    {saveMutation.isPending ? 'Ověřuji...' : 'Uložit'}
                  </button>
                  {showTokenInput && (
                    <button onClick={() => setShowTokenInput(false)} className="text-sm text-gray-400 hover:text-gray-600">
                      Zrušit
                    </button>
                  )}
                </div>
                {saveMutation.isError && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {(saveMutation.error as Error)?.message ?? 'Chyba při ukládání tokenu'}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Výběr katalogu */}
          {hasConfig && inventories.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-gray-800">Katalog (inventář)</h2>
              <p className="text-xs text-gray-500">Vyberte katalog ze kterého se bude načítat skladovost.</p>
              <div className="flex gap-2 items-end">
                <div className="flex-1 relative">
                  <select
                    value={selectedInventory ?? config.inventory_id ?? ''}
                    onChange={(e) => setSelectedInventory(Number(e.target.value) || null)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Vyberte katalog --</option>
                    {inventories.map((inv) => (
                      <option key={inv.inventory_id} value={inv.inventory_id}>
                        {inv.name} (ID: {inv.inventory_id})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-3 text-gray-400 pointer-events-none" />
                </div>
                <button
                  onClick={() => {
                    if (selectedInventory) inventoryMutation.mutate(selectedInventory)
                  }}
                  disabled={!selectedInventory || inventoryMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap"
                >
                  {inventoryMutation.isPending ? 'Ukládám...' : 'Uložit'}
                </button>
              </div>
              {config.inventory_id && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle size={12} />
                  Vybraný katalog: ID {config.inventory_id}
                </p>
              )}
            </div>
          )}

          {/* Synchronizace skladovosti */}
          {hasConfig && config.inventory_id && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-gray-800">Synchronizace skladovosti</h2>
              <p className="text-xs text-gray-500">Vyberte metodu párování produktů:</p>

              <div className="space-y-3">
                <div className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">Párování podle PRODUCTNO (SKU)</p>
                      <p className="text-xs text-gray-500 mt-0.5">Porovnává PRODUCTNO s SKU v Baselinker</p>
                    </div>
                    <button
                      onClick={() => syncMutation.mutate()}
                      disabled={syncMutation.isPending || syncByEanMutation.isPending}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-3 py-1.5 rounded text-sm font-medium transition"
                    >
                      <RefreshCw size={13} className={syncMutation.isPending ? 'animate-spin' : ''} />
                      {syncMutation.isPending ? 'Synchronizuji...' : 'Synchronizovat'}
                    </button>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">Párování podle EAN</p>
                      <p className="text-xs text-gray-500 mt-0.5">Porovnává EAN se Baselinker EAN (přesnější)</p>
                    </div>
                    <button
                      onClick={() => syncByEanMutation.mutate()}
                      disabled={syncByEanMutation.isPending || syncMutation.isPending}
                      className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-3 py-1.5 rounded text-sm font-medium transition"
                    >
                      <RefreshCw size={13} className={syncByEanMutation.isPending ? 'animate-spin' : ''} />
                      {syncByEanMutation.isPending ? 'Synchronizuji...' : 'Synchronizovat'}
                    </button>
                  </div>
                </div>
              </div>

              {config.last_sync_at && (
                <p className="text-xs text-gray-400">
                  Poslední sync: {new Date(config.last_sync_at).toLocaleString('cs-CZ')}
                </p>
              )}

              {syncResult && (
                <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-2 ${
                  syncResult.synced > 0 ? 'bg-green-50 text-green-800' : 'bg-yellow-50 text-yellow-800'
                }`}>
                  {syncResult.synced > 0 ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                  <span>{syncResult.message}</span>
                  {syncResult.not_found > 0 && (
                    <span className="ml-1 text-gray-500">({syncResult.not_found} bez shody)</span>
                  )}
                </div>
              )}

              {syncMutation.isError && (
                <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
                  <AlertCircle size={14} />
                  {(syncMutation.error as Error)?.message ?? 'Chyba při synchronizaci'}
                </div>
              )}
            </div>
          )}

          {/* Nápověda */}
          {!hasConfig && !configLoading && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 text-sm text-blue-800 space-y-2">
              <p className="font-semibold flex items-center gap-2"><Package size={15} /> Jak získat API token?</p>
              <ol className="list-decimal ml-4 space-y-1 text-xs">
                <li>Přihlaste se do Baselinker.com</li>
                <li>Přejděte do <strong>Můj účet → API</strong></li>
                <li>Klikněte na <strong>Přidat token</strong></li>
                <li>Zkopírujte vygenerovaný token a vložte ho výše</li>
              </ol>
            </div>
          )}
        </>
      )}

      {/* ── TAB: PRODUKTY BASELINKER ─────────────────────────────────────── */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                value={blSearch}
                onChange={(e) => setBlSearch(e.target.value)}
                placeholder="Hledat název, SKU, EAN..."
                className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {blSearch && (
                <button onClick={() => setBlSearch('')} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={() => refetchBL()}
              disabled={blFetching}
              className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 transition"
            >
              <RefreshCw size={13} className={blFetching ? 'animate-spin' : ''} />
              Aktualizovat
            </button>
            {blData && (
              <span className="text-xs text-gray-400">
                {filteredBL.length} / {blData.total} produktů
              </span>
            )}
          </div>

          {/* Chybové stavy */}
          {!config?.inventory_id && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 text-sm text-yellow-800 flex items-center gap-2">
              <AlertCircle size={15} />
              Nejprve vyberte katalog v záložce Konfigurace.
            </div>
          )}

          {blError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle size={15} />
              Nepodařilo se načíst produkty z Baselinker. Zkontrolujte API token.
            </div>
          )}

          {blLoading && (
            <div className="bg-white border border-gray-200 rounded-xl p-10 flex items-center justify-center gap-3 text-sm text-gray-500">
              <RefreshCw size={16} className="animate-spin text-blue-500" />
              Načítám produkty z Baselinker...
            </div>
          )}

          {/* Tabulka produktů */}
          {!blLoading && !blError && filteredBL.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[200px]">Název produktu</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">SKU</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">EAN</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">Skladem</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">Cena</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[200px]">Spárovaný produkt</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBL.map((p) => (
                      <tr key={p.bl_product_id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-900 line-clamp-2">{p.name || '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.sku || '—'}</td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.ean || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-medium ${p.stock > 0 ? 'text-green-700' : 'text-red-500'}`}>
                            {p.stock}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {p.price != null ? `${p.price.toLocaleString('cs-CZ')} Kč` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {p.matched_product ? (
                            <div className="flex items-center gap-1.5">
                              <Link size={12} className="text-green-500 shrink-0" />
                              <span className="text-green-800 text-xs font-medium truncate max-w-[160px]" title={p.matched_product.name}>
                                {p.matched_product.name}
                              </span>
                              {p.matched_product.sku && (
                                <span className="text-gray-400 text-xs">({p.matched_product.sku})</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300 text-xs">Nespárováno</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {p.matched_product ? (
                              <>
                                <button
                                  onClick={() => { setMatchModal(p); setProductSearch('') }}
                                  className="text-xs text-blue-600 hover:underline px-2 py-1"
                                >
                                  Změnit
                                </button>
                                <button
                                  onClick={() => handleUnmatch(p.matched_product!.match_id)}
                                  disabled={unmatchMutation.isPending}
                                  className="text-xs text-red-500 hover:underline px-2 py-1 flex items-center gap-0.5"
                                >
                                  <Unlink size={11} />
                                  Odpojit
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => { setMatchModal(p); setProductSearch('') }}
                                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded flex items-center gap-1 transition"
                              >
                                <Link size={11} />
                                Spárovat
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!blLoading && !blError && blData && filteredBL.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-sm text-gray-400">
              {blSearch ? 'Žádné produkty neodpovídají vyhledávání.' : 'Katalog neobsahuje žádné produkty.'}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL: Párování produktu ──────────────────────────────────────── */}
      {matchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Spárovat produkt</h2>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{matchModal.name}</p>
              </div>
              <button onClick={() => setMatchModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {/* BL product info */}
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex gap-4 text-xs text-gray-500">
              {matchModal.sku && <span>SKU: <strong className="text-gray-700 font-mono">{matchModal.sku}</strong></span>}
              {matchModal.ean && <span>EAN: <strong className="text-gray-700 font-mono">{matchModal.ean}</strong></span>}
              <span>Sklad: <strong className={matchModal.stock > 0 ? 'text-green-700' : 'text-red-500'}>{matchModal.stock} ks</strong></span>
            </div>

            {/* Search */}
            <div className="px-6 pt-4 pb-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  autoFocus
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Hledat v sledovaných produktech..."
                  className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Product list */}
            <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-1 min-h-0">
              {filteredOurProducts.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">
                  {productSearch ? 'Žádné shody.' : 'Nejprve přidejte produkty do sledování.'}
                </p>
              )}
              {filteredOurProducts.map((prod) => (
                <button
                  key={prod.id}
                  onClick={() => handleMatch(matchModal, prod)}
                  disabled={matchMutation.isPending}
                  className="w-full text-left flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-blue-50 border border-transparent hover:border-blue-200 transition group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-800">
                      {prod.name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">
                      {prod.product_code || prod.sku || '—'}
                      {prod.ean && ` · EAN: ${prod.ean}`}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-blue-500 shrink-0 ml-2" />
                </button>
              ))}
            </div>

            {matchMutation.isError && (
              <div className="px-6 pb-4 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle size={12} />
                Chyba při ukládání párování.
              </div>
            )}

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setMatchModal(null)}
                className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
              >
                Zrušit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
