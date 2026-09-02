/**
 * notificationService — universal notifications for every role.
 * GET  /notifications          list + unread count
 * POST /notifications/read-all
 * GET  /notifications/unread   cheap badge poll
 */
import { apiClient } from './api-client';

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string | null;
}

export const notificationService = {
  async list(): Promise<{ notifications: NotificationRow[]; unread: number }> {
    const { data } = await apiClient.get('/notifications');
    return data;
  },
  async unreadCount(): Promise<number> {
    const { data } = await apiClient.get('/notifications/unread');
    return data.unread ?? 0;
  },
  async markAllRead(): Promise<void> {
    await apiClient.post('/notifications/read-all');
  },
  async markRead(id: string): Promise<void> {
    await apiClient.post(`/notifications/${id}/read`);
  },
};
