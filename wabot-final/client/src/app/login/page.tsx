import { Metadata } from 'next';
import LoginForm from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'התחברות - BigBot',
  description: 'התחברות לחשבון',
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#F6FBF7] via-[#E8F5E9] to-[#F6FBF7]" suppressHydrationWarning>
      <div className="w-full max-w-md mx-4" suppressHydrationWarning>
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1B5E20] to-[#2E7D32] shadow-lg mb-4">
            <span className="text-white text-2xl font-bold">B</span>
          </div>
          <h1 className="text-3xl font-bold text-[#1B5E20]">BigBot</h1>
          <p className="mt-1 text-sm text-gray-500">התחבר לחשבון הניהול</p>
        </div>

        {/* Card */}
        <div className="bb-card p-8">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
