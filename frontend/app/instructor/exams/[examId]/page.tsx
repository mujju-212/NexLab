import { redirect } from 'next/navigation';

export default function ExamDetailRedirectPage({ params }: { params: { examId: string } }) {
  redirect(`/instructor/exams/${params.examId}/edit`);
}
