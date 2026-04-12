"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Users, CreditCard, UserPlus, MessageSquare, TrendingUp } from 'lucide-react';

export default function DashboardClient() {
  const [stats, setStats] = useState<{ drivers: number; payments: number; invitedDrivers: number; groups: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.get('/api/dashboard/stats');
        if (mounted) setStats(res.data);
      } catch {}
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false };
  }, []);

  const cards = [
    { title: 'נהגים פעילים', value: stats?.drivers ?? 0, icon: Users, color: '#2E7D32', bg: '#E8F5E9', border: '#2E7D32' },
    { title: 'תשלומים', value: stats?.payments ?? 0, icon: CreditCard, color: '#1565C0', bg: '#E3F2FD', border: '#1565C0' },
    { title: 'הזמנות', value: stats?.invitedDrivers ?? 0, icon: UserPlus, color: '#6A1B9A', bg: '#F3E5F5', border: '#6A1B9A' },
    { title: 'קבוצות וואטסאפ', value: stats?.groups ?? 0, icon: MessageSquare, color: '#E65100', bg: '#FFF3E0', border: '#E65100' },
  ];

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bb-page-header">
          <h2 className="text-xl font-bold text-[#1B5E20]">דשבורד</h2>
          <p className="text-sm text-gray-500 mt-0.5">מבט-על על המערכת</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="bb-card p-5 flex items-center justify-between"
                style={{ borderRight: `4px solid ${card.border}` }}
              >
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">{card.title}</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {loading ? (
                      <span className="inline-block w-12 h-8 bg-gray-100 rounded animate-pulse" />
                    ) : card.value.toLocaleString()}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: card.bg }}>
                  <Icon className="w-6 h-6" style={{ color: card.color }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Placeholder for future charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bb-card p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#2E7D32]" />
              נסיעות — 30 ימים אחרונים
            </h3>
            <div className="h-48 bg-gradient-to-t from-[#E8F5E9] to-transparent rounded-xl flex items-end justify-center pb-6">
              <p className="text-sm text-gray-400">גרף יתווסף בקרוב</p>
            </div>
          </div>
          <div className="bb-card p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-[#1565C0]" />
              התפלגות לפי סוג רכב
            </h3>
            <div className="h-48 bg-gradient-to-t from-[#E3F2FD] to-transparent rounded-xl flex items-end justify-center pb-6">
              <p className="text-sm text-gray-400">גרף יתווסף בקרוב</p>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
