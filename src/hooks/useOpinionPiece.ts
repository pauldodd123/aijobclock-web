'use client';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export function useOpinionPiece() {
  return useQuery({
    queryKey: ['opinion-piece'],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await (supabase as any)
        .from('opinion_pieces')
        .select('*, blog_posts!opinion_pieces_blog_post_id_fkey(slug)')
        .eq('active', true)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const item = data?.[0] ?? null;
      if (item?.blog_posts?.slug) {
        item.blog_slug = item.blog_posts.slug;
      }
      return item;
    },
    refetchInterval: 60000,
  });
}
