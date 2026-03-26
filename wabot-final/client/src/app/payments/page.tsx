'use client'

import { PaymentsClient } from './PaymentsClient'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'

const queryClient = new QueryClient()

export default function PaymentsPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <PaymentsClient />
    </QueryClientProvider>
  )
} 