import { apiClient } from './api-client';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Institution {
  id: string;
  name: string;
  code: string;
  email_domain: string | null;
  logo_url: string | null;
  plan: 'free' | 'pro' | 'enterprise';
  is_active: boolean;
  contact_email: string;
  address: string | null;
  onboarded_at: string;
  onboarding_status: 'pending' | 'active' | 'suspended';
  plan_updated_at: string | null;
  billing_email: string | null;
  billing_notes: string | null;
  groq_limit_override: number | null;
  checklist: {
    has_users: boolean;
    has_experiments: boolean;
    has_environment: boolean;
  };
}

export interface CreateInstitutionDto {
  name: string;
  code: string;
  contact_email: string;
  email_domain?: string;
  address?: string;
  plan?: 'free' | 'pro' | 'enterprise';
  admin_password?: string;
  admin_name?: string;
}

export interface PlatformDashboard {
  institutions: { total: number; active: number };
  users: { total: number };
  live_sessions: { active: number };
}

export interface PlatformAnalytics {
  period_days: number;
  total_users: number;
  new_users: number;
  total_sessions: number;
  sessions_in_period: number;
  active_institutions: number;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: string | null;
  created_at: string | null;
}

// ── Admin Service ──────────────────────────────────────────────────────────────

export const adminService = {

  // ── Institution CRUD ─────────────────────────────────────────────────────────

  // GET /api/admin/institutions
  async listInstitutions(): Promise<Institution[]> {
    const { data } = await apiClient.get<{ institutions: Institution[] }>('/admin/institutions');
    return data.institutions;
  },

  // POST /api/admin/institutions
  // Creates institution + institution_admin user automatically
  async createInstitution(dto: CreateInstitutionDto): Promise<{
    institution: Institution;
    admin_user: { id: string; email: string; full_name: string };
    temp_password: string;
  }> {
    const { data } = await apiClient.post('/admin/institutions', dto);
    return data;
  },

  // GET /api/admin/institutions/<id>
  async getInstitution(id: string): Promise<{ institution: Institution; stats: Record<string, number> }> {
    const { data } = await apiClient.get(`/admin/institutions/${id}`);
    return data;
  },

  // PATCH /api/admin/institutions/<id>
  async updateInstitution(id: string, payload: Partial<Pick<Institution, 'name' | 'plan' | 'is_active' | 'email_domain'>>): Promise<Institution> {
    const { data } = await apiClient.patch<{ institution: Institution }>(`/admin/institutions/${id}`, payload);
    return data.institution;
  },

  // POST /api/admin/institutions/<id>/suspend
  async suspendInstitution(id: string, reason?: string): Promise<void> {
    await apiClient.post(`/admin/institutions/${id}/suspend`, { reason });
  },

  // POST /api/admin/institutions/<id>/activate
  async activateInstitution(id: string): Promise<void> {
    await apiClient.post(`/admin/institutions/${id}/activate`);
  },

  // POST /api/admin/institutions/<id>/reset-admin-password
  async resetAdminPassword(id: string, newPassword: string): Promise<void> {
    await apiClient.post(`/admin/institutions/${id}/reset-admin-password`, { new_password: newPassword });
  },

  // ── Platform Dashboard ───────────────────────────────────────────────────────

  // GET /api/admin/dashboard
  async getDashboard(): Promise<PlatformDashboard> {
    const { data } = await apiClient.get<PlatformDashboard>('/admin/dashboard');
    return data;
  },

  // GET /api/admin/health
  async getHealth(): Promise<{ health: Record<string, string> }> {
    const { data } = await apiClient.get('/admin/health');
    return data;
  },

  // GET /api/admin/stats/snapshot
  async getStatsSnapshot() {
    const { data } = await apiClient.get('/admin/stats/snapshot');
    return data;
  },

  // ── Platform Analytics (platform blueprint) ──────────────────────────────────

  // GET /api/platform/analytics/overview
  async getAnalyticsOverview(days = 30): Promise<PlatformAnalytics> {
    const { data } = await apiClient.get<PlatformAnalytics>('/platform/analytics/overview', { params: { days } });
    return data;
  },

  // GET /api/platform/analytics/groq-trend
  async getGroqTrend(days = 7) {
    const { data } = await apiClient.get<{ days: number; trend: { date: string; total: number }[] }>('/platform/analytics/groq-trend', { params: { days } });
    return data.trend;
  },

  // GET /api/platform/analytics/sessions-trend
  async getSessionsTrend(days = 14) {
    const { data } = await apiClient.get<{ trend: { date: string; sessions: number }[] }>('/platform/analytics/sessions-trend', { params: { days } });
    return data.trend;
  },

  // GET /api/platform/analytics/cross-institution
  async getCrossInstitutionAnalytics() {
    const { data } = await apiClient.get<{ institutions: { id: string; name: string; plan: string; users: number; sessions: number; sessions_per_user: number }[] }>('/platform/analytics/cross-institution');
    return data.institutions;
  },

  // ── Onboarding ───────────────────────────────────────────────────────────────

  // GET /api/platform/institutions/pending
  async getPendingInstitutions() {
    const { data } = await apiClient.get('/platform/institutions/pending');
    return data;
  },

  // GET /api/platform/institutions/<iid>/onboarding
  async getOnboardingChecklist(iid: string) {
    const { data } = await apiClient.get(`/platform/institutions/${iid}/onboarding`);
    return data;
  },

  // ── Platform Config & Feature Flags ─────────────────────────────────────────

  // GET /api/platform/config
  async getPlatformConfig(): Promise<{ config: Record<string, string> }> {
    const { data } = await apiClient.get('/platform/config');
    return data;
  },

  // PATCH /api/platform/config
  async updatePlatformConfig(updates: Record<string, string>): Promise<void> {
    await apiClient.patch('/platform/config', updates);
  },

  // GET /api/platform/config/features
  async getFeatureFlags(): Promise<{ features: Record<string, boolean> }> {
    const { data } = await apiClient.get('/platform/config/features');
    return data;
  },

  // PATCH /api/platform/config/features/<flag>
  async toggleFeatureFlag(flag: string, enabled: boolean): Promise<void> {
    await apiClient.patch(`/platform/config/features/${flag}`, { enabled });
  },

  // ── Groq Usage ───────────────────────────────────────────────────────────────

  // GET /api/admin/groq-usage
  async getGroqUsage() {    const { data } = await apiClient.get<{ date: string; usage: { institution_id: string; count: number }[] }>('/admin/groq-usage');
    return data;
  },

  // GET /api/platform/analytics/ai-usage/cross-institution (C6 roll-up)
  async getAiUsageCrossInstitution(days = 30): Promise<{
    days: number;
    institutions: Array<{
      institution_id: string;
      name: string;
      plan: string;
      calls: number;
      tokens: number;
      cost_usd: number;
      by_feature: Record<string, number>;
    }>;
  }> {
    const { data } = await apiClient.get('/platform/analytics/ai-usage/cross-institution', { params: { days } });
    return data;
  },

  // PATCH /api/platform/institutions/<iid>/billing/groq-limit
  async updateGroqLimit(iid: string, limit: number | null): Promise<void> {
    await apiClient.patch(`/platform/institutions/${iid}/billing/groq-limit`, { limit });
  },

  // GET /api/platform/institutions/<iid>/billing
  async getBilling(iid: string) {
    const { data } = await apiClient.get(`/platform/institutions/${iid}/billing`);
    return data;
  },

  // PATCH /api/platform/institutions/<iid>/billing/plan
  async updatePlan(iid: string, plan: string, billingEmail?: string): Promise<void> {
    await apiClient.patch(`/platform/institutions/${iid}/billing/plan`, { plan, billing_email: billingEmail });
  },

  // ── User Search ───────────────────────────────────────────────────────────────

  // GET /api/admin/users/search?q=&role=&institution_id=
  async searchUsers(params: { q?: string; role?: string; institution_id?: string }) {
    const { data } = await apiClient.get('/admin/users/search', { params });
    return data;
  },

  // ── Audit Logs ────────────────────────────────────────────────────────────────

  // GET /api/platform/audit-logs
  async getAuditLogs(params?: { institution_id?: string; days?: number; page?: number }) {
    const { data } = await apiClient.get<{ total: number; page: number; pages: number; logs: AuditLogEntry[] }>('/platform/audit-logs', { params });
    return data;
  },
};
