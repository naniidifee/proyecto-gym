// CU08: recepción crea ficha y acceso de un socio en una operación guiada.
// No se envían claves administrativas al navegador; las contraseñas solo van a Supabase Auth.
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' })

  const url = process.env.VITE_SUPABASE_URL
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !secret) return res.status(503).json({ error: 'No está configurada la API de Supabase del servidor.' })

  const token = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return res.status(401).json({ error: 'Debes iniciar sesión para registrar socios.' })

  const name = String(req.body?.name ?? '').trim()
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const phone = String(req.body?.phone ?? '').trim()
  const password = String(req.body?.password ?? '')
  if (name.length < 2 || name.length > 200 || email.length > 180 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.length > 40) {
    return res.status(400).json({ error: 'Revisa el nombre, el correo electrónico y el teléfono.' })
  }
  if (password.length < 8 || password.length > 128 ||
      !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).json({
      error: 'La contraseña debe tener de 8 a 128 caracteres, con mayúscula, minúscula y número.'
    })
  }

  const admin = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  })
  const { data: tokenData, error: tokenError } = await admin.auth.getUser(token)
  if (tokenError || !tokenData?.user) return res.status(401).json({ error: 'Sesión no válida o caducada.' })

  const { data: actor, error: actorError } = await admin.from('profiles')
    .select('id,role,is_active').eq('id', tokenData.user.id).maybeSingle()
  if (actorError || actor?.role !== 'recepcion' || !actor.is_active) {
    return res.status(403).json({ error: 'Solo recepción puede registrar socios.' })
  }

  // Evita fichas duplicadas por correo. El identificador NO procede del cliente.
  const { data: existing, error: lookupError } = await admin.from('members')
    .select('id').ilike('email', email).limit(1)
  if (lookupError) return res.status(500).json({ error: 'No se pudieron validar los datos del socio.' })
  if (existing?.length) return res.status(409).json({
    error: 'Ya existe una ficha con ese correo. Consulta la ficha antes de registrar otra.'
  })

  // La cuenta se crea primero: así, si falla la ficha, puede eliminarse el usuario nuevo.
  // email_confirm se usa para el prototipo de cuentas creadas presencialmente.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: name }
  })
  if (createError || !created?.user) return res.status(409).json({
    error: createError?.message || 'No se pudo crear la cuenta de acceso.'
  })

  const authId = created.user.id
  let memberId = null
  let rollbackError = false
  const rollback = async () => {
    // Borra Auth primero (profiles hace cascade); después la ficha si llegó a crearse.
    const removedAuth = await admin.auth.admin.deleteUser(authId)
    if (removedAuth.error) rollbackError = true
    if (memberId !== null) {
      const removedMember = await admin.from('members').delete().eq('id', memberId)
      if (removedMember.error) rollbackError = true
    }
  }

  // El trigger de 06_registro_socios_automatico.sql genera GYM-0008, etc.
  const { data: member, error: memberError } = await admin.from('members')
    .insert({ name, email, phone })
    .select('id,identifier,name,email').single()
  if (memberError || !member) {
    await rollback()
    const missingTrigger = memberError?.code === '23502'
    return res.status(500).json({ error: rollbackError
      ? 'No se pudo completar ni revertir el registro: revisa Authentication y members antes de reintentar.'
      : missingTrigger
        ? 'Falta ejecutar 06_registro_socios_automatico.sql en Supabase.'
        : 'No se pudo crear la ficha del socio. La cuenta de acceso fue revertida.' })
  }
  memberId = member.id

  const { error: profileError } = await admin.from('profiles').insert({
    id: authId, full_name: name, role: 'socio', member_id: memberId, is_active: true
  })
  if (profileError) {
    await rollback()
    return res.status(500).json({ error: rollbackError
      ? 'No se pudo vincular la cuenta y la reversión requiere revisión manual en Supabase.'
      : 'No se pudo vincular la cuenta al socio. Se revirtió el registro.' })
  }

  const { error: auditError } = await admin.from('audit_log').insert({
    actor_id: actor.id, action: 'REGISTRAR_SOCIO_Y_CUENTA',
    entity: 'member', entity_id: memberId
  })
  if (auditError) {
    await rollback()
    return res.status(500).json({ error: rollbackError
      ? 'No se pudo registrar la auditoría y se requiere revisión manual en Supabase.'
      : 'No se pudo guardar la auditoría. Se revirtió el registro.' })
  }

  return res.status(201).json({
    message: `Socio ${member.name} registrado con código ${member.identifier} y cuenta activa.`,
    identifier: member.identifier,
    redirect: `/members/${memberId}/account`
  })
}
