-- Endpoint de lectura de todas las pantallas. Una llamada = datos de una vista.
-- SECURITY DEFINER sin concesión directa a tablas; comprueba rol en CADA llamada.
create or replace function public.gym_page(p_path text, p_query jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v public.profiles%rowtype;
 v_page text;
 props jsonb := '{}'::jsonb;
 v_rows jsonb := '[]'::jsonb;
 v_id bigint;
 v_q text := coalesce(p_query->>'q','');
 v_status text := coalesce(p_query->>'status','');
 v_activity text := coalesce(p_query->>'activity','');
 v_instructor text := coalesce(p_query->>'instructor','');
 v_from date := nullif(p_query->>'from_date','')::date;
 v_to date := nullif(p_query->>'to_date','')::date;
 v_today date := (now() at time zone 'America/Santiago')::date;
 v_now timestamp := now() at time zone 'America/Santiago';
 v_payment_totals jsonb;
 v_daily jsonb;
 v_account jsonb;
 v_stats jsonb;
 v_m jsonb;
begin
 if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
 select * into v from public.profiles where id=auth.uid() and is_active=true;
 if not found then raise exception 'Cuenta sin perfil habilitado: contacta al administrador'; end if;
 if v_from is not null and v_to is not null and v_from > v_to then
  raise exception 'Rango de fechas inválido';
 end if;

 if p_path='/dashboard' then
  v_page:='dashboard';
  if v.role='socio' then
    v_m:=private.member_card(v.member_id);
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into v_rows from (
      select c.*,r.id as reservation_id from public.reservations r
      join public.classes c on c.id=r.class_id
      where r.member_id=v.member_id and r.status='active' and c.starts_at>=v_now
      order by c.starts_at limit 5
    ) t;
    props:=jsonb_build_object(
      'member_mode',true,'member_membership',v_m,
      'membership_reason',case when v_m is null then 'Sin membresía' when not private.member_allowed(v.member_id,false) then 'Membresía no vigente o suspendida' else '' end,
      'bookings',v_rows,
      'payments',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from
        (select * from public.payments where member_id=v.member_id order by paid_on desc,id desc limit 4) t),
      'last_att',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from
        (select * from public.attendance where member_id=v.member_id order by entered_at desc limit 4) t)
    );
  else
    select jsonb_build_object(
      'members',(select count(*) from public.members),
      'active',(select count(distinct member_id) from public.memberships where status='active' and starts_on<=v_today and ends_on>=v_today),
      'classes',(select count(*) from public.classes where status='published' and starts_at>=v_now),
      'today_att',(select count(*) from public.attendance where access_date=v_today),
      'revenue',(select coalesce(sum(amount),0) from public.payments where status='confirmed')
    ) into v_stats;
    props:=jsonb_build_object('member_mode',false,'stats',v_stats,
       'expiring',case when v.role='admin' then
       (select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (
         select m.name,m.identifier,mb.ends_on from public.members m
         join lateral (select * from public.memberships where member_id=m.id order by starts_on desc,id desc limit 1) mb on true
         where mb.status='active' and mb.ends_on between v_today and v_today+7
         order by mb.ends_on,m.name limit 15
       ) t) else '[]'::jsonb end,
       'recent',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from
        (select p.*,m.name member_name from public.payments p join public.members m on m.id=p.member_id order by p.id desc limit 5) t),
       'upcoming',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from
        (select c.*,(select count(*) from public.reservations r where r.class_id=c.id and r.status='active') booked from public.classes c
         where c.status='published' and c.starts_at>=v_now order by c.starts_at limit 5) t));
  end if;

 elsif p_path='/staff' then
   if v.role<>'admin' then raise exception 'Solo administración gestiona personal'; end if;
   v_page:='staff';
   props:=jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (
     select p.id,p.full_name,p.is_active,a.email,p.created_at from public.profiles p
     join auth.users a on a.id=p.id where p.role='recepcion' order by p.created_at desc
   ) t));

 elsif p_path='/members' then
   if v.role<>'admin' then raise exception 'Solo administración puede ver las fichas de socios'; end if;
   v_page:='members';
   select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into v_rows from (
     select m.*,mb.starts_on,mb.ends_on,mb.status m_status,pl.name plan_name
     from public.members m
     left join lateral(select * from public.memberships where member_id=m.id order by
       (status='active' and starts_on<=v_today and ends_on>=v_today) desc,
       starts_on desc,id desc limit 1) mb on true
     left join public.plans pl on pl.id=mb.plan_id
     where m.name ilike '%'||v_q||'%' or m.identifier ilike '%'||v_q||'%' or m.email ilike '%'||v_q||'%'
     order by m.id desc
   ) t;
   props:=jsonb_build_object('rows',v_rows,'q',v_q);

 elsif p_path='/members/new' then
   if v.role<>'recepcion' then raise exception 'Solo recepción registra socios'; end if;
   v_page:='form';
   props:=jsonb_build_object('title','Registrar nuevo socio', 'subtitle','CU08 · Alta con identificador único',
      'action','/members/new','fields',jsonb_build_array(
        jsonb_build_array('identifier','Identificador del socio','text','GYM-007'),
        jsonb_build_array('name','Nombre completo','text',''),
        jsonb_build_array('email','Correo electrónico','email',''),
        jsonb_build_array('phone','Teléfono','text','') ),'button','Registrar socio');

 elsif p_path ~ '^/members/[0-9]+/account$' then
   if v.role<>'recepcion' then raise exception 'Solo recepción gestiona el acceso del socio'; end if;
   v_page:='member_account'; v_id:=substring(p_path from '^/members/([0-9]+)/account$')::bigint;
   select to_jsonb(t) into v_m from (select id,identifier,name,email from public.members where id=v_id) t;
   if v_m is null then raise exception 'Socio no encontrado'; end if;
   select to_jsonb(t) into v_account from (select a.email as username from public.profiles p
      join auth.users a on a.id=p.id where p.member_id=v_id and p.role='socio' limit 1) t;
   props:=jsonb_build_object('member',v_m,'account',v_account);

 elsif p_path ~ '^/members/[0-9]+$' then
   if v.role<>'admin' then raise exception 'Solo administración consulta la ficha'; end if;
   v_page:='member_detail'; v_id:=substring(p_path from '[0-9]+$')::bigint;
   select to_jsonb(m) into v_m from public.members m where m.id=v_id;
   if v_m is null then raise exception 'Socio no encontrado'; end if;
   select to_jsonb(t) into v_account from (
     select p.id, a.email as username from public.profiles p
     join auth.users a on a.id=p.id where p.member_id=v_id and p.role='socio' limit 1
   ) t;
   props:=jsonb_build_object(
     'member',v_m,'mb',private.member_card(v_id),
     'plans',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (select * from public.plans order by id) t),
     'account',v_account,
     'history',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (
       select h.*,p.full_name actor from public.membership_history h
       join public.memberships mb on mb.id=h.membership_id
       join public.profiles p on p.id=h.changed_by
       where mb.member_id=v_id order by h.id desc limit 10
     ) t));

 elsif p_path='/payments' then
   if v.role<>'admin' then raise exception 'Solo administración puede revisar pagos generales'; end if;
   v_page:='payments';
   select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into v_rows from (
     select p.*,m.name member_name,m.identifier member_code from public.payments p
     join public.members m on m.id=p.member_id
     where (v_from is null or p.paid_on>=v_from) and (v_to is null or p.paid_on<=v_to)
       and (v_status not in ('confirmed','pending','rejected') or p.status=v_status)
       and (m.name ilike '%'||v_q||'%' or p.concept ilike '%'||v_q||'%' or m.identifier ilike '%'||v_q||'%')
     order by p.paid_on desc,p.id desc
   ) t;
   select jsonb_build_object('confirmed',coalesce(sum((x->>'amount')::bigint) filter(where x->>'status'='confirmed'),0),
     'pending',coalesce(sum((x->>'amount')::bigint) filter(where x->>'status'='pending'),0),
     'rejected',coalesce(sum((x->>'amount')::bigint) filter(where x->>'status'='rejected'),0))
     into v_payment_totals from jsonb_array_elements(v_rows) x;
   props:=jsonb_build_object('rows',v_rows,'totals',v_payment_totals,'from_date',coalesce(v_from::text,''),
        'to_date',coalesce(v_to::text,''),'status_filter',v_status,'q',v_q);

 elsif p_path='/payments/new' then
   if v.role<>'recepcion' then raise exception 'Solo recepción registra pagos'; end if;
   v_page:='payment_form';
   props:=jsonb_build_object('members',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from
     (select * from public.members order by name) t));

 elsif p_path ~ '^/receipts/[0-9]+$' then
   v_page:='receipt'; v_id:=substring(p_path from '[0-9]+$')::bigint;
   select to_jsonb(t) into v_m from (
     select p.*,m.name member_name,m.identifier member_code,pr.full_name cashier
     from public.payments p join public.members m on m.id=p.member_id
     join public.profiles pr on pr.id=p.created_by where p.id=v_id
      and (v.role in ('admin','recepcion') or (v.role='socio' and p.member_id=v.member_id))
   ) t;
   if v_m is null then raise exception 'Comprobante no encontrado o no autorizado'; end if;
   props:=jsonb_build_object('p',v_m);

 elsif p_path='/access' then
   if v.role<>'recepcion' then raise exception 'Solo recepción registra accesos'; end if;
   v_page:='access';

 elsif p_path='/classes' then
   v_page:='classes';
   select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into v_rows from (
     select c.*,(select count(*) from public.reservations r where r.class_id=c.id and r.status='active') booked
     from public.classes c
     where c.starts_at>=v_today::timestamp
       and (v_from is null or c.starts_at::date=v_from)
       and c.title ilike '%'||v_activity||'%'
       and c.instructor ilike '%'||v_instructor||'%'
     order by c.starts_at
   ) t;
   props:=jsonb_build_object('rows',v_rows,'from_date',coalesce(v_from::text,''),
     'instructor',v_instructor,'activity',v_activity,'now',to_char(v_now,'YYYY-MM-DD"T"HH24:MI:SS'),
     'my_reserved',case when v.role='socio' then
       (select coalesce(jsonb_agg(class_id),'[]'::jsonb) from public.reservations where member_id=v.member_id and status='active')
       else '[]'::jsonb end);

 elsif p_path='/classes/new' then
   if v.role<>'admin' then raise exception 'Solo administración crea clases'; end if;
   v_page:='class_form';props:=jsonb_build_object('cl',null);

 elsif p_path ~ '^/classes/[0-9]+/edit$' then
   if v.role<>'admin' then raise exception 'Solo administración modifica clases'; end if;
   v_page:='class_form';v_id:=substring(p_path from '^/classes/([0-9]+)/edit$')::bigint;
   select to_jsonb(c) into v_m from public.classes c where c.id=v_id;
   if v_m is null then raise exception 'Clase no encontrada'; end if;
   props:=jsonb_build_object('cl',v_m);

 elsif p_path='/reservations' then
   if v.role<>'recepcion' then raise exception 'Solo recepción gestiona reservas de terceros'; end if;
   v_page:='reservations';
   props:=jsonb_build_object('owner',false,'now',to_char(v_now,'YYYY-MM-DD"T"HH24:MI:SS'),
     'members',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (select * from public.members order by name) t),
     'classes',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (
       select c.*,(select count(*) from public.reservations r where r.class_id=c.id and r.status='active') booked
       from public.classes c where c.status='published' and c.starts_at>=v_now order by c.starts_at
     ) t),
     'rows',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (
       select r.*,m.name member_name,c.title,c.starts_at,c.ends_at,c.status class_status
       from public.reservations r join public.members m on m.id=r.member_id
       join public.classes c on c.id=r.class_id order by c.starts_at desc limit 150
     ) t));

 elsif p_path='/my/reservations' then
   if v.role<>'socio' then raise exception 'Solo socios consultan sus reservas'; end if;
   v_page:='reservations';
   props:=jsonb_build_object('owner',true,'now',to_char(v_now,'YYYY-MM-DD"T"HH24:MI:SS'),
     'rows',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (
       select r.*,c.title,c.instructor,c.room,c.starts_at,c.ends_at,c.status class_status
       from public.reservations r join public.classes c on c.id=r.class_id
       where r.member_id=v.member_id order by c.starts_at desc
     ) t));

 elsif p_path='/my/membership' then
   if v.role<>'socio' then raise exception 'Solo socios consultan su membresía'; end if;
   v_page:='my_membership'; v_m:=private.member_card(v.member_id);
   props:=jsonb_build_object('mb',v_m,'reason',case when v_m is null then 'Sin membresía'
     when not private.member_allowed(v.member_id,false) then 'No vigente / suspendida' else '' end);

 elsif p_path='/my/payments' then
   if v.role<>'socio' then raise exception 'Solo socios consultan sus pagos'; end if;
   v_page:='my_payments';
   props:=jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb)
     from (select * from public.payments where member_id=v.member_id order by paid_on desc,id desc) t));

 elsif p_path='/my/attendance' then
   if v.role<>'socio' then raise exception 'Solo socios consultan su asistencia'; end if;
   v_page:='my_attendance';
   props:=jsonb_build_object('from_date',coalesce(v_from::text,''),'to_date',coalesce(v_to::text,''),
     'rows',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (
       select * from public.attendance where member_id=v.member_id and (v_from is null or access_date>=v_from)
       and (v_to is null or access_date<=v_to) order by entered_at desc
     ) t));

 elsif p_path='/equipment' then
   if v.role<>'admin' then raise exception 'Solo administración consulta equipamiento'; end if;
   v_page:='equipment';
   props:=jsonb_build_object(
      'rows',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (
       select e.*,(select max(scheduled_on) from public.maintenances where equipment_id=e.id) last_check
       from public.equipment e order by e.code
      ) t),
      'maint',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (
       select mt.*,e.code,e.name equipment_name,p.full_name author from public.maintenances mt
       join public.equipment e on e.id=mt.equipment_id join public.profiles p on p.id=mt.created_by
       order by mt.id desc limit 20
      ) t));

 elsif p_path='/reports' then
   if v.role<>'admin' then raise exception 'Solo administración consulta reportes'; end if;
   v_page:='reports';
   select coalesce(jsonb_object_agg(q.status,jsonb_build_object('total',q.total,'count',q.n)),'{}'::jsonb)
     into v_payment_totals from (
       select status,sum(amount) total,count(*) n from public.payments
       where (v_from is null or paid_on>=v_from) and (v_to is null or paid_on<=v_to) group by status
     ) q;
   select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into v_daily from (
     select paid_on as day,sum(amount) total from public.payments where status='confirmed'
      and (v_from is null or paid_on>=v_from) and (v_to is null or paid_on<=v_to)
     group by paid_on order by paid_on desc limit 8
   ) t;
   props:=jsonb_build_object('payments',v_payment_totals,'from_date',coalesce(v_from::text,''),
     'to_date',coalesce(v_to::text,''),
     'attends',(select count(*) from public.attendance where (v_from is null or access_date>=v_from)
      and (v_to is null or access_date<=v_to)),
     'members_count',(select count(*) from public.members),
     'active_count',(select count(distinct member_id) from public.memberships
        where status='active' and starts_on<=v_today and ends_on>=v_today),
     'reservations',(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from (
        select r.status,count(*) n from public.reservations r join public.classes c on c.id=r.class_id
        where (v_from is null or c.starts_at::date>=v_from) and (v_to is null or c.starts_at::date<=v_to)
        group by r.status
      ) q),
     'daily',coalesce((select jsonb_agg(x order by x->>'day') from jsonb_array_elements(v_daily) x),'[]'::jsonb),
     'max_total',greatest(1,coalesce((select max((x->>'total')::bigint) from jsonb_array_elements(v_daily) x),1)));
 else
   raise exception 'Ruta desconocida o no autorizada';
 end if;
 return jsonb_build_object('page',v_page,'path',p_path,'today',v_today::text,
   'user',jsonb_build_object('id',v.id,'full_name',v.full_name,'role',v.role),
   'props',props);
end;
$$;
revoke all on function public.gym_page(text,jsonb) from public,anon,authenticated;
grant execute on function public.gym_page(text,jsonb) to authenticated;
