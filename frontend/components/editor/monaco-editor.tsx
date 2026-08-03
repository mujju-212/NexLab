'use client';

import Editor from '@monaco-editor/react';

interface MonacoEditorProps {
  value?: string;
  language?: string;
  onChange?: (value: string | undefined) => void;
  readOnly?: boolean;
}

export function MonacoEditor({
  value = '',
  language = 'python',
  onChange,
  readOnly = false,
}: MonacoEditorProps) {
  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      theme="vs-dark"
      onChange={onChange}
      options={{
        readOnly,
        fontSize: 14,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        lineNumbers: 'on',
        folding: true,
        tabSize: 4,
      }}
    />
  );
}
