/**
 * Global search type definitions
 */

export type SearchResultType = 'lead' | 'customer' | 'offer' | 'project'

export interface SearchResult {
  id: string
  type: SearchResultType
  title: string
  subtitle: string
  url: string
}

export interface SearchResponse {
  success: boolean
  results?: SearchResult[]
  counts?: Record<SearchResultType, number>
  error?: string
}
