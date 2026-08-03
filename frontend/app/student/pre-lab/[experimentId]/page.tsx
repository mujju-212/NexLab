import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Pre-Lab | AI Virtual Lab' };

export default function PreLabPage({ params }: { params: { experimentId: string } }) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Pre-Lab Preparation</h1>
      <p className="text-gray-500 mb-4">Experiment ID: {params.experimentId}</p>
      {/* Video, PDF, quiz content will be rendered here */}
    </div>
  );
}
