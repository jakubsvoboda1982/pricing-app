import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/index.css'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import DashboardPage from './pages/DashboardPage'
import ProductsPage from './pages/ProductsPage'
import UsersPage from './pages/UsersPage'
import AuditPage from './pages/AuditPage'
import ImportPage from './pages/ImportPage'
import ExportPage from './pages/ExportPage'
import LoginAttemptsPage from './pages/LoginAttemptsPage'
import UsersManagementPage from './pages/UsersManagementPage'
import OpportunitiesPage from './pages/OpportunitiesPage'
import SimulatorPage from './pages/SimulatorPage'
import SeasonalityPage from './pages/SeasonalityPage'
import CatalogPage from './pages/CatalogPage'
import CompetitorsPage from './pages/CompetitorsPage'
import ProductDetailPage from './pages/ProductDetailPage'
import CompetitorDetailPage from './pages/CompetitorDetailPage'
import BaselinkerPage from './pages/BaselinkerPage'
import RecommendationsPage from './pages/RecommendationsPage'
import WatchlistPage from './pages/WatchlistPage'
import { useAuthStore } from './store/auth'

const queryClient = new QueryClient()

function AppRoutes() {
  const checkAuth = useAuthStore((state) => state.checkAuth)

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/competitors" element={<CompetitorsPage />} />
        <Route path="/competitors/:id" element={<CompetitorDetailPage />} />
        <Route path="/opportunities" element={<OpportunitiesPage />} />
        <Route path="/simulator" element={<SimulatorPage />} />
        <Route path="/seasonality" element={<SeasonalityPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/export" element={<ExportPage />} />
        <Route path="/baselinker" element={<BaselinkerPage />} />
        <Route path="/recommendations" element={<RecommendationsPage />} />
        <Route path="/watchlist" element={<WatchlistPage />} />
        <Route
          path="/admin/login-attempts"
          element={
            <ProtectedRoute adminOnly>
              <LoginAttemptsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute adminOnly>
              <UsersManagementPage />
            </ProtectedRoute>
          }
        />
        <Route path="/admin" element={<Navigate to="/admin/login-attempts" replace />} />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
