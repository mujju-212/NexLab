import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Live Lab | AI Virtual Lab' };

export default function LiveLabPage({ params }: { params: { sessionId: string } }) {
  return (
    <div className="h-screen flex flex-col">
      <header className="px-4 py-2 bg-gray-900 text-white flex items-center justify-between">
        <h1 className="font-bold">Live Lab — Session {params.sessionId}</h1>
      </header>
      <div className="flex flex-1 overflow-hidden">
        {/* Monaco editor pane */}
        <div className="flex-1 bg-gray-950" id="editor-pane">
          {/* MonacoEditor component will be mounted here */}
        </div>
        {/* Output + AI hint panel */}
        <div className="w-80 border-l bg-gray-900" id="ai-panel">
          {/* OutputConsole and AIHintPanel will be mounted here */}
        </div>
      </div>
    </div>
  );
}
