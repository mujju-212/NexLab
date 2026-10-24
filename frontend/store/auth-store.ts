import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import Cookies from 'js-cookie';
import type { Role } from '@/types';

interface User {
  id: string;
  email: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  role: Role;                       // now uses correct role strings from backend
  institution_id: string | null;
  institution_name?: string | null;
  institution_code?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  department_code?: string | null;
  section_name?: string | null;
  section_code?: string | null;
  batch_name?: string | null;
  program?: string | null;
  roll_number?: string | null;
  staff_id?: string | null;
  designation?: string | null;
  phone?: string | null;
  location?: string | null;
  bio?: string | null;
  profile_pic_url?: string | null;
  timezone?: string | null;
  language?: string | null;
  two_factor_enabled?: boolean;
  created_at?: string | null;
  must_change_password?: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  setHasHydrated: (val: boolean) => void;
  setUser: (user: User) => void;
  clearAuth: () => void;
}

function getInitialAuthState(): { user: User | null; isAuthenticated: boolean; hasHydrated: boolean } {
  if (typeof window === 'undefined') {
    return { user: null, isAuthenticated: false, hasHydrated: false };
  }
  try {
    const token = Cookies.get('access_token') || localStorage.getItem('access_token');
    const raw = localStorage.getItem('auth-store');
    if (raw && token) {
      const parsed = JSON.parse(raw);
      if (parsed?.state?.user) {
        return {
          user: parsed.state.user,
          isAuthenticated: true,
          hasHydrated: true,
        };
      }
    }
  } catch {}
  return { user: null, isAuthenticated: false, hasHydrated: false };
}

const initial = getInitialAuthState();

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: initial.user,
      isAuthenticated: initial.isAuthenticated,
      hasHydrated: initial.hasHydrated,
      setHasHydrated: (val) => set({ hasHydrated: val }),
      setUser: (user) => set({ user, isAuthenticated: true }),
      clearAuth: () => {
        Cookies.remove('access_token', { path: '/' });
        if (typeof window !== 'undefined') {
          localStorage.removeItem('access_token');
        }
        set({ user: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth-store',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

