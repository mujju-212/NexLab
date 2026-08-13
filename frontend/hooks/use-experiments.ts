import { useQuery } from '@tanstack/react-query';
import { experimentService } from '@/services/experiment.service';

// Fixed: experiments are fetched per-subject via /student/experiments/<subjectId>
// not via a generic /experiments endpoint

export function useExperiments(subjectId: string) {
  return useQuery({
    queryKey: ['experiments', subjectId],
    queryFn:  () => experimentService.getBySubject(subjectId),
    enabled:  !!subjectId,
    staleTime: 2 * 60 * 1000, // 2 min
  });
}
