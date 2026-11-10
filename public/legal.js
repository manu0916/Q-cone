/* Supplier information is configured by the owner in Supabase, outside Git. */
(async () => {
  try {
    const c=window.QCONE_BACKEND;
    const response=await fetch(c.url+'/rest/v1/rpc/qcone_bootstrap',{method:'POST',headers:{apikey:c.publishableKey,'Content-Type':'application/json'},body:'{}'});
    if(!response.ok)return;
    const {settings:s}=await response.json();
    document.querySelectorAll('[data-contact-email]').forEach(a=>{if(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.contact_email)){a.textContent=s.contact_email;a.href='mailto:'+s.contact_email;}});
    document.querySelectorAll('[data-store-address]').forEach(el=>{if(s.pickup_address)el.textContent=s.pickup_address;});
  }catch{ /* WhatsApp remains available when the API is unavailable. */ }
})();
