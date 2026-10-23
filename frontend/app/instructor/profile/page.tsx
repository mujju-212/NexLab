'use client';

import InstructorShell from '@/components/layout/InstructorShell';
import AccountProfileForm from '@/components/account/AccountProfileForm';

export default function InstructorProfilePage() {
  return (
    <InstructorShell activePage="Profile" title="My Profile" subtitle="Manage your personal account details and password separately from teaching defaults.">
      <AccountProfileForm roleLabel="Instructor account" />
    </InstructorShell>
  );
}
