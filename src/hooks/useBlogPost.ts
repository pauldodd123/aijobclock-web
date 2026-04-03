'use client';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { BlogPost } from './useBlogPosts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function useBlogPost(slug: string) {
  return useQuery({
    queryKey: ['blog-post', slug],
    queryFn: async () => {
      const supabase = createClient();
      const query = (supabase as any).from('blog_posts').select('*');
      const { data, error } = await (UUID_RE.test(slug)
        ? query.eq('id', slug).single()
        : query.eq('slug', slug).single());
      if (error) throw error;
      return data as BlogPost;
    },
    enabled: !!slug,
  });
}
