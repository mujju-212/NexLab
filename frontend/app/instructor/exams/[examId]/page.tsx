import { redirect } from 'next/navigation';

// Next.js 15: `params` is a Promise in server components and must be awaited.
export default async function ExamDetailRedirectPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  redirect(`/instructor/exams/${examId}/edit`);
}
