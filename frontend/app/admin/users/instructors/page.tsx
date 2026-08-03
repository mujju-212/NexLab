import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Instructors | AI Virtual Lab' };

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Manage Instructors</h1>
      <p className="text-gray-500 mb-6">View, create, and manage instructor accounts.</p>
    </div>
  );
}

