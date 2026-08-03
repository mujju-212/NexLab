import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Live Session | AI Virtual Lab' };

export default function LiveSessionPage({
  params,
}: {
  params: { sessionId: string };
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Live Session</h1>
      <p className="text-gray-500">Session ID: {params.sessionId}</p>
    </div>
  );
}
