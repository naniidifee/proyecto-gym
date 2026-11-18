// Vercel Function: administración/recepción invitan socios ya registrados (CU08 + CU11).
// La clave secreta de Supabase nunca se envía al navegador.
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return res.status(503).json({ error: 'Configura la clave secreta solo en el servidor de Vercel o en .env.local para desarrollo.' })
  const token = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return res.status(401).json({ error: 'Debes iniciar sesión.' })
  const memberId = Number(req.body?.member_id)
  if (!Number.isSafeInteger(memberId) || memberId <= 0) return res.status(400).json({ error: 'Identificador de socio inválido.' })

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
  const { data: checked, error: tokenError } = await admin.auth.getUser(token)
  if (tokenError || !checked?.user) return res.status(401).json({ error: 'Sesión caducada o inválida.' })
  const { data: actor, error: actorError } = await admin.from('profiles').select('id,role,is_active').eq('id', checked.user.id).maybeSingle()
  if (actorError || !actor?.is_active || !['admin', 'recepcion'].includes(actor.role)) {
    return res.status(403).json({ error: 'Solo administración o recepción pueden invitar socios.' })
  }

  const [{ data: member, error: memberError }, { data: existing, error: existingError }] = await Promise.all([
    admin.from('members').select('id,name,email').eq('id', memberId).maybeSingle(),
    admin.from('profiles').select('id').eq('member_id', memberId).maybeSingle()
  ])
  if (memberError || existingError) return res.status(500).json({ error: 'No se pudo verificar la ficha del socio.' })
  if (!member) return res.status(404).json({ error: 'Socio inexistente.' })
  if (existing) return res.status(409).json({ error: 'Este socio ya tiene cuenta de acceso.' })
  const email = String(member.email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180) {
    return res.status(400).json({ error: 'Corrige el correo del socio antes de invitarlo.' })
  }

  const base = process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, '')
  const options = { data: { full_name: member.name } }
  if (base) options.redirectTo = `${base}/set-password`
  const { data: invited, error: invitationError } = await admin.auth.admin.inviteUserByEmail(email, options)
  if (invitationError || !invited?.user) {
    return res.status(409).json({ error: invitationError?.message || 'No se pudo enviar la invitación. Comprueba que el correo no pertenezca a otra cuenta.' })
  }

  const { error: profileError } = await admin.from('profiles').insert({ id: invited.user.id, full_name: member.name, role: 'socio', member_id: memberId, is_active: true })
  if (profileError) {
    await admin.auth.admin.deleteUser(invited.user.id)
    return res.status(500).json({ error: 'No se pudo vincular la cuenta con el socio. La invitación no quedó activa; inténtalo nuevamente.' })
  }
  await admin.from('audit_log').insert({ actor_id: actor.id, action: 'INVITAR_SOCIO', entity: 'member', entity_id: memberId })
  return res.status(201).json({ message: `Invitación enviada a ${email}. El socio establecerá su propia contraseña.`, redirect: actor.role === 'recepcion' ? `/members/${memberId}/account` : `/members/${memberId}` })
}
