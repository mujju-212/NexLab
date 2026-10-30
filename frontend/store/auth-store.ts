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

// Ensure initial state is strictly identical on Server and Client to eliminate hydration mismatch and CLS
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      hasHydrated: false,
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

