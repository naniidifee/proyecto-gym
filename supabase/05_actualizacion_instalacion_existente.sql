-- ACTUALIZACION PARA UNA INSTANCIA YA CONFIGURADA DE GYMCONTROL.
-- Ejecutar una sola vez ANTES de volver a ejecutar 02_pages.sql y 03_actions.sql.
-- CU06: se evita una entrada duplicada por evento (intervalo de 5 minutos),
-- no se impide que el socio vuelva a entrar más tarde el mismo día.
alter table public.attendance drop constraint if exists attendance_member_id_access_date_key;
create index if not exists ix_attendance_member_time on public.attendance(member_id,entered_at desc);
-- Después ejecutar en este orden los ARCHIVOS NUEVOS:
-- 02_pages.sql (incluye gestión de personal y alta de cuenta de socio en recepción)
-- 03_actions.sql (incluye estado del recepcionista y controles de concurrencia)
-- IMPORTANTE: reejecutar estos dos SQL no elimina tus datos.

-- CU01/CU07: una renovación futura no invalida la membresía actual todavía vigente.
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

