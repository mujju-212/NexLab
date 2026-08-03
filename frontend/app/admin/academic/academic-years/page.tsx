import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Academic Years | AI Virtual Lab' };

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Academic Years</h1>
      <p className="text-gray-500 mb-6">Manage academic year configurations.</p>
    </div>
  );
}

