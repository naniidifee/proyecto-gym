# Propuesta de actualización de los diagramas del informe

El informe EV.II incluye UML de clases, despliegue y componentes. La **lógica de negocio** sigue representada por socios, membresías, pagos, clases, reservas, asistencia y equipos. Como el stack final cambió a React + Vite + Supabase + Vercel, los diagramas de infraestructura originales ya no representan literalmente el despliegue actual. Estos Mermaid son una referencia para rehacerlos en PowerDesigner / herramienta UML cuando actualices la entrega académica.

## Arquitectura de componentes (implementación nueva)

```mermaid
flowchart LR
  UI[React 19 + Vite<br/>Vistas Admin, Recepción, Socio] --> AUTH[Supabase Auth<br/>Sesiones]
  UI --> READ[RPC gym_page<br/>consultas autorizadas]
  UI --> WRITE[RPC gym_action<br/>operaciones transaccionales]
  UI --> API[Vercel Functions<br/>invitaciones de cuentas]
  API --> AUTH
  API --> DB[(Supabase PostgreSQL)]
  READ --> DB
  WRITE --> DB
```

## Despliegue

```mermaid
flowchart TD
  USER[PC o celular con navegador] -->|HTTPS| FRONT[Vercel<br/>Sitio React compilado por Vite]
  USER -->|HTTPS JWT| SB[Supabase Auth y API RPC]
  FRONT -->|invitar por HTTPS| FUN[Vercel Functions Node.js]
  FUN -->|Clave secreta solo en servidor| SB
  SB --> DATA[(PostgreSQL + RLS)]
```

## Entidades de datos principales

```mermaid
classDiagram
  class Profile { UUID id; text role; bool is_active; bigint member_id }
  class Member { bigint id; text identifier; text name; text email }
  class Plan { bigint id; text name; bool allows_classes; bool allows_access }
  class Membership { bigint id; bigint member_id; bigint plan_id; date ends_on; text status }
  class Payment { bigint id; bigint member_id; bigint amount; text status }
  class Class { bigint id; text title; timestamp starts_at; int capacity }
  class Reservation { bigint id; bigint member_id; bigint class_id; text status }
  class Attendance { bigint id; bigint member_id; timestamp entered_at }
  class Equipment { bigint id; text code; text status }
  class Maintenance { bigint id; bigint equipment_id; text status }
  Member "1" <-- "0..1" Profile : cuenta socio
  Member "1" <-- "0..*" Membership
  Plan "1" <-- "0..*" Membership
  Member "1" <-- "0..*" Payment
  Member "1" <-- "0..*" Attendance
  Member "1" <-- "0..*" Reservation
  Class "1" <-- "0..*" Reservation
  Equipment "1" <-- "0..*" Maintenance
```

**Nota:** el modelo de deudas/cargos pendiente del CU02/CU09/CU12 no se añadió porque el cliente simulado no fijó tarifas ni conceptos exigibles. El diagrama anterior refleja la estructura de datos **que sí existe** en el ZIP.
