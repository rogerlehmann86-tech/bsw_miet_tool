(() => {
  const bucket = 'product-documents';
  let currentId = null;
  let entries = [];
  let original = [];
  let request = 0;
  let saving = false;

  function notice(message, error = false) {
    const box = el('productInfoNotice');
    box.textContent = message;
    box.classList.toggle('error', error);
    box.classList.toggle('success', !error && Boolean(message));
    box.classList.toggle('hidden', !message);
  }

  function renderDocuments() {
    const box = el('productDocumentEditor');
    box.replaceChildren();
    entries.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'document-editor-row';
      const label = document.createElement('label');
      label.textContent = entry.file ? `Neue PDF: ${entry.file.name}` : 'Dokumenttitel';
      const title = document.createElement('input');
      title.value = entry.title;
      title.required = true;
      title.maxLength = 160;
      title.setAttribute('aria-label', 'Titel des PDF-Dokuments');
      title.addEventListener('input', () => { entry.title = title.value; });
      label.append(title);
      row.append(label);

      if (entry.path) {
        const link = document.createElement('a');
        link.className = 'btn small';
        link.textContent = 'PDF öffnen';
        link.href = db.storage.from(bucket).getPublicUrl(entry.path).data.publicUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        row.append(link);
      }

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn small';
      remove.textContent = 'Entfernen';
      remove.addEventListener('click', () => { entries.splice(index, 1); renderDocuments(); });
      row.append(remove);
      box.append(row);
    });
  }

  async function openEditor(id) {
    if (saving) return;
    if (!db) return notice('Die Datenbankverbindung ist nicht verfügbar.', true);
    const product = products.find(item => String(item.id) === String(id));
    if (!product) return;
    const token = ++request;
    currentId = product.id;
    entries = [];
    original = [];
    el('productInfoForm').reset();
    el('productInfoId').value = product.id;
    el('productInfoTitle').textContent = `${product.name} – Infos & PDFs`;
    el('saveProductInfo').disabled = true;
    notice('Informationen werden geladen …');
    renderDocuments();
    el('productInfoDialog').showModal();

    try {
      const {data, error} = await db.from('product_details')
        .select('description,specifications,documents')
        .eq('product_id', product.id)
        .maybeSingle();
      if (error) throw error;
      if (token !== request) return;
      el('productDescription').value = data?.description || '';
      el('productSpecifications').value = data?.specifications || '';
      original = Array.isArray(data?.documents) ? data.documents.map(doc => ({...doc})) : [];
      entries = original.map(doc => ({...doc}));
      renderDocuments();
      el('saveProductInfo').disabled = false;
      notice('');
    } catch (error) {
      if (token === request) notice(`Laden fehlgeschlagen: ${error.message}. Bitte zuerst die Produktinfos-Migration anwenden.`, true);
    }
  }

  el('productList').addEventListener('click', event => {
    const trigger = event.target.closest('[data-edit-info]');
    if (trigger) openEditor(trigger.dataset.editInfo);
  });

  el('closeProductInfo').addEventListener('click', () => {
    if (!saving) el('productInfoDialog').close();
  });
  el('productInfoDialog').addEventListener('cancel', event => {
    if (saving) event.preventDefault();
  });
  el('productInfoDialog').addEventListener('close', () => { request++; });

  el('productPdfFiles').addEventListener('change', async () => {
    const files = Array.from(el('productPdfFiles').files || []);
    el('productPdfFiles').value = '';
    try {
      if (entries.length + files.length > 10) throw new Error('Maximal 10 PDF-Dokumente pro Mietobjekt.');
      for (const file of files) {
        if (!/\.pdf$/i.test(file.name) || file.size === 0 || file.size > 20 * 1024 * 1024) {
          throw new Error('Bitte PDF-Dateien mit maximal 20 MB wählen.');
        }
        const header = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
        if (header !== '%PDF-') throw new Error(`${file.name} ist keine gültige PDF-Datei.`);
      }
      entries.push(...files.map(file => ({file, title: file.name.replace(/\.pdf$/i, '').slice(0, 160)})));
      renderDocuments();
      notice('Die Änderungen werden beim Speichern übernommen.');
    } catch (error) {
      notice(error.message, true);
    }
  });

  el('productInfoForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || el('saveProductInfo').disabled) return;
    if (entries.some(doc => !doc.title.trim())) return notice('Bitte jedem PDF einen Titel geben.', true);
    saving = true;
    const productId = currentId;
    const snapshot = entries.map(entry => ({...entry}));
    const description = el('productDescription').value;
    const specifications = el('productSpecifications').value;
    const uploaded = [];
    let committed = false;
    el('productInfoForm').querySelectorAll('input,textarea,button').forEach(node => { node.disabled = true; });

    try {
      notice('Informationen und PDFs werden gespeichert …');
      const documents = [];
      for (const entry of snapshot) {
        let path = entry.path;
        if (entry.file) {
          path = `${productId}/${crypto.randomUUID()}.pdf`;
          const {error} = await db.storage.from(bucket).upload(path, entry.file, {
            contentType: 'application/pdf', cacheControl: '3600', upsert: false
          });
          if (error) throw error;
          uploaded.push(path);
        }
        documents.push({path, title: entry.title.trim()});
      }

      const {error} = await db.from('product_details').upsert({
        product_id: productId, description, specifications, documents
      }, {onConflict: 'product_id'});
      if (error) throw error;
      committed = true;

      const removed = original.filter(doc => !documents.some(next => next.path === doc.path)).map(doc => doc.path);
      const cleanupError = removed.length ? (await db.storage.from(bucket).remove(removed)).error : null;
      original = documents.map(doc => ({...doc}));
      entries = documents.map(doc => ({...doc}));
      renderDocuments();
      notice(cleanupError
        ? 'Gespeichert. Entfernte PDFs werden nicht mehr angezeigt; die Dateibereinigung ist fehlgeschlagen.'
        : 'Informationen und Dokumente wurden gespeichert.', Boolean(cleanupError));
    } catch (error) {
      if (!committed && uploaded.length) await db.storage.from(bucket).remove(uploaded);
      notice(`Speichern fehlgeschlagen: ${error.message}. Ihre Eingaben bleiben erhalten.`, true);
    } finally {
      saving = false;
      el('productInfoForm').querySelectorAll('input,textarea,button').forEach(node => { node.disabled = false; });
    }
  });
})();
