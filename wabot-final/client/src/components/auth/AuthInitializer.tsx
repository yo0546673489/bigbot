'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getAuthToken } from '@/utils/auth';

export default function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { logout } = useAuthStore();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    // Only hydrate auth state on the client
    const token = getAuthToken();
    if (token) {
      useAuthStore.setState({ isAuthenticated: true });
    } else {
      logout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isClient) return null;

  return <>{children}</>;
} 