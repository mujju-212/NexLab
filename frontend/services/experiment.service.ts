import { apiClient } from './api-client';

export const experimentService = {
  async getAll(params?: { subjectId?: string; page?: number; limit?: number }) {
    const { data } = await apiClient.get('/experiments', { params });
    return data;
  },

  async getById(id: string) {
    const { data } = await apiClient.get(`/experiments/${id}`);
    return data;
  },

  async create(payload: unknown) {
    const { data } = await apiClient.post('/experiments', payload);
    return data;
  },

  async update(id: string, payload: unknown) {
    const { data } = await apiClient.patch(`/experiments/${id}`, payload);
    return data;
  },

  async delete(id: string) {
    await apiClient.delete(`/experiments/${id}`);
  },
};
