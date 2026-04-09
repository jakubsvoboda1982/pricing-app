import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Check, X, TrendingUp, TrendingDown, Minus, Edit2, Info } from 'lucide-react'
import { apiClient } from '@/api/client'

const MONTH_NAMES = [
  'Leden','Únor','Březen','Duben','Květen','Červen',
  'Červenec','Srpen','Září','Říjen','Listopad','Prosinec',
]
const MONTH_SHORT = ['Led','Úno','Bře','Dub','Kvě','Čvn','Čvc','Srp','Zář','Říj','Lis','Pro']

interface CalendarEntry {
  month: number; month_name: string
  multiplier: number; season_type: string
  name: string | null; rule_id: string | null
}

interface Rule {
  id: string; month: number; month_name: string
  price_multiplier: number; season_type: string
  name: string | null; description: string | null
  is_active: boolean; category: string | null
}

type SeasonType = 'peak' | 'normal' | 'off-peak'

const SEASON_OPTS: { value: SeasonType; label: string; emoji: string; bar: string; card: string }[] = [
  { value: 'peak',     label: 'Sezóna (peak)',   emoji: '🔥', bar: 'bg-emerald-500', card: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
  { value: 'normal',   label: 'Normální období', emoji: '📊', bar: 'bg-gray-300',    card: 'bg-gray-50 border-gray-200 text-gray-700'        },
  { value: 'off-peak', label: 'Mimo sezónu',     emoji: '❄️', bar: 'bg-blue-400',    card: 'bg-blue-50 border-blue-200 text-blue-800'        },
]

function getBar(m: number, type: string) {
  if (type === 'peak') return 'bg-emerald-500'
  if (type === 'off-peak') return 'bg-blue-400'
  if (m > 1.1)  return 'bg-emerald-400'
  if (m > 1.0)  return 'bg-teal-300'
  if (m < 0.9)  return 'bg-red-400'
  if (m < 1.0)  return 'bg-orange-300'
  return 'bg-gray-300'
}

function getCard(m: number, type: string) {
  if (type === 'peak')     return 'bg-emerald-50 border-emerald-200'
  if (type === 'off-peak') return 'bg-blue-50 border-blue-200'
  if (m > 1.05) return 'bg-teal-50 border-teal-200'
  if (m < 0.95) return 'bg-red-50 border-red-200'
  return 'bg-white border-gray-200'
}

function MultBadge({ m }: { m: number }) {
  const diff = ((m - 1) * 100)
  if (diff === 0) return <span className="text-gray-400 text-xs font-medium">neutrální</span>
  return (
    <span className={`text-xs font-bold ${diff > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
      {diff > 0 ? '+' : ''}{diff.toFixed(0)} %
    </span>
  )
}

const QUICK_MULTIPLIERS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.5]

export default function SeasonalityPage() {
  const qc = useQueryClient()
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [editRuleId, setEditRuleId] = useState<string | null>(null)
  const [formMult, setFormMult] = useState(1.0)
  const [formType, setFormType] = useState<SeasonType>('normal')
  const [formName, setFormName] = useState('')
  const [formMonth, setFormMonth] = useState(1)
  const [saveError, setSaveError] = useState<string | null>(null)

  const { data: calendar, isLoading: calLoading } = useQuery<Record<string, CalendarEntry>>({
    queryKey: ['seasonalityCalendar'],
    queryFn: () => apiClient.getSeasonalityCalendar(),
  })

  const { data: rules = [], isLoading: rulesLoading } = useQuery<Rule[]>({
    queryKey: ['seasonalityRules'],
    queryFn: () => apiClient.listSeasonalityRules(),
  })

  const createMut = useMutation({
    mutationFn: (d: any) => apiClient.createSeasonalityRule(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seasonalityCalendar'] })
      qc.invalidateQueries({ queryKey: ['seasonalityRules'] })
      closePanel()
    },
    onError: (e: any) => setSaveError(e?.message || 'Chyba'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiClient.updateSeasonalityRule(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seasonalityCalendar'] })
      qc.invalidateQueries({ queryKey: ['seasonalityRules'] })
      closePanel()
    },
    onError: (e: any) => setSaveError(e?.message || 'Chyba'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.deleteSeasonalityRule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seasonalityCalendar'] })
      qc.invalidateQueries({ queryKey: ['seasonalityRules'] })
      closePanel()
    },
  })

  const closePanel = () => {
    setSelectedMonth(null); setEditRuleId(null)
    setFormMult(1.0); setFormType('normal'); setFormName(''); setSaveError(null)
  }

  const openMonth = (m: number) => {
    const existing = rules.find(r => r.month === m)
    if (existing) {
      setEditRuleId(existing.id)
      setFormMult(existing.price_multiplier)
      setFormType(existing.season_type as SeasonType)
      setFormName(existing.name || '')
    } else {
      setEditRuleId(null); setFormMult(1.0); setFormType('normal'); setFormName('')
    }
    setFormMonth(m); setSelectedMonth(m); setSaveError(null)
  }

  const handleSave = () => {
    setSaveError(null)
    if (editRuleId) {
      updateMut.mutate({ id: editRuleId, data: { price_multiplier: formMult, season_type: formType, name: formName || null } })
    } else {
      createMut.mutate({ month: formMonth, price_multiplier: formMult, season_type: formType, name: formName || null })
    }
  }

  const calArr = calendar ? Object.values(calendar) : []
  const peakCount = calArr.filter(m => m.multiplier > 1.05 || m.season_type === 'peak').length
  const lowCount  = calArr.filter(m => m.multiplier < 0.95 || m.season_type === 'off-peak').length
  const activeRules = rules.filter(r => r.is_active)
  const avgMult = calArr.length ? calArr.reduce((s, m) => s + m.multiplier, 0) / calArr.length : 1.0

  const maxMult = Math.max(1.5, ...calArr.map(m => m.multiplier))
  const minMult = Math.min(0.7, ...calArr.map(m => m.multiplier))
  const range = maxMult - minMult || 1

  return (
    <div className="space-y-5 max-w-5xl">

      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sezónní engine</h1>
        <p className="text-sm text-gray-400 mt-0.5">Nastav cenové multiplikátory pro každý měsíc — aktivuje se automaticky</p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Aktivní pravidla', value: activeRules.length, sub: `z 12 měsíců`, cls: 'text-gray-900' },
          { label: 'Peak měsíce 🔥',   value: peakCount,          sub: 'multiplikátor > 1.05', cls: 'text-emerald-700' },
          { label: 'Mimo sezónu ❄️',  value: lowCount,           sub: 'multiplikátor < 0.95', cls: 'text-blue-700' },
          { label: 'Prům. multiplikátor', value: `${avgMult.toFixed(2)}×`, sub: `${((avgMult - 1) * 100) > 0 ? '+' : ''}${((avgMult - 1) * 100).toFixed(0)} % vs. základ`, cls: avgMult > 1 ? 'text-emerald-700' : avgMult < 1 ? 'text-red-600' : 'text-gray-900' },
        ].map(({ label, value, sub, cls }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">{label}</p>
            <p className={`text-2xl font-bold ${cls}`}>{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* MAIN */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Calendar panel */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Roční přehled — klikni na měsíc pro úpravu</p>
            {calLoading && <span className="text-xs text-gray-400">Načítám…</span>}
          </div>

          {/* Bar chart */}
          <div className="flex items-end gap-1 h-20 mb-5 px-1">
            {MONTH_SHORT.map((short, idx) => {
              const m = idx + 1
              const entry = calArr.find(c => c.month === m)
              const mult = entry?.multiplier ?? 1.0
              const type = entry?.season_type ?? 'normal'
              const heightPct = Math.max(8, ((mult - minMult) / range) * 85 + 10)
              const isSelected = selectedMonth === m
              return (
                <button key={m} onClick={() => openMonth(m)}
                  className="flex-1 flex flex-col items-center gap-1 group">
                  <div
                    className={`w-full rounded-t-md transition-all group-hover:opacity-80 ${getBar(mult, type)} ${isSelected ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
                    style={{ height: `${heightPct}%` }}
                    title={`${MONTH_NAMES[idx]}: ${mult.toFixed(2)}×`}
                  />
                  <span className={`text-[9px] transition ${isSelected ? 'text-blue-600 font-bold' : 'text-gray-400 group-hover:text-gray-600'}`}>
                    {short}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {MONTH_NAMES.map((name, idx) => {
              const m = idx + 1
              const entry = calArr.find(c => c.month === m)
              const mult = entry?.multiplier ?? 1.0
              const type = entry?.season_type ?? 'normal'
              const hasRule = !!entry?.rule_id
              const isSelected = selectedMonth === m
              const seasonOpt = SEASON_OPTS.find(s => s.value === type)

              return (
                <button key={m} onClick={() => openMonth(m)}
                  className={`border rounded-xl p-3 text-left transition group ${
                    isSelected
                      ? 'border-blue-400 ring-2 ring-blue-200 bg-blue-50'
                      : `${getCard(mult, type)} hover:shadow-sm hover:scale-[1.02]`
                  }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-700">{name}</span>
                    <span className="text-sm">{seasonOpt?.emoji ?? '📊'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {mult > 1.0 ? <TrendingUp size={11} className="text-emerald-600 flex-shrink-0" />
                      : mult < 1.0 ? <TrendingDown size={11} className="text-red-500 flex-shrink-0" />
                      : <Minus size={11} className="text-gray-400 flex-shrink-0" />}
                    <span className={`text-sm font-bold ${
                      mult > 1.05 ? 'text-emerald-700' : mult < 0.95 ? 'text-red-600' : 'text-gray-600'
                    }`}>{mult.toFixed(2)}×</span>
                  </div>
                  {entry?.name && (
                    <p className="text-[10px] text-gray-400 truncate mt-1">{entry.name}</p>
                  )}
                  {!hasRule && (
                    <p className="text-[10px] text-gray-300 mt-1">+ nastavit</p>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Editor panel */}
        <div className="space-y-3">
          {selectedMonth ? (
            <div className="bg-white border-2 border-blue-300 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-base font-bold text-gray-900">{MONTH_NAMES[selectedMonth - 1]}</p>
                  <p className="text-xs text-blue-500">{editRuleId ? 'Upravuji pravidlo' : 'Nové pravidlo'}</p>
                </div>
                <button onClick={closePanel}
                  className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
                  <X size={15} />
                </button>
              </div>

              {/* Season type */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Typ sezóny</label>
                <div className="grid grid-cols-1 gap-1.5">
                  {SEASON_OPTS.map(opt => (
                    <button key={opt.value} onClick={() => setFormType(opt.value)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition text-left ${
                        formType === opt.value ? opt.card : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}>
                      <span className="text-lg leading-none">{opt.emoji}</span>
                      <span>{opt.label}</span>
                      {formType === opt.value && <Check size={14} className="ml-auto" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Multiplier */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Multiplikátor</label>
                  <div className="text-right">
                    <span className={`text-lg font-bold ${formMult > 1 ? 'text-emerald-700' : formMult < 1 ? 'text-red-600' : 'text-gray-600'}`}>
                      {formMult.toFixed(2)}×
                    </span>
                    <span className="text-xs text-gray-400 ml-1.5">
                      (<MultBadge m={formMult} />)
                    </span>
                  </div>
                </div>
                <input type="range" min={0.5} max={2.0} step={0.05} value={formMult}
                  onChange={e => setFormMult(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600 mb-2"
                />
                {/* Quick buttons */}
                <div className="grid grid-cols-4 gap-1">
                  {QUICK_MULTIPLIERS.map(v => (
                    <button key={v} onClick={() => setFormMult(v)}
                      className={`text-xs py-1.5 rounded-lg border transition font-medium ${
                        Math.abs(formMult - v) < 0.01
                          ? 'bg-blue-600 text-white border-blue-600'
                          : v > 1 ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : v < 1 ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}>
                      {v.toFixed(1)}×
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div className="mb-5">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                  Název <span className="text-gray-300 normal-case">(volitelné)</span>
                </label>
                <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                  placeholder="Např. Black Friday, Vánoce…"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {saveError && (
                <p className="text-xs text-red-600 mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</p>
              )}

              {/* Buttons */}
              <div className="flex gap-2">
                <button onClick={handleSave}
                  disabled={createMut.isPending || updateMut.isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2.5 rounded-xl text-sm font-medium transition">
                  {(createMut.isPending || updateMut.isPending)
                    ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Check size={15} />}
                  {editRuleId ? 'Uložit' : 'Přidat'}
                </button>
                {editRuleId && (
                  <button onClick={() => deleteMut.mutate(editRuleId)}
                    disabled={deleteMut.isPending}
                    className="flex items-center gap-1.5 border border-red-200 text-red-500 hover:bg-red-50 px-4 py-2.5 rounded-xl text-sm transition disabled:opacity-50">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-dashed border-gray-300 rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <Plus size={20} className="text-blue-400" />
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">Klikni na měsíc</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                Nastav multiplikátor a typ sezóny.<br />Pravidlo se aplikuje automaticky.
              </p>
            </div>
          )}

          {/* Rules list */}
          {activeRules.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nastavená pravidla ({activeRules.length})</p>
              </div>
              <div className="divide-y divide-gray-50">
                {activeRules
                  .sort((a, b) => a.month - b.month)
                  .map(rule => {
                    const opt = SEASON_OPTS.find(s => s.value === rule.season_type)
                    return (
                      <button key={rule.id} onClick={() => openMonth(rule.month)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition ${
                          selectedMonth === rule.month ? 'bg-blue-50' : ''
                        }`}>
                        <span className="text-base leading-none">{opt?.emoji ?? '📊'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800">{MONTH_NAMES[rule.month - 1]}</p>
                          {rule.name && <p className="text-[10px] text-gray-400 truncate">{rule.name}</p>}
                        </div>
                        <span className={`text-xs font-bold ${
                          rule.price_multiplier > 1 ? 'text-emerald-600' : rule.price_multiplier < 1 ? 'text-red-500' : 'text-gray-500'
                        }`}>
                          {rule.price_multiplier.toFixed(2)}×
                        </span>
                        <Edit2 size={11} className="text-gray-300" />
                      </button>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Info box */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <div className="flex gap-2">
              <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-600 leading-relaxed">
                Multiplikátor se násobí základní cenou produktu. Například <b>1.2×</b> = cena o 20 % vyšší v daném měsíci.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
