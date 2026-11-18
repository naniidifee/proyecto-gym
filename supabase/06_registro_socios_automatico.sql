-- GymControl / CU08: generación automática de identificador de socios.
-- MIGRACIÓN PARA TU INSTANCIA ACTUAL: ejecutar una vez ANTES del nuevo formulario.
-- Conserva los socios y códigos actuales. No elimina ni modifica registros existentes.
-- IMPORTANTE: ejecuta SQL Editor con el rol postgres, no con la clave publicable.

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
