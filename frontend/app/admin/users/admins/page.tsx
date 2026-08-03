import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Admins | AI Virtual Lab' };

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Manage Admins</h1>
      <p className="text-gray-500 mb-6">View and manage administrator accounts.</p>
    </div>
  );
}

