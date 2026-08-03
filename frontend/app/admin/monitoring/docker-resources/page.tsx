import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Docker Resources | AI Virtual Lab' };

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Docker Resources</h1>
      <p className="text-gray-500 mb-6">Container resource utilization overview.</p>
    </div>
  );
}

