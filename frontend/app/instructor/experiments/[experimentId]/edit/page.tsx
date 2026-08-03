import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Edit Experiment | AI Virtual Lab' };

export default function EditExperimentPage({
  params,
}: {
  params: { experimentId: string };
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Edit Experiment</h1>
      <p className="text-gray-500">Experiment ID: {params.experimentId}</p>
    </div>
  );
}
