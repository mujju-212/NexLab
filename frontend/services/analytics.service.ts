import { apiClient } from './api-client';

export const analyticsService = {
  async getPlatformStats() {
    const { data } = await apiClient.get('/analytics/platform');
    return data;
  },

  async getStudentProgress(studentId: string) {
    const { data } = await apiClient.get(`/analytics/students/${studentId}`);
    return data;
  },

  async getExperimentInsights(experimentId: string) {
    const { data } = await apiClient.get(`/analytics/experiments/${experimentId}`);
    return data;
  },

  async getKnowledgeMastery(studentId: string) {
    const { data } = await apiClient.get(`/analytics/knowledge-mastery/${studentId}`);
    return data;
  },
};
