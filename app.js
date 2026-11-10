/* 設備保全ナビ — app.js
   フレームワーク不使用。ハッシュルーティングで画面を切り替える。
     #/            トップ（設備検索）
     #/CR001       設備詳細（QRコードのURLはこの形式）
     #/CR001/drawings | repairs | photos   図面・修理履歴・写真
*/
'use strict';

(() => {
  const $ = (sel) => document.querySelector(sel);
  const app = $('#app');
  const back = $('#back');
  const backLabel = $('#back-label');
  const titleEl = $('#title');
  const syncEl = $('#sync');
  const actions = $('#actions');
  const viewer = $('#viewer');
  const viewerImg = $('#viewer-img');
  const viewerCap = $('#viewer-cap');

  const DATA_FILES = { equipment: 'equipment.json', repairs: 'repairs.json' };
  const RECENT_KEY = 'navi.recent';

  const state = { equipment: [], repairs: [], updatedAt: '', error: '', query: '' };

  /* ---------- 共通ヘルパー ---------- */

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  // 検索用の正規化（全角→半角、大文字小文字無視）
  const norm = (v) => String(v ?? '').normalize('NFKC').toLowerCase();

  const locText = (e) => {
    const l = e.location;
    if (!l) return '';
    if (typeof l === 'string') return l;
    return [l.factory, l.line, l.area].filter(Boolean).join(' ');
  };

  const fmtDate = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ''));
    return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : String(s ?? '');
  };

  // JSONのパスをURLに変換。相対パスと https:// のみ許可（javascript: 等は無効化）
  // base: パスがファイル名のみ（「/」を含まない）の場合に補う保存フォルダ（例: 'drawings/'）
  const fileUrl = (p, base = '') => {
    const s = String(p ?? '').trim();
    if (!s) return '';
    if (/^https:\/\//i.test(s)) return encodeURI(s);
    if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('//')) return '';
    return (s.includes('/') ? s : base + s).split('/').map(encodeURIComponent).join('/');
  };

  const byId = (a, b) => String(a.equipId).localeCompare(String(b.equipId), 'ja', { numeric: true });

  const findEquip = (id) => state.equipment.find((e) => norm(e.equipId) === norm(id));

  const repairsOf = (id) =>
    state.repairs
      .filter((r) => norm(r.equipId) === norm(id))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const getRecent = () => {
    try {
      const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    } catch (_) {
      return [];
    }
  };
  const pushRecent = (id) => {
    try {
      const next = [id, ...getRecent().filter((x) => x !== id)].slice(0, 5);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch (_) { /* 保存できなくても動作に影響なし */ }
  };

  const ICON = {
    drawing: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M6 3h8l4 4v14H6z M14 3v4h4 M9 12h6 M9 16h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    repair: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M14.5 6.5a4 4 0 0 0 4.9 4.9L9 21.8a2.1 2.1 0 0 1-3-3L16.4 8.4A4 4 0 0 0 14.5 6.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    photo: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M4 7h3l2-2.5h6L17 7h3v12H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  };

  /* ---------- データ読込 ---------- */

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${url} (${res.status})`);
    return res.json();
  }

  async function loadData() {
    state.error = '';
    try {
      const [eq, rp] = await Promise.all([fetchJson(DATA_FILES.equipment), fetchJson(DATA_FILES.repairs)]);
      state.equipment = Array.isArray(eq.equipment) ? eq.equipment : [];
      state.repairs = Array.isArray(rp.repairs) ? rp.repairs : [];
      state.updatedAt = eq.updatedAt || '';
    } catch (err) {
      state.error = String(err && err.message ? err.message : err);
    }
    updateSync();
  }

  function updateSync() {
    const offline = !navigator.onLine;
    const d = fmtDate(state.updatedAt);
    syncEl.classList.toggle('is-offline', offline);
    syncEl.textContent = offline ? 'オフライン表示' : d ? `更新 ${d}` : '';
    syncEl.title = offline && d ? `データ更新日 ${d}` : '';
  }

  /* ---------- 画面の枠（タイトル・戻る・下部ボタン） ---------- */

  function setChrome({ title, backHref, backText, actionsHtml, docTitle }) {
    titleEl.textContent = title;
    document.title = docTitle || (title === '設備ナビ' ? '設備保全ナビ' : `${title} | 設備保全ナビ`);
    if (backHref) {
      back.href = backHref;
      backLabel.textContent = backText || '戻る';
      back.hidden = false;
    } else {
      back.hidden = true;
    }
    actions.innerHTML = actionsHtml || '';
    actions.hidden = !actionsHtml;
  }

  /* ---------- トップ：設備検索 ---------- */

  function renderHome() {
    setChrome({ title: '設備ナビ' });
    if (state.error && !state.equipment.length) return renderLoadError();

    app.innerHTML = `
      <div class="search">
        <label class="sr-only" for="q">設備を検索</label>
        <input id="q" type="search" inputmode="search" enterkeyhint="search" autocomplete="off"
               autocapitalize="off" spellcheck="false" placeholder="設備名・番号・場所・型式で検索">
        <p class="hint">QRコードを読み取ると、その設備が直接開きます。</p>
      </div>
      <div id="list" aria-live="polite"></div>`;

    const q = $('#q');
    q.value = state.query;
    q.addEventListener('input', () => renderList(q.value));
    renderList(q.value);
  }

  const eqCard = (e) => `
    <a class="eq-card" href="#/${encodeURIComponent(e.equipId)}">
      <span class="eq-id">${esc(e.equipId)}</span>
      <span class="eq-main">
        <strong>${esc(e.name)}</strong>
        <span class="eq-sub">${esc(locText(e)) || '設置場所 未登録'}</span>
        <span class="eq-sub">${esc([e.maker, e.model].filter(Boolean).join(' '))}</span>
      </span>
      <span class="chev" aria-hidden="true">›</span>
    </a>`;

  function renderList(query) {
    state.query = query;
    const list = $('#list');
    if (!list) return;
    const terms = norm(query).split(/\s+/).filter(Boolean);
    let html = '';

    if (!terms.length) {
      const recent = getRecent().map(findEquip).filter(Boolean);
      if (recent.length) html += `<h2 class="section">最近見た設備</h2>${recent.map(eqCard).join('')}`;
      html += `<h2 class="section">すべての設備（${state.equipment.length}件）</h2>`;
      html += state.equipment.slice().sort(byId).map(eqCard).join('');
    } else {
      const hits = state.equipment
        .filter((e) => {
          const hay = norm([e.equipId, e.name, locText(e), e.maker, e.model, e.category].join(' '));
          return terms.every((t) => hay.includes(t));
        })
        .sort(byId);
      html = hits.length
        ? `<h2 class="section">検索結果（${hits.length}件）</h2>${hits.map(eqCard).join('')}`
        : `<div class="empty"><p>「${esc(query)}」に一致する設備がありません。</p>
           <p>設備番号の一部（例：CR0）や、設備名の一部で試してください。</p></div>`;
    }
    list.innerHTML = html;
  }

  /* ---------- 設備詳細 ---------- */

  const statusClass = (s) => (/停止/.test(s) ? 's-stop' : /廃止/.test(s) ? 's-off' : 's-run');

  function row(label, value) {
    const v = String(value ?? '').trim();
    return `<div><dt>${esc(label)}</dt><dd>${v ? esc(v) : '—'}</dd></div>`;
  }

  function renderDetail(e) {
    const id = encodeURIComponent(e.equipId);
    const repairs = repairsOf(e.equipId);
    const drawings = Array.isArray(e.drawings) ? e.drawings : [];
    const photos = Array.isArray(e.photos) ? e.photos : [];

    const optional = [
      ['容量', e.capacity],
      ['設置年月', e.installedOn],
      ['製造番号', e.serialNo],
      ['カテゴリ', e.category],
    ].filter(([, v]) => String(v ?? '').trim());

    const latest = repairs[0];

    setChrome({
      title: e.equipId,
      backHref: '#/',
      backText: '一覧',
      actionsHtml: `
        <a class="act" href="#/${id}/drawings">${ICON.drawing}<span>図面</span><span class="act-count">${drawings.length}件</span></a>
        <a class="act" href="#/${id}/repairs">${ICON.repair}<span>修理履歴</span><span class="act-count">${repairs.length}件</span></a>
        <a class="act" href="#/${id}/photos">${ICON.photo}<span>写真</span><span class="act-count">${photos.length}件</span></a>`,
    });

    app.innerHTML = `
      <article class="plate">
        <span class="plate-label">設備番号</span>
        <span class="plate-id">${esc(e.equipId)}</span>
        <span class="plate-label">設備名</span>
        <h2 class="plate-name">${esc(e.name)}</h2>
        ${e.status ? `<span class="status ${statusClass(e.status)}">${esc(e.status)}</span>` : ''}
      </article>

      <section class="card">
        <h3>設備情報</h3>
        <dl class="specs">
          ${row('設置場所', locText(e))}
          ${row('メーカー', e.maker)}
          ${row('型式', e.model)}
          ${optional.map(([l, v]) => row(l, v)).join('')}
        </dl>
      </section>

      ${e.notes ? `<section class="card"><h3>注意事項</h3><p style="margin:0">${esc(e.notes)}</p></section>` : ''}

      ${latest ? `
      <a class="card latest" href="#/${id}/repairs">
        <h3>直近の修理</h3>
        <span class="r-date">${esc(fmtDate(latest.date))}</span>
        <strong>${esc(latest.title)}</strong>
        ${latest.symptom ? `<p>${esc(latest.symptom)}</p>` : ''}
      </a>` : ''}`;
  }

  /* ---------- サブ画面 ---------- */

  function subChrome(e, title) {
    const id = encodeURIComponent(e.equipId);
    setChrome({
      title: `${title}　${e.equipId}`,
      backHref: `#/${id}`,
      backText: e.equipId,
      docTitle: `${title} ${e.equipId} | 設備保全ナビ`,
      actionsHtml: `<a class="act is-wide" href="#/${id}">${e.equipId} の設備情報へ戻る</a>`,
    });
  }

  const emptyBlock = (msg) => `<div class="empty"><p>${esc(msg)}</p></div>`;

  function renderDrawings(e) {
    subChrome(e, '図面');
    const items = Array.isArray(e.drawings) ? e.drawings : [];
    if (!items.length) {
      app.innerHTML = emptyBlock('この設備の図面はまだ登録されていません。');
      return;
    }
    app.innerHTML = items
      .map((d) => {
        const url = fileUrl(d.path);
        const ext = (String(d.path).split('.').pop() || 'FILE').slice(0, 4).toUpperCase();
        const sub = [d.revision ? `版 ${d.revision}` : '', d.updatedAt ? `更新 ${fmtDate(d.updatedAt)}` : '']
          .filter(Boolean).join('　');
        return `
          <a class="doc" ${url ? `href="${url}" target="_blank" rel="noopener"` : 'aria-disabled="true"'}>
            <span class="doc-ico" aria-hidden="true">${esc(ext)}</span>
            <span class="eq-main"><strong>${esc(d.title)}</strong>${sub ? `<span class="eq-sub">${esc(sub)}</span>` : ''}</span>
            <span class="chev" aria-hidden="true">›</span>
          </a>`;
      })
      .join('');
  }

  function renderRepairs(e) {
    subChrome(e, '修理履歴');
    const items = repairsOf(e.equipId);
    if (!items.length) {
      app.innerHTML = emptyBlock('この設備の修理履歴はまだ登録されていません。');
      return;
    }
    app.innerHTML = items
      .map((r, i) => {
        const report = fileUrl(r.reportPath);
        const parts = Array.isArray(r.parts) ? r.parts.join('、') : r.parts;
        const tags = Array.isArray(r.tags) ? r.tags : [];
        return `
          <details class="repair" ${i === 0 ? 'open' : ''}>
            <summary>
              <span class="r-date">${esc(fmtDate(r.date))}</span>
              <strong>${esc(r.title)}</strong>
              ${tags.length ? `<span class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</span>` : ''}
            </summary>
            <dl class="specs">
              ${row('症状', r.symptom)}
              ${row('原因', r.cause)}
              ${row('対策', r.action)}
              ${row('使用部品', parts)}
              ${r.downtimeHours != null ? row('停止時間', `${r.downtimeHours}時間`) : ''}
              ${report ? `<div><dt>報告書</dt><dd><a class="report-link" href="${report}" target="_blank" rel="noopener">報告書を開く</a></dd></div>` : ''}
            </dl>
          </details>`;
      })
      .join('');
  }

  function renderPhotos(e) {
    subChrome(e, '写真');
    const items = Array.isArray(e.photos) ? e.photos : [];
    if (!items.length) {
      app.innerHTML = emptyBlock('この設備の写真はまだ登録されていません。');
      return;
    }
    app.innerHTML = `<div class="photos">${items
      .map((p, i) => {
        const url = fileUrl(p.path);
        const cap = [p.title, p.takenAt ? fmtDate(p.takenAt) : ''].filter(Boolean).join('　');
        return `
          <button class="photo" type="button" data-i="${i}">
            <img src="${url}" alt="${esc(p.title)}" loading="lazy">
            <span>${esc(cap)}</span>
          </button>`;
      })
      .join('')}</div>`;

    app.querySelectorAll('.photo').forEach((btn) =>
      btn.addEventListener('click', () => {
        const p = items[Number(btn.dataset.i)];
        viewerImg.src = fileUrl(p.path);
        viewerImg.alt = p.title || '';
        viewerCap.textContent = [p.title, p.takenAt ? fmtDate(p.takenAt) : ''].filter(Boolean).join('　');
        viewer.hidden = false;
        $('#viewer-close').focus({ preventScroll: true });
      })
    );
  }

  function closeViewer() {
    if (viewer.hidden) return;
    viewer.hidden = true;
    viewerImg.removeAttribute('src');
  }
  $('#viewer-close').addEventListener('click', closeViewer);
  viewer.addEventListener('click', (ev) => { if (ev.target === viewer || ev.target === viewerImg) closeViewer(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeViewer(); });

  /* ---------- エラー・該当なし ---------- */

  function renderLoadError() {
    app.innerHTML = `
      <div class="card notice">
        <h3>設備データを読み込めませんでした</h3>
        <p>通信状況を確認して、もう一度読み込んでください。</p>
        <p class="eq-sub">${esc(state.error)}</p>
        <button id="retry" class="big-btn" type="button">再読み込み</button>
      </div>`;
    $('#retry').addEventListener('click', async () => {
      app.innerHTML = '<p class="loading">設備データを読み込み中…</p>';
      await loadData();
      route();
    });
  }

  function renderNotFound(id) {
    setChrome({ title: '設備が見つかりません', backHref: '#/', backText: '一覧' });
    app.innerHTML = `
      <div class="card notice">
        <h3>設備番号「${esc(id)}」は登録されていません</h3>
        <p>QRコードの汚れや貼り間違いがないか確認し、一覧から探してください。</p>
        <a class="big-btn" href="#/">設備を検索する</a>
      </div>`;
  }

  /* ---------- ルーティング ---------- */

  function parseHash() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map((s) => {
      try { return decodeURIComponent(s); } catch (_) { return s; }
    });
    return { id: parts[0] || '', view: parts[1] || '' };
  }

  function route() {
    closeViewer();
    window.scrollTo(0, 0);
    const { id, view } = parseHash();

    if (state.error && !state.equipment.length) { setChrome({ title: '設備ナビ' }); return renderLoadError(); }
    if (!id) return renderHome();

    const e = findEquip(id);
    if (!e) return renderNotFound(id);
    pushRecent(e.equipId);

    if (view === 'drawings') renderDrawings(e);
    else if (view === 'repairs') renderRepairs(e);
    else if (view === 'photos') renderPhotos(e);
    else renderDetail(e);

    app.focus({ preventScroll: true });
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('online', updateSync);
  window.addEventListener('offline', updateSync);

  /* ---------- 起動 ---------- */

  (async () => {
    await loadData();
    route();
  })();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => { /* 未対応環境では通常のWebとして動作 */ });
    });
  }
})();
