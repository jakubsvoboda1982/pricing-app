import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Edit2, Check, X, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { apiClient } from '@/api/client'

const MONTH_NAMES = [
  'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
  'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec',
]
const MONTH_SHORT = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čvn', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro']

interface CalendarMonth {
  month: number
  month_name: string
  multiplier: number
  season_type: string
  name: string | null
  rule_id: string | null
}

interface Rule {
  id: string
  month: number
  month_name: string
  price_multiplier: number
  season_type: string
  name: string | null
  description: string | null
  is_active: boolean
  category: string | null
}

type SeasonType = 'peak' | 'off-peak' | 'normal'
const SEASON_TYPE_OPTS: { value: SeasonType; label: string; color: string }[] = [
  { value: 'peak',     label: 'Sezóna (peak)',  color: 'text-green-700 bg-green-100 border-green-200' },
  { value: 'normal',   label: 'Normál',         color: 'text-gray-700 bg-gray-100 border-gray-200'   },
  { value: 'off-peak', label: 'Mimo sezónu',    color: 'text-blue-700 bg-blue-100 border-blue-200'   },
]

function multiplierColor(m: number) {
  if (m > 1.15) return 'bg-green-500'
  if (m > 1.05) return 'bg-green-300'
  if (m < 0.85) return 'bg-red-500'
  if (m < 0.95) return 'bg-red-300'
  return 'bg-gray-300'
}

function multiplierBg(m: number) {
  if (m > 1.1) return 'bg-green-50 border-green-200'
  if (m > 1.0) return 'bg-teal-50 border-teal-200'
  if (m < 0.9) return 'bg-red-50 border-red-200'
  if (m < 1.0) return 'bg-orange-50 border-orange-200'
  return 'bg-white border-gray-200'
}

function multiplierBadge(m: number) {
  if (m > 1.0) return `+${((m - 1) * 100).toFixed(0)} %`
  if (m < 1.0) return `−${((1 - m) * 100).toFixed(0)} %`
  return '0 %'
}

export default function SeasonalityPage() {
  const qc = useQueryClient()
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)

  // Form state for editing / creating
  const [formMultiplier, setFormMultiplier] = useState(1.0)
  const [formSeasonType, setFormSeasonType] = useState<SeasonType>('normal')
  const [formName, setFormName] = useState('')
  const [formMonth, setFormMonth] = useState(1)

  // Fetch calendar
  const { data: calendar, isLoading: calLoading } = useQuery<Record<string, CalendarMonth>>({
    queryKey: ['seasonalityCalendar'],
    queryFn: () => apiClient.getSeasonalityCalendar(),
  })

  // Fetch rules list
  const { data: rules = [], isLoading: rulesLoading } = useQuery<Rule[]>({
    queryKey: ['seasonalityRules'],
    queryFn: () => apiClient.listSeasonalityRules(),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.createSeasonalityRule(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seasonalityCalendar'] })
      qc.invalidateQueries({ queryKey: ['seasonalityRules'] })
      resetForm()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiClient.updateSeasonalityRule(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seasonalityCalendar'] })
      qc.invalidateQueries({ queryKey: ['seasonalityRules'] })
      setEditingRuleId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteSeasonalityRule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seasonalityCalendar'] })
      qc.invalidateQueries({ queryKey: ['seasonalityRules'] })
    },
  })

  const resetForm = () => {
    setFormMultiplier(1.0)
    setFormSeasonType('normal')
    setFormName('')
    setSelectedMonth(null)
  }

  const openCreateForMonth = (month: number) => {
    const existing = rules.find(r => r.month === month)
    if (existing) {
      setEditingRuleId(existing.id)
      setFormMultiplier(existing.price_multiplier)
      setFormSeasonType(existing.season_type as SeasonType)
      setFormName(existing.name || '')
    } else {
      setEditingRuleId(null)
      setFormMultiplier(1.0)
      setFormSeasonType('normal')
      setFormName('')
    }
    setFormMonth(month)
    setSelectedMonth(month)
  }

  const handleSave = () => {
    if (editingRuleId) {
      updateMutation.mutate({
        id: editingRuleId,
        data: { price_multiplier: formMultiplier, season_type: formSeasonType, name: formName },
      })
    } else {
      createMutation.mutate({
        month: formMonth,
        price_multiplier: formMultiplier,
        season_type: formSeasonType,
        name: formName || null,
      })
    }
  }

  const calMonths = calendar ? Object.values(calendar) : []

  // Stats
  const peakCount  = calMonths.filter(m => m.multiplier > 1.05).length
  const lowCount   = calMonths.filter(m => m.multiplier < 0.95).length
  const ruleCount  = rules.length
  const avgMult    = calMonths.length
    ? calMonths.reduce((s, m) => s + m.multiplier, 0) / calMonths.length
    : 1.0

  const isLoading = calLoading || rulesLoading

  return (
    <div className="space-y-5 max-w-5xl">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sezónní engine</h1>
        <p className="text-sm text-gray-400 mt-0.5">Nastav cenové multiplikátory pro každý měsíc v roce</p>
      </div>

      {/* ── KPI STRIP ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Aktivní pravidla</p>
          <p className="text-2xl font-bold text-gray-900">{ruleCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">z 12 měsíců</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Peak měsíce</p>
          <p className="text-2xl font-bold text-green-700">{peakCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">multiplikátor &gt; 1.05</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Mimo sezónu</p>
          <p className="text-2xl font-bold text-blue-700">{lowCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">multiplikátor &lt; 0.95</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Průměrný mult.</p>
          <p className="text-2xl font-bold text-gray-900">{avgMult.toFixed(2)}×</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {multiplierBadge(avgMult)} vs. základ
          </p>
        </div>
      </div>

      {/* ── MAIN GRID ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Calendar */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">Roční přehled</p>

          {isLoading ? (
            <div className="h-48 flex items-center justify-center text-sm text-gray-400">Načítám…</div>
          ) : (
            <>
              {/* Bar chart */}
              <div className="flex items-end gap-1.5 h-24 mb-5 bg-gray-50 rounded-lg px-3 pt-2 pb-1">
                {MONTH_SHORT.map((short, idx) => {
                  const m = idx + 1
                  const cal = calMonths.find(c => c.month === m)
                  const mult = cal?.multiplier ?? 1.0
                  const heightPct = Math.min(100, Math.max(10, mult * 60))
                  return (
                    <button key={m}
                      onClick={() => openCreateForMonth(m)}
                      className="flex-1 flex flex-col items-center gap-0.5 group"
                      title={`${MONTH_NAMES[idx]}: ${mult.toFixed(2)}×`}
                    >
                      <div className={`w-full rounded-t transition group-hover:opacity-80 ${
                        selectedMonth === m ? 'ring-2 ring-blue-400' : ''
                      } ${multiplierColor(mult)}`}
                        style={{ height: `${heightPct}%` }} />
                      <span className="text-[9px] text-gray-400 group-hover:text-gray-600">{short}</span>
                    </button>
                  )
                })}
              </div>

              {/* Month grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {MONTH_NAMES.map((name, idx) => {
                  const m = idx + 1
                  const cal = calMonths.find(c => c.month === m)
                  const mult = cal?.multiplier ?? 1.0
                  const hasRule = !!cal?.rule_id
                  const isSelected = selectedMonth === m

                  return (
                    <button key={m}
                      onClick={() => openCreateForMonth(m)}
                      className={`border rounded-lg p-3 text-left transition ${
                        isSelected ? 'border-blue-400 shadow-sm ring-2 ring-blue-200' : `${multiplierBg(mult)} hover:opacity-90`
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-700">{name}</span>
                        {hasRule ? <Edit2 size={10} className="text-gray-400" /> : <Plus size={10} className="text-gray-300" />}
                      </div>
                      <div className="flex items-center gap-1">
                        {mult > 1 ? <TrendingUp size={11} className="text-green-600" />
                          : mult < 1 ? <TrendingDown size={11} className="text-red-500" />
                          : <Minus size={11} className="text-gray-400" />}
                        <span className={`text-xs font-bold ${
                          mult > 1.05 ? 'text-green-700' : mult < 0.95 ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {mult.toFixed(2)}×
                        </span>
                      </div>
                      {cal?.name && (
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">{cal.name}</p>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Editor panel */}
        <div className="space-y-4">
          {selectedMonth ? (
            <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-gray-800">
                  {MONTH_NAMES[selectedMonth - 1]}
                  {editingRuleId && <span className="ml-1 text-xs text-blue-600">(upravuji)</span>}
                </p>
                <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              </div>

              {/* Multiplier */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Multiplikátor</label>
                  <span className={`text-sm font-bold ${
                    formMultiplier > 1 ? 'text-green-700' : formMultiplier < 1 ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {formMultiplier.toFixed(2)}× ({multiplierBadge(formMultiplier)})
                  </span>
                </div>
                <input type="range" min={0.5} max={2.0} step={0.05} value={formMultiplier}
                  onChange={e => setFormMultiplier(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0.5× (−50 %)</span><span>2.0× (+100 %)</span>
                </div>
                <div className="flex gap-1 mt-2">
                  {[0.8, 0.9, 1.0, 1.1, 1.2, 1.3].map(v => (
                    <button key={v} onClick={() => setFormMultiplier(v)}
                      className={`flex-1 text-xs py-1 rounded border transition ${
                        formMultiplier === v ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}>
                      {v.toFixed(1)}×
                    </button>
                  ))}
                </div>
              </div>

              {/* Season type */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Typ sezóny</label>
                <div className="flex flex-col gap-1.5">
                  {SEASON_TYPE_OPTS.map(opt => (
                    <button key={opt.value} onClick={() => setFormSeasonType(opt.value)}
                      className={`text-left px-3 py-2 rounded-lg border text-xs font-medium transition ${
                        formSeasonType === opt.value ? opt.color : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div className="mb-5">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Název (volitelné)</label>
                <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                  placeholder="Např. Black Friday, Léto…"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Buttons */}
              <div className="flex gap-2">
                <button onClick={handleSave}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2 rounded-lg text-sm font-medium transition">
                  <Check size={14} />
                  {editingRuleId ? 'Uložit změny' : 'Přidat pravidlo'}
                </button>
                {editingRuleId && (
                  <button onClick={() => { deleteMutation.mutate(editingRuleId); resetForm() }}
                    disabled={deleteMutation.isPending}
                    className="flex items-center gap-1 border border-red-200 text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg text-sm transition">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              {(createMutation.isError || updateMutation.isError) && (
                <p className="text-xs text-red-600 mt-2">
                  {(createMutation.error as any)?.message || (updateMutation.error as any)?.message || 'Chyba'}
                </p>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
              <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <Plus size={18} className="text-blue-400" />
              </div>
              <p className="text-sm font-medium text-gray-700">Klikni na měsíc</p>
              <p className="text-xs text-gray-400 mt-1">Nastav multiplikátor a typ sezóny</p>
            </div>
          )}

          {/* Rules list */}
          {rules.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Nastavená pravidla</p>
              <div className="space-y-1.5">
                {rules.map(rule => (
                  <div key={rule.id}
                    onClick={() => openCreateForMonth(rule.month)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition border ${
                      selectedMonth === rule.month ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50 border-transparent'
                    }`}>
                    <div>
                      <span className="text-xs font-semibold text-gray-700">{MONTH_NAMES[rule.month - 1]}</span>
                      {rule.name && <span className="text-xs text-gray-400 ml-1.5">{rule.name}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${
                        rule.price_multiplier > 1 ? 'text-green-600' : rule.price_multiplier < 1 ? 'text-red-500' : 'text-gray-500'
                      }`}>
                        {rule.price_multiplier.toFixed(2)}×
                      </span>
                      <button onClick={e => { e.stopPropagation(); deleteMutation.mutate(rule.id) }}
                        className="text-gray-300 hover:text-red-500 transition">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
