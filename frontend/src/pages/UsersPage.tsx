import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Shield, CheckCircle, XCircle, AlertCircle, Pencil, X, UserX, UserCheck } from 'lucide-react'
import { apiClient } from '@/api/client'
import { User } from '@/types'

const ROLES = [
  { value: 'admin',            label: 'Admin',            color: 'red' },
  { value: 'pricing_manager',  label: 'Pricing Manager',  color: 'blue' },
  { value: 'category_manager', label: 'Category Manager', color: 'yellow' },
  { value: 'read_only',        label: 'Pouze čtení',      color: 'gray' },
]

const ROLE_LABELS: Record<string, string> = Object.fromEntries(ROLES.map(r => [r.value, r.label]))

function roleBadgeClass(role: string) {
  if (role === 'admin')            return 'bg-red-50 text-red-700'
  if (role === 'pricing_manager')  return 'bg-blue-50 text-blue-700'
  if (role === 'category_manager') return 'bg-yellow-50 text-yellow-700'
  return 'bg-gray-50 text-gray-700'
}

export default function UsersPage() {
  const [showForm, setShowForm]           = useState(false)
  const [formData, setFormData]           = useState({ email: '', full_name: '', role: 'read_only' })
  const [approvalFilter, setApprovalFilter] = useState('all')
  const [editingUser, setEditingUser]     = useState<User | null>(null)
  const [editRole, setEditRole]           = useState('read_only')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [formError, setFormError]         = useState('')
  const queryClient = useQueryClient()

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.getUsers?.() || Promise.resolve([]),
  })

  const { data: pendingUsers = [], refetch: refetchPending } = useQuery({
    queryKey: ['pending-users', approvalFilter],
    queryFn: () => apiClient.getPendingUsers?.(approvalFilter) || Promise.resolve([]),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.createUser?.(data) || Promise.resolve(null),
    onSuccess: () => {
      setFormData({ email: '', full_name: '', role: 'read_only' })
      setShowForm(false)
      setFormError('')
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: () => setFormError('Uživatele se nepodařilo přidat. Zkontrolujte e-mail.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteUser?.(id) || Promise.resolve(null),
    onSuccess: () => {
      setConfirmDeleteId(null)
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      apiClient.updateUserRole?.(id, role) || Promise.resolve(null),
    onSuccess: () => {
      setEditingUser(null)
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.approveUser?.(id) || Promise.resolve(null),
    onSuccess: () => {
      refetchPending()
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiClient.rejectUser?.(id) || Promise.resolve(null),
    onSuccess: () => refetchPending(),
  })

  const openEdit = (user: User) => {
    setEditingUser(user)
    setEditRole(user.role)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.email || !formData.full_name) return
    setFormError('')
    createMutation.mutate(formData)
  }

  return (
    <div className="space-y-6 max-w-5xl">

      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Správa uživatelů</h1>
        <button
          onClick={() => { setShowForm(true); setFormError('') }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          <Plus size={16} />
          Přidat uživatele
        </button>
      </div>

      {/* Invite Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Nový uživatel</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
                <input
                  type="email" required
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="jan@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Celé jméno</label>
                <input
                  type="text" required
                  value={formData.full_name}
                  onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Jan Novák"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>
            {formError && (
              <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="submit" disabled={createMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                {createMutation.isPending ? 'Přidávám...' : 'Přidat uživatele'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition">
                Zrušit
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pending Approvals */}
      {(pendingUsers as any[]).length > 0 && (
        <div className="bg-white rounded-xl border border-orange-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle size={18} className="text-orange-500" />
            <h2 className="text-base font-semibold text-gray-900">
              Čekají na schválení <span className="text-orange-600">({(pendingUsers as any[]).length})</span>
            </h2>
          </div>
          <div className="flex gap-2 mb-4">
            {[['all', 'Všechny'], ['pending_verification', 'Neověřený e-mail'], ['pending_approval', 'Ke schválení']].map(([v, l]) => (
              <button key={v} onClick={() => setApprovalFilter(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${approvalFilter === v ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {(pendingUsers as any[]).map((user: any) => (
              <div key={user.id} className="flex items-center justify-between p-3 bg-orange-50 border border-orange-100 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">{user.full_name}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                  <div className="flex gap-1.5 mt-1">
                    {!user.is_verified && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">E-mail neověřen</span>
                    )}
                    {user.is_verified && !user.is_approved && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Čeká na schválení</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {user.is_verified && (
                    <button onClick={() => approveMutation.mutate(user.id)}
                      className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
                      <CheckCircle size={13} /> Schválit
                    </button>
                  )}
                  <button onClick={() => rejectMutation.mutate(user.id)}
                    className="flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
                    <XCircle size={13} /> Odmítnout
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Aktivní uživatelé</h2>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Načítám...
          </div>
        ) : (users as User[]).length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">Žádní aktivní uživatelé.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uživatel</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(users as User[]).map(user => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-gray-900">{user.full_name}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${roleBadgeClass(user.role)}`}>
                      <Shield size={11} />
                      {ROLE_LABELS[user.role] || user.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {user.is_active ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
                        <UserCheck size={11} /> Aktivní
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        <UserX size={11} /> Neaktivní
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(user)}
                        className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition"
                        title="Upravit roli"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(user.id)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        title="Smazat uživatele"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Role Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditingUser(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 text-base">Upravit roli</h3>
              <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-900">{editingUser.full_name}</p>
                <p className="text-xs text-gray-500">{editingUser.email}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Role</label>
                <select value={editRole} onChange={e => setEditRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => updateRoleMutation.mutate({ id: editingUser.id, role: editRole })}
                  disabled={updateRoleMutation.isPending || editRole === editingUser.role}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-200 text-white py-2 rounded-lg text-sm font-medium transition"
                >
                  {updateRoleMutation.isPending ? 'Ukládám...' : 'Uložit'}
                </button>
                <button onClick={() => setEditingUser(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition">
                  Zrušit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-2">Smazat uživatele?</h3>
            <p className="text-sm text-gray-500 mb-5">Tato akce je nevratná. Uživatel ztratí přístup do aplikace.</p>
            <div className="flex gap-2">
              <button
                onClick={() => deleteMutation.mutate(confirmDeleteId)}
                disabled={deleteMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white py-2 rounded-lg text-sm font-medium transition"
              >
                {deleteMutation.isPending ? 'Mažu...' : 'Ano, smazat'}
              </button>
              <button onClick={() => setConfirmDeleteId(null)}
                className="flex-1 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 py-2 transition">
                Zrušit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
