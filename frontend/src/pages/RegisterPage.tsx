import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { ArrowRight } from 'lucide-react'
import { apiClient } from '@/api/client'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const validateForm = (): boolean => {
    setError('')

    if (!email || !password || !confirmPassword || !fullName || !companyName) {
      setError('Vyplňte prosím všechna pole.')
      return false
    }

    if (password.length < 8) {
      setError('Heslo musí mít alespoň 8 znaků.')
      return false
    }

    if (password !== confirmPassword) {
      setError('Hesla se neshodují.')
      return false
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Prosím zadejte platnou emailovou adresu.')
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      const response = await apiClient.register(email, password, fullName, companyName)
      // Save email to localStorage for verification page
      localStorage.setItem('registration_email', email)
      setSuccess(true)
      // Redirect to email verification page after 2 seconds
      setTimeout(() => {
        navigate('/verify-email', { state: { email } })
      }, 2000)
    } catch (err: any) {
      const message = err?.message || ''
      if (message.includes('400')) {
        setError('Tento email je již registrován.')
      } else {
        setError('Registrace se nezdařila. Zkuste to prosím znovu.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-8">
          <div className="flex items-center justify-center w-12 h-12 mx-auto bg-green-100 rounded-full mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-4">Registrace úspěšná!</h2>
          <p className="text-gray-600 text-center mb-4">
            Zkontroluj prosím svůj email a klikni na odkaz pro ověření účtu.
          </p>
          <p className="text-sm text-gray-500 text-center">
            Za chvíli tě přesměrujeme na stránku ověření...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex-col justify-between p-12">
        <div>
          <h1 className="text-4xl font-bold mb-2">Nutles</h1>
          <p className="text-slate-300">Growth Copilot</p>
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

        <p className="text-slate-400 text-sm">© 2026 Nutles Growth Copilot. All rights reserved.</p>
      </div>

      {/* Right Side - Register Form */}
      <div className="w-full lg:w-1/2 bg-white flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile Branding */}
          <div className="lg:hidden mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Nutles</h1>
            <p className="text-gray-600">Growth Copilot</p>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">Vytvoř účet</h2>
          <p className="text-gray-600 mb-8">Zaregistruj se pro správu svých produktů a cen</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
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
              />
            </div>

            {/* Full Name */}
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
                Jméno a příjmení
              </label>
              <input
                type="text"
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="Jan Novák"
              />
            </div>

            {/* Company Name */}
            <div>
              <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-2">
                Název firmy
              </label>
              <input
                type="text"
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="Moje společnost"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Heslo
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="••••••••"
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Potvrzení hesla
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="••••••••"
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
                  <span>Registruji se...</span>
                </>
              ) : (
                <>
                  <span>Zaregistrovat se</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-gray-600 text-sm mt-8">
            Máš již účet?{' '}
            <a href="/login" className="text-blue-600 hover:underline">
              Přihlaste se
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
