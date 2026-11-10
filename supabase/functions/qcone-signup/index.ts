import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
const url=Deno.env.get('SUPABASE_URL')!;
const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const client=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const allowed=origin==='https://q-cone.pages.dev'||/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':allowed?origin:'https://q-cone.pages.dev','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST'||!allowed)return reply(403,{error:'Origem não permitida.'});
 try{
  if(Number(req.headers.get('content-length')||0)>4096)return reply(413,{error:'Requisição muito grande.'});
  const text=await req.text();if(text.length>4096)return reply(413,{error:'Requisição muito grande.'});
  const data=JSON.parse(text);
  if(typeof data.email!=='string'||data.email.length>254||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)||typeof data.password!=='string'||data.password.length<10||data.password.length>128||data.legal_version!=='2026-11-10'||data.legal_accepted!==true)return reply(400,{error:'Informe e-mail válido, senha de 10 a 128 caracteres e aceite os termos.'});
  const ip=req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret+ip));
  const key=Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('');
  const limit=await client.rpc('qcone_signup_limit',{key_hash:key});
  if(limit.error||!limit.data)return reply(429,{error:'Muitas tentativas. Aguarde antes de tentar novamente.'});
  const {data:created,error}=await client.auth.admin.createUser({email:data.email.trim().toLowerCase(),password:data.password,email_confirm:true,user_metadata:{legal_version:data.legal_version,legal_accepted:true}});
  if(error)return reply(400,{error:'Não foi possível criar a conta. Se já tem cadastro, use Entrar.'});
  // Consent is explicitly provided by this registration request, never used for admin authorization.
  const sessionClient=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const signed=await sessionClient.auth.signInWithPassword({email:data.email.trim().toLowerCase(),password:data.password});
  if(signed.data.session){await sessionClient.rpc('qcone_account',{action:'accept_legal',payload:{version:'2026-11-10',accepted:true}});await sessionClient.auth.signOut();}
  return reply(200,{ok:true,user_id:created.user.id});
 }catch{return reply(400,{error:'Não foi possível criar a conta agora.'});}
});
