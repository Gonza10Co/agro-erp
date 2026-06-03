/* ════════════════════════════════════════════════════════════════════
   APP SHELL · Botas Agroindustrial ERP/MES
   Inyecta sidebar + topbar consistentes. Cada pantalla define:
     <body data-screen="dashboard" data-title="Dashboard">
   y opcionalmente window.AGRO = { breadcrumb:[...], actions:'<html>' }
   ════════════════════════════════════════════════════════════════════ */
(function(){
  const ICON = {
    dashboard:'<path d="M3 3h7v7H3zM14 3h7v4h-7zM14 11h7v10h-7zM3 14h7v7H3z"/>',
    oc:'<path d="M4 4h13l3 3v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
    op:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    clientes:'<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.6M21 20a5.5 5.5 0 0 0-4-5.3"/>',
    inventario:'<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/>',
    corte:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.5 15.5M20 20L8.5 8.5"/>',
    despacho:'<path d="M1 7h13v9H1zM14 10h4l3 3v3h-7"/><circle cx="5.5" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
    sun:'<circle cx="12" cy="12" r="4.5"/><path d="M12 1v3M12 20v3M4 12H1M23 12h-3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    chevron:'<path d="M9 6l6 6-6 6"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7a1.6 1.6 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1 1.6 1.6 0 0 0 .3-1.8z"/>',
    logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'
  };
  function svg(p,w){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="'+(w||1.7)+'" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>';}

  const NAV = [
    {group:'Operación', items:[
      {k:'dashboard', label:'Dashboard', href:'Dashboard.html', ic:'dashboard'},
      {k:'oc', label:'Órdenes de Compra', href:'Órdenes de Compra.html', ic:'oc'},
      {k:'op', label:'Órdenes de Producción', href:'Detalle OP — Amarre.html', ic:'op'},
      {k:'clientes', label:'Clientes', href:'#', ic:'clientes'},
      {k:'inventario', label:'Inventario', href:'#', ic:'inventario'}
    ]},
    {group:'Planta · MES', tag:'Próximamente', items:[
      {k:'corte', label:'Corte & Guarnición', href:'#', ic:'corte', soon:true},
      {k:'despacho', label:'Despacho', href:'#', ic:'despacho', soon:true}
    ]}
  ];

  const screen = document.body.dataset.screen || '';
  const title = document.body.dataset.title || '';
  const cfg = window.AGRO || {};
  const isDark = (function(){try{return localStorage.getItem('agro-theme')==='dark';}catch(e){return false;}})();
  if(isDark) document.documentElement.setAttribute('data-theme','dark');

  // ─── SIDEBAR ───
  let navHtml='';
  NAV.forEach(sec=>{
    navHtml+='<div class="nav-group"><div class="nav-group-h">'+sec.group+(sec.tag?'<span class="nav-tag">'+sec.tag+'</span>':'')+'</div>';
    sec.items.forEach(it=>{
      const active = it.k===screen ? ' is-active':'';
      const soon = it.soon ? ' is-soon':'';
      navHtml+='<a class="nav-item'+active+soon+'" href="'+(it.soon?'#':it.href)+'"'+(it.soon?' tabindex="-1" aria-disabled="true"':'')+'>'+
        '<span class="nav-ic">'+svg(ICON[it.ic])+'</span><span class="nav-label">'+it.label+'</span></a>';
    });
    navHtml+='</div>';
  });

  const sidebar = document.createElement('aside');
  sidebar.className='app-sidebar';
  sidebar.innerHTML=
    '<a class="brand" href="Dashboard.html">'+
      '<span class="brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5v9a4 4 0 0 0 4 4h10a2 2 0 0 0 2-2 4 4 0 0 0-3-3.9L11 10V5z"/></svg></span>'+
      '<span class="brand-text"><b>BOTAS</b><small>AGROINDUSTRIAL</small></span>'+
    '</a>'+
    '<nav class="nav">'+navHtml+'</nav>'+
    '<div class="sidebar-foot">'+
      '<a class="nav-item" href="#"><span class="nav-ic">'+svg(ICON.settings,1.6)+'</span><span class="nav-label">Configuración</span></a>'+
      '<div class="user-card">'+
        '<span class="avatar">CM</span>'+
        '<span class="user-meta"><b>Carolina M.</b><small>Oficial de ventas</small></span>'+
        '<a href="Login.html" class="icon-btn" title="Salir">'+svg(ICON.logout,1.6)+'</a>'+
      '</div>'+
    '</div>';

  // ─── TOPBAR ───
  let crumb='';
  if(cfg.breadcrumb){
    crumb='<nav class="breadcrumb">';
    cfg.breadcrumb.forEach((c,i)=>{
      const last=i===cfg.breadcrumb.length-1;
      crumb+= last ? '<span class="current">'+c.label+'</span>' : '<a href="'+(c.href||'#')+'">'+c.label+'</a><span class="sep">/</span>';
    });
    crumb+='</nav>';
  }
  const topbar=document.createElement('header');
  topbar.className='app-topbar';
  topbar.innerHTML=
    '<div class="topbar-left">'+(crumb||'<h1 class="t-h2">'+title+'</h1>')+'</div>'+
    '<div class="topbar-right">'+
      '<div class="search" style="width:230px"><span>'+svg(ICON.search,1.7)+'</span><input class="input" placeholder="Buscar OC, cliente, OP…"></div>'+
      (cfg.actions||'')+
      '<button class="icon-btn" id="themeBtn" title="Cambiar tema">'+svg(isDark?ICON.sun:ICON.moon,1.7)+'</button>'+
      '<button class="icon-btn" style="position:relative" title="Notificaciones">'+svg(ICON.bell,1.7)+'<span style="position:absolute;top:5px;right:5px;width:7px;height:7px;border-radius:50%;background:var(--accent);border:1.5px solid var(--surface)"></span></button>'+
    '</div>';

  // ─── MONTAJE ───
  const main=document.querySelector('.app-main');
  document.body.classList.add('app-body');
  document.body.insertBefore(sidebar, document.body.firstChild);
  if(main){ main.insertBefore(topbar, main.firstChild); }

  // ─── TEMA ───
  document.getElementById('themeBtn').addEventListener('click',()=>{
    const dark=document.documentElement.getAttribute('data-theme')==='dark';
    if(dark){document.documentElement.removeAttribute('data-theme');}else{document.documentElement.setAttribute('data-theme','dark');}
    try{localStorage.setItem('agro-theme',dark?'light':'dark');}catch(e){}
    document.getElementById('themeBtn').innerHTML=svg(dark?ICON.moon:ICON.sun,1.7);
  });

  window.AGRO_ICON = ICON;
  window.agroSvg = svg;
  requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.classList.add('agro-ready')));
})();
