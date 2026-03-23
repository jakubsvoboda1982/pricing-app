import { useQuery } from '@tanstack/react-query'
import { Clock, AlertCircle } from 'lucide-react'
import { apiClient } from '@/api/client'
import { AuditLog } from '@/types'

const ACTION_COLORS = {
  create: 'green',
  update: 'blue',
  delete: 'red',
}

export default function AuditPage() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => apiClient.getAuditLogs(),
  })

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('cs-CZ')
  }

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      create: 'Vytvořeno',
      update: 'Upraveno',
      delete: 'Smazáno',
    }
    return labels[action] || action
  }

  const getActionColor = (action: string) => {
    if (action === 'create') return 'green'
    if (action === 'update') return 'blue'
    if (action === 'delete') return 'red'
    return 'gray'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <Clock size={32} className="text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Auditní záznam</h1>
          <p className="text-gray-600">6 zaznamenaných údálostí • Úplná historie rozhodnutí</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 flex space-x-4">
        <input
          type="text"
          placeholder="Hledat v záznamech..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option>Všechny akce</option>
          <option>Vytvořeno</option>
          <option>Upraveno</option>
          <option>Smazáno</option>
        </select>
      </div>

      {/* Audit Logs */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            Načítám záznam...
          </div>
        ) : logs && logs.length > 0 ? (
          logs.map((log: AuditLog) => {
            const color = getActionColor(log.action)
            return (
              <div key={log.id} className="bg-white rounded-lg shadow p-4 flex items-start space-x-4">
                <div
                  className={`p-3 rounded-lg ${
                    color === 'green'
                      ? 'bg-green-50 text-green-700'
                      : color === 'blue'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-red-50 text-red-700'
                  }`}
                >
                  <AlertCircle size={20} />
                </div>

                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-semibold text-gray-900">
                      Produkt {log.product_id ? log.product_id.slice(0, 8) : 'smazán'}
                    </h3>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        color === 'green'
                          ? 'bg-green-50 text-green-700'
                          : color === 'blue'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {getActionLabel(log.action)}
                    </span>
                  </div>

                  {log.field_changed && (
                    <p className="text-sm text-gray-600 mt-1">
                      Pole <code className="bg-gray-100 px-2 py-1 rounded">{log.field_changed}</code>
                    </p>
                  )}

                  {log.old_value && log.new_value && (
                    <p className="text-sm text-gray-600 mt-1">
                      <span className="line-through text-red-500">{log.old_value}</span>
                      {' → '}
                      <span className="text-green-500">{log.new_value}</span>
                    </p>
                  )}

                  <p className="text-xs text-gray-500 mt-2">{formatDate(log.timestamp)}</p>
                </div>

                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">Petra Horáčková</p>
                  <p className="text-xs text-gray-500">Manager sm</p>
                </div>
              </div>
            )
          })
        ) : (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            Žádné záznamy zatím
          </div>
        )}
      </div>
    </div>
  )
}
