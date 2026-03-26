'use client'

import { DriversInvites } from './DriversInvites'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'

const queryClient = new QueryClient()

export default function DriversPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <DriversInvites />
    </QueryClientProvider>
  )
} 