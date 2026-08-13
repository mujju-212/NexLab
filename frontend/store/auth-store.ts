import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Role } from '@/types';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;                       // now uses correct role strings from backend
  institution_id: string | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setUser: (user) => set({ user, isAuthenticated: true }),
      clearAuth: () => set({ user: null, isAuthenticated: false }),
    }),
    { name: 'auth-store' }
  )
);
