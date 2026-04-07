import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { Menu, LogOut, BarChart3, Package, Users, AlertCircle, Download, Upload, Menu as MenuIcon, Shield, Zap, Calendar, ChevronRight, ArrowLeft, Link2, Scale, Layers, Filter } from 'lucide-react'
import { useDisplayStore } from '@/store/display'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { logout, user } = useAuthStore()
  const { viewMode, setViewMode } = useDisplayStore()

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
        { id: 'recommendations', label: 'Doporučení cen', icon: AlertCircle, path: '/recommendations' },
        { id: 'simulator', label: 'Simulátor co-když', icon: Zap, path: '/simulator' },
        { id: 'seasonality', label: 'Sezónní engine', icon: Calendar, path: '/seasonality' },
        { id: 'watchlist', label: 'Sledované produkty', icon: Package, path: '/watchlist' },
        { id: 'matching', label: 'Párovací centrum', icon: Scale, path: '/matching' },
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

            <div className="flex items-center gap-3">
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(v => !v)}
                  className="flex items-center gap-2 bg-white border border-gray-200 hover:border-gray-300 px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                >
                  <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {(user?.email?.[0] ?? 'U').toUpperCase()}
                  </div>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${viewMode === 'multi' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {viewMode === 'multi' ? 'Multi-trh' : 'Market tabs'}
                  </span>
                </button>

                {userMenuOpen && (
                  <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                    {/* Menu */}
                    <div className="absolute right-0 top-12 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                      {/* User info */}
                      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                        <p className="text-sm font-semibold text-gray-900 truncate">{user?.email ?? '—'}</p>
                        <p className="text-xs text-gray-400 mt-0.5 capitalize">{user?.role ?? 'uživatel'}</p>
                      </div>

                      {/* Volba zobrazení */}
                      <div className="px-4 py-3 border-b border-gray-100">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Volba zobrazení</p>
                        <div className="space-y-1">
                          <button
                            onClick={() => { setViewMode('tabs'); setUserMenuOpen(false) }}
                            className={`w-full text-left px-3 py-2 rounded-lg flex items-start gap-2.5 transition ${viewMode === 'tabs' ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}`}
                          >
                            <Filter size={14} className={`mt-0.5 flex-shrink-0 ${viewMode === 'tabs' ? 'text-blue-600' : 'text-gray-400'}`} />
                            <div>
                              <p className={`text-sm font-medium ${viewMode === 'tabs' ? 'text-blue-700' : 'text-gray-700'}`}>Market tabs</p>
                              <p className="text-xs text-gray-400 mt-0.5">Jeden trh najednou, přepínání záložkami</p>
                            </div>
                            {viewMode === 'tabs' && <div className="ml-auto w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
                          </button>
                          <button
                            onClick={() => { setViewMode('multi'); setUserMenuOpen(false) }}
                            className={`w-full text-left px-3 py-2 rounded-lg flex items-start gap-2.5 transition ${viewMode === 'multi' ? 'bg-purple-50 border border-purple-200' : 'hover:bg-gray-50 border border-transparent'}`}
                          >
                            <Layers size={14} className={`mt-0.5 flex-shrink-0 ${viewMode === 'multi' ? 'text-purple-600' : 'text-gray-400'}`} />
                            <div>
                              <p className={`text-sm font-medium ${viewMode === 'multi' ? 'text-purple-700' : 'text-gray-700'}`}>Multi-trh</p>
                              <p className="text-xs text-gray-400 mt-0.5">Všechny trhy najednou v sloupcích</p>
                            </div>
                            {viewMode === 'multi' && <div className="ml-auto w-2 h-2 rounded-full bg-purple-500 mt-1.5 flex-shrink-0" />}
                          </button>
                        </div>
                      </div>

                      {/* Odhlásit */}
                      <div className="px-4 py-2">
                        <button
                          onClick={() => { handleLogout(); setUserMenuOpen(false) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
                        >
                          <LogOut size={14} />
                          Odhlásit se
                        </button>
                      </div>
                    </div>
                  </>
                )}
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
