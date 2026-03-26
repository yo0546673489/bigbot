import ProtectedRoute from '@/components/auth/ProtectedRoute';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-100">
        {/* Add your dashboard layout components here */}
        {children}
      </div>
    </ProtectedRoute>
  );
} 