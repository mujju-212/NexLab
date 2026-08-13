'use client';

interface OutputConsoleProps {
  output: string;
  status?: 'idle' | 'running' | 'success' | 'error';
}

export function OutputConsole({ output, status = 'idle' }: OutputConsoleProps) {
  const statusColors = {
    idle: 'text-gray-400',
    running: 'text-yellow-400',
    success: 'text-green-400',
    error: 'text-red-400',
  };

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <div className="flex items-center px-4 py-2 bg-gray-900 border-b border-gray-800">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Output</span>
        <span className={`ml-auto text-xs font-medium ${statusColors[status]}`}>
          {status.toUpperCase()}
        </span>
      </div>
      <pre className="flex-1 overflow-auto p-4 text-sm text-gray-200 font-mono whitespace-pre-wrap">
        {output || 'Run your code to see output here...'}
      </pre>
    </div>
  );
}
