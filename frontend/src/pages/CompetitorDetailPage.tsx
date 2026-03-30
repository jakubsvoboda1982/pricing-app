import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, RefreshCw, Edit2, Save, X, Globe, Mail, Phone, MapPin, CheckCircle, AlertCircle } from 'lucide-react'
import { API_BASE_URL } from '@/api/client'

interface CompetitorDetail {
  id: string
  name: string
  url: string
  logo_url?: string
  category?: string
  market: string
  description?: string
  email?: string
  phone?: string
  address?: string
  country?: string
  is_active: boolean
  is_verified: boolean
  first_scrape_date?: string
  last_scrape_date?: string
  scrape_error?: string
  scrape_attempts: number
  scrape_failures: number
  created_at: string
  updated_at?: string
}

function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname
    return `https://www.google.com/s2/favicons?sz=64&domain_url=https://${domain}`
  } catch {
    return ''
  }
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return url
  }
}

export default function CompetitorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<Partial<CompetitorDetail>>({})

  const { data: competitor, isLoading, error } = useQuery({
    queryKey: ['competitor', id],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/competitors/${id}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
      })
      if (!response.ok) throw new Error('Chyba při načítání')
      const data = await response.json()
      // Endpoint returns CompetitorDetailResponse with .competitor
      return (data.competitor || data) as CompetitorDetail
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<CompetitorDetail>) => {
      const response = await fetch(`${API_BASE_URL}/competitors/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify(data),
      })
      if (!response.ok) throw new Error('Chyba při ukládání')
      return await response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitor', id] })
      queryClient.invalidateQueries({ queryKey: ['competitors'] })
      setIsEditing(false)
    },
  })

  const rescrapeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE_URL}/competitors/${id}/rescrape`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
      })
      if (!response.ok) throw new Error('Chyba při načítání')
      return await response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitor', id] })
      queryClient.invalidateQueries({ queryKey: ['competitors'] })
    },
  })

  const handleEditStart = () => {
    if (!competitor) return
    setEditForm({
      name: competitor.name,
      category: competitor.category,
      description: competitor.description,
      email: competitor.email,
      phone: competitor.phone,
      address: competitor.address,
    })
    setIsEditing(true)
  }

  const handleSave = () => {
    updateMutation.mutate(editForm)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Načítám informace o konkurentovi...</p>
      </div>
    )
  }

  if (error || !competitor) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">Nepodařilo se načíst konkurenta</p>
        <button onClick={() => navigate('/competitors')} className="text-blue-600 hover:underline">
          Zpět na seznam
        </button>
      </div>
    )
  }

  const faviconUrl = getFaviconUrl(competitor.url)
  const domain = getDomain(competitor.url)
  const isOnline = !competitor.scrape_error

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back + Header */}
      <div>
        <button
          onClick={() => navigate('/competitors')}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-4 transition"
        >
          <ArrowLeft size={18} />
          <span>Zpět na konkurenci</span>
        </button>

        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-4">
            {faviconUrl ? (
              <img
                src={faviconUrl}
                alt={competitor.name}
                className="w-14 h-14 rounded-xl bg-gray-100 p-1"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-blue-100 flex items-center justify-center">
                <Globe size={28} className="text-blue-600" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{competitor.name}</h1>
              <div className="flex items-center space-x-2 mt-1">
                <a
                  href={competitor.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex items-center space-x-1 text-sm"
                >
                  <span>{domain}</span>
                  <ExternalLink size={13} />
                </a>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  competitor.market === 'CZ' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                }`}>
                  {competitor.market === 'CZ' ? '🇨🇿 CZ' : '🇸🇰 SK'}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded flex items-center space-x-1 ${
                  isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {isOnline ? <CheckCircle size={11} /> : <AlertCircle size={11} />}
                  <span>{isOnline ? 'Online' : 'Offline'}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => rescrapeMutation.mutate()}
              disabled={rescrapeMutation.isPending}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition disabled:opacity-50"
              title="Načíst informace z webu"
            >
              <RefreshCw size={16} className={rescrapeMutation.isPending ? 'animate-spin' : ''} />
              <span>{rescrapeMutation.isPending ? 'Načítám...' : 'Načíst info z webu'}</span>
            </button>
            {!isEditing ? (
              <button
                onClick={handleEditStart}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition"
              >
                <Edit2 size={16} />
                <span>Upravit</span>
              </button>
            ) : (
              <div className="flex space-x-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex items-center space-x-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition"
                >
                  <X size={16} />
                  <span>Zrušit</span>
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="flex items-center space-x-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition disabled:opacity-50"
                >
                  <Save size={16} />
                  <span>Uložit</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scrape Error Banner */}
      {competitor.scrape_error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-900">Chyba při načítání webu</p>
            <p className="text-sm text-red-700 mt-1">{competitor.scrape_error}</p>
            <button
              onClick={() => rescrapeMutation.mutate()}
              className="text-sm text-red-600 hover:underline mt-2"
            >
              Zkusit znovu
            </button>
          </div>
        </div>
      )}

      {rescrapeMutation.isSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
          ✓ Informace byly úspěšně aktualizovány z webu
        </div>
      )}

      {/* Info Card */}
      <div className="bg-white rounded-xl shadow p-6 space-y-5">
        <h2 className="text-lg font-semibold text-gray-900">Informace o konkurentovi</h2>

        {/* Description */}
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Popis</label>
          {isEditing ? (
            <textarea
              value={editForm.description || ''}
              onChange={(e) => setEditForm(p => ({ ...p, description: e.target.value }))}
              rows={3}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Popis konkurenta..."
            />
          ) : (
            <p className="mt-1 text-gray-700 text-sm">
              {competitor.description || <span className="text-gray-400 italic">Žádný popis. Klikni na "Načíst info z webu" nebo "Upravit".</span>}
            </p>
          )}
        </div>

        {/* Category */}
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Kategorie</label>
          {isEditing ? (
            <input
              value={editForm.category || ''}
              onChange={(e) => setEditForm(p => ({ ...p, category: e.target.value }))}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="např. E-shop, Maloobchod..."
            />
          ) : (
            <p className="mt-1 text-gray-700 text-sm">
              {competitor.category || <span className="text-gray-400 italic">Nezadáno</span>}
            </p>
          )}
        </div>

        {/* Contact Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Email */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center space-x-1">
              <Mail size={12} />
              <span>Email</span>
            </label>
            {isEditing ? (
              <input
                type="email"
                value={editForm.email || ''}
                onChange={(e) => setEditForm(p => ({ ...p, email: e.target.value }))}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="info@competitor.cz"
              />
            ) : (
              <p className="mt-1 text-gray-700 text-sm">
                {competitor.email
                  ? <a href={`mailto:${competitor.email}`} className="text-blue-600 hover:underline">{competitor.email}</a>
                  : <span className="text-gray-400 italic">Nezadáno</span>
                }
              </p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center space-x-1">
              <Phone size={12} />
              <span>Telefon</span>
            </label>
            {isEditing ? (
              <input
                value={editForm.phone || ''}
                onChange={(e) => setEditForm(p => ({ ...p, phone: e.target.value }))}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="+420 xxx xxx xxx"
              />
            ) : (
              <p className="mt-1 text-gray-700 text-sm">
                {competitor.phone || <span className="text-gray-400 italic">Nezadáno</span>}
              </p>
            )}
          </div>
        </div>

        {/* Address */}
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center space-x-1">
            <MapPin size={12} />
            <span>Adresa</span>
          </label>
          {isEditing ? (
            <input
              value={editForm.address || ''}
              onChange={(e) => setEditForm(p => ({ ...p, address: e.target.value }))}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ulice 123, Praha"
            />
          ) : (
            <p className="mt-1 text-gray-700 text-sm">
              {competitor.address || <span className="text-gray-400 italic">Nezadáno</span>}
            </p>
          )}
        </div>
      </div>

      {/* Stats Card */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Statistiky monitoringu</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{competitor.scrape_attempts}</p>
            <p className="text-xs text-gray-500 mt-1">Pokusů o načtení</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className={`text-2xl font-bold ${competitor.scrape_failures > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {competitor.scrape_failures}
            </p>
            <p className="text-xs text-gray-500 mt-1">Chyb</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-sm font-medium text-gray-900">
              {competitor.last_scrape_date
                ? new Date(competitor.last_scrape_date).toLocaleDateString('cs-CZ')
                : '—'
              }
            </p>
            <p className="text-xs text-gray-500 mt-1">Poslední načtení</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-sm font-medium text-gray-900">
              {new Date(competitor.created_at).toLocaleDateString('cs-CZ')}
            </p>
            <p className="text-xs text-gray-500 mt-1">Přidán</p>
          </div>
        </div>
      </div>
    </div>
  )
}
