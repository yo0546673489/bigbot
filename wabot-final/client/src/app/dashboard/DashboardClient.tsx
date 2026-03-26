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
    { title: 'Drivers', value: stats?.drivers ?? 0, icon: <FaUsers className="h-6 w-6 text-blue-600" /> },
    { title: 'Payments', value: stats?.payments ?? 0, icon: <FaMoneyBillWave className="h-6 w-6 text-green-600" /> },
    { title: 'Invited Drivers', value: stats?.invitedDrivers ?? 0, icon: <FaUserPlus className="h-6 w-6 text-emerald-600" /> },
    { title: 'WhatsApp Groups', value: stats?.groups ?? 0, icon: <FaWhatsapp className="h-6 w-6 text-[#25D366]" /> },
  ];

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900">
            Dashboard
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Overview of your system.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {cards.map((card) => (
            <div key={card.title} className="bg-white shadow rounded-lg p-6 flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">{card.title}</div>
                <div className="mt-2 text-3xl font-semibold text-gray-900">{loading ? '...' : card.value}</div>
              </div>
              <div className="p-3 bg-gray-100 rounded-full">
                {card.icon}
              </div>
            </div>
          ))}
        </div>
      </div>
    </MainLayout>
  );
} 