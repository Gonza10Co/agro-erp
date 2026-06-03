/* ════════════════════════════════════════════════════════════════════
   AgroCombobox · autocomplete con búsqueda, teclado y listas grandes
   Uso:
     AgroCombobox(el, {
       items:[{value,label,sub,avatar}], placeholder, leadIcon, allowAddLabel,
       onSelect(item), onAdd(query)
     })
   Devuelve { setValue(value), getValue(), clear(), focus() }
   ════════════════════════════════════════════════════════════════════ */
window.AgroCombobox = function(el, opts){
  const items = opts.items || [];
  const lead = opts.leadIcon || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';
  el.classList.add('combobox');
  el.innerHTML =
    '<div class="combobox-control">'+
      '<span class="cb-lead">'+lead+'</span>'+
      '<input class="combobox-input" type="text" autocomplete="off" placeholder="'+(opts.placeholder||'Buscar…')+'" role="combobox" aria-expanded="false" aria-autocomplete="list">'+
      '<button type="button" class="combobox-clear" tabindex="-1" aria-label="Limpiar">✕</button>'+
      '<span class="combobox-caret"></span>'+
    '</div>'+
    '<div class="combobox-panel" role="listbox"></div>';
  const input = el.querySelector('.combobox-input');
  const panel = el.querySelector('.combobox-panel');
  const clear = el.querySelector('.combobox-clear');
  let active = -1, filtered = items.slice(), selected = null, q = '';

  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  function hl(text){
    if(!q) return text;
    return text.replace(new RegExp('('+esc(q)+')','ig'),'<mark>$1</mark>');
  }
  function filterItems(){
    const s = q.toLowerCase();
    filtered = !s ? items.slice() : items.filter(it =>
      it.label.toLowerCase().includes(s) || (it.sub && it.sub.toLowerCase().includes(s)));
  }
  function renderPanel(){
    let h = '<div class="combobox-count">'+filtered.length+' de '+items.length+'</div>';
    if(!filtered.length){
      h += '<div class="combobox-empty">Sin coincidencias para "'+(q||'')+'"</div>';
    } else {
      h += filtered.slice(0,80).map((it,i)=>{
        const av = it.avatar!==undefined ? '<span class="cb-av">'+it.avatar+'</span>' : '';
        const sub = it.sub ? '<div class="cb-sub">'+hl(it.sub)+'</div>' : '';
        const sel = selected && selected.value===it.value ? ' is-selected':'';
        return '<div class="combobox-opt'+(i===active?' is-active':'')+sel+'" role="option" data-i="'+i+'">'+av+
          '<div class="cb-meta"><div class="cb-label">'+hl(it.label)+'</div>'+sub+'</div>'+
          '<svg class="cb-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 6"/></svg></div>';
      }).join('');
    }
    if(opts.allowAddLabel){
      h += '<div class="combobox-add" data-add="1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'+opts.allowAddLabel+(q?' "'+q+'"':'')+'</div>';
    }
    panel.innerHTML = h;
  }
  function open(){ el.classList.add('is-open'); input.setAttribute('aria-expanded','true'); renderPanel(); }
  function close(){ el.classList.remove('is-open'); input.setAttribute('aria-expanded','false'); active=-1; }
  function choose(it){
    selected = it; q=''; input.value = it.label; el.classList.add('has-value');
    close(); if(opts.onSelect) opts.onSelect(it);
  }

  input.addEventListener('focus', ()=>{ q=''; filterItems(); open(); });
  input.addEventListener('input', ()=>{ q=input.value.trim(); el.classList.toggle('has-value', !!input.value); active=0; filterItems(); open(); });
  input.addEventListener('keydown', e=>{
    if(e.key==='ArrowDown'){ e.preventDefault(); if(!el.classList.contains('is-open')){filterItems();open();} active=Math.min(active+1,filtered.length-1); renderPanel(); scrollActive(); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); active=Math.max(active-1,0); renderPanel(); scrollActive(); }
    else if(e.key==='Enter'){ e.preventDefault(); if(active>=0&&filtered[active]) choose(filtered[active]); else if(opts.allowAddLabel&&opts.onAdd){opts.onAdd(q);close();} }
    else if(e.key==='Escape'){ close(); input.blur(); }
  });
  function scrollActive(){ const a=panel.querySelector('.combobox-opt.is-active'); if(a) a.scrollIntoView({block:'nearest'}); }
  panel.addEventListener('mousedown', e=>{
    const add=e.target.closest('[data-add]');
    if(add){ e.preventDefault(); if(opts.onAdd) opts.onAdd(q); close(); return; }
    const opt=e.target.closest('.combobox-opt');
    if(opt){ e.preventDefault(); choose(filtered[+opt.dataset.i]); }
  });
  panel.addEventListener('mousemove', e=>{ const opt=e.target.closest('.combobox-opt'); if(opt){ active=+opt.dataset.i; panel.querySelectorAll('.combobox-opt').forEach(o=>o.classList.toggle('is-active',o===opt)); } });
  clear.addEventListener('click', ()=>{ selected=null; input.value=''; q=''; el.classList.remove('has-value'); input.focus(); filterItems(); open(); if(opts.onSelect) opts.onSelect(null); });
  document.addEventListener('mousedown', e=>{ if(!el.contains(e.target)) close(); });

  return {
    setValue(v){ const it=items.find(x=>x.value===v); if(it) choose(it); },
    getValue(){ return selected; },
    clear(){ selected=null; input.value=''; el.classList.remove('has-value'); },
    focus(){ input.focus(); }
  };
};
