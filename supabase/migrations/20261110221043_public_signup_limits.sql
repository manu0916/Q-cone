-- Explicit owner instruction from the latest message: "nao precisa de recuperaçao de senha por emaipor enquanto,deixa sem,mas permite tudo criaçao de conta e pedidos".
-- This supersedes the earlier provisional closure while hours were undecided. Manual open/close remains available.
create table qcone_private.signup_limits (
 key_hash text primary key,
 attempts integer not null default 1,
 expires_at timestamptz not null
);
alter table qcone_private.signup_limits enable row level security;
revoke all on qcone_private.signup_limits from public,anon,authenticated;
create function public.qcone_signup_limit(key_hash text) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;begin
 if length(key_hash) <> 64 then return false;end if;
 delete from qcone_private.signup_limits where expires_at < now();
 insert into qcone_private.signup_limits values(key_hash,1,now()+interval '1 hour')
 on conflict(key_hash) do update set attempts=signup_limits.attempts+1 returning attempts into n;
 return n <= 5;
end $$;
revoke all on function public.qcone_signup_limit(text) from public,anon,authenticated;
grant execute on function public.qcone_signup_limit(text) to service_role;
update public.store_settings set accepting_orders=true;

create or replace function qcone_private.place_order(payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := qcone_private.require_user(); s public.store_settings; zone public.delivery_zones; oid uuid;
  address jsonb; profile jsonb; item jsonb; product public.products; subtotal integer := 0; quantity integer;
  key uuid := (payload->>'idempotency_key')::uuid; cash integer; items jsonb; current_hours jsonb; local_time timestamp;
begin
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if key is null then raise exception 'Identificador do pedido ausente.'; end if;
  select id into oid from qcone_private.orders where user_id=uid and idempotency_key=key;
  if oid is not null then return qcone_private.order_json(oid,true); end if;
  if not exists(select 1 from qcone_private.legal_acceptances where user_id=uid and version='2026-11-10') then raise exception 'Aceite a Política de Privacidade e os Termos de Uso.'; end if;
  select * into strict s from public.store_settings where id for share;
  if not s.accepting_orders then raise exception 'A loja não está recebendo pedidos agora.'; end if;
  local_time := now() at time zone s.timezone;
  current_hours := s.business_hours->(extract(dow from local_time)::integer::text);
  if s.business_hours <> '{}'::jsonb and (current_hours is null or not coalesce((current_hours->>'enabled')::boolean,false)
    or local_time::time < (current_hours->>'open')::time or local_time::time >= (current_hours->>'close')::time) then
    raise exception 'Estamos fora do horário de atendimento. Consulte os horários da loja.';
  end if;
  if (select count(*) from qcone_private.orders where user_id=uid and created_at > now()-interval '10 minutes') >= 5 then raise exception 'Aguarde antes de fazer outro pedido.'; end if;
  if not (payload->>'payment_method'=any(s.payment_methods)) then raise exception 'Escolha uma forma de pagamento disponível.'; end if;
  profile := qcone_private.clean_profile(payload->'customer');
  address := qcone_private.clean_address(payload->'address');
  select * into zone from public.delivery_zones where id=(payload->>'zone_id')::uuid and active for share;
  if zone.id is null or lower(zone.city) <> lower(address->>'city') or zone.state <> address->>'state'
    or (zone.neighborhood is not null and lower(zone.neighborhood) <> lower(address->>'neighborhood')) then
    raise exception 'Este endereço não está na área de entrega selecionada.';
  end if;
  if length(coalesce(payload->>'notes','')) > 500 then raise exception 'Use até 500 caracteres nas observações.'; end if;
  items := payload->'items';
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 20 then raise exception 'Carrinho inválido.'; end if;
  if (select count(distinct x->>'product_id') from jsonb_array_elements(items) x) <> jsonb_array_length(items) then raise exception 'O carrinho contém produtos repetidos.'; end if;
  -- Stable ordering avoids deadlocks when simultaneous carts contain the same products.
  for item in select value from jsonb_array_elements(items) order by value->>'product_id' loop
    if coalesce(item->>'quantity','') !~ '^[0-9]{1,2}$' then raise exception 'Quantidade inválida.'; end if;
    quantity := (item->>'quantity')::integer;
    if quantity not between 1 and 99 then raise exception 'Quantidade inválida.'; end if;
    select * into product from public.products where id=item->>'product_id' and active for update;
    if product.id is null then raise exception 'Um produto do carrinho está indisponível.'; end if;
    if product.stock_remaining is not null and product.stock_remaining < quantity then raise exception 'Estoque insuficiente para %.',product.name; end if;
    subtotal := subtotal + product.price_cents * quantity;
  end loop;
  if subtotal < s.minimum_order_cents then raise exception 'O pedido não atingiu o valor mínimo da loja.'; end if;
  -- A changed catalog/fee requires the customer to review the new total.
  if (payload->>'expected_total_cents')::integer is distinct from subtotal + zone.fee_cents then raise exception 'O valor foi atualizado. Revise o carrinho antes de confirmar.'; end if;
  cash := nullif(payload->>'cash_change_cents','')::integer;
  if payload->>'payment_method'='cash' and cash is not null and (cash < subtotal+zone.fee_cents or cash > 1000000) then raise exception 'O valor para troco deve cobrir o total do pedido.'; end if;
  insert into qcone_private.orders(user_id,idempotency_key,payment_method,subtotal_cents,delivery_fee_cents,zone_id,encrypted_customer)
  values(uid,key,payload->>'payment_method',subtotal,zone.fee_cents,zone.id,
    qcone_private.encrypt_json(profile || jsonb_build_object('address',address,'notes',trim(coalesce(payload->>'notes','')),'cash_change_cents',case when payload->>'payment_method'='cash' then cash else null end))) returning id into oid;
  for item in select value from jsonb_array_elements(items) order by value->>'product_id' loop
    select * into strict product from public.products where id=item->>'product_id';
    quantity := (item->>'quantity')::integer;
    insert into qcone_private.order_items values(oid,product.id,product.name,quantity,product.price_cents);
    update public.products set stock_remaining=stock_remaining-quantity,updated_at=now() where id=product.id and stock_remaining is not null;
  end loop;
  insert into qcone_private.order_events(order_id,status,actor_id) values(oid,'pending',uid);
  insert into qcone_private.profiles(user_id,encrypted_data) values(uid,qcone_private.encrypt_json(profile))
    on conflict(user_id) do update set encrypted_data=excluded.encrypted_data,updated_at=now();
  return qcone_private.order_json(oid,true);
end $$;

create or replace function qcone_private.admin(action text, payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := qcone_private.require_user(); oid uuid; data jsonb; settings public.store_settings; day text; hours jsonb; rid uuid; begin
  if not qcone_private.is_admin(uid) then raise exception 'Acesso restrito à administração.'; end if;
  if action='orders' then
    return jsonb_build_object('orders',coalesce((select jsonb_agg(qcone_private.order_json(id,false) order by created_at desc) from
      (select id,created_at from qcone_private.orders where (coalesce(payload->>'status','')='' or status=payload->>'status')
        order by created_at desc,id limit 30 offset greatest(0,least(coalesce((payload->>'offset')::integer,0),100000))) page),'[]'::jsonb),
      'counts',(select jsonb_object_agg(status,n) from (select status,count(*) n from qcone_private.orders group by status) counts),
      'today_total_cents',(select coalesce(sum(total_cents),0) from qcone_private.orders where status <> 'cancelled' and created_at >= (date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')),
      'total',(select count(*) from qcone_private.orders where coalesce(payload->>'status','')='' or status=payload->>'status'));
  elsif action='order_detail' then
    oid := (payload->>'id')::uuid;
    data := qcone_private.order_json(oid,true);
    if data is null then raise exception 'Pedido não encontrado.'; end if;
    insert into qcone_private.admin_audit(actor_id,action,entity_id) values(uid,'view_order',oid::text);
    return data;
  elsif action='set_status' then
    oid := (payload->>'id')::uuid;
    perform qcone_private.change_status(oid,payload->>'status',uid);
  elsif action='set_payment' then
    if payload->>'payment_status' not in ('pending','paid') then raise exception 'Pagamento inválido.'; end if;
    update qcone_private.orders set payment_status=payload->>'payment_status',updated_at=now() where id=(payload->>'id')::uuid;
    if not found then raise exception 'Pedido não encontrado.'; end if;
  elsif action='settings' then
    return jsonb_build_object('settings',(select to_jsonb(s) from public.store_settings s where id),
      'zones',coalesce((select jsonb_agg(z order by z.name) from public.delivery_zones z),'[]'::jsonb),
      'products',coalesce((select jsonb_agg(p order by p.id) from public.products p),'[]'::jsonb));
  elsif action='save_settings' then
    select * into settings from public.store_settings where id for update;
    hours := payload->'business_hours';
    if jsonb_typeof(hours) is distinct from 'object' then raise exception 'Horários inválidos.'; end if;
    foreach day in array array['0','1','2','3','4','5','6'] loop
      if coalesce((hours->day->>'enabled')::boolean,false) then
        if coalesce(hours->day->>'open','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(hours->day->>'close','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          or (hours->day->>'open')::time >= (hours->day->>'close')::time then raise exception 'Preencha abertura e fechamento válidos no mesmo dia.'; end if;
      end if;
    end loop;
    if length(coalesce(payload->>'contact_email','')) > 254 or coalesce(payload->>'contact_email','') !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then raise exception 'E-mail de contato inválido.'; end if;
    update public.store_settings set legal_name=left(trim(payload->>'legal_name'),180),tax_id=left(trim(payload->>'tax_id'),24),
      pickup_address=left(trim(payload->>'pickup_address'),300),contact_email=payload->>'contact_email',
      accepting_orders=coalesce((payload->>'accepting_orders')::boolean,false),
      minimum_order_cents=coalesce((payload->>'minimum_order_cents')::integer,0),
      estimated_minutes=coalesce((payload->>'estimated_minutes')::integer,60),business_hours=hours,updated_at=now() where id;
  elsif action='save_zone' then
    if coalesce(payload->>'city','') <> 'Paraguaçu' or payload->>'state' is distinct from 'MG' then raise exception 'A área desta loja é Paraguaçu/MG.'; end if;
    insert into public.delivery_zones(id,name,city,state,neighborhood,fee_cents,active)
      values(coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid()),left(trim(payload->>'name'),120),'Paraguaçu','MG',
        nullif(trim(payload->>'neighborhood'),''),(payload->>'fee_cents')::integer,coalesce((payload->>'active')::boolean,false))
      on conflict(id) do update set name=excluded.name,neighborhood=excluded.neighborhood,fee_cents=excluded.fee_cents,active=excluded.active;
  elsif action='save_product' then
    update public.products set price_cents=(payload->>'price_cents')::integer,active=(payload->>'active')::boolean,
      stock_remaining=nullif(payload->>'stock_remaining','')::integer,updated_at=now() where id=payload->>'id';
    if not found then raise exception 'Produto não encontrado.'; end if;
  elsif action='privacy_requests' then
    insert into qcone_private.admin_audit(actor_id,action) values(uid,'view_privacy_requests');
    return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'user_id',r.user_id,'kind',r.kind,'status',r.status,'created_at',r.created_at,
      'email',u.email,'name',coalesce(qcone_private.decrypt_json(p.encrypted_data)->>'name','Cliente')) order by r.created_at desc)
      from qcone_private.privacy_requests r left join auth.users u on u.id=r.user_id left join qcone_private.profiles p on p.user_id=r.user_id
      where r.status='pending'),'[]'::jsonb);
  elsif action='complete_privacy_request' then
    rid := (payload->>'id')::uuid;
    update qcone_private.privacy_requests set status='completed',completed_at=now() where id=rid and status='pending' and kind<>'deletion';
    if not found then raise exception 'Solicitações de exclusão exigem tratamento pelo responsável no Supabase; siga o procedimento documentado.'; end if;
  else raise exception 'Ação inválida.';
  end if;
  insert into qcone_private.admin_audit(actor_id,action,entity_id) values(uid,action,coalesce(payload->>'id','store'));
  return jsonb_build_object('ok',true);
end $$;

notify pgrst,'reload schema';
