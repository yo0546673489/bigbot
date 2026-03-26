'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { isAuthenticated } from '@/utils/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isClient && !user && !isAuthenticated) {
      router.push('/login');
    }
  }, [user, router, isClient, isAuthenticated]);

  if (!isClient) {
    return null;
  }

  if (!user && !isAuthenticated) {
    return null;
  }

  return <>{children}</>;
} 