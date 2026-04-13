import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, ExternalLink, Plus, Trash2, Edit2, Save, X, Package,
  TrendingUp, Link2, ShoppingCart, Factory, RefreshCw, Clock,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle, BarChart2,
  Scale, Play, XCircle,
} from 'lucide-react'
import { API_BASE_URL, apiClient, authFetch } from '@/api/client'

// ── Multi-market helpers ──────────────────────────────────────────────────
const EXCHANGE: Record<string, number> = {
  CZK: 1,
  EUR: 24.5,   // 1 EUR = 24.5 CZK
  HUF: 0.0655, // 1 HUF ≈ 0.0655 CZK
}
const MARKET_CURRENCY: Record<string, string> = { CZ: 'CZK', SK: 'EUR', HU: 'HUF' }
const MARKET_FLAG: Record<string, string>     = { CZ: '🇨🇿', SK: '🇸🇰', HU: '🇭🇺' }

/** Odvoď správnou měnu z TLD domény URL — client-side fallback */
function currencyFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname
    if (host.endsWith('.sk')) return 'EUR'
    if (host.endsWith('.hu')) return 'HUF'
  } catch { /* ignore */ }
  return 'CZK'
}

/** Convert amount in CZK → target market currency */
function toMarket(czk: number, market: string): number {
  const rate = EXCHANGE[MARKET_CURRENCY[market] ?? 'CZK'] ?? 1
  return czk / rate
}

/** Format price in market currency */
function fmtMkt(czk: number | null | undefined, market: string, decimals = 2): string {
  if (czk == null) return '—'
  const val = toMarket(czk, market)
  const cur = MARKET_CURRENCY[market] ?? 'CZK'
  const loc = market === 'SK' ? 'sk-SK' : market === 'HU' ? 'hu-HU' : 'cs-CZ'
  return `${val.toLocaleString(loc, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${cur}`
}

// ── Interfaces ─────────────────────────────────────────────────────────────

interface CompetitorUrl { url: string; name: string; market: string }

interface Product {
  id: string; name: string; sku: string; product_code?: string | null
  category?: string; ean?: string; thumbnail_url?: string; url_reference?: string
  competitor_urls?: CompetitorUrl[]; current_price?: number | null
  old_price?: number | null; market?: string
  purchase_price_without_vat?: number | null; purchase_vat_rate?: number | null
  purchase_price_with_vat?: number | null; manufacturing_cost?: number | null
  manufacturing_cost_with_vat?: number | null; min_price?: number | null
  margin?: number | null; margin_by_market?: Record<string, number> | null; hero_score?: number | null
  lowest_competitor_price?: number | null; stock_quantity?: number | null
  manufacturer?: string | null
  catalog_price_vat?: number | null
  catalog_quantity_in_stock?: number | null
  market_names?: Record<string, string>
  market_attributes?: Record<string, { description?: string; ingredients?: string }> | null
  own_market_urls?: Record<string, string> | null
  own_market_variant_labels?: Record<string, string> | null
  prices_by_market?: Record<string, { price: number | null; old_price?: number | null; currency: string }> | null
  stock_divisor?: number | null
  created_at: string
}

interface PriceRecord {
  id: string; market: string; currency: string
  current_price: number; old_price?: number | null; changed_at: string
}

interface CompetitorPriceRecord {
  id: string; competitor_url: string; price: number | null
  currency: string; market: string; last_fetched_at: string | null
  fetch_status: string | null; fetch_error: string | null
  variant_label?: string | null
}

interface PriceHistoryEntry { price: number; recorded_at: string }

interface ProductMatch {
  id: string
  competitor_id: string
  competitor_name: string | null
  candidate_id: string | null
  candidate_name: string | null
  candidate_url: string | null
  candidate_price: number | null
  candidate_weight_g: number | null
  candidate_available: boolean | null
  match_status: string
  match_confidence_score: number | null
  match_grade: string | null
  scoring_breakdown: Record<string, unknown> | null
  approved_at: string | null
  last_price_check_at: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────

function authHeaders() {
  return { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
}
function getDomain(url: string) {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}
function fmt(val: number | null | undefined, decimals = 2): string {
  if (val == null) return '—'
  return val.toLocaleString('cs-CZ', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

// ── Sub-components ─────────────────────────────────────────────────────────

function MiniGauge({ score }: { score: number }) {
  const pct = Math.min(Math.max(score, 0), 100)
  const color = pct >= 80 ? '#16a34a' : pct >= 60 ? '#ca8a04' : pct >= 40 ? '#ea580c' : '#dc2626'
  const label = pct >= 80 ? 'Výborné' : pct >= 60 ? 'Dobré' : pct >= 40 ? 'Průměrné' : 'Slabé'
  const r = 28; const cx = 36; const cy = 36
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const arcX = (a: number) => cx + r * Math.cos(toRad(a))
  const arcY = (a: number) => cy + r * Math.sin(toRad(a))
  const trackPath = `M ${arcX(-180)} ${arcY(-180)} A ${r} ${r} 0 0 1 ${arcX(0)} ${arcY(0)}`
  const endAngle = -180 + (pct / 100) * 180
  const fillPath = pct > 0 ? `M ${arcX(-180)} ${arcY(-180)} A ${r} ${r} 0 0 1 ${arcX(endAngle)} ${arcY(endAngle)}` : ''
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 72 44" className="w-20 h-12">
        <path d={trackPath} fill="none" stroke="#e5e7eb" strokeWidth="7" strokeLinecap="round" />
        {fillPath && <path d={fillPath} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" />}
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="13" fontWeight="700" fill={color}>{pct}</text>
        <text x={cx} y={cy + 9} textAnchor="middle" fontSize="7" fill="#9ca3af">/ 100</text>
      </svg>
      <span className="text-xs font-semibold" style={{ color }}>{label}</span>
    </div>
  )
}

function ScoreRow({ label, pts, max }: { label: string; pts: number; max: number }) {
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500 flex-1 min-w-0 truncate">{label}</span>
      <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
        <div className="h-full rounded-full" style={{
          width: `${(pts / max) * 100}%`,
          backgroundColor: pts >= max ? '#16a34a' : pts > 0 ? '#ca8a04' : '#e5e7eb'
        }} />
      </div>
      <span className={`text-xs font-semibold w-9 text-right flex-shrink-0 ${pts >= max ? 'text-green-600' : pts > 0 ? 'text-yellow-600' : 'text-gray-300'}`}>
        {pts}/{max}
      </span>
    </div>
  )
}

// ── Confirmed Matches Section ──────────────────────────────────────────────

function GradeBadge({ grade }: { grade: string | null }) {
  if (!grade) return null
  const styles: Record<string, string> = {
    A: 'bg-green-100 text-green-800 border-green-200',
    B: 'bg-blue-100 text-blue-800 border-blue-200',
    C: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    X: 'bg-red-100 text-red-800 border-red-200',
  }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold border ${styles[grade] ?? styles.X}`}>
      {grade}
    </span>
  )
}

interface CompetitorOption { id: string; name: string; url: string }

function ConfirmedMatchesSection({ productId }: { productId: string }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showPipeline, setShowPipeline] = useState(false)
  const [pipelineCompetitorId, setPipelineCompetitorId] = useState('')
  const [pipelineListingUrl, setPipelineListingUrl] = useState('')
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [pipelineMsg, setPipelineMsg] = useState<string | null>(null)
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null)

  // Načti seznam konkurentů pro dropdown
  const { data: competitors = [] } = useQuery<CompetitorOption[]>({
    queryKey: ['competitors-list'],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/competitors`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
      })
      if (!res.ok) return []
      const data = await res.json()
      return (data as any[]).map((c: any) => ({ id: c.id, name: c.name, url: c.url }))
    },
    staleTime: 60000,
  })

  // Fetch active (approved) matches for this product
  const { data: activeMatches = [], isLoading, refetch } = useQuery<ProductMatch[]>({
    queryKey: ['product-matches-active', productId],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/matching/product/${productId}/matches?status=active`, { headers: authHeaders() })
      if (!res.ok) return []
      return res.json()
    },
    enabled: !!productId,
    refetchInterval: 30000,
  })

  // Fetch proposed (pending review) count
  const { data: proposedMatches = [] } = useQuery<ProductMatch[]>({
    queryKey: ['product-matches-proposed', productId],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/matching/product/${productId}/matches?status=proposed`, { headers: authHeaders() })
      if (!res.ok) return []
      return res.json()
    },
    enabled: !!productId,
    refetchInterval: 30000,
  })

  const handleRunPipeline = async () => {
    if (!pipelineCompetitorId) return
    setPipelineRunning(true)
    setPipelineMsg(null)
    try {
      const urls = pipelineListingUrl.trim() ? [pipelineListingUrl.trim()] : undefined
      const result = await apiClient.runMatchingPipeline(productId, pipelineCompetitorId, urls)
      if (result?.note) {
        setPipelineMsg(`✓ Pipeline spuštěn. ⚠ ${result.note}`)
      } else {
        setPipelineMsg('✓ Pipeline spuštěn na pozadí. Výsledky se objeví za chvíli v záložce Párovací centrum.')
      }
      setTimeout(() => {
        refetch()
        qc.invalidateQueries({ queryKey: ['product-matches-proposed', productId] })
      }, 5000)
    } catch (e: any) {
      const raw: string = e?.message ?? 'neznámá chyba'
      setPipelineMsg(`Chyba: ${raw}`)
    } finally {
      setPipelineRunning(false)
    }
  }

  const handleDeactivate = async (matchId: string) => {
    await apiClient.deactivateMatch(matchId)
    refetch()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale size={16} className="text-blue-600" />
          <h2 className="text-sm font-semibold text-gray-800">Shody s konkurencí</h2>
          {activeMatches.length > 0 && (
            <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
              {activeMatches.length} aktivních
            </span>
          )}
          {proposedMatches.length > 0 && (
            <button
              onClick={() => navigate('/matching')}
              className="bg-yellow-100 text-yellow-700 text-xs font-semibold px-2 py-0.5 rounded-full hover:bg-yellow-200 transition">
              {proposedMatches.length} čeká na review →
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/matching')}
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 transition">
            <Scale size={12} /> Párovací centrum
          </button>
          <button
            onClick={() => setShowPipeline(v => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg transition">
            <Play size={12} /> Spustit pipeline
          </button>
        </div>
      </div>

      {/* Pipeline launcher */}
      {showPipeline && (
        <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 space-y-3">
          <p className="text-xs font-semibold text-blue-800">Spustit matching pipeline</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-gray-600 font-medium block mb-1">Konkurent *</label>
              <select
                value={pipelineCompetitorId}
                onChange={e => {
                  setPipelineCompetitorId(e.target.value)
                  // Při výběru konkurenta předvyplň jeho URL jako listing URL
                  const selected = competitors.find(c => c.id === e.target.value)
                  if (selected && !pipelineListingUrl) {
                    setPipelineListingUrl(selected.url)
                  }
                }}
                className="w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white">
                <option value="">— Vyber konkurenta —</option>
                {competitors.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 font-medium block mb-1">
                Listing / kategorie URL
                <span className="ml-1 text-gray-400 font-normal">(předvyplněno z homepage)</span>
              </label>
              <input
                value={pipelineListingUrl}
                onChange={e => setPipelineListingUrl(e.target.value)}
                placeholder="https://konkurent.cz/orechy"
                className="w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleRunPipeline}
                disabled={pipelineRunning || !pipelineCompetitorId}
                className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition">
                {pipelineRunning
                  ? <><RefreshCw size={12} className="animate-spin" /> Spouštím…</>
                  : <><Play size={12} /> Spustit</>}
              </button>
            </div>
          </div>
          {pipelineMsg && (
            <div className={`text-xs rounded-lg px-3 py-2 ${
              pipelineMsg.startsWith('✓')
                ? 'bg-green-50 text-green-700 border border-green-200'
                : pipelineMsg.startsWith('⚠')
                ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {pipelineMsg}
            </div>
          )}
        </div>
      )}

      {/* Active matches list */}
      <div className="divide-y divide-gray-100">
        {isLoading ? (
          <div className="px-5 py-6 text-center text-gray-400 text-sm">
            <RefreshCw size={16} className="inline animate-spin mr-1" /> Načítám…
          </div>
        ) : activeMatches.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <Scale size={28} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Žádné schválené shody</p>
            <p className="text-xs text-gray-300 mt-1">
              Spusťte pipeline nebo schvalte návrhy v Párovacím centru
            </p>
          </div>
        ) : (
          activeMatches.map(match => {
            const isExpanded = expandedMatchId === match.id
            const bd = match.scoring_breakdown as any
            return (
              <div key={match.id} className="px-5 py-3">
                <div className="flex items-center gap-3">
                  {/* Score pill */}
                  {match.match_confidence_score != null && (
                    <div className="flex-shrink-0 flex flex-col items-center w-12">
                      <span className="text-base font-bold text-gray-800">
                        {Math.round(match.match_confidence_score)}
                      </span>
                      <span className="text-xs text-gray-400">/ 100</span>
                    </div>
                  )}

                  {/* Candidate info */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800 truncate max-w-xs">
                        {match.candidate_name ?? '—'}
                      </span>
                      <GradeBadge grade={match.match_grade} />
                      {match.match_status === 'manually_approved' && (
                        <span className="text-xs text-green-700 bg-green-50 px-1.5 rounded border border-green-200">✓ Ručně</span>
                      )}
                      {match.match_status === 'auto_approved' && (
                        <span className="text-xs text-blue-700 bg-blue-50 px-1.5 rounded border border-blue-200">⚡ Auto</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
                      <span className="font-medium text-gray-600">{match.competitor_name ?? '—'}</span>
                      {match.candidate_price != null && (
                        <span className="font-semibold text-gray-800">
                          {match.candidate_price.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} CZK
                        </span>
                      )}
                      {match.candidate_weight_g != null && (
                        <span>
                          {match.candidate_weight_g >= 1000
                            ? `${(match.candidate_weight_g / 1000).toFixed(match.candidate_weight_g % 1000 === 0 ? 0 : 1)} kg`
                            : `${match.candidate_weight_g} g`}
                        </span>
                      )}
                      {match.candidate_available === true && (
                        <span className="text-green-700 bg-green-50 px-1.5 py-0.5 rounded">Skladem</span>
                      )}
                      {match.candidate_available === false && (
                        <span className="text-red-700 bg-red-50 px-1.5 py-0.5 rounded">Vyprodáno</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {match.candidate_url && (
                      <a href={match.candidate_url} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                        <ExternalLink size={14} />
                      </a>
                    )}
                    <button
                      onClick={() => setExpandedMatchId(isExpanded ? null : match.id)}
                      className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition">
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button
                      onClick={() => handleDeactivate(match.id)}
                      title="Deaktivovat match"
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                      <XCircle size={14} />
                    </button>
                  </div>
                </div>

                {/* Inline scoring breakdown */}
                {isExpanded && bd && (
                  <div className="mt-3 ml-15 bg-gray-50 rounded-lg p-3 space-y-1.5 border border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Scoring breakdown</p>
                    {[
                      { label: 'Zpracování', pts: bd.processing_match, max: 25 },
                      { label: 'Chuť / charakter', pts: bd.flavor_match, max: 20 },
                      { label: 'Gramáž', pts: bd.weight_match, max: 20 },
                      { label: 'Podobnost názvu', pts: bd.title_similarity, max: 10 },
                      { label: 'Brand', pts: bd.brand_relevance, max: 5 },
                      { label: 'Balení', pts: bd.packaging_similarity, max: 5 },
                      { label: 'Strukturovaná data', pts: bd.structured_data_bonus, max: 5 },
                      { label: 'Cena za kg', pts: bd.unit_price_bonus, max: 5 },
                    ].map(row => (
                      <ScoreRow key={row.label} label={row.label} pts={row.pts ?? 0} max={row.max} />
                    ))}
                    {(bd.penalties ?? 0) < 0 && (
                      <ScoreRow label="Penalizace" pts={bd.penalties} max={0} />
                    )}
                    {bd.reasons && bd.reasons.length > 0 && (
                      <div className="pt-2 border-t border-gray-200">
                        <p className="text-xs text-gray-500 font-medium mb-1">Důvody:</p>
                        <ul className="space-y-0.5">
                          {(bd.reasons as string[]).map((r: string, i: number) => (
                            <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                              <span className="text-gray-300 flex-shrink-0">·</span> {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [showPriceForm, setShowPriceForm] = useState(false)
  const [priceForm, setPriceForm] = useState({ current_price: '', old_price: '', market: 'CZ' })
  const [showPricingForm, setShowPricingForm] = useState<'purchase' | 'manufacturing' | null>(null)
  const [pricingForm, setPricingForm] = useState({ purchase_price_without_vat: '', purchase_vat_rate: '', manufacturing_cost: '' })
  const [viewMarket, setViewMarket] = useState<string | null>(null) // null = auto (product.market)
  const [showAddUrl, setShowAddUrl] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [newUrlMarket, setNewUrlMarket] = useState<string>('CZ')
  const [addingUrl, setAddingUrl] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [urlPreview, setUrlPreview] = useState<{
    ok: boolean; error: string | null; detected_name: string | null
    detected_price: number | null; detected_currency: string
    detected_description: string | null; detected_ingredients: string | null
    variants: Array<{ label: string; url: string | null; price: number | null }>
  } | null>(null)
  const [selectedVariant, setSelectedVariant] = useState<{ label: string; url: string | null; price: number | null } | null>(null)
  const [editingUrlItem, setEditingUrlItem] = useState<string | null>(null)  // původní URL která se edituje
  const [editingUrlInput, setEditingUrlInput] = useState('')
  const [savingUrl, setSavingUrl] = useState(false)
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)
  const [manualPriceInput, setManualPriceInput] = useState('')
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)
  const [historyData, setHistoryData] = useState<Record<string, PriceHistoryEntry[]>>({})
  const [stockDivisor, setStockDivisorState] = useState(1)
  const [editingDivisor, setEditingDivisor] = useState(false)
  const [divisorInput, setDivisorInput] = useState('1')
  const [savingDivisor, setSavingDivisor] = useState(false)
  const [ownUrlEditing, setOwnUrlEditing] = useState<Record<string, string>>({})
  const [ownUrlSaving, setOwnUrlSaving] = useState<Record<string, boolean>>({})
  const [ownUrlFetchStatus, setOwnUrlFetchStatus] = useState<Record<string, 'idle' | 'fetching' | 'done' | 'error'>>({})
  const [ownUrlVariants, setOwnUrlVariants] = useState<Record<string, Array<{ label: string; url: string | null; price: number | null }>>>({})
  const [ownUrlSelectedVariant, setOwnUrlSelectedVariant] = useState<Record<string, string>>({})
  // Variant picker for existing competitor price records
  const [variantPickerOpenId, setVariantPickerOpenId] = useState<string | null>(null)
  const [variantPickerLoading, setVariantPickerLoading] = useState<Record<string, boolean>>({})
  const [variantPickerData, setVariantPickerData] = useState<Record<string, Array<{ label: string; url: string | null; price: number | null }>>>({})
  const [variantPickerSaving, setVariantPickerSaving] = useState<Record<string, boolean>>({})

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/products/${id}`, { headers: authHeaders() })
      if (!res.ok) throw new Error('Chyba')
      return await res.json() as Product
    },
  })

  // Synchronizuj stockDivisor ze serveru při načtení produktu
  useEffect(() => {
    if (product?.stock_divisor != null && product.stock_divisor >= 1) {
      setStockDivisorState(product.stock_divisor)
      setDivisorInput(String(product.stock_divisor))
    }
  }, [product?.stock_divisor])

  const saveStockDivisor = async (n: number) => {
    if (!id) return
    setSavingDivisor(true)
    try {
      // Dedikovaný endpoint — žádná ambiguita s ostatními poli
      const res = await authFetch(
        `${API_BASE_URL}/products/${id}/stock-divisor?divisor=${n}`,
        { method: 'PATCH', headers: authHeaders() }
      )
      if (!res.ok) {
        alert(`Chyba při ukládání koeficientu: ${res.status}`)
        return
      }
      // Aktualizuj lokální stav + cache přímo (bez refetche, který by mohl vrátit starou hodnotu)
      setStockDivisorState(n)
      setDivisorInput(String(n))
      queryClient.setQueryData(['product', id], (old: any) =>
        old ? { ...old, stock_divisor: n } : old
      )
      queryClient.invalidateQueries({ queryKey: ['products'] })
    } finally {
      setSavingDivisor(false)
    }
  }

  const { data: prices = [] } = useQuery({
    queryKey: ['product-prices', id],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/products/${id}/prices`, { headers: authHeaders() })
      if (!res.ok) return []
      return await res.json() as PriceRecord[]
    },
  })

  const { data: competitorPrices = [], refetch: refetchCompetitorPrices } = useQuery({
    queryKey: ['competitor-prices', id],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/competitor-prices/${id}`, { headers: authHeaders() })
      if (!res.ok) return []
      return await res.json() as CompetitorPriceRecord[]
    },
    enabled: !!id,
  })

  // Doporučená cena (ze Simulátoru nebo Doporučení cen)
  interface RecommendationRecord {
    id: string; product_id: string; recommended_price_with_vat: number
    current_price_with_vat: number | null; margin_change_percent: number | null
    expected_revenue_impact_percent: number | null; status: string
    reasoning: { type?: string; source?: string; text?: string; scenario_label?: string } | null
    created_at: string
  }
  const { data: productRecs = [], refetch: refetchRecs } = useQuery<RecommendationRecord[]>({
    queryKey: ['product-recommendations', id],
    queryFn: async () => {
      try {
        const res = await authFetch(`${API_BASE_URL}/recommendations`, { headers: authHeaders() })
        if (!res.ok) return []
        const all = await res.json() as RecommendationRecord[]
        return all.filter(r => r.product_id === id && (r.status === 'pending' || r.status === 'approved'))
      } catch { return [] }
    },
    enabled: !!id,
  })
  const latestRec = productRecs.length > 0
    ? [...productRecs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    : null

  // ── Mutations ────────────────────────────────────────────────────────────

  const setPriceMutation = useMutation({
    mutationFn: async (data: { current_price: number; old_price?: number; market: string }) => {
      const res = await authFetch(`${API_BASE_URL}/products/${id}/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Chyba při ukládání ceny')
      return await res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', id] })
      queryClient.invalidateQueries({ queryKey: ['product-prices', id] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setShowPriceForm(false)
      setPriceForm({ current_price: '', old_price: '', market: 'CZ' })
    },
  })

  const setPricingMutation = useMutation({
    mutationFn: async (data: {
      purchase_price_without_vat?: number; purchase_vat_rate?: number
      manufacturing_cost?: number; min_price?: number
      clear_purchase_price?: boolean; clear_manufacturing_cost?: boolean
    }) => {
      const res = await authFetch(`${API_BASE_URL}/products/${id}/pricing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Chyba při ukládání')
      return await res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', id] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setShowPricingForm(null)
    },
  })

  const removeUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await authFetch(`${API_BASE_URL}/products/${id}/competitor-urls?url=${encodeURIComponent(url)}`, {
        method: 'DELETE', headers: authHeaders(),
      })
      if (!res.ok) throw new Error('Chyba')
      return await res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['product', id] }),
  })

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handlePreviewUrl = async () => {
    if (!newUrl.trim()) return
    setLoadingPreview(true)
    setUrlPreview(null)
    setSelectedVariant(null)
    try {
      const res = await authFetch(`${API_BASE_URL}/competitor-prices/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ url: newUrl.trim() }),
      })
      if (!res.ok) throw new Error('Chyba serveru')
      const data = await res.json()
      setUrlPreview(data)
    } catch {
      setUrlPreview({ ok: false, error: 'Nepodařilo se načíst stránku.', detected_name: null, detected_price: null, detected_currency: 'CZK', detected_description: null, detected_ingredients: null, variants: [] })
    } finally { setLoadingPreview(false) }
  }

  const handleConfirmUrl = async () => {
    const finalUrl = selectedVariant?.url || newUrl.trim()
    if (!finalUrl) return
    setAddingUrl(true)
    try {
      // 1. Add competitor URL to product (for product.competitor_urls list)
      const res1 = await authFetch(`${API_BASE_URL}/products/${id}/competitor-urls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ url: finalUrl, market: newUrlMarket }),
      })
      if (!res1.ok && res1.status !== 400) throw new Error('Chyba')
      // 2. Add tracking record with variant_label
      await authFetch(`${API_BASE_URL}/competitor-prices/${id}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ url: finalUrl, variant_label: selectedVariant?.label ?? null }),
      })
      queryClient.invalidateQueries({ queryKey: ['product', id] })
      queryClient.invalidateQueries({ queryKey: ['competitor-prices', id] })
      setNewUrl(''); setShowAddUrl(false); setUrlPreview(null); setSelectedVariant(null)
      setTimeout(() => refetchCompetitorPrices(), 2000)
      // NOTE: fetch-url-data is intentionally NOT called here — this is a competitor URL,
      // not the product's own URL. Calling fetch-url-data would overwrite the product's
      // own price with the competitor's price.

    } catch { /* ignore */ } finally { setAddingUrl(false) }
  }

  // Keep for backward compat (edit flow still uses simple add)
  const handleAddUrl = handleConfirmUrl

  const handleSetPrice = () => {
    const cp = parseFloat(priceForm.current_price.replace(',', '.'))
    if (isNaN(cp)) return
    const op = priceForm.old_price ? parseFloat(priceForm.old_price.replace(',', '.')) : undefined
    setPriceMutation.mutate({ current_price: cp, old_price: op, market: priceForm.market })
  }

  const handleSetPricing = () => {
    const pvr = pricingForm.purchase_vat_rate ? parseFloat(pricingForm.purchase_vat_rate.replace(',', '.')) : purchaseVatRate
    if (showPricingForm === 'purchase') {
      const cost = parseFloat(pricingForm.purchase_price_without_vat.replace(',', '.'))
      if (isNaN(cost) || cost <= 0) return
      setPricingMutation.mutate({ purchase_price_without_vat: cost, purchase_vat_rate: pvr, min_price: cost * (1 + pvr / 100) })
    } else if (showPricingForm === 'manufacturing') {
      const cost = parseFloat(pricingForm.manufacturing_cost.replace(',', '.'))
      if (isNaN(cost) || cost <= 0) return
      setPricingMutation.mutate({ manufacturing_cost: cost, purchase_vat_rate: pvr, min_price: cost * (1 + pvr / 100) })
    }
  }

  const _doSaveOwnUrl = async (market: string, url: string, variantLabel: string | null) => {
    setOwnUrlSaving(s => ({ ...s, [market]: true }))
    try {
      await authFetch(`${API_BASE_URL}/products/${id}/own-market-url`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ market, url, variant_label: variantLabel }),
      })
      queryClient.invalidateQueries({ queryKey: ['product', id] })
      setOwnUrlVariants(s => { const n = { ...s }; delete n[market]; return n })

      if (url) {
        setOwnUrlFetchStatus(s => ({ ...s, [market]: 'fetching' }))
        try {
          const res = await authFetch(`${API_BASE_URL}/products/${id}/fetch-url-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ url, market }),
          })
          setOwnUrlFetchStatus(s => ({ ...s, [market]: res.ok ? 'done' : 'error' }))
          if (res.ok) {
            queryClient.invalidateQueries({ queryKey: ['product', id] })
            queryClient.invalidateQueries({ queryKey: ['product-prices', id] })
          }
        } catch {
          setOwnUrlFetchStatus(s => ({ ...s, [market]: 'error' }))
        }
      }
    } catch { /* ignore */ } finally {
      setOwnUrlSaving(s => ({ ...s, [market]: false }))
    }
  }

  const handleSaveOwnUrl = async (market: string) => {
    const url = (ownUrlEditing[market] ?? '').trim()
    setOwnUrlSaving(s => ({ ...s, [market]: true }))
    try {
      // 1. Uložit URL ihned (bez čekání na variantu)
      await authFetch(`${API_BASE_URL}/products/${id}/own-market-url`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ market, url, variant_label: null }),
      })
      queryClient.invalidateQueries({ queryKey: ['product', id] })
      setOwnUrlEditing(s => { const n = { ...s }; delete n[market]; return n })

      // 2. Paralelně: detekuj varianty (bez blokování UI)
      if (url) {
        setOwnUrlFetchStatus(s => ({ ...s, [market]: 'fetching' }))
        // Preview pro detekci variant + fetch dat
        const [previewRes, fetchRes] = await Promise.all([
          authFetch(`${API_BASE_URL}/competitor-prices/preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ url }),
          }),
          authFetch(`${API_BASE_URL}/products/${id}/fetch-url-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ url, market }),
          }),
        ])
        if (previewRes.ok) {
          const previewData = await previewRes.json()
          // Always set (even empty array) so UI knows detection ran
          setOwnUrlVariants(s => ({ ...s, [market]: previewData.variants || [] }))
        }
        setOwnUrlFetchStatus(s => ({ ...s, [market]: fetchRes.ok ? 'done' : 'error' }))
        queryClient.invalidateQueries({ queryKey: ['product', id] })
        queryClient.invalidateQueries({ queryKey: ['product-prices', id] })
      }
    } catch { /* ignore */ } finally {
      setOwnUrlSaving(s => ({ ...s, [market]: false }))
    }
  }

  // Detect variants from web for own market URL (on-demand button)
  const handleDetectOwnVariants = async (market: string, url: string) => {
    setOwnUrlFetchStatus(s => ({ ...s, [market]: 'fetching' }))
    try {
      const res = await authFetch(`${API_BASE_URL}/competitor-prices/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ url }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.variants?.length > 0) {
          setOwnUrlVariants(s => ({ ...s, [market]: data.variants }))
        } else {
          setOwnUrlVariants(s => ({ ...s, [market]: [] }))
        }
      }
      setOwnUrlFetchStatus(s => ({ ...s, [market]: 'done' }))
    } catch {
      setOwnUrlFetchStatus(s => ({ ...s, [market]: 'error' }))
    }
  }

  const handleShowVariantPicker = async (compPriceId: string, url: string) => {
    if (variantPickerOpenId === compPriceId) {
      setVariantPickerOpenId(null)
      return
    }
    setVariantPickerOpenId(compPriceId)
    // Load variants if not yet cached
    if (!variantPickerData[compPriceId]) {
      setVariantPickerLoading(s => ({ ...s, [compPriceId]: true }))
      try {
        const res = await authFetch(`${API_BASE_URL}/competitor-prices/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ url }),
        })
        if (res.ok) {
          const data = await res.json()
          setVariantPickerData(s => ({ ...s, [compPriceId]: data.variants || [] }))
        }
      } catch { /* ignore */ } finally {
        setVariantPickerLoading(s => ({ ...s, [compPriceId]: false }))
      }
    }
  }

  const handleSaveVariantLabel = async (compPriceId: string, variantLabel: string | null) => {
    setVariantPickerSaving(s => ({ ...s, [compPriceId]: true }))
    try {
      await authFetch(`${API_BASE_URL}/competitor-prices/by-url/${compPriceId}/variant-label`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ variant_label: variantLabel }),
      })
      setVariantPickerOpenId(null)
      refetchCompetitorPrices()
      queryClient.invalidateQueries({ queryKey: ['product', id] })
    } catch { /* ignore */ } finally {
      setVariantPickerSaving(s => ({ ...s, [compPriceId]: false }))
    }
  }

  const handleRefreshUrl = async (url: string) => {
    await authFetch(`${API_BASE_URL}/competitor-prices/${id}/refresh-url?url=${encodeURIComponent(url)}`, {
      method: 'POST', headers: authHeaders(),
    })
    refetchCompetitorPrices()
    queryClient.invalidateQueries({ queryKey: ['product', id] })
  }

  const handleSaveEditedUrl = async (oldUrl: string, item: CompetitorUrl) => {
    const newUrlTrimmed = editingUrlInput.trim()
    if (!newUrlTrimmed || newUrlTrimmed === oldUrl) { setEditingUrlItem(null); return }
    setSavingUrl(true)
    try {
      // Smaž starou URL
      await authFetch(`${API_BASE_URL}/products/${id}/competitor-urls?url=${encodeURIComponent(oldUrl)}`, {
        method: 'DELETE', headers: authHeaders(),
      })
      // Přidej novou URL se stejným trhem
      await authFetch(`${API_BASE_URL}/products/${id}/competitor-urls`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ url: newUrlTrimmed, market: item.market }),
      })
      queryClient.invalidateQueries({ queryKey: ['product', id] })
      refetchCompetitorPrices()
      setEditingUrlItem(null)
    } catch (e: any) {
      alert(e.message || 'Chyba při ukládání URL')
    } finally {
      setSavingUrl(false)
    }
  }

  const [refreshingAll, setRefreshingAll] = useState(false)

  const handleRefreshAll = async () => {
    setRefreshingAll(true)
    try {
      await authFetch(`${API_BASE_URL}/competitor-prices/${id}/refresh`, {
        method: 'POST', headers: authHeaders(),
      })
      refetchCompetitorPrices()
      queryClient.invalidateQueries({ queryKey: ['product', id] })
      queryClient.invalidateQueries({ queryKey: ['product-prices', id] })
    } finally {
      setRefreshingAll(false)
    }
  }

  const handleSaveManualPrice = async (compPriceId: string) => {
    const price = parseFloat(manualPriceInput.replace(',', '.'))
    if (isNaN(price) || price <= 0) return
    await authFetch(`${API_BASE_URL}/competitor-prices/by-url/${compPriceId}/manual`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ price }),
    })
    setEditingPriceId(null); setManualPriceInput('')
    refetchCompetitorPrices()
    queryClient.invalidateQueries({ queryKey: ['product', id] })
  }

  const handleToggleHistory = async (compPriceId: string) => {
    if (expandedHistoryId === compPriceId) { setExpandedHistoryId(null); return }
    setExpandedHistoryId(compPriceId)
    if (!historyData[compPriceId]) {
      const res = await authFetch(`${API_BASE_URL}/competitor-prices/by-url/${compPriceId}/history`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setHistoryData(prev => ({ ...prev, [compPriceId]: data }))
      }
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading || !product) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">Načítám produkt...</p>
      </div>
    )
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const currentPrice       = product.current_price != null ? Number(product.current_price) : null
  const purchasePriceWithoutVat = product.purchase_price_without_vat != null ? Number(product.purchase_price_without_vat) : null
  const purchasePriceWithVat    = product.purchase_price_with_vat != null ? Number(product.purchase_price_with_vat) : null
  const manufacturingCost       = product.manufacturing_cost != null ? Number(product.manufacturing_cost) : null
  const manufacturingCostWithVat = product.manufacturing_cost_with_vat != null ? Number(product.manufacturing_cost_with_vat) : null
  const purchaseVatRate  = product.purchase_vat_rate != null ? Number(product.purchase_vat_rate) : 12
  const minPrice         = product.min_price != null ? Number(product.min_price) : null
  const heroScore        = product.hero_score ?? 0
  const competitorUrls   = product.competitor_urls || []
  // latestPrices jsou ALL záznamy — filtrujeme per-market v renderování
  const allPrices        = (prices as PriceRecord[])

  // ── Multi-market ──────────────────────────────────────────────────────────
  const availableMarkets = [...new Set(competitorUrls.map(u => u.market).filter(Boolean))]
  // Also add markets that have a Price record from a feed (e.g. SK feed imported)
  ;(prices as PriceRecord[]).forEach(p => {
    if (p.market && !availableMarkets.includes(p.market)) availableMarkets.push(p.market)
  })
  if (availableMarkets.length === 0 && product.market) availableMarkets.push(product.market)
  if (!availableMarkets.includes('CZ') && !availableMarkets.includes('SK')) availableMarkets.unshift('CZ')
  const activeMarket = viewMarket ?? product.market ?? availableMarkets[0] ?? 'CZ'
  const activeCurrency = MARKET_CURRENCY[activeMarket] ?? 'CZK'

  // Marže pro aktivní trh — přednostně z margin_by_market[activeMarket], fallback na globální margin
  const margin = (() => {
    const mbm = product.margin_by_market
    if (mbm) {
      if (mbm[activeMarket] != null) return mbm[activeMarket]
      const keys = Object.keys(mbm)
      if (keys.length > 0) return mbm[keys[0]]
    }
    return product.margin != null ? Number(product.margin) : null
  })()

  // Display name: use feed name for active market when available
  const displayName = (activeMarket !== 'CZ' && product.market_names?.[activeMarket])
    ? product.market_names[activeMarket]
    : product.name

  // Filter competitor URLs and prices to active market
  const filteredUrls = competitorUrls.filter(u => (u.market || 'CZ') === activeMarket)
  const filteredPrices = (competitorPrices as CompetitorPriceRecord[]).filter(
    cp => filteredUrls.some(u => u.url === cp.competitor_url)
  )

  // Our price in the active market:
  // Prefer native currency (EUR for SK, CZK for CZ, HUF for HU), then most recent.
  // This prevents a stale CZK/EUR mismatch from shadowing the correct native price.
  const nativeCurrency = activeCurrency // already = MARKET_CURRENCY[activeMarket]
  const marketPriceRecord = (() => {
    const mktPrices = (prices as PriceRecord[])
      .filter(p => p.market === activeMarket)
      .sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime())
    // Native-currency record (most recent among those)
    return mktPrices.find(p => p.currency === nativeCurrency) ?? mktPrices[0] ?? null
  })()
  // ourPriceInMarket: in native currency (EUR for SK, HUF for HU, CZK for CZ)
  const ourPriceInMarket = marketPriceRecord != null
    ? Number(marketPriceRecord.current_price)
    : currentPrice != null ? toMarket(currentPrice, activeMarket) : null
  // Convert back to CZK for margin calculations
  const ourPriceCzk = marketPriceRecord != null
    ? Number(marketPriceRecord.current_price) * (EXCHANGE[marketPriceRecord.currency ?? 'CZK'] ?? 1)
    : currentPrice

  // Lowest competitor price in CZK, then converted for display
  const lowestCompCzk = (() => {
    const vals = filteredPrices
      .filter(cp => cp.price != null)
      .map(cp => {
        // Vždy odvoď měnu z TLD domény — opravuje špatná data v DB
        const currency = currencyFromUrl(cp.competitor_url)
        const rate = EXCHANGE[currency] ?? 1
        return Number(cp.price) * rate // normalize to CZK
      })
    return vals.length ? Math.min(...vals) : null
  })()
  const lowestComp = lowestCompCzk // kept in CZK for margin calc

  const lowestCompInMarket = lowestCompCzk != null ? toMarket(lowestCompCzk, activeMarket) : null

  // Hero score breakdown
  const priceSet      = currentPrice != null ? 25 : 0
  const hasCost       = (purchasePriceWithoutVat != null && purchasePriceWithoutVat > 0) || (manufacturingCost != null && manufacturingCost > 0)
  const purchaseSet   = hasCost ? 15 : 0
  const competitorSet = competitorUrls.length >= 1 ? 15 : 0
  const minSet        = minPrice != null ? 10 : 0
  const marginPts     = Math.max(heroScore - priceSet - purchaseSet - competitorSet - minSet, 0)

  // Margin color
  const marginColor = margin == null ? 'text-gray-400'
    : margin >= 20 ? 'text-green-700' : margin >= 10 ? 'text-yellow-700' : margin > 0 ? 'text-orange-600' : 'text-red-600'
  const marginBg = margin == null ? 'bg-gray-50'
    : margin >= 20 ? 'bg-green-50' : margin >= 10 ? 'bg-yellow-50' : margin > 0 ? 'bg-orange-50' : 'bg-red-50'

  // Price vs competitor comparison (in active market currency)
  const priceDiff = ourPriceInMarket != null && lowestCompInMarket != null ? ourPriceInMarket - lowestCompInMarket : null
  const priceVsComp = priceDiff == null ? null : priceDiff <= 0 ? 'cheaper' : 'expensive'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── BREADCRUMB ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/products')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition">
          <ArrowLeft size={15} />
          <span>Produkty</span>
          <span className="text-gray-300">/</span>
          <span className="text-gray-900 font-medium truncate max-w-xs">{displayName}</span>
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/simulator', { state: {
              selectedProductId: product.id,
              basePrice: product.current_price ?? undefined,
              baseMargin: product.margin ?? undefined,
            }})}
            className="flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-800 border border-purple-200 hover:border-purple-300 px-3 py-1.5 rounded-lg transition bg-white">
            <Play size={13} /> Simulátor co-když
          </button>
          {product.url_reference && (() => {
            // Market-aware eshop URL: CZ = nuties.cz, SK = nuties.sk, HU = nuties.hu
            const eshopUrl = activeMarket === 'SK'
              ? product.url_reference!.replace(/nuties\.cz/gi, 'nuties.sk')
              : activeMarket === 'HU'
                ? product.url_reference!.replace(/nuties\.cz/gi, 'nuties.hu')
                : product.url_reference!
            const flag = MARKET_FLAG[activeMarket] ?? ''
            return (
              <a href={eshopUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-300 px-3 py-1.5 rounded-lg transition bg-white">
                <ExternalLink size={13} /> {flag} Na e-shopu
              </a>
            )
          })()}
        </div>
      </div>

      {/* ── PRODUCT HEADER ─────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-4">
        {product.thumbnail_url ? (
          <img src={product.thumbnail_url} alt={product.name}
            className="w-14 h-14 object-contain rounded-lg bg-gray-50 border flex-shrink-0"
            onError={(e) => { e.currentTarget.style.display = 'none' }} />
        ) : (
          <div className="w-14 h-14 bg-blue-50 rounded-lg border flex items-center justify-center flex-shrink-0">
            <Package size={24} className="text-blue-300" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-gray-900 leading-tight">{displayName}</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">SKU: {product.sku}</span>
            {product.product_code && (
              <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded">PRODUCTNO: {product.product_code}</span>
            )}
            {product.ean && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">EAN: {product.ean}</span>
            )}
            {product.manufacturer && (
              <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-medium">🏭 {product.manufacturer}</span>
            )}
            {product.category && (
              <span className="text-xs text-gray-400">· {product.category}</span>
            )}
            {product.market && (
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">
                {product.market === 'CZ' ? '🇨🇿 CZ' : '🇸🇰 SK'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── MARKET ATTRIBUTES (popis, složení z URL) ───────────────────── */}
      {(() => {
        const attrs = product.market_attributes?.[activeMarket]
        if (!attrs?.description && !attrs?.ingredients) return null
        return (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
            {attrs.description && (
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                  Popis {MARKET_FLAG[activeMarket] ?? activeMarket}
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">{attrs.description}</p>
              </div>
            )}
            {attrs.ingredients && (
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                  Složení {MARKET_FLAG[activeMarket] ?? activeMarket}
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">{attrs.ingredients}</p>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── MARKET SWITCHER ────────────────────────────────────────────── */}
      {availableMarkets.length > 1 && (
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 self-start w-fit">
          {availableMarkets.map(m => (
            <button
              key={m}
              onClick={() => setViewMarket(m)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                activeMarket === m
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {MARKET_FLAG[m] ?? m} {m}
              <span className={`text-xs ${activeMarket === m ? 'text-blue-200' : 'text-gray-400'}`}>
                {MARKET_CURRENCY[m] ?? m}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── KPI STRIP ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">

        {/* Aktuální cena */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Aktuální cena</p>
          {ourPriceInMarket != null ? (
            <>
              <p className="text-2xl font-bold text-blue-700 leading-none">
                {ourPriceInMarket.toLocaleString(
                  activeMarket === 'SK' ? 'sk-SK' : activeMarket === 'HU' ? 'hu-HU' : 'cs-CZ',
                  { minimumFractionDigits: activeMarket === 'CZ' ? 0 : 2, maximumFractionDigits: activeMarket === 'CZ' ? 0 : 2 }
                )}
              </p>
              <p className="text-sm text-gray-400 mt-0.5">{activeCurrency}</p>
              {activeMarket !== 'CZ' && ourPriceCzk != null && (
                <p className="text-xs text-gray-400 mt-0.5">{ourPriceCzk.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} CZK</p>
              )}
              {/* Kurz přepočtu — zobrazit jen pro non-CZK trhy */}
              {activeCurrency !== 'CZK' && (
                <p className="text-xs text-blue-400 mt-1 font-medium">
                  1 {activeCurrency} = {EXCHANGE[activeCurrency].toLocaleString('cs-CZ')} CZK
                </p>
              )}
              {marketPriceRecord?.old_price != null && (
                <p className="text-xs text-gray-400 line-through mt-1">
                  {Number(marketPriceRecord.old_price).toLocaleString(
                    activeMarket === 'SK' ? 'sk-SK' : 'cs-CZ',
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                  )} {activeCurrency}
                </p>
              )}
            </>
          ) : product.catalog_price_vat != null ? (
            <>
              <p className="text-2xl font-bold text-gray-700 leading-none">
                {toMarket(Number(product.catalog_price_vat), activeMarket).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })}
              </p>
              <p className="text-sm text-gray-400 mt-0.5">{activeCurrency}</p>
              <p className="text-xs text-indigo-500 mt-1">z katalogu</p>
            </>
          ) : (
            <p className="text-sm text-gray-400 mt-1">Nenastaveno</p>
          )}
          {product.catalog_price_vat != null && currentPrice != null && (
            <p className="text-xs text-gray-400 mt-1">Katalog: {fmtMkt(Number(product.catalog_price_vat), activeMarket)}</p>
          )}
          <button
            onClick={() => { setShowPriceForm(!showPriceForm); setShowPricingForm(null) }}
            className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-0.5">
            <Edit2 size={10} /> Upravit
          </button>
        </div>

        {/* Marže */}
        <div className={`border border-gray-200 rounded-xl p-4 ${marginBg}`}>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Marže</p>
          {margin != null ? (
            <>
              <p className={`text-2xl font-bold leading-none ${marginColor}`}>{fmt(margin, 1)}</p>
              <p className={`text-sm mt-0.5 ${marginColor}`}>%</p>
              <p className="text-xs text-gray-400 mt-1">
                {margin >= 20 ? 'Zdravá marže' : margin >= 10 ? 'Nízká marže' : margin > 0 ? 'Kritická marže' : 'Záporná marže'}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-400 mt-1">Nastav nákupní cenu</p>
          )}
        </div>

        {/* Nejnižší konkurent */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
            Nejnižší konkurent {availableMarkets.length > 1 && <span className="text-gray-300">({activeMarket})</span>}
          </p>
          {lowestCompInMarket != null ? (
            <>
              <p className="text-2xl font-bold text-gray-900 leading-none">
                {lowestCompInMarket.toLocaleString(
                  activeMarket === 'SK' ? 'sk-SK' : activeMarket === 'HU' ? 'hu-HU' : 'cs-CZ',
                  { minimumFractionDigits: activeMarket === 'CZ' ? 0 : 2, maximumFractionDigits: activeMarket === 'CZ' ? 0 : 2 }
                )}
              </p>
              <p className="text-sm text-gray-400 mt-0.5">{activeCurrency}</p>
              {priceDiff != null && (
                <p className={`text-xs mt-1 font-medium ${priceVsComp === 'cheaper' ? 'text-green-600' : 'text-orange-600'}`}>
                  {priceVsComp === 'cheaper'
                    ? '✓ Jsi nejlevnější'
                    : `+${Math.abs(priceDiff).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} ${activeCurrency} nad min.`}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400 mt-1">
              {filteredUrls.length === 0 ? 'Přidej konkurenty' : 'Načítám...'}
            </p>
          )}
        </div>

        {/* Skladem */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Skladem</p>
          {(() => {
            const rawQty = product.stock_quantity ?? product.catalog_quantity_in_stock
            const fromBl = product.stock_quantity != null
            if (rawQty == null) return <p className="text-sm text-gray-400 mt-1">Nepropojeno</p>
            const displayQty = Math.floor(rawQty / stockDivisor)
            const colorClass = displayQty > 10 ? 'text-green-700' : displayQty > 0 ? 'text-yellow-600' : 'text-red-600'
            return (
              <>
                <p className={`text-2xl font-bold leading-none ${colorClass}`}>{displayQty}</p>
                <p className="text-sm text-gray-400 mt-0.5">
                  ks · {fromBl ? 'Baselinker' : 'katalog'}
                  {stockDivisor > 1 && (
                    <span className="ml-1 text-xs text-blue-500">(÷{stockDivisor}, raw: {rawQty})</span>
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {displayQty > 10 ? 'Dostatek' : displayQty > 0 ? 'Docházející' : 'Vyprodáno'}
                </p>
                {/* Divisor editor */}
                {editingDivisor ? (
                  <div className="mt-2 flex items-center gap-1">
                    <span className="text-xs text-gray-400">÷</span>
                    <input
                      type="number" min={1} value={divisorInput}
                      onChange={e => setDivisorInput(e.target.value)}
                      className="w-14 text-xs border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const n = parseInt(divisorInput)
                          if (n >= 1) { saveStockDivisor(n); setEditingDivisor(false) }
                        }
                        if (e.key === 'Escape') setEditingDivisor(false)
                      }}
                    />
                    <button onClick={() => {
                      const n = parseInt(divisorInput)
                      if (n >= 1) { saveStockDivisor(n); setEditingDivisor(false) }
                    }} disabled={savingDivisor} className="text-xs text-blue-600 hover:underline disabled:opacity-50">{savingDivisor ? '...' : 'OK'}</button>
                    <button onClick={() => setEditingDivisor(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setDivisorInput(String(stockDivisor)); setEditingDivisor(true) }}
                    className="mt-2 text-xs text-gray-400 hover:text-blue-600 transition flex items-center gap-0.5">
                    {stockDivisor > 1 ? `÷${stockDivisor} · změnit` : '÷ Rozdělit'}
                  </button>
                )}
                {!fromBl && product.catalog_quantity_in_stock != null && product.stock_quantity != null && (
                  <p className="text-xs text-gray-400 mt-1">Katalog: {Math.floor(product.catalog_quantity_in_stock / stockDivisor)} ks</p>
                )}
              </>
            )
          })()}
        </div>

        {/* Hero skóre */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1 self-start w-full">Hero skóre</p>
          <MiniGauge score={heroScore} />
        </div>
      </div>

      {/* ── PRICE EDIT FORM (inline, full-width) ───────────────────────── */}
      {showPriceForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">Nastavit prodejní cenu</p>
            <button onClick={() => setShowPriceForm(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-gray-600 font-medium">Aktuální cena *</label>
              <input type="text" value={priceForm.current_price}
                onChange={(e) => setPriceForm(p => ({ ...p, current_price: e.target.value }))}
                placeholder="299.00" autoFocus
                className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-600 font-medium">Přeškrtnutá cena</label>
              <input type="text" value={priceForm.old_price}
                onChange={(e) => setPriceForm(p => ({ ...p, old_price: e.target.value }))}
                placeholder="349.00"
                className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-600 font-medium">Trh</label>
              <div className="mt-1 flex gap-1">
                {(['CZ', 'SK'] as const).map(m => (
                  <button key={m} onClick={() => setPriceForm(p => ({ ...p, market: m }))}
                    className={`flex-1 py-1.5 rounded text-xs font-medium border transition ${priceForm.market === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                    {m === 'CZ' ? '🇨🇿 CZ' : '🇸🇰 SK'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-end">
              <button onClick={handleSetPrice} disabled={setPriceMutation.isPending}
                className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition">
                <Save size={13} />{setPriceMutation.isPending ? 'Ukládám...' : 'Uložit cenu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── VLASTNÍ URL TRHU ──────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vlastní URL trhu</p>
          <p className="text-xs text-gray-400">Cena, popis a složení se stáhne automaticky</p>
        </div>
        <div className="space-y-2">
          {(['CZ', 'SK', 'HU'] as const).map(mkt => {
            const flag = MARKET_FLAG[mkt] ?? mkt
            const savedUrl = product.own_market_urls?.[mkt] ?? ''
            const editVal = ownUrlEditing[mkt] ?? savedUrl
            const isSaving = ownUrlSaving[mkt] ?? false
            const fetchStatus = ownUrlFetchStatus[mkt] ?? 'idle'
            const isDirty = editVal !== savedUrl
            const mktAttrs = product.market_attributes?.[mkt]
            const mktPrice = product.prices_by_market?.[mkt]

            return (
              <div key={mkt} className={`rounded-lg border px-3 py-2.5 transition ${activeMarket === mkt ? 'border-blue-200 bg-blue-50/40' : 'border-gray-100 bg-gray-50'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-base flex-shrink-0">{flag}</span>
                  <span className="text-xs font-medium text-gray-500 w-6">{mkt}</span>
                  <input
                    type="url"
                    value={editVal}
                    onChange={e => setOwnUrlEditing(s => ({ ...s, [mkt]: e.target.value }))}
                    onBlur={() => { if (!isDirty) setOwnUrlEditing(s => { const n = { ...s }; delete n[mkt]; return n }) }}
                    placeholder={`https://nuties.${mkt.toLowerCase()}/ ...`}
                    className="flex-1 min-w-0 text-xs font-mono bg-white border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 text-gray-700 placeholder-gray-300"
                  />
                  {isDirty ? (
                    <button
                      onClick={() => handleSaveOwnUrl(mkt)}
                      disabled={isSaving}
                      className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-3 py-1.5 rounded text-xs font-medium transition">
                      {isSaving ? '…' : 'Uložit'}
                    </button>
                  ) : savedUrl ? (
                    <button
                      onClick={() => {
                        setOwnUrlFetchStatus(s => ({ ...s, [mkt]: 'fetching' }))
                        authFetch(`${API_BASE_URL}/products/${id}/fetch-url-data`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', ...authHeaders() },
                          body: JSON.stringify({ url: savedUrl, market: mkt }),
                        }).then(r => {
                          setOwnUrlFetchStatus(s => ({ ...s, [mkt]: r.ok ? 'done' : 'error' }))
                          if (r.ok) {
                            queryClient.invalidateQueries({ queryKey: ['product', id] })
                            queryClient.invalidateQueries({ queryKey: ['product-prices', id] })
                          }
                        }).catch(() => setOwnUrlFetchStatus(s => ({ ...s, [mkt]: 'error' })))
                      }}
                      disabled={fetchStatus === 'fetching'}
                      className="flex-shrink-0 text-xs text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-300 px-2 py-1.5 rounded bg-white transition"
                      title="Aktualizovat cenu a info z URL">
                      {fetchStatus === 'fetching' ? (
                        <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z"/></svg>
                      ) : '↻'}
                    </button>
                  ) : null}
                </div>

                {/* Variant picker — shown after URL is saved */}
                {savedUrl && !isDirty && (
                  <div className="mt-2 pl-14">
                    {/* State A: variants detected — show chips */}
                    {ownUrlVariants[mkt] !== undefined && (
                      ownUrlVariants[mkt].length > 0 ? (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-gray-500">
                            Detekováno {ownUrlVariants[mkt].length} variant — vyber sledovanou:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              onClick={() => _doSaveOwnUrl(mkt, savedUrl, null)}
                              disabled={ownUrlSaving[mkt]}
                              className={`px-2.5 py-1 rounded-full border text-xs font-medium transition disabled:opacity-50 ${
                                !product.own_market_variant_labels?.[mkt]
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600'
                              }`}>
                              Celý produkt
                            </button>
                            {ownUrlVariants[mkt].map((v, i) => (
                              <button key={i}
                                onClick={() => _doSaveOwnUrl(mkt, savedUrl, v.label)}
                                disabled={ownUrlSaving[mkt]}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition disabled:opacity-50 ${
                                  product.own_market_variant_labels?.[mkt] === v.label
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400 hover:text-blue-600'
                                }`}>
                                <span>{v.label}</span>
                                {v.price != null && (
                                  <span className={`font-semibold ${product.own_market_variant_labels?.[mkt] === v.label ? 'text-blue-100' : 'text-emerald-600'}`}>
                                    {v.price.toLocaleString('cs-CZ')}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">Žádné varianty na stránce nenalezeny — produkt bez variant.</p>
                      )
                    )}
                    {/* State B: variants not yet loaded — show detect button */}
                    {ownUrlVariants[mkt] === undefined && (
                      <div className="flex items-center gap-2">
                        {product.own_market_variant_labels?.[mkt] && (
                          <span className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded px-2 py-1 flex-shrink-0">
                            📦 {product.own_market_variant_labels[mkt]}
                          </span>
                        )}
                        <button
                          onClick={() => handleDetectOwnVariants(mkt, savedUrl)}
                          disabled={fetchStatus === 'fetching'}
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-300 px-2.5 py-1.5 rounded bg-white transition disabled:opacity-50">
                          {fetchStatus === 'fetching' ? (
                            <><svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z"/></svg>Načítám…</>
                          ) : <><span>🔍</span> Načíst varianty ze stránky</>}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Status row */}
                {savedUrl && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-14">
                    {mktPrice?.price != null && (
                      <span className="text-xs text-emerald-700 font-semibold">
                        {mktPrice.price.toLocaleString('cs-CZ')} {mktPrice.currency}
                      </span>
                    )}
                    {mktAttrs?.description && (
                      <span className="text-xs text-gray-400">✓ popis</span>
                    )}
                    {mktAttrs?.ingredients && (
                      <span className="text-xs text-gray-400">✓ složení</span>
                    )}
                    {fetchStatus === 'done' && (
                      <span className="text-xs text-emerald-600">✓ aktualizováno</span>
                    )}
                    {fetchStatus === 'error' && (
                      <span className="text-xs text-red-500">⚠ chyba při stahování</span>
                    )}
                    <a href={savedUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline truncate max-w-xs">
                      {savedUrl.replace(/^https?:\/\/(www\.)?/, '').slice(0, 50)}
                    </a>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── MAIN GRID: Cenotvorba + Konkurenti ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* LEFT: Cenotvorba */}
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp size={15} className="text-blue-500" /> Cenotvorba
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowPricingForm(showPricingForm === 'purchase' ? null : 'purchase'); setShowPriceForm(false); setPricingForm(p => ({ ...p, purchase_price_without_vat: purchasePriceWithoutVat ? String(purchasePriceWithoutVat) : '' })) }}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition ${showPricingForm === 'purchase' ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                <ShoppingCart size={12} /> Nákupní cena
              </button>
              <button
                onClick={() => { setShowPricingForm(showPricingForm === 'manufacturing' ? null : 'manufacturing'); setShowPriceForm(false); setPricingForm(p => ({ ...p, manufacturing_cost: manufacturingCost ? String(manufacturingCost) : '' })) }}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition ${showPricingForm === 'manufacturing' ? 'bg-orange-500 text-white border-orange-500' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                <Factory size={12} /> Výrobní cena
              </button>
            </div>
          </div>

          <div className="p-5 space-y-0">

            {/* Inline edit: Nákupní cena */}
            {showPricingForm === 'purchase' && (
              <div className="mb-4 p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-3">
                <p className="text-sm font-semibold text-blue-900 flex items-center gap-1.5"><ShoppingCart size={13} /> Nákupní cena bez DPH</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-600">Cena bez DPH *</label>
                    <input type="text" value={pricingForm.purchase_price_without_vat}
                      onChange={(e) => setPricingForm(p => ({ ...p, purchase_price_without_vat: e.target.value }))}
                      placeholder="200.00" autoFocus
                      className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Sazba DPH (%)</label>
                    <input type="text" value={pricingForm.purchase_vat_rate}
                      onChange={(e) => setPricingForm(p => ({ ...p, purchase_vat_rate: e.target.value }))}
                      placeholder={String(purchaseVatRate)}
                      className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Min. cena s DPH</label>
                    <div className="mt-1 w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white text-gray-700">
                      {(() => {
                        const c = parseFloat(pricingForm.purchase_price_without_vat.replace(',', '.'))
                        const v = parseFloat(pricingForm.purchase_vat_rate.replace(',', '.') || String(purchaseVatRate))
                        return !isNaN(c) && c > 0 ? fmt(c * (1 + v / 100)) : '—'
                      })()}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500">CZ potraviny 12 %, ostatní položky 21 %</p>
                <div className="flex gap-2">
                  <button onClick={handleSetPricing} disabled={setPricingMutation.isPending}
                    className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">
                    <Save size={12} />{setPricingMutation.isPending ? 'Ukládám...' : 'Uložit'}
                  </button>
                  <button onClick={() => setShowPricingForm(null)} className="text-gray-500 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-100">Zrušit</button>
                </div>
              </div>
            )}

            {/* Inline edit: Výrobní cena */}
            {showPricingForm === 'manufacturing' && (
              <div className="mb-4 p-4 bg-orange-50 rounded-xl border border-orange-100 space-y-3">
                <p className="text-sm font-semibold text-orange-900 flex items-center gap-1.5"><Factory size={13} /> Výrobní cena bez DPH</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-600">Cena bez DPH *</label>
                    <input type="text" value={pricingForm.manufacturing_cost}
                      onChange={(e) => setPricingForm(p => ({ ...p, manufacturing_cost: e.target.value }))}
                      placeholder="150.00" autoFocus
                      className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Sazba DPH (%)</label>
                    <input type="text" value={pricingForm.purchase_vat_rate}
                      onChange={(e) => setPricingForm(p => ({ ...p, purchase_vat_rate: e.target.value }))}
                      placeholder={String(purchaseVatRate)}
                      className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Min. cena s DPH</label>
                    <div className="mt-1 w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white text-gray-700">
                      {(() => {
                        const c = parseFloat(pricingForm.manufacturing_cost.replace(',', '.'))
                        const v = parseFloat(pricingForm.purchase_vat_rate.replace(',', '.') || String(purchaseVatRate))
                        return !isNaN(c) && c > 0 ? fmt(c * (1 + v / 100)) : '—'
                      })()}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500">CZ potraviny 12 %, ostatní položky 21 %</p>
                <div className="flex gap-2">
                  <button onClick={handleSetPricing} disabled={setPricingMutation.isPending}
                    className="flex items-center gap-1 bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">
                    <Save size={12} />{setPricingMutation.isPending ? 'Ukládám...' : 'Uložit'}
                  </button>
                  <button onClick={() => setShowPricingForm(null)} className="text-gray-500 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-100">Zrušit</button>
                </div>
              </div>
            )}

            {/* Doporučená cena banner (ze Simulátoru nebo Doporučení cen) */}
            {latestRec && (
              <div className={`mb-3 p-3.5 rounded-xl border flex items-center gap-3 ${
                latestRec.status === 'approved'
                  ? 'bg-green-50 border-green-200'
                  : 'bg-blue-50 border-blue-200'
              }`}>
                <div className="shrink-0">
                  {latestRec.reasoning?.source === 'simulator' ? (
                    <span className="text-lg">🎯</span>
                  ) : (
                    <span className="text-lg">💡</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-700">
                    Doporučená cena
                    <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                      latestRec.status === 'approved'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {latestRec.status === 'approved' ? 'Schváleno' : 'Čeká na schválení'}
                    </span>
                  </p>
                  <p className="text-base font-bold text-blue-700 mt-0.5">
                    {latestRec.recommended_price_with_vat.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} Kč
                    {latestRec.current_price_with_vat && (
                      <span className={`ml-2 text-xs font-medium ${
                        latestRec.recommended_price_with_vat > latestRec.current_price_with_vat
                          ? 'text-emerald-600'
                          : latestRec.recommended_price_with_vat < latestRec.current_price_with_vat
                            ? 'text-red-500'
                            : 'text-gray-400'
                      }`}>
                        {latestRec.recommended_price_with_vat > latestRec.current_price_with_vat ? '▲' : latestRec.recommended_price_with_vat < latestRec.current_price_with_vat ? '▼' : '='}{' '}
                        {Math.abs(latestRec.recommended_price_with_vat - latestRec.current_price_with_vat).toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} Kč
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {latestRec.reasoning?.source === 'simulator'
                      ? `Simulátor co-když • ${latestRec.reasoning?.scenario_label ?? ''}`
                      : latestRec.reasoning?.text ?? 'Doporučení cen'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm(`Použít doporučenou cenu ${latestRec.recommended_price_with_vat.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} Kč?`)) {
                      // Schválit doporučení a uložit jako aktuální cenu
                      authFetch(`${API_BASE_URL}/recommendations/${latestRec.id}/approve`, {
                        method: 'POST',
                        headers: authHeaders(),
                      }).then(() => {
                        refetchRecs()
                        queryClient.invalidateQueries({ queryKey: ['product', id] })
                      })
                    }
                  }}
                  className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition"
                >
                  <CheckCircle size={12} /> Schválit
                </button>
              </div>
            )}

            {/* Pricing rows */}
            {[
              {
                icon: <ShoppingCart size={13} className="text-gray-400" />,
                label: 'Nákupní cena (bez DPH)',
                value: purchasePriceWithoutVat,
                valueStr: purchasePriceWithoutVat != null ? `${fmt(purchasePriceWithoutVat)} CZK` : null,
                sub: purchasePriceWithVat != null ? `DPH ${fmt(purchaseVatRate, 0)} % → ${fmt(purchasePriceWithVat)} CZK` : null,
                // Přepočet do měny aktivního trhu
                mktConv: (activeCurrency !== 'CZK' && purchasePriceWithVat != null)
                  ? `= ${(purchasePriceWithVat / EXCHANGE[activeCurrency]).toLocaleString(activeMarket === 'SK' ? 'sk-SK' : 'cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${activeCurrency}`
                  : null,
                onClear: () => setPricingMutation.mutate({ clear_purchase_price: true }),
              },
              {
                icon: <Factory size={13} className="text-gray-400" />,
                label: 'Výrobní cena (bez DPH)',
                value: manufacturingCost,
                valueStr: manufacturingCost != null ? `${fmt(manufacturingCost)} CZK` : null,
                sub: manufacturingCostWithVat != null ? `DPH ${fmt(purchaseVatRate, 0)} % → ${fmt(manufacturingCostWithVat)} CZK` : null,
                mktConv: (activeCurrency !== 'CZK' && manufacturingCostWithVat != null)
                  ? `= ${(manufacturingCostWithVat / EXCHANGE[activeCurrency]).toLocaleString(activeMarket === 'SK' ? 'sk-SK' : 'cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${activeCurrency}`
                  : null,
                onClear: () => setPricingMutation.mutate({ clear_manufacturing_cost: true }),
              },
            ].map((row, i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-gray-50 group">
                <span className="text-sm text-gray-500 flex items-center gap-1.5">{row.icon}{row.label}</span>
                <div className="flex items-center gap-2">
                  {row.valueStr ? (
                    <div className="text-right">
                      <span className="text-sm font-semibold text-gray-800">{row.valueStr}</span>
                      {row.sub && <p className="text-xs text-gray-400">{row.sub}</p>}
                      {row.mktConv && <p className="text-xs text-blue-500 font-medium">{row.mktConv}</p>}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 italic">Nenastaveno</span>
                  )}
                  {row.value != null && (
                    <button onClick={row.onClear} disabled={setPricingMutation.isPending}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between py-3 border-b border-gray-50">
              <span className="text-sm text-gray-500">Minimální cena s DPH</span>
              {minPrice != null
                ? <span className="text-sm font-semibold text-gray-800">{fmt(minPrice)} CZK</span>
                : <span className="text-xs text-gray-400 italic">Nenastaveno</span>}
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-gray-500">Trh</span>
              <span className="text-sm font-medium text-gray-700">{product.market || 'CZ'}</span>
            </div>
          </div>

          {/* Hero Score breakdown */}
          <div className="border-t border-gray-100 px-5 py-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <BarChart2 size={12} /> Složení hero skóre
            </p>
            <div className="space-y-0">
              <ScoreRow label="Aktuální cena nastavena" pts={priceSet} max={25} />
              <ScoreRow label="Nákupní / výrobní cena" pts={purchaseSet} max={15} />
              <ScoreRow label="Kvalita marže" pts={marginPts} max={35} />
              <ScoreRow label="Minimální cena" pts={minSet} max={10} />
              <ScoreRow label="Sleduje konkurenty" pts={competitorSet} max={15} />
            </div>
            {heroScore < 60 && (
              <div className="mt-3 flex items-start gap-1.5 p-2.5 bg-orange-50 rounded-lg text-xs text-orange-700">
                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                <span>
                  {!currentPrice && 'Nastav prodejní cenu. '}
                  {!hasCost && 'Nastav nákupní nebo výrobní cenu. '}
                  {competitorUrls.length === 0 && 'Přidej URL konkurentů.'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Ceny konkurentů */}
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Link2 size={15} className="text-green-500" /> Ceny konkurentů
              {competitorUrls.length > 0 && (
                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{competitorUrls.length}</span>
              )}
            </h2>
            <div className="flex gap-2">
              {competitorUrls.length > 0 && (
                <button onClick={handleRefreshAll} disabled={refreshingAll}
                  className="flex items-center gap-1 text-xs text-gray-600 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg border border-gray-200 transition disabled:opacity-60 disabled:cursor-wait">
                  <RefreshCw size={12} className={refreshingAll ? 'animate-spin' : ''} />
                  {refreshingAll ? 'Aktualizuji…' : 'Aktualizovat vše'}
                </button>
              )}
              <button onClick={() => { setShowAddUrl(!showAddUrl); setNewUrlMarket(activeMarket) }}
                className="flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-200 transition">
                <Plus size={13} /> Přidat URL
              </button>
            </div>
          </div>

          {/* Add URL form — two-step: URL input → preview → confirm */}
          {showAddUrl && (
            <div className="mx-5 mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-3">

              {/* Step 1: URL input */}
              <div className="space-y-2">
                <div className="flex gap-1">
                  {(['CZ', 'SK', 'HU'] as const).map(m => (
                    <button key={m} onClick={() => setNewUrlMarket(m)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${newUrlMarket === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 text-gray-600'}`}>
                      {m === 'CZ' ? '🇨🇿 CZ' : m === 'SK' ? '🇸🇰 SK' : '🇭🇺 HU'}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="url" value={newUrl}
                    onChange={(e) => { setNewUrl(e.target.value); setUrlPreview(null); setSelectedVariant(null) }}
                    onKeyDown={(e) => e.key === 'Enter' && !urlPreview && handlePreviewUrl()}
                    placeholder="https://grizly.cz/produkt/..." autoFocus
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button onClick={handlePreviewUrl} disabled={loadingPreview || !newUrl.trim()}
                    className="bg-gray-700 hover:bg-gray-800 disabled:bg-gray-300 text-white px-3 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap">
                    {loadingPreview ? 'Načítám…' : 'Načíst stránku'}
                  </button>
                </div>
              </div>

              {/* Step 2: Preview result */}
              {urlPreview && (
                <div className="border border-blue-200 rounded-lg bg-white p-3 space-y-2">
                  {!urlPreview.ok ? (
                    <div className="space-y-2">
                      <p className="text-xs text-red-600">{urlPreview.error}</p>
                      <p className="text-xs text-gray-500">Stránku se nepodařilo automaticky načíst (web blokuje roboty). Můžeš URL přidat přesto — cena se doplní ručně nebo při dalším pokusu.</p>
                    </div>
                  ) : (
                    <>
                      {/* Detected product info */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {urlPreview.detected_name && (
                            <p className="text-sm font-medium text-gray-800 truncate">{urlPreview.detected_name}</p>
                          )}
                          {urlPreview.detected_price != null ? (
                            <p className="text-xs text-emerald-700 font-semibold mt-0.5">
                              {urlPreview.detected_price.toLocaleString('cs-CZ')} {urlPreview.detected_currency}
                            </p>
                          ) : (
                            <p className="text-xs text-orange-600 mt-0.5">Cena nebyla nalezena — bude nastavena ručně</p>
                          )}
                          {/* Detected description */}
                          {urlPreview.detected_description && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{urlPreview.detected_description}</p>
                          )}
                          {/* Detected ingredients */}
                          {urlPreview.detected_ingredients && (
                            <div className="mt-1 flex items-start gap-1">
                              <span className="text-xs font-medium text-gray-400 flex-shrink-0">Složení:</span>
                              <p className="text-xs text-gray-500 line-clamp-2">{urlPreview.detected_ingredients}</p>
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5 flex-shrink-0">✓ Načteno</span>
                      </div>

                      {/* Variant selection (if variants detected) */}
                      {urlPreview.variants.length > 1 && (
                        <div>
                          <p className="text-xs font-medium text-gray-600 mb-1.5">
                            Detekováno {urlPreview.variants.length} variant — vyber tu, která odpovídá tvému produktu:
                          </p>
                          <div className="max-h-40 overflow-y-auto space-y-1">
                            {urlPreview.variants.map((v, i) => (
                              <button key={i} onClick={() => setSelectedVariant(selectedVariant?.label === v.label ? null : v)}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs text-left transition ${
                                  selectedVariant?.label === v.label
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-300'
                                }`}>
                                <span className="font-medium truncate">{v.label}</span>
                                {v.price != null && (
                                  <span className={`ml-2 flex-shrink-0 font-semibold ${selectedVariant?.label === v.label ? 'text-blue-100' : 'text-emerald-700'}`}>
                                    {v.price.toLocaleString('cs-CZ')} {urlPreview.detected_currency}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                          {selectedVariant && selectedVariant.url && selectedVariant.url !== newUrl && (
                            <p className="text-xs text-blue-600 mt-1.5">
                              Bude sledována URL: <span className="font-mono break-all">{selectedVariant.url}</span>
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {(urlPreview?.ok || (urlPreview && !urlPreview.ok && newUrl.trim())) && (
                  <button
                    onClick={handleConfirmUrl}
                    disabled={addingUrl || (urlPreview?.ok && (urlPreview.variants.length > 1 && !selectedVariant))}
                    className={`px-4 py-1.5 rounded-lg text-xs font-medium transition ${urlPreview?.ok ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white' : 'bg-orange-500 hover:bg-orange-600 text-white'}`}>
                    {addingUrl ? 'Přidávám...' : selectedVariant ? `Přidat variantu "${selectedVariant.label}"` : urlPreview?.ok ? 'Přidat a sledovat cenu' : 'Přidat přesto'}
                  </button>
                )}
                <button onClick={() => { setShowAddUrl(false); setNewUrl(''); setUrlPreview(null); setSelectedVariant(null) }}
                  className="text-gray-500 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-100">Zrušit</button>
              </div>
            </div>
          )}

          {/* Lowest price banner */}
          {lowestCompInMarket != null && ourPriceInMarket != null && (
            <div className={`mx-5 mt-4 px-4 py-3 rounded-xl border flex items-center justify-between text-sm ${
              priceVsComp === 'cheaper' ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'
            }`}>
              <div className="flex items-center gap-2">
                {priceVsComp === 'cheaper'
                  ? <CheckCircle size={14} className="text-green-600" />
                  : <AlertCircle size={14} className="text-orange-500" />
                }
                <span className={`text-xs font-medium ${priceVsComp === 'cheaper' ? 'text-green-800' : 'text-orange-800'}`}>
                  {priceVsComp === 'cheaper'
                    ? `Jsi nejlevnější — min. o ${Math.abs(priceDiff!).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} ${activeCurrency}`
                    : `Jsi dražší o ${priceDiff!.toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} ${activeCurrency} než nejlevnější konkurent`
                  }
                </span>
              </div>
              <span className={`text-xs font-bold ${priceVsComp === 'cheaper' ? 'text-green-700' : 'text-orange-700'}`}>
                min. {lowestCompInMarket.toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} {activeCurrency}
              </span>
            </div>
          )}

          {/* Competitor list */}
          <div className="p-5 space-y-2">
            {competitorUrls.length === 0 && !showAddUrl ? (
              <div className="text-center py-10">
                <Link2 size={36} className="mx-auto text-gray-200 mb-3" />
                <p className="text-sm text-gray-400 font-medium">Zatím žádní konkurenti</p>
                <p className="text-xs text-gray-400 mt-1">Přidejte URL produktu u vašich konkurentů.</p>
                <button onClick={() => { setShowAddUrl(true); setNewUrlMarket(activeMarket) }}
                  className="mt-3 flex items-center gap-1 mx-auto text-xs text-blue-600 hover:underline">
                  <Plus size={12} /> Přidat první URL
                </button>
              </div>
            ) : (
              filteredUrls.map((item) => {
                const priceRecord = (competitorPrices as CompetitorPriceRecord[]).find(cp => cp.competitor_url === item.url)
                const isEditing = editingPriceId === (priceRecord?.id ?? item.url)
                const isHistoryOpen = expandedHistoryId === priceRecord?.id
                const history = priceRecord ? (historyData[priceRecord.id] ?? []) : []
                const hasPrice = priceRecord?.price != null
                // Odvoď správnou měnu z TLD domény — opravuje záznamy s nesprávnou měnou v DB
                const resolvedCurrency = currencyFromUrl(item.url)
                // Compare in CZK (normalize competitor price to CZK for comparison)
                const cpPriceCzk = hasPrice ? Number(priceRecord!.price) * (EXCHANGE[resolvedCurrency] ?? 1) : null
                const isCheaper = cpPriceCzk != null && currentPrice != null && cpPriceCzk < currentPrice
                const isExpensive = cpPriceCzk != null && currentPrice != null && cpPriceCzk > currentPrice
                // Display price in competitor's native currency (always from TLD)
                const dispPrice = hasPrice ? Number(priceRecord!.price) : null
                const dispCurrency = resolvedCurrency

                return (
                  <div key={item.url} className={`rounded-xl border overflow-hidden transition ${
                    isCheaper ? 'border-red-200 bg-red-50' :
                    isExpensive ? 'border-green-100 bg-green-50' : 'border-gray-100 bg-gray-50'
                  }`}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* Favicon */}
                      <img src={`https://www.google.com/s2/favicons?sz=32&domain_url=https://${getDomain(item.url)}`}
                        alt="" className="w-5 h-5 flex-shrink-0 rounded"
                        onError={(e) => { e.currentTarget.style.display = 'none' }} />

                      {/* Name + link */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <a href={item.url} target="_blank" rel="noopener noreferrer"
                            className="text-sm font-medium text-gray-800 hover:text-blue-600 flex items-center gap-1 truncate group">
                            {item.name || getDomain(item.url)}
                            <ExternalLink size={10} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                          {priceRecord?.variant_label && (
                            <span className="text-[10px] bg-blue-100 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 font-medium flex-shrink-0">
                              {priceRecord.variant_label}
                            </span>
                          )}
                        </div>
                        <a href={item.url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-600 hover:underline flex items-center gap-0.5 truncate mt-0.5">
                          <ExternalLink size={9} className="flex-shrink-0" />
                          <span className="truncate">{item.url.replace(/^https?:\/\//, '')}</span>
                        </a>
                      </div>

                      {/* Price + date */}
                      <div className="text-right flex-shrink-0">
                        {hasPrice ? (
                          <p className={`text-base font-bold ${isCheaper ? 'text-red-600' : isExpensive ? 'text-green-700' : 'text-gray-800'}`}>
                            {dispPrice!.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {dispCurrency}
                          </p>
                        ) : (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            priceRecord?.fetch_status === 'error' ? 'bg-red-100 text-red-600' : 'bg-gray-200 text-gray-500'
                          }`}>
                            {priceRecord?.fetch_status === 'error' ? 'Chyba' : 'Nenačteno'}
                          </span>
                        )}
                        {priceRecord?.last_fetched_at && (
                          <p className="text-xs text-gray-400 flex items-center gap-0.5 justify-end mt-0.5">
                            <Clock size={9} />
                            {new Date(priceRecord.last_fetched_at).toLocaleDateString('cs-CZ')}
                            {priceRecord.fetch_status === 'manual' && <span className="text-yellow-600 ml-0.5">✎</span>}
                          </p>
                        )}
                      </div>

                      {/* Market badge */}
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${item.market === 'CZ' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                        {item.market === 'CZ' ? '🇨🇿' : '🇸🇰'}
                      </span>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button onClick={() => handleRefreshUrl(item.url)} title="Znovu načíst"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition">
                          <RefreshCw size={13} />
                        </button>
                        <button
                          onClick={() => { setEditingPriceId(isEditing ? null : (priceRecord?.id ?? item.url)); setManualPriceInput(priceRecord?.price ? String(priceRecord.price) : '') }}
                          title="Zadat ručně"
                          className={`p-1.5 rounded-lg transition ${isEditing ? 'text-blue-600 bg-white' : 'text-gray-400 hover:text-blue-600 hover:bg-white'}`}>
                          <Edit2 size={13} />
                        </button>
                        {priceRecord && (
                          <button onClick={() => handleToggleHistory(priceRecord.id)} title="Historie"
                            className={`p-1.5 rounded-lg transition ${isHistoryOpen ? 'text-blue-600 bg-white' : 'text-gray-400 hover:text-blue-600 hover:bg-white'}`}>
                            {isHistoryOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                        )}
                        {priceRecord && (
                          <button
                            onClick={() => handleShowVariantPicker(priceRecord.id, item.url)}
                            title="Nastavit variantu"
                            className={`p-1.5 rounded-lg transition text-[10px] font-bold ${variantPickerOpenId === priceRecord.id ? 'text-violet-600 bg-white' : 'text-gray-400 hover:text-violet-500 hover:bg-white'}`}>
                            <Scale size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => { setEditingUrlItem(editingUrlItem === item.url ? null : item.url); setEditingUrlInput(item.url) }}
                          title="Změnit URL"
                          className={`p-1.5 rounded-lg transition ${editingUrlItem === item.url ? 'text-orange-600 bg-white' : 'text-gray-400 hover:text-orange-500 hover:bg-white'}`}>
                          <Link2 size={13} />
                        </button>
                        <button onClick={() => removeUrlMutation.mutate(item.url)} title="Odebrat"
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-white rounded-lg transition">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Error */}
                    {priceRecord?.fetch_error && priceRecord.fetch_status === 'error' && (
                      <p className="px-4 pb-2 text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle size={10} /> {priceRecord.fetch_error}
                      </p>
                    )}

                    {/* Variant picker for existing competitor price records */}
                    {priceRecord && variantPickerOpenId === priceRecord.id && (
                      <div className="px-4 pb-3 pt-2 border-t border-violet-100 bg-violet-50">
                        <p className="text-xs font-semibold text-violet-700 mb-2 flex items-center gap-1">
                          <Scale size={11} /> Vyber variantu produktu
                        </p>
                        {variantPickerLoading[priceRecord.id] ? (
                          <p className="text-xs text-violet-500 animate-pulse">Načítám varianty ze stránky...</p>
                        ) : variantPickerData[priceRecord.id]?.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            <button
                              onClick={() => handleSaveVariantLabel(priceRecord.id, null)}
                              disabled={variantPickerSaving[priceRecord.id]}
                              className={`text-xs px-2 py-1 rounded-full border font-medium transition ${
                                !priceRecord.variant_label
                                  ? 'bg-violet-600 text-white border-violet-600'
                                  : 'bg-white text-gray-600 border-gray-300 hover:border-violet-400 hover:text-violet-600'
                              }`}>
                              Celý produkt
                            </button>
                            {variantPickerData[priceRecord.id].map((v, i) => (
                              <button
                                key={i}
                                onClick={() => handleSaveVariantLabel(priceRecord.id, v.label)}
                                disabled={variantPickerSaving[priceRecord.id]}
                                className={`text-xs px-2 py-1 rounded-full border font-medium transition ${
                                  priceRecord.variant_label === v.label
                                    ? 'bg-violet-600 text-white border-violet-600'
                                    : 'bg-white text-gray-600 border-gray-300 hover:border-violet-400 hover:text-violet-600'
                                }`}>
                                {v.label}
                                {v.price != null && (
                                  <span className="ml-1 font-bold">
                                    {v.price.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {priceRecord.currency}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 mb-2">
                            Žádné varianty nenalezeny. Produkt je pravděpodobně bez variant.
                          </p>
                        )}
                        <button
                          onClick={() => setVariantPickerOpenId(null)}
                          className="text-xs text-gray-400 hover:text-gray-600">
                          Zavřít
                        </button>
                      </div>
                    )}

                    {/* Edit URL */}
                    {editingUrlItem === item.url && (
                      <div className="px-4 pb-3 pt-2 border-t border-orange-100 bg-orange-50 flex items-end gap-2">
                        <div className="flex-1">
                          <label className="text-xs text-orange-700 font-medium">Nová URL produktu konkurenta</label>
                          <input
                            type="url"
                            value={editingUrlInput}
                            onChange={e => setEditingUrlInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSaveEditedUrl(item.url, item); if (e.key === 'Escape') setEditingUrlItem(null) }}
                            className="mt-1 w-full border border-orange-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                            placeholder="https://..."
                            autoFocus
                          />
                        </div>
                        <button
                          onClick={() => handleSaveEditedUrl(item.url, item)}
                          disabled={savingUrl}
                          className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50">
                          {savingUrl ? '...' : 'Uložit'}
                        </button>
                        <button onClick={() => setEditingUrlItem(null)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                          <X size={14} />
                        </button>
                      </div>
                    )}

                    {/* Manual price edit */}
                    {isEditing && (
                      <div className="px-4 pb-3 pt-2 border-t border-gray-200 bg-white flex items-end gap-2">
                        <div className="flex-1">
                          <label className="text-xs text-gray-600 font-medium">Cena s DPH (ruční zadání)</label>
                          <input type="text" value={manualPriceInput}
                            onChange={(e) => setManualPriceInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveManualPrice(priceRecord?.id ?? '')}
                            placeholder="299.00" autoFocus
                            className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <button onClick={() => handleSaveManualPrice(priceRecord?.id ?? '')} disabled={!priceRecord}
                          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs disabled:opacity-50">
                          <Save size={11} /> Uložit
                        </button>
                        <button onClick={() => setEditingPriceId(null)} className="p-2 text-gray-400 hover:text-gray-600">
                          <X size={13} />
                        </button>
                      </div>
                    )}

                    {/* Price history */}
                    {isHistoryOpen && (
                      <div className="border-t border-gray-200 bg-white px-4 py-3">
                        <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                          <Clock size={11} /> Historie cen
                        </p>
                        {history.length === 0 ? (
                          <p className="text-xs text-gray-400">Zatím žádná historie.</p>
                        ) : (
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {history.map((h, i) => (
                              <div key={i} className="flex items-center justify-between text-xs py-0.5">
                                <span className="text-gray-400">{new Date(h.recorded_at).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                                <span className="font-semibold text-gray-700">{Number(h.price).toLocaleString('cs-CZ')} CZK</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ── FULL-WIDTH PRICE HISTORY ────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <TrendingUp size={15} className="text-gray-500" />
          <h2 className="font-semibold text-gray-900">Vývoj cen</h2>
          {allPrices.length > 0 && (
            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{allPrices.filter(p => p.market === activeMarket).length} záznamů · {activeMarket}</span>
          )}
        </div>

        {(() => {
          // Filtruj cenovou historii dle aktivního trhu
          const marketPrices = allPrices
            .filter(p => p.market === activeMarket)
            .slice(0, 10)
          const otherMarkets = [...new Set(allPrices.filter(p => p.market !== activeMarket).map(p => p.market))]

          if (allPrices.length === 0) return (
            <div className="text-center py-10">
              <TrendingUp size={32} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">Zatím žádná historie cen.</p>
              <p className="text-xs text-gray-400 mt-1">Změny cen se budou zobrazovat zde.</p>
            </div>
          )

          if (marketPrices.length === 0) return (
            <div className="text-center py-10">
              <p className="text-sm text-gray-400">Žádná cenová historie pro trh <strong>{activeMarket}</strong>.</p>
              {otherMarkets.length > 0 && (
                <p className="text-xs text-gray-400 mt-1">Historie existuje pro: {otherMarkets.join(', ')}</p>
              )}
            </div>
          )

          const fmtP = (v: number, cur: string) => v.toLocaleString(
            cur === 'EUR' ? 'sk-SK' : cur === 'HUF' ? 'hu-HU' : 'cs-CZ',
            { minimumFractionDigits: cur === 'CZK' ? 0 : 2, maximumFractionDigits: cur === 'CZK' ? 0 : 2 }
          )

          return (
            <div className="p-5">
              {/* Mini bar chart — jen pro aktivní trh */}
              {(() => {
                const maxP = Math.max(...marketPrices.map(p => Number(p.current_price)))
                const minP = Math.min(...marketPrices.map(p => Number(p.current_price)))
                const range = maxP - minP || 1
                return (
                  <div className="flex items-end gap-1.5 h-16 mb-4">
                    {[...marketPrices].reverse().map((p, i) => {
                      const h = Math.max(((Number(p.current_price) - minP) / range) * 100, 8)
                      const isLast = i === marketPrices.length - 1
                      return (
                        <div key={p.id} className="flex-1 flex flex-col items-center justify-end gap-1 group relative">
                          <div className="absolute bottom-full mb-1 hidden group-hover:flex bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                            {fmtP(Number(p.current_price), p.currency)} {p.currency} · {new Date(p.changed_at).toLocaleDateString('cs-CZ')}
                          </div>
                          <div className="w-full rounded-t transition"
                            style={{ height: `${h}%`, backgroundColor: isLast ? '#2563eb' : '#bfdbfe' }} />
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* Table — jen pro aktivní trh */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-xs font-medium text-gray-400">Datum</th>
                      <th className="text-right py-2 text-xs font-medium text-gray-400">Cena ({activeCurrency})</th>
                      <th className="text-right py-2 text-xs font-medium text-gray-400">Přeškrtnutá</th>
                      <th className="text-right py-2 text-xs font-medium text-gray-400">Trh</th>
                      <th className="text-right py-2 text-xs font-medium text-gray-400">Změna</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketPrices.map((p, i) => {
                      // Změna pouze vůči předchozímu záznamu STEJNÉHO trhu
                      const prev = marketPrices[i + 1]
                      const diff = prev ? Number(p.current_price) - Number(prev.current_price) : null
                      return (
                        <tr key={p.id} className={`border-b border-gray-50 last:border-0 ${i === 0 ? 'bg-blue-50' : ''}`}>
                          <td className="py-2 text-gray-500">{new Date(p.changed_at).toLocaleDateString('cs-CZ')}</td>
                          <td className="py-2 text-right font-semibold text-gray-900">
                            {fmtP(Number(p.current_price), p.currency)} {p.currency}
                          </td>
                          <td className="py-2 text-right text-gray-400 line-through">
                            {p.old_price ? `${fmtP(Number(p.old_price), p.currency)} ${p.currency}` : '—'}
                          </td>
                          <td className="py-2 text-right">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              p.market === 'CZ' ? 'bg-blue-50 text-blue-600' :
                              p.market === 'SK' ? 'bg-purple-50 text-purple-600' : 'bg-gray-100 text-gray-600'
                            }`}>{MARKET_FLAG[p.market] ?? ''} {p.market}</span>
                          </td>
                          <td className="py-2 text-right">
                            {diff != null && diff !== 0 ? (
                              <span className={`text-xs font-medium ${diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {diff > 0 ? '+' : ''}{fmtP(diff, p.currency)} {p.currency}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Odkaz na ostatní trhy */}
              {otherMarkets.length > 0 && (
                <p className="text-xs text-gray-400 mt-3">
                  Historie ostatních trhů: {otherMarkets.map(m => (
                    <button key={m} onClick={() => setViewMarket(m)}
                      className="ml-1 underline hover:text-gray-600">{m}</button>
                  ))}
                </p>
              )}
            </div>
          )
        })()}
      </div>

      {/* ── CONFIRMED MATCHES (Schválené shody s konkurencí) ──────────── */}
      <ConfirmedMatchesSection productId={id!} />

    </div>
  )
}
