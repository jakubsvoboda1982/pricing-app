import { useState, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Lock, Eye, EyeOff, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react'
import { API_BASE_URL } from '@/api/client'

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: 'Alespoň 8 znaků', ok: password.length >= 8 },
    { label: 'Velké písmeno', ok: /[A-Z]/.test(password) },
    { label: 'Malé písmeno', ok: /[a-z]/.test(password) },
    { label: 'Číslo', ok: /\d/.test(password) },
  ]
  const score = checks.filter(c => c.ok).length
  const color = score <= 1 ? 'bg-red-400' : score === 2 ? 'bg-yellow-400' : score === 3 ? 'bg-blue-400' : 'bg-green-500'
  const label = score <= 1 ? 'Slabé' : score === 2 ? 'Průměrné' : score === 3 ? 'Dobré' : 'Silné'

  if (!password) return null

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${(score / 4) * 100}%` }} />
        </div>
        <span className={`text-xs font-medium ${score <= 1 ? 'text-red-500' : score === 2 ? 'text-yellow-600' : score === 3 ? 'text-blue-600' : 'text-green-600'}`}>
          {label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {checks.map(c => (
          <div key={c.label} className={`flex items-center gap-1.5 text-xs ${c.ok ? 'text-green-600' : 'text-gray-400'}`}>
            <CheckCircle size={11} className={c.ok ? 'text-green-500' : 'text-gray-200'} />
            {c.label}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const token = searchParams.get('token') || ''
  const email = searchParams.get('email') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [redirectIn, setRedirectIn] = useState(5)

  // Validace URL parametrů
  const hasValidParams = token && email

  // Redirect countdown after success
  useEffect(() => {
    if (!success) return
    if (redirectIn <= 0) { navigate('/login'); return }
    const t = setTimeout(() => setRedirectIn(n => n - 1), 1000)
    return () => clearTimeout(t)
  }, [success, redirectIn, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Heslo musí mít alespoň 8 znaků.')
      return
    }
    if (password !== confirm) {
      setError('Hesla se neshodují.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.detail || 'Nastala chyba. Zkus to prosím znovu.')
      } else {
        setSuccess(true)
      }
    } catch {
      setError('Nepodařilo se připojit k serveru. Zkus to prosím znovu.')
    } finally {
      setLoading(false)
    }
  }

  const passwordsMatch = confirm.length > 0 && password === confirm
  const passwordsMismatch = confirm.length > 0 && password !== confirm

  return (
    <div className="min-h-screen flex">
      {/* Left branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex-col justify-between p-12">
        <div>
          <h1 className="text-4xl font-bold mb-2">Nuties</h1>
          <p className="text-slate-300">Pricing Monitor</p>
        </div>
        <div className="space-y-6">
          <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
                <Lock size={20} className="text-blue-400" />
              </div>
              <h3 className="font-semibold text-lg">Nové heslo</h3>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              Zvol si silné heslo s alespoň 8 znaky. Kombinace písmen, číslic a symbolů zvyšuje bezpečnost.
            </p>
          </div>
        </div>
        <p className="text-slate-400 text-sm">© 2026 Nuties Pricing Monitor. All rights reserved.</p>
      </div>

      {/* Right side */}
      <div className="w-full lg:w-1/2 bg-white flex items-center justify-center p-8">
        <div className="w-full max-w-md">

          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-8 transition">
            <ArrowLeft size={15} /> Zpět na přihlášení
          </Link>

          {/* Invalid link */}
          {!hasValidParams ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle size={32} className="text-red-500" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Neplatný odkaz</h2>
              <p className="text-gray-600">Tento odkaz pro obnovu hesla je neplatný nebo vypršel.</p>
              <Link to="/forgot-password"
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition text-sm">
                Požádat o nový odkaz <ArrowRight size={16} />
              </Link>
            </div>

          ) : success ? (
            /* ── Success ── */
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle size={32} className="text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Heslo změněno!</h2>
              <p className="text-gray-600">
                Tvoje heslo bylo úspěšně nastaveno. Nyní se můžeš přihlásit.
              </p>
              <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                Přesměrování na přihlášení za <strong>{redirectIn}s</strong>…
              </div>
              <Link to="/login"
                className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition text-sm">
                Přihlásit se hned <ArrowRight size={16} />
              </Link>
            </div>

          ) : (
            /* ── Form ── */
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Nastavit nové heslo</h2>
              <p className="text-gray-600 mb-1">
                Nastavení hesla pro <strong className="text-gray-800">{email}</strong>
              </p>
              <p className="text-sm text-gray-400 mb-8">Odkaz vyprší za 1 hodinu od odeslání emailu.</p>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* New password */}
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                    Nové heslo
                  </label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                      placeholder="Minimálně 8 znaků"
                      required
                      autoFocus
                    />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <PasswordStrength password={password} />
                </div>

                {/* Confirm password */}
                <div>
                  <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-2">
                    Potvrdit heslo
                  </label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      id="confirm"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      className={`w-full pl-10 pr-10 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition ${
                        passwordsMismatch
                          ? 'border-red-300 focus:ring-red-400'
                          : passwordsMatch
                          ? 'border-green-400 focus:ring-green-400'
                          : 'border-gray-300 focus:ring-blue-500'
                      }`}
                      placeholder="Zadej heslo znovu"
                      required
                    />
                    <button type="button" onClick={() => setShowConfirm(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {passwordsMismatch && (
                    <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle size={11} /> Hesla se neshodují
                    </p>
                  )}
                  {passwordsMatch && (
                    <p className="mt-1.5 text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle size={11} /> Hesla se shodují
                    </p>
                  )}
                </div>

                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-start gap-2">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <div>
                      <p>{error}</p>
                      {error.includes('vypršel') && (
                        <Link to="/forgot-password" className="text-red-600 underline text-xs mt-1 inline-block">
                          Požádat o nový odkaz
                        </Link>
                      )}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || password.length < 8 || password !== confirm}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-3 px-4 rounded-lg transition flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Ukládám heslo…
                    </>
                  ) : (
                    <>
                      Nastavit nové heslo <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
