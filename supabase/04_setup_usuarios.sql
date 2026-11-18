-- EJECUTAR DESPUÉS DE CREAR UN USUARIO EN Authentication > Users.
-- Reemplaza el correo por el usuario administrador REAL que ya creaste en Supabase Auth.
-- NO ejecuta por defecto: descomenta manualmente las siguientes líneas al configurar el proyecto.
-- INSERT INTO public.profiles(id,full_name,role,is_active)
-- SELECT id,'Administrador GymControl','admin',true FROM auth.users WHERE email='TU_CORREO@EJEMPLO.COM'
-- ON CONFLICT(id) DO UPDATE SET full_name=excluded.full_name,role=excluded.role,is_active=true;

-- La recepción se crea NORMALMENTE desde el panel ADMIN > Gestión de personal.
-- Solo si necesitas recuperar el sistema manualmente, crea un usuario en Authentication > Users y vincúlalo:
-- INSERT INTO public.profiles(id,full_name,role,is_active)
-- SELECT id,'Recepción GymControl','recepcion',true FROM auth.users WHERE email='RECEPCION@EJEMPLO.COM';

-- Los usuarios con rol SOCIO deben vincularse a la ficha de members.
-- Se crean desde RECEPTION > Registrar socio > Cuenta del socio (o desde la ficha admin),
-- enviando una invitación por /api/create-member-account; el socio define su contraseña.
-- En desarrollo también puedes crearlos manualmente y enlazar member_id correctamente.
-- NUNCA insertes una contraseña en la tabla profiles.
