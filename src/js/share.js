/* ゆっくり編集地獄 - 結果画像の生成と共有（画像保存・Xポスト・再現URL） */
(function (root) {
  'use strict';
  var YG = root.YG = root.YG || {};
  var D = YG.DATA, R = YG.Render, h = YG.Scenes.helpers;
  var IW = 1200, IH = 675;
  var GAME_NAME = 'ゆっくり編集地獄';
  var HASHTAG = 'ゆっくり編集地獄';

  function font(w, size, fam) { return w + ' ' + size + 'px ' + (fam || R.FONT_SANS); }
  function outlined(ctx, text, x, y, fill, stroke, lw) {
    ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y);
    ctx.fillStyle = fill; ctx.fillText(text, x, y);
  }
  function fitFont(ctx, text, w, size, min, weight, fam) {
    for (; size > min; size -= 2) { ctx.font = font(weight || 900, size, fam); if (ctx.measureText(text).width <= w) break; }
    ctx.font = font(weight || 900, size, fam);
    return size;
  }
  function ellipsis(ctx, text, w) {
    if (ctx.measureText(text).width <= w) return text;
    var a = Array.from(text);
    while (a.length && ctx.measureText(a.join('') + '…').width > w) a.pop();
    return a.join('') + '…';
  }

  // 共有リンクの基準URL。公開URLがない（ファイルを直接開いている、埋め込み表示など）ときは null
  function shareBase() {
    var meta = document.querySelector('meta[name="yg-share-url"]');
    if (meta && /^https?:\/\//.test(meta.content)) return meta.content;
    if (/^https?:$/.test(location.protocol) && location.origin && location.origin !== 'null') return location.origin + location.pathname;
    return null;
  }
  function shareUrl(edit, name) {
    var base = shareBase();
    return base ? base + '?r=' + YG.Codec.encode(edit, name) : null;
  }
  // 再現リンクの URL でも、再現コードそのものでも受け付ける
  function parseCode(text) {
    var t = String(text || '').trim();
    var m = /[?&#]r=([A-Za-z0-9_-]+)/.exec(t);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{8,}$/.test(t) ? t : null;
  }
  function displayHost() {
    var base = shareBase();
    if (!base) return '';
    try { var u = new URL(base); return (u.host + u.pathname).replace(/\/$/, '').replace(/\/index\.html$/, ''); } catch (e) { return ''; }
  }

  // ---- 結果画像（投稿画像だけで内容が伝わる構成） ----
  function makeResultImage(theme, edit, res, opts) {
    opts = opts || {};
    var cv = document.createElement('canvas');
    cv.width = IW; cv.height = IH;
    var ctx = cv.getContext('2d');
    var bg = ctx.createLinearGradient(0, 0, IW, IH);
    bg.addColorStop(0, '#221b3d'); bg.addColorStop(1, '#130f22');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, IW, IH);
    ctx.save(); ctx.globalAlpha = 0.06; ctx.fillStyle = '#fff';
    for (var i = -IH; i < IW; i += 46) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 20, 0); ctx.lineTo(i + 20 + IH, IH); ctx.lineTo(i + IH, IH); ctx.closePath(); ctx.fill(); }
    ctx.restore();

    // ヘッダー
    ctx.fillStyle = '#0d0a18'; ctx.fillRect(0, 0, IW, 70);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = font(900, 36);
    outlined(ctx, 'ゆっくり', 28, 36, '#ffd23f', '#000', 7);
    var w1 = ctx.measureText('ゆっくり').width;
    outlined(ctx, '編集', 28 + w1, 36, '#ffffff', '#000', 7);
    var w2 = ctx.measureText('編集').width;
    outlined(ctx, '地獄', 28 + w1 + w2, 36, '#ff4d6d', '#000', 7);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#c9c2ea';
    fitFont(ctx, 'お題No.' + theme.no + '「' + theme.short + '」', 640, 26, 16, 800);
    ctx.fillText('お題No.' + theme.no + '「' + theme.short + '」', IW - 28, 36);

    // サムネ（一番の見せ場）
    var tx = 30, ty = 92, tw = 640, th = 360;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(tx + 8, ty + 10, tw, th);
    var tl = R.buildSegments(theme, edit);
    ctx.save(); ctx.translate(tx, ty); ctx.beginPath(); ctx.rect(0, 0, tw, th); ctx.clip();
    if (res.thumbClip >= 0 && tl.segs[res.thumbClip]) {
      var s = tl.segs[res.thumbClip];
      R.drawClip(ctx, theme, s.clip, Math.min(0.97, s.pe + 0.13), { time: 0.6, sub: s.sub });
    } else R.drawEmpty(ctx, 0);
    ctx.restore();
    ctx.lineWidth = 6; ctx.strokeStyle = '#ffffff'; ctx.strokeRect(tx - 3, ty - 3, tw + 6, th + 6);
    // 再生バー風（字幕に重ならないよう細い線だけ）
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(tx, ty + th - 5, tw, 5);
    ctx.fillStyle = '#ff3b3b'; ctx.fillRect(tx, ty + th - 5, tw * 0.62, 5);

    // フィルムストリップ（編集の全体像）
    var fy = ty + th + 18, fw = 100, fh = 56, gap = 8;
    ctx.textAlign = 'left'; ctx.fillStyle = '#a9a3c4'; ctx.font = font(800, 15);
    ctx.fillText('タイムライン（' + tl.total + '秒）', tx, fy + 4);
    fy += 16;
    edit.clips.forEach(function (c, i) {
      var x = tx + i * (fw + gap);
      ctx.save(); ctx.translate(x, fy);
      if (c.keep) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, fw, fh); ctx.clip(); ctx.scale(fw / 640, fh / 360);
        var shot = theme.shots[c.shot];
        R.drawClip(ctx, theme, c, Math.min(0.97, R.eventP(c.fx, shot.event) + 0.05), { time: 0.3, noText: true, noPop: true });
        ctx.restore();
        ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.strokeRect(0, 0, fw, fh);
        var icons = (c.fx !== 'none' ? D.FX[c.fx].icon : '') + (c.se !== 'none' ? '🔊' : '') + (c.sub ? '💬' : '');
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, fh - 20, fw, 20);
        ctx.fillStyle = '#fff'; ctx.font = font(800, 13); ctx.textBaseline = 'middle';
        ctx.fillText(c.len + 's', 5, fh - 10);
        ctx.textAlign = 'right'; ctx.font = font(400, 13); ctx.fillText(icons, fw - 4, fh - 10);
      } else {
        ctx.fillStyle = '#2a2540'; ctx.fillRect(0, 0, fw, fh);
        ctx.strokeStyle = '#4a4466'; ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.strokeRect(1, 1, fw - 2, fh - 2); ctx.setLineDash([]);
        ctx.fillStyle = '#8a83a8'; ctx.font = font(900, 16); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('✂ カット', fw / 2, fh / 2);
      }
      ctx.restore();
    });

    // 右側：称号・スコア
    var rx = 700, rw = IW - rx - 28;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffd23f'; ctx.font = font(900, 20); ctx.fillText('称号', rx, 116);
    ctx.save();
    ctx.translate(rx + rw / 2, 160); ctx.rotate(-0.025);
    var tname = '『' + res.title.name + '』';
    var tsz = fitFont(ctx, tname, rw - 24, 50, 26, 900);
    ctx.fillStyle = '#ff3b5c'; h.rect(ctx, -rw / 2, -tsz * 0.72 - 6, rw, tsz * 1.3 + 12, 10, '#ff3b5c', '#fff', 4);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    outlined(ctx, tname, 0, 0, '#ffffff', '#5a0016', 8);
    ctx.restore();
    ctx.fillStyle = '#d9d3f2'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    fitFont(ctx, res.title.desc, rw, 17, 12, 700);
    ctx.fillText(res.title.desc, rx, 224);

    // 総合点とランク
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(900, 96);
    outlined(ctx, String(res.total), rx, 330, '#ffffff', '#000', 10);
    var nw = ctx.measureText(String(res.total)).width;
    ctx.font = font(900, 30); outlined(ctx, '点', rx + nw + 6, 326, '#ffffff', '#000', 6);
    var rankColors = { S: '#ffd23f', A: '#ff8a3d', B: '#59b8ff', C: '#7ddc8a', D: '#b49bff', E: '#a0a0b0' };
    h.circle(ctx, rx + rw - 56, 290, 50, rankColors[res.rank] || '#fff', '#fff', 5);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = font(900, 62);
    outlined(ctx, res.rank, rx + rw - 56, 294, '#fff', '#000', 8);
    ctx.font = font(900, 16); ctx.fillStyle = '#fff'; ctx.fillText(res.rankLabel, rx + rw - 56, 356);

    // 3項目のメーター
    var bars = [['編集技術', res.scores.tech, '#59b8ff'], ['テンポ', res.scores.tempo, '#7ddc8a'], ['ネタ', res.scores.neta, '#ff8ab3']];
    bars.forEach(function (b, i) {
      var y = 374 + i * 34;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.font = font(800, 19);
      ctx.fillText(b[0], rx, y);
      h.rect(ctx, rx + 100, y - 11, rw - 160, 22, 11, '#2d2747', null);
      if (b[1] > 0) h.rect(ctx, rx + 100, y - 11, Math.max(22, (rw - 160) * b[1] / 100), 22, 11, b[2], null);
      ctx.textAlign = 'right'; ctx.font = font(900, 22); ctx.fillStyle = '#fff'; ctx.fillText(String(b[1]), rx + rw, y + 1);
    });
    // 地獄度
    var hy = 374 + 3 * 34;
    ctx.textAlign = 'left'; ctx.fillStyle = '#ff8a3d'; ctx.font = font(800, 19); ctx.fillText('地獄度', rx, hy);
    var flames = Math.round(res.scores.hell / 20);
    ctx.font = font(400, 22);
    for (var f = 0; f < 5; f++) { ctx.globalAlpha = f < flames ? 1 : 0.18; ctx.fillText('🔥', rx + 100 + f * 30, hy + 1); }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'right'; ctx.font = font(900, 22); ctx.fillStyle = '#ff8a3d'; ctx.fillText(String(res.scores.hell), rx + rw, hy + 1);

    // 再生数
    var vy = hy + 42;
    h.rect(ctx, rx, vy - 20, rw, 40, 10, 'rgba(255,255,255,0.08)', null);
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = font(900, 21);
    ctx.fillText('▶ ' + res.viewsLabel + (res.burning ? ' 🔥炎上中' : ''), rx + 12, vy + 1);
    ctx.textAlign = 'right'; ctx.font = font(800, 18); ctx.fillStyle = res.likeRate >= 60 ? '#7ddc8a' : '#ff8a8a';
    ctx.fillText('高評価 ' + res.likeRate + '%', rx + rw - 12, vy + 1);

    // ツッコミ
    var line = res.tsukkomi[0];
    if (line) {
      var by = vy + 26;
      R.drawChara(ctx, line.who, rx + 30, by + 34, 26, line.mood, 0);
      h.rect(ctx, rx + 66, by + 6, rw - 66, 56, 12, '#ffffff', null);
      h.poly(ctx, [rx + 66, by + 26, rx + 54, by + 36, rx + 66, by + 40], '#ffffff', null);
      ctx.fillStyle = '#2b2533'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      fitFont(ctx, line.text, rw - 90, 19, 13, 800);
      ctx.fillText(ellipsis(ctx, line.text, rw - 90), rx + 78, by + 34);
    }

    // フッター
    ctx.fillStyle = '#0d0a18'; ctx.fillRect(0, IH - 44, IW, 44);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = '#ffd23f'; ctx.font = font(900, 19);
    ctx.fillText('#' + HASHTAG, 28, IH - 22);
    var hw = ctx.measureText('#' + HASHTAG).width;
    ctx.fillStyle = '#c9c2ea'; ctx.font = font(700, 17);
    var by2 = opts.name ? '編集：' + opts.name : '';
    var sp = res.specials.length ? '★コンボ ' + res.specials.slice(0, 2).map(function (s) { return s.name; }).join('／') : '';
    ctx.fillText(ellipsis(ctx, [by2, sp].filter(Boolean).join('　'), 560), 28 + hw + 24, IH - 22);
    ctx.textAlign = 'right'; ctx.fillStyle = '#8a83a8'; ctx.font = font(700, 16);
    ctx.fillText(ellipsis(ctx, displayHost() || 'ブラウザで遊べる編集ゲーム', 360), IW - 28, IH - 22);
    return cv;
  }

  function fmtTime(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  function postText(theme, res) {
    return '【' + GAME_NAME + '】お題「' + theme.short + '」を編集したら\n' +
      '称号『' + res.title.name + '』総合' + res.total + '点（' + res.rank + '）\n' +
      '▶' + res.viewsLabel + ' / 地獄度' + res.scores.hell + (res.burning ? '🔥' : '') + '\n' +
      '#' + HASHTAG;
  }
  function intentUrl(text, url) {
    return 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + (url ? '&url=' + encodeURIComponent(url) : '');
  }

  function canvasToBlob(cv) {
    return new Promise(function (resolve) {
      if (cv.toBlob) cv.toBlob(function (b) { resolve(b); }, 'image/png');
      else resolve(null);
    });
  }
  function fileName() {
    var d = new Date();
    return 'yukkuri-henshu-jigoku-' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '-' + ('0' + d.getHours()).slice(-2) + ('0' + d.getMinutes()).slice(-2) + '.png';
  }

  YG.Share = {
    makeResultImage: makeResultImage, shareUrl: shareUrl, parseCode: parseCode, postText: postText, intentUrl: intentUrl,
    canvasToBlob: canvasToBlob, fileName: fileName, fmtTime: fmtTime, IW: IW, IH: IH
  };
})(typeof window !== 'undefined' ? window : globalThis);
