import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'New Experiment | AI Virtual Lab' };

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Create New Experiment</h1>
      <p className="text-gray-500 mb-6">Design a new lab experiment with tasks and test cases.</p>
    </div>
  );
}

