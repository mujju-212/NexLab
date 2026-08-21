// /practice/library/study-plans — list redirect (IndividualShell nav points here)
// Redirects to main library page with the Study Plans tab pre-selected
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function IndividualStudyPlansListPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/practice/library?tab=plans');
  }, [router]);
  return null;
}
