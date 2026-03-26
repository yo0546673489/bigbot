'use client';

import { WhatsAppGroupsClient } from './WhatsAppGroupsClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

const queryClient = new QueryClient();

export default function WhatsappGroupsPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <WhatsAppGroupsClient />
    </QueryClientProvider>
  );
}
