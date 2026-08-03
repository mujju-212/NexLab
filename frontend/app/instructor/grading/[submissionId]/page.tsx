import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Grade Submission | AI Virtual Lab' };

export default function GradeSubmissionPage({
  params,
}: {
  params: { submissionId: string };
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Grade Submission</h1>
      <p className="text-gray-500">Submission ID: {params.submissionId}</p>
    </div>
  );
}
