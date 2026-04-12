import { Metadata } from 'next';
import LoginForm from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'התחברות - BigBot',
  description: 'התחברות לחשבון',
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col justify-center py-12 sm:px-6 lg:px-8 bg-[#F6FBF7]" suppressHydrationWarning>
      <div className="sm:mx-auto sm:w-full sm:max-w-md" suppressHydrationWarning>
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-[#1B5E20]">
          BigBot
        </h2>
        <p className="mt-2 text-center text-sm text-gray-500">התחבר לחשבון הניהול</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white px-4 py-8 shadow sm:rounded-xl sm:px-10">
          <LoginForm />
        </div>
      </div>
    </div>
  );
} 