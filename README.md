# GymControl — React 19 + Vite + Supabase + Vercel

Versión revisada contra **Informe Ev.II**, **Entrevista al dueño simulado** y **Especificaciones CU (CU01–CU16)**. Conserva el estilo visual oscuro/verde lima, la estructura general y las pantallas originales. Añade la creación directa de cuentas de recepcionistas y socios, los códigos de socio automáticos, alertas visibles de vencimiento y consistencia de entradas/reservas.

> **Importante:** el código está preparado, pero **no se ha probado con tu proyecto real de Supabase ni se ha desplegado en tu Vercel**. No cargues información personal real hasta completar las pruebas funcionales y de seguridad. Consulta `AUDITORIA_CASOS_DE_USO.md` para saber exactamente qué está cubierto y qué sigue pendiente.

## Requisitos

- Node.js 20.19+ con npm, Visual Studio Code u otro editor.
- Un proyecto Supabase con Auth y PostgreSQL.
- Vercel para publicar las funciones Node y el frontend; no requiere GitHub ni abrir puertos del router.

## 1. Si YA ejecutaste los SQL de la versión anterior en Supabase

**¡Este es tu caso si ya tienes al administrador creado!** No borres tus tablas ni crees otro proyecto.

En **SQL Editor**, ejecuta por separado y en el orden siguiente, usando los **archivos nuevos de este ZIP**:

1. `supabase/05_actualizacion_instalacion_existente.sql` — ajusta el control de duplicado de entradas sin borrar historial.
2. `supabase/02_pages.sql` — incorpora las vistas protegidas de **Personal** (admin), **Cuenta del socio** (recepción) y las alertas de vencimiento.
3. `supabase/03_actions.sql` — actualiza las operaciones protegidas y deshabilita el alta de fichas sin cuenta.
4. **`supabase/06_registro_socios_automatico.sql` — OBLIGATORIO**, crea la secuencia y trigger para que PostgreSQL genere códigos `GYM-0008`, `GYM-0009`, etc., sin modificar códigos existentes.

Los comandos 2 y 3 usan `CREATE OR REPLACE FUNCTION` para actualizar funciones existentes. **No ejecutes nuevamente `01_schema.sql` como sustituto de esta migración.** El paso 4 (`06_registro_socios_automatico.sql`) debe completarse antes de crear un socio con contraseña. El archivo `04_setup_usuarios.sql` es informativo para el primer administrador; no hay que volver a ejecutarlo.

Después, en `SQL Editor`, verifica:

```sql
select routine_name from information_schema.routines
where routine_schema='public' and routine_name in ('gym_page','gym_action');

select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename;
```

La activación de RLS **no garantiza por sí sola** que una instalación esté lista para producción: los permisos de funciones, backups y flujos reales también deben comprobarse.

## 2. Si creas un proyecto Supabase NUEVO

En SQL Editor, ejecuta solo en el orden siguiente:

1. `supabase/01_schema.sql`
2. `supabase/02_pages.sql`
3. `supabase/03_actions.sql`
4. Sigue `supabase/04_setup_usuarios.sql` para crear **solamente la primera cuenta administradora** en Supabase Authentication y asignarle el rol `admin`. El archivo es principalmente una guía con SQL comentado que tienes que adaptar.

**No ejecutes los archivos 05 ni 06 en proyectos nuevos**, porque `01_schema.sql` actualizado incluye ambas configuraciones.

## 3. Configuración de Supabase, contraseñas iniciales e invitaciones antiguas

1. En `Authentication > Users` debe existir tu administrador y `public.profiles` debe contener su rol `admin` con `is_active=true`.
2. En `Authentication > URL Configuration`, configura **Site URL** y permite los redirects de tu aplicación hacia `/set-password`, tanto en desarrollo (ej. `http://localhost:5173/set-password`) como en la URL definitiva de Vercel (ej. `https://tu-sitio.vercel.app/set-password`).
3. Las cuentas **nuevas** de recepción y socios se crean directamente con contraseña inicial (8–128 caracteres, mayúscula, minúscula y número), sin email de invitación. Esta opción `email_confirm: true` está prevista para la **demostración académica presencial**. En producción los correos deben pertenecer a los usuarios y verificarse.
4. Solo para **socios anteriores sin cuenta**, sigue disponible el botón de invitación en `/members/:id/account`; para ese flujo es necesario configurar SMTP/URLs de redirección. Las contraseñas se envían por HTTPS a Supabase Auth, **no se almacenan en `public.members` ni se muestran en listados**.

**Si ya tienes `.env.local`, CONSÉRVALO desde tu instalación actual**: el ZIP nuevo NO lo incluye por seguridad. Si necesitas crearlo de nuevo, copia `.env.example` a `.env.local` y configura:

```env
VITE_SUPABASE_URL=https://ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TU_CLAVE_PUBLICA
SUPABASE_SERVICE_ROLE_KEY=sb_secret_TU_CLAVE_SECRETA
PUBLIC_APP_URL=http://localhost:5173
```

`VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` son variables del cliente. **Nunca uses el prefijo `VITE_` en la clave secreta**. Esta debe quedar en el servidor de Vite local o en las funciones de Vercel, nunca dentro de componentes React, capturas ni repositorios. No compartas tu `.env.local`.

## 4. Ejecutar localmente

Abre esta carpeta en VS Code:

```powershell
npm install
npm run dev
```

Abre `http://localhost:5173`. La API de invitaciones se sirve en local mediante middleware Vite; en producción la ejecutan Vercel Functions. Para revisar:

```powershell
npm test
npm run build
```

`npm test` ejecuta comprobaciones **estáticas de arquitectura**, no pruebas end-to-end. Una compilación exitosa no prueba que las políticas de Supabase y los correos funcionen en tu cuenta.

## 5. Flujo de creación de cuentas (actualizado)

### Administrador → Gestión de personal: crear recepcionista

1. Abre **Gestión de personal**.
2. Completa nombre, correo y contraseña inicial (mínimo 8 caracteres con mayúscula/minúscula/número).
3. Pulsa **Crear recepcionista**. La función `/api/invite-receptionist` (nombre histórico de ruta) registra cuenta Auth y perfil `recepcion` tras comprobar que eres administrador.
4. El recepcionista puede iniciar sesión inmediatamente y se recomienda cambiar su contraseña privada después. No se envía correo.

### Recepción → Registrar socio: crear ficha + cuenta en un único paso

1. Abre **Registrar socio**.
2. Observa el campo **Identificador: Se genera automáticamente al guardar**. No hay que escribir ningún código.
3. Completa nombre, correo, teléfono opcional y **contraseña inicial** (8–128 caracteres, mayúscula, minúscula y número).
4. Pulsa **Registrar socio y crear cuenta**. Se invoca `/api/register-member`, que verifica el rol `recepcion`, crea el usuario en Supabase Auth, registra `members` y vincula `profiles` como `socio`.
5. PostgreSQL genera un código único mediante la secuencia de `06_registro_socios_automatico.sql`; el código aparecerá en el mensaje y en la pantalla **Cuenta del socio**.
6. El socio inicia sesión con su correo y contraseña. La recepción no necesita enviarle un correo. La membresía y el pago se gestionan por separado, según CU01, CU08 y CU09.

**Atención:** el flujo de alta incluye compensaciones para revertir cuenta/ficha si la otra operación falla, pero Auth y PostgreSQL no participan en una única transacción distribuida. Si el servidor reporta que la reversión falló, comprueba manualmente Authentication, `members` y `profiles` antes de reintentar.

**Socios existentes sin acceso:** la sección **Cuenta del socio** conserva el procedimiento de invitación para fichas creadas previamente. Para esos casos el correo debe ser válido; si el socio no tiene acceso a ese correo, usa una cuenta real de pruebas o revisa el procedimiento administrativo para recuperar su cuenta sin duplicar fichas.

**No eliminar usuarios de prueba** asociados a reservas, pagos o membresías sin revisar las dependencias.

## 6. Publicación en Vercel, sin GitHub

1. `npm run build` para comprobar la compilación en tu PC.
2. `npm i -g vercel` → `vercel login` → `vercel link`.
3. En tu proyecto Vercel, agrega **cuatro** variables de entorno: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (secreto), y `PUBLIC_APP_URL` (URL final `https://...vercel.app`, **sin barra final**).
4. `vercel deploy --prod`. Agrega la URL de `/set-password` a **Supabase Authentication → URL Configuration → Redirect URLs**. Revisa **Site URL**.
5. Prueba en navegador privado el flujo completo admin → crear recepcionista → recepcionista → registrar socio con contraseña → iniciar sesión como socio. Verifica también las reglas de acceso y reservas.

**Recuerda:** al hacer `npm run dev`, el puerto local es **5173**. Si quieres probar invitaciones en Vercel, debes usar una URL de Vercel publicada; un enlace `localhost` solo abre en el propio equipo.

## 7. Carpetas

```text
GymControl_Vite_Supabase/
├─ src/main.jsx                 # vistas React 19 (CSS original)
├─ src/style.css                # estilos originales
├─ src/lib/supabase.js          # llamadas de cliente, RPC y APIs
├─ api/invite-receptionist.js   # invitación de recepción, rol fijado en servidor
├─ api/create-member-account.js# invitación para socios antiguos sin cuenta
├─ api/register-member.js       # nueva alta de ficha + cuenta por recepción
├─ supabase/01_schema.sql
├─ supabase/02_pages.sql
├─ supabase/03_actions.sql
├─ supabase/04_setup_usuarios.sql
├─ supabase/05_actualizacion_instalacion_existente.sql
├─ supabase/06_registro_socios_automatico.sql
├─ .env.example                 # plantilla SIN credenciales reales
├─ tests/
├─ AUDITORIA_CASOS_DE_USO.md
└─ README.md
```

## 8. Límites documentados (no ocultos)

- **CU12**: sin pasarela de pago online. El socio consulta pagos; recepción registra los ya recibidos. No se inventó un cobro real ni se almacenan tarjetas.
- **CU02/CU09**: no hay todavía un modelo de deuda/cuenta por cobrar para calcular saldos ni generar avisos automáticos de morosidad. Las alertas visuales de vencimiento sí existen en el **Resumen de administración**.
- **CU04**: algunas métricas de socios y membresías representan el estado actual y no una reconstrucción histórica por período.
- No se han acreditado pruebas de carga (20 concurrentes), la disponibilidad 99,5%, recuperación en cuatro horas, backups ni protección de datos para operación real. No publiques datos personales reales hasta validar estos puntos.
- Para cualquier negocio real, además de contraseña segura y RLS, hacen falta revisión de permisos, protección de datos, correo SMTP fiable y pruebas integrales.

## 9. Verificación rápida de la migración automática

Después de ejecutar la migración 06, consulta en **Supabase SQL Editor**:

```sql
select tgname from pg_trigger where tgrelid='public.members'::regclass
  and tgname='trg_member_identifier' and not tgisinternal;
select last_value from public.gym_member_identifier_seq;
```

El primer resultado debe incluir `trg_member_identifier`. **No ejecutes manualmente un `INSERT` de prueba contra `members`** si no vas a limpiar los datos de demostración. Prueba con la interfaz y la cuenta recepcionista.

### Seguridad y respaldo

- Este ZIP **no incluye** `.env.local`, `node_modules`, contraseñas ni tokens privados. Mantén tu `.env.local` original por separado.
- La clave `SUPABASE_SERVICE_ROLE_KEY` se usa **solo en el servidor**, nunca con prefijo `VITE_`.
- El sistema académico permite cuentas con correo no verificado (`email_confirm: true`): **no es apropiado para abrir un sistema de socios real sin un proceso de verificación de identidad/correo**.
- Ejecuta `npm test` y `npm run build` y prueba las funciones contra tu Supabase antes de desplegar.
