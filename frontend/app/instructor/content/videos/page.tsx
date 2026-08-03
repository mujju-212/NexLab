import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Videos | AI Virtual Lab' };

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Video Content</h1>
      <p className="text-gray-500 mb-6">Manage pre-lab instructional videos.</p>
    </div>
  );
}

