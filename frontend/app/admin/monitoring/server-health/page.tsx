import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Server Health | AI Virtual Lab' };

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Server Health</h1>
      <p className="text-gray-500 mb-6">Real-time server health metrics.</p>
    </div>
  );
}

