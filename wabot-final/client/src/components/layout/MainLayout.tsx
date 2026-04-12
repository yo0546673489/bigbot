"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { LayoutDashboard, Users, CreditCard, UserPlus, MessageSquare, MapPin, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const navigation = [
    { name: 'דשבורד', href: '/dashboard', icon: LayoutDashboard },
    { name: 'משתמשים', href: '/drivers', icon: Users },
    { name: 'תשלומים', href: '/payments', icon: CreditCard },
    { name: 'הזמנות', href: '/invites', icon: UserPlus },
    { name: 'קבוצות וואטסאפ', href: '/whatsapp-groups', icon: MessageSquare },
    { name: 'אזורים', href: '/areas.html', icon: MapPin },
  ];

  return (
    <div className="min-h-screen bg-[#F6FBF7]">
      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 right-0 z-50 w-64 transform transition-transform duration-200 ease-in-out",
        isSidebarOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="flex flex-col h-full bg-gradient-to-b from-[#1B5E20] to-[#2E7D32] shadow-2xl">
          {/* Logo */}
          <div className="px-6 pt-7 pb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <span className="text-white text-lg font-bold">B</span>
              </div>
              <div>
                <h1 className="text-white text-lg font-bold tracking-tight">BigBot</h1>
                <p className="text-white/60 text-xs">ניהול מערכת</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              // Areas page is a static HTML file in public/ — use <a> for full reload
              const LinkTag = item.href === '/areas.html' ? 'a' : Link;
              return (
                <LinkTag
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                    isActive
                      ? "bg-white/20 text-white shadow-sm"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.2 : 1.8} />
                  {item.name}
                </LinkTag>
              );
            })}
          </nav>

          {/* Logout */}
          <div className="p-3 mt-auto">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white transition-all duration-150"
            >
              <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} />
              התנתק
            </button>
          </div>
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute top-6 -left-4 w-8 h-8 bg-white rounded-full shadow-lg border border-[#E0F2E9] flex items-center justify-center hover:bg-[#F6FBF7] transition-colors"
        >
          {isSidebarOpen ? (
            <ChevronRight className="w-4 h-4 text-[#2E7D32]" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-[#2E7D32]" />
          )}
        </button>
      </div>

      {/* Main Content */}
      <div className={cn(
        "min-h-screen transition-all duration-200 ease-in-out",
        isSidebarOpen ? "pr-64" : "pr-0"
      )}>
        <main className="p-6 max-w-[1400px]">
          {children}
        </main>
      </div>
    </div>
  );
}
