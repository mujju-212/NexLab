import { redirect } from 'next/navigation';

// All content types are managed per-experiment in the Content Library.
export default function Page() {
  redirect('/instructor/experiments');
}
