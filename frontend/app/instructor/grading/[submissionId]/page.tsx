import { redirect } from 'next/navigation';

// Grading detail is handled by the Grading page modal.
export default function GradeSubmissionPage() {
  redirect('/instructor/grading');
}
