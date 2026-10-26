/* ゆっくり編集地獄 - 演出の描画（素材カット＋演出＋字幕＋効果音の擬音）とキャラクター */
(function (root) {
  'use strict';
  var YG = root.YG = root.YG || {};
  var D = YG.DATA, Sc = YG.Scenes, h = Sc.helpers;
  var W = Sc.W, H = Sc.H, TAU = Math.PI * 2;
  var clamp = h.clamp, lerp = h.lerp, ease = h.ease, noise = h.noise;

  var FONT_SANS = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic","Meiryo","IPAGothic",sans-serif';
  var FONT_SERIF = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP","IPAMincho",serif';
  var FONT_ROUND = '"Hiragino Maru Gothic ProN","M PLUS Rounded 1c","Noto Sans JP","Meiryo","IPAGothic",sans-serif';

  function easeOutBack(t) { var c1 = 1.70158, c3 = c1 + 1; t = clamp(t, 0, 1); return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

  // 演出ごとに「素材の再生位置 t」と「見せ場（効果音が鳴る瞬間）の位置」を決める
  function eventP(fx, e) {
    if (fx === 'slow') return clamp((e - Math.max(0, e - 0.22)) / 0.44, 0, 1);
    if (fx === 'reverse') return 1 - e;
    if (fx === 'freeze') return 0.45;
    return e;
  }
  function mapT(fx, p, e) {
    if (fx === 'slow') return clamp(Math.max(0, e - 0.22) + 0.44 * p, 0, 1);
    if (fx === 'reverse') return 1 - p;
    if (fx === 'freeze') return p < 0.45 ? e * (p / 0.45) : e;
    return p;
  }

  function subStyle(sub) {
    var t = sub.tags;
    function hasAny(arr) { return arr.some(function (x) { return t.indexOf(x) >= 0; }); }
    if (hasAny(['horror'])) return 'horror';
    if (hasAny(['sports', 'hype'])) return 'sports';
    if (hasAny(['cute'])) return 'cute';
    if (hasAny(['emotional', 'thanks'])) return 'emotional';
    if (hasAny(['epic', 'foreshadow', 'payoff', 'trailer'])) return 'epic';
    if (hasAny(['suspense'])) return 'suspense';
    if (hasAny(['comedy', 'meme', 'fail', 'question'])) return 'comedy';
    return 'normal';
  }
  var STYLES = {
    normal: { fill: '#ffffff', stroke: '#2b2533', font: FONT_SANS },
    epic: { fill: 'gold', stroke: '#3a1d00', stroke2: '#fffbe6', font: FONT_SERIF },
    horror: { fill: '#ff2a2a', stroke: '#000000', font: FONT_SERIF, jitter: true },
    sports: { fill: '#ffffff', stroke: '#0047b3', stroke2: '#ffd400', font: FONT_SANS, italic: true },
    emotional: { fill: '#ffffff', stroke: 'rgba(30,30,70,0.92)', font: FONT_SERIF },
    cute: { fill: '#ff6fa8', stroke: '#ffffff', stroke2: '#7a2d4f', font: FONT_ROUND },
    comedy: { fill: '#ffe600', stroke: '#2b2533', font: FONT_SANS },
    suspense: { fill: '#e0d4ff', stroke: '#1a0d33', font: FONT_SERIF }
  };

  function wrapLines(ctx, text, maxW) {
    var chars = Array.from(text), lines = [], cur = '';
    chars.forEach(function (ch) {
      if (ctx.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  // ゆっくり実況風の縁取り字幕。長すぎる字幕は縮小→改行→それでも入らなければ画面を覆う
  function drawSubtitle(ctx, sub, p, secs, time) {
    if (!sub) return;
    var st = STYLES[subStyle(sub)];
    var appear = clamp(p * secs / 0.18, 0, 1);
    var size = 44, lines, maxW = 590;
    for (; size >= 26; size -= 2) {
      ctx.font = '900 ' + size + 'px ' + st.font;
      lines = wrapLines(ctx, sub.text, maxW);
      if (lines.length <= 2) break;
    }
    if (size < 26) { size = 26; ctx.font = '900 ' + size + 'px ' + st.font; lines = wrapLines(ctx, sub.text, maxW); }
    var lh = size * 1.2, baseY = 336 - (lines.length - 1) * lh;
    ctx.save();
    var sc = lerp(1.25, 1, easeOutBack(appear));
    ctx.translate(320, baseY - size * 0.3); ctx.scale(sc, sc); ctx.translate(-320, -(baseY - size * 0.3));
    ctx.globalAlpha = clamp(appear * 2, 0, 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    lines.forEach(function (ln, i) {
      var x = 320, y = baseY + i * lh;
      if (st.jitter) { x += (noise(Math.floor(time * 20) + i) - 0.5) * 3; y += (noise(Math.floor(time * 20) + 7 + i) - 0.5) * 3; }
      ctx.save();
      if (st.italic) { ctx.translate(x, y); ctx.transform(1, 0, -0.18, 1, 0, 0); ctx.translate(-x, -y); }
      if (st.stroke2) { ctx.lineWidth = size * 0.42; ctx.strokeStyle = st.stroke2; ctx.strokeText(ln, x, y); }
      ctx.lineWidth = size * (st.stroke2 ? 0.22 : 0.26); ctx.strokeStyle = st.stroke; ctx.strokeText(ln, x, y);
      if (st.fill === 'gold') {
        var g = ctx.createLinearGradient(0, y - size, 0, y);
        g.addColorStop(0, '#fff6c2'); g.addColorStop(0.5, '#ffcf3a'); g.addColorStop(1, '#d98a00');
        ctx.fillStyle = g;
      } else ctx.fillStyle = st.fill;
      ctx.fillText(ln, x, y);
      ctx.restore();
    });
    ctx.restore();
  }

  function drawSePop(ctx, seKey, k, x, y) {
    var se = D.SE[seKey];
    if (!se || !se.text) return;
    var s = easeOutBack(clamp(k * 4, 0, 1)) * (1 + 0.08 * Math.sin(k * 30));
    var alpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.translate(x, y); ctx.rotate(-0.14); ctx.scale(s, s);
    ctx.font = '900 54px ' + FONT_SANS; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 14; ctx.strokeStyle = '#2b2533'; ctx.strokeText(se.text, 0, 0);
    ctx.lineWidth = 5; ctx.strokeStyle = '#ffffff'; ctx.strokeText(se.text, 0, 0);
    ctx.fillStyle = se.color || '#fff'; ctx.fillText(se.text, 0, 0);
    ctx.restore();
  }

  function speedLines(ctx, cx, cy, time, strength) {
    ctx.save();
    ctx.fillStyle = 'rgba(15,10,20,' + (0.75 * strength) + ')';
    var n = 70, seed = Math.floor(time * 12);
    for (var i = 0; i < n; i++) {
      var a = (i + noise(i + seed) * 0.8) / n * TAU;
      var r0 = 120 + noise(i * 3 + seed) * 70, r1 = 520, w = 0.012 + noise(i + 99 + seed) * 0.02;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a - w) * r1, cy + Math.sin(a - w) * r1);
      ctx.lineTo(cx + Math.cos(a + w) * r1, cy + Math.sin(a + w) * r1);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function filmOverlay(ctx, time, sepia) {
    ctx.save();
    ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H);
    if (sepia) { ctx.globalCompositeOperation = 'color'; ctx.fillStyle = 'rgba(170,120,60,0.85)'; ctx.fillRect(0, 0, W, H); }
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = sepia ? 'rgba(235,225,205,1)' : 'rgba(205,205,205,1)'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    var v = ctx.createRadialGradient(320, 180, 140, 320, 180, 400);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    if (!sepia) {
      var seed = Math.floor(time * 18);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      for (var i = 0; i < 40; i++) ctx.fillRect(noise(i + seed) * W, noise(i * 7 + seed) * H, 2, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (var j = 0; j < 2; j++) ctx.fillRect(noise(j * 13 + seed) * W, 0, 1.5, H);
      ctx.fillStyle = 'rgba(0,0,0,' + (noise(seed) * 0.12) + ')'; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  /* 1クリップを描く（論理座標 640x360 の ctx に）
   * clip: { shot, fx, se, len } shot はお題の shots のインデックス
   * opts: { time, sub(解決済み), noText, noPop } */
  function drawClip(ctx, theme, clip, p, opts) {
    opts = opts || {};
    var shot = theme.shots[clip.shot];
    var time = opts.time || 0;
    var fx = clip.fx, e = shot.event, pe = eventP(fx, e);
    var t = mapT(fx, p, e);
    var frozen = fx === 'freeze' && p >= 0.45;
    var scale = 1, ox = 0, oy = 0, rot = 0;
    if (fx === 'zoom') scale = 1 + 0.5 * ease(p);
    else if (fx === 'bigzoom') {
      var k = clamp((p - (pe - 0.05)) / 0.07, 0, 1);
      scale = 1 + 0.04 * p + 1.6 * easeOutBack(k);
      if (k > 0) { ox = (noise(Math.floor(time * 30)) - 0.5) * 8 * (1 - k * 0.5); oy = (noise(Math.floor(time * 30) + 5) - 0.5) * 8 * (1 - k * 0.5); }
    } else if (fx === 'shake') {
      var amp = 5 + 14 * h.ease(1 - Math.min(1, Math.abs(p - pe) * 4));
      ox = (noise(Math.floor(time * 40)) - 0.5) * 2 * amp; oy = (noise(Math.floor(time * 40) + 3) - 0.5) * 2 * amp;
      rot = (noise(Math.floor(time * 40) + 9) - 0.5) * 0.04; scale = 1.08;
    } else if (fx === 'lines') scale = 1.06 + 0.06 * Math.max(0, 1 - Math.abs(p - pe) * 3);
    else if (frozen) { scale = 1.06; rot = -0.035; }

    var fxp = shot.focus[0], fyp = shot.focus[1];
    var z = clamp((scale - 1) / 1.2, 0, 1) * 0.75;
    var sx = lerp(fxp, 320, z), sy = lerp(fyp, 180, z);
    sx = clamp(sx, W - (W - fxp) * scale, fxp * scale); sy = clamp(sy, H - (H - fyp) * scale, fyp * scale);

    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(sx + ox, sy + oy); ctx.rotate(rot); ctx.scale(scale, scale); ctx.translate(-fxp, -fyp);
    Sc.drawShot(ctx, shot.id, t, frozen ? 0 : time);
    ctx.restore();

    if (fx === 'mono') filmOverlay(ctx, time, false);
    if (frozen) {
      filmOverlay(ctx, 0, true);
      ctx.save(); ctx.strokeStyle = 'rgba(255,250,235,0.95)'; ctx.lineWidth = 14; ctx.strokeRect(7, 7, W - 14, H - 14); ctx.restore();
      var fl = 1 - clamp((p - 0.45) / 0.12, 0, 1);
      if (fl > 0) { ctx.fillStyle = 'rgba(255,255,255,' + fl + ')'; ctx.fillRect(0, 0, W, H); }
    }
    if (fx === 'lines') speedLines(ctx, lerp(fxp, 320, 0.3), lerp(fyp, 180, 0.3), time, 0.7 + 0.3 * Math.max(0, 1 - Math.abs(p - pe) * 3));
    if (fx === 'bigzoom') {
      var fk = clamp((p - pe + 0.05) / 0.07, 0, 1);
      if (fk > 0 && fk < 1) { ctx.fillStyle = 'rgba(255,255,255,' + (0.6 * (1 - fk)) + ')'; ctx.fillRect(0, 0, W, H); }
    }
    if (fx === 'slow') {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, 26); ctx.fillRect(0, H - 26, W, 26);
    }
    if (fx === 'reverse') {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (var yy = 0; yy < H; yy += 4) ctx.fillRect(0, yy, W, 1.5);
      var by = (time * 160) % (H + 40) - 20;
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, by, W, 10);
      ctx.font = '900 30px monospace'; ctx.textBaseline = 'top'; ctx.lineWidth = 5; ctx.strokeStyle = '#000';
      ctx.strokeText('◀◀ REW', 22, 18); ctx.fillStyle = '#fff'; ctx.fillText('◀◀ REW', 22, 18);
      ctx.restore();
    }

    // 効果音の擬音（見せ場から約0.8秒）
    if (!opts.noPop && clip.se !== 'none') {
      var secs = clip.len || 2;
      var dt = (p - pe) * secs;
      if (dt >= 0 && dt < 0.9) {
        var px = clamp(lerp(fxp, 320, z) + 120, 150, 500), py = clamp(lerp(fyp, 180, z) - 90, 60, 220);
        drawSePop(ctx, clip.se, dt / 0.9, px, py);
      }
    }
    if (!opts.noText && opts.sub) drawSubtitle(ctx, opts.sub, p, clip.len || 2, time);
    ctx.restore();
  }

  // 編集全体をタイムラインとして再生するための区間リスト
  function buildSegments(theme, edit) {
    var t = 0, segs = [];
    edit.clips.forEach(function (c, i) {
      if (!c.keep) return;
      var shot = theme.shots[c.shot];
      segs.push({ clip: c, index: i, shot: shot, sub: YG.Score.resolveSub(theme, c.sub), start: t, len: c.len, pe: eventP(c.fx, shot.event) });
      t += c.len;
    });
    return { segs: segs, total: t };
  }
  function segAt(tl, sec) {
    for (var i = 0; i < tl.segs.length; i++) { var s = tl.segs[i]; if (sec < s.start + s.len) return s; }
    return tl.segs[tl.segs.length - 1] || null;
  }
  function drawTimeline(ctx, theme, tl, sec, time) {
    var s = segAt(tl, sec);
    if (!s) { drawEmpty(ctx, time); return null; }
    var p = clamp((sec - s.start) / s.len, 0, 0.9999);
    drawClip(ctx, theme, s.clip, p, { time: time, sub: s.sub });
    return { seg: s, p: p };
  }
  function drawEmpty(ctx, time) {
    ctx.save();
    ctx.fillStyle = '#0b0b10'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.06 + 0.04 * Math.sin(time * 3)) + ')';
    for (var i = 0; i < 300; i++) ctx.fillRect(noise(i + Math.floor(time * 20)) * W, noise(i * 3 + Math.floor(time * 20)) * H, 2, 2);
    ctx.fillStyle = '#fff'; ctx.font = '900 40px ' + FONT_SANS; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('（ 0秒の動画 ）', 320, 170);
    ctx.font = '700 20px ' + FONT_SANS; ctx.fillStyle = '#aaa'; ctx.fillText('すべてのカットが削除されています', 320, 215);
    ctx.restore();
  }

  // ---- キャラクター（オリジナル：もち監督／あんこ） ----
  function drawChara(ctx, who, x, y, r, mood, t) {
    t = t || 0;
    var C = h, OL = h.OL;
    var bob = Math.sin(t * 6) * r * 0.03;
    ctx.save(); ctx.translate(x, y + bob);
    var body = who === 'mochi' ? '#fff3dd' : '#ffc9d8';
    C.ell(ctx, 0, r * 0.95, r * 0.9, r * 0.12, 0, 'rgba(0,0,0,0.18)', null);
    ctx.beginPath();
    ctx.moveTo(-r, r * 0.55);
    ctx.bezierCurveTo(-r * 1.05, -r * 0.55, -r * 0.55, -r * 0.92, 0, -r * 0.92);
    ctx.bezierCurveTo(r * 0.55, -r * 0.92, r * 1.05, -r * 0.55, r, r * 0.55);
    ctx.quadraticCurveTo(r * 0.95, r * 0.92, 0, r * 0.92);
    ctx.quadraticCurveTo(-r * 0.95, r * 0.92, -r, r * 0.55);
    ctx.closePath();
    ctx.fillStyle = body; ctx.fill(); ctx.lineWidth = Math.max(2, r * 0.07); ctx.strokeStyle = OL; ctx.stroke();
    if (who === 'mochi') {
      ctx.save(); ctx.translate(r * 0.1, -r * 0.82); ctx.rotate(-0.18);
      C.ell(ctx, 0, 0, r * 0.68, r * 0.24, 0, '#2d3a6b', OL, Math.max(2, r * 0.06));
      C.circle(ctx, r * 0.05, -r * 0.24, r * 0.07, '#2d3a6b', OL, Math.max(1.5, r * 0.04));
      ctx.restore();
    } else {
      ctx.save(); ctx.translate(-r * 0.15, -r * 0.88); ctx.rotate(-0.5);
      C.ell(ctx, 0, 0, r * 0.42, r * 0.2, 0, '#6cc46a', OL, Math.max(2, r * 0.06));
      C.line(ctx, -r * 0.35, 0, r * 0.35, 0, '#3f8f3d', Math.max(1.5, r * 0.035));
      ctx.restore();
      ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 1.0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.lineWidth = Math.max(2, r * 0.08); ctx.strokeStyle = '#3b3b48'; ctx.stroke();
      C.rect(ctx, r * 0.86, -r * 0.2, r * 0.2, r * 0.34, r * 0.06, '#3b3b48', OL, Math.max(1.5, r * 0.04));
      ctx.beginPath(); ctx.moveTo(r * 0.92, r * 0.1); ctx.quadraticCurveTo(r * 0.8, r * 0.5, r * 0.4, r * 0.45);
      ctx.lineWidth = Math.max(1.5, r * 0.04); ctx.strokeStyle = '#3b3b48'; ctx.stroke();
      C.circle(ctx, r * 0.38, r * 0.45, r * 0.07, '#3b3b48', null);
    }
    var ey = -r * 0.08, ex = r * 0.36;
    C.ell(ctx, -ex - r * 0.12, r * 0.22, r * 0.17, r * 0.09, 0, 'rgba(255,120,140,0.55)', null);
    C.ell(ctx, ex + r * 0.12, r * 0.22, r * 0.17, r * 0.09, 0, 'rgba(255,120,140,0.55)', null);
    var lw = Math.max(2, r * 0.07);
    if (mood === 'happy') {
      [-1, 1].forEach(function (sd) { ctx.beginPath(); ctx.arc(sd * ex, ey + r * 0.05, r * 0.13, Math.PI * 1.1, Math.PI * 1.9); ctx.lineWidth = lw; ctx.strokeStyle = OL; ctx.lineCap = 'round'; ctx.stroke(); });
    } else if (mood === 'shock') {
      [-1, 1].forEach(function (sd) { C.circle(ctx, sd * ex, ey, r * 0.17, '#fff', OL, lw * 0.8); C.circle(ctx, sd * ex, ey, r * 0.04, OL, null); });
    } else {
      [-1, 1].forEach(function (sd) { C.ell(ctx, sd * ex, ey, r * 0.1, r * 0.15, 0, OL, null); C.circle(ctx, sd * ex + r * 0.03, ey - r * 0.06, r * 0.04, '#fff', null); });
      if (mood === 'angry') {
        [-1, 1].forEach(function (sd) { C.line(ctx, sd * (ex + r * 0.14), ey - r * 0.3, sd * (ex - r * 0.12), ey - r * 0.18, OL, lw); });
      }
    }
    var my = r * 0.3;
    if (mood === 'angry' || mood === 'shock') {
      C.ell(ctx, 0, my + r * 0.05, r * 0.16, r * (mood === 'shock' ? 0.18 : 0.12), 0, '#8a2236', OL, lw * 0.8);
    } else if (mood === 'happy') {
      ctx.beginPath(); ctx.moveTo(-r * 0.16, my - r * 0.02); ctx.quadraticCurveTo(0, my + r * 0.24, r * 0.16, my - r * 0.02); ctx.closePath();
      ctx.fillStyle = '#8a2236'; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = OL; ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(-r * 0.1, my); ctx.quadraticCurveTo(0, my + r * 0.1, r * 0.1, my);
      ctx.lineWidth = lw * 0.8; ctx.strokeStyle = OL; ctx.lineCap = 'round'; ctx.stroke();
    }
    if (mood === 'shock' || mood === 'angry') {
      ctx.beginPath(); var sx = r * 0.78, sy = -r * 0.45;
      ctx.moveTo(sx, sy - r * 0.16); ctx.quadraticCurveTo(sx + r * 0.11, sy + r * 0.05, sx, sy + r * 0.09); ctx.quadraticCurveTo(sx - r * 0.11, sy + r * 0.05, sx, sy - r * 0.16);
      ctx.fillStyle = '#bfe6ff'; ctx.fill(); ctx.lineWidth = Math.max(1.5, r * 0.035); ctx.strokeStyle = OL; ctx.stroke();
    }
    ctx.restore();
  }

  YG.Render = {
    FONT_SANS: FONT_SANS, FONT_SERIF: FONT_SERIF, FONT_ROUND: FONT_ROUND,
    eventP: eventP, drawClip: drawClip, drawSubtitle: drawSubtitle, buildSegments: buildSegments, segAt: segAt,
    drawTimeline: drawTimeline, drawEmpty: drawEmpty, drawChara: drawChara, subStyle: subStyle
  };
})(typeof window !== 'undefined' ? window : globalThis);
