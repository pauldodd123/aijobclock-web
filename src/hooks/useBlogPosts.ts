'use client';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export interface BlogPost {
  id: string;
  slug: string;
  sector: string;
  title: string;
  content: string;
  summary: string | null;
  published_date: string;
  created_at: string;
}

export function useBlogPosts(sector?: string) {
  return useQuery({
    queryKey: ['blog-posts', sector],
    queryFn: async () => {
      const supabase = createClient();
      let query = (supabase as any)
        .from('blog_posts')
        .select('*')
        .order('published_date', { ascending: false })
        .limit(50);

      if (sector && sector !== 'All') {
        query = query.eq('sector', sector);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as BlogPost[];
    },
  });
}
