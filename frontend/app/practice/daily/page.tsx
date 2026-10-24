import { redirect } from 'next/navigation';

/** Legacy route retained for bookmarks; the canonical page lives under the library. */
export default function IndividualDailyRedirect() {
  redirect('/practice/library/daily');
}
