// /student/practice/study-plans — redirects to library page with study plans tab active
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function StudentStudyPlansRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/student/practice?tab=plans'); }, [router]);
  return null;
}
