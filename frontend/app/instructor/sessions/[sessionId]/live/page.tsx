import { redirect } from 'next/navigation';

// Live monitoring lives in the Live Lab page; forward the session id.
export default async function LiveSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  redirect(`/instructor/live-lab?session=${sessionId}`);
}
