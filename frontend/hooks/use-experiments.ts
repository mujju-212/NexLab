import { useQuery } from '@tanstack/react-query';
import { experimentService } from '@/services/experiment.service';

export function useExperiments(params?: { subjectId?: string }) {
  return useQuery({
    queryKey: ['experiments', params],
    queryFn: () => experimentService.getAll(params),
  });
}

export function useExperiment(id: string) {
  return useQuery({
    queryKey: ['experiments', id],
    queryFn: () => experimentService.getById(id),
    enabled: !!id,
  });
}
