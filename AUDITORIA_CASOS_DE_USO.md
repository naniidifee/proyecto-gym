# Auditoría de requisitos — GymControl

**Base documental revisada**: `Informe Ev.II INGSF.docx` (problemática, objetivos, alcance, UML de clases/componentes/despliegue); `Entrevista al dueño simulado.docx` (objetivos y actores); `Especificaciones CU.docx` (16 CU, 31 RF y 37 RNF). Se examinó el código fuente del ZIP entregado (React + Vite, SQL, funciones Vercel y estilos). La planificación en formato Project es una planificación metodológica, no un requisito nuevo de comportamiento.

**Nota documental:** no se proporcionó una historia de usuario independiente con criterios adicionales a las especificaciones CU; los actores y necesidades se obtuvieron de la entrevista y los CU. Si hay un documento adicional con historias de usuario, tendría que revisarse por separado.

## Cambios realmente incorporados

| Cambio | Perfil y apartado | Motivo / documento | Implementación |
|---|---|---|---|
| **Gestión de personal** | **Admin → Gestión de personal** (nuevo en menú lateral) | Antes no existía ningún medio de habilitar a los recepcionistas, necesarios para ejecutar CU06–CU10 | Formulario para invitar recepcionistas, lista de usuarios, activar/desactivar; `api/invite-receptionist.js`, ruta SQL `/staff`, acción SQL `/staff/<uuid>/status`. La clave secreta no sale al navegador. |
| **Creación de cuenta de socio** | **Recepción → Registrar socio → Cuenta del socio** (nuevo paso) | CU08/entrevista indican que recepción registra socios; CU11–CU16 requieren acceso autenticado del socio | Al terminar registro, dirige a `/members/<id>/account`; correo de invitación por `api/create-member-account.js`, que enlaza `profiles.member_id`. |
| **Invitación en vez de contraseña compartida** | **Admin → Socios y membresías → Ficha → Cuenta de socio**; también recepción | Evita contraseñas anotadas o entregadas por el personal | Supabase Auth envía invitación; ruta pública `/set-password`, el usuario crea su contraseña. |
| **Avisos de membresías próximas a vencer** | **Admin → Resumen** | Objetivo de control de membresías próximo vencimiento | Tabla de socios cuya última membresía activa vence en 7 días; consulta en `gym_page('/dashboard')`. Alerta visual, no notificación por email. |
| **Actualizar mantenimiento pendiente** | **Admin → Equipamiento → Historial y tareas → Editar** | CU05 incluye programar, **actualizar** y cerrar mantenimientos | Formulario de edición, transacción PostgreSQL y registro en auditoría. |
| **Control de duplicado de accesos por evento** | **Recepción → Control de acceso** | CU06 pide evitar un duplicado de la **misma entrada**, no prohibir todas las entradas de un día | Control transaccional de 5 minutos y migración que quita `unique(member_id,access_date)`; más de una entrada por día es posible. Se debe validar en negocio si 5 minutos es ventana adecuada. |
| **Protección de reservas simultáneas por socio** | **Recepción → Reservas de socios** y **Socio → Calendario** | CU10, CU14 y RNF22/RNF31 | Bloqueo adicional para impedir reservar dos clases superpuestas de forma concurrente aun siendo diferentes clases. |
| **Renovación futura sin bloquear acceso actual** | **Admin → Socios y membresías** y **Recepción → Control de acceso** | CU01/CU07 | La selección y verificación de membresías considera primero un plan actualmente vigente; una renovación con fecha futura no deniega el acceso actual. |
| **Confirmación comprensible al cancelar** | **Socio → Mis reservas** y **Recepción → Reservas de socios** | CU15/RNF35 | La confirmación muestra clase y fecha/hora. |

## Cobertura de los 16 casos de uso

| CU | Actor | Apartado de la página | Resultado de la revisión |
|---|---|---|---|
| CU01 Socios y membresías | Admin | Socios y membresías | **Implementado en el MVP**: buscar/editar ficha, asignar y renovar plan, historial. Una modificación de plan se registra como una nueva membresía (con historial), no edita la anterior. |
| CU02 Revisar pagos generales | Admin | Finanzas | **Parcial**: filtros, totales por estado y recibos; **no existe** una cuenta por cobrar para calcular saldos vencidos reales. |
| CU03 Administrar clases y horarios | Admin | Clases y horarios | **Implementado en el MVP**: crear/editar/cancelar, validar cupos y cruces de sala/instructor. Instructores y espacios se ingresan por texto, no hay catálogo. |
| CU04 Consultar reportes | Admin | Reportes | **Parcial**: ingresos, asistencia, reservas, socios y vigencia; los totales de socios/planes son actuales, no una reconstrucción histórica para cualquier período. |
| CU05 Gestionar mantenimiento | Admin | Equipamiento | **Implementado en el MVP**: inventario, programar, actualizar pendientes y cerrar; estado del equipo y auditoría. |
| CU06 Registrar entrada | Recepción | Control de acceso | **Implementado en el MVP**: requiere CU07 y confirmación del operador, registra fecha/hora/responsable y no duplica un mismo evento próximo. |
| CU07 Verificar membresía | Recepción | Control de acceso | **Implementado**: se rechaza sin vigencia, plan sin acceso o suspensión. |
| CU08 Registrar nuevos socios | Recepción | Registrar socio | **Implementado**: ficha única, validación de identificador; adicionalmente se puede invitar a portal. No activa plan ni pago. |
| CU09 Registrar pagos | Recepción | Registrar pago | **Parcial**: pago recibido, referencia única opcional y comprobante; **no hay modelo de deuda ni actualización de saldo** como exige RF17. |
| CU10 Gestionar reservas | Recepción | Reservas de socios | **Implementado en el MVP**: crear y cancelar por socio, validar membresía/cupo/horarios, con transacción. |
| CU11 Consultar membresía | Socio | Mi membresía | **Implementado**: plan, vigencia, cobertura/estado propios. |
| CU12 Realizar/consultar pagos | Socio | Mis pagos | **Parcial**: consulta y recibos; **no se cobra por internet** (falta pasarela externa). |
| CU13 Consultar horarios | Socio | Calendario | **Implementado**: fechas, instructor, sala, cupos, filtros de actividad e instructor. |
| CU14 Reservar clase | Socio | Calendario | **Implementado**: membresía, horario, cupo, duplicados y bloqueo concurrente. |
| CU15 Cancelar reserva | Socio | Mis reservas | **Implementado**: solo la propia, no iniciada, confirmación con clase y fecha, conserva historial. |
| CU16 Historial de asistencia | Socio | Mi asistencia | **Implementado**: historial propio de entradas y filtros de fechas, separado de reservas. |

## Qué NO se agregó deliberadamente

- **Cobro online y cuentas por cobrar**: deben definirse tarifas reales, fechas de exigibilidad, deudas, saldos parciales, medios de pago habilitados y pasarela antes de codificarlos. Los documentos especifican el objetivo pero no aportan una tabla de precios ni proveedor de pagos. No sería correcto inventar cargos automáticos.
- **Notificaciones automáticas por correo o WhatsApp** de vencimientos: se agregó una alerta visual en administración, pero programar y entregar alertas reales requiere decidir periodicidad y proveedor.
- **Registro público de socios**: la entrevista atribuye el alta a recepción. Un visitante no puede asignarse el rol `admin`, `recepcion` o `socio` automáticamente.
- **Roles extra de instructor/entrenador**: aparecen en el contexto del informe, pero los **tres actores formales** de los casos de uso son administrador, recepcionista y socio; agregar un cuarto perfil no está justificado aún.
- **Catálogo de tarifas e instructores**: no se inventaron reglas ni precios.

## Advertencias antes de producción

1. La cuenta Supabase del usuario **ya tiene ejecutados** `01_schema.sql`, `02_pages.sql` y `03_actions.sql`. Tras instalar este nuevo ZIP **hay que ejecutar la migración 05 y volver a aplicar 02 y 03**; de lo contrario las opciones nuevas del frontend devolverán errores de ruta/operación.
2. Hacen falta credenciales de `SUPABASE_SERVICE_ROLE_KEY` en el entorno del **servidor**, y `PUBLIC_APP_URL` junto con redirects `/set-password` autorizados en Supabase Authentication.
3. Supabase necesita correo SMTP/restricciones de envíos apropiados para invitaciones reales. Pueden fallar por límites del proveedor o porque el redirect no está autorizado.
4. **La seguridad de la clave publicable depende de las políticas y permisos**. El código usa RPC `SECURITY DEFINER` con comprobación de roles y RLS habilitado, pero eso no reemplaza una revisión de seguridad real.
5. Falta confirmar los RNF de rendimiento, carga, disponibilidad, cifrado en reposo, copia de seguridad, restauración y privacidad con un entorno real. Las comprobaciones locales no acreditan esos RNF.
6. No existe validación transaccional de un saldo deudor porque no se ha definido un libro de cargos; tampoco hay comprobante tributario oficial.
7. El UML de despliegue y componentes del informe debe **actualizarse para el stack actual** (React/Vite/Vercel y Supabase), pues el diagrama original es conceptual y corresponde a otra arquitectura. Se incluye `DIAGRAMAS_ACTUALIZADOS.md` como propuesta de actualización, sin modificar el Word original.

## Verificación efectuada

- Comparación de rutas y operaciones de React/SQL con CU01–CU16.
- Pruebas unitarias estáticas y con mocks para autorización de invitaciones. **No usan una base real**.
- Parseo de JSX con el compilador TypeScript instalado en el entorno, además de comprobación de sintaxis JavaScript Node.
- La instalación npm y compilación de Vite **no pudieron completarse** en este entorno por un error de resolución DNS al acceder a `registry.npmjs.org`. Deben ejecutarse `npm install`, `npm test`, `npm run build` y pruebas end-to-end en el equipo del usuario.


## Actualización CU08: alta de socio con cuenta y código automático

La versión actual incorpora **Recepción → Registrar socio** como operación de alta de la ficha `members` y cuenta Supabase Auth con contraseña inicial en una sola pantalla. `gym_action('/members/new')` queda deshabilitada para evitar fichas sin cuenta; la operación autorizada se ejecuta mediante `/api/register-member`. Se utiliza el trigger de la migración `06_registro_socios_automatico.sql` y se mantiene la independencia entre registrar un socio, asignarle una membresía y registrar un pago (CU01/CU08/CU09).

La opción **Cuenta del socio** sigue permitiendo invitar a un socio histórico sin cuenta de acceso. En la sección de administración de personal, la creación es directa con contraseña temporal, sin correo de invitación.

Estas operaciones requieren pruebas en el proyecto real Supabase. No implican que se haya implementado un sistema de cobro online ni que exista recuperación de contraseña para correos ficticios.
