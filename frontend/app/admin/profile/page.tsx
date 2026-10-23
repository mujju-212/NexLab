'use client';

import AdminShell from '@/components/layout/AdminShell';
import AccountProfileForm from '@/components/account/AccountProfileForm';

export default function AdminProfilePage() {
  return (
    <AdminShell activePage="Profile" title="My Profile" subtitle="Manage your personal platform account and password. Platform controls remain under Settings.">
      <AccountProfileForm roleLabel="Platform administrator account" />
    </AdminShell>
  );
}
