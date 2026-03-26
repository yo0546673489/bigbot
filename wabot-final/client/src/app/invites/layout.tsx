import { Metadata } from 'next'
import ProtectedRoute from '@/components/auth/ProtectedRoute';

export const metadata: Metadata = {
  title: 'Drivers | Travel Companion',
  description: 'Manage drivers and their registrations',
}

export default function DriversInvitesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-100">
        {children}
      </div>
    </ProtectedRoute>
  );
} 