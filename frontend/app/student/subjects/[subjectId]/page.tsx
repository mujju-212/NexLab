import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Subject | AI Virtual Lab' };

export default function SubjectPage({ params }: { params: { subjectId: string } }) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Subject</h1>
      <p className="text-gray-500">Subject ID: {params.subjectId}</p>
    </div>
  );
}
