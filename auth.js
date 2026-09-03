(function(){
  const cfg=window.GVOS_CONFIG||{};
  const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey);
  window.GVOS_DB=client;
  window.GVOSAuth={session:null,async logout(){await client.auth.signOut();location.replace('login.html')}};
  window.GVOSReady=(async()=>{
    const {data:{session}}=await client.auth.getSession();
    const page=location.pathname.split('/').pop()||'index.html';
    if(!session){location.replace('login.html');return null}
    const {data:profile,error}=await client.from('profiles').select('*').eq('id',session.user.id).single();
    if(error||!profile?.active){await client.auth.signOut();location.replace('login.html');return null}
    const current={user:session.user,profile,role:profile.role,label:profile.display_name||profile.organisation||session.user.email};
    if(page==='admin.html'&&!['admin','responder'].includes(current.role)){location.replace('index.html');return null}
    window.GVOSAuth.session=current;
    return current;
  })();
})();
