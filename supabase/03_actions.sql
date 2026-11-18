-- Acciones transaccionales de GymControl. Verifica permisos en PostgreSQL.
-- No admite cobros en línea: registra exclusivamente pagos recibidos por recepción.
create or replace function public.gym_action(p_action text, p_form jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v public.profiles%rowtype;
 m public.members%rowtype;
 c public.classes%rowtype;
 r public.reservations%rowtype;
 mt public.maintenances%rowtype;
 old_mb public.memberships%rowtype;
 v_id bigint;
 v_mid bigint;
 v_cid bigint;
 v_new_id bigint;
 v_plan bigint;
 v_amount bigint;
 v_capacity int;
 v_booked int;
 v_start timestamp;
 v_end timestamp;
 v_starts date;
 v_ends date;
 v_paid date;
 v_name text;
 v_email text;
 v_identifier text;
 v_kind text;
 v_status text;
 v_method text;
 v_reference text;
 v_now timestamp := now() at time zone 'America/Santiago';
 v_day date := (now() at time zone 'America/Santiago')::date;
 v_target text := '/dashboard';
 v_message text := 'Cambios guardados';
 v_access boolean;
 v_already int;
begin
 if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
 select * into v from public.profiles where id=auth.uid() and is_active;
 if not found then raise exception 'Cuenta sin permiso para operar'; end if;
 if p_form is null or jsonb_typeof(p_form)<>'object' then raise exception 'Formulario inválido'; end if;

 if p_action ~ '^/staff/[0-9a-fA-F-]{36}/status$' then
   if v.role<>'admin' then raise exception 'Solo administración gestiona el personal'; end if;
   if coalesce(p_form->>'enabled','') not in ('true','false') then raise exception 'Estado inválido'; end if;
   update public.profiles set is_active=(p_form->>'enabled')::boolean
   where id=substring(p_action from '^/staff/([0-9a-fA-F-]{36})/status$')::uuid and role='recepcion';
   if not found then raise exception 'Recepcionista no encontrado'; end if;
   insert into public.audit_log(actor_id,action,entity,details) values
    (v.id,'ESTADO_PERSONAL','profile',p_action||' => '||(p_form->>'enabled'));
   v_target:='/staff';v_message:='Estado del recepcionista actualizado';

 elsif p_action='/members/new' then
   -- Ya no permite altas directas sin cuenta de acceso. Solo /api/register-member
   -- (Node protegido) registra Auth + ficha + perfil en un mismo flujo.
   raise exception 'Utiliza el formulario de recepción actualizado para registrar socio y cuenta';

 elsif p_action ~ '^/members/[0-9]+/update$' then
   if v.role<>'admin' then raise exception 'Solo administración modifica fichas'; end if;
   v_id:=substring(p_action from '^/members/([0-9]+)/update$')::bigint;
   v_name:=trim(coalesce(p_form->>'name',''));
   v_email:=lower(trim(coalesce(p_form->>'email','')));
   if length(v_name)<2 or length(v_name)>200 or length(v_email)>180 or v_email not like '%@%' then raise exception 'Nombre o correo inválidos'; end if;
   update public.members set name=v_name,email=v_email,phone=left(coalesce(p_form->>'phone',''),40) where id=v_id;
   if not found then raise exception 'Socio no encontrado'; end if;
   insert into public.audit_log(actor_id,action,entity,entity_id) values(v.id,'ACTUALIZAR','member',v_id);
   v_target:='/members/'||v_id;
   v_message:='Datos de socio actualizados';

 elsif p_action ~ '^/members/[0-9]+/membership$' then
   if v.role<>'admin' then raise exception 'Solo administración gestiona membresías'; end if;
   v_id:=substring(p_action from '^/members/([0-9]+)/membership$')::bigint;
   v_plan:=(p_form->>'plan_id')::bigint;
   v_starts:=(p_form->>'starts_on')::date;
   v_ends:=(p_form->>'ends_on')::date;
   v_status:=p_form->>'status';
   if v_starts is null or v_ends is null or v_ends<v_starts or coalesce(v_status,'') not in ('active','suspended','inactive') then raise exception 'Fechas o estado incorrectos'; end if;
   perform 1 from public.members where id=v_id;
   if not found then raise exception 'Socio inexistente'; end if;
   perform 1 from public.plans where id=v_plan;
   if not found then raise exception 'Plan no válido'; end if;
   select * into old_mb from public.memberships where member_id=v_id order by starts_on desc,id desc limit 1;
   insert into public.memberships(member_id,plan_id,starts_on,ends_on,status)
    values(v_id,v_plan,v_starts,v_ends,v_status) returning id into v_new_id;
   insert into public.membership_history(membership_id,changed_by,before_data,after_data) values
     (v_new_id,v.id,case when old_mb.id is null then '{}'::jsonb else to_jsonb(old_mb) end,
      jsonb_build_object('plan_id',v_plan,'starts_on',v_starts,'ends_on',v_ends,'status',v_status));
   insert into public.audit_log(actor_id,action,entity,entity_id) values(v.id,'ASIGNAR_RENOVAR','membership',v_new_id);
   v_target:='/members/'||v_id;
   v_message:='Membresía guardada. No se ha registrado ningún pago.';

 elsif p_action='/payments/new' then
   if v.role<>'recepcion' then raise exception 'Solo recepción registra pagos'; end if;
   if coalesce(p_form->>'confirmed','')<>'yes' then raise exception 'Confirma que recibiste el pago'; end if;
   v_mid:=(p_form->>'member_id')::bigint;
   v_amount:=(p_form->>'amount')::bigint;
   v_paid:=(p_form->>'paid_on')::date;
   v_method:=trim(coalesce(p_form->>'method',''));
   v_name:=trim(coalesce(p_form->>'concept',''));
   v_reference:=nullif(trim(coalesce(p_form->>'reference','')),'');
   if v_amount is null or v_amount<=0 or length(v_name)<2 or length(v_method)<2 or v_paid is null then raise exception 'Monto, concepto, medio y fecha obligatorios'; end if;
   perform 1 from public.members where id=v_mid;
   if not found then raise exception 'Socio inexistente'; end if;
   if v_reference is not null and length(v_reference)>100 then raise exception 'Referencia demasiado larga'; end if;
   insert into public.payments(public_id,member_id,concept,amount,method,status,reference,paid_on,created_by)
    values(upper(substr(md5(gen_random_uuid()::text),1,12)),v_mid,left(v_name,200),v_amount,left(v_method,60),'confirmed',v_reference,v_paid,v.id)
    returning id into v_new_id;
   insert into public.audit_log(actor_id,action,entity,entity_id) values(v.id,'CONFIRMAR','payment',v_new_id);
   v_target:='/receipts/'||v_new_id;
   v_message:='Pago confirmado y comprobante disponible';

 elsif p_action='/access' then
   if v.role<>'recepcion' then raise exception 'Solo recepción controla el acceso'; end if;
   v_identifier:=upper(trim(coalesce(p_form->>'identifier','')));
   select * into m from public.members where identifier=v_identifier;
   if not found then
     return jsonb_build_object('access',true,'props',jsonb_build_object('error','No se encontró el socio','entered',v_identifier));
   end if;
   v_access:=private.member_allowed(m.id,false);
   if not v_access then
      return jsonb_build_object('access',true,'props',jsonb_build_object('checked',to_jsonb(m),
       'allowed',false,'result','Membresía inexistente, vencida, suspendida o sin cobertura','entered',v_identifier));
   end if;
   if coalesce(p_form->>'action','check')='confirm' then
     perform pg_catalog.pg_advisory_xact_lock(98762,(m.id % 2147483647)::integer);
     select count(*) into v_already from public.attendance where member_id=m.id
       and entered_at >= v_now - interval '5 minutes';
     if v_already>0 then
       return jsonb_build_object('access',true,'props',jsonb_build_object('checked',to_jsonb(m),'allowed',false,
         'result','Esta entrada ya fue registrada hace menos de 5 minutos','entered',v_identifier));
     end if;
     insert into public.attendance(member_id,entered_at,access_date,receptionist_id)
       values(m.id,v_now,v_day,v.id) returning id into v_new_id;
     insert into public.audit_log(actor_id,action,entity,entity_id) values(v.id,'REGISTRAR_ENTRADA','attendance',v_new_id);
     return jsonb_build_object('access',true,'props',jsonb_build_object('checked',to_jsonb(m),
       'allowed',true,'confirmed',true,'result','Ingreso confirmado y guardado','entered',v_identifier));
   end if;
   return jsonb_build_object('access',true,'props',jsonb_build_object('checked',to_jsonb(m),'allowed',true,
       'result','Membresía vigente. Puedes confirmar el ingreso.','entered',v_identifier));

 elsif p_action='/classes/new' or p_action ~ '^/classes/[0-9]+/edit$' then
   if v.role<>'admin' then raise exception 'Solo administración gestiona clases'; end if;
   v_name:=trim(coalesce(p_form->>'title',''));
   v_method:=trim(coalesce(p_form->>'instructor',''));
   v_identifier:=trim(coalesce(p_form->>'room',''));
   v_start:=(p_form->>'starts_at')::timestamp;
   v_end:=(p_form->>'ends_at')::timestamp;
   v_capacity:=(p_form->>'capacity')::integer;
   if length(v_name)<2 or length(v_method)<2 or length(v_identifier)<2 or v_start is null or v_end is null or v_capacity is null or v_start<=v_now or v_end<=v_start or v_capacity<=0
     then raise exception 'Revisa actividad, instructor, sala, fechas y cupo'; end if;
   v_id:=case when p_action='/classes/new' then null else substring(p_action from '^/classes/([0-9]+)/edit$')::bigint end;
   if v_id is not null then
      select * into c from public.classes where id=v_id for update;
      if not found then raise exception 'Clase no encontrada'; end if;
      select count(*) into v_booked from public.reservations where class_id=v_id and status='active';
      if v_capacity<v_booked then raise exception 'El cupo no puede ser inferior a las reservas confirmadas'; end if;
   end if;
   -- Evita que dos administradores creen simultáneamente horarios cruzados.
   perform pg_catalog.pg_advisory_xact_lock(9611301);
   perform 1 from public.classes x where x.status='published' and (v_id is null or x.id<>v_id)
     and x.starts_at<v_end and x.ends_at>v_start
     and (lower(x.instructor)=lower(v_method) or lower(x.room)=lower(v_identifier));
   if found then raise exception 'Existe un cruce de horario para instructor o sala'; end if;
   if v_id is null then
      insert into public.classes(title,instructor,room,starts_at,ends_at,capacity)
       values(v_name,v_method,v_identifier,v_start,v_end,v_capacity) returning id into v_new_id;
      v_message:='Clase creada correctamente';
   else
      update public.classes set title=v_name,instructor=v_method,room=v_identifier,
         starts_at=v_start,ends_at=v_end,capacity=v_capacity where id=v_id;
      v_new_id:=v_id;
      v_message:='Clase actualizada';
   end if;
   insert into public.audit_log(actor_id,action,entity,entity_id) values(v.id,'GUARDAR','class',v_new_id);
   v_target:='/classes';

 elsif p_action ~ '^/classes/[0-9]+/cancel$' then
   if v.role<>'admin' then raise exception 'Solo administración cancela clases'; end if;
   if coalesce(p_form->>'confirm','')<>'yes' then raise exception 'Confirma cancelación de la clase'; end if;
   v_id:=substring(p_action from '^/classes/([0-9]+)/cancel$')::bigint;
   select * into c from public.classes where id=v_id for update;
   if not found then raise exception 'Clase no encontrada'; end if;
   update public.classes set status='cancelled' where id=v_id;
   update public.reservations set status='cancelled',cancelled_at=now() where class_id=v_id and status='active';
   insert into public.audit_log(actor_id,action,entity,entity_id) values(v.id,'CANCELAR','class',v_id);
   v_target:='/classes'; v_message:='Clase y reservas canceladas';

 elsif p_action ~ '^/classes/[0-9]+/reserve$' or p_action='/reservations' then
   if p_action='/reservations' then
     if v.role<>'recepcion' then raise exception 'Solo recepción reserva por un socio'; end if;
     v_mid:=(p_form->>'member_id')::bigint;
     v_cid:=(p_form->>'class_id')::bigint;
     v_target:='/reservations';
   else
     if v.role<>'socio' then raise exception 'Solo socios reservan directamente'; end if;
     v_mid:=v.member_id;
     v_cid:=substring(p_action from '^/classes/([0-9]+)/reserve$')::bigint;
     v_target:='/classes';
   end if;
   -- Bloqueo de la clase para serializar reservas concurrentes del último cupo.
   select * into c from public.classes where id=v_cid for update;
   if not found or c.status<>'published' or c.starts_at<=v_now then raise exception 'Clase no disponible'; end if;
   if not private.member_allowed(v_mid,true) then raise exception 'El socio no tiene membresía vigente que cubra clases'; end if;
   -- Serializa también las reservas del mismo socio en clases distintas, para evitar cruces simultáneos.
   perform pg_catalog.pg_advisory_xact_lock(98761,(v_mid % 2147483647)::integer);
   select count(*) into v_booked from public.reservations where class_id=v_cid and status='active';
   if v_booked>=c.capacity then raise exception 'Clase sin cupos disponibles'; end if;
   perform 1 from public.reservations rr join public.classes cc on cc.id=rr.class_id
     where rr.member_id=v_mid and rr.status='active' and cc.status='published'
       and cc.starts_at<c.ends_at and cc.ends_at>c.starts_at;
   if found then raise exception 'El socio ya tiene una clase reservada que se superpone'; end if;
   select * into r from public.reservations where member_id=v_mid and class_id=v_cid for update;
   if found then
      if r.status='active' then raise exception 'Reserva duplicada'; end if;
      update public.reservations set status='active',cancelled_at=null,created_by=v.id,created_at=now() where id=r.id returning id into v_new_id;
   else
      insert into public.reservations(member_id,class_id,created_by) values(v_mid,v_cid,v.id) returning id into v_new_id;
   end if;
   insert into public.audit_log(actor_id,action,entity,entity_id) values(v.id,'RESERVAR','reservation',v_new_id);
   v_message:='Reserva confirmada';

 elsif p_action ~ '^/(my/)?reservations/[0-9]+/cancel$' then
   if v.role not in ('socio','recepcion') then raise exception 'Sin permiso para cancelar reservas'; end if;
   if coalesce(p_form->>'confirm','')<>'yes' then raise exception 'Confirma la cancelación'; end if;
   if v.role='socio' and p_action !~ '^/my/reservations/' then raise exception 'Un socio solo cancela su reserva'; end if;
   if v.role='recepcion' and p_action !~ '^/reservations/' then raise exception 'Ruta de cancelación no autorizada'; end if;
   v_id:=substring(p_action from '([0-9]+)/cancel$')::bigint;
   select * into r from public.reservations where id=v_id;
   if not found or r.status<>'active' then raise exception 'Reserva inexistente o ya cancelada'; end if;
   if v.role='socio' and r.member_id<>v.member_id then raise exception 'No puedes cancelar una reserva ajena'; end if;
   select * into c from public.classes where id=r.class_id for update;
   select * into r from public.reservations where id=v_id for update;
   if r.status<>'active' then raise exception 'Reserva cancelada por otro usuario'; end if;
   if c.status<>'published' or c.starts_at<=v_now then raise exception 'La clase ya inició o fue cancelada'; end if;
   update public.reservations set status='cancelled',cancelled_at=now() where id=v_id;
   insert into public.audit_log(actor_id,action,entity,entity_id) values(v.id,'CANCELAR','reservation',v_id);
   v_target:=case when v.role='socio' then '/my/reservations' else '/reservations' end;
   v_message:='Reserva cancelada; cupo liberado';

 elsif p_action='/equipment' then
   if v.role<>'admin' then raise exception 'Solo administración gestiona equipos'; end if;
   v_identifier:=upper(trim(coalesce(p_form->>'code','')));
   v_name:=trim(coalesce(p_form->>'name',''));
   v_method:=trim(coalesce(p_form->>'location',''));
   if length(v_identifier)<2 or length(v_name)<2 or length(v_method)<2 then raise exception 'Código, nombre y ubicación requeridos'; end if;
   insert into public.equipment(code,name,location) values(left(v_identifier,40),left(v_name,200),left(v_method,200)) returning id into v_new_id;
   insert into public.audit_log(actor_id,action,entity,entity_id) values(v.id,'CREAR','equipment',v_new_id);
   v_target:='/equipment';v_message:='Equipo registrado';

 elsif p_action ~ '^/equipment/[0-9]+/maintenance$' then
   if v.role<>'admin' then raise exception 'Solo administración gestiona mantenciones'; end if;
   v_id:=substring(p_action from '^/equipment/([0-9]+)/maintenance$')::bigint;
   v_kind:=p_form->>'kind';
   v_paid:=(p_form->>'scheduled_on')::date;
   v_name:=trim(coalesce(p_form->>'responsible',''));
   if coalesce(v_kind,'') not in ('preventivo','correctivo') or v_paid is null or length(v_name)<2 then raise exception 'Mantención inválida'; end if;
   perform 1 from public.equipment where id=v_id for update;
   if not found then raise exception 'Equipo inexistente'; end if;
   insert into public.maintenances(equipment_id,kind,scheduled_on,responsible,notes,created_by)
     values(v_id,v_kind,v_paid,left(v_name,200),left(coalesce(p_form->>'notes',''),2000),v.id) returning id into v_new_id;
   update public.equipment set status='maintenance' where id=v_id;
   insert into public.audit_log(actor_id,action,entity,entity_id) values(v.id,'PROGRAMAR','maintenance',v_new_id);
   v_target:='/equipment';v_message:='Mantención programada; equipo fuera de servicio';

 elsif p_action ~ '^/maintenance/[0-9]+/update$' then
   if v.role<>'admin' then raise exception 'Solo administración modifica mantenciones'; end if;
   v_id:=substring(p_action from '^/maintenance/([0-9]+)/update$')::bigint;
   select * into mt from public.maintenances where id=v_id for update;
   if not found or mt.status<>'pending' then raise exception 'Solo se pueden editar mantenciones pendientes'; end if;
   v_paid:=(p_form->>'scheduled_on')::date;
   v_name:=trim(coalesce(p_form->>'responsible',''));
   if v_paid is null or length(v_name)<2 then raise exception 'Fecha y responsable obligatorios'; end if;
   update public.maintenances set scheduled_on=v_paid,responsible=left(v_name,200),
     notes=left(coalesce(p_form->>'notes',''),2000) where id=v_id;
   insert into public.audit_log(actor_id,action,entity,entity_id,details) values
     (v.id,'ACTUALIZAR','maintenance',v_id,
       jsonb_build_object('antes',jsonb_build_object('fecha',mt.scheduled_on,'responsable',mt.responsible,'observaciones',mt.notes),
       'despues',jsonb_build_object('fecha',v_paid,'responsable',v_name,'observaciones',left(coalesce(p_form->>'notes',''),2000)))::text);
   v_target:='/equipment';v_message:='Mantención pendiente actualizada';

 elsif p_action ~ '^/maintenance/[0-9]+/complete$' then
   if v.role<>'admin' then raise exception 'Solo administración cierra mantenciones'; end if;
   if coalesce(p_form->>'resolved','')<>'yes' then raise exception 'No cierres mantenciones con fallas pendientes'; end if;
   v_id:=substring(p_action from '^/maintenance/([0-9]+)/complete$')::bigint;
   select * into mt from public.maintenances where id=v_id for update;
   if not found or mt.status<>'pending' then raise exception 'Mantención no encontrada o ya completada'; end if;
   update public.maintenances set status='completed',completed_at=now() where id=v_id;
   perform 1 from public.maintenances where equipment_id=mt.equipment_id and status='pending';
   if not found then update public.equipment set status='operational' where id=mt.equipment_id; end if;
   insert into public.audit_log(actor_id,action,entity,entity_id) values(v.id,'FINALIZAR','maintenance',v_id);
   v_target:='/equipment';v_message:='Mantención completada';

 else
   raise exception 'Operación no permitida';
 end if;
 return jsonb_build_object('redirect',v_target,'message',v_message);
exception
 when unique_violation then raise exception 'Registro duplicado: verifica identificador, folio o referencia';
 when foreign_key_violation then raise exception 'Registro asociado inexistente';
end;
$$;
revoke all on function public.gym_action(text,jsonb) from public,anon,authenticated;
grant execute on function public.gym_action(text,jsonb) to authenticated;
