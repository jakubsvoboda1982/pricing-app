import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle, XCircle, ExternalLink, ChevronDown, ChevronUp,
  RefreshCw, AlertCircle, Search, Filter, Package, Zap, BarChart2,
  ShoppingCart, Scale,
} from 'lucide-react'
import { apiClient } from '@/api/client'

// ── Types ──────────────────────────────────────────────────────────────────

interface ScoringBreakdown {
  processing_match: number
  flavor_match: number
  weight_match: number
  title_similarity: number
  brand_relevance: number
  packaging_similarity: number
  structured_data_bonus: number
  unit_price_bonus: number
  penalties: number
  final_score: number
  grade: string
  is_hard_reject: boolean
  hard_reject_reason?: string
  reasons: string[]
}

interface Match {
  id: string
  product_id: string
  product_name: string | null
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
  scoring_breakdown: ScoringBreakdown | null
  approved_at: string | null
  rejection_reason: string | null
  notes: string | null
  is_active: boolean
  last_price_check_at: string | null
  created_at: string | null
}

interface MatchStats {
  proposed: number
  auto_approved: number
  manually_approved: number
  rejected: number
  inactive: number
  total: number
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, dec = 2) {
  if (n == null) return '—'
  return n.toLocaleString('cs-CZ', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function gradeBadge(grade: string | null) {
  if (!grade) return null
  const styles: Record<string, string> = {
    A: 'bg-green-100 text-green-800 border-green-200',
    B: 'bg-blue-100 text-blue-800 border-blue-200',
    C: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    X: 'bg-red-100 text-red-800 border-red-200',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${styles[grade] ?? styles.X}`}>
      {grade}
    </span>
  )
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    proposed:          { label: 'Navrženo',    cls: 'bg-yellow-100 text-yellow-800' },
    auto_approved:     { label: 'Auto ✓',      cls: 'bg-blue-100 text-blue-800' },
    manually_approved: { label: 'Schváleno ✓', cls: 'bg-green-100 text-green-800' },
    rejected:          { label: 'Zamítnuto',   cls: 'bg-red-100 text-red-800' },
    inactive:          { label: 'Neaktivní',   cls: 'bg-gray-100 text-gray-600' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.cls}`}>{s.label}</span>
}

function ScoreBar({ pts, max, label }: { pts: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, (Math.max(0, pts) / max) * 100) : 0
  const color = pts >= max ? '#16a34a' : pts > 0 ? '#ca8a04' : '#d1d5db'
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-36 flex-shrink-0 truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className={`text-xs font-semibold w-10 text-right flex-shrink-0 ${pts >= max ? 'text-green-600' : pts > 0 ? 'text-yellow-600' : 'text-gray-300'}`}>
        {pts < 0 ? pts : `${pts}/${max}`}
      </span>
    </div>
  )
}

function ScoreDonut({ score, grade }: { score: number; grade: string }) {
  const pct = Math.min(Math.max(score, 0), 100)
  const color = grade === 'A' ? '#16a34a' : grade === 'B' ? '#2563eb' : grade === 'C' ? '#ca8a04' : '#dc2626'
  const r = 24; const cx = 32; const cy = 32
  const toRad = (d: number) => (d * Math.PI) / 180
  const ax = (a: number) => cx + r * Math.cos(toRad(a - 90))
  const ay = (a: number) => cy + r * Math.sin(toRad(a - 90))
  const deg = (pct / 100) * 360
  const large = deg > 180 ? 1 : 0
  const trackPath = `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.001} ${cy - r}`
  const fillPath = pct > 0
    ? `M ${cx} ${cy - r} A ${r} ${r} 0 ${large} 1 ${ax(deg)} ${ay(deg)}`
    : ''
  return (
    <svg viewBox="0 0 64 64" className="w-14 h-14 flex-shrink-0">
      <path d={trackPath} fill="none" stroke="#e5e7eb" strokeWidth="6" strokeLinecap="round" />
      {fillPath && <path d={fillPath} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" />}
      <text x={cx} y={cx + 4} textAnchor="middle" fontSize="13" fontWeight="700" fill={color}>{Math.round(score)}</text>
    </svg>
  )
}

// ── Reject Modal ───────────────────────────────────────────────────────────

function RejectModal({
  matchId,
  onClose,
  onDone,
}: { matchId: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const QUICK = [
    'Jiný produkt – jiná gramáž',
    'Jiný produkt – jiný ingredient',
    'Jiný produkt – jiné zpracování',
    'Nedostupný produkt',
    'Nesprávná cena (akce/chyba)',
    'Duplikát jiného matche',
  ]

  const handleSubmit = async () => {
    if (!reason.trim()) return
    setLoading(true)
    try {
      await apiClient.rejectMatch(matchId, reason, notes || undefined)
      onDone()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <XCircle size={18} className="text-red-500" /> Zamítnout match
        </h3>
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-medium">Rychlý důvod:</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map(q => (
              <button key={q} onClick={() => setReason(q)}
                className={`text-xs px-2 py-1 rounded border transition ${reason === q ? 'bg-red-50 border-red-300 text-red-700' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}>
                {q}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Důvod zamítnutí *</label>
          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            placeholder="Zadej nebo vyber důvod…"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Poznámka (volitelné)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-200"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
            Zrušit
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason.trim() || loading}
            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
            {loading && <RefreshCw size={13} className="animate-spin" />}
            Zamítnout
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Match Card ─────────────────────────────────────────────────────────────

function MatchCard({ match, onReload }: { match: Match; onReload: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [approving, setApproving] = useState(false)

  const bd = match.scoring_breakdown
  const isPending = match.match_status === 'proposed' || match.match_status === 'auto_approved'
  const isApproved = match.match_status === 'manually_approved' || match.match_status === 'auto_approved'

  const handleApprove = async () => {
    setApproving(true)
    try {
      await apiClient.approveMatch(match.id)
      onReload()
    } finally {
      setApproving(false)
    }
  }

  const handleRejectDone = () => {
    setRejectOpen(false)
    onReload()
  }

  const availabilityChip = match.candidate_available === true
    ? <span className="text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded">Skladem</span>
    : match.candidate_available === false
    ? <span className="text-xs text-red-700 bg-red-50 px-1.5 py-0.5 rounded">Vyprodáno</span>
    : null

  return (
    <>
      {rejectOpen && (
        <RejectModal
          matchId={match.id}
          onClose={() => setRejectOpen(false)}
          onDone={handleRejectDone}
        />
      )}

      <div className={`bg-white border rounded-xl overflow-hidden transition-shadow hover:shadow-sm ${
        match.match_status === 'rejected' ? 'border-red-100 opacity-60'
        : match.match_status === 'manually_approved' ? 'border-green-200'
        : match.match_status === 'auto_approved' ? 'border-blue-200'
        : 'border-gray-200'
      }`}>

        {/* Main row */}
        <div className="px-4 py-3 flex items-center gap-3">

          {/* Score donut */}
          {bd && (
            <ScoreDonut score={bd.final_score} grade={match.match_grade ?? 'X'} />
          )}

          {/* Names */}
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => navigate(`/products/${match.product_id}`)}
                className="text-sm font-semibold text-gray-900 hover:text-blue-700 truncate max-w-xs transition">
                {match.product_name ?? 'Produkt'}
              </button>
              <span className="text-gray-300 text-xs">↔</span>
              <span className="text-sm text-gray-600 truncate max-w-xs">{match.candidate_name ?? '—'}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
              <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                {match.competitor_name ?? '—'}
              </span>
              {match.candidate_price != null && (
                <span className="font-medium text-gray-700">
                  {fmt(match.candidate_price, 0)} CZK
                </span>
              )}
              {match.candidate_weight_g != null && (
                <span>{match.candidate_weight_g >= 1000
                  ? `${(match.candidate_weight_g / 1000).toFixed(match.candidate_weight_g % 1000 === 0 ? 0 : 1)} kg`
                  : `${match.candidate_weight_g} g`}
                </span>
              )}
              {availabilityChip}
              {match.candidate_url && (
                <a href={match.candidate_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-0.5 text-blue-500 hover:text-blue-700 transition">
                  <ExternalLink size={11} /> odkaz
                </a>
              )}
            </div>
          </div>

          {/* Badges + actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {gradeBadge(match.match_grade)}
            {statusBadge(match.match_status)}

            {isPending && match.match_status !== 'rejected' && (
              <>
                <button
                  onClick={handleApprove}
                  disabled={approving || isApproved}
                  title="Schválit"
                  className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition disabled:opacity-40">
                  {approving
                    ? <RefreshCw size={16} className="animate-spin" />
                    : <CheckCircle size={16} />}
                </button>
                <button
                  onClick={() => setRejectOpen(true)}
                  title="Zamítnout"
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition">
                  <XCircle size={16} />
                </button>
              </>
            )}

            <button
              onClick={() => setExpanded(v => !v)}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition">
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        {/* Expanded scoring breakdown */}
        {expanded && bd && (
          <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
            <div className="flex items-start gap-4">
              {/* Score bars */}
              <div className="flex-1 space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Scoring breakdown</p>
                <ScoreBar pts={bd.processing_match}        max={25} label="Zpracování (processing)" />
                <ScoreBar pts={bd.flavor_match}            max={20} label="Chuť / charakter" />
                <ScoreBar pts={bd.weight_match}            max={20} label="Gramáž" />
                <ScoreBar pts={bd.title_similarity}        max={10} label="Podobnost názvu" />
                <ScoreBar pts={bd.brand_relevance}         max={5}  label="Brand shoda" />
                <ScoreBar pts={bd.packaging_similarity}    max={5}  label="Balení" />
                <ScoreBar pts={bd.structured_data_bonus}  max={5}  label="Strukturovaná data" />
                <ScoreBar pts={bd.unit_price_bonus}        max={5}  label="Cena za kg" />
                {bd.penalties < 0 && (
                  <ScoreBar pts={bd.penalties} max={0} label="Penalizace" />
                )}
                <div className="pt-1.5 border-t border-gray-200 flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-700 flex-1">Celkové skóre</span>
                  <span className="text-sm font-bold" style={{
                    color: bd.grade === 'A' ? '#16a34a' : bd.grade === 'B' ? '#2563eb' : bd.grade === 'C' ? '#ca8a04' : '#dc2626'
                  }}>
                    {Math.round(bd.final_score)} / 100
                  </span>
                  {gradeBadge(bd.grade)}
                </div>
              </div>

              {/* Reasons */}
              <div className="w-52 flex-shrink-0">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Důvody</p>
                <ul className="space-y-1">
                  {bd.reasons.map((r, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                      <span className="text-gray-300 mt-0.5 flex-shrink-0">·</span>
                      {r}
                    </li>
                  ))}
                </ul>
                {match.rejection_reason && (
                  <div className="mt-3 p-2 bg-red-50 rounded border border-red-100">
                    <p className="text-xs font-medium text-red-700">Důvod zamítnutí:</p>
                    <p className="text-xs text-red-600 mt-0.5">{match.rejection_reason}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function MatchReviewPage() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('proposed')
  const [searchText, setSearchText] = useState('')
  const [gradeFilter, setGradeFilter] = useState<string>('')

  // Stats
  const { data: stats } = useQuery<MatchStats>({
    queryKey: ['match-stats'],
    queryFn: () => apiClient.getMatchStats(),
    refetchInterval: 15000,
  })

  // Matches
  const { data: matches = [], isLoading, refetch } = useQuery<Match[]>({
    queryKey: ['matches', statusFilter, gradeFilter],
    queryFn: () => apiClient.getMatches({
      status: statusFilter || undefined,
      grade: gradeFilter || undefined,
      limit: 100,
    }),
    refetchInterval: 20000,
  })

  const handleReload = () => {
    refetch()
    qc.invalidateQueries({ queryKey: ['match-stats'] })
  }

  // Client-side search filter
  const filtered = matches.filter(m => {
    if (!searchText) return true
    const q = searchText.toLowerCase()
    return (
      m.product_name?.toLowerCase().includes(q) ||
      m.candidate_name?.toLowerCase().includes(q) ||
      m.competitor_name?.toLowerCase().includes(q)
    )
  })

  const STATUSES = [
    { value: 'proposed',          label: 'Navrženo',        count: stats?.proposed ?? 0 },
    { value: 'auto_approved',     label: 'Auto schváleno',  count: stats?.auto_approved ?? 0 },
    { value: 'manually_approved', label: 'Schváleno',       count: stats?.manually_approved ?? 0 },
    { value: 'rejected',          label: 'Zamítnuto',       count: stats?.rejected ?? 0 },
    { value: '',                  label: 'Vše',             count: stats?.total ?? 0 },
  ]

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Scale size={22} className="text-blue-600" />
            Párovací centrum
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Review navržených matchů mezi vlastními produkty a konkurencí
          </p>
        </div>
        <button
          onClick={handleReload}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition">
          <RefreshCw size={14} /> Obnovit
        </button>
      </div>

      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Čeká na review', val: stats.proposed,          color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200' },
            { label: 'Auto schváleno', val: stats.auto_approved,      color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
            { label: 'Schváleno',      val: stats.manually_approved,  color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
            { label: 'Zamítnuto',      val: stats.rejected,           color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
            { label: 'Celkem',         val: stats.total,              color: 'text-gray-700',   bg: 'bg-white border-gray-200' },
          ].map(s => (
            <div key={s.label} className={`border rounded-xl p-3 ${s.bg}`}>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">

        {/* Status tabs */}
        <div className="flex gap-1 flex-wrap">
          {STATUSES.map(s => (
            <button key={s.value} onClick={() => setStatusFilter(s.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1 ${
                statusFilter === s.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {s.label}
              {s.count > 0 && (
                <span className={`text-xs px-1.5 rounded-full ${statusFilter === s.value ? 'bg-blue-500' : 'bg-gray-200 text-gray-600'}`}>
                  {s.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-gray-200" />

        {/* Grade filter */}
        <div className="flex gap-1">
          {['', 'A', 'B', 'C'].map(g => (
            <button key={g} onClick={() => setGradeFilter(g)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                gradeFilter === g
                  ? g === 'A' ? 'bg-green-600 text-white'
                  : g === 'B' ? 'bg-blue-600 text-white'
                  : g === 'C' ? 'bg-yellow-500 text-white'
                  : 'bg-blue-600 text-white'
                  : g === 'A' ? 'bg-green-50 text-green-700 hover:bg-green-100'
                  : g === 'B' ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                  : g === 'C' ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {g === '' ? 'Vše grade' : `Grade ${g}`}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-gray-200" />

        {/* Search */}
        <div className="relative flex-1 min-w-40">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Hledat produkt / konkurent…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
      </div>

      {/* Match list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <RefreshCw size={20} className="animate-spin mr-2" /> Načítám…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center py-16 text-center">
          <Scale size={36} className="text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium">Žádné matche</p>
          <p className="text-sm text-gray-400 mt-1">
            {statusFilter === 'proposed'
              ? 'Zatím nejsou žádné navržené matche. Spusťte pipeline přes detail produktu nebo záložku Konkurence.'
              : 'Žádné záznamy pro tento filtr.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 px-1">{filtered.length} záznamů</p>
          {filtered.map(m => (
            <MatchCard key={m.id} match={m} onReload={handleReload} />
          ))}
        </div>
      )}
    </div>
  )
}
