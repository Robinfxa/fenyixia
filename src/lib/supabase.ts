/**
 * @deprecated Supabase has been deprecated and replaced by DuckDB backend and apiClient.ts
 */

export const supabase: any = {
  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
  },
  from: () => ({
    select: () => ({ eq: () => ({ data: null, error: null }) }),
  }),
};

export default supabase;
