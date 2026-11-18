
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return res.status(503).json({
      error: 'Falta configurar Supabase en el servidor.'
    })
  }

  const token = (req.headers.authorization || '')
    .match(/^Bearer\s+(.+)$/i)?.[1]

  if (!token) {
    return res.status(401).json({ error: 'Debes iniciar sesión.' })
  }

  const name = String(req.body?.full_name || '').trim()
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')

  if (
    name.length < 2 ||
    name.length > 150 ||
    email.length > 180 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return res.status(400).json({
      error: 'Ingresa un nombre y correo válidos.'
    })
  }


if (password.length < 8 || password.length > 128) {
  return res.status(400).json({
    error: 'La contraseña debe tener entre 8 y 128 caracteres.'
  })
}

if (!/[A-Z]/.test(password)) {
  return res.status(400).json({
    error: 'La contraseña necesita al menos una letra mayúscula.'
  })
}

if (!/[a-z]/.test(password)) {
  return res.status(400).json({
    error: 'La contraseña necesita al menos una letra minúscula.'
  })
}

if (!/[0-9]/.test(password)) {
  return res.status(400).json({
    error: 'La contraseña necesita al menos un número.'
  })
}


  const admin = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  })

  // Validar la sesión real del administrador
  const { data: checked, error: tokenError } =
    await admin.auth.getUser(token)

  if (tokenError || !checked?.user) {
    return res.status(401).json({
      error: 'Sesión no válida.'
    })
  }

  const { data: actor, error: actorError } = await admin
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', checked.user.id)
    .maybeSingle()

  if (actorError || actor?.role !== 'admin' || !actor.is_active) {
    return res.status(403).json({
      error: 'Solo el administrador puede crear recepcionistas.'
    })
  }

  // Crear cuenta sin requerir confirmación de correo
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name }
    })

  if (createError || !created?.user) {
    return res.status(409).json({
      error: createError?.message || 'No se pudo crear la cuenta.'
    })
  }

  // Asociar la cuenta al rol de recepción
  const { error: profileError } = await admin
    .from('profiles')
    .upsert({
      id: created.user.id,
      full_name: name,
      role: 'recepcion',
      is_active: true
    }, { onConflict: 'id' })

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id)

    return res.status(500).json({
      error: 'No se pudo asignar el rol. Se revirtió la cuenta.'
    })
  }

  await admin.from('audit_log').insert({
    actor_id: actor.id,
    action: 'CREAR_RECEPCION',
    entity: 'profile',
    details: created.user.id
  })

  return res.status(201).json({
    message: `Recepcionista ${name} creado correctamente. Ya puede iniciar sesión.`
  })
}
