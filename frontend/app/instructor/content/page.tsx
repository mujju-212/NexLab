import { redirect } from 'next/navigation';

// Content Library has been merged into the experiment editor to remove the
// duplicate content-management surface. Pre-lab content is now managed per
// experiment under Experiments → (pick one) → "Pre-lab Content" tab.
// This route redirects to the experiments list so old links keep working.
export default function ContentLibraryRedirect() {
  redirect('/instructor/experiments');
}
