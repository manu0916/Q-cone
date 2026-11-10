import { createClient } from '@supabase/supabase-js';
import { escapeHTML as e, LEGAL_VERSION } from './domain.js';

const config = window.QCONE_BACKEND || {};
export const backendReady = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url || '') && Boolean(config.publishableKey);
export const db = backendReady ? createClient(config.url, config.publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'qcone.auth' }
}) : null;
export async function rpc(name, payload = {}) {
  if (!db) throw new Error('O sistema de pedidos está em configuração. Tente novamente em breve.');
  const { data, error } = await db.rpc(name, payload);
  if (error) {
    if (error.code === 'P0001') throw new Error(error.message);
    if (error.code === '42501' || error.code === 'PGRST301') throw new Error('Entre novamente na sua conta para continuar.');
    console.error('Falha na operação', error.code);
    throw new Error('Não foi possível concluir agora. Verifique sua conexão e tente novamente.');
  }
  return data;
}
export const getAccount = () => rpc('qcone_account', { action: 'get', payload: {} });
export const accountAction = (action, payload) => rpc('qcone_account', { action, payload });
export function notify(message, error = false) {
  let region = document.getElementById('toast');
  if (!region) {
    region = document.createElement('div'); region.id = 'toast'; region.className = 'toast'; region.setAttribute('role', 'status'); document.body.append(region);
  }
  region.textContent = message; region.dataset.error = String(error); region.hidden = false;
  clearTimeout(notify.timer); notify.timer = setTimeout(() => { region.hidden = true; }, 6500);
}
export function openDialog(dialog) { if (!dialog.open) dialog.showModal(); }
export function wireDialog(dialog) {
  dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
}
export async function busy(button, task) {
  if (button.disabled) return;
  const text = button.textContent; button.disabled = true; button.textContent = 'Aguarde…';
  try { return await task(); } catch (error) { notify(error.message, true); }
  finally { button.disabled = false; button.textContent = text; }
}
const authError = error => ({
  invalid_credentials: 'E-mail ou senha incorretos.', email_not_confirmed: 'Confirme seu e-mail antes de entrar.',
  user_already_exists: 'Confira seu e-mail para continuar ou entre na sua conta.', weak_password: 'Use uma senha com pelo menos 10 caracteres.',
  over_email_send_rate_limit: 'Aguarde um pouco antes de pedir outro e-mail.', email_address_not_authorized: 'O envio de e-mails da loja ainda está em configuração.',
  over_request_rate_limit: 'Muitas tentativas. Aguarde um pouco e tente novamente.', signup_disabled: 'Novos cadastros estão temporariamente indisponíveis.'
}[error.code] || 'Não foi possível autenticar. Confira os dados ou tente novamente mais tarde.');

export function setupAuth({ onLogin = () => {}, onLogout = () => {} } = {}) {
  const dialog = document.getElementById('auth-dialog');
  wireDialog(dialog);
  let mode = 'login'; let pending = null;
  function render() {
    const recovery = mode === 'recover'; const reset = mode === 'reset'; const signup = mode === 'signup';
    dialog.querySelector('#auth-title').textContent = signup ? 'Crie sua conta' : recovery ? 'Recuperar senha' : reset ? 'Escolha uma nova senha' : 'Entre para continuar';
    dialog.querySelector('#auth-content').innerHTML = `
      <p class="muted">${signup ? 'Seus dados e endereços ficam prontos para o próximo pedido.' : recovery ? 'Enviaremos um link para redefinir sua senha.' : reset ? 'Use pelo menos 10 caracteres.' : 'A conta só é necessária para finalizar o pedido.'}</p>
      <form id="auth-form" class="form-stack">
        ${!reset ? '<label>E-mail<input name="email" type="email" autocomplete="email" maxlength="254" required></label>' : ''}
        ${!recovery ? `<label>Senha<input name="password" type="password" autocomplete="${signup || reset ? 'new-password' : 'current-password'}" ${signup || reset ? 'minlength="10"' : ''} maxlength="128" required></label>` : ''}
        ${signup ? `<label class="check-label"><input name="legal" type="checkbox" required><span>Li a <a href="/privacidade/" target="_blank" rel="noopener">Política de Privacidade</a> e aceito os <a href="/termos/" target="_blank" rel="noopener">Termos de Uso</a> (versão ${LEGAL_VERSION}).</span></label>` : ''}
        <p id="auth-status" role="status" class="form-status"></p>
        <button class="order-button" type="submit">${signup ? 'Criar conta' : recovery ? 'Enviar link' : reset ? 'Salvar senha' : 'Entrar'}</button>
      </form>
      ${!reset ? `<div class="auth-switch"><button type="button" class="text-button" data-auth-mode="${signup ? 'login' : 'signup'}">${signup ? 'Já tenho conta' : 'Criar uma conta'}</button></div>` : ''}`;
    dialog.querySelectorAll('[data-auth-mode]').forEach(b => b.addEventListener('click', () => { mode = b.dataset.authMode; render(); }));
    dialog.querySelector('form').addEventListener('submit', event => {
      event.preventDefault(); const form = event.target; const data = new FormData(form);
      busy(form.querySelector('[type=submit]'), async () => {
        if (!db) throw new Error('O sistema de contas está em configuração.');
        const email = String(data.get('email') || '').trim(); const password = String(data.get('password') || '');
        let result;
        if (signup) { const response=await fetch(config.url+'/functions/v1/qcone-signup',{method:'POST',headers:{'Content-Type':'application/json',apikey:config.publishableKey},body:JSON.stringify({email,password,legal_version:LEGAL_VERSION,legal_accepted:true})}); const registered=await response.json();if(!response.ok)throw new Error(registered.error||'Não foi possível criar a conta.');result=await db.auth.signInWithPassword({email,password}); }
        else if (recovery) result = await db.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/?recuperar=1` });
        else if (reset) result = await db.auth.updateUser({ password });
        else result = await db.auth.signInWithPassword({ email, password });
        if (result.error) throw new Error(authError(result.error));
        if (recovery || (signup && !result.data.session)) {
          form.reset(); form.querySelector('#auth-status').textContent = recovery ? 'Se este e-mail tiver uma conta, você receberá o link de recuperação.' : 'Confira sua caixa de entrada e confirme seu e-mail para continuar.'; return;
        }
        dialog.close(); form.reset(); mode = 'login';
        const callback = pending; pending = null;
        await onLogin(); if (callback) await callback();
      });
    });
  }
  db?.auth.onAuthStateChange((event) => {
    // Call database APIs outside the auth callback to avoid locking the client.
    if (event === 'PASSWORD_RECOVERY') setTimeout(() => { mode = 'reset'; render(); openDialog(dialog); }, 0);
    if (event === 'SIGNED_OUT') setTimeout(onLogout, 0);
  });
  render();
  return {
    open(callback) { pending = callback || null; mode = 'login'; render(); openDialog(dialog); },
    async require(callback) {
      const { data } = db ? await db.auth.getUser() : { data: {} };
      if (data.user) await callback(); else this.open(callback);
    },
    async logout() { if (db) { const { error } = await db.auth.signOut(); if (error) throw new Error(authError(error)); } }
  };
}
export { e };
