'use client'

import { DriversClient } from './DriversClient'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'

const queryClient = new QueryClient()

export default function DriversPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <DriversClient />
    </QueryClientProvider>
  )
} 