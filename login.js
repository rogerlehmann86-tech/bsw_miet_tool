const cfg=window.GVOS_CONFIG||{};
const db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey);
db.auth.getSession().then(({data})=>{if(data.session)location.replace('index.html')});
document.getElementById('loginForm').onsubmit=async e=>{
  e.preventDefault();
  const box=document.getElementById('loginError'),button=e.submitter;
  box.classList.add('hidden');button.disabled=true;button.textContent='Anmelden …';
  const {data,error}=await db.auth.signInWithPassword({email:document.getElementById('loginUser').value.trim(),password:document.getElementById('loginPassword').value});
  if(error){box.textContent='E-Mail-Adresse oder Passwort ist nicht korrekt.';box.classList.remove('hidden');button.disabled=false;button.textContent='Anmelden';return}
  const {data:profile}=await db.from('profiles').select('role,active').eq('id',data.user.id).single();
  if(!profile?.active){await db.auth.signOut();box.textContent='Dieser Zugang ist deaktiviert.';box.classList.remove('hidden');button.disabled=false;button.textContent='Anmelden';return}
  location.replace(['admin','responder'].includes(profile.role)?'admin.html':'index.html');
};
