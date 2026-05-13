import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function addLog(action: 'upload' | 'download' | 'delete', target: string, details?: string) {
  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('logs').insert({
    action, target, details,
    user_id: user?.id ?? null,
    user_email: user?.email ?? null,
  })
}
