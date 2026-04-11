'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

interface BotStatus {
  isConnected: boolean;
  phoneNumber?: string;
}

type Step = 'idle' | 'enter-phone' | 'showing-code' | 'connected';

export default function BotConnection() {
  const [status, setStatus] = useState<BotStatus>({ isConnected: false });
  const [isLoading, setIsLoading] = useState(true);
  const [step, setStep] = useState<Step>('idle');
  const [phone, setPhone] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/waweb/whatsapp-status');
      if (!response.ok) throw new Error();
      const data = await response.json();
      const connected = Array.isArray(data) && data.some((d: { isHealthy: boolean }) => d.isHealthy);
      const phone = Array.isArray(data) && data.find((d: { isHealthy: boolean; phone?: string }) => d.isHealthy)?.phone;
      setStatus({ isConnected: connected, phoneNumber: phone || undefined });
      if (connected) setStep('connected');
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestCode = async () => {
    if (!phone.trim()) {
      toast.error('הכנס מספר טלפון');
      return;
    }
    setIsRequesting(true);
    try {
      const response = await fetch('/api/waweb/pairing-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.code) {
        throw new Error(data.message || 'Failed to get pairing code');
      }
      setPairingCode(data.code);
      setStep('showing-code');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'לא ניתן לקבל קוד חיבור';
      toast.error('שגיאה: ' + msg);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setIsLoading(true);
      await fetch(`/api/waweb/disconnect`, { method: 'POST' });
      setStatus({ isConnected: false });
      setStep('idle');
      setPairingCode('');
      toast.success('הבוט נותק בהצלחה');
    } catch {
      toast.error('שגיאה בניתוק');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="text-sm text-gray-500">טוען...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Status Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900">סטטוס חיבור</h3>
          <p className="mt-1 text-sm text-gray-500">
            {status.isConnected
              ? `מחובר עם מספר: ${status.phoneNumber}`
              : 'לא מחובר'}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
          status.isConnected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${status.isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
          {status.isConnected ? 'מחובר' : 'מנותק'}
        </span>
      </div>

      {/* Connected State */}
      {step === 'connected' && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <p className="text-sm font-medium text-green-800">הבוט מחובר ופעיל</p>
          </div>
          <button
            onClick={handleDisconnect}
            className="text-sm text-red-600 hover:text-red-800 underline"
          >
            נתק בוט
          </button>
        </div>
      )}

      {/* Idle - show connect button */}
      {step === 'idle' && (
        <button
          onClick={() => setStep('enter-phone')}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          חבר WhatsApp לבוט
        </button>
      )}

      {/* Enter Phone */}
      {step === 'enter-phone' && (
        <div className="rounded-lg border border-gray-200 p-5 space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-1">הכנס מספר WhatsApp</h4>
            <p className="text-xs text-gray-500">הכנס את המספר שברצונך לחבר לבוט (פורמט: 972XXXXXXXXX)</p>
          </div>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="972501234567"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            dir="ltr"
          />
          <div className="flex gap-2">
            <button
              onClick={handleRequestCode}
              disabled={isRequesting}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isRequesting ? 'מבקש קוד...' : 'קבל קוד חיבור'}
            </button>
            <button
              onClick={() => setStep('idle')}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      {/* Showing Pairing Code */}
      {step === 'showing-code' && pairingCode && (
        <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50 p-5 space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">קוד החיבור שלך</h4>
            <p className="text-xs text-gray-500 mt-0.5">הקוד תקף לכמה דקות</p>
          </div>

          {/* Big Code Display */}
          <div className="flex justify-center">
            <div className="rounded-xl bg-white border-2 border-indigo-300 px-8 py-4 shadow-sm">
              <p className="text-3xl font-mono font-bold tracking-[0.3em] text-indigo-700 select-all">
                {pairingCode}
              </p>
            </div>
          </div>

          {/* Instructions */}
          <div className="rounded-lg bg-white border border-gray-200 p-4 space-y-2">
            <p className="text-sm font-medium text-gray-800">איך לחבר:</p>
            <ol className="text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
              <li>פתח <strong>WhatsApp</strong> בטלפון</li>
              <li>לך ל: <strong>הגדרות → מכשירים מקושרים</strong></li>
              <li>לחץ <strong>"קשר מכשיר"</strong></li>
              <li>לחץ <strong>"קשר עם מספר טלפון"</strong> (בתחתית)</li>
              <li>הכנס את הקוד: <strong className="font-mono">{pairingCode}</strong></li>
            </ol>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setStep('enter-phone');
                setPairingCode('');
              }}
              className="flex-1 rounded-lg border border-indigo-300 px-4 py-2 text-sm text-indigo-700 hover:bg-indigo-100"
            >
              בקש קוד חדש
            </button>
            <button
              onClick={() => {
                fetchStatus();
                toast.success('בודק חיבור...');
              }}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              בדוק חיבור
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
