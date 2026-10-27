/* ゆっくり編集地獄 - 採点エンジン（DOM非依存の純粋関数） */
(function (root) {
  'use strict';
  var YG = root.YG = root.YG || {};
  var D = YG.DATA;

  // 各評価項目の基礎点（ここから加点・減点して0〜100に収める）
  var BASE = { tech: 35, tempo: 42, neta: 10 };

  // ---------- 小物 ----------
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function charLen(s) { return Array.from(String(s).replace(/\s/g, '')).length; }
  function uniq(arr) { return arr.filter(function (v, i) { return arr.indexOf(v) === i; }); }

  function hashStr(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }

  // 自由入力の字幕からタグを推定
  function inferTags(text) {
    var tags = [];
    D.KEYWORDS.forEach(function (kw) { if (kw[1].test(text)) tags.push(kw[0]); });
    return uniq(tags);
  }

  function resolveSub(theme, ref) {
    if (!ref) return null;
    if (typeof ref.p === 'number') {
      var p = D.subsFor(theme)[ref.p];
      if (!p) return null;
      return { text: p.text, tags: p.tags.slice(), free: false, chars: charLen(p.text), preset: ref.p };
    }
    if (typeof ref.t === 'string') {
      var text = ref.t.trim();
      if (!text) return null;
      return { text: text, tags: inferTags(text), free: true, chars: charLen(text) };
    }
    return null;
  }

  function newEdit(theme) {
    return {
      themeId: theme.id,
      clips: theme.shots.map(function (s, i) { return { shot: i, keep: true, len: 2, sub: null, fx: 'none', se: 'none' }; }),
      order: false,
      timeout: false
    };
  }

  function elementTags(c) {
    var t = [];
    if (c.sub && !c.sub.dup) t = t.concat(c.sub.tags);
    t = t.concat(D.FX[c.fx].tags, D.SE[c.se].tags);
    return t;
  }

  // 1クリップの「盛り上がり度」。山場の位置判定とサムネ選びに使う
  function clipIntensity(c) {
    var v = D.FX[c.fx].power + D.SE[c.se].power;
    if (c.sub && c.sub.tags.some(function (t) { return t === 'hype' || t === 'impact' || t === 'payoff' || t === 'horror'; })) v += 1;
    if (v > 0 && c.shot.peak) v += 1;
    return v;
  }

  function buildStats(theme, edit) {
    var all = [], kept = [], pos = 0, seenSub = {};
    edit.clips.forEach(function (c, i) {
      var item = {
        i: i, shot: theme.shots[c.shot], shotIndex: c.shot, keep: !!c.keep, len: c.len,
        sub: resolveSub(theme, c.sub), fx: c.fx, se: c.se, pos: -1
      };
      all.push(item);
      if (item.keep) {
        item.pos = pos++; kept.push(item);
        // 同じ字幕の使い回しは2回目以降を dup にする（ネタ加点の対象外）
        if (item.sub) { item.sub.dup = !!seenSub[item.sub.text]; seenSub[item.sub.text] = (seenSub[item.sub.text] || 0) + 1; }
      }
    });
    var total = kept.reduce(function (s, c) { return s + c.len; }, 0);
    var subs = kept.filter(function (c) { return c.sub; });
    var seClips = kept.filter(function (c) { return c.se !== 'none'; });
    var seCount = {};
    seClips.forEach(function (c) { seCount[c.se] = (seCount[c.se] || 0) + 1; });
    var seMaxSame = { key: null, n: 0 };
    Object.keys(seCount).forEach(function (k) { if (seCount[k] > seMaxSame.n) seMaxSame = { key: k, n: seCount[k] }; });
    var fxMap = {};
    kept.forEach(function (c) { fxMap[c.fx] = (fxMap[c.fx] || 0) + 1; });
    var reordered = edit.clips.some(function (c, i) { return c.shot !== i; });
    var cuts = all.length - kept.length;
    var edits = subs.length + kept.filter(function (c) { return c.fx !== 'none'; }).length + seClips.length +
      cuts + kept.filter(function (c) { return c.len !== 2; }).length + (reordered ? 1 : 0);
    var subMaxSame = 0;
    Object.keys(seenSub).forEach(function (k) { subMaxSame = Math.max(subMaxSame, seenSub[k]); });
    return {
      theme: theme, themeId: theme.id, edit: edit, all: all, kept: kept, count: kept.length, total: total, subMaxSame: subMaxSame,
      subs: subs, seClips: seClips, seMaxSame: seMaxSame, cuts: cuts, reordered: reordered, edits: edits,
      subChars: subs.reduce(function (s, c) { return s + c.sub.chars; }, 0),
      last: kept.length ? kept[kept.length - 1] : null,
      fxCount: function (k) { return fxMap[k] || 0; }
    };
  }

  // 編集中のライブ表示用：制約と追加注文の状態だけ返す
  function liveCheck(theme, edit) {
    var st = buildStats(theme, edit);
    return {
      st: st,
      constraints: theme.constraints.map(function (c) { var r = c.check(st); return { id: c.id, label: c.label, kind: c.kind, state: r.state, detail: r.detail }; }),
      order: edit.order ? (function () { var r = theme.order.check(st); return { label: theme.order.label, state: r.state, detail: r.detail }; })() : null
    };
  }

  // ---------- 本採点 ----------
  function evaluate(theme, edit) {
    var st = buildStats(theme, edit);
    var reasons = [];
    var sc = { tech: BASE.tech, tempo: BASE.tempo, neta: BASE.neta };
    function add(axis, pts, text, detail) {
      reasons.push({ axis: axis, pts: pts, text: text, detail: detail || '' });
      sc[axis] += pts;
    }
    var primary = Object.keys(theme.targets).filter(function (k) { return theme.targets[k] >= 3; });
    var specials = [];
    var structure = {};
    var constraintResults = theme.constraints.map(function (c) {
      var r = c.check(st);
      return { id: c.id, label: c.label, kind: c.kind, pts: c.pts, state: r.state, detail: r.detail };
    });
    var orderResult = null;

    if (st.count === 0) {
      sc = { tech: 0, tempo: 0, neta: 8 };
      reasons.push({ axis: 'tech', pts: -100, text: '動画が0秒', detail: '全カットを削除した' });
      reasons.push({ axis: 'neta', pts: 8, text: '無を投稿する度胸', detail: '' });
    } else {
      // ===== 編集技術 =====
      constraintResults.forEach(function (c) {
        if (c.state === 'ok') add('tech', c.pts, '制約クリア「' + c.label + '」', c.detail);
        else if (c.state === 'ng') add('tech', -c.pts, '制約違反「' + c.label + '」', c.detail);
        else reasons.push({ axis: 'tech', pts: 0, text: '「' + c.label + '」は未使用', detail: c.detail });
      });
      if (edit.order) {
        var orr = theme.order.check(st);
        orderResult = { label: theme.order.label, state: orr.state, detail: orr.detail };
        if (orr.state === 'ok') add('tech', 10, '追加注文に対応「' + theme.order.label + '」', orr.detail);
        else add('tech', -10, '追加注文を無視「' + theme.order.label + '」', orr.detail);
      }
      var goodHit = 0, badHit = 0;
      st.kept.forEach(function (c) {
        if (D.SE[c.se].hard) { if (c.shot.peak) goodHit++; else badHit++; }
      });
      if (goodHit) add('tech', Math.min(9, goodHit * 3), '見せ場にジャストで効果音', goodHit + 'カット');
      if (badHit) add('tech', -Math.min(12, badHit * 3), '何も起きない場面で衝撃音', badHit + 'カット');
      var lookHit = st.kept.filter(function (c) {
        return ['zoom', 'bigzoom', 'lines'].indexOf(c.fx) >= 0 && (c.shot.tags.indexOf('face') >= 0 || c.shot.peak);
      }).length;
      if (lookHit) add('tech', Math.min(9, lookHit * 3), '見せ場にしっかり寄っている', lookHit + 'カット');
      var unreadable = st.subs.filter(function (c) { return c.sub.chars / c.len > 7; });
      if (unreadable.length) {
        add('tech', -Math.min(20, unreadable.length * 5), '読み切れない字幕',
          unreadable.map(function (c) { return '「' + c.sub.text + '」を' + c.len + '秒'; }).join('、'));
      }
      if (st.count >= 5 && st.subs.length === st.count) add('tech', -8, '全カットに字幕（字幕過多）', st.subs.length + 'カット');
      if (st.subMaxSame >= 2) add('tech', -5, '同じ字幕の使い回し', '最大' + st.subMaxSame + '回');
      if (st.edits === 0) add('tech', -20, '素材をそのまま書き出した', '編集ゼロ');
      if (edit.timeout) add('tech', -10, '締め切りオーバー', '時間切れで強制書き出し');
      var L = st.last;
      var endingOk = L.fx === 'freeze' || D.SE[L.se].tags.indexOf('ending') >= 0 || (L.sub && (L.sub.tags.indexOf('ending') >= 0 || L.sub.tags.indexOf('thanks') >= 0));
      if (endingOk) add('tech', 6, '締めが決まっている', '最後の「' + L.shot.name + '」');
      else if (st.count >= 2) add('tech', -3, 'オチが弱い', '最後のカットに締めの演出がない');

      // ===== 構成（お題ごと） =====
      structure = theme.structure ? (theme.structure(st, add) || {}) : {};

      // ===== テンポ =====
      var lo = theme.ideal[0], hi = theme.ideal[1];
      if (st.total >= lo && st.total <= hi) add('tempo', 15, '尺がちょうどいい', st.total + '秒（理想' + lo + '〜' + hi + '秒）');
      else {
        var diff = st.total < lo ? lo - st.total : st.total - hi;
        add('tempo', -Math.min(25, diff * 5), st.total < lo ? '尺が短すぎる' : '尺が長すぎる', st.total + '秒（理想' + lo + '〜' + hi + '秒）');
      }
      if (st.count >= 3) {
        var changes = 0;
        for (var i = 1; i < st.count; i++) if (st.kept[i].len !== st.kept[i - 1].len) changes++;
        var ratio = changes / (st.count - 1);
        if (ratio >= 0.4) add('tempo', 6, 'カットの長さに緩急がある', changes + '回の切り替え');
        else if (changes === 0 && !(theme.tempoPref === 'fast' && st.kept[0].len === 1)) add('tempo', -8, '全カット同じ長さで単調', '全部' + st.kept[0].len + '秒');
      }
      // 何も足していないカットは「間延び」。ゆっくり見せるお題でも、ただ流れるだけのカットは減点
      var dead = st.kept.filter(function (c) { return !c.sub && c.fx === 'none' && c.se === 'none' && (c.len >= 2 || theme.tempoPref === 'slow'); }).length;
      if (dead) add('tempo', -Math.min(16, dead * 4), '何も起きないカットで間延び', dead + 'カット');
      if (theme.tempoPref === 'slow') {
        var yoin = st.kept.filter(function (c) { return c.len === 3 && (['slow', 'freeze', 'mono', 'zoom'].indexOf(c.fx) >= 0 || (c.sub && c.sub.tags.indexOf('emotional') >= 0)); }).length;
        if (yoin) add('tempo', Math.min(12, yoin * 4), '余韻のある長回し', yoin + 'カット');
      }
      if (st.cuts >= 1 && st.count >= 3) add('tempo', 8, '不要なカットを削った', st.cuts + 'カット削除');
      if (st.count <= 2) add('tempo', -12, '短すぎて何も伝わらない', st.count + 'カットだけ');
      // 演出の「量」は付けたカット数、「うるささ」は演出＋効果音の強さの平均で見る
      var active = st.kept.filter(function (c) { return c.fx !== 'none' || c.se !== 'none'; }).length;
      var dens = active / st.count;
      var loud = st.kept.reduce(function (s, c) { return s + D.FX[c.fx].power + D.SE[c.se].power; }, 0) / st.count;
      if (active === 0) add('tempo', -15, '演出ゼロで地味', '演出も効果音もない');
      else if (loud >= 3.5 && st.count >= 3) add('tempo', -10, '演出しっぱなしで疲れる', '強い演出が' + active + '/' + st.count + 'カット');
      else if (dens >= 0.3 && dens <= 0.85) add('tempo', 10, 'ほどよい演出量（休むカットもある）', active + '/' + st.count + 'カット');
      var maxI = 0, maxPos = -1;
      st.kept.forEach(function (c) { var v = clipIntensity(c); if (v >= maxI && v > 0) { maxI = v; maxPos = c.pos; } });
      if (maxI >= 2 && st.count >= 2) {
        var top = st.kept[maxPos];
        if (maxPos >= Math.floor(st.count / 2)) add('tempo', 10, '後半に山場がある', (maxPos + 1) + '番目の「' + top.shot.name + '」');
        else add('tempo', -4, '山場が序盤に来てしまった', (maxPos + 1) + '番目の「' + top.shot.name + '」');
        if (top.len >= 2) add('tempo', 6, '見せ場をしっかり見せている', '「' + top.shot.name + '」に' + top.len + '秒');
        else if (theme.tempoPref !== 'fast') add('tempo', -4, '見せ場が一瞬で終わる', '「' + top.shot.name + '」が1秒');
      }
      var avg = st.total / st.count;
      if (theme.tempoPref === 'fast') {
        if (avg <= 1.5) add('tempo', 10, '畳みかけるカット割り', '平均' + avg.toFixed(1) + '秒');
        var slowCuts = st.kept.filter(function (c) { return c.len === 3; }).length;
        if (slowCuts) add('tempo', -Math.min(12, slowCuts * 4), '3秒カットでテンポが落ちる', slowCuts + 'カット');
      } else if (theme.tempoPref === 'slow') {
        if (avg >= 2.4) add('tempo', 10, 'じっくり見せるカット割り', '平均' + avg.toFixed(1) + '秒');
        var quick = st.kept.filter(function (c) { return c.len === 1; }).length;
        if (quick) add('tempo', -Math.min(12, quick * 4), '1秒カットがせわしない', quick + 'カット');
      }

      // ===== ネタ =====
      var fit = 0, fitParts = { sub: 0, fx: 0, se: 0 };
      st.kept.forEach(function (c) {
        [['sub', c.sub && !c.sub.dup ? c.sub.tags : []], ['fx', D.FX[c.fx].tags], ['se', D.SE[c.se].tags]].forEach(function (e) {
          var best = 0;
          e[1].forEach(function (t) { best = Math.max(best, theme.targets[t] || 0); });
          if (best) { fit += best; fitParts[e[0]]++; }
        });
      });
      if (fit) add('neta', Math.min(30, fit), 'お題に合った演出', '字幕' + fitParts.sub + '・演出' + fitParts.fx + '・効果音' + fitParts.se);
      var gaps = st.kept.filter(function (c) {
        var plain = c.shot.tags.some(function (t) { return t === 'mundane' || t === 'cute' || t === 'calm'; });
        if (!plain) return false;
        return elementTags(c).some(function (t) { return primary.indexOf(t) >= 0; });
      });
      if (gaps.length) {
        add('neta', Math.min(20, gaps.length * 5), 'ふつうの映像×' + primary.map(function (t) { return D.TAG_LABELS[t]; }).join('・') + 'のギャップ',
          gaps.map(function (c) { return c.shot.name; }).join('、'));
      }
      var spPts = 0;
      st.kept.forEach(function (c) {
        theme.specials.forEach(function (sp) {
          if (specials.some(function (s) { return s.id === sp.id; })) return;
          if (sp.test(c, st)) { specials.push({ id: sp.id, name: sp.name, desc: sp.desc, pts: sp.pts, clip: c.pos, comments: sp.comments }); }
        });
      });
      D.GENERIC_SPECIALS.forEach(function (sp) {
        if (sp.test(st)) specials.push({ id: sp.id, name: sp.name, desc: sp.desc, pts: sp.pts, clip: -1, comments: sp.comments });
      });
      specials.forEach(function (sp) {
        var p = Math.max(0, Math.min(sp.pts, 45 - spPts));
        spPts += p;
        add('neta', p, '★コンボ「' + sp.name + '」', sp.desc);
      });
      var free = st.subs.filter(function (c) { return c.sub.free; }).length;
      if (free) add('neta', Math.min(12, free * 4), '自作の字幕', free + '個');
      var tsukkomi = 0;
      st.kept.forEach(function (c) {
        elementTags(c).forEach(function (t) { if ((t === 'comedy' || t === 'fail' || t === 'meme' || t === 'chaos') && !theme.targets[t]) tsukkomi++; });
      });
      if (tsukkomi) add('neta', Math.min(10, tsukkomi * 2), 'ツッコミどころ', tsukkomi + '箇所');
      if (!st.subs.length && active === 0) reasons.push({ axis: 'neta', pts: 0, text: 'ネタになる要素がない', detail: '字幕も演出もない' });
    }

    sc.tech = clamp(Math.round(sc.tech), 0, 100);
    sc.tempo = clamp(Math.round(sc.tempo), 0, 100);
    sc.neta = clamp(Math.round(sc.neta), 0, 100);
    var w = theme.weights;
    sc.total = clamp(Math.round(sc.tech * w.tech + sc.tempo * w.tempo + sc.neta * w.neta), 0, 100);

    // ===== 地獄度（総合点とは別枠） =====
    var hellParts = [];
    function hell(pts, text) { if (pts > 0) hellParts.push({ pts: pts, text: text }); }
    if (st.count === 0) hell(100, '動画が存在しない');
    else {
      if (st.seClips.length > 3) hell(Math.min(30, (st.seClips.length - 3) * 10), '効果音' + st.seClips.length + '連発');
      if (st.seMaxSame.n >= 4) hell(10, '同じ効果音' + st.seMaxSame.n + '回');
      var loud = st.fxCount('bigzoom') + st.fxCount('shake') + st.fxCount('reverse');
      if (loud) hell(Math.min(35, loud * 7), '激しい演出' + loud + 'カット');
      if (st.subChars > 30) hell(Math.min(25, st.subChars - 30), '字幕' + st.subChars + '文字');
      if (st.count >= 5 && st.subs.length === st.count) hell(10, '全カット字幕');
      var ng = constraintResults.filter(function (c) { return c.state === 'ng'; }).length;
      if (ng) hell(ng * 6, '制約違反' + ng + '個');
      if (orderResult && orderResult.state === 'ng') hell(5, '追加注文を無視');
      if (edit.timeout) hell(10, '締め切りオーバー');
      if (st.count === 1) hell(20, '1カットだけ');
      if (specials.some(function (s) { return s.id === 'zenbu'; })) hell(15, '全部盛り');
      var unr = st.subs.filter(function (c) { return c.sub.chars / c.len > 7; }).length;
      if (unr) hell(unr * 4, '読めない字幕' + unr + '個');
    }
    sc.hell = clamp(hellParts.reduce(function (s, h) { return s + h.pts; }, 0), 0, 100);

    var seed = hashStr(JSON.stringify(edit));
    var r = rng(seed);
    var qViews = Math.pow(10, 2.2 + 3.5 * sc.total / 100);
    var hViews = sc.hell >= 40 ? Math.pow(10, 2.4 + 2.8 * sc.hell / 100) : 0;
    var views = Math.round(Math.max(qViews, hViews) * (0.85 + 0.3 * r()));
    var likeRate = clamp(Math.round(52 + 0.47 * sc.total - 0.4 * sc.hell + (r() * 6 - 3)), 3, 99);

    var rank = D.RANKS.filter(function (x) { return sc.total >= x.min; })[0];

    var ctx = { st: st, sc: sc, specials: specials.map(function (s) { return s.id; }), timeout: !!edit.timeout, edits: st.edits, structure: structure };
    var matched = D.TITLES.filter(function (t) { return t.cond(ctx); }).sort(function (a, b) { return b.prio - a.prio; });
    var titles = matched.map(function (t) {
      if (t.id === 'legend') return { id: t.id, name: theme.legend.name, desc: theme.legend.desc };
      return { id: t.id, name: t.name, desc: t.desc };
    });

    var result = {
      themeId: theme.id, scores: sc, total: sc.total, rank: rank.rank, rankLabel: rank.label,
      reasons: reasons, constraints: constraintResults, order: orderResult, specials: specials, structure: structure,
      hellParts: hellParts, views: views, viewsLabel: formatViews(views), likeRate: likeRate, burning: hViews > qViews,
      title: titles[0], badges: titles.slice(1, 4), seed: seed, stats: st
    };
    result.tsukkomi = makeTsukkomi(theme, st, result);
    result.comments = makeComments(theme, st, result, rng(seed ^ 0x9e3779b9));
    result.thumbClip = pickThumbClip(st, specials);
    return result;
  }

  function pickThumbClip(st, specials) {
    if (!st.count) return -1;
    var best = st.kept[0], bv = -1;
    st.kept.forEach(function (c) {
      var v = clipIntensity(c) + (c.sub ? 1 : 0) + (specials.some(function (s) { return s.clip === c.pos; }) ? 3 : 0);
      if (v > bv) { bv = v; best = c; }
    });
    return best.pos;
  }

  function formatViews(n) {
    if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '億回再生';
    if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + '万回再生';
    return n.toLocaleString('ja-JP') + '回再生';
  }

  // もち監督（ボケ・肯定）とあんこ（ツッコミ）の掛け合い
  function makeTsukkomi(theme, st, res) {
    var sc = res.scores, lines = [];
    function A(text, mood) { lines.push({ who: 'anko', text: text, mood: mood || 'angry' }); }
    function M(text, mood) { lines.push({ who: 'mochi', text: text, mood: mood || 'normal' }); }
    var t = res.title.id;
    if (st.count === 0) { A('動画が…ない…！？ 0秒よ！？', 'shock'); M('無を投稿するとは、新しいぜ。', 'happy'); return lines; }
    if (t === 'houki') { A('何もしないまま締め切り迎えてるじゃない！', 'angry'); M('素材の良さを信じたんだぜ、きっと。', 'normal'); return lines; }
    var ng = res.constraints.filter(function (c) { return c.state === 'ng'; });
    if (t === 'se_bouryoku') A('効果音' + st.seClips.length + '回って何！？ 耳が死ぬわ！', 'angry');
    else if (t === 'jimaku_tsumi') A('字幕で画面が見えないじゃない！ 読むのに必死よ！', 'angry');
    else if (t === 'zoom_izon') A('寄りすぎて何が映ってるのか分からないわよ！', 'angry');
    else if (t === 'kamishibai') A('止まってばっかり！ これ紙芝居でしょ！', 'angry');
    else if (t === 'tokikake') A('逆再生しすぎて時系列がめちゃくちゃよ！', 'shock');
    else if (t === 'gyakufukusen') A('回収してから伏線張ってどうするのよ！', 'angry');
    else if (t === 'nobita') A('いい話だったのに最後で台無しじゃない！', 'shock');
    else if (t === 'onecut') A('1カットだけ！？ 潔すぎるでしょ！', 'shock');
    else if (res.order && res.order.state === 'ng') A('追加注文「' + res.order.label.replace(/！$/, '') + '」、無視したわね…？', 'angry');
    else if (ng.length) A('「' + ng[0].label + '」って言われてたでしょ！', 'angry');
    else if (st.edits <= 2) A('ほとんど素材のままじゃない…', 'normal');
    else if (sc.total >= 88) A('…ツッコむところがないじゃない。悔しいわ。', 'happy');
    else if (sc.tempo < 40) A('テンポが悪くて途中で寝そうになったわ。', 'normal');
    else A('まあまあね。でも、もっと攻められたでしょ？', 'normal');

    var sp = res.specials.filter(function (s) { return s.clip >= 0; })[0] || res.specials[0];
    if (res.structure.fukusen) M('伏線が回収された瞬間、鳥肌が立ったぜ。', 'happy');
    else if (sp) M('「' + sp.name + '」…この発想はなかったぜ。', 'happy');
    else if (res.burning) M('炎上してるけど、再生数は回ってるぜ。', 'happy');
    else if (sc.total >= 75) M('文句なしだぜ。これは伸びる。', 'happy');
    else if (sc.neta < 30) M('素材と演出の組み合わせ、もっと試してみるといいぜ。', 'normal');
    else M('次はもっと視聴者を驚かせてやろうぜ。', 'normal');
    if (res.burning && sc.total < 50) A('伸びればいいってもんじゃないのよ…', 'normal');
    return lines;
  }

  // 書き出し再生中に流れる視聴者コメント（クリップごと）
  function makeComments(theme, st, res, r) {
    var C = D.COMMENTS;
    var out = { start: [pick(r, C.start), pick(r, C.start)], clips: [], end: [] };
    st.kept.forEach(function (c) {
      var pool = [], list = [];
      res.specials.forEach(function (sp) { if (sp.clip === c.pos) list.push(pick(r, sp.comments), pick(r, sp.comments)); });
      if (c.sub) c.sub.tags.forEach(function (t) { if (C.tag[t]) pool = pool.concat(C.tag[t]); });
      if (c.fx !== 'none') pool = pool.concat(C.fx[c.fx], C.fx[c.fx]);
      if (c.se !== 'none') pool = pool.concat(C.se[c.se], C.se[c.se]);
      if (c.sub && c.sub.chars / c.len > 7) pool = pool.concat(C.overload, C.overload);
      if (!c.sub && c.fx === 'none' && c.se === 'none') pool = pool.concat(C.nothing);
      pool = pool.concat(c.shot.comments || []);
      var n = Math.min(4, 1 + Math.floor(c.len * 0.8 + r() * 1.5));
      for (var i = 0; i < n && pool.length; i++) list.push(pick(r, pool));
      out.clips.push(uniq(list).slice(0, 5));
    });
    res.specials.forEach(function (sp) { if (sp.clip < 0) out.end.push(pick(r, sp.comments)); });
    var endPool = res.scores.hell >= 60 ? C.endHell : res.total >= 75 ? C.endGood : res.total >= 45 ? C.endMid : C.endBad;
    out.end.push(pick(r, endPool), pick(r, endPool), pick(r, endPool));
    out.end = uniq(out.end);
    return out;
  }

  YG.Score = {
    BASE: BASE,
    charLen: charLen, inferTags: inferTags, resolveSub: resolveSub, newEdit: newEdit, buildStats: buildStats,
    liveCheck: liveCheck, evaluate: evaluate, clipIntensity: clipIntensity, formatViews: formatViews,
    hashStr: hashStr, rng: rng, clamp: clamp
  };
})(typeof window !== 'undefined' ? window : globalThis);
