const PRODUCT_DOCUMENT_BUCKET = 'product-documents';
let detailsProduct = null;
let detailsRequest = 0;

function productDocumentUrl(path) {
  return db.storage.from(PRODUCT_DOCUMENT_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function openProductDetails(id) {
  const product = products.find(item => String(item.id) === String(id));
  if (!product) return;
  detailsProduct = product;
  const request = ++detailsRequest;
  const dialog = el('productDetailsDialog');
  const content = el('productDetailsContent');
  el('productDetailsTitle').textContent = product.name;
  el('detailsBooking').disabled = availability.get(product.id) === 0;
  const image = product.image_url
    ? `<img class="details-image" src="${esc(product.image_url)}" alt="${esc(product.name)}">`
    : '';
  const basic = `${image}${product.subtitle ? `<p class="details-text">${esc(product.subtitle)}</p>` : ''}`;
  content.innerHTML = `${basic}<p role="status">Zusätzliche Informationen werden geladen …</p>`;
  dialog.showModal();

  try {
    const {data, error} = await db.from('product_details')
      .select('description,specifications,documents')
      .eq('product_id', product.id)
      .maybeSingle();
    if (error) throw error;
    if (request !== detailsRequest || !dialog.open) return;

    let html = basic;
    if (data?.description) html += `<h3>Beschreibung</h3><p class="details-text">${esc(data.description)}</p>`;
    if (data?.specifications) html += `<h3>Technische Angaben &amp; Hinweise</h3><p class="details-text">${esc(data.specifications)}</p>`;
    const documents = Array.isArray(data?.documents) ? data.documents : [];
    if (documents.length) {
      html += '<h3>Anleitungen &amp; Dokumente</h3><ul class="details-documents">' +
        documents.map(doc => `<li><a class="btn" href="${esc(productDocumentUrl(doc.path))}" target="_blank" rel="noopener noreferrer">${esc(doc.title)} <span class="small muted">PDF · öffnet in neuem Tab</span></a></li>`).join('') +
        '</ul>';
    }
    if (!data?.description && !data?.specifications && !documents.length && !basic) {
      html = '<p class="muted">Weitere Informationen erhalten Sie gerne auf Anfrage.</p>';
    } else if (!data?.description && !data?.specifications && !documents.length) {
      html += '<p class="muted">Weitere Informationen erhalten Sie gerne auf Anfrage.</p>';
    }
    content.innerHTML = html;
  } catch {
    if (request === detailsRequest && dialog.open) {
      content.innerHTML = `${basic}<p role="alert">Zusätzliche Informationen sind momentan nicht verfügbar. Bitte versuchen Sie es später erneut.</p>`;
    }
  }
}

el('closeProductDetails').addEventListener('click', () => el('productDetailsDialog').close());
el('productDetailsDialog').addEventListener('close', () => { detailsRequest++; });
el('detailsBooking').addEventListener('click', () => {
  if (!detailsProduct || availability.get(detailsProduct.id) === 0) return;
  el('productDetailsDialog').close();
  openBooking(detailsProduct.id);
});
el('detailsCalendar').addEventListener('click', async () => {
  if (!detailsProduct) return;
  el('productDetailsDialog').close();
  await showAvailability(detailsProduct.id);
});
