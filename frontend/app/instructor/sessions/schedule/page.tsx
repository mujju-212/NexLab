import { redirect } from 'next/navigation';

// Scheduling now lives in the Sessions page wizard.
export default function Page() {
  redirect('/instructor/sessions');
}
