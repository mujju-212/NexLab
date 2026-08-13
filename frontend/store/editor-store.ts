import { create } from 'zustand';

interface EditorState {
  code: string;
  language: string;
  output: string;
  status: 'idle' | 'running' | 'success' | 'error';
  setCode: (code: string) => void;
  setLanguage: (language: string) => void;
  setOutput: (output: string, status?: EditorState['status']) => void;
  reset: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  code: '',
  language: 'python',
  output: '',
  status: 'idle',
  setCode: (code) => set({ code }),
  setLanguage: (language) => set({ language }),
  setOutput: (output, status = 'success') => set({ output, status }),
  reset: () => set({ code: '', output: '', status: 'idle' }),
}));
