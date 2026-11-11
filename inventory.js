
(() => {
  'use strict';
  const db=window.GVOS_DB;
  const byId=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const norm=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const chf=value=>new Intl.NumberFormat('de-CH',{style:'currency',currency:'CHF'}).format(Number(value)||0);
  const qtyFmt=value=>new Intl.NumberFormat('de-CH',{maximumFractionDigits:3}).format(Number(value)||0);
  const safeName=value=>String(value??'').trim().slice(0,500);
  const num=value=>{
    if(value===null||value===undefined||value==='')return null;
    if(typeof value==='number')return Number.isFinite(value)?value:null;
    const s=String(value).replace(/['’\s]/g,'').replace(',','.');
    const n=Number(s);return Number.isFinite(n)?n:null;
  };
  const state={user:null,owners:[],sites:[],items:[],events:[],products:[],page:0,perPage:75,selected:new Set(),plan:null,busy:false};
  const isAdmin=()=>state.user?.role==='admin';
  const ownerName=id=>state.owners.find(x=>x.id===id)?.name||'–';
  const siteName=id=>state.sites.find(x=>x.id===id)?.name||'–';
  const productName=id=>state.products.find(x=>x.id===id)?.name||'';
  const lineValue=item=>Number(item.quantity||0)*Number(item.unit_value||0);
  const sortName=(a,b)=>a.localeCompare(b,'de-CH',{numeric:true});
  function message(text,type=''){
    const el=byId('invMessage');el.className='notice '+(type==='error'?'error':type==='success'?'success':'');
    el.textContent=text;el.classList.remove('hidden');el.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function notifyError(error){message(error?.message||String(error),'error');console.error('Inventar',error);}
  function closeDialog(id){byId(id)?.close();}
  function openDialog(id){byId(id)?.showModal();}
  async function fetchAll(table,sort='created_at',ascending=true,fields='*'){
    const list=[];const batch=500;
    for(let start=0;start<25000;start+=batch){
      const {data,error}=await db.from(table).select(fields).order(sort,{ascending}).range(start,start+batch-1);
      if(error)throw error;
      list.push(...(data||[]));
      if(!data||data.length<batch)return list;
    }
    throw new Error('Mehr als 25’000 Datensätze. Bitte Datenabruf erweitern.');
  }
  async function refresh(){
    const [owners,sites,items,events,products]=await Promise.all([
      fetchAll('inventory_owners','name'),fetchAll('inventory_sites','name'),
      fetchAll('inventory_items','name'),fetchAll('inventory_events','created_at',false),
      fetchAll('products','name',true,'id,name,quantity,object_type')
    ]);
    Object.assign(state,{owners,sites,items,events,products});
    state.selected=new Set([...state.selected].filter(id=>items.some(x=>x.id===id)));
    updateSelectors();render();
  }
  function optionsHtml(items,selected=''){
    return items.map(item=>'<option value="'+esc(item.id)+'" '+(item.id===selected?'selected':'')+'>'+esc(item.name)+'</option>').join('');
  }
  function putOptions(id,items,initialText){
    const el=byId(id);if(!el)return;
    const prev=el.value;el.innerHTML=(initialText===null?'':'<option value="">'+esc(initialText)+'</option>')+optionsHtml(items,prev);
    if(prev&&items.some(x=>x.id===prev))el.value=prev;
  }
  function updateSelectors(){
    ['invOwnerFilter','invMoveOwner','invEditOwner','invImportOwner'].forEach(id=>
      putOptions(id,state.owners,id==='invOwnerFilter'?'Alle':id==='invMoveOwner'?'Unverändert':null));
    ['invSiteFilter','invMoveSite','invEditSite'].forEach(id=>
      putOptions(id,state.sites,id==='invSiteFilter'?'Alle':id==='invMoveSite'?'Unverändert':null));
    const cats=[...new Set(state.items.map(x=>x.category||'Ohne Kategorie'))].sort(sortName).map(x=>({id:x,name:x}));
    putOptions('invCategoryFilter',cats,'Alle');
    putOptions('invEditRental',state.products,'Kein Mietobjekt');
  }
  function filteredItems(){
    const search=norm(byId('invSearch').value),owner=byId('invOwnerFilter').value,site=byId('invSiteFilter').value,category=byId('invCategoryFilter').value,special=byId('invSpecialFilter').value;
    return state.items.filter(x=>{
      if(owner&&x.owner_id!==owner)return false;
      if(site&&x.site_id!==site)return false;
      if(category&&(x.category||'Ohne Kategorie')!==category)return false;
      if(special==='rental'&&!x.rental_product_id)return false;
      if(special==='unlinked'&&x.rental_product_id)return false;
      if(special==='review'&&x.value_status!=='needs_review')return false;
      if(search&&!norm([x.name,x.description,x.module,x.assortment,x.shelf,x.storage_location,x.inventory_code,ownerName(x.owner_id),siteName(x.site_id)].join(' ')).includes(search))return false;
      return true;
    }).sort((a,b)=>sortName(a.name,b.name));
  }
  function metricCard(label,value,subtitle){
    return '<div class="inv-kpi"><div class="inv-kpi-label">'+esc(label)+'</div><strong>'+esc(value)+'</strong><small>'+esc(subtitle)+'</small></div>';
  }
  function renderKpis(){
    const items=state.items;
    const total=items.reduce((a,x)=>a+lineValue(x),0);
    byId('invKpis').innerHTML=metricCard('Inventarwert',chf(total),'Berechnet aus allen Positionen')
     +metricCard('Positionen',qtyFmt(items.length),'Gesamtes Inventar')
     +metricCard('Eigentümer',qtyFmt(new Set(items.map(x=>x.owner_id)).size),'Mit Materialbestand')
     +metricCard('Werte prüfen',qtyFmt(items.filter(x=>x.value_status==='needs_review').length),'Unklare Bewertungen');
  }
  function renderItems(){
    const list=filteredItems(),pages=Math.max(1,Math.ceil(list.length/state.perPage));
    state.page=Math.min(state.page,pages-1);
    const begin=state.page*state.perPage,part=list.slice(begin,begin+state.perPage);
    const body=byId('invItemsBody');
    body.innerHTML=part.length?part.map(x=>{
      const detail=[x.description,x.module].filter(Boolean).map(esc).join(' · ');
      const val=x.value_status==='needs_review'?'<span class="inv-warning">Wert prüfen</span>':x.value_status==='calculated'?'<span class="inv-sub">Berechnet</span>':'';
      return '<tr><td class="inv-admin"><input type="checkbox" data-select="'+esc(x.id)+'" '+(state.selected.has(x.id)?'checked':'')+'></td>'
      +'<td><strong>'+esc(x.name)+'</strong><div class="inv-sub">'+detail+'</div>'+val+'</td>'
      +'<td>'+esc(siteName(x.site_id))+'<div class="inv-sub">'+esc([x.storage_location,x.shelf].filter(Boolean).join(' / '))+'</div></td>'
      +'<td>'+esc(ownerName(x.owner_id))+'</td><td class="inv-number">'+qtyFmt(x.quantity)+' '+esc(x.unit||'')+'</td>'
      +'<td class="inv-number">'+chf(x.unit_value)+'</td><td class="inv-number"><strong>'+chf(lineValue(x))+'</strong></td>'
      +'<td>'+(x.rental_product_id?'<span class="inv-link">'+esc(productName(x.rental_product_id)||'Mietobjekt')+'</span>':'<span class="inv-sub">Nur Inventar</span>')+'</td>'
      +'<td class="inv-admin"><button type="button" class="btn small" data-edit="'+esc(x.id)+'">Bearbeiten</button></td></tr>';
    }).join(''):'<tr><td colspan="9">Keine Positionen für diese Filter gefunden.</td></tr>';
    byId('invSelectedCount').textContent=state.selected.size;
    byId('invSelectAll').checked=part.length>0&&part.every(x=>state.selected.has(x.id));
    byId('invListTotals').innerHTML='<strong>'+qtyFmt(list.length)+'</strong> Positionen · Wert der gefilterten Liste: <strong>'+chf(list.reduce((a,x)=>a+lineValue(x),0))+'</strong>';
    byId('invPageInfo').textContent='Seite '+(state.page+1)+' / '+pages;
    byId('invPrev').disabled=state.page===0;
    byId('invNext').disabled=state.page>=pages-1;
    if(!isAdmin())body.querySelectorAll('.inv-admin').forEach(el=>el.remove());
  }
  function grouped(kind){
    const groups=new Map();
    state.items.forEach(x=>{
      const id=kind==='owner'?x.owner_id:kind==='site'?x.site_id:(x.category||'Ohne Kategorie');
      const name=kind==='owner'?ownerName(id):kind==='site'?siteName(id):String(id);
      if(!groups.has(id))groups.set(id,{id,name,lines:[],total:0,qty:0});
      const g=groups.get(id);g.lines.push(x);g.total+=lineValue(x);g.qty+=Number(x.quantity||0);
    });
    return [...groups.values()].sort((a,b)=>sortName(a.name,b.name));
  }
  function renderGroups(kind){
    const list=grouped(kind),isOwner=kind==='owner',dest=byId(isOwner?'invOwnersList':'invSitesList');
    dest.innerHTML='<div class="inv-table-scroll"><table class="inv-table"><thead><tr><th>'+(isOwner?'Eigentümer':'Standort')+'</th><th class="inv-number">Positionen</th><th class="inv-number">Bestand / Einheiten</th><th class="inv-number">Inventarwert</th><th>Auswertung</th></tr></thead><tbody>'
       +list.map(g=>'<tr><td><strong>'+esc(g.name)+'</strong></td><td class="inv-number">'+qtyFmt(g.lines.length)+'</td><td class="inv-number">'+qtyFmt(g.qty)+'</td><td class="inv-number"><strong>'+chf(g.total)+'</strong></td><td><button type="button" class="btn small" data-group="'+esc(kind)+'" data-id="'+esc(g.id)+'">PDF Materialliste</button> <button type="button" class="btn small" data-filtergroup="'+esc(kind)+'" data-id="'+esc(g.id)+'">Liste anzeigen</button></td></tr>').join('')
       +'</tbody></table></div>';
  }
  function eventType(type){return ({ownership:'Eigentumsübertragung',relocation:'Standortwechsel',ownership_and_relocation:'Eigentum + Standort',adjustment:'Bestandskorrektur'})[type]||type;}
  function renderEvents(){
    byId('invEventsBody').innerHTML=state.events.slice(0,2000).map(e=>{
      const from=ownerName(e.from_owner_id)+' / '+siteName(e.from_site_id);
      const to=ownerName(e.to_owner_id)+' / '+siteName(e.to_site_id);
      return '<tr><td>'+esc(new Date(e.created_at).toLocaleString('de-CH'))+'<div class="inv-sub">'+esc(e.batch_id.slice(0,8))+'</div></td><td>'+esc(eventType(e.action))+'</td><td>'+esc(e.item_name)+'</td><td class="inv-number">'+qtyFmt(e.quantity)+'</td><td class="inv-number">'+chf(Number(e.quantity)*Number(e.unit_value))+'</td><td><span class="inv-sub">'+esc(from)+'</span><div>→ '+esc(to)+'</div></td><td>'+esc(e.note||'')+'</td></tr>';
    }).join('')||'<tr><td colspan="7">Noch keine Bewegungen vorhanden.</td></tr>';
  }
  function render(){renderKpis();renderItems();renderGroups('owner');renderGroups('site');renderEvents();setAdminView();}
  function setAdminView(){
    document.querySelectorAll('.inv-admin').forEach(el=>el.classList.toggle('hidden',!isAdmin()));
  }
  function setTab(name){
    document.querySelectorAll('.inv-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));
    ['items','owners','sites','events'].forEach(tab=>byId('inv'+tab[0].toUpperCase()+tab.slice(1)+'Tab').classList.toggle('hidden',name!==tab));
  }
  function applyGroupFilter(type,id){
    byId('invOwnerFilter').value=type==='owner'?id:'';
    byId('invSiteFilter').value=type==='site'?id:'';
    byId('invCategoryFilter').value='';byId('invSearch').value='';byId('invSpecialFilter').value='';
    state.page=0;setTab('items');renderItems();
    document.querySelector('.inv-panel')?.scrollIntoView({behavior:'smooth'});
  }
  function editItem(id){
    if(!isAdmin())return;
    const item=state.items.find(x=>x.id===id);
    byId('invItemForm').reset();
    byId('invItemId').value=item?.id||'';
    byId('invItemTitle').textContent=item?'Material bearbeiten':'Material erfassen';
    const f={invEditName:'name',invEditDescription:'description',invEditCategory:'category',invEditModule:'module',
       invEditQty:'quantity',invEditUnit:'unit',invEditValue:'unit_value',invEditValueStatus:'value_status',
       invEditOwner:'owner_id',invEditSite:'site_id',invEditStorage:'storage_location',invEditShelf:'shelf',
       invEditAssortment:'assortment',invEditSupplier:'supplier',invEditRental:'rental_product_id',invEditNote:'note'};
    for(const [field,key] of Object.entries(f))byId(field).value=item?.[key]??(key==='unit'?'Stk.':key==='value_status'?'confirmed':'');
    if(!item){
      byId('invEditOwner').value=state.owners.find(x=>x.name==='ZSO BSW')?.id||state.owners[0]?.id||'';
      byId('invEditSite').value=state.sites[0]?.id||'';
    }
    ['invEditQty','invEditOwner','invEditSite','invEditStorage','invEditShelf'].forEach(x=>byId(x).disabled=!!item);
    byId('invItemEditHint').classList.toggle('hidden',!item);
    byId('invAdjustBtn').classList.toggle('hidden',!item);
    openDialog('invItemDialog');
  }
  async function saveItem(e){
    e.preventDefault();if(!isAdmin())return;
    const id=byId('invItemId').value;
    const record={
      name:safeName(byId('invEditName').value),
      description:byId('invEditDescription').value.trim()||null,
      category:byId('invEditCategory').value.trim()||null,
      module:byId('invEditModule').value.trim()||null,
      unit:byId('invEditUnit').value.trim()||'Stk.',
      unit_value:Math.round((num(byId('invEditValue').value)||0)*100)/100,
      value_status:byId('invEditValueStatus').value,
      assortment:byId('invEditAssortment').value.trim()||null,
      supplier:byId('invEditSupplier').value.trim()||null,
      rental_product_id:byId('invEditRental').value||null,
      note:byId('invEditNote').value.trim()||null,
      updated_at:new Date().toISOString()
    };
    if(!record.name) return message('Materialbezeichnung ist erforderlich.','error');
    if(!id){
      Object.assign(record,{
        quantity:num(byId('invEditQty').value),owner_id:byId('invEditOwner').value,
        site_id:byId('invEditSite').value,storage_location:byId('invEditStorage').value.trim()||null,
        shelf:byId('invEditShelf').value.trim()||null
      });
      if(record.quantity===null||record.quantity<0||!record.owner_id||!record.site_id)throw new Error('Bitte Menge, Eigentümer und Standort erfassen.');
    }
    const req=id?db.from('inventory_items').update(record).eq('id',id):db.from('inventory_items').insert(record);
    const {error}=await req;if(error)throw error;
    closeDialog('invItemDialog');await refresh();message('Inventarposition gespeichert.','success');
  }
  async function adjustQty(){
    const id=byId('invItemId').value;if(!id||!isAdmin())return;
    const item=state.items.find(x=>x.id===id);closeDialog('invItemDialog');
    const newQty=prompt('Neuer Bestand für «'+item.name+'» (aktuell '+qtyFmt(item.quantity)+'):');
    if(newQty===null)return;
    const value=num(newQty);if(value===null||value<0)return message('Ungültige Bestandsmenge.','error');
    const reason=prompt('Grund für die Bestandskorrektur (wird protokolliert):');
    if(reason===null)return;
    if(reason.trim().length<3)return message('Bitte einen Korrekturgrund mit mindestens 3 Zeichen erfassen.','error');
    const {error}=await db.rpc('inventory_adjust_quantity',{p_item:id,p_quantity:value,p_note:reason.trim()});
    if(error)throw error;
    await refresh();message('Bestand korrigiert und protokolliert.','success');
  }
  function moveSelection(){
    if(!isAdmin())return;
    const selected=state.items.filter(x=>state.selected.has(x.id));
    if(!selected.length)return message('Bitte mindestens eine Materialposition auswählen.','error');
    if(selected.length>2000)return message('Pro Vorgang sind maximal 2’000 Positionen möglich.','error');
    if(selected.some(x=>Number(x.quantity)<=0))return message('Positionen mit Bestand 0 können nicht übertragen werden.','error');
    byId('invMoveForm').reset();
    byId('invMoveSelected').textContent=selected.length===1?selected[0].name+' · Bestand '+qtyFmt(selected[0].quantity):selected.length+' ausgewählte Materialpositionen (jeweils gesamte Menge)';
    const single=selected.length===1;
    byId('invMoveQtyBox').classList.toggle('hidden',!single);
    byId('invMoveQty').value=single?selected[0].quantity:'';
    byId('invMoveQty').max=single?selected[0].quantity:'';
    byId('invMoveStorage').disabled=true;byId('invMoveShelf').disabled=true;
    openDialog('invMoveDialog');
  }
  async function saveMove(e){
    e.preventDefault();if(!isAdmin())return;
    const selected=state.items.filter(x=>state.selected.has(x.id));
    const lines=selected.map(x=>({id:x.id,quantity:selected.length===1?num(byId('invMoveQty').value):Number(x.quantity)}));
    if(lines.some(x=>x.quantity===null||x.quantity<=0))throw new Error('Bitte eine gültige Menge angeben.');
    const storageChange=byId('invMoveStorageCheck').checked;
    const payload={
      p_lines:lines,p_new_owner:byId('invMoveOwner').value||null,p_new_site:byId('invMoveSite').value||null,
      p_storage_location:storageChange?byId('invMoveStorage').value:null,
      p_shelf:storageChange?byId('invMoveShelf').value:null,
      p_note:byId('invMoveNote').value.trim()||null
    };
    byId('invMoveSave').disabled=true;
    try{
      const {data,error}=await db.rpc('inventory_transfer_batch',payload);
      if(error)throw error;
      closeDialog('invMoveDialog');state.selected.clear();await refresh();
      message(data.count+' Materialposition(en) übertragen/verschoben. Vorgang: '+String(data.batch_id).slice(0,8),'success');
    }finally{byId('invMoveSave').disabled=false;}
  }
  async function addGroup(type){
    if(!isAdmin())return;
    const label=type==='owner'?'Eigentümer':'Standort',table=type==='owner'?'inventory_owners':'inventory_sites';
    const input=prompt('Neuer '+label+':');if(input===null)return;
    const name=input.trim();if(name.length<2)return message(label+' muss mindestens 2 Zeichen enthalten.','error');
    if((type==='owner'?state.owners:state.sites).some(x=>norm(x.name)===norm(name)))return message(label+' existiert bereits.','error');
    const {error}=await db.from(table).insert({name});
    if(error)throw error;await refresh();message(label+' «'+name+'» erstellt.','success');
  }
  function tabular(rows,head,label){
    const js=window.jspdf;
    if(!js?.jsPDF)throw new Error('Die PDF-Bibliothek ist nicht verfügbar. Bitte Seite neu laden und Internetverbindung prüfen.');
    const pdf=new js.jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    if(typeof pdf.autoTable!=='function')throw new Error('Die PDF-Tabellenbibliothek ist nicht verfügbar.');
    const now=new Date().toLocaleString('de-CH');
    const footer=data=>{
      const page=data.pageNumber;
      pdf.setFont('helvetica','normal');pdf.setFontSize(8);pdf.setTextColor(105);
      pdf.text('GVöS BSW · '+now+' · Seite '+page,14,202);
    };
    function report(title,headers,body,extra={},newPage=false){
      if(newPage)pdf.addPage();
      pdf.setTextColor(27,58,75);pdf.setFont('helvetica','bold');pdf.setFontSize(15);
      pdf.text(String(title).slice(0,120),14,15);
      pdf.setFont('helvetica','normal');pdf.setFontSize(9);pdf.setTextColor(80);
      pdf.text('Inventarverwaltung · Stand '+now,14,21);
      pdf.autoTable({head:[headers],body,theme:'striped',startY:26,margin:{left:14,right:14,top:26,bottom:16},
        styles:{font:'helvetica',fontSize:8,cellPadding:1.9,overflow:'linebreak'},
        headStyles:{fillColor:[31,134,168],textColor:255,fontStyle:'bold'},
        alternateRowStyles:{fillColor:[243,248,250]},
        columnStyles:extra, didDrawPage:footer
      });
    }
    return {pdf,report};
  }
  function detailsRows(items){
    return items.map(x=>[x.name+(x.description?' – '+x.description:''),siteName(x.site_id)+(x.storage_location?' / '+x.storage_location:''),ownerName(x.owner_id),
      qtyFmt(x.quantity)+' '+(x.unit||''),chf(x.unit_value),chf(lineValue(x)),
      x.value_status==='needs_review'?'Prüfen':x.rental_product_id?'Miete: '+productName(x.rental_product_id):'']);
  }
  function reportDetail(mode,items,title){
    const val=items.reduce((a,x)=>a+lineValue(x),0);
    const {pdf,report}=tabular(null,null);
    report(title+' · '+qtyFmt(items.length)+' Positionen · '+chf(val),
      ['Material / Beschreibung','Standort / Lagerort','Eigentümer','Menge','Stückwert','Wert','Status / Miete'],detailsRows(items),{0:{cellWidth:70},1:{cellWidth:48},2:{cellWidth:38},3:{cellWidth:23},4:{cellWidth:24},5:{cellWidth:24},6:{cellWidth:42}});
    pdf.save('BSW_Inventar_'+mode+'_'+new Date().toISOString().slice(0,10)+'.pdf');
  }
  function reportSummary(mode,groups,title){
    const {pdf,report}=tabular(null,null);
    const total=groups.reduce((sum,g)=>sum+g.total,0);
    report(title+' · '+chf(total),['Bezeichnung','Materialpositionen','Stück / Einheiten (gemischt)','Inventarwert'],
      groups.map(g=>[g.name,qtyFmt(g.lines.length),qtyFmt(g.qty),chf(g.total)]));
    pdf.save('BSW_Inventar_'+mode+'_'+new Date().toISOString().slice(0,10)+'.pdf');
  }
  function reportGroups(mode,groups,title){
    const {pdf,report}=tabular(null,null);
    groups.forEach((g,i)=>{
      report(title+': '+g.name+' · '+chf(g.total),
        ['Material / Beschreibung','Standort / Lagerort','Eigentümer','Menge','Stückwert','Wert','Status / Miete'],
        detailsRows(g.lines),{0:{cellWidth:70},1:{cellWidth:48},2:{cellWidth:38},3:{cellWidth:23},4:{cellWidth:24},5:{cellWidth:24},6:{cellWidth:42}},i>0);
    });
    pdf.save('BSW_Inventar_'+mode+'_'+new Date().toISOString().slice(0,10)+'.pdf');
  }
  function reportEvents(){
    const {pdf,report}=tabular(null,null);
    report('Bewegungsjournal · '+state.events.length+' Vorgänge',
      ['Datum','Art','Material','Menge','Wert','Vorher','Nachher','Bemerkung / Vorgang'],
      state.events.map(e=>[
        new Date(e.created_at).toLocaleString('de-CH'),eventType(e.action),e.item_name,qtyFmt(e.quantity),
        chf(Number(e.quantity)*Number(e.unit_value)),
        ownerName(e.from_owner_id)+' / '+siteName(e.from_site_id),
        ownerName(e.to_owner_id)+' / '+siteName(e.to_site_id),
        (e.note||'')+' ['+String(e.batch_id).slice(0,8)+']'
      ]),{2:{cellWidth:48},5:{cellWidth:42},6:{cellWidth:42},7:{cellWidth:45}});
    pdf.save('BSW_Inventar_Bewegungsjournal_'+new Date().toISOString().slice(0,10)+'.pdf');
  }
  function exportPdf(mode=byId('invPdfMode').value,params={}){
    try{
      if(mode==='events')return reportEvents();
      if(mode==='owners')return reportSummary(mode,grouped('owner'),'Inventarwerte pro Eigentümer');
      if(mode==='sites')return reportSummary(mode,grouped('site'),'Inventarwerte pro Standort');
      if(mode==='categories')return reportSummary(mode,grouped('category'),'Inventarwerte pro Kategorie');
      if(mode==='owner-details')return reportGroups(mode,grouped('owner'),'Eigentümer');
      if(mode==='site-details')return reportGroups(mode,grouped('site'),'Standort');
      let items=mode==='all'?state.items:mode==='rental'?state.items.filter(x=>x.rental_product_id):mode==='review'?state.items.filter(x=>x.value_status==='needs_review'):filteredItems();
      if(params.owner)items=state.items.filter(x=>x.owner_id===params.owner);
      if(params.site)items=state.items.filter(x=>x.site_id===params.site);
      items=[...items].sort((a,b)=>sortName(a.name,b.name));
      const title=params.owner?'Eigentümer: '+ownerName(params.owner):params.site?'Standort: '+siteName(params.site):
        ({all:'Gesamtinventar',current:'Gefilterte Inventarliste',rental:'Inventar mit Mietobjekt-Verknüpfung',review:'Wertprüfung'})[mode]||'Inventar';
      return reportDetail(mode,items,title);
    }catch(err){notifyError(err);}
  }
  function csvCell(value){const text=String(value??'');const safe=/^[=+\-@]/.test(text)?"'"+text:text;return '"'+safe.replace(/"/g,'""')+'"';}
  function exportCsv(){
    const rows=[['Material','Beschreibung','Kategorie','Modul','Eigentümer','Standort','Lagerort','Regal','Anzahl','Einheit','Wert pro Stück CHF','Gesamtwert CHF','Mietobjekt','Wertstatus','Quelle']];
    filteredItems().forEach(x=>rows.push([x.name,x.description,x.category,x.module,ownerName(x.owner_id),siteName(x.site_id),x.storage_location,x.shelf,
      x.quantity,x.unit,x.unit_value,lineValue(x),productName(x.rental_product_id),x.value_status,(x.source_sheet||'')+' '+(x.source_row||'')]));
    const csv='\ufeff'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='BSW_Inventar_'+new Date().toISOString().slice(0,10)+'.csv';
    a.click();URL.revokeObjectURL(url);
  }
  function workbookDate(value){
    if(value instanceof Date&&!Number.isNaN(value.getTime()))return value.toISOString().slice(0,10);
    if(typeof value==='number'&&value>25000&&value<80000){
      const date=new Date(Date.UTC(1899,11,30)+value*86400000);return date.toISOString().slice(0,10);
    }
    return null;
  }
  function parseWorkbook(file,book){
    const candidates=[],issues=[],sheetTotals=[],revision=(file.name.match(/\d{2}[._-]\d{2}[._-]\d{4}/)||[])[0]||file.name.replace(/\s*\(\d+\)(?=\.)/,'').toLowerCase();
    for(const sheetName of book.SheetNames){
      if(norm(sheetName).includes('gesamtwert inventar'))continue;
      const sheet=book.Sheets[sheetName];
      const lastRow=Math.min((XLSX.utils.decode_range(sheet['!ref']||'A1:O1').e.r+1),5000);
      const rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null,blankrows:true,range:'A1:O'+lastRow});
      const header=rows.findIndex((r,i)=>i<15&&norm(r?.[0])==='name'&&norm(r?.[1]).includes('beschreibung'));
      if(header<0){issues.push(sheetName+': keine Materialspalten erkannt – Blatt übersprungen');continue;}
      let count=0;
      for(let i=header+1;i<rows.length;i++){
        const r=rows[i]||[],name=safeName(r[0]);
        if(!name||/^(summe|total|material|name|zwischen(?:total|summe)|inventarwert)$/i.test(name))continue;
        const baseQty=num(r[7]),setQty=num(r[8]),totalQty=num(r[9]);
        const quantity=totalQty!==null&&totalQty>=0?totalQty:baseQty!==null&&baseQty>=0?baseQty*(setQty&&setQty>0?setQty:1):null;
        const storedTotal=num(r[4]),unitFromExcel=num(r[3]);
        if(quantity===null&&storedTotal===null&&unitFromExcel===null)continue;
        if(quantity===null||quantity<0){issues.push(sheetName+' / Zeile '+(i+1)+': Menge nicht bestimmbar');continue;}
        const unitValue=quantity>0&&storedTotal!==null?storedTotal/quantity:(unitFromExcel??0);
        let status='confirmed';
        if(unitFromExcel===null&&storedTotal!==null)status='calculated';
        if((unitFromExcel===null&&storedTotal===null)||(unitFromExcel!==null&&storedTotal!==null&&Math.abs(unitFromExcel*quantity-storedTotal)>0.1)||(quantity===0&&storedTotal!==null&&storedTotal!==0)||(unitValue<0))status='needs_review';
        if(unitValue<0){issues.push(sheetName+' / Zeile '+(i+1)+': negativer Wert – übersprungen');continue;}
        if(status==='needs_review')issues.push(sheetName+' / Zeile '+(i+1)+' · '+name+': Wert prüfen');
        const item={
          name,description:safeName(r[1])||null,category:safeName(r[5])||null,module:safeName(r[6])||null,
          quantity:Math.round(quantity*1000)/1000,unit:'Stk.',unit_value:Math.round(unitValue*100)/100,
          value_status:status,source_total_value:storedTotal===null?null:Math.round(storedTotal*100)/100,
          storage_location:safeName(r[10])||null,assortment:safeName(r[11])||null,shelf:safeName(r[12])||null,
          supplier:safeName(r[13])||null,supplier_contact:safeName(r[14])||null,
          counted_on:workbookDate(r[2]),source_sheet:sheetName.trim(),source_row:i+1,
          import_key:'BSW|'+revision+'|'+sheetName.trim()+'|'+(i+1)
        };
        candidates.push(item);count++;
      }
      sheetTotals.push(sheetName+': '+count+' Positionen');
    }
    return {candidates,issues,sheetTotals};
  }
  async function previewImport(){
    if(!isAdmin())return;
    const file=byId('invImportFile').files?.[0];
    if(!file)return message('Bitte zuerst eine Exceldatei auswählen.','error');
    if(file.size>15*1024*1024)return message('Datei ist grösser als 15 MB.','error');
    if(typeof XLSX==='undefined')return message('Excel-Lesebibliothek konnte nicht geladen werden.','error');
    byId('invPreviewImport').disabled=true;
    try{
      const buffer=await file.arrayBuffer();
      const book=XLSX.read(buffer,{type:'array',cellDates:false});
      const plan=parseWorkbook(file,book),existingKeys=new Set(state.items.map(x=>x.import_key).filter(Boolean));
      const seen=new Set(),pending=[];
      let duplicates=0;
      for(const row of plan.candidates){
        if(seen.has(row.import_key)||existingKeys.has(row.import_key)){duplicates++;continue;}
        seen.add(row.import_key);pending.push(row);
      }
      state.plan={...plan,pending,duplicates,fileName:file.name};
      byId('invCommitImport').disabled=pending.length===0;
      byId('invImportInfo').classList.remove('hidden');
      const previewValue=plan.candidates.reduce((sum,x)=>sum+lineValue(x),0);
      byId('invImportInfo').innerHTML='<strong>'+qtyFmt(plan.candidates.length)+' Materialpositionen erkannt</strong>, '+qtyFmt(pending.length)+' neu, '+qtyFmt(duplicates)+' bereits vorhanden. '+qtyFmt(plan.issues.length)+' Hinweise zur Datenqualität. <strong>Berechneter Inventarwert: '+chf(previewValue)+'</strong>. Dieser kann wegen abweichender Preisangaben von der Excel-Zusammenfassung abweichen.';
      byId('invImportIssues').textContent=plan.sheetTotals.join('\n')+'\n\n'+plan.issues.slice(0,80).join('\n')+(plan.issues.length>80?'\n… weitere Hinweise nach Import über Filter «Wert prüfen»':'');
    }catch(err){notifyError(err);}
    finally{byId('invPreviewImport').disabled=false;}
  }
  async function commitImport(){
    if(!isAdmin()||!state.plan?.pending?.length)return;
    const owner=byId('invImportOwner').value;
    if(!owner)return message('Bitte einen Eigentümer für den Import auswählen.','error');
    const plan=state.plan;
    const sites=[...new Set(plan.pending.map(x=>x.source_sheet))];
    byId('invCommitImport').disabled=true;
    try{
      if(sites.length){
        const {error}=await db.from('inventory_sites').upsert(sites.map(name=>({name})),{onConflict:'name',ignoreDuplicates:true});
        if(error)throw error;
      }
      const nextSites=await fetchAll('inventory_sites','name');
      const ids=new Map(nextSites.map(s=>[s.name,s.id]));
      const rows=plan.pending.map(({source_sheet,...x})=>({...x,source_sheet,site_id:ids.get(source_sheet),owner_id:owner}));
      if(rows.some(x=>!x.site_id))throw new Error('Standortzuordnung unvollständig.');
      let done=0;
      for(let p=0;p<rows.length;p+=100){
        const {error}=await db.from('inventory_items').upsert(rows.slice(p,p+100),{onConflict:'import_key',ignoreDuplicates:true});
        if(error)throw error;
        done+=Math.min(100,rows.length-p);
        byId('invImportInfo').textContent='Importiere Materialpositionen … '+done+' / '+rows.length;
      }
      state.plan=null;
      closeDialog('invImportDialog');await refresh();
      message(done+' Inventarpositionen importiert. '+plan.duplicates+' vorhandene übersprungen; '+plan.issues.length+' Prüfhinweise.','success');
    }catch(err){notifyError(err);byId('invCommitImport').disabled=false;}
  }
  function handlers(){
    document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeDialog(b.dataset.close)));
    document.querySelectorAll('.inv-tab').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
    ['invSearch','invOwnerFilter','invSiteFilter','invCategoryFilter','invSpecialFilter'].forEach(id=>
      byId(id).addEventListener(id==='invSearch'?'input':'change',()=>{state.page=0;renderItems();setAdminView();}));
    byId('invPrev').addEventListener('click',()=>{state.page--;renderItems();setAdminView();});
    byId('invNext').addEventListener('click',()=>{state.page++;renderItems();setAdminView();});
    byId('invSelectFiltered').addEventListener('click',()=>{filteredItems().forEach(x=>state.selected.add(x.id));renderItems();setAdminView();});
    byId('invClearSelected').addEventListener('click',()=>{state.selected.clear();renderItems();setAdminView();});
    byId('invSelectAll').addEventListener('change',e=>{
      filteredItems().slice(state.page*state.perPage,(state.page+1)*state.perPage).forEach(x=>e.target.checked?state.selected.add(x.id):state.selected.delete(x.id));
      renderItems();setAdminView();
    });
    byId('invItemsBody').addEventListener('change',e=>{
      if(!e.target.dataset.select)return;
      e.target.checked?state.selected.add(e.target.dataset.select):state.selected.delete(e.target.dataset.select);
      byId('invSelectedCount').textContent=state.selected.size;
    });
    byId('invItemsBody').addEventListener('click',e=>{const id=e.target.closest('[data-edit]')?.dataset.edit;if(id)editItem(id);});
    for(const target of ['invOwnersList','invSitesList'])byId(target).addEventListener('click',e=>{
      const pdf=e.target.closest('[data-group]');
      if(pdf)exportPdf('current',{[pdf.dataset.group==='owner'?'owner':'site']:pdf.dataset.id});
      const filter=e.target.closest('[data-filtergroup]');
      if(filter)applyGroupFilter(filter.dataset.filtergroup,filter.dataset.id);
    });
    byId('invNewItem').addEventListener('click',()=>editItem(''));
    byId('invItemForm').addEventListener('submit',e=>saveItem(e).catch(notifyError));
    byId('invAdjustBtn').addEventListener('click',()=>adjustQty().catch(notifyError));
    byId('invTransferBtn').addEventListener('click',moveSelection);
    byId('invMoveForm').addEventListener('submit',e=>saveMove(e).catch(notifyError));
    byId('invMoveStorageCheck').addEventListener('change',e=>{
      byId('invMoveStorage').disabled=!e.target.checked;byId('invMoveShelf').disabled=!e.target.checked;
    });
    byId('invAddOwner').addEventListener('click',()=>addGroup('owner').catch(notifyError));
    byId('invAddSite').addEventListener('click',()=>addGroup('site').catch(notifyError));
    byId('invImportBtn').addEventListener('click',()=>{
      state.plan=null;byId('invImportFile').value='';byId('invImportInfo').classList.add('hidden');
      byId('invImportIssues').textContent='';byId('invCommitImport').disabled=true;
      byId('invImportOwner').value=state.owners.find(x=>x.name==='ZSO BSW')?.id||state.owners[0]?.id||'';
      openDialog('invImportDialog');
    });
    byId('invImportFile').addEventListener('change',()=>{state.plan=null;byId('invCommitImport').disabled=true;});
    byId('invPreviewImport').addEventListener('click',()=>previewImport().catch(notifyError));
    byId('invCommitImport').addEventListener('click',()=>commitImport().catch(notifyError));
    byId('invExportPdf').addEventListener('click',()=>exportPdf());
    byId('invEventsPdf').addEventListener('click',()=>exportPdf('events'));
    byId('invExportCsv').addEventListener('click',exportCsv);
  }
  async function init(){
    const user=await window.GVOSReady;
    if(!user||!['admin','responder'].includes(user.role))return;
    state.user=user;
    byId('invUser').textContent=user.label;
    handlers();
    try{await refresh();if(isAdmin()&&state.items.length===0)message('Die Inventardatenbank ist bereit, aber noch leer. Über «Excel importieren» kannst du die vorhandene Inventarliste einlesen und zuerst kontrollieren.');}catch(err){notifyError(err);}
  }
  init().catch(notifyError);
})();
