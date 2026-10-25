/**
 * Practice layout — the public catalog is open to everyone; opening a
 * course or exercise requires sign-in and redirects to /login with a
 * return path, then back here after auth.
 */
export default function PracticeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
