import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Shield, Eye, Settings, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { apiClient } from '@/api/client'
import { User } from '@/types'

const ROLES = [
  { value: 'admin', label: 'Admin', color: 'red' },
  { value: 'pricing_manager', label: 'Pricing Manager', color: 'blue' },
  { value: 'category_manager', label: 'Category Manager', color: 'yellow' },
  { value: 'read_only', label: 'Read Only', color: 'gray' },
]

export default function UsersPage() {
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ email: '', full_name: '', role: 'read_only' })
  const [approvalFilter, setApprovalFilter] = useState<string>('all')
  const queryClient = useQueryClient()

  const { data: users, isLoading, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.getUsers?.() || Promise.resolve([]),
  })

  const { data: pendingUsers, isLoading: pendingLoading, refetch: refetchPending } = useQuery({
    queryKey: ['pending-users', approvalFilter],
    queryFn: () => apiClient.getPendingUsers?.(approvalFilter) || Promise.resolve([]),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.createUser?.(data) || Promise.resolve(null),
    onSuccess: () => {
      setFormData({ email: '', full_name: '', role: 'read_only' })
      setShowForm(false)
      refetch()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteUser?.(id) || Promise.resolve(null),
    onSuccess: () => refetch(),
  })

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.approveUser?.(id) || Promise.resolve(null),
    onSuccess: () => {
      refetchPending()
      refetch()
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiClient.rejectUser?.(id) || Promise.resolve(null),
    onSuccess: () => {
      refetchPending()
      refetch()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.email || !formData.full_name) return
    createMutation.mutate(formData)
  }

  const getRoleColor = (role: string) => {
    const roleObj = ROLES.find((r) => r.value === role)
    return roleObj?.color || 'gray'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Správa uživatelů</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
        >
          <Plus size={20} />
          <span>Pozvat uživatele</span>
        </button>
      </div>

      {/* Invite Form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Pozvat nového uživatele</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <input
                type="email"
                placeholder="Email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Jméno"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg disabled:opacity-50"
              >
                {createMutation.isPending ? 'Posílám...' : 'Poslat pozvánku'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-900 px-6 py-2 rounded-lg"
              >
                Zrušit
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pending Approvals Section */}
      {pendingUsers && pendingUsers.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center space-x-2 mb-4">
            <AlertCircle size={20} className="text-orange-600" />
            <h2 className="text-xl font-semibold text-gray-900">Čekající schválení ({pendingUsers.length})</h2>
          </div>

          {/* Filter Tabs */}
          <div className="flex space-x-2 mb-4">
            <button
              onClick={() => setApprovalFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                approvalFilter === 'all'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Všechny čekající
            </button>
            <button
              onClick={() => setApprovalFilter('pending_verification')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                approvalFilter === 'pending_verification'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Ověřit email
            </button>
            <button
              onClick={() => setApprovalFilter('pending_approval')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                approvalFilter === 'pending_approval'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Schválit
            </button>
          </div>

          {/* Pending Users Cards */}
          <div className="space-y-3">
            {pendingUsers.map((user: any) => (
              <div key={user.id} className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{user.full_name}</h3>
                    <p className="text-sm text-gray-600 mt-1">{user.email}</p>
                    <div className="flex items-center space-x-2 mt-2">
                      {!user.is_verified && (
                        <span className="inline-flex items-center space-x-1 px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800">
                          <AlertCircle size={12} />
                          <span>Email neověřen</span>
                        </span>
                      )}
                      {user.is_verified && !user.is_approved && (
                        <span className="inline-flex items-center space-x-1 px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                          <AlertCircle size={12} />
                          <span>Čekám na schválení</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {user.is_verified && (
                      <button
                        onClick={() => approveMutation.mutate(user.id)}
                        disabled={approveMutation.isPending}
                        className="flex items-center space-x-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm disabled:opacity-50 transition"
                      >
                        <CheckCircle size={16} />
                        <span>Schválit</span>
                      </button>
                    )}
                    <button
                      onClick={() => rejectMutation.mutate(user.id)}
                      disabled={rejectMutation.isPending}
                      className="flex items-center space-x-1 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm disabled:opacity-50 transition"
                    >
                      <XCircle size={16} />
                      <span>Odmítnout</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-gray-500">Načítám uživatele...</div>
        ) : users && users.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Jméno</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((user: User) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.full_name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-sm font-medium
                        ${
                          user.role === 'admin'
                            ? 'bg-red-50 text-red-700'
                            : user.role === 'pricing_manager'
                              ? 'bg-blue-50 text-blue-700'
                              : user.role === 'category_manager'
                                ? 'bg-yellow-50 text-yellow-700'
                                : 'bg-gray-50 text-gray-700'
                        }
                      `}
                      >
                        <Shield size={16} />
                        <span>
                          {ROLES.find((r) => r.value === user.role)?.label || user.role}
                        </span>
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {!user.is_verified ? (
                        <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-sm bg-yellow-50 text-yellow-700">
                          <AlertCircle size={16} />
                          <span>Neověřen</span>
                        </span>
                      ) : !user.is_approved ? (
                        <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-sm bg-blue-50 text-blue-700">
                          <AlertCircle size={16} />
                          <span>Neodsouhlasen</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-sm bg-green-50 text-green-700">
                          <Eye size={16} />
                          <span>Aktivní</span>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                      <button className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-700">
                        <Settings size={16} />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(user.id)}
                        className="inline-flex items-center space-x-1 text-red-600 hover:text-red-700"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">Žádní uživatelé. Pozvěte si své kolegiony!</div>
        )}
      </div>
    </div>
  )
}
