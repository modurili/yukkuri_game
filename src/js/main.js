/* ゆっくり編集地獄 - 画面遷移・編集UI・タイマー・書き出し再生・結果・共有 */
(function () {
  'use strict';
  var D = YG.DATA, Sc = YG.Score, R = YG.Render, A = YG.Audio, Sh = YG.Share, Codec = YG.Codec;
  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var store = {
    // 埋め込み表示などで保存領域が使えない環境もある。その場合は記録せずに遊べるようにする
    ok: (function () { try { localStorage.setItem('yg__t', '1'); localStorage.removeItem('yg__t'); return true; } catch (e) { return false; } })(),
    get: function (k, d) { try { var v = localStorage.getItem('yg_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('yg_' + k, JSON.stringify(v)); } catch (e) { /* 保存できなくても遊べる */ } }
  };

  // お題選択カードの「見本」カット
  var COVERS = {
    fukusen: { shot: 4, fx: 'bigzoom', se: 'don', len: 2, sub: { p: 5 } },
    horror: { shot: 4, fx: 'mono', se: 'zawa', len: 2, sub: { p: 1 } },
    sports: { shot: 4, fx: 'lines', se: 'cheer', len: 2, sub: { p: 0 } },
    emo: { shot: 4, fx: 'slow', se: 'kane', len: 3, sub: { p: 0 } }
  };
  var TAB_KEYS = ['sub', 'fx', 'se', 'len'];
  var AXES = [['tech', '編集技術'], ['tempo', 'テンポ'], ['neta', 'ネタ']];

  var S = {
    screen: 'title', theme: null, edit: null, sel: 0, tab: 'sub',
    timerOn: store.get('timer', true), timeLeft: D.EDIT_SECONDS, paused: false, editing: false, lastTick: 0, warned: {}, lastSecond: null,
    pv: { mode: 'clip', start: 0, tl: null, fired: {} },
    consState: {}, play: null, result: null, lastEdit: null, resultCanvas: null,
    mode: 'normal', shared: null, name: store.get('name', ''), zoom: 1, collapse: {}
  };

  // ---------- 小物 ----------
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') e.textContent = v;
      else if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function announce(t) { var n = $('sr-live'); n.textContent = ''; setTimeout(function () { n.textContent = t; }, 30); }
  var toastTimer = null;
  function toast(t, ms) {
    var n = $('toast'); n.textContent = t; n.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { n.classList.remove('show'); }, ms || 2200);
  }
  function fmt(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function dpr() { return Math.min(2, window.devicePixelRatio || 1); }
  function fitCanvas(cv, maxW) {
    var w = Math.round(Math.min(maxW || 1280, Math.max(160, cv.clientWidth * dpr())));
    var h = Math.round(w * 9 / 16);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    var ctx = cv.getContext('2d');
    ctx.setTransform(w / 640, 0, 0, h / 360, 0, 0);
    return ctx;
  }
  function thumb(cv, theme, clip, opts) {
    var ctx = cv.getContext('2d');
    ctx.setTransform(cv.width / 640, 0, 0, cv.height / 360, 0, 0);
    var shot = theme.shots[clip.shot];
    var p = Math.min(0.97, R.eventP(clip.fx, shot.event) + ((opts && opts.dp) || 0.05));
    R.drawClip(ctx, theme, clip, p, Object.assign({ time: 0.4 }, opts || {}));
  }
  function drawCharas(root) {
    (root || document).querySelectorAll('canvas.chara').forEach(function (cv) {
      var size = cv.clientWidth || 72, r = dpr();
      cv.width = size * r; cv.height = size * r;
      var ctx = cv.getContext('2d'); ctx.setTransform(r, 0, 0, r, 0, 0);
      ctx.clearRect(0, 0, size, size);
      R.drawChara(ctx, cv.dataset.who, size / 2, size * 0.5, size * 0.4, cv.dataset.mood || 'normal', 0);
    });
  }

  // ---------- 字幕の読み上げ（ブラウザ標準の音声合成。日本語の声があればそれを使う） ----------
  var Voice = {
    ok: 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance !== 'undefined',
    say: function (text) {
      if (!Voice.ok || !store.get('voice', false)) return;
      try {
        var u = new SpeechSynthesisUtterance(text);
        u.lang = 'ja-JP'; u.rate = 1.15; u.pitch = 1.3;
        var v = speechSynthesis.getVoices().filter(function (x) { return /^ja/i.test(x.lang); })[0];
        if (v) u.voice = v;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
      } catch (e) { /* 読み上げできなくても続行 */ }
    },
    stop: function () { if (Voice.ok) { try { speechSynthesis.cancel(); } catch (e) { /* 無視 */ } } }
  };

  // ---------- 音 ----------
  function ensureAudio() {
    if (!A.ctx) { A.setSe(store.get('se', true)); A.setBgm(store.get('bgm', true)); }
    if (A.init()) bgmFor(S.screen);
  }
  function bgmFor(screen) {
    if (!A.ctx) return;
    if (screen === 'edit') A.startBgm('edit', S.warned.w10 ? 1.3 : 1);
    else if (screen === 'play') { /* 再生画面は動画側で鳴らす */ }
    else A.startBgm('title');
  }
  function syncToggles() {
    $('btn-bgm').setAttribute('aria-pressed', String(store.get('bgm', true)));
    $('btn-se').setAttribute('aria-pressed', String(store.get('se', true)));
    $('btn-voice').setAttribute('aria-pressed', String(store.get('voice', false)));
    $('btn-voice').hidden = !Voice.ok;
  }

  // ---------- 画面 ----------
  function show(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('is-active', s.id === 'scr-' + id); });
    S.screen = id;
    document.body.classList.toggle('ym-mode', id === 'edit');
    if (id !== 'edit') closeMenu();
    window.scrollTo(0, 0);
    bgmFor(id);
    drawCharas($('scr-' + id));
  }

  // ---------- お題選択 ----------
  function renderThemes() {
    var list = $('theme-list'); clear(list);
    var best = store.get('best', {});
    D.THEMES.forEach(function (th) {
      var cv = el('canvas', { width: 480, height: 270, 'aria-hidden': 'true' });
      var b = best[th.id];
      var card = el('button', { type: 'button', class: 'theme-card', style: '--tc:' + th.color, 'aria-label': 'お題' + th.no + '：' + th.title, onclick: function () { pickTheme(th); } }, [
        cv,
        el('span', { class: 'tc-no', text: 'お題 No.' + th.no }),
        b ? el('span', { class: 'tc-best', text: '自己ベスト ' + b.total + '点' }) : null,
        el('span', { class: 'tc-short', text: th.short }),
        el('span', { class: 'tc-title', text: th.title }),
        el('span', { class: 'tc-cons' }, th.constraints.map(function (c) { return el('span', { text: c.label }); })),
        el('span', { class: 'tc-diff', text: '難しさ ' + '★★★'.slice(0, th.difficulty) + '☆☆☆'.slice(th.difficulty) + '　コンボ ' + comboCount(th).got + '/' + comboCount(th).all + '　素材「' + th.source + '」' })
      ]);
      list.appendChild(card);
      var cover = COVERS[th.id];
      thumb(cv, th, cover, { sub: Sc.resolveSub(th, cover.sub), dp: 0.14 });
    });
    $('opt-timer').checked = S.timerOn;
  }
  function pickTheme(th) {
    A.play('select');
    S.theme = th; S.mode = 'normal';
    clearShareParam();
    renderBrief();
    show('brief');
  }
  function renderBrief() {
    var th = S.theme;
    document.querySelector('.brief').style.setProperty('--tc', th.color);
    $('brief-no').textContent = 'お題 No.' + th.no;
    $('brief-title').textContent = th.title;
    $('brief-desc').textContent = th.brief;
    $('brief-source').textContent = '素材「' + th.source + '」（全' + th.shots.length + 'カット）';
    var strip = $('brief-shots'); clear(strip);
    th.shots.forEach(function (s, i) {
      var cv = el('canvas', { width: 256, height: 144, 'aria-hidden': 'true' });
      strip.appendChild(el('figure', {}, [cv, el('figcaption', { text: (i + 1) + '. ' + s.desc })]));
      thumb(cv, th, { shot: i, fx: 'none', se: 'none', len: 2 }, { noText: true });
    });
    var cons = $('brief-cons'); clear(cons);
    th.constraints.forEach(function (c) { cons.appendChild(el('li', { text: c.label })); });
    $('brief-hint').textContent = th.hint;
    $('brief-warn').hidden = !S.timerOn;
    $('btn-go').textContent = S.timerOn ? '編集スタート（' + D.EDIT_SECONDS + '秒） ▶' : '編集スタート（練習モード） ▶';
  }

  // ---------- 編集（動画編集ソフト風の画面） ----------
  var FPS = 60, LAYERS = 12;
  var LAYER_ROLE = ['映像', '字幕', '映像エフェクト', '効果音'];
  var ROW_TAB = ['len', 'sub', 'fx', 'se'];
  function tc(sec) {
    sec = Math.max(0, sec);
    var h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
    return ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2) + ':' + ('0' + s.toFixed(2)).slice(-5);
  }
  function pxPerSec() { return Math.round((window.innerWidth < 960 ? 52 : 64) * S.zoom * 10) / 10; }

  function startEdit() {
    var th = S.theme;
    S.edit = Sc.newEdit(th);
    S.sel = 0; S.tab = 'sub'; S.timeLeft = D.EDIT_SECONDS; S.paused = false; S.editing = true; S.warned = {}; S.lastSecond = null;
    S.lastTick = performance.now(); S.consState = {};
    S.zoom = S.zoom || 1;
    S.pv = { mode: 'clip', start: performance.now(), tl: null, fired: {}, speed: +$('pv-speed').value || 1, from: 0, seek: 0 };
    $('ed-theme-text').textContent = 'お題No.' + th.no + '「' + th.title + '」';
    $('ed-timer').classList.remove('warn');
    $('ed-timer').classList.toggle('off', !S.timerOn);
    $('pause-overlay').hidden = true; $('order-pop').hidden = true; $('deadline-pop').hidden = true;
    $('btn-export').disabled = false;
    closeMenu();
    var lay = $('ym-layers'); clear(lay);
    for (var i = 0; i < LAYERS; i++) lay.appendChild(el('div', { title: LAYER_ROLE[i] ? 'レイヤー-' + ('0' + i).slice(-2) + '：' + LAYER_ROLE[i] : '' }, ['レイヤー-' + ('0' + i).slice(-2)]));
    var ps = $('serif-preset'); clear(ps);
    ps.appendChild(el('option', { value: '' }, ['（字幕を選ぶ）']));
    D.subsFor(th).forEach(function (s, k) { ps.appendChild(el('option', { value: String(k) }, [s.text])); });
    $('serif-input').value = '';
    show('edit');
    measureHead();
    renderEdit(true);
    updateTimerUI();
    A.play('rec');
    announce('編集開始。' + (S.timerOn ? '制限時間' + D.EDIT_SECONDS + '秒。' : '') + 'お題：' + th.title);
  }

  function curClip() { return S.edit.clips[S.sel]; }
  // スマホではプレビューをタイトルバーの直下に固定するため、その高さを測っておく
  function measureHead() {
    var hd = document.querySelector('.ym-titlebar');
    if (hd) document.documentElement.style.setProperty('--edh', hd.offsetHeight + 'px');
  }

  function changed(kind) {
    S.pv.mode = 'clip'; S.pv.start = performance.now();
    if (kind) A.play(kind);
    renderEdit();
    updatePvButtons();
  }

  // フォーカスを保ったまま再描画する
  function renderEdit(scrollSel) {
    var ae = document.activeElement, key = ae && ae.dataset ? ae.dataset.k : null;
    S.pv.tl = R.buildSegments(S.theme, S.edit);
    renderTimeline(scrollSel);
    renderInspector();
    renderConstraints();
    renderDuration();
    updatePvButtons();
    if (key) { var n = document.querySelector('[data-k="' + key + '"]'); if (n) n.focus({ preventScroll: true }); }
  }

  // タイムラインの配置：残したカットは時間どおりに並べ、カットしたものはその位置に印だけ置く
  function layout() {
    var t = 0, out = [], cutAt = {};
    S.edit.clips.forEach(function (c, i) {
      if (c.keep) { out.push({ i: i, c: c, start: t, len: c.len }); t += c.len; }
      else { var k = cutAt[t] || 0; cutAt[t] = k + 1; out.push({ i: i, c: c, start: t, len: 0, cutIdx: k }); }
    });
    return { items: out, total: t };
  }

  function renderTimeline(scrollSel) {
    var th = S.theme, u = pxPerSec(), lay = layout();
    var sc = $('tl-scroll'), rows = $('tl-cols'), ruler = $('tl-ruler');
    sc.style.setProperty('--u', u + 'px');
    var width = Math.max(lay.total + 4, 10) * u + 40;
    rows.style.width = width + 'px'; ruler.style.width = width + 'px';
    clear(ruler);
    // 時刻ラベル同士が重ならない間隔を選ぶ
    var step = [0.5, 1, 2, 5].filter(function (x) { return x * u >= 76; })[0] || 5;
    for (var x = 0; x * u < width; x += 0.25) {
      if (Math.abs(x / step - Math.round(x / step)) < 1e-6) ruler.appendChild(el('span', { style: 'left:' + (x * u) + 'px' }, [tc(x)]));
      else ruler.appendChild(el('i', { style: 'left:' + (x * u) + 'px' }));
    }
    clear(rows);
    var rowEls = [];
    for (var r = 0; r < LAYERS; r++) {
      var row = el('div', { class: 'ym-lrow', 'data-row': r });
      rowEls.push(row); rows.appendChild(row);
    }
    lay.items.forEach(function (it) {
      var c = it.c, i = it.i, shot = th.shots[c.shot], sel = i === S.sel;
      if (!c.keep) {
        rowEls[0].appendChild(el('button', {
          type: 'button', class: 'ym-item cutmark' + (sel ? ' sel' : ''), 'data-k': 'v' + i,
          style: 'left:' + (it.start * u + it.cutIdx * 20) + 'px;width:18px',
          title: 'カット済み：' + shot.name + '（クリックで選択・非表示を解除できます）',
          'aria-label': (i + 1) + '番目のカット「' + shot.name + '」カット済み' + (sel ? '（選択中）' : ''),
          onclick: function (e) { e.stopPropagation(); selectClip(i, 'len'); }
        }, ['✂']));
        return;
      }
      var left = it.start * u, w = Math.max(6, it.len * u - 1);
      var sub = Sc.resolveSub(th, c.sub);
      var defs = [
        ['v', 'len', '#' + (i + 1) + ' ' + shot.name, false, '映像「' + shot.name + '」' + c.len + '秒'],
        ['s', 'sub', sub ? sub.text : '＋字幕', !sub, '字幕：' + (sub ? sub.text : 'なし')],
        ['f', 'fx', c.fx !== 'none' ? D.FX[c.fx].icon + ' ' + D.FX[c.fx].name : '＋映像エフェクト', c.fx === 'none', '映像エフェクト：' + D.FX[c.fx].name],
        ['a', 'se', c.se !== 'none' ? '🔊 ' + D.SE[c.se].name : '＋効果音', c.se === 'none', '効果音：' + D.SE[c.se].name]
      ];
      defs.forEach(function (d, r) {
        rowEls[r].appendChild(el('button', {
          type: 'button', class: 'ym-item k-' + d[0] + (d[3] ? ' empty' : '') + (sel ? ' sel' : ''), 'data-k': d[0] + i,
          style: 'left:' + left + 'px;width:' + w + 'px', title: d[2],
          'aria-label': (i + 1) + '番目のカットの' + d[4] + (sel ? '（選択中）' : ''),
          onclick: function (e) { e.stopPropagation(); selectClip(i, d[1]); }
        }, [d[2]]));
      });
    });
    rows.appendChild(el('div', { class: 'ym-end', style: 'left:' + (lay.total * u) + 'px', title: '動画の終わり' }));
    $('tl-zoom-v').textContent = (S.zoom * 100).toFixed(1);
    if (scrollSel) {
      var cur = lay.items.filter(function (it) { return it.i === S.sel; })[0];
      if (cur) {
        var l = cur.start * u, rr = l + Math.max(20, cur.len * u);
        if (l < sc.scrollLeft) sc.scrollLeft = Math.max(0, l - 20);
        else if (rr > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = rr - sc.clientWidth + 20;
      }
    }
  }

  function clipAtTime(sec) {
    var lay = layout(), hit = null;
    lay.items.forEach(function (it) { if (it.c.keep && sec >= it.start && sec < it.start + it.len) hit = it; });
    if (!hit) { var kept = lay.items.filter(function (it) { return it.c.keep; }); hit = kept[kept.length - 1] || null; }
    return hit;
  }
  function timeFromEvent(e) {
    var sc = $('tl-scroll'), rect = sc.getBoundingClientRect();
    return Math.max(0, (e.clientX - rect.left + sc.scrollLeft) / pxPerSec());
  }

  function selectClip(i, tab) {
    if (i < 0 || i >= S.edit.clips.length) return;
    var moved = i !== S.sel;
    S.sel = i;
    if (tab) S.tab = tab;
    S.pv.mode = 'clip'; S.pv.start = performance.now();
    if (moved || tab) A.play('click');
    renderEdit(true);
    if (tab) focusGroup(tab, false);
  }
  function focusGroup(tab, focusFirst) {
    S.tab = tab;
    if (S.collapse[tab]) { S.collapse[tab] = false; renderInspector(); }
    document.querySelectorAll('#insp-panel .ym-grp').forEach(function (g) { g.classList.toggle('focus', g.dataset.grp === tab); });
    var g = document.querySelector('#insp-panel .ym-grp[data-grp="' + tab + '"]'), box = $('ym-props');
    if (g && box && window.innerWidth >= 960) box.scrollTop = Math.max(0, g.offsetTop - box.offsetTop - 4);
    if (g && focusFirst) { var f = g.querySelector('[aria-pressed="true"], button, input'); if (f) f.focus(); }
  }

  function subLimit(th) { var c = th.constraints.filter(function (x) { return x.id === 'sub7'; })[0]; return c ? 7 : 0; }

  function grp(key, title, kids) {
    var col = !!S.collapse[key];
    return el('section', { class: 'ym-grp' + (S.tab === key ? ' focus' : '') + (col ? ' collapsed' : ''), 'data-grp': key }, [
      el('h3', { class: 'ym-grp-h' }, [el('button', { type: 'button', class: 'ym-grp-t', 'aria-expanded': String(!col), 'data-grp': key }, [title])]),
      el('div', { class: 'ym-grp-b' }, kids)
    ]);
  }
  function row(label, kids) { return el('div', { class: 'ym-row' }, [el('span', { class: 'ym-l', text: label }), el('div', { class: 'ym-ctl' }, kids)]); }
  function listBtn(key, pressed, icon, name, desc, onclick) {
    return el('button', { type: 'button', 'data-k': key, 'aria-pressed': String(pressed), onclick: onclick }, [
      el('span', { text: icon || '' }), el('span', { text: name }), desc ? el('span', { class: 'd', text: desc }) : el('span')
    ]);
  }

  function renderInspector() {
    var th = S.theme, c = curClip(), shot = th.shots[c.shot], lay = layout();
    var it = lay.items.filter(function (x) { return x.i === S.sel; })[0];
    var cut = $('btn-cut');
    cut.setAttribute('aria-pressed', String(!c.keep));
    cut.textContent = c.keep ? '✂ カット' : '↩ 戻す';
    $('btn-left').disabled = S.sel === 0;
    $('btn-right').disabled = S.sel === S.edit.clips.length - 1;
    var ps = $('serif-preset');
    ps.value = c.sub && typeof c.sub.p === 'number' ? String(c.sub.p) : '';
    $('serif-input').placeholder = 'ここにセリフを入力（#' + (S.sel + 1) + '「' + shot.name + '」の字幕）';

    var panel = $('insp-panel'); clear(panel);
    // 全般
    var lenRange = el('input', { type: 'range', class: 'ym-range', min: '1', max: '3', step: '1', value: String(c.len), 'data-k': 'len-range', 'aria-label': '長さ（秒）' });
    lenRange.addEventListener('input', function () { setLen(+lenRange.value); });
    var segs = el('div', { class: 'ym-segs', role: 'group', 'aria-label': '長さ' }, D.LENS.map(function (n) {
      return el('button', { type: 'button', 'data-k': 'len-' + n, 'aria-pressed': String(c.keep && c.len === n), onclick: function () { setLen(n); } }, [n + '秒']);
    }));
    var tip = th.tempoPref === 'fast' ? '短いカットを畳みかけると有利' : th.tempoPref === 'slow' ? '長めのカットで余韻を作ると有利' : '長さに緩急をつけるとテンポ評価が上がる';
    panel.appendChild(grp('len', '全般', [
      row('対象', [el('span', { class: 'ym-val', style: 'text-align:left', text: '#' + (S.sel + 1) + ' ' + shot.name })]),
      row('フレーム', [el('span', { class: 'ym-val', text: String(Math.round((it ? it.start : 0) * FPS)) })]),
      row('レイヤー', [el('span', { class: 'ym-val', text: '0' })]),
      row('長さ', [el('span', { class: 'ym-val', text: (c.len * FPS) + '（' + c.len + '秒）' }), lenRange]),
      row('', [segs]),
      el('p', { class: 'ym-help-l', text: tip + '（理想の尺 ' + th.ideal[0] + '〜' + th.ideal[1] + '秒）' }),
      row('アイテムの色', [el('span', { class: 'ym-colorbar', style: 'background:' + th.color })]),
      row('備考', [el('span', { class: 'ym-note', text: shot.desc })]),
      row('並び順', [el('span', { class: 'ym-val', text: (S.sel + 1) + ' / ' + S.edit.clips.length }),
        el('button', { type: 'button', class: 'ym-btn', 'data-k': 'len-l', disabled: S.sel === 0, onclick: function () { moveClip(-1); } }, ['⇤ 前へ']),
        el('button', { type: 'button', class: 'ym-btn', 'data-k': 'len-r', disabled: S.sel === S.edit.clips.length - 1, onclick: function () { moveClip(1); } }, ['後ろへ ⇥'])]),
      row('非表示（カット）', [el('button', { type: 'button', class: 'ym-toggle', role: 'switch', 'aria-checked': String(!c.keep), 'aria-label': 'このカットを非表示（カット）にする', 'data-k': 'len-cut', onclick: toggleCut })])
    ]));
    // 字幕
    var lim = subLimit(th);
    var list = el('div', { class: 'ym-list', role: 'group', 'aria-label': '字幕を選ぶ' });
    list.appendChild(listBtn('sub-none', !c.sub, '', '字幕なし', '', function () { setSub(null); }));
    D.subsFor(th).forEach(function (s, k) {
      var n = Sc.charLen(s.text);
      var b = listBtn('sub-' + k, !!(c.sub && c.sub.p === k), '💬', s.text, '', function () { setSub({ p: k }); });
      b.lastChild.replaceWith(el('span', { class: 'cc' + (lim && n > lim ? ' over' : ''), text: n + '字' }));
      list.appendChild(b);
    });
    var cur = c.sub && typeof c.sub.t === 'string' ? c.sub.t : '';
    var input = el('input', { type: 'text', class: 'ym-input', maxlength: String(D.MAX_FREE_CHARS), placeholder: '自由に入力（' + D.MAX_FREE_CHARS + '文字まで）', 'aria-label': '自由入力の字幕', 'data-k': 'sub-free', value: cur });
    var tags = el('div', { class: 'free-tags', 'aria-live': 'polite' });
    function showTags() {
      clear(tags);
      var v = input.value.trim();
      if (!v) { tags.textContent = '内容からジャンルを自動判定します'; return; }
      var tg = Sc.inferTags(v);
      tags.appendChild(document.createTextNode(Sc.charLen(v) + '文字　判定：'));
      if (!tg.length) tags.appendChild(document.createTextNode('ふつうの字幕'));
      tg.forEach(function (t) { tags.appendChild(el('span', { class: 't', text: '#' + D.TAG_LABELS[t] })); });
    }
    function apply() { var v = Codec.cleanText(input.value, D.MAX_FREE_CHARS); setSub(v ? { t: v } : null); }
    input.addEventListener('input', showTags);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); apply(); } });
    showTags();
    panel.appendChild(grp('sub', '字幕（セリフ）', [
      row('セリフ', [list]),
      el('div', { class: 'ym-sub-edit' }, [input, el('button', { type: 'button', class: 'ym-btn', 'data-k': 'sub-apply', onclick: apply }, [cur ? '変更' : '適用']), tags])
    ]));
    // 映像エフェクト
    var fl = el('div', { class: 'ym-list', role: 'group', 'aria-label': '映像エフェクトを選ぶ' });
    D.FX_KEYS.forEach(function (k) { var f = D.FX[k]; fl.appendChild(listBtn('fx-' + k, c.fx === k, k === 'none' ? '' : f.icon, k === 'none' ? 'なし' : f.name, f.desc, function () { setFx(k); })); });
    panel.appendChild(grp('fx', '映像エフェクト', [row('エフェクト', [fl])]));
    // 効果音
    var sl = el('div', { class: 'ym-list', role: 'group', 'aria-label': '効果音を選ぶ' });
    D.SE_KEYS.forEach(function (k) { var s = D.SE[k]; sl.appendChild(listBtn('se-' + k, c.se === k, k === 'none' ? '' : '🔊', k === 'none' ? 'なし' : s.name, s.text, function () { setSe(k); })); });
    panel.appendChild(grp('se', '効果音（音声エフェクト）', [row('効果音', [sl]), el('p', { class: 'ym-help-l', text: 'カットの見せ場の瞬間に鳴ります。選ぶと試聴できます' })]));
  }

  function setSub(v) { var c = curClip(); c.sub = v; if (!c.keep) c.keep = true; changed('select'); }
  function setFx(k) { var c = curClip(); c.fx = k; if (!c.keep) c.keep = true; changed('select'); }
  function setSe(k) { var c = curClip(); c.se = k; if (!c.keep) c.keep = true; changed(null); if (k !== 'none') A.play(k); else A.play('click'); }
  function setLen(n) { var c = curClip(); if (c.len === n && c.keep) return; c.len = n; c.keep = true; changed('select'); }
  function toggleCut() {
    var c = curClip(); c.keep = !c.keep;
    changed('cut');
    announce(c.keep ? 'カットを戻しました' : 'カットを削除しました');
  }
  function moveClip(d) {
    var j = S.sel + d, cl = S.edit.clips;
    if (j < 0 || j >= cl.length) return;
    var tmp = cl[S.sel]; cl[S.sel] = cl[j]; cl[j] = tmp;
    S.sel = j;
    changed('whoosh');
    announce(S.theme.shots[tmp.shot].name + 'を' + (j + 1) + '番目に移動');
  }
  function clearPart(part) {
    var c = curClip();
    if (part === 'sub') c.sub = null; else c[part] = 'none';
    changed('cut');
  }
  // 下のセリフ入力欄：選択中のカットに字幕を付けて、次のカットへ進む（連続入力しやすく）
  function addSerif() {
    var v = Codec.cleanText($('serif-input').value, D.MAX_FREE_CHARS);
    if (!v) { toast('セリフを入力してください'); return; }
    var c = curClip(); c.sub = { t: v }; c.keep = true;
    $('serif-input').value = '';
    var next = S.sel + 1 < S.edit.clips.length ? S.sel + 1 : S.sel;
    S.sel = next;
    changed('select');
    renderTimeline(true);
  }

  function renderConstraints() {
    var lc = Sc.liveCheck(S.theme, S.edit);
    var ul = $('cons-list'); clear(ul);
    var icon = { ok: '✅', ng: '❌', idle: '➖' };
    var stateText = { ok: '達成', ng: '未達成', idle: '未使用' };
    lc.constraints.forEach(function (c) {
      var prev = S.consState[c.id];
      var li = el('li', { class: c.state + (prev && prev !== c.state ? ' flash' : '') }, [
        el('span', { class: 'ic', 'aria-label': stateText[c.state], text: icon[c.state] }),
        el('span', { text: c.label }),
        el('span', { class: 'dt', text: c.detail })
      ]);
      ul.appendChild(li);
      if (prev && prev !== 'ok' && c.state === 'ok') A.play('select', 0.08);
      S.consState[c.id] = c.state;
    });
    var ob = $('order-box');
    if (lc.order) {
      ob.hidden = false; clear(ob);
      ob.classList.toggle('ok', lc.order.state === 'ok');
      ob.appendChild(el('div', { class: 'order-h' }, [el('span', { text: '📞 追加注文' }), el('span', { class: 'new', text: 'NEW' })]));
      ob.appendChild(el('div', {}, [(lc.order.state === 'ok' ? '✅ ' : '❌ ') + lc.order.label]));
      ob.appendChild(el('div', { class: 'small', text: S.theme.order.detail + '（' + lc.order.detail + '）' }));
    } else ob.hidden = true;
    var hint = S.theme.hint;
    if (!lc.st.subs.length && !lc.st.seClips.length) hint = 'まずはカットを選んで、字幕か効果音を付けてみよう。' + hint;
    $('ed-hint').textContent = '💡 ' + hint;
  }
  function renderDuration() {
    var st = Sc.buildStats(S.theme, S.edit);
    var n = $('pv-dur'); clear(n);
    n.appendChild(document.createTextNode('合計 '));
    n.appendChild(el('b', { text: String(st.total) }));
    n.appendChild(document.createTextNode('秒（' + st.count + 'カット）'));
    var seek = $('pv-seek'); seek.max = String(Math.max(1, Math.round(st.total * 100)));
  }
  function updatePvButtons() {
    var playing = S.pv.mode === 'all';
    var b = $('btn-pv-all');
    b.textContent = playing ? '❚❚' : '▶';
    b.setAttribute('aria-label', playing ? '一時停止' : '通しで再生');
    b.setAttribute('aria-pressed', String(playing));
    $('btn-pv-clip').setAttribute('aria-pressed', String(S.pv.mode === 'clip'));
  }
  function pvNow() {
    var tl = S.pv.tl;
    if (S.pv.mode === 'all') return S.pv.from + (performance.now() - S.pv.start) / 1000 * S.pv.speed;
    if (S.pv.mode === 'seek') return S.pv.seek;
    var it = layout().items.filter(function (x) { return x.i === S.sel; })[0];
    return it ? it.start : 0;
  }
  // ▶：再生／一時停止（一時停止するとその位置で止まる）
  function startPreviewAll() {
    if (S.pv.mode === 'all') { S.pv.seek = Math.min(pvNow(), S.pv.tl.total); S.pv.mode = 'seek'; updatePvButtons(); return; }
    var from = S.pv.mode === 'seek' ? S.pv.seek : 0;
    if (from >= S.pv.tl.total - 0.05) from = 0;
    S.pv.mode = 'all'; S.pv.from = from; S.pv.start = performance.now(); S.pv.fired = {};
    updatePvButtons();
  }
  // ■：停止して選択アイテムのループ表示に戻る
  function stopPreview() { S.pv.mode = 'clip'; S.pv.start = performance.now(); updatePvButtons(); }
  function seekTo(sec, selectToo) {
    var tl = S.pv.tl;
    S.pv.mode = 'seek'; S.pv.seek = Math.max(0, Math.min(sec, tl.total));
    updatePvButtons();
    if (selectToo) {
      var hit = clipAtTime(S.pv.seek);
      if (hit && hit.i !== S.sel) { S.sel = hit.i; renderTimeline(); renderInspector(); }
    }
  }

  // ---------- メニュー ----------
  var MENUS = {
    file: function () { return [['動画出力', 'export', '', !S.editing], null, ['お題選択に戻る', 'quit'], ['タイトルへ', 'title']]; },
    edit: function () {
      var c = curClip();
      return [[c.keep ? '選択アイテムを非表示（カット）' : '非表示を解除（カットを戻す）', 'cut', 'X'], ['前へ移動', 'left', '[', S.sel === 0], ['後ろへ移動', 'right', ']', S.sel === S.edit.clips.length - 1], null,
        ['字幕を消去', 'clr-sub', '', !c.sub], ['映像エフェクトを消去', 'clr-fx', '', c.fx === 'none'], ['効果音を消去', 'clr-se', '', c.se === 'none']];
    },
    layout: function () { return [[S.pv.mode === 'all' ? '一時停止' : '再生', 'play', 'P'], ['停止', 'stop'], null, ['タイムラインを拡大', 'zin', '+'], ['タイムラインを縮小', 'zout', '-'], ['選択アイテムを表示', 'reveal']]; },
    tool: function () {
      return [['一時停止（締め切りタイマーも止まる）', 'pause', 'Esc'], null,
        ['BGM：' + (store.get('bgm', true) ? 'オン' : 'オフ'), 'bgm'], ['効果音：' + (store.get('se', true) ? 'オン' : 'オフ'), 'se'], ['字幕の読み上げ：' + (store.get('voice', false) ? 'オン' : 'オフ'), 'voice', '', !Voice.ok]];
    },
    help: function () { return [['操作方法', 'help'], ['お題と制約を確認', 'cons']]; }
  };
  var openMenuKey = null;
  function closeMenu() {
    var pop = $('ym-menu-pop'); if (!pop) return;
    pop.hidden = true; openMenuKey = null;
    document.querySelectorAll('.ym-menu-btn').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
  }
  function openMenu(btn) {
    var key = btn.dataset.menu;
    if (openMenuKey === key) { closeMenu(); return; }
    closeMenu();
    var pop = $('ym-menu-pop'); clear(pop);
    MENUS[key]().forEach(function (m) {
      if (!m) { pop.appendChild(el('hr')); return; }
      pop.appendChild(el('button', { type: 'button', role: 'menuitem', disabled: !!m[3], 'data-act': m[1] }, [el('span', { text: m[0] }), el('span', { class: 'k', text: m[2] || '' })]));
    });
    pop.style.left = btn.offsetLeft + 'px';
    pop.hidden = false; openMenuKey = key;
    btn.setAttribute('aria-expanded', 'true');
    var first = pop.querySelector('button:not([disabled])'); if (first) first.focus();
  }
  function menuAction(act) {
    closeMenu();
    var leave = function (to) {
      if (S.editing && !window.confirm('編集中の内容は失われます。よろしいですか？')) return;
      S.editing = false; S.paused = false; $('pause-overlay').hidden = true;
      if (to === 'title') show('title'); else { renderThemes(); show('select'); }
    };
    switch (act) {
      case 'export': exportVideo(); break;
      case 'quit': leave('select'); break;
      case 'title': leave('title'); break;
      case 'cut': toggleCut(); break;
      case 'left': moveClip(-1); break;
      case 'right': moveClip(1); break;
      case 'clr-sub': clearPart('sub'); break;
      case 'clr-fx': clearPart('fx'); break;
      case 'clr-se': clearPart('se'); break;
      case 'play': startPreviewAll(); break;
      case 'stop': stopPreview(); break;
      case 'zin': zoomBy(1.25); break;
      case 'zout': zoomBy(0.8); break;
      case 'reveal': renderTimeline(true); break;
      case 'pause': setPaused(true); break;
      case 'bgm': $('btn-bgm').click(); break;
      case 'se': $('btn-se').click(); break;
      case 'voice': $('btn-voice').click(); break;
      case 'help': $('help-modal').hidden = false; $('btn-help-close').focus(); break;
      case 'cons': S.collapse.cons = false; $('ym-props').scrollTop = 0; document.querySelector('#grp-cons .ym-grp-t').focus(); break;
    }
  }
  function zoomBy(f) { S.zoom = Math.max(0.4, Math.min(3, S.zoom * f)); renderTimeline(true); }

  // ---------- タイマー ----------
  function updateTimerUI() {
    if (!S.timerOn) { $('ed-time').textContent = '練習'; $('ed-timebar-fill').style.width = '100%'; return; }
    $('ed-time').textContent = fmt(S.timeLeft);
    $('ed-timebar-fill').style.width = (100 * S.timeLeft / D.EDIT_SECONDS) + '%';
  }
  function tickTimer(now) {
    var dt = Math.min(0.25, (now - S.lastTick) / 1000);
    S.lastTick = now;
    if (!S.editing || S.paused || !S.timerOn) return;
    S.timeLeft -= dt;
    if (S.theme.order && !S.edit.order && S.timeLeft <= D.ORDER_AT) issueOrder();
    if (S.timeLeft <= 30 && !S.warned.w30) { S.warned.w30 = true; announce('残り30秒'); }
    if (S.timeLeft <= 10 && !S.warned.w10) {
      S.warned.w10 = true; $('ed-timer').classList.add('warn'); A.setBgmSpeed(1.3); A.play('alarm'); announce('残り10秒！');
    }
    var sec = Math.ceil(S.timeLeft);
    if (S.timeLeft <= 10 && sec !== S.lastSecond && sec > 0) A.play('tick');
    S.lastSecond = sec;
    if (S.timeLeft <= 0) { S.timeLeft = 0; updateTimerUI(); deadline(); return; }
    updateTimerUI();
  }
  function issueOrder() {
    S.edit.order = true;
    $('order-pop-text').textContent = '「' + S.theme.order.label + '」';
    $('order-pop').hidden = false;
    A.play('phone');
    announce('クライアントから追加注文：' + S.theme.order.label + '。' + S.theme.order.detail);
    setTimeout(function () { $('order-pop').hidden = true; }, 2300);
    renderConstraints();
  }
  function deadline() {
    S.editing = false;
    S.edit.timeout = true;
    $('btn-export').disabled = true;
    $('deadline-pop').hidden = false;
    A.stopBgm(); A.play('buzzer');
    announce('締め切り！強制的に書き出します');
    setTimeout(function () { $('deadline-pop').hidden = true; exportVideo(); }, 1300);
  }
  function setPaused(p) {
    if (!S.editing) return;
    S.paused = p;
    $('pause-overlay').hidden = !p;
    if (p) { A.stopBgm(); $('btn-resume').focus(); }
    else { S.lastTick = performance.now(); bgmFor('edit'); $('btn-pause').focus(); }
  }
  function exportVideo() {
    if (S.screen !== 'edit') return;
    S.editing = false;
    $('btn-export').disabled = true;
    S.lastEdit = JSON.parse(JSON.stringify(S.edit));
    startPlayback(S.lastEdit);
  }

  // ---------- 書き出し再生（視聴者コメント付き） ----------
  var INTRO = 1.0, OUTRO = 1.8;
  function startPlayback(edit) {
    var th = S.theme;
    var res = Sc.evaluate(th, edit);
    S.result = res;
    var tl = R.buildSegments(th, edit);
    var sched = [];
    res.comments.start.forEach(function (t, k) { sched.push({ at: 0.1 + k * 0.45, text: t }); });
    tl.segs.forEach(function (s, i) {
      var list = res.comments.clips[i] || [];
      var spTexts = [];
      res.specials.forEach(function (sp) { if (sp.clip === i) spTexts = spTexts.concat(sp.comments); });
      list.forEach(function (t, k) { sched.push({ at: s.start + s.len * (0.15 + 0.8 * (k + 0.5) / list.length), text: t, sp: spTexts.indexOf(t) >= 0 }); });
    });
    if (!tl.segs.length) res.comments.clips = [];
    res.comments.end.forEach(function (t, k) { sched.push({ at: tl.total + 0.05 + k * 0.32, text: t, sp: k === 0 && res.specials.some(function (s) { return s.clip < 0; }) }); });
    sched.sort(function (a, b) { return a.at - b.at; });
    S.play = { tl: tl, t0: performance.now(), sched: sched, si: 0, fired: {}, lanes: [], done: false, total: Math.max(tl.total, tl.segs.length ? 0 : 2) };
    clear($('danmaku'));
    $('play-title').textContent = th.short + (S.mode === 'shared' && S.shared && S.shared.name ? '（編集：' + S.shared.name + '）' : '');
    $('play-rec').textContent = '● 書き出し中';
    $('play-progress').style.width = '0';
    $('play-views').textContent = '';
    setPlayOverlay('書き出し中…', 0);
    A.stopBgm();
    show('play');
    A.play('whoosh');
  }
  function setPlayOverlay(text, prog) {
    var o = $('play-overlay'); clear(o);
    if (text == null) return;
    var bar = el('div', { class: 'bar' }, [el('i', { style: 'width:' + Math.round(prog * 100) + '%' })]);
    o.appendChild(el('div', { class: 'po' }, [text, prog != null ? bar : null]));
  }
  function spawnComment(c) {
    var box = $('danmaku'), P = S.play;
    var wBox = box.clientWidth, hBox = box.clientHeight;
    var lanes = 7, now = performance.now(), best = 0, bestT = Infinity;
    for (var i = 0; i < lanes; i++) { var lt = P.lanes[i] || 0; if (lt < bestT) { bestT = lt; best = i; } }
    P.lanes[best] = now;
    var d = el('div', { class: 'dm' + (c.sp ? ' sp' : '') }, [c.text]);
    d.style.top = (4 + best * (hBox * 0.115)) + 'px';
    box.appendChild(d);
    var w = d.offsetWidth;
    var dur = reduceMotion ? 6500 : 4300;
    if (d.animate) {
      var an = d.animate([{ transform: 'translateX(' + wBox + 'px)' }, { transform: 'translateX(' + (-w - 20) + 'px)' }], { duration: dur, easing: 'linear' });
      an.onfinish = function () { d.remove(); };
    } else { d.style.transform = 'translateX(0)'; setTimeout(function () { d.remove(); }, 3000); }
  }
  function drawPlay(now) {
    var P = S.play, th = S.theme, cv = $('cv-play');
    var ctx = fitCanvas(cv, 1280);
    var el2 = (now - P.t0) / 1000, time = now / 1000;
    if (el2 < INTRO) {
      if (P.tl.segs.length) R.drawClip(ctx, th, P.tl.segs[0].clip, 0, { time: 0, noText: true, noPop: true }); else R.drawEmpty(ctx, time);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, 640, 360);
      setPlayOverlay('書き出し中…', el2 / INTRO);
      return;
    }
    var sec = el2 - INTRO;
    if (!P.started) {
      P.started = true; setPlayOverlay(null);
      $('play-rec').textContent = '▶ 再生中';
      if (A.ctx) A.startBgm(th.id);
    }
    var total = P.tl.total;
    if (P.tl.segs.length) {
      var cur = R.drawTimeline(ctx, th, P.tl, Math.min(sec, total - 0.001), time);
      if (cur && sec < total && P.lastSeg !== cur.seg.index) { P.lastSeg = cur.seg.index; if (cur.seg.sub) Voice.say(cur.seg.sub.text); }
    } else R.drawEmpty(ctx, time);
    // 効果音：見せ場の瞬間に鳴らす
    P.tl.segs.forEach(function (s, i) {
      if (s.clip.se === 'none' || P.fired[i]) return;
      if (sec >= s.start + s.pe * s.len) { P.fired[i] = true; A.play(s.clip.se); }
    });
    while (P.si < P.sched.length && P.sched[P.si].at <= sec) { spawnComment(P.sched[P.si]); P.si++; }
    var prog = Math.min(1, sec / Math.max(0.01, P.total));
    $('play-progress').style.width = (prog * 100) + '%';
    $('play-time').textContent = Sh.fmtTime(Math.min(sec, total)) + ' / ' + Sh.fmtTime(total);
    var v = Math.round(S.result.views * 0.65 * prog * prog);
    $('play-views').textContent = '▶ ' + Sc.formatViews(v);
    if (sec >= P.total) {
      if (!P.outroAt) { P.outroAt = now; $('play-rec').textContent = '■ 投稿完了'; A.stopBgm(); }
      ctx.fillStyle = 'rgba(0,0,0,' + Math.min(0.6, (now - P.outroAt) / 1000) + ')'; ctx.fillRect(0, 0, 640, 360);
      setPlayOverlay('視聴者の反応を集計中…', Math.min(1, (now - P.outroAt) / 1000 / OUTRO));
      if ((now - P.outroAt) / 1000 > OUTRO && !P.done) { P.done = true; goResult(); }
    }
  }

  // ---------- 結果 ----------
  function goResult() {
    Voice.stop();
    if (S.play) S.play.done = true;
    S.play = null;
    A.stopBgm();
    show('result');
    renderResult();
  }
  function rankColor(r) { return { S: '#ffd23f', A: '#ff8a3d', B: '#59b8ff', C: '#5fcf78', D: '#b49bff', E: '#8f8aa8' }[r] || '#fff'; }

  function renderResult() {
    var res = S.result, th = S.theme, shared = S.mode === 'shared';
    var note = $('res-shared-note');
    note.hidden = !shared;
    if (shared) note.textContent = '📩 ' + (S.shared.name ? '「' + S.shared.name + '」さん' : '誰か') + 'の編集です。同じお題に挑戦して点数で勝負しよう！';
    $('btn-retry').textContent = shared ? 'このお題に挑戦する ▶' : 'もう一度（同じお題）';

    var rk = $('res-rank'); rk.textContent = res.rank; rk.style.background = rankColor(res.rank); rk.classList.remove('show');
    $('res-ranklabel').textContent = res.rankLabel;
    var tt = $('res-title'); tt.textContent = '『' + res.title.name + '』'; tt.classList.remove('show');
    $('res-title-desc').textContent = res.title.desc;
    var bd = $('res-badges'); clear(bd);
    res.badges.forEach(function (b) { bd.appendChild(el('span', { title: b.desc, text: '🏅 ' + b.name })); });

    // 自己ベスト
    var bestEl = $('res-best'); bestEl.hidden = true;
    if (!shared && store.ok) {
      var best = store.get('best', {});
      var prev = best[th.id];
      if (!prev || res.total > prev.total) {
        best[th.id] = { total: res.total, title: res.title.name };
        store.set('best', best);
        if (prev) bestEl.hidden = false;
      }
    }

    // 図鑑（コンボと称号の発見記録）
    var newCombos = [], newTitle = false;
    if (!shared && store.ok) {
      var dex = store.get('combos', {}), got = dex[th.id] || [];
      res.specials.forEach(function (sp) { if (got.indexOf(sp.id) < 0) { got.push(sp.id); newCombos.push(sp.id); } });
      dex[th.id] = got; store.set('combos', dex);
      var tids = store.get('titles', []), tkey = titleKey(res.title, th);
      if (tids.indexOf(tkey) < 0) { tids.push(tkey); store.set('titles', tids); newTitle = true; }
    }
    $('res-title-new').hidden = !newTitle;
    if (newCombos.length) setTimeout(function () { toast('★ 新しいコンボを' + newCombos.length + '個発見！', 2600); }, reduceMotion ? 0 : 2400);

    // メーター
    var m = $('res-meters'); clear(m);
    var bars = [];
    AXES.forEach(function (a) {
      var i = el('i');
      bars.push([i, res.scores[a[0]]]);
      m.appendChild(el('div', { class: 'meter ' + a[0] }, [el('span', { text: a[1] }), el('div', { class: 'bar', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(res.scores[a[0]]), 'aria-label': a[1] }, [i]), el('span', { class: 'v', text: String(res.scores[a[0]]) })]));
    });
    var hi = el('i'); bars.push([hi, res.scores.hell]);
    m.appendChild(el('div', { class: 'meter hell' }, [el('span', { text: '🔥 地獄度' }), el('div', { class: 'bar', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(res.scores.hell), 'aria-label': '地獄度' }, [hi]), el('span', { class: 'v', text: String(res.scores.hell) })]));
    m.appendChild(el('div', { class: 'views-row' }, [
      el('span', {}, ['▶ ' + res.viewsLabel, res.burning ? el('span', { class: 'burn', text: '炎上中' }) : null]),
      el('span', { class: 'like ' + (res.likeRate >= 60 ? 'good' : 'bad'), text: '👍 高評価 ' + res.likeRate + '%' })
    ]));
    requestAnimationFrame(function () { requestAnimationFrame(function () { bars.forEach(function (b) { b[0].style.width = b[1] + '%'; }); }); });

    // スコアのカウントアップ → ランク判子 → 称号
    var totalEl = $('res-total'), t0 = performance.now(), dur = reduceMotion ? 1 : 1000, lastN = -1;
    (function count() {
      var k = Math.min(1, (performance.now() - t0) / dur), n = Math.round(res.total * (1 - Math.pow(1 - k, 3)));
      totalEl.textContent = String(n);
      if (n !== lastN && n % 3 === 0) A.play('count');
      lastN = n;
      if (k < 1 && S.screen === 'result') requestAnimationFrame(count);
    })();
    setTimeout(function () { rk.classList.add('show'); A.play('stamp'); }, reduceMotion ? 0 : 1050);
    setTimeout(function () { tt.classList.add('show'); A.play(res.total >= 60 || res.scores.hell >= 60 ? 'fanfare' : 'sad'); }, reduceMotion ? 0 : 1500);

    // 掛け合い
    var talk = $('res-talk'); clear(talk);
    res.tsukkomi.forEach(function (ln, i) {
      var cv = el('canvas', { class: 'chara', 'data-who': ln.who, 'data-mood': ln.mood, width: 72, height: 72, 'aria-hidden': 'true' });
      var row = el('div', { class: 'talk-row' + (ln.who === 'anko' ? '' : ' rev') }, [cv, el('p', { class: 'bubble' }, [el('b', { text: D.CHARAS[ln.who].name }), ln.text])]);
      talk.appendChild(row);
      setTimeout(function () { row.classList.add('show'); }, reduceMotion ? 0 : 2000 + i * 700);
    });
    drawCharas(talk);

    // 内訳
    var cmb = $('res-combos'); clear(cmb);
    if (res.specials.length) res.specials.forEach(function (sp) {
      cmb.appendChild(el('div', { class: 'combo' }, [el('b', {}, ['★ ' + sp.name, newCombos.indexOf(sp.id) >= 0 ? el('em', { class: 'new', text: 'NEW' }) : null]), el('span', { text: sp.desc })]));
    });
    else cmb.appendChild(el('div', { class: 'combo none', text: '★コンボは見つからなかった。素材×字幕×演出の組み合わせを探そう' }));
    renderDex(th, shared ? [] : res.specials.map(function (sp) { return sp.id; }));
    var cols = $('reason-cols'); clear(cols);
    AXES.forEach(function (a) {
      var items = res.reasons.filter(function (r) { return r.axis === a[0]; });
      var ul = el('ul');
      items.forEach(function (r) {
        ul.appendChild(el('li', { class: r.pts > 0 ? 'plus' : r.pts < 0 ? 'minus' : 'zero' }, [
          el('span', { class: 'p', text: (r.pts > 0 ? '+' : '') + r.pts }),
          el('span', {}, [r.text, r.detail ? el('span', { class: 'd', text: r.detail }) : null])
        ]));
      });
      cols.appendChild(el('div', { class: 'reason-col ' + a[0] }, [
        el('h4', {}, [el('span', { text: a[1] }), el('span', { text: res.scores[a[0]] + '点' })]),
        el('div', { class: 'base', text: res.stats.count ? '基礎点 ' + Sc.BASE[a[0]] + '（0〜100に収める）　重み ' + Math.round(th.weights[a[0]] * 100) + '%' : '' }),
        ul
      ]));
    });
    var hd = $('hell-detail'); clear(hd);
    hd.textContent = res.hellParts.length ? '🔥 地獄度の内訳：' + res.hellParts.map(function (p) { return p.text + '(+' + p.pts + ')'; }).join('、') + '　※地獄度は総合点には入らず、再生数（炎上）に影響します' : '🔥 地獄度 0：とても健全な編集です。';

    $('inp-name').value = S.name;
    var hasLink = !!shareLink();
    $('btn-copy').textContent = hasLink ? '🔗 再現リンクをコピー' : '🔑 再現コードをコピー';
    $('share-note').textContent = hasLink
      ? 'ポストには「再現リンク」が付きます。開くと同じお題・同じ編集が再生され、そのまま挑戦できます。保存した画像を添付すると伝わりやすいよ。'
      : 'いまは公開URLのない環境（ファイルを直接開いている等）なので、ポストにリンクは付きません。「再現コード」を送れば、相手はタイトル画面の「再現コードで再生」から同じ編集を見られます。';
    $('btn-share-img').hidden = !canShareFiles();
    setTimeout(makeImage, 60);
    announce('結果：' + res.total + '点、ランク' + res.rank + '、称号「' + res.title.name + '」');
  }

  function titleKey(t, th) { return t.id === 'legend' ? 'legend:' + th.id : t.id; }
  function comboList(th) { return th.specials.concat(D.GENERIC_SPECIALS); }
  function comboCount(th) {
    var got = store.get('combos', {})[th.id] || [];
    return { got: comboList(th).filter(function (sp) { return got.indexOf(sp.id) >= 0; }).length, all: comboList(th).length };
  }
  // 見つけたコンボは名前、未発見はぼかしたヒントだけ見せる
  function renderDex(th, now) {
    var box = $('res-dex'); clear(box);
    var got = (store.get('combos', {})[th.id] || []).concat(now || []);
    var cc = { got: comboList(th).filter(function (sp) { return got.indexOf(sp.id) >= 0; }).length, all: comboList(th).length };
    box.appendChild(el('h4', {}, [el('span', { text: '📖 コンボ図鑑（このお題）' }), el('span', { text: cc.got + ' / ' + cc.all })]));
    var ul = el('ul', { class: 'dex-list' });
    comboList(th).forEach(function (sp) {
      var has = got.indexOf(sp.id) >= 0;
      ul.appendChild(el('li', { class: has ? 'got' : '' }, has ? [el('b', { text: '★ ' + sp.name }), el('span', { text: sp.desc })] : [el('b', { text: '？？？' }), el('span', { text: 'ヒント：' + sp.hint })]));
    });
    box.appendChild(ul);
    var tids = store.get('titles', []);
    box.appendChild(el('p', { class: 'small', text: store.ok ? '🏅 これまでに獲得した称号：' + tids.length + ' / ' + (D.TITLES.length - 1 + D.THEMES.length) : '※この環境ではブラウザに記録を保存できないため、図鑑・自己ベストは今回の結果だけ表示しています' }));
  }

  function currentEdit() { return S.mode === 'shared' ? S.shared.edit : S.lastEdit; }
  function makeImage() {
    var name = S.mode === 'shared' ? S.shared.name : S.name;
    var cv = Sh.makeResultImage(S.theme, currentEdit(), S.result, { name: name });
    S.resultCanvas = cv;
    try { $('res-image').src = cv.toDataURL('image/png'); } catch (e) { /* 何もしない */ }
    $('res-image').alt = '結果画像：' + S.theme.short + '、' + S.result.total + '点、称号「' + S.result.title.name + '」';
  }
  function shareName() { return S.mode === 'shared' ? S.shared.name : S.name; }
  // 公開URLで開いているときは再現リンク、ファイルを直接開いているときなどは null（代わりに再現コードを使う）
  function shareLink() { return Sh.shareUrl(currentEdit(), shareName()); }
  function shareCode() { return Codec.encode(currentEdit(), shareName()); }
  function canShareFiles() {
    try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [new File([new Blob(['x'])], 'x.png', { type: 'image/png' })] })); } catch (e) { return false; }
  }
  function saveImage() {
    if (!S.resultCanvas) return;
    Sh.canvasToBlob(S.resultCanvas).then(function (blob) {
      if (!blob) { openImgModal(); return; }
      var url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: Sh.fileName() });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast('画像を保存しました');
      if (/iPhone|iPad|iPod/.test(navigator.userAgent)) setTimeout(openImgModal, 400);
    });
  }
  function openImgModal() {
    $('img-modal-img').src = $('res-image').src;
    $('img-modal').hidden = false;
    $('btn-img-close').focus();
  }
  function shareImage() {
    Sh.canvasToBlob(S.resultCanvas).then(function (blob) {
      if (!blob) return;
      var file = new File([blob], Sh.fileName(), { type: 'image/png' });
      var link = shareLink();
      navigator.share({ files: [file], text: Sh.postText(S.theme, S.result) + '\n' + (link || '再現コード：' + shareCode()) }).catch(function () { /* キャンセル */ });
    });
  }
  function postToX() {
    // window.open の noopener 指定は戻り値が常に null になるため、リンクのクリックで新しいタブを開く
    var a = el('a', { href: Sh.intentUrl(Sh.postText(S.theme, S.result), shareLink()), target: '_blank', rel: 'noopener noreferrer' });
    document.body.appendChild(a); a.click(); a.remove();
  }
  function copyShare() {
    var link = shareLink();
    if (link) copyText(link, '再現リンクをコピーしました');
    else copyText(shareCode(), '再現コードをコピーしました。タイトル画面の「再現コードで再生」に貼り付けると同じ編集が見られます');
  }
  function copyText(text, msg) {
    var done = function () { toast(msg, 3200); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    else fallbackCopy(text, done);
  }
  // クリップボードが使えない環境（埋め込み表示など）では、選択済みのテキストを見せて手でコピーしてもらう
  function fallbackCopy(text, done) {
    var ta = el('textarea', { style: 'position:fixed;left:-9999px' }); ta.value = text;
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    if (ok) { done(); return; }
    $('copy-modal-text').value = text;
    $('copy-modal').hidden = false;
    $('copy-modal-text').focus(); $('copy-modal-text').select();
  }

  // ---------- 共有リンクから来た場合 ----------
  function clearShareParam() {
    if (location.search.indexOf('r=') >= 0 && history.replaceState) history.replaceState(null, '', location.pathname + location.hash);
  }
  function openShared(code) {
    var d = Codec.decode(code);
    if (!d) { toast('再現コード（リンク）が壊れているみたい…タイトルから遊んでね', 3500); return false; }
    S.mode = 'shared';
    S.theme = D.getTheme(d.edit.themeId);
    S.shared = d;
    $('shared-theme').textContent = S.theme.title;
    $('shared-by').textContent = '編集：' + (d.name || '名無しの編集者') + (d.edit.timeout ? '（締め切りオーバー）' : '');
    var res = Sc.evaluate(S.theme, d.edit), tl = R.buildSegments(S.theme, d.edit);
    var cv = $('cv-shared'), ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (res.thumbClip >= 0) { var s = tl.segs[res.thumbClip]; R.drawClip(ctx, S.theme, s.clip, Math.min(0.97, s.pe + 0.13), { time: 0.6, sub: s.sub }); }
    else R.drawEmpty(ctx, 0);
    show('shared');
    return true;
  }

  // ---------- 毎フレーム ----------
  var lastStatus = '';
  function drawPreview(now) {
    var cv = $('cv-preview'), ctx = fitCanvas(cv, 1280), th = S.theme, time = now / 1000;
    var tl = S.pv.tl || (S.pv.tl = R.buildSegments(th, S.edit));
    var ph = $('tl-playhead'), lb = $('pv-label'), u = pxPerSec(), sec = 0;
    lb.className = 'stage-label';
    if (S.pv.mode === 'all') {
      sec = S.pv.from + (now - S.pv.start) / 1000 * S.pv.speed;
      if (!tl.segs.length) {
        R.drawEmpty(ctx, time);
        if (now - S.pv.start > 1500) stopPreview();
      } else if (sec >= tl.total) {
        S.pv.seek = tl.total; S.pv.mode = 'seek'; updatePvButtons(); sec = tl.total;
        R.drawTimeline(ctx, th, tl, tl.total - 0.001, time);
      } else {
        R.drawTimeline(ctx, th, tl, sec, time);
        tl.segs.forEach(function (s, i) {
          var ev = s.start + s.pe * s.len;
          if (s.clip.se !== 'none' && !S.pv.fired[i] && sec >= ev && ev >= S.pv.from) { S.pv.fired[i] = true; A.play(s.clip.se); }
        });
      }
      lb.textContent = '▶ 再生中';
    } else if (S.pv.mode === 'seek') {
      sec = S.pv.seek;
      if (tl.segs.length) R.drawTimeline(ctx, th, tl, Math.min(sec, tl.total - 0.001), time); else R.drawEmpty(ctx, time);
      lb.textContent = '❚❚ 停止中';
    } else {
      var c = curClip();
      var p = (((now - S.pv.start) / 1000) % c.len) / c.len;
      R.drawClip(ctx, th, c, p, { time: time, sub: Sc.resolveSub(th, c.sub) });
      var it = layout().items.filter(function (x) { return x.i === S.sel; })[0];
      sec = it ? it.start + (c.keep ? p * c.len : 0) : 0;
      if (!c.keep) {
        ctx.fillStyle = 'rgba(10,5,20,0.6)'; ctx.fillRect(0, 0, 640, 360);
        lb.className = 'stage-label cut'; lb.textContent = '✂ 非表示（カット済み・出力されません）';
      } else lb.textContent = '#' + (S.sel + 1) + ' ' + th.shots[c.shot].name + '（' + c.len + '秒ループ）';
    }
    ph.style.display = 'block'; ph.style.left = (sec * u) + 'px';
    var seek = $('pv-seek');
    if (document.activeElement !== seek) seek.value = String(Math.round(sec * 100));
    var st = tc(sec) + ' / ' + tc(tl.total) + '　　' + Math.round(sec * FPS) + ' / ' + Math.round(tl.total * FPS) + '　　1280x720 60fps 48000Hz　　選択：#' + (S.sel + 1) + ' ' + th.shots[curClip().shot].name + '　　お題No.' + th.no + '「' + th.short + '」';
    if (st !== lastStatus) { $('ym-status').textContent = st; lastStatus = st; }
    var lv = A.level ? A.level() : 0;
    $('meter-l').style.height = (lv * 100) + '%';
    $('meter-r').style.height = (lv * 96) + '%';
  }
  function frame(now) {
    try {
      if (S.screen === 'edit' && S.edit) { tickTimer(now); if (!S.paused) drawPreview(now); }
      else if (S.screen === 'play' && S.play && !S.play.done) drawPlay(now);
    } catch (e) { if (window.console) console.error(e); }
    requestAnimationFrame(frame);
  }

  // ---------- イベント ----------
  function bind() {
    document.addEventListener('pointerdown', ensureAudio, { passive: true });
    document.addEventListener('keydown', ensureAudio);
    $('btn-home').addEventListener('click', function () {
      if (S.screen === 'edit' && S.editing && !window.confirm('編集中の内容は失われます。タイトルに戻りますか？')) return;
      S.editing = false; S.play = null; S.mode = 'normal'; clearShareParam(); Voice.stop();
      show('title');
    });
    $('btn-bgm').addEventListener('click', function () { var v = !store.get('bgm', true); store.set('bgm', v); A.setBgm(v); syncToggles(); if (v) bgmFor(S.screen); });
    $('btn-se').addEventListener('click', function () { var v = !store.get('se', true); store.set('se', v); A.setSe(v); syncToggles(); });
    $('btn-voice').addEventListener('click', function () {
      var v = !store.get('voice', false); store.set('voice', v); syncToggles();
      if (v) { Voice.say('字幕を読み上げるよ'); toast('書き出した動画の字幕を読み上げます'); } else Voice.stop();
    });
    $('btn-start').addEventListener('click', function () { A.play('select'); renderThemes(); show('select'); });
    $('opt-timer').addEventListener('change', function (e) { S.timerOn = e.target.checked; store.set('timer', S.timerOn); });
    $('btn-random').addEventListener('click', function () { pickTheme(D.THEMES[Math.floor(Math.random() * D.THEMES.length)]); });
    $('btn-go').addEventListener('click', startEdit);
    $('btn-back-select').addEventListener('click', function () { renderThemes(); show('select'); });

    $('btn-export').addEventListener('click', exportVideo);
    $('btn-pause').addEventListener('click', function () { setPaused(true); });
    $('btn-resume').addEventListener('click', function () { setPaused(false); });
    $('btn-quit').addEventListener('click', function () { S.paused = false; S.editing = false; $('pause-overlay').hidden = true; renderThemes(); show('select'); });
    $('btn-pv-clip').addEventListener('click', stopPreview);
    $('btn-pv-all').addEventListener('click', startPreviewAll);
    $('pv-speed').addEventListener('change', function (e) {
      var now = pvNow(); S.pv.speed = +e.target.value || 1;
      if (S.pv.mode === 'all') { S.pv.from = now; S.pv.start = performance.now(); }
    });
    $('pv-seek').addEventListener('input', function (e) { seekTo(+e.target.value / 100, true); });
    $('vol').value = String(store.get('vol', 100));
    var setVol = function () { var v = +$('vol').value; $('vol-v').textContent = v.toFixed(1) + ' %'; store.set('vol', v); if (A.setVolume) A.setVolume(v / 100); };
    $('vol').addEventListener('input', setVol); setVol();
    $('tl-ruler').addEventListener('click', function (e) { seekTo(timeFromEvent(e), true); });
    $('tl-cols').addEventListener('click', function (e) {
      var rowEl = e.target.closest('.ym-lrow'); if (!rowEl || e.target.closest('.ym-item')) return;
      var hit = clipAtTime(timeFromEvent(e));
      if (hit) selectClip(hit.i, ROW_TAB[+rowEl.dataset.row] || null);
    });
    $('btn-zoom-in').addEventListener('click', function () { zoomBy(1.25); });
    $('btn-zoom-out').addEventListener('click', function () { zoomBy(0.8); });
    $('serif-add').addEventListener('click', addSerif);
    $('serif-input').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addSerif(); } });
    $('serif-preset').addEventListener('change', function (e) { if (e.target.value !== '') setSub({ p: +e.target.value }); });
    $('ym-props').addEventListener('click', function (e) {
      var t = e.target.closest('.ym-grp-t'); if (!t) return;
      var k = t.dataset.grp; S.collapse[k] = !S.collapse[k];
      t.setAttribute('aria-expanded', String(!S.collapse[k]));
      t.closest('.ym-grp').classList.toggle('collapsed', !!S.collapse[k]);
    });
    document.querySelectorAll('.ym-menu-btn').forEach(function (b) { b.addEventListener('click', function () { openMenu(b); }); });
    $('ym-menu-pop').addEventListener('click', function (e) { var b = e.target.closest('button[data-act]'); if (b && !b.disabled) menuAction(b.dataset.act); });
    $('ym-menu-pop').addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call(this.querySelectorAll('button:not([disabled])'));
      var i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); var k = openMenuKey; closeMenu(); var mb = document.querySelector('.ym-menu-btn[data-menu="' + k + '"]'); if (mb) mb.focus(); }
    });
    document.addEventListener('pointerdown', function (e) { if (openMenuKey && !e.target.closest('.ym-menubar')) closeMenu(); });
    $('btn-help-close').addEventListener('click', function () { $('help-modal').hidden = true; });
    $('btn-left').addEventListener('click', function () { moveClip(-1); });
    $('btn-right').addEventListener('click', function () { moveClip(1); });
    $('btn-cut').addEventListener('click', toggleCut);
    document.addEventListener('keydown', function (e) {
      if (S.screen !== 'edit' || !S.editing) return;
      var tg = e.target;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
      if (e.altKey && /^[fFeElLtThH]$/.test(e.key)) {
        var map = { f: 'file', e: 'edit', l: 'layout', t: 'tool', h: 'help' };
        var mb = document.querySelector('.ym-menu-btn[data-menu="' + map[e.key.toLowerCase()] + '"]');
        if (mb) { e.preventDefault(); openMenu(mb); }
        return;
      }
      if (e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape') { if (openMenuKey) { closeMenu(); return; } setPaused(!S.paused); e.preventDefault(); return; }
      if (e.altKey) return;
      if (S.paused) return;
      var k = e.key;
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        if (tg && tg.closest && tg.closest('.ym-menu-pop')) return;
        e.preventDefault(); selectClip(S.sel + (k === 'ArrowRight' ? 1 : -1));
        var v = document.querySelector('[data-k="v' + S.sel + '"]'); if (v) v.focus({ preventScroll: true });
      } else if (k === '[' || k === ']') { e.preventDefault(); moveClip(k === ']' ? 1 : -1); }
      else if (k >= '1' && k <= '4') { focusGroup(TAB_KEYS[+k - 1], true); }
      else if (k === '+' || k === ';') { zoomBy(1.25); }
      else if (k === '-') { zoomBy(0.8); }
      else if (k === 'x' || k === 'X' || k === 'Delete') { e.preventDefault(); toggleCut(); }
      else if (k === 'p' || k === 'P') { startPreviewAll(); }
    });

    $('btn-skip').addEventListener('click', function () { if (S.play && !S.play.done) goResult(); });
    $('btn-retry').addEventListener('click', function () {
      if (S.mode === 'shared') { pickTheme(S.theme); return; }
      startEdit();
    });
    $('btn-other').addEventListener('click', function () { S.mode = 'normal'; clearShareParam(); renderThemes(); show('select'); });
    $('btn-replay').addEventListener('click', function () { startPlayback(currentEdit()); });
    $('btn-x').addEventListener('click', postToX);
    $('btn-save').addEventListener('click', saveImage);
    $('btn-share-img').addEventListener('click', shareImage);
    $('btn-copy').addEventListener('click', copyShare);
    $('btn-copy-close').addEventListener('click', function () { $('copy-modal').hidden = true; });
    var playCode = function () {
      var code = Sh.parseCode($('inp-code').value);
      if (!code) { toast('再現コードが読み取れませんでした', 2800); return; }
      ensureAudio();
      if (openShared(code)) $('inp-code').value = '';
    };
    $('btn-code').addEventListener('click', playCode);
    $('inp-code').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); playCode(); } });
    $('btn-img-close').addEventListener('click', function () { $('img-modal').hidden = true; });
    var nameTimer = null;
    $('inp-name').addEventListener('input', function (e) {
      if (S.mode === 'shared') return;
      S.name = Codec.cleanText(e.target.value, 20);
      store.set('name', S.name);
      clearTimeout(nameTimer); nameTimer = setTimeout(makeImage, 300);
    });
    $('btn-shared-play').addEventListener('click', function () { ensureAudio(); startPlayback(S.shared.edit); });
    $('btn-shared-try').addEventListener('click', function () { pickTheme(S.theme); });

    window.addEventListener('resize', function () { if (S.screen === 'edit') measureHead(); else drawCharas($('scr-' + S.screen)); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && S.screen === 'edit' && S.editing && S.timerOn && !S.paused) setPaused(true);
    });
  }

  function boot() {
    syncToggles();
    bind();
    drawCharas($('scr-title'));
    var q = new URLSearchParams(location.search);
    if (q.get('r')) openShared(q.get('r'));
    requestAnimationFrame(frame);
    // テスト・デバッグ用の入口（ゲーム内容には影響しない）
    window.YG.App = { state: S, startEdit: startEdit, exportVideo: exportVideo, goResult: goResult, pickTheme: pickTheme };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
