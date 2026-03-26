import { Metadata } from 'next';
import ProfileClient from './ProfileClient';

export const metadata: Metadata = {
  title: 'Profile | Travel Companion',
  description: 'Manage your profile and bot connection',
};

export default function ProfilePage() {
  return <ProfileClient />;
} 