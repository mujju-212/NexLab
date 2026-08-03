import { useQuery } from '@tanstack/react-query';
import { analyticsService } from '@/services/analytics.service';

export function useKnowledgeMastery(studentId: string) {
  return useQuery({
    queryKey: ['knowledge-mastery', studentId],
    queryFn: () => analyticsService.getKnowledgeMastery(studentId),
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000, // 5 min
  });
}
