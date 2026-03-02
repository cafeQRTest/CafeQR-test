export default function handler(req, res) {
  const resolvedSupabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const env = {
    hasUrl: !!resolvedSupabaseUrl,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    url: resolvedSupabaseUrl || 'MISSING'
  }
  
  res.json(env)
}
