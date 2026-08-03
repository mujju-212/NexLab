import { apiClient } from './api-client';

export const submissionService = {
  async submit(payload: { sessionId: string; code: string; language: string }) {
    const { data } = await apiClient.post('/submissions', payload);
    return data;
  },

  async getMySubmissions(params?: { sessionId?: string }) {
    const { data } = await apiClient.get('/submissions/me', { params });
    return data;
  },

  async getById(id: string) {
    const { data } = await apiClient.get(`/submissions/${id}`);
    return data;
  },

  async grade(id: string, payload: { score: number; feedback: string }) {
    const { data } = await apiClient.patch(`/submissions/${id}/grade`, payload);
    return data;
  },
};
