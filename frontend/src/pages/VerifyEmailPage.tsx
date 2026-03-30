import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { CheckCircle, AlertCircle } from 'lucide-react'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    const verifyToken = async () => {
      const token = searchParams.get('token')
      const emailParam = searchParams.get('email')

      if (!token) {
        setStatus('error')
        setError('Ověřovací odkaz není platný. Prosím zaregistruj se znovu.')
        return
      }

      try {
        // For MVP, we'll use a prompt to ask for email since it's not in URL by default
        const storedEmail = localStorage.getItem('registration_email')
        if (!storedEmail && !emailParam) {
          setStatus('error')
          setError('Email informace chybí. Prosím zaregistruj se znovu.')
          return
        }

        const emailToVerify = emailParam || storedEmail || ''
        setEmail(emailToVerify)

        // Call verify endpoint
        await apiClient.verifyEmail(token, emailToVerify)
        setStatus('success')

        // Clear stored email
        localStorage.removeItem('registration_email')

        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate('/login')
        }, 3000)
      } catch (err: any) {
        setStatus('error')
        const message = err?.message || ''
        if (message.includes('400')) {
          setError('Ověřovací token je neplatný nebo vypršel.')
        } else {
          setError('Ověření emailu se nezdařilo. Zkuste to prosím znovu.')
        }
      }
    }

    verifyToken()
  }, [searchParams, navigate, retryCount])

  const handleRetry = () => {
    setStatus('loading')
    setError('')
    setRetryCount((prev) => prev + 1)
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Ověřuji email...</h2>
          <p className="text-gray-600">Prosím čekej, ověřuji tvůj email adresu.</p>
        </div>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-8 text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle size={48} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Email ověřen!</h2>
          <p className="text-gray-600 mb-4">
            Tvůj email byl úspěšně ověřen. Nyní čekej na schválení administrátora.
          </p>
          <p className="text-sm text-gray-500">
            Za chvíli tě přesměrujeme na přihlašovací stránku...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-8">
        <div className="flex justify-center mb-4">
          <AlertCircle size={48} className="text-red-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Ověření se nezdařilo</h2>
        <p className="text-gray-600 text-center mb-6">{error}</p>

        <div className="flex flex-col gap-3">
          <button
            onClick={handleRetry}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition"
          >
            Zkusit znovu
          </button>
          <button
            onClick={() => navigate('/register')}
            className="w-full bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium py-3 px-4 rounded-lg transition"
          >
            Zaregistrovat se znovu
          </button>
        </div>

        <p className="text-center text-gray-600 text-sm mt-6">
          Máš otázky?{' '}
          <a href="mailto:support@nutles.cz" className="text-blue-600 hover:underline">
            Kontaktuj podporu
          </a>
        </p>
      </div>
    </div>
  )
}
