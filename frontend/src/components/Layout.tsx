import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { Menu, LogOut, BarChart3, Package, Users, AlertCircle, Download, Upload, Menu as MenuIcon, Shield, Zap, Calendar, ChevronRight, ArrowLeft, Link2 } from 'lucide-react'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()
  const { logout, user } = useAuthStore()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const menuSections = [
    {
      section: 'PŘEHLED',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: BarChart3, path: '/dashboard' },
        { id: 'products', label: 'Sledované produkty', icon: Package, path: '/products' },
        { id: 'catalog', label: 'Katalog produktů', icon: Package, path: '/catalog' },
        { id: 'opportunities', label: 'Nové příležitosti', icon: Package, path: '/opportunities' },
      ]
    },
    {
      section: 'DATA',
      items: [
        { id: 'import', label: 'Import produktů', icon: Upload, path: '/import' },
        { id: 'export', label: 'Export centrum', icon: Download, path: '/export' },
      ]
    },
    {
      section: 'ANALÝZA',
      items: [
        { id: 'competitors', label: 'Konkurence', icon: BarChart3, path: '/competitors' },
        { id: 'simulator', label: 'Simulátor co-když', icon: Zap, path: '/simulator' },
        { id: 'seasonality', label: 'Sezónní engine', icon: Calendar, path: '/seasonality' },
      ]
    },
    {
      section: 'INTEGRACE',
      items: [
        { id: 'baselinker', label: 'Baselinker', icon: Link2, path: '/baselinker' },
      ]
    },
    {
      section: 'OPERACE',
      items: [
        { id: 'users', label: 'Správa uživatelů', icon: Users, path: '/users' },
        { id: 'audit', label: 'Auditní záznam', icon: AlertCircle, path: '/audit' },
        ...(user?.role === 'admin'
          ? [{ id: 'admin', label: 'Administrace', icon: Shield, path: '/admin' }]
          : []),
      ]
    },
  ]

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/')

  // Get breadcrumbs from current route
  const getBreadcrumbs = () => {
    const pathname = location.pathname
    const allMenuItems = menuSections.flatMap(s => s.items)
    const currentItem = allMenuItems.find(item => item.path === pathname)

    if (currentItem) {
      return [
        { label: 'Dashboard', path: '/dashboard' },
        { label: currentItem.label, path: currentItem.path }
      ]
    }
    return []
  }

  const breadcrumbs = getBreadcrumbs()
  const canGoBack = location.key !== 'default'

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-slate-900 text-white transition-all duration-300 flex flex-col shadow-lg`}
      >
        <div className="p-4 flex items-center justify-between border-b border-slate-700">
          {sidebarOpen && (
            <div className="flex flex-col">
              <h1 className="text-xl font-bold">Nuties</h1>
              <span className="text-xs text-slate-400">Build: {__GIT_COMMIT__}</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hover:bg-slate-700 p-2 rounded transition"
            aria-label="Toggle sidebar"
          >
            <MenuIcon size={20} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-6 space-y-6 overflow-y-auto">
          {menuSections.map((section) => (
            <div key={section.section}>
              {sidebarOpen && (
                <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  {section.section}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.path)
                  return (
                    <button
                      key={item.id}
                      onClick={() => navigate(item.path)}
                      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition ${
                        active
                          ? 'bg-blue-600 shadow-md text-white'
                          : 'hover:bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                      title={!sidebarOpen ? item.label : undefined}
                    >
                      <Icon size={20} className="flex-shrink-0" />
                      {sidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-700">
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-red-900 transition text-red-300 hover:text-red-200"
          >
            <LogOut size={20} />
            {sidebarOpen && <span className="text-sm font-medium">Odhlásit se</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 px-8 py-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden hover:bg-gray-100 p-2 rounded"
              >
                <Menu size={24} />
              </button>
              {canGoBack && (
                <button
                  onClick={() => window.history.back()}
                  className="hidden sm:flex items-center space-x-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-2 py-1 rounded transition"
                  title="Přejít zpět"
                >
                  <ArrowLeft size={18} />
                </button>
              )}
            </div>

            <div className="flex items-center space-x-6">
              <select className="text-gray-700 font-medium bg-transparent hover:bg-gray-50 px-3 py-1 rounded cursor-pointer">
                <option>CZ</option>
                <option>SK</option>
                <option>EN</option>
              </select>

              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold cursor-pointer hover:bg-blue-700 transition">
                JS
              </div>
            </div>
          </div>

          {/* Breadcrumbs */}
          {breadcrumbs.length > 0 && (
            <nav className="flex items-center space-x-2 text-sm">
              {breadcrumbs.map((crumb, idx) => (
                <div key={crumb.path} className="flex items-center space-x-2">
                  <button
                    onClick={() => navigate(crumb.path)}
                    className={`hover:underline transition ${
                      idx === breadcrumbs.length - 1
                        ? 'text-gray-900 font-medium cursor-default'
                        : 'text-blue-600 hover:text-blue-700'
                    }`}
                  >
                    {crumb.label}
                  </button>
                  {idx < breadcrumbs.length - 1 && (
                    <ChevronRight size={16} className="text-gray-400" />
                  )}
                </div>
              ))}
            </nav>
          )}
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
