'use client';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export function useGlobalStats() {
  return useQuery({
    queryKey: ['global-stats'],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('global_stats')
        .select('*')
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });
}
