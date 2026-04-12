"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

interface MatchedItem {
  hash: string;
  message: string;
  bigbotTime: string;
  drybotTime: string;
  latencyDiffMs: number;
  bigbotLatencyMs: number;
  groupName: string;
  parsedOrigin: string;
  parsedPrice: string;
}

interface MissedItem {
  hash: string;
  message: string;
  drybotTime: string;
  parsedOrigin: string;
  parsedPrice: string;
  skipReason: string;
  groupName: string;
}

interface ExtraItem {
  hash: string;
  message: string;
  bigbotTime: string;
  groupName: string;
  parsedOrigin: string;
}

interface Report {
  run: {
    runId: string;
    driverPhone: string;
    drybotPhone: string;
    keywords: string[];
    startedAt: string;
    endsAt: string;
    durationMinutes: number;
  };
  summary: {
    totalDrybotRides: number;
    totalBigbotRecognized: number;
    matched: number;
    appMissed: number;
    appExtra: number;
    coveragePercent: number;
  };
  latency: {
    avgBigbotMs: number;
    bigbotFasterCount: number;
    drybotFasterCount: number;
  };
  matched: MatchedItem[];
  appMissed: MissedItem[];
  appExtra: ExtraItem[];
}

export default function BenchmarkReportPage() {
  const { runId } = useParams<{ runId: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    (async () => {
      try {
        const res = await api.get(`/api/benchmark/${runId}/report`);
        if (res.data?.error) setError(res.data.error);
        else setReport(res.data);
      } catch (e: unknown) {
        setError((e as Error)?.message || "Failed to load report");
      } finally {
        setLoading(false);
      }
    })();
  }, [runId]);

  if (loading) return (
    <div className="min-h-screen bg-[#F6FBF7] flex items-center justify-center">
      <p className="text-gray-500">טוען דוח...</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-[#F6FBF7] flex items-center justify-center">
      <p className="text-red-500">שגיאה: {error}</p>
    </div>
  );

  if (!report) return null;

  const { run, summary, latency, matched, appMissed, appExtra } = report;

  return (
    <div className="min-h-screen bg-[#F6FBF7] p-6" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="bb-card p-6">
          <h1 className="text-xl font-bold text-[#1B5E20] mb-1">
            דוח השוואה BigBot vs DryBot
          </h1>
          <p className="text-sm text-gray-500">
            {new Date(run.startedAt).toLocaleString("he-IL")} · {run.durationMinutes} דקות · keywords: [{run.keywords.join(", ")}]
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard label="DryBot שלח" value={summary.totalDrybotRides} color="#1565C0" />
          <SummaryCard label="BigBot זיהה" value={`${summary.matched} (${summary.coveragePercent}%)`} color="#2E7D32" />
          <SummaryCard label="פספוסים" value={summary.appMissed} color="#C62828" />
          <SummaryCard label="יצירות שווא" value={summary.appExtra} color="#E65100" />
        </div>

        {/* Latency */}
        <div className="bb-card p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">זמני תגובה</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-[#2E7D32]">{latency.avgBigbotMs}ms</p>
              <p className="text-xs text-gray-500">BigBot ממוצע</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#2E7D32]">{latency.bigbotFasterCount}</p>
              <p className="text-xs text-gray-500">BigBot מהיר יותר</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#1565C0]">{latency.drybotFasterCount}</p>
              <p className="text-xs text-gray-500">DryBot מהיר יותר</p>
            </div>
          </div>
        </div>

        {/* Matched Table */}
        {matched.length > 0 && (
          <div className="bb-card p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              התאמות ({matched.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="bb-table w-full">
                <thead>
                  <tr>
                    <th>זמן</th>
                    <th>קבוצה</th>
                    <th>מוצא</th>
                    <th>BigBot</th>
                    <th>DryBot</th>
                    <th>פער</th>
                  </tr>
                </thead>
                <tbody>
                  {matched.map((m, i) => (
                    <tr key={i}>
                      <td className="text-xs">{new Date(m.bigbotTime).toLocaleTimeString("he-IL")}</td>
                      <td className="text-xs">{m.groupName?.slice(0, 20)}</td>
                      <td>{m.parsedOrigin || "-"}</td>
                      <td className="text-green-600">✅ {m.bigbotLatencyMs}ms</td>
                      <td className="text-blue-600">✅</td>
                      <td className={m.latencyDiffMs < 0 ? "text-green-600 font-bold" : "text-blue-600"}>
                        {m.latencyDiffMs > 0 ? `+${m.latencyDiffMs}ms` : `${m.latencyDiffMs}ms`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Missed */}
        {appMissed.length > 0 && (
          <div className="bb-card p-6 border-r-4 border-red-500">
            <h2 className="text-sm font-semibold text-red-700 mb-3">
              פספוסים ({appMissed.length})
            </h2>
            <div className="space-y-3">
              {appMissed.map((m, i) => (
                <div key={i} className="bg-red-50 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{m.parsedOrigin || "לא ידוע"} {m.parsedPrice ? `· ${m.parsedPrice}₪` : ""}</p>
                      <p className="text-xs text-gray-500 mt-1">{new Date(m.drybotTime).toLocaleTimeString("he-IL")} · {m.groupName || ""}</p>
                    </div>
                    <span className="bb-badge bg-red-100 text-red-700">{formatSkipReason(m.skipReason)}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-2 line-clamp-2" dir="rtl">{m.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Extra */}
        {appExtra.length > 0 && (
          <div className="bb-card p-6 border-r-4 border-orange-400">
            <h2 className="text-sm font-semibold text-orange-700 mb-3">
              יצירות שווא ({appExtra.length})
            </h2>
            <div className="space-y-2">
              {appExtra.map((m, i) => (
                <div key={i} className="bg-orange-50 rounded-lg p-3">
                  <p className="text-sm text-gray-900">{m.parsedOrigin || "לא ידוע"}</p>
                  <p className="text-xs text-gray-500">{m.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bb-card p-5 text-center" style={{ borderTop: `3px solid ${color}` }}>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function formatSkipReason(reason: string): string {
  const map: Record<string, string> = {
    no_matching_keyword: "keyword לא תואם",
    vehicle_mismatch: "סוג רכב לא מתאים",
    group_blacklisted: "קבוצה מוחרגת",
    group_filtered: "קבוצה מסוננת",
    below_min_price: "מחיר נמוך מדי",
    km_range_exceeded: "מרחק גדול מדי",
    driver_busy_or_not_approved: "נהג עסוק/לא מאושר",
    delivery_rejected: "משלוח — לא מקבל",
    not_in_trial: "לא בתקופת ניסיון",
    needs_payment: "צריך תשלום",
    no_group_event_found: "לא נמצא בקבוצות",
  };
  return map[reason] || reason;
}
