'use client';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export const PAGE_SIZE = 8;

export function useNewsArticles(sector?: string, page: number = 0) {
  return useQuery({
    queryKey: ['news-articles', sector, page],
    queryFn: async () => {
      const supabase = createClient();
      const from = 0;
      const to = (page + 1) * PAGE_SIZE - 1;

      let query = supabase
        .from('news_articles')
        .select('*', { count: 'exact' })
        .order('scraped_at', { ascending: false })
        .range(from, to);

      if (sector && sector !== 'All') {
        query = query.eq('sector', sector);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { articles: data ?? [], totalCount: count ?? 0 };
    },
    refetchInterval: 60000,
  });
}
