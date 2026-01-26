/**
 * Standard result type for server actions
 * All server actions should return this type for consistent error handling
 */
export interface ActionResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

/**
 * Default pagination settings
 */
export const DEFAULT_PAGE_SIZE = 25

export interface PaginationParams {
  page: number
  pageSize: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface FilterParams {
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

export interface SelectOption {
  label: string
  value: string
}
