alter table public.delivery_zones add column fee_to_confirm boolean not null default true;
alter table qcone_private.orders add column delivery_fee_pending boolean not null default false;

create function qcone_private.quote_flags() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_schema='public' then
   if new.fee_to_confirm then new.fee_cents:=0; end if;
 else
   if tg_op='INSERT' then
     select fee_to_confirm into new.delivery_fee_pending from public.delivery_zones where id=new.zone_id;
   elsif new.status <> old.status and new.status not in ('pending','cancelled') and new.delivery_fee_pending then
     raise exception 'Registre a taxa combinada com o cliente antes de confirmar o pedido.';
   end if;
 end if;
 return new;
end $$;
create trigger delivery_zone_quote before insert or update on public.delivery_zones for each row execute function qcone_private.quote_flags();
create trigger delivery_order_quote before insert or update on qcone_private.orders for each row execute function qcone_private.quote_flags();
revoke all on function qcone_private.quote_flags() from public,anon,authenticated;

create function qcone_private.set_delivery_fee(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=qcone_private.require_user(); oid uuid:=(payload->>'id')::uuid; fee integer:=(payload->>'fee_cents')::integer;
begin
 if not qcone_private.is_admin(uid) then raise exception 'Acesso restrito à administração.'; end if;
 if payload->>'agreed' is distinct from 'true' or fee is null or fee not between 0 and 100000 then raise exception 'Informe a taxa e confirme que ela foi combinada com o cliente.'; end if;
 update qcone_private.orders set delivery_fee_cents=fee,delivery_fee_pending=false,updated_at=now()
  where id=oid and status='pending' and payment_status='pending';
 if not found then raise exception 'A taxa só pode ser definida antes da confirmação e do pagamento.'; end if;
 insert into qcone_private.admin_audit(actor_id,action,entity_id) values(uid,'delivery_fee_agreed',oid::text);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function qcone_private.set_delivery_fee(jsonb) from public,anon,authenticated;
grant execute on function qcone_private.set_delivery_fee(jsonb) to authenticated;
create or replace function public.qcone_admin(action text,payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select case when action='set_delivery_fee' then qcone_private.set_delivery_fee(payload) else qcone_private.admin(action,payload) end;
$$;
update public.delivery_zones set fee_cents=0,active=true;

create or replace function qcone_private.order_json(oid uuid, include_customer boolean default false) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id',o.id,'number',o.number,'status',o.status,'payment_method',o.payment_method,
    'payment_status',o.payment_status,'subtotal_cents',o.subtotal_cents,'delivery_fee_cents',o.delivery_fee_cents,'delivery_fee_pending',o.delivery_fee_pending,
    'total_cents',o.total_cents,'created_at',o.created_at,'updated_at',o.updated_at,
    'items',coalesce((select jsonb_agg(jsonb_build_object('product_id',i.product_id,'name',i.product_name,'quantity',i.quantity,'unit_price_cents',i.unit_price_cents) order by i.product_id) from qcone_private.order_items i where i.order_id=o.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('status',ev.status,'created_at',ev.created_at) order by ev.created_at,ev.id) from qcone_private.order_events ev where ev.order_id=o.id),'[]'::jsonb))
    || case when include_customer then jsonb_build_object('customer',qcone_private.decrypt_json(o.encrypted_customer)) else '{}'::jsonb end
  from qcone_private.orders o where o.id = oid;
$$;

notify pgrst,'reload schema';
