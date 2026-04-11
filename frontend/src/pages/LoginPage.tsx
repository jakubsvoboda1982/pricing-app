import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { ArrowRight } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err: any) {
      const message = (err?.message || '').toLowerCase()
      if (message.includes('invalid credentials') || message.includes('invalid password') || message.includes('neplatné')) {
        setError('Nesprávný email nebo heslo.')
      } else if (message.includes('email not verified')) {
        setError('Email ještě nebyl ověřen. Zkontroluj si svou schránku.')
      } else if (message.includes('awaiting admin approval')) {
        setError('Čekáš na schválení administrátora. Kontaktuj administrátora.')
      } else if (message.includes('deactivated') || message.includes('inactive') || message.includes('deaktivován')) {
        setError('Účet je deaktivován. Kontaktujte administrátora.')
      } else if (message.includes('429') || message.includes('too many')) {
        setError('Příliš mnoho pokusů o přihlášení. Zkuste to později.')
      } else if (message.includes('relace vypršela') || message.includes('session')) {
        setError('Nesprávný email nebo heslo.')
      } else {
        setError(err?.message || 'Přihlášení se nezdařilo. Zkuste to prosím znovu.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex-col justify-between p-12">
        <div>
          <h1 className="text-4xl font-bold mb-2">Nuties</h1>
          <p className="text-slate-300">Pricing Monitor</p>
        </div>

        <div className="space-y-8">
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                <ArrowRight size={24} />
              </div>
              <h3 className="text-xl font-semibold">Inteligentní pricing</h3>
            </div>
            <p className="text-slate-300">Optimalizujte ceny na základě dat a trendů trhu</p>
          </div>

          <div>
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                <ArrowRight size={24} />
              </div>
              <h3 className="text-xl font-semibold">Analýza konkurence</h3>
            </div>
            <p className="text-slate-300">Sledujte ceny konkurentů v reálném čase</p>
          </div>

          <div>
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                <ArrowRight size={24} />
              </div>
              <h3 className="text-xl font-semibold">Sezónní strategie</h3>
            </div>
            <p className="text-slate-300">Plánujte prodej podle sezónních trendů</p>
          </div>
        </div>

        <div className="flex flex-col items-start space-y-1">
          <p className="text-slate-400 text-sm">© 2026 Nuties Pricing Monitor. All rights reserved.</p>
          <p className="text-slate-500 text-xs">Build: {__GIT_COMMIT__}</p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 bg-white flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile Branding */}
          <div className="lg:hidden mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Nuties</h1>
            <p className="text-gray-600">Pricing Monitor</p>
            <p className="text-gray-500 text-xs mt-1">Build: {__GIT_COMMIT__}</p>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">Přihlaste se</h2>
          <p className="text-gray-600 mb-8">Přihlaste se ke svému účtu pro správu produktů</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="vas@email.cz"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Heslo
                </label>
                <a href="/forgot-password" className="text-xs text-blue-600 hover:underline">
                  Zapomněl jsi heslo?
                </a>
              </div>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Přihlašování...</span>
                </>
              ) : (
                <>
                  <span>Přihlásit se</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 space-y-4 text-center text-gray-600 text-sm">
            <p>
              Nemáš účet? <a href="/register" className="text-blue-600 hover:underline font-medium">Zaregistruj se</a>
            </p>
            <p>
              Potřebujete pomoc? Kontaktujte <a href="mailto:support@nutles.cz" className="text-blue-600 hover:underline">podporu</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
