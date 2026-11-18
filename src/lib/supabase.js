import { createClient } from '@supabase/supabase-js'

export const supabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL?.startsWith('https://') &&
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY &&
  !import.meta.env.VITE_SUPABASE_URL?.includes('TU_PROYECTO')
)

export const supabase = supabaseConfigured
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
    })
  : null

/** Lee datos por función SQL con comprobación de rol en el servidor. */
export async function getGymPage(path, query = {}) {
  if (!supabase) throw new Error('Configura Supabase en .env.local para utilizar los módulos del gimnasio.')
  const { data, error } = await supabase.rpc('gym_page', { p_path: path, p_query: query })
  if (error) throw new Error(error.message)
  return data
}

/** Cada mutación usa una transacción PostgreSQL y verifica permisos. */
export async function gymAction(action, form) {
  if (!supabase) throw new Error('Falta configurar Supabase.')
  if (action === '/members/new') {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Debes iniciar sesión como recepcionista.')
    const response = await fetch('/api/register-member', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password
      })
    })
    let result
    try { result = await response.json() } catch {
      throw new Error('El servidor no devolvió una respuesta válida al registrar al socio.')
    }
    if (!response.ok) throw new Error(result.error || 'No se pudo registrar al socio.')
    return { redirect: result.redirect, message: result.message }
  }
  if (/^\/members\/\d+\/account$/.test(action)) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Inicia sesión para invitar al socio.')
    const response = await fetch('/api/create-member-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ member_id: Number(action.split('/')[2]) })
    })
    let result
    try { result = await response.json() } catch { throw new Error('Respuesta inválida del servidor de cuentas.') }
    if (!response.ok) throw new Error(result.error || 'No se pudo crear la cuenta.')
    return { redirect: result.redirect || `/members/${action.split('/')[2]}`, message: result.message }
  }
  if (action === '/staff/invite') {
    const {data:{session}}=await supabase.auth.getSession()
    if (!session) throw new Error('Inicia sesión como administrador.')
    const response=await fetch('/api/invite-receptionist',{
      method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
      body: JSON.stringify({
              full_name: form.full_name,
              email: form.email,
              password: form.password
            })
    })
    let result
    try { result=await response.json() } catch {throw new Error('Respuesta inválida del servicio de invitaciones.')}
    if (!response.ok) throw new Error(result.error||'No se pudo invitar al recepcionista.')
    return {redirect:'/staff',message:result.message}
  }
  const { data, error } = await supabase.rpc('gym_action', { p_action: action, p_form: form })
  if (error) throw new Error(error.message)
  return data
}
