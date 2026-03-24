import { useNavigate, useLocation } from 'react-router-dom'
import { Shield, List, Users } from 'lucide-react'

export default function AdminPanel() {
  const navigate = useNavigate()
  const location = useLocation()

  const tabs = [
    {
      id: 'login-attempts',
      label: 'Pokusy o přihlášení',
      icon: List,
      path: '/admin/login-attempts',
    },
    {
      id: 'users',
      label: 'Správa uživatelů',
      icon: Users,
      path: '/admin/users',
    },
  ]

  const activeTab = location.pathname.includes('users') ? 'users' : 'login-attempts'

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <Shield className="text-blue-600" size={28} />
        <h1 className="text-2xl font-bold text-gray-900">Administrace</h1>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex space-x-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => navigate(tab.path)}
                className={`flex items-center space-x-2 px-4 py-3 border-b-2 font-medium text-sm transition ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
