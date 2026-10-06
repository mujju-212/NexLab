import { QueryClient } from '@tanstack/react-query';

// Single shared QueryClient instance. Created at module scope on purpose:
// admin pages navigate constantly and the cache is what stops every remount
// re-fetching the world. 60s freshness is right for institution-level data
// (counts, lists); pages that mutate call invalidateQueries to refresh sooner.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
