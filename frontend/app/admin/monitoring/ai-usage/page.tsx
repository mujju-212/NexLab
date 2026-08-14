import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'AI Usage | AI Virtual Lab' };

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">AI Service Usage</h1>
      <p className="text-gray-500 mb-6">Groq API usage, costs, and quotas.</p>
    </div>
  );
}

