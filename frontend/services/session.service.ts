import { apiClient } from './api-client';

export const sessionService = {
  async getAll(params?: { status?: string }) {
    const { data } = await apiClient.get('/sessions', { params });
    return data;
  },

  async getById(id: string) {
    const { data } = await apiClient.get(`/sessions/${id}`);
    return data;
  },

  async schedule(payload: unknown) {
    const { data } = await apiClient.post('/sessions', payload);
    return data;
  },

  async start(id: string) {
    const { data } = await apiClient.post(`/sessions/${id}/start`);
    return data;
  },

  async end(id: string) {
    const { data } = await apiClient.post(`/sessions/${id}/end`);
    return data;
  },
};
