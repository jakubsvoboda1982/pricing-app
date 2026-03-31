import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link2, CheckCircle, AlertCircle, RefreshCw, Package, ChevronDown } from 'lucide-react'
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

export default function BaselinkerPage() {
  const qc = useQueryClient()
  const [token, setToken] = useState('')
  const [selectedInventory, setSelectedInventory] = useState<number | null>(null)
  const [showTokenInput, setShowTokenInput] = useState(false)
  const [syncResult, setSyncResult] = useState<{ synced: number; not_found: number; message: string } | null>(null)

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
    mutationFn: (inventory_id: number) =>
      apiClient.saveBaselinkerConfig({ api_token: '_keep_', inventory_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['baselinkerConfig'] }),
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

  const handleSaveToken = () => {
    if (!token.trim()) return
    saveMutation.mutate({ api_token: token.trim(), inventory_id: config?.inventory_id ?? null })
  }

  const inventories: Inventory[] = inventoriesData?.inventories ?? []
  const hasConfig = !!config

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Baselinker</h1>
        <p className="text-sm text-gray-500 mt-1">Propojení se skladovostí z Baselinker.com</p>
      </div>

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
                if (selectedInventory) {
                  inventoryMutation.mutate(selectedInventory)
                }
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
            {/* SKU sync */}
            <div className="border border-gray-200 rounded-lg p-3 space-y-2">
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

            {/* EAN sync */}
            <div className="border border-gray-200 rounded-lg p-3 space-y-2">
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
              Poslední sync:{' '}
              {new Date(config.last_sync_at).toLocaleString('cs-CZ')}
            </p>
          )}

          {syncResult && (
            <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-2 ${
              syncResult.synced > 0 ? 'bg-green-50 text-green-800' : 'bg-yellow-50 text-yellow-800'
            }`}>
              {syncResult.synced > 0 ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              <span>{syncResult.message}</span>
              {syncResult.not_found > 0 && (
                <span className="ml-1 text-gray-500">({syncResult.not_found} produktů bez shody v Baselinker)</span>
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
    </div>
  )
}
