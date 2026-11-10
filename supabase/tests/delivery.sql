-- Integration test; all fixture data and changes are rolled back.
begin;
create temporary table qcone_test_context(uid uuid,sid uuid,other_uid uuid,other_sid uuid);
insert into qcone_test_context values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 select uid,'qcone-test-one@example.invalid',now(),'{}'::jsonb,'{}'::jsonb from qcone_test_context
 union all select other_uid,'qcone-test-two@example.invalid',now(),'{}'::jsonb,'{}'::jsonb from qcone_test_context;
insert into auth.sessions(id,user_id,created_at,updated_at)
 select sid,uid,now(),now() from qcone_test_context
 union all select other_sid,other_uid,now(),now() from qcone_test_context;
update public.store_settings set accepting_orders=true,business_hours=(select jsonb_object_agg(d::text,jsonb_build_object('enabled',true,'open','00:00','close','23:59')) from generate_series(0,6) d);
update public.delivery_zones set fee_to_confirm=false,active=true,fee_cents=500;
update public.products set stock_remaining=10;
do $$
declare c record; a jsonb; order_data jsonb; payload jsonb; oid uuid; zone uuid; blocked boolean; attempt integer;
begin
 select * into c from qcone_test_context;
 select id into zone from public.delivery_zones limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c.uid,'session_id',c.sid,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 perform public.qcone_account('accept_legal','{"version":"2026-11-10","accepted":true}');
 perform public.qcone_account('save_profile','{"name":"Cliente Teste","phone":"35999999999"}');
 a := '{"label":"Casa","street":"Rua Teste","number":"10","postal_code":"37120000","neighborhood":"Centro","city":"Paraguaçu","state":"MG"}';
 perform public.qcone_account('save_address',a);
 if jsonb_array_length(public.qcone_account('get','{}')->'addresses') <> 1 then raise exception 'address save failed'; end if;
 blocked:=false;
 begin perform public.qcone_admin('settings','{}'); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'non-admin gained admin access'; end if;
 payload:=jsonb_build_object('idempotency_key',gen_random_uuid(),'customer',jsonb_build_object('name','Cliente Teste','phone','35999999999'),
   'address',a,'zone_id',zone,'payment_method','cash','expected_total_cents',3300,'items',jsonb_build_array(jsonb_build_object('product_id','morango','quantity',2)));
 order_data:=public.qcone_place_order(payload);oid:=(order_data->>'id')::uuid;
 if (order_data->>'total_cents')::integer <> 3300 then raise exception 'server price calculation failed'; end if;
 if public.qcone_place_order(payload)->>'id' <> oid::text then raise exception 'idempotency failed'; end if;
 blocked:=false;
 begin perform public.qcone_place_order(payload||jsonb_build_object('idempotency_key',gen_random_uuid(),'expected_total_cents',1)); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'tampered price accepted'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c.other_uid,'session_id',c.other_sid,'role','authenticated')::text,true);
 if jsonb_array_length(public.qcone_orders('list','{}')->'orders') <> 0 then raise exception 'other customer can read order'; end if;
 blocked:=false;
 begin perform public.qcone_orders('cancel',jsonb_build_object('id',oid)); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'other customer can cancel order'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c.uid,'session_id',c.sid,'role','authenticated')::text,true);
 perform public.qcone_orders('cancel',jsonb_build_object('id',oid));
 execute 'reset role';
 if (select stock_remaining from public.products where id='morango') <> 10 then raise exception 'stock was not restored exactly once'; end if;
 if (select count(*) from qcone_private.orders where user_id=c.uid) <> 1 then raise exception 'duplicate order inserted'; end if;
 if position('Cliente Teste' in encode((select encrypted_data from qcone_private.profiles where user_id=c.uid),'escape')) > 0 then raise exception 'PII stored as plaintext'; end if;
 if has_table_privilege('authenticated','qcone_private.profiles','select') then raise exception 'private table accessible'; end if;
 if has_function_privilege('anon','public.qcone_account(text,jsonb)','execute') then raise exception 'anonymous account API access'; end if;
 if has_function_privilege('authenticated','qcone_private.decrypt_json(bytea)','execute') then raise exception 'decryption helper accessible'; end if;

 execute 'reset role';
 update public.delivery_zones set fee_to_confirm=true,fee_cents=0 where id=zone;
 insert into qcone_private.admin_users(user_id) values(c.uid);
 execute 'set local role authenticated';
 payload:=payload||jsonb_build_object('idempotency_key',gen_random_uuid(),'expected_total_cents',2800);
 order_data:=public.qcone_place_order(payload);oid:=(order_data->>'id')::uuid;
 if order_data->>'delivery_fee_pending' <> 'true' then raise exception 'quote flag missing';end if;
 blocked:=false;
 begin perform public.qcone_admin('set_status',jsonb_build_object('id',oid,'status','confirmed')); exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'unagreed fee confirmation accepted';end if;
 perform public.qcone_admin('set_delivery_fee',jsonb_build_object('id',oid,'fee_cents',500,'agreed',true));
 order_data:=public.qcone_admin('order_detail',jsonb_build_object('id',oid));
 if order_data->>'delivery_fee_pending' <> 'false' or (order_data->>'total_cents')::integer <> 3300 then raise exception 'agreed fee total incorrect';end if;
 perform public.qcone_admin('set_status',jsonb_build_object('id',oid,'status','confirmed'));
 perform public.qcone_admin('set_status',jsonb_build_object('id',oid,'status','cancelled'));
 execute 'reset role';
 for attempt in 1..6 loop
   if public.qcone_signup_limit(repeat('b',64)) is distinct from (attempt<=5) then raise exception 'signup limit failed';end if;
 end loop;
end $$;
rollback;
select 'PASS: encryption, account ownership, admin denial, pricing, idempotency, cancellation and stock' as result;
