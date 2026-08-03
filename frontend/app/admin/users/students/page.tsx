import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Students | AI Virtual Lab' };

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Manage Students</h1>
      <p className="text-gray-500 mb-6">View, create, and manage student accounts.</p>
    </div>
  );
}

