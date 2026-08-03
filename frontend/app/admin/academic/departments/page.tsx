import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Departments | AI Virtual Lab' };

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Departments</h1>
      <p className="text-gray-500 mb-6">Manage departments and faculties.</p>
    </div>
  );
}

