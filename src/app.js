'use strict';

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const articleById = new Map(MAO_ARTICLES.map(item => [item.id, item]));
const eventById = new Map(HISTORICAL_EVENTS.map(item => [item.id, item]));
const figureIndex = new Map();
const termIndex = new Map();
KEY_FIGURES.forEach((item, index) => [item.name, ...(item.aliases || [])].forEach(name => figureIndex.set(name, index)));
GLOSSARY_TERMS.forEach((item, index) => [item.term, ...(item.aliases || [])].forEach(name => termIndex.set(name, index)));
const STORAGE_KEY = 'maoxuan-companion-v2';
const state = {era:3, volume:'all', type:'article', id:'m1_03', tab:'companion', timelineCurrent:true, camp:'all', view:'reading', theme:'light', fontSize:16, bookmarks:[]};
let map, tileLayer, factionLayer, routeLayer, entryLayer, toastTimer;
let resizeObserver;
const territoryLayers = new Map();
let territoryLabels = [];
const territoryKinds = {influence:'主要控制或影响范围',base:'根据地 / 解放区',guerrilla:'根据地与游击活动区',occupation:'日伪占领范围概览'};

function selectedItem() { return (state.type === 'article' ? articleById : eventById).get(state.id); }
function era() { return HISTORICAL_ERAS.find(item => item.id === state.era); }
function territories() { return HISTORICAL_TERRITORIES[state.era]; }
function territorySources(regions = territories().regions) {
  return [...new Set(regions.flatMap(region => region.sourceIds))].map(id => TERRITORY_SOURCES[id]);
}
function articlesInFilter() { return MAO_ARTICLES.filter(item => state.volume === 'all' || item.vol === state.volume); }
function isMobile() { return window.matchMedia('(max-width: 900px)').matches; }
function announce(message) {
  clearTimeout(toastTimer); $('app-status').textContent = message; $('app-status').hidden = false;
  toastTimer = setTimeout(() => { $('app-status').hidden = true; }, 3200);
}
function savePreferences() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({type:state.type,id:state.id,volume:state.volume,theme:state.theme,fontSize:state.fontSize,bookmarks:state.bookmarks})); }
  catch { /* A blocked storage policy must not interrupt reading. */ }
}
function readPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const selection = HistoryCore.resolveSelection(MAO_ARTICLES,HISTORICAL_EVENTS,saved.type,saved.id,[1,2,3,4].includes(saved.volume)?saved.volume:'all');
    if (selection) Object.assign(state, selection);
    if (saved.theme === 'dark') state.theme = 'dark';
    if ([14,16,18,20,22].includes(saved.fontSize)) state.fontSize = saved.fontSize;
    if (Array.isArray(saved.bookmarks)) state.bookmarks = [...new Set(saved.bookmarks)].filter(key => typeof key === 'string' && resolveKey(key));
  } catch { /* Invalid saved data is ignored. */ }
}
function resolveKey(key) {
  const [type,id] = key.split(':');
  return HistoryCore.resolveSelection(MAO_ARTICLES,HISTORICAL_EVENTS,type,id,'all');
}
function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  for (const type of ['article','event']) {
    const id = params.get(type);
    if (id) return HistoryCore.resolveSelection(MAO_ARTICLES,HISTORICAL_EVENTS,type,id,'all');
  }
  return null;
}
function updateHash() {
  const hash = `#${state.type}=${encodeURIComponent(state.id)}`;
  try { history.replaceState(null,'',hash); } catch { /* file: and privacy policies can restrict history. */ }
}
function sourceMarkup(sources, title = '来源与核读') {
  const valid = (sources || []).filter(source => /^https:\/\//.test(source.url || ''));
  if (!valid.length) return '';
  return `<details class="sources"><summary>${escapeHtml(title)} · ${valid.length}</summary><ul>${valid.map(source => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title)} ↗</a>${source.note ? `<br>${escapeHtml(source.note)}` : ''}</li>`).join('')}</ul></details>`;
}
function selectItem(type,id,options = {}) {
  const next = HistoryCore.resolveSelection(MAO_ARTICLES,HISTORICAL_EVENTS,type,id,state.volume);
  if (!next) { announce('暂未收录这一条目。'); return; }
  const changedEra = next.era !== state.era;
  const changedVolume = next.volume !== state.volume;
  Object.assign(state,next,{tab:'companion'});
  closeSearch(); render(); setTab('companion');
  if (options.showReading !== false && isMobile()) setView('reading');
  resetReaderScroll(options.showReading !== false);
  if (map && options.mapFocus !== false) map.setView(HistoryCore.toAmap(selectedItem().coords), changedEra ? 6 : Math.max(map.getZoom(),6), {animate:false});
  savePreferences(); updateHash();
  if (changedVolume) announce(`已同步切换到第${state.volume}卷。`);
}
function selectEra(id) {
  const target = HISTORICAL_ERAS.find(item => item.id === id);
  if (!target) return;
  const article = MAO_ARTICLES.find(item => item.eraId === id && (state.volume === 'all' || item.vol === state.volume));
  const first = article || HISTORICAL_EVENTS.find(item => item.eraId === id);
  state.era = id;
  if (first) selectItem(article?'article':'event',first.id,{mapFocus:false,showReading:false});
  else render();
  resetMapView();
}
function selectVolume(value) {
  state.volume = value;
  const item = selectedItem();
  if (value !== 'all' && (state.type !== 'article' || item.vol !== value)) {
    const first = MAO_ARTICLES.find(article => article.vol === value);
    if (first) { selectItem('article',first.id); return; }
  }
  render(); savePreferences();
}
function stepArticle(direction) {
  const list = articlesInFilter();
  let index = list.findIndex(item => state.type === 'article' && item.id === state.id);
  index = index < 0 ? (direction > 0 ? 0 : list.length-1) : index+direction;
  const target = list[index];
  if (target) selectItem('article',target.id);
}
function setTab(tab) {
  state.tab = tab;
  for (const name of ['companion','factions','figures','glossary']) {
    $(`tab-content-${name}`).hidden = name !== tab;
    $(`tab-btn-${name}`).setAttribute('aria-pressed',String(name === tab));
  }
  resetReaderScroll();
}
function resetReaderScroll(reveal = false) {
  $('right-panel-body').scrollTop = 0;
  // Mobile reading uses the document scroller, not the desktop reading panel.
  if (reveal && isMobile() && state.view === 'reading') {
    const heading = $('tab-content-companion').querySelector('h2');
    heading.focus({preventScroll:true});
    heading.scrollIntoView({block:'start',behavior:'instant'});
  }
}
function setView(view) {
  state.view = view; document.body.dataset.mobileView = view;
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.view === view)));
  if (view === 'map') requestAnimationFrame(() => { initMap(); if (map) {map.invalidateSize();resetMapView();} });
}
function render() {
  renderEraNavigation(); renderCompanion(); renderFactions(); renderTimeline(); renderReaderTools();
  setTab(state.tab); updateMapLayers();
}
function renderEraNavigation() {
  $('era-tabs-container').innerHTML = HISTORICAL_ERAS.map(item => `<button data-era="${item.id}" aria-pressed="${item.id === state.era}">${escapeHtml(item.shortName)}</button>`).join('');
  document.querySelectorAll('[data-volume]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.volume === String(state.volume))));
  const current = era();
  $('map-era-badge').textContent = `${current.period} · 时期空间概览`;
  $('map-era-title').textContent = current.title;
  $('map-era-desc').textContent = current.summary;
  $('map-context-note').textContent = `${territories().note} ${current.mapContext}`;
  $('map-sources').innerHTML = sourceMarkup(territorySources(),'势力范围绘制依据') + sourceMarkup(current.sources,'时期背景来源');
  $('territory-period').textContent = territories().periodLabel;
  $('selected-map-date').textContent = `当前条目 ${selectedItem().date} · 高德现代底图`;
}
function renderCompanion() {
  const item = selectedItem(), isArticle = state.type === 'article';
  const relatedFigures = (item.figuresInvolved || []).map(name => `<button data-figure="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('');
  const relatedTerms = (item.relatedTerms || []).map(name => `<button data-term="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('');
  $('tab-content-companion').innerHTML = `<article class="article-card">
    <div class="article-meta"><span class="stamp">${isArticle ? `第${item.vol}卷 · 精选伴读` : '历史事件'}</span><time>${escapeHtml(item.date)}</time><span>${item.datePrecision === 'month' ? '日期精度：月' : ''}</span></div>
    <h2 tabindex="-1">${escapeHtml(item.title)}</h2><p class="location-note">${escapeHtml(item.locationName || item.location)}</p>
    <p class="location-note">${escapeHtml(item.coordinateNote || '地图为城市或区域示意定位。')}</p>
    <section><h3>${isArticle ? '一、写作背景' : '事件背景与经过'}</h3><p class="prose background-copy">${escapeHtml(item.background || item.summary)}</p></section>
    ${periodImageMarkup()}
    ${isArticle ? `<section><h3>二、核心论点 · 编者概括</h3><ol class="core-points">${item.corePoints.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ol></section>
      <section><h3>${item.quoteVerified ? '三、原文摘录 · 已核对' : '三、摘录参考 · 待逐字核读'}</h3><blockquote>${escapeHtml(item.quote)}</blockquote><p class="quote-note">${escapeHtml(item.quoteNote || '请结合下方原文来源核读，编者概括不替代原文。')}</p></section>
      <section><h3>相关人物与历史背景</h3><p class="small">包含文中人物与背景关联；不表示每个人物均在原文中被点名。</p><div class="chip-list">${relatedFigures}</div></section>
      <section><h3>关联术语</h3><div class="chip-list">${relatedTerms}</div></section>` : `<section><h3>同一时期的已收录篇目</h3><p class="small">按时代提供阅读线索，不表示均由本事件直接催生。</p><div class="chip-list">${MAO_ARTICLES.filter(article=>article.eraId===item.eraId).map(article=>`<button data-select-type="article" data-select-id="${article.id}">${escapeHtml(article.title)}</button>`).join('')}</div></section>`}
    <section>${sourceMarkup(item.sources)}${item.editionNote ? `<p class="quote-note">${escapeHtml(item.editionNote)}</p>` : ''}</section>
  </article>`;
  const photo=$('tab-content-companion').querySelector('.period-photo img');
  if(photo)photo.addEventListener('error',()=>{
    photo.hidden=true;
    photo.closest('figure').querySelector('.photo-unavailable').hidden=false;
  },{once:true});
}
function periodImageMarkup() {
  const photo=HISTORICAL_IMAGES[state.era];
  if(!photo)return '';
  return `<section class="period-images" aria-label="时期历史影像"><h3>时期影像 <span>${escapeHtml(era().period)}</span></h3><p class="photo-scope">本时期的背景资料，不表示当前条目的发生或写作现场。</p>
    <figure class="period-photo"><a class="photo-link" href="${escapeHtml(photo.src)}" target="_blank" rel="noopener noreferrer" aria-label="查看原图：${escapeHtml(photo.title)}"><img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.alt)}" width="${photo.width}" height="${photo.height}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>
    <p class="photo-unavailable" hidden>图片暂时无法加载，可从下方来源链接查看。</p>
    <figcaption><div class="photo-title"><strong>${escapeHtml(photo.title)}</strong><time>${escapeHtml(photo.date)}</time></div><p>${escapeHtml(photo.caption)}</p>
    <details class="photo-credit"><summary>图片出处与版权</summary><p>${escapeHtml(photo.credit)}</p><p>${escapeHtml(photo.rights)}；按原图比例展示，未裁切或上色。</p><a href="${escapeHtml(photo.sourceUrl)}" target="_blank" rel="noopener noreferrer">Wikimedia Commons · 来源与版权说明 ↗</a></details></figcaption></figure></section>`;
}
function renderFactions() {
  const current = era();
  $('tab-content-factions').innerHTML = `<p class="info-note">${escapeHtml(territories().periodLabel)}。${escapeHtml(territories().note)}</p>${current.factions.map(faction=>`<article class="reference-card" id="faction-card-${faction.id}">
    <h3><span class="color-dot" style="--dot:${faction.color}"></span>${escapeHtml(faction.name)}</h3><p class="reference-meta">${escapeHtml(faction.timeLabel || current.period)} · ${escapeHtml(faction.leader)}</p>
    <p class="prose">${escapeHtml(faction.stance)}</p><p class="context"><strong>代表地区：</strong>${escapeHtml(faction.provinces)}<br><strong>范围说明：</strong>${escapeHtml(faction.scopeNote)}<br><strong>兵力口径：</strong>${escapeHtml(faction.troops)}</p>
    <p class="context"><strong>伴读关联：</strong>${escapeHtml(faction.maoContext)}</p><ul class="area-list">${territories().regions.filter(region=>region.factionId===faction.id).map(region=>`<li>${escapeHtml(region.name)} · ${escapeHtml(region.period)}</li>`).join('')}</ul><div class="chip-list"><button data-focus-faction="${faction.id}">在地图查看大致范围</button></div>${sourceMarkup(territorySources(territories().regions.filter(region=>region.factionId===faction.id)),'范围绘制参考')}${sourceMarkup(faction.sources || current.sources)}
  </article>`).join('')}`;
}
function renderFigures() {
  const query = $('figure-search-input').value.trim().toLowerCase();
  const camps = [...new Map(KEY_FIGURES.map(item=>[item.camp,item.campLabel])).entries()];
  $('figure-camps').innerHTML = `<button data-camp="all" aria-pressed="${state.camp === 'all'}">全部</button>${camps.map(([camp,label])=>`<button data-camp="${escapeHtml(camp)}" aria-pressed="${state.camp === camp}">${escapeHtml(label)}</button>`).join('')}`;
  const matches = KEY_FIGURES.map((item,index)=>({item,index})).filter(({item})=>(state.camp==='all'||item.camp===state.camp)&&(!query||[item.name,...(item.aliases||[]),item.bio,item.role,item.maoContext].join(' ').toLowerCase().includes(query)));
  $('figures-list-container').innerHTML = matches.map(({item,index})=>`<article class="reference-card" id="figure-card-${index}"><h3>${escapeHtml(item.name)}</h3><p class="reference-meta">${escapeHtml(item.lifespan)} · ${escapeHtml(item.campLabel)}</p><p class="small">${escapeHtml(item.role)}</p><p class="prose">${escapeHtml(item.bio)}</p><p class="context"><strong>伴读关联：</strong>${escapeHtml(item.maoContext)}</p>${sourceMarkup(item.sources)}</article>`).join('') || '<p class="empty-state">未找到人物，请换一个关键词。</p>';
}
function renderGlossary() {
  const query = $('glossary-search-input').value.trim().toLowerCase();
  const matches = GLOSSARY_TERMS.map((item,index)=>({item,index})).filter(({item})=>!query||[item.term,...(item.aliases||[]),item.explain,item.appearIn].join(' ').toLowerCase().includes(query));
  $('glossary-list-container').innerHTML = matches.map(({item,index})=>`<article class="reference-card" id="glossary-card-${index}"><h3>${escapeHtml(item.term)}</h3><p class="reference-meta">${escapeHtml(item.category)}</p><p class="prose">${escapeHtml(item.explain)}</p><p class="context"><strong>阅读线索：</strong>${escapeHtml(item.appearIn)}</p>${sourceMarkup(item.sources)}</article>`).join('') || '<p class="empty-state">未找到术语，请换一个关键词。</p>';
}
function jumpToReference(kind,name) {
  const figures = kind === 'figure', index = (figures?figureIndex:termIndex).get(name);
  if (index === undefined) { announce(`“${name}”暂未收录。`); return; }
  if (figures) {state.camp='all';$('figure-search-input').value='';renderFigures();} else {$('glossary-search-input').value='';renderGlossary();}
  setTab(figures?'figures':'glossary'); setView('reading'); closeSearch();
  requestAnimationFrame(()=>{
    const card = $(`${figures?'figure':'glossary'}-card-${index}`), panel = $('right-panel-body');
    card.classList.add('highlight');
    if (isMobile()) card.scrollIntoView({block:'start',behavior:'instant'});
    else panel.scrollTop = card.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop - 14;
    setTimeout(()=>card.classList.remove('highlight'),2200);
  });
}
function renderTimeline() {
  const focusedId = $('timeline-track').contains(document.activeElement) ? document.activeElement.id : null;
  const items = [...HISTORICAL_EVENTS.map(item=>({...item,itemType:'event'})),...articlesInFilter().map(item=>({...item,itemType:'article'}))]
    .filter(item=>!state.timelineCurrent||item.eraId===state.era).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  $('timeline-track').innerHTML = items.map(item=>`<button id="tl-node-${item.itemType}-${item.id}" class="timeline-card ${state.type===item.itemType&&state.id===item.id?'current':''}" data-select-type="${item.itemType}" data-select-id="${item.id}" ${state.type===item.itemType&&state.id===item.id?'aria-current="true"':''}>
    <div><span class="${item.itemType==='article'?'article':'event'}-tag">${item.itemType==='article'?`第${item.vol}卷`:'历史事件'}</span> <time class="date">${item.date}</time><h3>${escapeHtml(item.title)}</h3></div><small>${escapeHtml(item.locationName || item.location)}</small></button>`).join('');
  $('timeline-scope-btn').setAttribute('aria-pressed',String(state.timelineCurrent));
  $('timeline-scope-btn').textContent = state.timelineCurrent ? '仅看当前时期' : '全部时期';
  if (focusedId) $(focusedId)?.focus({preventScroll:true});
  // Scroll only the horizontal scroller, never scrollIntoView on the whole page.
  requestAnimationFrame(()=>{
    const node = $(`tl-node-${state.type}-${state.id}`), box = $('timeline-scroll-box');
    if (node && box.clientWidth) box.scrollLeft += node.getBoundingClientRect().left - box.getBoundingClientRect().left - (box.clientWidth-node.offsetWidth)/2;
  });
}
function renderReaderTools() {
  const list = articlesInFilter(), index = state.type === 'article' ? list.findIndex(item=>item.id===state.id) : -1;
  $('walkthrough-indicator').textContent = index >= 0 ? `${index+1} / ${list.length} 篇精选` : `历史事件 · ${list.length}篇阅读线索`;
  $('article-prev').disabled = !list.length || index === 0;
  $('article-next').disabled = !list.length || index === list.length-1;
  const bookmarked = state.bookmarks.includes(`${state.type}:${state.id}`);
  $('bookmark-btn').setAttribute('aria-pressed',String(bookmarked)); $('bookmark-btn').textContent = bookmarked?'已收藏':'收藏本篇';
  $('bookmark-select').innerHTML = '<option value="">我的收藏</option>' + state.bookmarks.map(key=>{const [type,id]=key.split(':'),item=(type==='article'?articleById:eventById).get(id);return `<option value="${escapeHtml(key)}">${escapeHtml(item.title)}</option>`;}).join('');
  $('font-smaller').disabled=state.fontSize<=14; $('font-larger').disabled=state.fontSize>=22;
}
function closeSearch() { $('search-results-dropdown').hidden = true; $('global-search-input').setAttribute('aria-expanded','false'); }
function positionSearch() { document.documentElement.style.setProperty('--search-top',`${Math.max(8,$('global-search-input').getBoundingClientRect().bottom+6)}px`); }
function search() {
  const query = $('global-search-input').value.trim().toLowerCase();
  if (!query) {closeSearch();return;}
  const groups = [
    ['精选篇目', MAO_ARTICLES.filter(item=>[item.title,item.background,item.quote,...item.corePoints].join(' ').toLowerCase().includes(query)),item=>`data-select-type="article" data-select-id="${item.id}"`,item=>`第${item.vol}卷 · ${item.date}`],
    ['历史事件',HISTORICAL_EVENTS.filter(item=>[item.title,item.summary,item.location].join(' ').toLowerCase().includes(query)),item=>`data-select-type="event" data-select-id="${item.id}"`,item=>item.date],
    ['历史人物',KEY_FIGURES.filter(item=>[item.name,...(item.aliases||[]),item.bio,item.maoContext].join(' ').toLowerCase().includes(query)),item=>`data-figure="${escapeHtml(item.name)}"`,item=>item.role],
    ['历史术语',GLOSSARY_TERMS.filter(item=>[item.term,...(item.aliases||[]),item.explain].join(' ').toLowerCase().includes(query)),item=>`data-term="${escapeHtml(item.term)}"`,item=>item.category]
  ];
  $('search-results-dropdown').innerHTML = groups.filter(([,items])=>items.length).map(([title,items,attrs,subtitle])=>`<h3>${title} · ${items.length}项</h3>${items.map(item=>`<button ${attrs(item)}>${escapeHtml(item.title||item.name||item.term)}<small>${escapeHtml(subtitle(item))}</small></button>`).join('')}`).join('') || '<p class="empty-state">没有匹配结果，请尝试其他关键词。</p>';
  positionSearch(); $('search-results-dropdown').hidden=false; $('global-search-input').setAttribute('aria-expanded','true');
}
function applyTheme() {
  document.documentElement.classList.toggle('dark',state.theme==='dark');
  $('theme-toggle-btn').textContent=state.theme==='dark'?'宣纸':'月色';
  $('theme-toggle-btn').setAttribute('aria-label',state.theme==='dark'?'切换为浅色配色':'切换为深色配色');
  document.documentElement.style.setProperty('--reader-size',`${state.fontSize}px`);
}

function initMap() {
  if (map || (isMobile() && state.view !== 'map')) return;
  if (typeof L === 'undefined') {showMapError('地图组件加载失败，请检查网络后刷新。文字阅读与搜索仍可使用。');return;}
  map=L.map('historical-map',{zoomControl:false,minZoom:3,maxZoom:12,scrollWheelZoom:true}).setView(HistoryCore.toAmap(era().center),era().zoom);
  document.querySelectorAll('.map-overlay').forEach(element=>{
    L.DomEvent.disableClickPropagation(element);
    L.DomEvent.disableScrollPropagation(element);
    // Keyboard interaction within a card must not pan or zoom the map.
    L.DomEvent.on(element,'keydown',L.DomEvent.stopPropagation);
  });
  document.querySelectorAll('.map-overlay details, details.map-overlay').forEach(element=>element.addEventListener('toggle',layoutTerritoryLabels));
  map.createPane('territoryAreas').style.zIndex=350;
  map.createPane('territoryLabels').style.zIndex=450;
  // The map pane is a transformed stacking context. Put popups beside it so
  // they can cover the fixed cards, and mirror its translation via public APIs.
  const popupPane=map.createPane('mapPopups',map.getContainer());
  popupPane.style.zIndex=700;
  const syncPopups=()=>L.DomUtil.setPosition(popupPane,map.layerPointToContainerPoint([0,0]));
  map.on('move',syncPopups);syncPopups();
  L.control.zoom({position:'bottomright'}).addTo(map);
  L.control.scale({imperial:false,position:'bottomright'}).addTo(map);
  factionLayer=L.layerGroup().addTo(map);routeLayer=L.layerGroup().addTo(map);entryLayer=L.layerGroup().addTo(map);
  let tileErrors=0;
  tileLayer=L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',{subdomains:['1','2','3','4'],maxZoom:18,attribution:'&copy; <a href="https://www.amap.com/" target="_blank" rel="noopener noreferrer">高德地图</a> · 现代地理参照'});
  tileLayer.on('tileerror',()=>{if(++tileErrors>=6)showMapError('高德底图暂时加载不完整。请检查网络，或点击重试。',()=>{tileErrors=0;$('map-error').hidden=true;tileLayer.redraw();});});
  tileLayer.addTo(map);
  map.on('zoomend',renderEntryMarkers);
  map.on('moveend',layoutTerritoryLabels);
  updateMapLayers();
  resizeObserver=new ResizeObserver(()=>{if(map&&$('historical-map').clientWidth)map.invalidateSize({pan:false});});
  resizeObserver.observe($('historical-map'));
}
function showMapError(message,retry) {
  const box=$('map-error');box.textContent=message;box.hidden=false;
  if(retry){const button=document.createElement('button');button.textContent='重新加载高德';button.addEventListener('click',retry);box.append(' ',button);}
}
function resetMapView() { if(map)map.setView(HistoryCore.toAmap(era().center),era().zoom,{animate:false}); }
function factionPopup(faction, location) {
  const div=document.createElement('div');
  div.innerHTML=`<strong>${escapeHtml(faction.name)}</strong><p>${escapeHtml(location.name)} · ${escapeHtml(faction.timeLabel)}</p><p>${escapeHtml(faction.scopeNote)}</p><button>查看势力说明</button>`;
  div.querySelector('button').addEventListener('click',()=>{setTab('factions');setView('reading');highlightCard(`faction-card-${faction.id}`);});
  return div;
}
function territoryPopup(faction, region) {
  const div=document.createElement('div');
  div.className='territory-popup';
  div.innerHTML=`<strong>${escapeHtml(region.name)}</strong><p class="territory-popup-period">${escapeHtml(region.period)} · ${escapeHtml(territoryKinds[region.kind])}</p><p>${escapeHtml(region.note)}</p><p class="territory-disclaimer">示例范围仅为大致范围，不代表精确边界或逐日实控线。</p>${sourceMarkup(territorySources([region]),'查看绘制依据')}<button>查看势力说明</button>`;
  div.querySelector('button').addEventListener('click',()=>{setTab('factions');setView('reading');highlightCard(`faction-card-${faction.id}`);});
  return div;
}
function bindTerritoryPopup(layer,faction,region) {
  // Keep one DOM node: Leaflet calls functional content again on update(),
  // which would replace the expanded <details> with a closed one.
  const content=territoryPopup(faction,region);
  layer.bindPopup(content,{pane:'mapPopups',maxWidth:Math.min(340,map.getSize().x-60),maxHeight:260,autoPanPadding:[12,15]});
  content.addEventListener('toggle',()=>{if(layer.isPopupOpen())layer.getPopup().update();},true);
  layer.on('popupopen',()=>{
    layer.getPopup().options.maxWidth=Math.min(340,map.getSize().x-60);
    layer.getPopup().options.maxHeight=Math.max(100,Math.min(260,map.getSize().y-95));
    layer.getPopup().update();
  });
}
function layoutTerritoryLabels() {
  if(!map)return;
  const occupied=[];
  const container=$('historical-map').getBoundingClientRect();
  for(const element of document.querySelectorAll('.map-overlay')) {
    const rect=element.getBoundingClientRect();
    occupied.push({left:rect.left-container.left,right:rect.right-container.left,top:rect.top-container.top,bottom:rect.bottom-container.top});
  }
  for(const marker of entryLayer.getLayers()) {
    const point=map.latLngToContainerPoint(marker.getLatLng());
    occupied.push({left:point.x-19,right:point.x+19,top:point.y-19,bottom:point.y+19});
  }
  const size=map.getSize();
  for(const marker of territoryLabels) {
    const span=marker.getElement()?.querySelector('.territory-label');if(!span)continue;
    const point=map.latLngToContainerPoint(marker.getLatLng()),w=span.offsetWidth,h=span.offsetHeight;
    let placed=false;
    for(const [dx,dy] of [[0,0],[0,-25],[0,25],[-28,0],[28,0]]) {
      const box={left:point.x-w/2+dx,right:point.x+w/2+dx,top:point.y-h/2+dy,bottom:point.y+h/2+dy};
      if(box.left<3||box.right>size.x-3||box.top<38||box.bottom>size.y-8)continue;
      if(occupied.some(other=>box.left<other.right+3&&box.right>other.left-3&&box.top<other.bottom+2&&box.bottom>other.top-2))continue;
      span.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;
      occupied.push(box);placed=true;break;
    }
    span.style.visibility=placed?'visible':'hidden';
  }
}
function highlightCard(id) {
  requestAnimationFrame(()=>{const card=$(id);if(!card)return;card.classList.add('highlight');if(isMobile())card.scrollIntoView({block:'start'});else $('right-panel-body').scrollTop+=card.getBoundingClientRect().top-$('right-panel-body').getBoundingClientRect().top-12;setTimeout(()=>card.classList.remove('highlight'),2200);});
}
function focusFaction(id) {
  const faction=era().factions.find(item=>item.id===id);
  if(!faction)return;
  setView('map');
  requestAnimationFrame(()=>{
    initMap(); if(!map)return;
    if(!$('layer-toggle-polygons').checked){$('layer-toggle-polygons').checked=true;updateMapLayers();}
    const layers=territoryLayers.get(id)||[];
    if(layers.length){
      const bounds=L.latLngBounds([]);layers.forEach(layer=>bounds.extend(layer.getBounds()));
      map.fitBounds(bounds,{padding:[35,55],maxZoom:7,animate:false});
      layers.forEach(layer=>layer.setStyle({weight:3,fillOpacity:.38}));
      const currentEra=state.era;
      setTimeout(()=>{if(state.era===currentEra)layers.forEach(layer=>layer.setStyle(layer.baseStyle));},1800);
    }
  });
}
function updateMapLayers() {
  const current=era();
  $('map-legend-items').innerHTML=current.factions.map(item=>`<li><span class="area-swatch" style="--dot:${item.color}" aria-hidden="true"></span>${escapeHtml(item.name)}</li>`).join('');
  const articleCount=articlesInFilter().filter(item=>item.eraId===state.era).length,eventCount=HISTORICAL_EVENTS.filter(item=>item.eraId===state.era).length;
  $('map-item-count').textContent=`本时期 ${articleCount}篇 · ${eventCount}件事件`;
  if(!map)return;
  factionLayer.clearLayers();routeLayer.clearLayers();territoryLayers.clear();territoryLabels=[];
  if($('layer-toggle-polygons').checked) for(const region of territories().regions) {
    const faction=current.factions.find(item=>item.id===region.factionId);
    const style={pane:'territoryAreas',className:`territory-area territory-${region.kind}`,color:faction.color,weight:1.8,opacity:.85,fillColor:faction.color,fillOpacity:region.kind==='occupation'?.19:region.kind==='influence'?.21:.32,dashArray:region.kind==='guerrilla'?'5 4':null};
    const polygon=L.polygon(region.rings.map(ring=>ring.map(HistoryCore.toAmap)),style);
    polygon.baseStyle={...style};
    bindTerritoryPopup(polygon,faction,region);
    polygon.on('mouseover',()=>polygon.setStyle({weight:3,fillOpacity:.4}));
    polygon.on('mouseout',()=>polygon.setStyle(style));
    factionLayer.addLayer(polygon);
    polygon.getElement().dataset.regionId=region.id;
    if(!territoryLayers.has(faction.id))territoryLayers.set(faction.id,[]);
    territoryLayers.get(faction.id).push(polygon);
    const label=L.marker(HistoryCore.toAmap(region.labelPoint),{pane:'territoryLabels',keyboard:false,title:`${region.name} · ${region.period}`,icon:L.divIcon({className:'territory-label-anchor',html:`<span class="territory-label" style="--territory-color:${faction.color}">${escapeHtml(region.name)}</span>`,iconSize:[0,0],iconAnchor:[0,0]})});
    bindTerritoryPopup(label,faction,region);factionLayer.addLayer(label);territoryLabels.push(label);
  }
  if($('layer-toggle-polygons').checked) for(const faction of current.factions) {
    for(const [index,location] of (faction.locations||[]).entries()) {
      const marker=L.circleMarker(HistoryCore.toAmap(location.coords),{radius:3,color:faction.color,weight:1.5,fillColor:'#fffdf8',fillOpacity:.9});
      marker.bindTooltip(escapeHtml(`${location.name} · ${faction.name}`),{className:'faction-tooltip',direction:'top',permanent:false});
      marker.bindPopup(factionPopup(faction,location),{pane:'mapPopups'});factionLayer.addLayer(marker);
    }
  }
  if($('layer-toggle-routes').checked) for(const route of current.routes||[]) {
    const points=route.points.map(HistoryCore.toAmap);
    const line=L.polyline(points,{color:route.color,weight:3,opacity:.75,dashArray:'7 6'});
    line.bindPopup(`<strong>${escapeHtml(route.name)}</strong><p>${escapeHtml(route.description)}</p><p>节点连线表示行动先后和战略方向，不是实际行军道路。</p>${sourceMarkup(route.sources)}`,{pane:'mapPopups'});routeLayer.addLayer(line);
    for(const [index,node] of (route.nodes||[]).entries()) {
      const marker=L.circleMarker(HistoryCore.toAmap(node.coords),{radius:4,color:route.color,fillOpacity:1,weight:1});
      marker.bindTooltip(escapeHtml(`${index+1}. ${node.name} · ${node.date}`));
      marker.bindPopup(`<strong>${escapeHtml(node.name)}</strong><p>${escapeHtml(node.date)} · ${escapeHtml(route.name)}</p><p>城市或区域参考点；非精确旧址定位。</p>${sourceMarkup(route.sources)}`,{pane:'mapPopups'});routeLayer.addLayer(marker);
    }
    // One direction arrow per segment; the polyline itself is not animated.
    for(let i=1;i<points.length;i++) {
      const a=map.project(points[i-1],6),b=map.project(points[i],6),angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
      const center=[(points[i-1][0]+points[i][0])/2,(points[i-1][1]+points[i][1])/2];
      routeLayer.addLayer(L.marker(center,{interactive:false,keyboard:false,icon:L.divIcon({className:'route-arrow',html:`<span style="display:block;color:${route.color};transform:rotate(${angle}deg)">➤</span>`,iconSize:[20,20],iconAnchor:[10,10]})}));
    }
  }
  renderEntryMarkers();
}
function renderEntryMarkers() {
  if(!map||!entryLayer)return;
  entryLayer.clearLayers();
  const items=[];
  if($('layer-toggle-articles').checked) items.push(...articlesInFilter().filter(item=>item.eraId===state.era).map(item=>({...item,itemType:'article'})));
  if($('layer-toggle-events').checked) items.push(...HISTORICAL_EVENTS.filter(item=>item.eraId===state.era).map(item=>({...item,itemType:'event'})));
  const groups=HistoryCore.clusterPoints(items,coords=>map.latLngToContainerPoint(HistoryCore.toAmap(coords)),36);
  for(const group of groups) {
    const hasArticle=group.items.some(item=>item.itemType==='article'),isSelected=group.items.some(item=>item.itemType===state.type&&item.id===state.id);
    const title=group.items.length>1?`${group.items.length}个篇目与事件，点击展开`:group.items[0].title;
    const marker=L.marker(HistoryCore.toAmap(group.coords),{title,alt:title,icon:L.divIcon({className:'',html:`<div class="map-bubble ${hasArticle?'':'event'} ${isSelected?'selected':''}">${group.items.length>1?group.items.length:hasArticle?'书':'事'}</div>`,iconSize:[34,34],iconAnchor:[17,17]})});
    if(group.items.length>1) {
      const div=document.createElement('div');div.innerHTML=`<strong>附近 ${group.items.length} 个篇目与事件</strong><p>按日期排列，选择一项打开伴读。</p>`;
      [...group.items].sort((a,b)=>a.date.localeCompare(b.date)).forEach(item=>{const button=document.createElement('button');button.textContent=`${item.date} · ${item.title}`;button.addEventListener('click',()=>selectItem(item.itemType,item.id,{mapFocus:false}));div.append(button);});
      marker.bindPopup(div,{pane:'mapPopups',maxWidth:340});
    } else marker.on('click',()=>selectItem(group.items[0].itemType,group.items[0].id,{mapFocus:false}));
    entryLayer.addLayer(marker);
  }
  requestAnimationFrame(layoutTerritoryLabels);
}

document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(button){
    const data=button.dataset;
    if(data.selectId)selectItem(data.selectType,data.selectId);
    else if(data.era)selectEra(Number(data.era));
    else if(data.volume)selectVolume(data.volume==='all'?'all':Number(data.volume));
    else if(data.tab)setTab(data.tab);
    else if(data.view)setView(data.view);
    else if(data.figure)jumpToReference('figure',data.figure);
    else if(data.term)jumpToReference('term',data.term);
    else if(data.camp){state.camp=data.camp;renderFigures();}
    else if(data.focusFaction)focusFaction(data.focusFaction);
  }
  if(!event.target.closest('.search-wrap'))closeSearch();
});
function bindControls() {
  $('global-search-input').addEventListener('input',search);$('global-search-input').addEventListener('focus',search);
  $('global-search-input').addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='Enter'){const button=$('search-results-dropdown').querySelector('button');if(button&&!$('search-results-dropdown').hidden){event.preventDefault();button.focus();}}});
  $('search-results-dropdown').addEventListener('keydown',event=>{const buttons=[...$('search-results-dropdown').querySelectorAll('button')],index=buttons.indexOf(document.activeElement);if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('search-results-dropdown').hidden){closeSearch();$('global-search-input').focus();closeSearch();}});
  $('figure-search-input').addEventListener('input',renderFigures);$('glossary-search-input').addEventListener('input',renderGlossary);
  document.querySelectorAll('.layer-options input').forEach(input=>input.addEventListener('change',updateMapLayers));
  $('reset-map-btn').addEventListener('click',resetMapView);
  $('article-prev').addEventListener('click',()=>stepArticle(-1));$('article-next').addEventListener('click',()=>stepArticle(1));
  $('timeline-scope-btn').addEventListener('click',()=>{state.timelineCurrent=!state.timelineCurrent;renderTimeline();});
  $('timeline-prev').addEventListener('click',()=>$('timeline-scroll-box').scrollBy({left:-360,behavior:'smooth'}));$('timeline-next').addEventListener('click',()=>$('timeline-scroll-box').scrollBy({left:360,behavior:'smooth'}));
  $('theme-toggle-btn').addEventListener('click',()=>{state.theme=state.theme==='dark'?'light':'dark';applyTheme();savePreferences();});
  for(const [id,delta] of [['font-smaller',-2],['font-larger',2]])$(id).addEventListener('click',()=>{state.fontSize=Math.max(14,Math.min(22,state.fontSize+delta));applyTheme();renderReaderTools();savePreferences();});
  $('bookmark-btn').addEventListener('click',()=>{const key=`${state.type}:${state.id}`,index=state.bookmarks.indexOf(key);if(index<0)state.bookmarks.push(key);else state.bookmarks.splice(index,1);renderReaderTools();savePreferences();announce(index<0?'已加入收藏。':'已取消收藏。');});
  $('bookmark-select').addEventListener('change',event=>{const target=resolveKey(event.target.value);if(target)selectItem(target.type,target.id);});
  $('share-btn').addEventListener('click',async()=>{updateHash();try{await navigator.clipboard.writeText(location.href);announce(location.protocol==='file:'?'已复制本机阅读链接；其他设备需先部署网页。':'已复制当前条目链接。');}catch{announce('复制未成功，可从浏览器地址栏复制当前条目链接。');}});
  $('about-btn').addEventListener('click',()=>$('about-dialog').showModal());$('close-about-btn').addEventListener('click',()=>$('about-dialog').close());
  $('about-dialog').addEventListener('click',event=>{if(event.target===$('about-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
  window.addEventListener('hashchange',()=>{const target=readHash();if(target)selectItem(target.type,target.id);});
  window.addEventListener('resize',()=>{positionSearch();if(!isMobile()){initMap();if(map)map.invalidateSize();}});
  window.addEventListener('scroll',()=>{if(isMobile()&&!$('search-results-dropdown').hidden)positionSearch();},{passive:true});
}
readPreferences();
const initialHash=readHash();if(initialHash)Object.assign(state,initialHash);
bindControls();applyTheme();render();renderFigures();renderGlossary();initMap();updateHash();
$('collection-summary').textContent=`当前收录 ${MAO_ARTICLES.length} 篇精选文章、${HISTORICAL_EVENTS.length} 件历史事件、${KEY_FIGURES.length} 个人物条目和 ${GLOSSARY_TERMS.length} 个术语条目。`;
