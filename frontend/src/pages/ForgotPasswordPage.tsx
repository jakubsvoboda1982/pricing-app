import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mail, ArrowRight, CheckCircle } from 'lucide-react'
import { API_BASE_URL } from '@/api/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.detail || 'Nastala chyba. Zkus to prosím znovu.')
      } else {
        setSent(true)
      }
    } catch {
      setError('Nepodařilo se připojit k serveru. Zkus to prosím znovu.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left branding — stejná jako login */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex-col justify-between p-12">
        <div>
          <h1 className="text-4xl font-bold mb-2">Nuties</h1>
          <p className="text-slate-300">Pricing Monitor</p>
        </div>
        <div className="space-y-6">
          <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
                <Mail size={20} className="text-blue-400" />
              </div>
              <h3 className="font-semibold text-lg">Bezpečná obnova</h3>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              Pošleme ti email s odkazem pro nastavení nového hesla. Odkaz vyprší za 1 hodinu.
            </p>
          </div>
        </div>
        <p className="text-slate-400 text-sm">© 2026 Nuties Pricing Monitor. All rights reserved.</p>
      </div>

      {/* Right side — form */}
      <div className="w-full lg:w-1/2 bg-white flex items-center justify-center p-8">
        <div className="w-full max-w-md">

          {/* Back link */}
          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-8 transition">
            <ArrowLeft size={15} /> Zpět na přihlášení
          </Link>

          {sent ? (
            /* ── Success state ── */
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle size={32} className="text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Email odeslán</h2>
              <p className="text-gray-600">
                Pokud je adresa <strong>{email}</strong> registrována, obdržíš email s odkazem pro obnovu hesla.
              </p>
              <p className="text-sm text-gray-400">
                Odkaz vyprší za 1 hodinu. Zkontroluj i složku spam.
              </p>
              <div className="pt-4 space-y-3">
                <button
                  onClick={() => { setSent(false); setEmail('') }}
                  className="w-full border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium py-3 px-4 rounded-lg transition text-sm"
                >
                  Zadat jiný email
                </button>
                <Link
                  to="/login"
                  className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition text-sm"
                >
                  Přejít na přihlášení <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          ) : (
            /* ── Form state ── */
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Zapomenuté heslo</h2>
              <p className="text-gray-600 mb-8">
                Zadej svůj email a pošleme ti odkaz pro nastavení nového hesla.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                      placeholder="vas@email.cz"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-3 px-4 rounded-lg transition flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Odesílám...
                    </>
                  ) : (
                    <>
                      Odeslat odkaz pro obnovu <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-gray-500">
                Vzpomněl sis?{' '}
                <Link to="/login" className="text-blue-600 hover:underline font-medium">
                  Přihlásit se
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
