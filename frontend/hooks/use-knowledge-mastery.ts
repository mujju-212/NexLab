import { useQuery } from '@tanstack/react-query';
import { analyticsService } from '@/services/analytics.service';

// Mastery is fetched from /api/student/mastery for the current user
// (backend uses JWT to determine student — no studentId param needed)

export function useKnowledgeMastery() {
  return useQuery({
    queryKey: ['knowledge-mastery'],
    queryFn:  () => analyticsService.getMastery(),
    staleTime: 5 * 60 * 1000, // 5 min
  });
}
