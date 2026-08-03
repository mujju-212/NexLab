import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Judge0 Usage | AI Virtual Lab' };

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Judge0 Usage</h1>
      <p className="text-gray-500 mb-6">Code execution engine metrics and quotas.</p>
    </div>
  );
}

