"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { FaUsers, FaMoneyBillWave, FaUserPlus, FaWhatsapp } from "react-icons/fa";

export default function DashboardClient() {
  const [stats, setStats] = useState<{ drivers: number; payments: number; invitedDrivers: number; groups: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.get('/api/dashboard/stats');
        if (mounted) setStats(res.data);
      } catch (e) {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false };
  }, []);

  const cards = [
    { title: 'נהגים', value: stats?.drivers ?? 0, icon: <FaUsers className="h-6 w-6 text-[#2E7D32]" /> },
    { title: 'תשלומים', value: stats?.payments ?? 0, icon: <FaMoneyBillWave className="h-6 w-6 text-[#2E7D32]" /> },
    { title: 'הזמנות', value: stats?.invitedDrivers ?? 0, icon: <FaUserPlus className="h-6 w-6 text-[#2E7D32]" /> },
    { title: 'קבוצות וואטסאפ', value: stats?.groups ?? 0, icon: <FaWhatsapp className="h-6 w-6 text-[#25D366]" /> },
  ];

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="bg-white shadow rounded-xl p-6">
          <h2 className="text-2xl font-bold text-[#1B5E20]">
            דשבורד
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            מבט-על על המערכת
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {cards.map((card) => (
            <div key={card.title} className="bg-white shadow rounded-xl p-6 flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">{card.title}</div>
                <div className="mt-2 text-3xl font-semibold text-gray-900">{loading ? '...' : card.value}</div>
              </div>
              <div className="p-3 bg-[#E8F5E9] rounded-full">
                {card.icon}
              </div>
            </div>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
