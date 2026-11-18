-- GymControl: ejecutar en SQL Editor de un proyecto Supabase NUEVO.
-- Roles: admin / recepcion / socio. El id del perfil es auth.users.id.
create schema if not exists private;

create table if not exists public.members (
 id bigint generated always as identity primary key,
 identifier text not null unique,
 name text not null,
 email text not null,
 phone text not null default '',
 created_at timestamptz not null default now()
);
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null,
 role text not null check (role in ('admin','recepcion','socio')),
 member_id bigint references public.members(id) on delete set null,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 constraint member_link check (role <> 'socio' or member_id is not null)
);
create unique index if not exists profiles_one_member on public.profiles(member_id) where member_id is not null;
create table if not exists public.plans (
 id bigint generated always as identity primary key,
 name text unique not null,
 coverage text not null default 'Acceso general',
 allows_classes boolean not null default true,
 allows_access boolean not null default true
);
create table if not exists public.memberships (
 id bigint generated always as identity primary key,
 member_id bigint not null references public.members(id),
 plan_id bigint not null references public.plans(id),
 starts_on date not null,
 ends_on date not null,
 status text not null default 'active' check (status in ('active','suspended','inactive')),
 created_at timestamptz not null default now(),
 check (ends_on >= starts_on)
);
create index if not exists ix_memberships_member on public.memberships(member_id,starts_on desc,id desc);
create table if not exists public.membership_history (
 id bigint generated always as identity primary key,
 membership_id bigint not null references public.memberships(id),
 changed_by uuid not null references public.profiles(id),
 before_data jsonb not null default '{}'::jsonb,
 after_data jsonb not null default '{}'::jsonb,
 changed_at timestamptz not null default now()
);
create table if not exists public.payments (
 id bigint generated always as identity primary key,
 public_id text unique not null,
 member_id bigint not null references public.members(id),
 concept text not null,
 amount bigint not null check(amount>0),
 method text not null,
 status text not null check(status in ('confirmed','pending','rejected')),
 reference text unique,
 paid_on date not null,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
create index if not exists ix_payments_member on public.payments(member_id,paid_on desc);
create table if not exists public.classes (
 id bigint generated always as identity primary key,
 title text not null,
 instructor text not null,
 room text not null,
 starts_at timestamp not null,
 ends_at timestamp not null,
 capacity int not null check(capacity>0),
 status text not null default 'published' check(status in ('published','cancelled')),
 check(ends_at>starts_at)
);
create index if not exists ix_classes_time on public.classes(starts_at,status);
create table if not exists public.reservations (
 id bigint generated always as identity primary key,
 member_id bigint not null references public.members(id),
 class_id bigint not null references public.classes(id),
 status text not null default 'active' check(status in ('active','cancelled')),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 cancelled_at timestamptz,
 unique(member_id,class_id)
);
create index if not exists ix_reservations_class on public.reservations(class_id,status);
create table if not exists public.attendance (
 id bigint generated always as identity primary key,
 member_id bigint not null references public.members(id),
 entered_at timestamp not null,
 access_date date not null,
 receptionist_id uuid not null references public.profiles(id)
);
create index if not exists ix_attendance_member_time on public.attendance(member_id,entered_at desc);
create table if not exists public.equipment (
 id bigint generated always as identity primary key,
 code text not null unique,
 name text not null,
 location text not null,
 status text not null default 'operational' check(status in ('operational','maintenance','out_of_service'))
);
create table if not exists public.maintenances (
 id bigint generated always as identity primary key,
 equipment_id bigint not null references public.equipment(id),
 kind text not null check(kind in ('preventivo','correctivo')),
 scheduled_on date not null,
 responsible text not null,
 notes text not null default '',
 status text not null default 'pending' check(status in ('pending','completed')),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 completed_at timestamptz
);
create table if not exists public.audit_log (
 id bigint generated always as identity primary key,
 actor_id uuid references public.profiles(id),
 action text not null,
 entity text not null,
 entity_id bigint,
 details text not null default '',
 happened_at timestamptz not null default now()
);

-- Las tablas NO se consultan directamente desde el navegador: acceso RPC autorizado.
-- RLS es una segunda capa de protección, sin políticas abiertas.
do $$ declare t text; begin
 foreach t in array array['members','profiles','plans','memberships','membership_history','payments','classes','reservations','attendance','equipment','maintenances','audit_log'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on table public.%I from public, anon, authenticated',t);
 end loop;
end $$;

-- Planes de prueba: editar montos/cobertura antes de usar con clientes reales.
insert into public.plans(name,coverage,allows_classes,allows_access) values
 ('Mensual','Acceso general y clases',true,true),
 ('Musculación','Sala de máquinas',false,true),
 ('Clases','Clases grupales',true,true)
on conflict(name) do nothing;

create or replace function private.member_card(p_member bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
 select to_jsonb(x) from (
  select mb.*, pl.name as plan_name, pl.coverage, pl.allows_classes, pl.allows_access
  from public.memberships mb join public.plans pl on pl.id=mb.plan_id
  where mb.member_id=p_member order by
   (mb.status='active' and mb.starts_on <= (now() at time zone 'America/Santiago')::date
    and mb.ends_on >= (now() at time zone 'America/Santiago')::date) desc,
   mb.starts_on desc, mb.id desc limit 1
 ) x;
$$;

create or replace function private.member_allowed(p_member bigint, p_for_class boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.memberships mb
   join public.plans pl on pl.id=mb.plan_id
   where mb.member_id=p_member and mb.status='active'
     and mb.starts_on <= (now() at time zone 'America/Santiago')::date
     and mb.ends_on >= (now() at time zone 'America/Santiago')::date
     and (case when p_for_class then pl.allows_classes else pl.allows_access end));
$$;

-- Rechazar invocaciones directas desde API.
revoke all on function private.member_card(bigint) from public,anon,authenticated;
revoke all on function private.member_allowed(bigint,boolean) from public,anon,authenticated;


-- Alta de socios: código legible autogenerado por PostgreSQL.
-- GymControl / CU08: generación automática de identificador de socios.
-- También aplicable a un proyecto nuevo.
-- Conserva los socios y códigos actuales. No elimina ni modifica registros existentes.


create sequence if not exists public.gym_member_identifier_seq
  as bigint start with 1 increment by 1 minvalue 1;

-- Ajusta el contador por encima del mayor código ya registrado en el formato GYM-número.
-- No se disminuye el contador al ejecutar nuevamente la migración.
do $$
declare
  max_code bigint;
  current_code bigint;
begin
  select coalesce(max((substring(identifier from '^GYM-([0-9]+)$'))::bigint),0)
    into max_code
    from public.members
   where identifier ~ '^GYM-[0-9]{1,15}$';

  select last_value into current_code from public.gym_member_identifier_seq;
  if max_code > 0 then
    perform setval('public.gym_member_identifier_seq', greatest(max_code,current_code), true);
  end if;
end $$;

create or replace function private.assign_gym_member_identifier()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Se ignora cualquier identificador enviado por el cliente.
  new.identifier := 'GYM-' || lpad(nextval('public.gym_member_identifier_seq')::text,4,'0');
  return new;
end;
$$;

drop trigger if exists trg_member_identifier on public.members;
create trigger trg_member_identifier
before insert on public.members
for each row execute function private.assign_gym_member_identifier();

revoke all on sequence public.gym_member_identifier_seq from public, anon, authenticated;
revoke all on function private.assign_gym_member_identifier() from public, anon, authenticated;
