import { redirect } from 'next/navigation';

/** Legacy route retained for bookmarks; the canonical page lives under the library. */
export default function IndividualQuestRedirect() {
  redirect('/practice/library/quest');
}
