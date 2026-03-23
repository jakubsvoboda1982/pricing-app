import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { Menu, LogOut, Package, Users, BarChart3, Download, Upload, Zap } from 'lucide-react'

export default function DashboardPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activePage, setActivePage] = useState('overview')
  const navigate = useNavigate()
  const { logout } = useAuthStore()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const menuItems = [
    { id: 'overview', label: 'Dashboard', icon: BarChart3 },
    { id: 'products', label: 'Sledované produkty', icon: Package },
    { id: 'users', label: 'Konkurenti', icon: Users },
    { id: 'import', label: 'Import produktů', icon: Upload },
    { id: 'export', label: 'Export centrum', icon: Download },
    { id: 'audit', label: 'Auditní záznam', icon: Zap },
  ]

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-slate-900 text-white transition-all duration-300 flex flex-col`}>
        <div className="p-4 flex items-center justify-between">
          {sidebarOpen && <h1 className="text-xl font-bold">Nutles</h1>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="hover:bg-slate-700 p-2 rounded">
            <Menu size={20} />
          </button>
        </div>

        <nav className="flex-1 px-4 py-8 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition ${
                  activePage === item.id ? 'bg-blue-600' : 'hover:bg-slate-800'
                }`}
              >
                <Icon size={20} />
                {sidebarOpen && <span>{item.label}</span>}
              </button>
            )
          })}
        </nav>

        <div className="p-4 border-t border-slate-700">
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-slate-800 transition text-red-400"
          >
            <LogOut size={20} />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">
            {menuItems.find((i) => i.id === activePage)?.label || 'Dashboard'}
          </h2>
          <div className="flex items-center space-x-4">
            <span className="text-gray-600">CZ</span>
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
              JS
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto p-8">
          {activePage === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-gray-500 text-sm font-medium">Produkty</h3>
                  <p className="text-3xl font-bold text-gray-900 mt-2">117</p>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-gray-500 text-sm font-medium">Uživatelé</h3>
                  <p className="text-3xl font-bold text-gray-900 mt-2">2</p>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-gray-500 text-sm font-medium">Pricing Managers</h3>
                  <p className="text-3xl font-bold text-gray-900 mt-2">0</p>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-gray-500 text-sm font-medium">Read Only</h3>
                  <p className="text-3xl font-bold text-gray-900 mt-2">1</p>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Poslední aktivity</h3>
                <p className="text-gray-500">Žádné záznamy zatím</p>
              </div>
            </div>
          )}

          {activePage === 'products' && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Sledované produkty</h3>
              <p className="text-gray-500">Načítám produkty...</p>
            </div>
          )}

          {activePage === 'users' && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Konkurenti</h3>
              <p className="text-gray-500">Žádní konkurenti zatím</p>
            </div>
          )}

          {activePage === 'import' && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Import produktů</h3>
              <p className="text-gray-500">Drag & drop XLSX nebo CSV soubor</p>
            </div>
          )}

          {activePage === 'export' && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Export centrum</h3>
              <p className="text-gray-500">Exportuj data do XLSX nebo CSV</p>
            </div>
          )}

          {activePage === 'audit' && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Auditní záznam</h3>
              <p className="text-gray-500">Žádné záznamy zatím</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
