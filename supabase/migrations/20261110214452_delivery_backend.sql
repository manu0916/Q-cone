-- Q’Cone delivery. PII is encrypted with AES-256; the wrapping key lives in Vault.
-- Only the four checked RPC entry points may reach the private schema.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;
create schema if not exists qcone_private;
revoke all on schema qcone_private from public, anon, authenticated;
alter default privileges in schema qcone_private revoke execute on functions from public;
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'qcone_pii_v1') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'qcone_pii_v1', 'Qcone customer data encryption key v1. Do not delete or rotate without re-encrypting records.');
  end if;
end $$;

create table public.products (
  id text primary key check (id ~ '^[a-z0-9-]{1,60}$'),
  name text not null check (length(name) between 2 and 120),
  description text not null default '',
  price_cents integer not null check (price_cents between 1 and 1000000),
  active boolean not null default true,
  stock_remaining integer check (stock_remaining >= 0),
  updated_at timestamptz not null default now()
);
create table public.store_settings (
  id boolean primary key default true check (id),
  store_name text not null default 'Q’Cone',
  legal_name text not null default '',
  tax_id text not null default '',
  contact_email text not null default '',
  whatsapp_url text not null default 'https://wa.me/qr/L77USZRW5KKQL1',
  pickup_address text not null default '',
  city text not null default 'Paraguaçu',
  state text not null default 'MG' check (state ~ '^[A-Z]{2}$'),
  accepting_orders boolean not null default false,
  minimum_order_cents integer not null default 0 check (minimum_order_cents >= 0),
  estimated_minutes integer not null default 60 check (estimated_minutes between 10 and 1440),
  payment_methods text[] not null default array['pix_on_delivery','cash','card_on_delivery'],
  business_hours jsonb not null default '{}'::jsonb,
  timezone text not null default 'America/Sao_Paulo' check (timezone = 'America/Sao_Paulo'),
  legal_version text not null default '2026-11-10',
  updated_at timestamptz not null default now(),
  check (payment_methods <@ array['pix_on_delivery','cash','card_on_delivery']::text[] and cardinality(payment_methods) > 0)
);
create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 120),
  city text not null default 'Paraguaçu',
  state text not null default 'MG' check (state ~ '^[A-Z]{2}$'),
  neighborhood text, -- null = all neighborhoods in this city
  fee_cents integer not null check (fee_cents between 0 and 100000),
  active boolean not null default false
);
create unique index delivery_zones_area_idx on public.delivery_zones (lower(city), state, lower(coalesce(neighborhood, '*')));

create table qcone_private.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table qcone_private.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_data bytea not null,
  updated_at timestamptz not null default now()
);
create table qcone_private.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  encrypted_data bytea not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index addresses_user_id_idx on qcone_private.addresses (user_id, created_at);
create unique index addresses_one_default_idx on qcone_private.addresses (user_id) where is_default;
create table qcone_private.legal_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  version text not null,
  accepted_at timestamptz not null default now(),
  primary key(user_id, version)
);
create table qcone_private.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  user_id uuid references auth.users(id) on delete set null,
  idempotency_key uuid not null,
  status text not null default 'pending' check (status in ('pending','confirmed','preparing','out_for_delivery','delivered','cancelled')),
  payment_method text not null check (payment_method in ('pix_on_delivery','cash','card_on_delivery')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid')),
  subtotal_cents integer not null check (subtotal_cents > 0),
  delivery_fee_cents integer not null check (delivery_fee_cents >= 0),
  total_cents integer generated always as (subtotal_cents + delivery_fee_cents) stored,
  zone_id uuid references public.delivery_zones(id),
  encrypted_customer bytea not null, -- immutable contact/address/notes snapshot
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);
create index orders_customer_created_idx on qcone_private.orders (user_id, created_at desc);
create index orders_status_created_idx on qcone_private.orders (status, created_at desc);
create index orders_created_idx on qcone_private.orders (created_at desc);
create index orders_zone_idx on qcone_private.orders (zone_id);
create table qcone_private.order_items (
  order_id uuid not null references qcone_private.orders(id) on delete cascade,
  product_id text not null references public.products(id),
  product_name text not null,
  quantity integer not null check (quantity between 1 and 99),
  unit_price_cents integer not null check (unit_price_cents > 0),
  primary key(order_id, product_id)
);
create index order_items_product_idx on qcone_private.order_items (product_id);
create table qcone_private.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references qcone_private.orders(id) on delete cascade,
  status text not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on qcone_private.order_events (order_id, created_at);
create index order_events_actor_idx on qcone_private.order_events (actor_id);
create table qcone_private.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('deletion','access','correction')),
  status text not null default 'pending' check (status in ('pending','completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index privacy_requests_user_idx on qcone_private.privacy_requests (user_id, created_at desc);
create unique index privacy_requests_pending_idx on qcone_private.privacy_requests (user_id, kind) where status = 'pending';
create table qcone_private.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_id text,
  created_at timestamptz not null default now()
);
create index admin_audit_actor_idx on qcone_private.admin_audit (actor_id);

alter table public.products enable row level security;
alter table public.store_settings enable row level security;
alter table public.delivery_zones enable row level security;
create policy catalog_public on public.products for select to anon, authenticated using (active);
create policy settings_public on public.store_settings for select to anon, authenticated using (true);
create policy zones_public on public.delivery_zones for select to anon, authenticated using (active);
revoke all on public.products, public.store_settings, public.delivery_zones from anon, authenticated;
grant select on public.products, public.store_settings, public.delivery_zones to anon, authenticated;
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'qcone_private' loop
    execute format('alter table qcone_private.%I enable row level security', t.tablename);
  end loop;
end $$;
revoke all on all tables in schema qcone_private from public, anon, authenticated;
revoke all on all sequences in schema qcone_private from public, anon, authenticated;

-- Helpers are not executable by any API role. Entry points perform authorization.
create function qcone_private.encrypt_json(data jsonb) returns bytea language plpgsql volatile set search_path = '' as $$
declare k text; begin
  select decrypted_secret into strict k from vault.decrypted_secrets where name = 'qcone_pii_v1';
  return extensions.pgp_sym_encrypt(data::text, k, 'cipher-algo=aes256,compress-algo=1');
end $$;
create function qcone_private.decrypt_json(data bytea) returns jsonb language plpgsql stable set search_path = '' as $$
declare k text; begin
  select decrypted_secret into strict k from vault.decrypted_secrets where name = 'qcone_pii_v1';
  return extensions.pgp_sym_decrypt(data, k)::jsonb;
end $$;
create function qcone_private.require_user() returns uuid language plpgsql stable set search_path = '' as $$
declare uid uuid := auth.uid(); begin
  if uid is null or not exists (
    select 1 from auth.users u join auth.sessions s on s.user_id = u.id
    where u.id = uid and u.email_confirmed_at is not null and u.deleted_at is null
      and (u.banned_until is null or u.banned_until < now())
      and s.id::text = auth.jwt()->>'session_id' and (s.not_after is null or s.not_after > now())
  ) then raise exception 'Entre em uma conta com e-mail confirmado para continuar.'; end if;
  return uid;
end $$;
create function qcone_private.is_admin(uid uuid) returns boolean language sql stable set search_path = '' as $$
  select uid is not null and exists(select 1 from qcone_private.admin_users where user_id = uid);
$$;
create function qcone_private.clean_profile(data jsonb) returns jsonb language plpgsql immutable set search_path = '' as $$
declare n text := trim(data->>'name'); p text := regexp_replace(coalesce(data->>'phone',''), '[^0-9]', '', 'g'); begin
  if n is null or length(n) not between 3 and 120 then raise exception 'Informe seu nome completo (3 a 120 caracteres).'; end if;
  if p !~ '^(55)?[0-9]{10,11}$' then raise exception 'Informe um telefone válido com DDD.'; end if;
  return jsonb_build_object('name',n,'phone',p);
end $$;
create function qcone_private.clean_address(data jsonb) returns jsonb language plpgsql immutable set search_path = '' as $$
declare k text; result jsonb := '{}'::jsonb; value text; begin
  foreach k in array array['label','postal_code','street','number','complement','neighborhood','city','state','reference'] loop
    value := trim(coalesce(data->>k,''));
    if length(value) > 180 then raise exception 'Um campo do endereço é muito longo.'; end if;
    result := result || jsonb_build_object(k, value);
  end loop;
  if (result->>'postal_code') !~ '^[0-9]{5}-?[0-9]{3}$' or (result->>'state') !~ '^[A-Z]{2}$'
    or length(result->>'street') < 2 or length(result->>'number') < 1
    or length(result->>'neighborhood') < 2 or length(result->>'city') < 2 then
    raise exception 'Preencha CEP, rua, número, bairro, cidade e UF.';
  end if;
  return result;
end $$;
create function qcone_private.order_json(oid uuid, include_customer boolean default false) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id',o.id,'number',o.number,'status',o.status,'payment_method',o.payment_method,
    'payment_status',o.payment_status,'subtotal_cents',o.subtotal_cents,'delivery_fee_cents',o.delivery_fee_cents,
    'total_cents',o.total_cents,'created_at',o.created_at,'updated_at',o.updated_at,
    'items',coalesce((select jsonb_agg(jsonb_build_object('product_id',i.product_id,'name',i.product_name,'quantity',i.quantity,'unit_price_cents',i.unit_price_cents) order by i.product_id) from qcone_private.order_items i where i.order_id=o.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('status',ev.status,'created_at',ev.created_at) order by ev.created_at,ev.id) from qcone_private.order_events ev where ev.order_id=o.id),'[]'::jsonb))
    || case when include_customer then jsonb_build_object('customer',qcone_private.decrypt_json(o.encrypted_customer)) else '{}'::jsonb end
  from qcone_private.orders o where o.id = oid;
$$;

create function qcone_private.account(action text, payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := qcone_private.require_user(); aid uuid; data jsonb; begin
  -- Serializes account changes and default-address selection for this customer.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  if action = 'accept_legal' then
    if payload->>'version' is distinct from '2026-11-10' or payload->>'accepted' is distinct from 'true' then raise exception 'Leia e aceite os termos atuais.'; end if;
    insert into qcone_private.legal_acceptances(user_id,version) values(uid,'2026-11-10') on conflict do nothing;
  elsif action = 'save_profile' then
    data := qcone_private.clean_profile(payload);
    insert into qcone_private.profiles(user_id,encrypted_data) values(uid,qcone_private.encrypt_json(data))
      on conflict(user_id) do update set encrypted_data=excluded.encrypted_data,updated_at=now();
  elsif action = 'save_address' then
    data := qcone_private.clean_address(payload);
    if payload->>'id' is not null and payload->>'id' <> '' then
      aid := (payload->>'id')::uuid;
      if not exists(select 1 from qcone_private.addresses where id=aid and user_id=uid) then raise exception 'Endereço não encontrado.'; end if;
    else
      if (select count(*) from qcone_private.addresses where user_id=uid) >= 10 then raise exception 'Você pode salvar até 10 endereços.'; end if;
      aid := gen_random_uuid();
    end if;
    if coalesce((payload->>'is_default')::boolean,false) or not exists(select 1 from qcone_private.addresses where user_id=uid) then
      update qcone_private.addresses set is_default=false where user_id=uid;
      insert into qcone_private.addresses(id,user_id,encrypted_data,is_default) values(aid,uid,qcone_private.encrypt_json(data),true)
        on conflict(id) do update set encrypted_data=excluded.encrypted_data,is_default=true;
    else
      insert into qcone_private.addresses(id,user_id,encrypted_data) values(aid,uid,qcone_private.encrypt_json(data))
        on conflict(id) do update set encrypted_data=excluded.encrypted_data;
    end if;
  elsif action = 'delete_address' then
    delete from qcone_private.addresses where id=(payload->>'id')::uuid and user_id=uid;
    if not exists(select 1 from qcone_private.addresses where user_id=uid and is_default) then
      update qcone_private.addresses set is_default=true where id=(select id from qcone_private.addresses where user_id=uid order by created_at limit 1);
    end if;
  elsif action = 'privacy_request' then
    if payload->>'kind' not in ('deletion','access','correction') then raise exception 'Solicitação inválida.'; end if;
    insert into qcone_private.privacy_requests(user_id,kind) values(uid,payload->>'kind') on conflict do nothing;
  elsif action not in ('get','export') then raise exception 'Ação inválida.';
  end if;
  select jsonb_build_object(
    'profile',coalesce((select qcone_private.decrypt_json(encrypted_data) from qcone_private.profiles where user_id=uid),'{}'::jsonb),
    'email',(select email from auth.users where id=uid),
    'is_admin',qcone_private.is_admin(uid),
    'legal_accepted',exists(select 1 from qcone_private.legal_acceptances where user_id=uid and version='2026-11-10'),
    'addresses',coalesce((select jsonb_agg(qcone_private.decrypt_json(encrypted_data) || jsonb_build_object('id',id,'is_default',is_default) order by is_default desc,created_at) from qcone_private.addresses where user_id=uid),'[]'::jsonb),
    'privacy_requests',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'status',status,'created_at',created_at) order by created_at desc) from qcone_private.privacy_requests where user_id=uid),'[]'::jsonb)
  ) into data;
  if action='export' then
    data := data || jsonb_build_object('orders',coalesce((select jsonb_agg(qcone_private.order_json(id,true) order by created_at desc) from qcone_private.orders where user_id=uid),'[]'::jsonb),
      'legal_acceptances',coalesce((select jsonb_agg(jsonb_build_object('version',version,'accepted_at',accepted_at)) from qcone_private.legal_acceptances where user_id=uid),'[]'::jsonb));
  end if;
  return data;
end $$;

create function qcone_private.place_order(payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
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
  if current_hours is null or not coalesce((current_hours->>'enabled')::boolean,false)
    or local_time::time < (current_hours->>'open')::time or local_time::time >= (current_hours->>'close')::time then
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

create function qcone_private.change_status(oid uuid, target text, actor uuid) returns void language plpgsql set search_path = '' as $$
declare current_status text; item record; begin
  select status into current_status from qcone_private.orders where id=oid for update;
  if current_status is null then raise exception 'Pedido não encontrado.'; end if;
  if current_status=target then return; end if;
  if not ((current_status='pending' and target in ('confirmed','cancelled')) or
    (current_status='confirmed' and target in ('preparing','cancelled')) or
    (current_status='preparing' and target in ('out_for_delivery','cancelled')) or
    (current_status='out_for_delivery' and target in ('delivered','cancelled'))) then raise exception 'Esta alteração de status não é permitida.'; end if;
  if target='cancelled' then
    for item in select product_id,quantity from qcone_private.order_items where order_id=oid order by product_id loop
      update public.products set stock_remaining=stock_remaining+item.quantity,updated_at=now() where id=item.product_id and stock_remaining is not null;
    end loop;
  end if;
  update qcone_private.orders set status=target,updated_at=now() where id=oid;
  insert into qcone_private.order_events(order_id,status,actor_id) values(oid,target,actor);
end $$;
create function qcone_private.customer_orders(action text, payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := qcone_private.require_user(); oid uuid; offset_rows integer := greatest(0,least(coalesce((payload->>'offset')::integer,0),100000)); begin
  if action='cancel' then
    oid := (payload->>'id')::uuid;
    perform 1 from qcone_private.orders where id=oid and user_id=uid and status='pending' for update;
    if not found then raise exception 'Somente pedidos aguardando confirmação podem ser cancelados aqui. Contate a loja para os demais.'; end if;
    perform qcone_private.change_status(oid,'cancelled',uid);
    return qcone_private.order_json(oid,true);
  elsif action <> 'list' then raise exception 'Ação inválida.'; end if;
  return jsonb_build_object('orders',coalesce((select jsonb_agg(qcone_private.order_json(id,true) order by created_at desc) from
    (select id,created_at from qcone_private.orders where user_id=uid order by created_at desc,id limit 20 offset offset_rows) page),'[]'::jsonb),
    'total',(select count(*) from qcone_private.orders where user_id=uid));
end $$;

create function qcone_private.admin(action text, payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
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
    if coalesce((payload->>'accepting_orders')::boolean,false) and (
      length(trim(coalesce(payload->>'legal_name',''))) < 3 or length(trim(coalesce(payload->>'pickup_address',''))) < 8 or
      length(regexp_replace(coalesce(payload->>'tax_id',''),'[^0-9]','','g')) not in (11,14) or
      not exists(select 1 from public.delivery_zones where active) or
      not exists(select 1 from jsonb_each(hours) h where h.value->>'enabled'='true')
    ) then raise exception 'Antes de abrir: informe identificação do fornecedor (nome e CPF/CNPJ), endereço da loja, horários e ative uma área com taxa de entrega.'; end if;
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

-- Public functions are SECURITY INVOKER; privileged work stays in a private schema.
create function public.qcone_account(action text default 'get', payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select qcone_private.account(action,payload); $$;
create function public.qcone_place_order(payload jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select qcone_private.place_order(payload); $$;
create function public.qcone_orders(action text default 'list', payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select qcone_private.customer_orders(action,payload); $$;
create function public.qcone_admin(action text, payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select qcone_private.admin(action,payload); $$;
create function public.qcone_bootstrap() returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('settings',(select to_jsonb(s) from public.store_settings s where id),
    'products',coalesce((select jsonb_agg(p order by id) from public.products p),'[]'::jsonb),
    'zones',coalesce((select jsonb_agg(z order by name) from public.delivery_zones z),'[]'::jsonb));
$$;
revoke execute on all functions in schema qcone_private from public,anon,authenticated;
grant usage on schema qcone_private to authenticated;
grant execute on function qcone_private.account(text,jsonb),qcone_private.place_order(jsonb),qcone_private.customer_orders(text,jsonb),qcone_private.admin(text,jsonb) to authenticated;
revoke execute on function public.qcone_account(text,jsonb),public.qcone_place_order(jsonb),public.qcone_orders(text,jsonb),public.qcone_admin(text,jsonb),public.qcone_bootstrap() from public,anon,authenticated;
grant execute on function public.qcone_account(text,jsonb),public.qcone_place_order(jsonb),public.qcone_orders(text,jsonb),public.qcone_admin(text,jsonb) to authenticated;
grant execute on function public.qcone_bootstrap() to anon,authenticated;

insert into public.store_settings(id) values(true);
insert into public.products(id,name,description,price_cents) values
  ('morango','Morango cravejado','Casquinha crocante com brigadeiro branco e geleia de morango. Cobertura de chocolate branco com pedaços de caramelo vermelho.',1400),
  ('maracuja','Maracujá cravejado','Casquinha crocante com brigadeiro branco e polpa de maracujá. Cobertura de chocolate branco com pedaços de caramelo amarelo.',1400);
-- The owner has not specified the delivery fee. This zone remains disabled until configured.
insert into public.delivery_zones(name,city,state,neighborhood,fee_cents,active) values('Todos os bairros de Paraguaçu','Paraguaçu','MG',null,0,false);
notify pgrst, 'reload schema';
