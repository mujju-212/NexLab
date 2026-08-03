import { create } from 'zustand';

interface SessionState {
  sessionId: string | null;
  isActive: boolean;
  connectedStudents: number;
  setSession: (id: string) => void;
  setActive: (active: boolean) => void;
  setConnectedStudents: (count: number) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  isActive: false,
  connectedStudents: 0,
  setSession: (id) => set({ sessionId: id }),
  setActive: (active) => set({ isActive: active }),
  setConnectedStudents: (count) => set({ connectedStudents: count }),
  reset: () => set({ sessionId: null, isActive: false, connectedStudents: 0 }),
}));
