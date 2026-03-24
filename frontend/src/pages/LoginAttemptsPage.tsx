import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/api/client'
import { LoginAttempt } from '@/types'
import { Trash2, Search, CheckCircle, XCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import AdminPanel from './AdminPanel'

type TimeFilter = '24h' | '7d' | 'all'

export default function LoginAttemptsPage() {
  const [attempts, setAttempts] = useState<LoginAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchEmail, setSearchEmail] = useState('')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('7d')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const perPage = 20

  const fetchAttempts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const days = timeFilter === '24h' ? 1 : timeFilter === '7d' ? 7 : undefined
      const result = await apiClient.getLoginAttempts({
        email: searchEmail || undefined,
        days,
        page,
        per_page: perPage,
      })
      if (Array.isArray(result)) {
        setAttempts(result)
        setTotalPages(Math.max(1, Math.ceil(result.length / perPage)))
      } else if (result.items) {
        setAttempts(result.items)
        setTotalPages(Math.max(1, Math.ceil((result.total || result.items.length) / perPage)))
      } else {
        setAttempts([])
        setTotalPages(1)
      }
    } catch (err: any) {
      setError('Nepodařilo se načíst pokusy o přihlášení.')
    } finally {
      setLoading(false)
    }
  }, [searchEmail, timeFilter, page])

  useEffect(() => {
    fetchAttempts()
  }, [fetchAttempts])

  const handleDelete = async (id: string) => {
    try {
      await apiClient.deleteLoginAttempt(id)
      setAttempts((prev) => prev.filter((a) => a.id !== id))
    } catch {
      setError('Nepodařilo se smazat záznam.')
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchAttempts()
  }

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  return (
    <div>
      <AdminPanel />

      <div className="mt-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex space-x-2">
            {([
              { key: '24h', label: 'Posledních 24h' },
              { key: '7d', label: '7 dní' },
              { key: 'all', label: 'Vše' },
            ] as const).map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  setTimeFilter(f.key)
                  setPage(1)
                }}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
                  timeFilter === f.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSearch} className="flex items-center space-x-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                placeholder="Hledat podle emailu..."
                className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
            >
              Hledat
            </button>
          </form>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 font-medium text-gray-500">Email</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Status</th>
                  <th className="px-6 py-3 font-medium text-gray-500">IP adresa</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Čas</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                      Načítání...
                    </td>
                  </tr>
                ) : attempts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      Žádné záznamy
                    </td>
                  </tr>
                ) : (
                  attempts.map((attempt) => (
                    <tr key={attempt.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{attempt.email}</td>
                      <td className="px-6 py-3">
                        {attempt.success ? (
                          <span className="inline-flex items-center space-x-1 text-green-600">
                            <CheckCircle size={16} />
                            <span>Úspěch</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-red-600">
                            <XCircle size={16} />
                            <span>Neúspěch</span>
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-gray-600">{attempt.ip_address || '—'}</td>
                      <td className="px-6 py-3 text-gray-600">{formatDate(attempt.timestamp)}</td>
                      <td className="px-6 py-3">
                        <button
                          onClick={() => handleDelete(attempt.id)}
                          className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition"
                          title="Smazat"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50">
              <span className="text-sm text-gray-600">
                Strana {page} z {totalPages}
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
