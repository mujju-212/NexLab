/**
 * practiceExtraService — free-user enhancement round 2:
 * recommendations, bookmarks, collections, playground save/share,
 * contests, public showcase, certificates, AI meter.
 */
import { apiClient } from './api-client';

export interface RecommendedProblem {
  id: string; slug: string; title: string; difficulty: string;
  nexlab_topic: string; acceptance: number; reason: string;
}

export interface BookmarkRow {
  id: string; problem_id: string; note?: string | null; created_at?: string | null;
  problem?: { slug: string; title: string; difficulty: string; nexlab_topic: string };
}

export interface CollectionRow {
  id: string; title: string; description?: string | null;
  item_count: number; created_at?: string | null;
}

export interface CollectionItemRow {
  id: string; problem_id: string; order_index: number;
  problem: { slug: string; title: string; difficulty: string; nexlab_topic: string } | null;
}

export interface PlaygroundSessionRow {
  id: string; title: string; language: string; is_shared: boolean;
  share_slug?: string | null; created_at?: string | null; updated_at?: string | null;
  code?: string; stdin_data?: string;
}

export interface ContestRow {
  id: string; title: string; description?: string | null;
  starts_at: string; ends_at: string; status: 'upcoming' | 'live' | 'past';
  problem_count?: number; participants?: number; joined?: boolean;
}

export interface ContestLeaderRow {
  rank: number; user_id: string; name: string;
  solved: number; score: number; last_at: string | null;
}

export const practiceExtraService = {
  // ── Recommendations ────────────────────────────────────────────────────────
  async recommended(): Promise<{ recommendations: RecommendedProblem[] }> {
    const { data } = await apiClient.get('/practice/recommended');
    return data;
  },

  // ── Shell search (practice problems) ───────────────────────────────────────
  async searchProblems(q: string): Promise<Array<{ type: string; id: string; label: string; sub_label: string | null; link: string }>> {
    const { data } = await apiClient.get<{ problems: Array<{ id: string; slug: string; title: string; difficulty: string; nexlab_topic: string }> }>(
      '/practice/problems', { params: { search: q } },
    ).catch(() => ({ data: { problems: [] } }));
    return (data.problems ?? []).slice(0, 8).map(p => ({
      type: 'problem', id: p.id, label: p.title,
      sub_label: `${p.difficulty} · ${p.nexlab_topic}`,
      link: `/practice/library/${p.slug}`,
    }));
  },

  // ── Bookmarks ──────────────────────────────────────────────────────────────
  async bookmarks(): Promise<{ bookmarks: BookmarkRow[] }> {
    const { data } = await apiClient.get('/practice/bookmarks');
    return data;
  },
  async bookmarkIds(): Promise<string[]> {
    const { data } = await apiClient.get('/practice/bookmarks/ids');
    return data.starred ?? [];
  },
  async toggleBookmark(problemId: string, note?: string): Promise<{ starred: boolean }> {
    const { data } = await apiClient.post('/practice/bookmarks', { problem_id: problemId, note });
    return { starred: data.starred };
  },
  async updateBookmarkNote(bookmarkId: string, note: string): Promise<void> {
    await apiClient.patch(`/practice/bookmarks/${bookmarkId}/note`, { note });
  },

  // ── Collections ────────────────────────────────────────────────────────────
  async collections(): Promise<{ collections: CollectionRow[] }> {
    const { data } = await apiClient.get('/practice/collections');
    return data;
  },
  async createCollection(title: string, description?: string): Promise<CollectionRow> {
    const { data } = await apiClient.post<{ collection: CollectionRow }>('/practice/collections', { title, description });
    return data.collection;
  },
  async deleteCollection(id: string): Promise<void> {
    await apiClient.delete(`/practice/collections/${id}`);
  },
  async collectionItems(id: string): Promise<{ collection: CollectionRow; items: CollectionItemRow[] }> {
    const { data } = await apiClient.get(`/practice/collections/${id}/items`);
    return data;
  },
  async addToCollection(collectionId: string, problemId: string): Promise<void> {
    await apiClient.post(`/practice/collections/${collectionId}/items`, { problem_id: problemId });
  },
  async removeFromCollection(collectionId: string, itemId: string): Promise<void> {
    await apiClient.delete(`/practice/collections/${collectionId}/items/${itemId}`);
  },

  // ── Playground save/share ──────────────────────────────────────────────────
  async playgroundSessions(): Promise<{ sessions: PlaygroundSessionRow[] }> {
    const { data } = await apiClient.get('/practice/playground/sessions');
    return data;
  },
  async savePlaygroundSession(payload: { id?: string; title?: string; language: string; code: string; stdin_data?: string }): Promise<PlaygroundSessionRow> {
    const { data } = await apiClient.post<{ session: PlaygroundSessionRow }>('/practice/playground/sessions', payload);
    return data.session;
  },
  async getPlaygroundSession(id: string): Promise<PlaygroundSessionRow> {
    const { data } = await apiClient.get<{ session: PlaygroundSessionRow }>(`/practice/playground/sessions/${id}`);
    return data.session;
  },
  async deletePlaygroundSession(id: string): Promise<void> {
    await apiClient.delete(`/practice/playground/sessions/${id}`);
  },
  async sharePlaygroundSession(id: string, share: boolean): Promise<string | null> {
    if (share) {
      const { data } = await apiClient.post<{ share_slug: string; share_url: string }>(`/practice/playground/sessions/${id}/share`);
      return data.share_url;
    }
    await apiClient.delete(`/practice/playground/sessions/${id}/share`);
    return null;
  },
  async getSharedPlayground(slug: string): Promise<{ session: { title: string; language: string; code: string; stdin_data?: string }; author: string }> {
    const { data } = await apiClient.get(`/practice/playground/shared/${slug}`);
    return data;
  },

  // ── Contests ───────────────────────────────────────────────────────────────
  async contests(): Promise<{ contests: ContestRow[] }> {
    const { data } = await apiClient.get('/practice/contests');
    return data;
  },
  async contestDetail(id: string): Promise<{
    contest: ContestRow; status: string;
    problems: Array<{ id: string; slug: string; title: string; difficulty: string; nexlab_topic: string; solved: boolean }>;
    joined: boolean; solved_slugs: string[];
  }> {
    const { data } = await apiClient.get(`/practice/contests/${id}`);
    return data;
  },
  async joinContest(id: string): Promise<void> {
    await apiClient.post(`/practice/contests/${id}/join`);
  },
  async contestLeaderboard(id: string): Promise<{ leaderboard: ContestLeaderRow[]; my_rank: number | null }> {
    const { data } = await apiClient.get(`/practice/contests/${id}/leaderboard`);
    return data;
  },

  // ── Public showcase ────────────────────────────────────────────────────────
  async toggleShowcase(on: boolean): Promise<{ profile_public: boolean; profile_slug: string | null }> {
    const { data } = await apiClient.patch('/practice/showcase', { profile_public: on });
    return data;
  },
  async myShowcase(): Promise<{ profile_public: boolean; profile_slug: string | null; public_url: string | null }> {
    const { data } = await apiClient.get('/practice/showcase/me');
    return data;
  },
  async publicShowcase(slug: string): Promise<{
    display_name: string;
    xp: { total_xp: number; level: number; level_name: string; streak_days: number; problems_solved: number; easy: number; medium: number; hard: number };
    badges: Array<{ badge_id: string; [k: string]: unknown }>;
    recent_solves: Array<{ title: string; slug: string | null; difficulty: string | null; solved_at: string | null }>;
  }> {
    const { data } = await apiClient.get(`/practice/showcase/${slug}`);
    return data;
  },

  // ── AI meter widget ────────────────────────────────────────────────────────
  async aiMeter(): Promise<{ used: number; limit: number; remaining: number }> {
    const { data } = await apiClient.get('/practice/meter');
    return data;
  },

  // ── Certificates ───────────────────────────────────────────────────────────
  async downloadCertificate(planId: string) {
    const res = await apiClient.get(`/practice/plans/${planId}/certificate`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexlab_certificate_${planId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
