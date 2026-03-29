export interface User {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'pricing_manager' | 'category_manager' | 'read_only'
  is_active: boolean
  is_verified?: boolean
  is_approved?: boolean
  email_verified_at?: string
  approved_at?: string
}

export interface Product {
  id: string
  name: string
  sku: string
  category?: string
  description?: string
  created_at: string
  updated_at: string
}

export interface Price {
  id: string
  product_id: string
  market: string
  currency: string
  current_price: number
  old_price?: number
  changed_at: string
}

export interface AuditLog {
  id: string
  product_id?: string
  field_changed?: string
  old_value?: string
  new_value?: string
  action: 'create' | 'update' | 'delete'
  user_id: string
  timestamp: string
}

export interface Analytics {
  id: string
  product_id: string
  hero_score: number
  margin_risk: 'Low' | 'Medium' | 'High'
  positioning?: string
  category_rank?: number
  updated_at: string
}

export interface LoginAttempt {
  id: string
  email: string
  ip_address: string | null
  user_agent: string | null
  success: boolean
  timestamp: string
  error_message: string | null
}
