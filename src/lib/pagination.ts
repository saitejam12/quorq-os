import { z } from 'zod'

export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(10).max(500).default(25),
})

export type PaginationParams = z.infer<typeof PaginationSchema>

export interface PaginatedResult<T> {
  data: Array<T>
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasMore: boolean
  }
}

export function getOffset(page: number, limit: number): number {
  return (page - 1) * limit
}

export function createPaginatedResult<T>(
  data: Array<T>,
  page: number,
  limit: number,
  total: number,
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / limit)
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  }
}
