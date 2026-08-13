'use client';

interface Hint {
  id: string;
  level: 1 | 2 | 3;
  content: string;
  timestamp: string;
}

interface AIHintPanelProps {
  hints?: Hint[];
  onRequestHint?: () => void;
  isLoading?: boolean;
}

export function AIHintPanel({ hints = [], onRequestHint, isLoading }: AIHintPanelProps) {
  return (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-white">AI Assistant</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {hints.length === 0 && (
          <p className="text-gray-500 text-sm">No hints yet. Click below to get help.</p>
        )}
        {hints.map((hint) => (
          <div
            key={hint.id}
            className="rounded-lg p-3 bg-blue-900/30 border border-blue-800 text-sm text-blue-200"
          >
            <span className="text-xs font-medium text-blue-400 block mb-1">
              Hint Level {hint.level}
            </span>
            {hint.content}
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-gray-800">
        <button
          onClick={onRequestHint}
          disabled={isLoading}
          className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium transition"
        >
          {isLoading ? 'Thinking...' : '💡 Get a Hint'}
        </button>
      </div>
    </div>
  );
}
