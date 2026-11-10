create function qcone_private.signup_limit(p_key text) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;begin
 if p_key !~ '^[a-f0-9]{64}$' then return false;end if;
 delete from qcone_private.signup_limits where expires_at < now();
 insert into qcone_private.signup_limits values(p_key,1,now()+interval '1 hour')
 on conflict on constraint signup_limits_pkey do update set attempts=signup_limits.attempts+1 returning attempts into n;
 return n <= 5;
end $$;
revoke all on function qcone_private.signup_limit(text) from public,anon,authenticated;
grant usage on schema qcone_private to service_role;
grant execute on function qcone_private.signup_limit(text) to service_role;
create or replace function public.qcone_signup_limit(key_hash text) returns boolean language sql security invoker set search_path='' as $$ select qcone_private.signup_limit(key_hash); $$;
notify pgrst,'reload schema';
