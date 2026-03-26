"use client";

import MainLayout from "@/components/layout/MainLayout";
import ProfileForm from "@/components/profile/ProfileForm";
import BotConnection from "@/components/profile/BotConnection";

export default function ProfileClient() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900">Profile</h2>
          <p className="mt-1 text-sm text-gray-500">
            Update your profile information and manage your bot connection.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900">Profile Information</h3>
            <div className="mt-6">
              <ProfileForm user={{ id: '1', name: 'User', email: 'user@example.com' }} />
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900">Bot Connection</h3>
            <div className="mt-6">
              <BotConnection />
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
} 