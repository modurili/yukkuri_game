/* ゆっくり編集地獄 - 動画素材（すべてCanvasで描くオリジナルのアニメーション）
 * drawShot(ctx, shotId, t, time): 640x360 の論理座標に描く。
 * t = 素材の再生位置 0..1（演出でスロー・逆再生・静止される）、time = 経過秒（ちらつき等の環境アニメ用） */
(function (root) {
  'use strict';
  var YG = root.YG = root.YG || {};
  var W = 640, H = 360, TAU = Math.PI * 2;
  var OL = '#2b2533';

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function seg(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  function ease(t) { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function bump(t, a, m, b) { return t < a || t > b ? 0 : t < m ? ease((t - a) / (m - a)) : ease(1 - (t - m) / (b - m)); }
  function noise(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  function fs(ctx, fill, stroke, lw) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke !== null && stroke !== false) {
      ctx.lineWidth = lw || 3; ctx.strokeStyle = stroke || OL; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
    }
  }
  function circle(ctx, x, y, r, fill, stroke, lw) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); fs(ctx, fill, stroke, lw); }
  function ell(ctx, x, y, rx, ry, rot, fill, stroke, lw) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); fs(ctx, fill, stroke, lw); }
  function rrPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function rect(ctx, x, y, w, h, r, fill, stroke, lw) { rrPath(ctx, x, y, w, h, r || 0); fs(ctx, fill, stroke, lw); }
  function poly(ctx, pts, fill, stroke, lw, open) {
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    if (!open) ctx.closePath();
    fs(ctx, fill, stroke, lw);
  }
  function line(ctx, x1, y1, x2, y2, color, lw) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.lineWidth = lw || 3; ctx.strokeStyle = color || OL; ctx.lineCap = 'round'; ctx.stroke();
  }
  function vgrad(ctx, y0, y1, stops) {
    var g = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach(function (s, i) { g.addColorStop(i / (stops.length - 1), s); });
    return g;
  }
  function fillBg(ctx, stops, y0, y1) { ctx.fillStyle = vgrad(ctx, y0 || 0, y1 || H, stops); ctx.fillRect(0, y0 || 0, W, (y1 || H) - (y0 || 0)); }
  function glow(ctx, x, y, r, color, alpha) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    // 透明側も同じ色にしないと、黒へ補間されて濁る
    var m = /rgba?\(([^,]+),([^,]+),([^,)]+)/.exec(color);
    g.addColorStop(0, color); g.addColorStop(1, m ? 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',0)' : 'rgba(255,255,255,0)');
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
  }
  function star(ctx, x, y, r, fill, rot) {
    ctx.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = (rot || 0) + i * Math.PI / 4, rr = i % 2 ? r * 0.35 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  function steam(ctx, x, y, h, t, alpha, width) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = width || 6; ctx.lineCap = 'round';
    for (var k = 0; k < 3; k++) {
      ctx.beginPath();
      var ox = x + (k - 1) * 26;
      for (var i = 0; i <= 12; i++) {
        var yy = y - i * h / 12, xx = ox + Math.sin(i * 0.7 + t * 9 + k * 2) * 8;
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------- 共通パーツ ----------------
  function parkBg(ctx, t) {
    fillBg(ctx, ['#7cc8ff', '#c9ecff'], 0, 210);
    cloud(ctx, 120 + t * 30, 60, 1); cloud(ctx, 470 + t * 20, 40, 0.8);
    for (var i = 0; i < 7; i++) {
      var x = i * 105 - 20;
      rect(ctx, x + 18, 140, 14, 60, 3, '#8a5a3a', null);
      circle(ctx, x + 25, 130, 46 + (i % 2) * 8, i % 2 ? '#4fa45a' : '#5cb766', null);
    }
    fillBg(ctx, ['#86d16b', '#5fb653'], 200, H);
    ctx.beginPath(); ctx.ellipse(320, 400, 420, 150, 0, 0, TAU); ctx.fillStyle = '#e9d6a6'; ctx.fill();
  }
  function cloud(ctx, x, y, s) {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    [[0, 0, 26], [24, -10, 30], [52, 0, 24], [26, 8, 26]].forEach(function (c) {
      ctx.beginPath(); ctx.arc(x + c[0] * s, y + c[1] * s, c[2] * s, 0, TAU); ctx.fill();
    });
  }
  function kitchenBg(ctx, dark) {
    ctx.fillStyle = dark ? '#3a4766' : '#f4f7fb'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.06)' : '#d6e2ef'; ctx.lineWidth = 2;
    for (var x = 0; x <= W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 270); ctx.stroke(); }
    for (var y = 0; y <= 270; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.fillStyle = dark ? '#5a4030' : '#c98f5d'; ctx.fillRect(0, 270, W, 90);
    ctx.fillStyle = dark ? '#6b4c38' : '#dba36f'; ctx.fillRect(0, 270, W, 10);
  }
  function roomBg(ctx, dim) {
    fillBg(ctx, dim ? ['#c9a98a', '#a88466'] : ['#fbead2', '#f2d9b8'], 0, 250);
    ctx.fillStyle = dim ? 'rgba(120,80,50,0.18)' : 'rgba(210,150,100,0.18)';
    for (var x = 20; x < W; x += 60) ctx.fillRect(x, 0, 18, 250);
    fillBg(ctx, dim ? ['#9a6f4c', '#7c5639'] : ['#d6a273', '#bf8858'], 250, H);
    ctx.strokeStyle = 'rgba(80,40,20,0.25)'; ctx.lineWidth = 2;
    for (var i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, 262 + i * 18); ctx.lineTo(W, 262 + i * 18); ctx.stroke(); }
  }

  // おじさん（オリジナル）。face: 'front' | 'back'。turn: 0..1 で背中→正面
  function ojisanHead(ctx, x, y, r, opt) {
    opt = opt || {};
    var turn = opt.turn == null ? 1 : opt.turn;
    var skin = '#f6cfa6';
    circle(ctx, x - r * 0.98, y + r * 0.08, r * 0.2, skin, OL, 3);
    circle(ctx, x + r * 0.98, y + r * 0.08, r * 0.2, skin, OL, 3);
    circle(ctx, x, y, r, skin, OL, 4);
    // 横と後ろの白髪
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r - 2, 0, TAU); ctx.clip();
    ctx.fillStyle = '#a4a4ad';
    ell(ctx, x - r * 0.92, y + r * 0.05, r * 0.28, r * 0.42, 0, '#a4a4ad', null);
    ell(ctx, x + r * 0.92, y + r * 0.05, r * 0.28, r * 0.42, 0, '#a4a4ad', null);
    if (turn < 1) {
      ctx.globalAlpha = 1 - turn;
      ell(ctx, x, y + r * 0.55, r * 1.0, r * 0.45, 0, '#a4a4ad', null);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    line(ctx, x - r * 0.25, y - r * 0.82, x + r * 0.3, y - r * 0.9, '#7d7d86', 3);
    if (turn <= 0) return;
    var fx = x + (1 - turn) * -r * 0.9;
    ctx.save(); ctx.globalAlpha = clamp(turn * 1.4, 0, 1);
    ctx.beginPath(); ctx.arc(x, y, r - 2, 0, TAU); ctx.clip();
    var serious = !!opt.serious;
    // 眉
    ctx.lineWidth = r * 0.07; ctx.strokeStyle = '#5b5b63'; ctx.lineCap = 'round';
    ctx.beginPath();
    if (serious) { ctx.moveTo(fx - r * 0.55, y - r * 0.38); ctx.lineTo(fx - r * 0.15, y - r * 0.24); ctx.moveTo(fx + r * 0.55, y - r * 0.38); ctx.lineTo(fx + r * 0.15, y - r * 0.24); }
    else { ctx.moveTo(fx - r * 0.52, y - r * 0.3); ctx.lineTo(fx - r * 0.18, y - r * 0.33); ctx.moveTo(fx + r * 0.52, y - r * 0.3); ctx.lineTo(fx + r * 0.18, y - r * 0.33); }
    ctx.stroke();
    // メガネと目
    [-1, 1].forEach(function (sd) {
      var ex = fx + sd * r * 0.36, ey = y - r * 0.05;
      circle(ctx, ex, ey, r * 0.24, 'rgba(220,240,255,0.45)', OL, Math.max(2, r * 0.05));
      if (serious) {
        ell(ctx, ex, ey, r * 0.1, r * 0.13, 0, '#1d1a22', null);
        circle(ctx, ex + r * 0.04, ey - r * 0.05, r * 0.04, '#fff', null);
      } else {
        ell(ctx, ex, ey, r * 0.06, r * 0.08, 0, '#1d1a22', null);
      }
    });
    line(ctx, fx - r * 0.12, y - r * 0.05, fx + r * 0.12, y - r * 0.05, OL, Math.max(2, r * 0.05));
    // ヒゲと口
    ctx.beginPath();
    ctx.moveTo(fx - r * 0.42, y + r * 0.42);
    ctx.quadraticCurveTo(fx - r * 0.2, y + r * 0.18, fx, y + r * 0.3);
    ctx.quadraticCurveTo(fx + r * 0.2, y + r * 0.18, fx + r * 0.42, y + r * 0.42);
    ctx.quadraticCurveTo(fx, y + r * 0.38, fx - r * 0.42, y + r * 0.42);
    fs(ctx, '#55555e', null);
    line(ctx, fx - r * 0.12, y + r * 0.55, fx + r * 0.12, y + r * 0.55, OL, Math.max(2, r * 0.04));
    if (opt.blush) { ell(ctx, fx - r * 0.62, y + r * 0.25, r * 0.13, r * 0.07, 0, 'rgba(255,120,120,0.5)', null); ell(ctx, fx + r * 0.62, y + r * 0.25, r * 0.13, r * 0.07, 0, 'rgba(255,120,120,0.5)', null); }
    if (opt.sweat) {
      ctx.beginPath(); var sx = fx + r * 0.75, sy = y - r * 0.45;
      ctx.moveTo(sx, sy - r * 0.18); ctx.quadraticCurveTo(sx + r * 0.12, sy + r * 0.05, sx, sy + r * 0.1); ctx.quadraticCurveTo(sx - r * 0.12, sy + r * 0.05, sx, sy - r * 0.18);
      fs(ctx, '#bfe6ff', OL, 2);
    }
    ctx.restore();
  }

  function pigeon(ctx, x, y, s, peck, look) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    line(ctx, -8, -12, -12, 0, '#e86a7a', 4); line(ctx, 8, -12, 6, 0, '#e86a7a', 4);
    line(ctx, -18, 0, -4, 0, '#e86a7a', 3); line(ctx, 0, 0, 14, 0, '#e86a7a', 3);
    poly(ctx, [-50, -40, -78, -30, -74, -46], '#6e7689', OL, 3);
    ell(ctx, -10, -36, 46, 28, 0, '#a3abbd', OL, 3);
    ell(ctx, -20, -40, 30, 17, -0.15, '#8790a5', OL, 3);
    line(ctx, -36, -42, -14, -36, '#4a5063', 3); line(ctx, -34, -34, -12, -30, '#4a5063', 3);
    var hx = 30 + peck * 10, hy = -76 + peck * 26;
    ctx.beginPath(); ctx.moveTo(14, -50); ctx.quadraticCurveTo(hx - 6, hy + 10, hx, hy); ctx.lineTo(hx + 10, hy + 14); ctx.quadraticCurveTo(30, -40, 22, -26); ctx.closePath();
    var g = ctx.createLinearGradient(10, -60, 34, -40); g.addColorStop(0, '#7fd1b0'); g.addColorStop(1, '#a37fd1');
    fs(ctx, g, OL, 3);
    if (look > 0.5) {
      circle(ctx, hx, hy, 17, '#a3abbd', OL, 3);
      [-7, 7].forEach(function (d) { circle(ctx, hx + d, hy - 2, 6, '#ff9a2e', OL, 2); circle(ctx, hx + d, hy - 2, 2.6, '#111', null); });
      poly(ctx, [hx - 4, hy + 5, hx + 4, hy + 5, hx, hy + 13], '#3b3b44', OL, 2);
      circle(ctx, hx, hy + 4, 3, '#f2f2f2', null);
    } else {
      circle(ctx, hx, hy, 16, '#a3abbd', OL, 3);
      poly(ctx, [hx + 13, hy - 3, hx + 27, hy + 2, hx + 13, hy + 5], '#3b3b44', OL, 2);
      circle(ctx, hx + 12, hy - 3, 3, '#f2f2f2', null);
      circle(ctx, hx + 4, hy - 4, 5, '#ff9a2e', OL, 2); circle(ctx, hx + 5, hy - 4, 2.2, '#111', null);
    }
    ctx.restore();
  }

  function catHead(ctx, x, y, r, o) {
    o = o || {};
    var fur = o.fur || '#f5a54a', inner = '#ffb3c1';
    [-1, 1].forEach(function (sd) {
      var tw = sd === 1 ? (o.twitch || 0) : 0;
      ctx.save(); ctx.translate(x + sd * r * 0.6, y - r * 0.6); ctx.rotate(sd * 0.2 + tw);
      poly(ctx, [-r * 0.38, r * 0.25, 0, -r * 0.55, r * 0.38, r * 0.25], fur, OL, 3);
      poly(ctx, [-r * 0.2, r * 0.18, 0, -r * 0.3, r * 0.2, r * 0.18], inner, null);
      ctx.restore();
    });
    ell(ctx, x, y, r, r * 0.88, 0, fur, OL, 3.5);
    ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, r - 2, r * 0.88 - 2, 0, 0, TAU); ctx.clip();
    ctx.fillStyle = o.stripe || '#d9822b';
    [-0.3, 0, 0.3].forEach(function (d) { ell(ctx, x + d * r, y - r * 0.78, r * 0.07, r * 0.25, 0, o.stripe || '#d9822b', null); });
    ell(ctx, x, y + r * 0.42, r * 0.55, r * 0.38, 0, '#fff1df', null);
    ctx.restore();
  }
  function catEyes(ctx, x, y, r, mode) {
    [-1, 1].forEach(function (sd) {
      var ex = x + sd * r * 0.38, ey = y - r * 0.05;
      if (mode === 'closed') {
        ctx.beginPath(); ctx.arc(ex, ey - r * 0.04, r * 0.14, 0.15 * Math.PI, 0.85 * Math.PI); ctx.lineWidth = 3; ctx.strokeStyle = OL; ctx.stroke();
      } else if (mode === 'squeeze') {
        ctx.beginPath(); ctx.moveTo(ex - sd * r * 0.16, ey - r * 0.1); ctx.lineTo(ex + sd * r * 0.12, ey); ctx.lineTo(ex - sd * r * 0.16, ey + r * 0.1);
        ctx.lineWidth = 3.5; ctx.strokeStyle = OL; ctx.lineCap = 'round'; ctx.stroke();
      } else {
        var big = mode === 'big';
        ell(ctx, ex, ey, r * (big ? 0.2 : 0.15), r * (big ? 0.22 : 0.17), 0, '#2b2533', null);
        circle(ctx, ex + r * 0.05, ey - r * 0.07, r * (big ? 0.07 : 0.05), '#fff', null);
      }
    });
  }
  function catNose(ctx, x, y, r) {
    poly(ctx, [x - r * 0.08, y, x + r * 0.08, y, x, y + r * 0.07], '#ff7f98', OL, 2);
  }
  function whiskers(ctx, x, y, r) {
    ctx.strokeStyle = OL; ctx.lineWidth = 2;
    [-1, 1].forEach(function (sd) {
      for (var k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x + sd * r * 0.42, y + k * r * 0.07); ctx.lineTo(x + sd * r * 0.95, y + k * r * 0.14 - r * 0.03); ctx.stroke(); }
    });
  }

  function cupNoodle(ctx, x, y, s, opt) {
    opt = opt || {};
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    poly(ctx, [-70, -90, 70, -90, 52, 70, -52, 70], '#fbfbf8', OL, 4);
    poly(ctx, [-64, -50, 64, -50, 60, -10, -60, -10], '#e8423f', null);
    ctx.fillStyle = '#fff'; ctx.font = '900 22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ラーメン', 0, -30);
    poly(ctx, [-56, 20, 56, 20, 54, 32, -54, 32], '#f2c14e', null);
    ell(ctx, 0, -90, 72, 14, 0, opt.open ? '#c98a3c' : '#e9e9ef', OL, 4);
    if (opt.open) {
      ctx.save(); ctx.beginPath(); ctx.ellipse(0, -90, 68, 11, 0, 0, TAU); ctx.clip();
      ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 3;
      for (var i = -60; i < 60; i += 9) { ctx.beginPath(); ctx.moveTo(i, -98); ctx.quadraticCurveTo(i + 5, -90, i, -82); ctx.stroke(); }
      circle(ctx, -24, -91, 9, '#fff', OL, 2); circle(ctx, -24, -91, 4, '#ffcf3a', null);
      ell(ctx, 22, -90, 10, 6, 0, '#fff', OL, 2); ctx.beginPath(); ctx.arc(22, -90, 4, 0, 5); ctx.strokeStyle = '#ff7aa8'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#5bbf5b'; [[0, -94], [10, -86], [-8, -86], [40, -92]].forEach(function (p) { ctx.fillRect(p[0], p[1], 5, 4); });
      ctx.restore();
    }
    ctx.restore();
  }
  function lidFlap(ctx, x, y, s, angle) {
    ctx.save(); ctx.translate(x + 62 * s, y - 90 * s); ctx.rotate(angle); ctx.scale(s, s);
    ell(ctx, -62, 0, 64, 13, 0, '#f2f2f6', OL, 4);
    ctx.fillStyle = '#e8423f'; ctx.font = '900 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('3分', -62, 5);
    ctx.restore();
  }
  function fryPan(ctx, x, y, rx, ry, handle) {
    if (handle) { ctx.save(); ctx.translate(x + rx * 0.95 * handle, y); rect(ctx, handle > 0 ? 0 : -150, -12, 150, 24, 10, '#3b2b22', OL, 3); ctx.restore(); }
    ell(ctx, x, y + 10, rx, ry, 0, '#2a2a30', OL, 4);
    ell(ctx, x, y, rx - 10, ry - 8, 0, '#45454f', null);
    ell(ctx, x - rx * 0.3, y - ry * 0.25, rx * 0.25, ry * 0.18, -0.2, 'rgba(255,255,255,0.12)', null);
  }
  function friedEgg(ctx, x, y, s, rot, flip) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.scale(s, s * (flip == null ? 1 : flip));
    var back = flip != null && flip < 0;
    ctx.beginPath();
    for (var i = 0; i <= 16; i++) { var a = i / 16 * TAU, r = 52 + Math.sin(a * 3) * 7 + Math.cos(a * 5) * 4; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.75); }
    ctx.closePath(); fs(ctx, back ? '#f0d9a8' : '#ffffff', OL, 3);
    if (!back) { circle(ctx, -4, -2, 20, '#ffbf1f', OL, 3); circle(ctx, -10, -8, 6, 'rgba(255,255,255,0.7)', null); }
    else { ell(ctx, 0, 0, 30, 18, 0, 'rgba(180,120,40,0.35)', null); }
    ctx.restore();
  }

  // ---------------- 素材カット ----------------
  var SHOTS = {
    // ===== 公園 =====
    hato: function (ctx, t) {
      parkBg(ctx, t);
      ell(ctx, 520, 300, 30, 8, 0, 'rgba(0,0,0,0.12)', null);
      [[90, 300], [540, 320], [200, 330]].forEach(function (p) { circle(ctx, p[0], p[1], 3, '#c9a76a', null); });
      var walk = ease(seg(t, 0, 0.5)), x = lerp(170, 380, walk);
      var peck = t < 0.5 ? Math.max(0, Math.sin(t * 46)) : 0;
      var look = seg(t, 0.5, 0.56);
      ell(ctx, x, 302, 48, 8, 0, 'rgba(0,0,0,0.15)', null);
      pigeon(ctx, x, 300, 1.5, peck, look);
    },
    bench: function (ctx, t) {
      parkBg(ctx, t * 0.3);
      rect(ctx, 170, 180, 300, 18, 4, '#b8794a', OL, 3); rect(ctx, 170, 206, 300, 18, 4, '#b8794a', OL, 3);
      rect(ctx, 190, 250, 14, 70, 3, '#6b4a33', OL, 3); rect(ctx, 436, 250, 14, 70, 3, '#6b4a33', OL, 3);
      rect(ctx, 286, 280, 26, 60, 8, '#4a4a55', OL, 3); rect(ctx, 328, 280, 26, 60, 8, '#4a4a55', OL, 3);
      ell(ctx, 296, 340, 24, 10, 0, '#2b2533', null); ell(ctx, 344, 340, 24, 10, 0, '#2b2533', null);
      rect(ctx, 270, 170, 100, 110, 30, '#8a6440', OL, 3);
      rect(ctx, 160, 244, 320, 20, 4, '#c98a57', OL, 3);
      var low = ease(seg(t, 0.4, 0.52));
      ojisanHead(ctx, 320, 140, 38, { serious: t > 0.55, turn: 1 });
      var ny = 128 + low * 78;
      ctx.save(); ctx.translate(320, ny); ctx.rotate(-0.04);
      rect(ctx, -86, -50, 172, 104, 4, '#f3f0e3', OL, 3);
      line(ctx, 0, -50, 0, 54, '#c9c4b0', 2);
      rect(ctx, -76, -40, 66, 14, 2, '#3b3b44', null);
      ctx.fillStyle = '#b9b4a1';
      for (var i = 0; i < 5; i++) { ctx.fillRect(-76, -18 + i * 12, 66, 5); ctx.fillRect(10, -40 + i * 16, 66, 6); }
      ctx.restore();
      [-1, 1].forEach(function (sd) { circle(ctx, 320 + sd * 92, ny + 10, 13, '#f6cfa6', OL, 3); });
    },
    vending: function (ctx, t, time) {
      fillBg(ctx, ['#b9b0a8', '#a39a92'], 0, 300);
      ctx.strokeStyle = 'rgba(80,60,50,0.25)'; ctx.lineWidth = 2;
      for (var y = 0; y < 300; y += 30) for (var x = (y / 30) % 2 ? 0 : 30; x < W; x += 60) ctx.strokeRect(x, y, 60, 30);
      ctx.fillStyle = '#8c8c94'; ctx.fillRect(0, 300, W, 60);
      var shake = t > 0.58 && t < 0.7 ? Math.sin(time * 90) * 3 : 0;
      ctx.save(); ctx.translate(shake, 0);
      rect(ctx, 220, 26, 200, 300, 14, '#e8423f', OL, 4);
      rect(ctx, 236, 44, 168, 128, 8, '#eaf6ff', OL, 3);
      var cols = ['#4aa3ff', '#ffb02e', '#43c66b', '#ff6fa8', '#8d6bff'];
      for (var r = 0; r < 3; r++) for (var c = 0; c < 5; c++) {
        rect(ctx, 246 + c * 31, 52 + r * 40, 20, 30, 6, cols[(r * 2 + c) % 5], OL, 2);
        var lit = r === 1 && c === 2 && t < 0.6 && Math.floor(time * 6) % 2 === 0;
        circle(ctx, 256 + c * 31, 86 + r * 40, 3, lit ? '#ffef5a' : '#c94040', null);
      }
      rect(ctx, 236, 186, 110, 40, 6, '#c33532', OL, 3);
      ctx.fillStyle = '#fff'; ctx.font = '900 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('つめた〜い', 291, 206);
      rect(ctx, 360, 186, 44, 70, 6, '#d0d0d8', OL, 3); rect(ctx, 376, 196, 12, 30, 3, '#2b2533', null);
      rect(ctx, 250, 268, 140, 46, 8, '#2b2533', OL, 3);
      ctx.restore();
      if (t >= 0.6) {
        var b = easeOut(seg(t, 0.6, 0.75));
        var cy = lerp(262, 292, b) - Math.abs(Math.sin(seg(t, 0.6, 0.9) * Math.PI * 2)) * 6 * (1 - seg(t, 0.6, 0.9));
        ctx.save(); ctx.translate(320, cy); ctx.rotate(Math.PI / 2);
        rect(ctx, -18, -34, 36, 68, 8, '#ffb02e', OL, 3); rect(ctx, -18, -10, 36, 20, 0, '#ffffff', null);
        ctx.restore();
        if (t > 0.62) star(ctx, 360, 274, 12 * bump(t, 0.62, 0.72, 0.95), '#fff7a0', t * 3);
      }
    },
    hat: function (ctx, t) {
      fillBg(ctx, ['#5bb8ff', '#bfe8ff']);
      cloud(ctx, 60 + t * 120, 70, 1.1); cloud(ctx, 380 + t * 160, 120, 0.9); cloud(ctx, 520 + t * 90, 40, 0.7);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      for (var i = 0; i < 6; i++) {
        var wx = ((i * 140 + t * 900) % 820) - 120, wy = 60 + i * 50;
        ctx.beginPath(); ctx.moveTo(wx, wy); ctx.quadraticCurveTo(wx + 60, wy - 14, wx + 120, wy); ctx.stroke();
      }
      ctx.fillStyle = '#5cb766'; ctx.beginPath(); ctx.arc(-20, 330, 140, 0, TAU); ctx.fill();
      ctx.fillStyle = '#4fa45a'; ctx.beginPath(); ctx.arc(660, 360, 120, 0, TAU); ctx.fill();
      var x = lerp(70, 590, t), y = 300 - Math.sin(t * Math.PI) * 210;
      for (var k = 0; k < 4; k++) {
        var lt = clamp(t - 0.04 * (k + 1), 0, 1);
        var lx = lerp(70, 590, lt) - 20 + k * 6, ly = 300 - Math.sin(lt * Math.PI) * 210 + 30 + k * 8;
        ell(ctx, lx, ly, 10, 5, lt * 20 + k, '#7bc95b', OL, 2);
      }
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 12) * 0.6);
      ell(ctx, 0, 8, 52, 13, 0, '#6b4a2b', OL, 3);
      ctx.beginPath(); ctx.moveTo(-30, 8); ctx.quadraticCurveTo(-30, -36, 0, -34); ctx.quadraticCurveTo(30, -36, 30, 8); ctx.closePath();
      fs(ctx, '#7d5733', OL, 3);
      rect(ctx, -30, -6, 60, 10, 2, '#2b2533', null);
      ctx.restore();
    },
    turn: function (ctx, t) {
      fillBg(ctx, ['#a6dcff', '#d9f1ff'], 0, 200);
      fillBg(ctx, ['#97d47e', '#6fbf5d'], 200, H);
      glow(ctx, 120, 150, 90, 'rgba(80,170,90,0.9)', 0.8); glow(ctx, 540, 140, 110, 'rgba(80,170,90,0.9)', 0.7);
      var u = ease(seg(t, 0.48, 0.7));
      var dark = seg(t, 0.68, 0.8) * 0.35;
      ctx.fillStyle = 'rgba(20,10,40,' + dark + ')'; ctx.fillRect(0, 0, W, H);
      rect(ctx, 150, 280, 340, 120, 60, '#8a6440', OL, 4);
      poly(ctx, [280, 282, 320, 330, 360, 282], '#f3f0e3', OL, 3);
      ojisanHead(ctx, 320, 175, 110, { turn: u, serious: t > 0.66, sweat: t > 0.75 });
      if (t > 0.72) {
        var g = bump(t, 0.72, 0.76, 0.86);
        star(ctx, 262, 160, 26 * g, '#ffffff', 0.3); star(ctx, 378, 160, 20 * g, '#ffffff', 0.3);
      }
    },
    sunset: function (ctx, t) {
      fillBg(ctx, ['#3b2a6b', '#b8457a', '#ff7a59', '#ffcf6b'], 0, 270);
      var sy = lerp(185, 252, t);
      glow(ctx, 320, sy, 170, 'rgba(255,220,140,0.9)', 0.9);
      circle(ctx, 320, sy, 52, '#fff1a8', null);
      if (t > 0.55) { var g = bump(t, 0.55, 0.65, 0.95); ctx.save(); ctx.globalAlpha = g; star(ctx, 320, 262, 70, 'rgba(255,255,220,0.9)', 0); ctx.restore(); }
      ctx.fillStyle = '#2b1f3a';
      ctx.fillRect(0, 262, W, 100);
      for (var i = 0; i < 9; i++) { var tx = i * 80 - 10; circle(ctx, tx, 262, 30 + (i % 3) * 10, '#2b1f3a', null); }
      ctx.fillRect(480, 180, 8, 90); circle(ctx, 484, 180, 12, '#ffdf8a', null);
      ctx.fillRect(150, 286, 120, 10); ctx.fillRect(158, 296, 8, 30); ctx.fillRect(254, 296, 8, 30); ctx.fillRect(150, 262, 120, 8);
      ctx.strokeStyle = 'rgba(255,200,120,0.35)'; ctx.lineWidth = 3;
      for (var k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(280 - k * 6, 300 + k * 14); ctx.lineTo(360 + k * 6, 300 + k * 14); ctx.stroke(); }
      for (var c = 0; c < 3; c++) {
        var cx = lerp(600, 40, t) + c * 50, cy = 90 + c * 22 + Math.sin(t * 20 + c) * 4, f = Math.sin(t * 40 + c * 2) * 8;
        ctx.beginPath(); ctx.moveTo(cx - 16, cy - f); ctx.quadraticCurveTo(cx - 8, cy - 4, cx, cy); ctx.quadraticCurveTo(cx + 8, cy - 4, cx + 16, cy - f);
        ctx.lineWidth = 4; ctx.strokeStyle = '#1b1226'; ctx.stroke();
      }
    },

    // ===== 猫 =====
    sleep: function (ctx, t) {
      roomBg(ctx);
      rect(ctx, 420, 40, 150, 110, 6, '#d6f0ff', OL, 4); line(ctx, 495, 40, 495, 150, OL, 3); line(ctx, 420, 95, 570, 95, OL, 3);
      ell(ctx, 320, 292, 170, 42, 0, '#7aa6d9', OL, 4); ell(ctx, 320, 284, 150, 30, 0, '#94bbe6', null);
      var br = Math.sin(t * Math.PI * 4) * 4;
      ctx.beginPath(); ctx.moveTo(420, 270); ctx.quadraticCurveTo(470, 300, 400, 300); ctx.quadraticCurveTo(300, 310, 250, 290);
      ctx.lineWidth = 24; ctx.strokeStyle = OL; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineWidth = 18; ctx.strokeStyle = '#f5a54a'; ctx.stroke();
      ell(ctx, 340, 250 - br / 2, 110, 52 + br, 0, '#f5a54a', OL, 4);
      ctx.save(); ctx.beginPath(); ctx.ellipse(340, 250 - br / 2, 108, 50 + br, 0, 0, TAU); ctx.clip();
      ctx.fillStyle = '#d9822b'; [300, 340, 380, 420].forEach(function (x) { ell(ctx, x, 206, 10, 26, 0.2, '#d9822b', null); });
      ctx.restore();
      var tw = bump(t, 0.45, 0.5, 0.58) * 0.5;
      catHead(ctx, 250, 245, 52, { twitch: tw });
      catEyes(ctx, 250, 245, 52, 'closed'); catNose(ctx, 250, 258, 52); whiskers(ctx, 250, 262, 52);
      ctx.fillStyle = '#5a6fa8'; ctx.font = '900 30px sans-serif'; ctx.textAlign = 'center';
      for (var z = 0; z < 3; z++) {
        var zt = (t * 1.5 + z / 3) % 1;
        ctx.globalAlpha = Math.sin(zt * Math.PI); ctx.font = '900 ' + (20 + z * 6) + 'px sans-serif';
        ctx.fillText('Z', 210 - zt * 30 - z * 4, 180 - zt * 80); ctx.globalAlpha = 1;
      }
    },
    yawn: function (ctx, t) {
      fillBg(ctx, ['#f2d9b8', '#e6c49a']);
      glow(ctx, 520, 80, 160, 'rgba(255,255,255,0.8)', 0.7);
      var u = bump(t, 0.15, 0.5, 0.85);
      var x = 320, y = 205 - u * 8, r = 150;
      catHead(ctx, x, y + 20, r);
      catEyes(ctx, x, y + 10, r, u > 0.3 ? 'squeeze' : 'normal');
      var my = y + 70, mw = 26 + u * 70, mh = 6 + u * 82;
      catNose(ctx, x, y + 38 - u * 10, r);
      if (u > 0.05) {
        ell(ctx, x, my + mh * 0.35, mw, mh, 0, '#7a1f2b', OL, 4);
        ell(ctx, x, my + mh * 0.95, mw * 0.6, mh * 0.35, 0, '#ff8fa3', null);
        var fl = u * 30;
        [-1, 1].forEach(function (sd) {
          poly(ctx, [x + sd * mw * 0.55, my - mh * 0.55, x + sd * mw * 0.35, my - mh * 0.55, x + sd * mw * 0.47, my - mh * 0.55 + fl], '#ffffff', OL, 2);
          poly(ctx, [x + sd * mw * 0.5, my + mh * 1.2, x + sd * mw * 0.3, my + mh * 1.2, x + sd * mw * 0.4, my + mh * 1.2 - fl * 0.7], '#ffffff', OL, 2);
        });
      } else {
        ctx.beginPath(); ctx.moveTo(x - 20, my - 4); ctx.quadraticCurveTo(x - 10, my + 6, x, my - 2); ctx.quadraticCurveTo(x + 10, my + 6, x + 20, my - 4);
        ctx.lineWidth = 3; ctx.strokeStyle = OL; ctx.stroke();
      }
      whiskers(ctx, x, y + 50, r);
    },
    hall: function (ctx, t, time) {
      ctx.fillStyle = '#1c1720'; ctx.fillRect(0, 0, W, H);
      poly(ctx, [0, 0, 250, 110, 250, 230, 0, H], '#3a3340', null);
      poly(ctx, [W, 0, 390, 110, 390, 230, W, H], '#332c38', null);
      poly(ctx, [0, H, 250, 230, 390, 230, W, H], '#2e2522', null);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
      for (var i = -4; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(320 + i * 16, 230); ctx.lineTo(320 + i * 150, H); ctx.stroke(); }
      poly(ctx, [60, 90, 150, 120, 150, 180, 60, 190], '#4a3d33', '#1a141c', 3);
      poly(ctx, [580, 80, 480, 116, 480, 176, 580, 190], '#4a3d33', '#1a141c', 3);
      rect(ctx, 270, 116, 100, 114, 2, '#0a080c', '#1a141c', 3);
      var open = ease(seg(t, 0.55, 0.65)) * (1 - seg(t, 0.88, 0.98));
      ctx.save(); ctx.translate(270, 116);
      poly(ctx, [0, 0, 100 - open * 34, open * 8, 100 - open * 34, 114 - open * 8, 0, 114], '#5a4636', '#1a141c', 3);
      circle(ctx, 84 - open * 34, 60, 4, '#c9a24a', null);
      ctx.restore();
      if (open > 0.3) {
        var ea = clamp((open - 0.3) * 2, 0, 1);
        ctx.save(); ctx.globalAlpha = ea;
        glow(ctx, 352, 160, 30, 'rgba(255,230,80,0.9)', 0.6);
        ell(ctx, 346, 158, 5, 3.5, 0, '#ffe55a', null); ell(ctx, 360, 158, 5, 3.5, 0, '#ffe55a', null);
        ctx.restore();
      }
      var fl = (Math.sin(time * 23) + Math.sin(time * 7.3) > 1.2 || (t > 0.55 && t < 0.62)) ? 0.25 : 1;
      line(ctx, 320, 0, 320, 40, '#0e0b10', 3);
      poly(ctx, [296, 40, 344, 40, 334, 58, 306, 58], '#55505c', '#0e0b10', 2);
      glow(ctx, 320, 70, 220, 'rgba(255,240,190,0.55)', fl);
      var v = ctx.createRadialGradient(320, 180, 120, 320, 180, 420);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    },
    box: function (ctx, t) {
      roomBg(ctx, true);
      var amp = 1 + 9 * seg(t, 0.15, 0.68), pop = easeOut(seg(t, 0.68, 0.8));
      var sx = Math.sin(t * 95) * amp * (1 - pop), rot = Math.sin(t * 70) * amp * 0.004 * (1 - pop);
      ell(ctx, 320, 312, 130, 14, 0, 'rgba(0,0,0,0.25)', null);
      ctx.save(); ctx.translate(320 + sx, 300); ctx.rotate(rot);
      if (pop > 0) {
        var cy = lerp(-100, -150, pop);
        catHead(ctx, 0, cy, 62);
        catEyes(ctx, 0, cy, 62, 'big');
        catNose(ctx, 0, cy + 14, 62);
      }
      poly(ctx, [-100, -120, 100, -120, 100, 0, -100, 0], '#c8955a', OL, 4);
      poly(ctx, [100, -120, 130, -140, 130, -24, 100, 0], '#a8773f', OL, 4);
      var fl = pop * 0.9;
      poly(ctx, [-100, -120, -100 - 20 * fl, -120 - 50 * (0.3 + fl), 0, -120 - 40 * (0.2 + fl * 0.6), 0, -120], '#d6a46a', OL, 3);
      poly(ctx, [100, -120, 100 + 30 * fl, -120 - 50 * (0.3 + fl), 0, -120 - 40 * (0.2 + fl * 0.6), 0, -120], '#d6a46a', OL, 3);
      rect(ctx, -100, -70, 200, 16, 0, 'rgba(220,190,140,0.8)', null);
      ctx.fillStyle = '#e8781e'; ctx.font = '900 26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('みかん', 0, -30);
      ctx.restore();
    },
    stare: function (ctx, t) {
      fillBg(ctx, ['#100c16', '#05040a']);
      var s = 1 + t * 0.15;
      ctx.save(); ctx.translate(320, 200); ctx.scale(s, s); ctx.translate(-320, -200);
      poly(ctx, [190, 120, 215, 30, 270, 95], '#1d1724', null); poly(ctx, [450, 120, 425, 30, 370, 95], '#1d1724', null);
      ell(ctx, 320, 190, 150, 120, 0, '#1d1724', null);
      ell(ctx, 320, 400, 210, 140, 0, '#1d1724', null);
      var o = ease(seg(t, 0.56, 0.64));
      [-1, 1].forEach(function (sd) {
        var ex = 320 + sd * 52, ey = 165;
        if (o < 0.05) { line(ctx, ex - 22, ey, ex + 22, ey, '#3a3348', 4); return; }
        glow(ctx, ex, ey, 70, 'rgba(190,255,90,0.85)', o * 0.8);
        ell(ctx, ex, ey, 28, 22 * o, 0, '#d6ff5a', '#0b0910', 3);
        ell(ctx, ex, ey, 5, 19 * o, 0, '#0b0910', null);
        circle(ctx, ex + 8, ey - 7 * o, 5 * o, '#ffffff', null);
      });
      ctx.restore();
    },
    punch: function (ctx, t) {
      roomBg(ctx);
      rect(ctx, 200, 230, 240, 160, 90, '#f5a54a', OL, 4);
      catHead(ctx, 320, 190, 82);
      catEyes(ctx, 320, 190, 82, t > 0.3 && t < 0.7 ? 'big' : 'normal');
      catNose(ctx, 320, 204, 82); whiskers(ctx, 320, 208, 82);
      var u = t < 0.5 ? Math.pow(seg(t, 0.2, 0.5), 2) : 1 - ease(seg(t, 0.62, 0.95));
      var px = lerp(440, 320, u), py = lerp(250, 185, u), pr = lerp(34, 210, u);
      ctx.save(); ctx.translate(px, py);
      if (u < 0.3) { ctx.beginPath(); ctx.moveTo(-pr * 0.5, pr * 0.6); ctx.lineTo(-40, 120); ctx.lineWidth = pr * 1.1; ctx.strokeStyle = '#f5a54a'; ctx.stroke(); }
      circle(ctx, 0, 0, pr, '#f5a54a', OL, 3 + u * 6);
      ell(ctx, 0, pr * 0.2, pr * 0.42, pr * 0.34, 0, '#ff9fb3', null);
      [[-0.45, -0.32], [-0.16, -0.55], [0.16, -0.55], [0.45, -0.32]].forEach(function (p) { ell(ctx, p[0] * pr, p[1] * pr, pr * 0.15, pr * 0.18, 0, '#ff9fb3', null); });
      ctx.restore();
    },

    // ===== 目玉焼き =====
    egg: function (ctx, t) {
      kitchenBg(ctx);
      ell(ctx, 320, 300, 120, 22, 0, 'rgba(0,0,0,0.15)', null);
      ctx.beginPath(); ctx.moveTo(200, 230); ctx.quadraticCurveTo(210, 320, 320, 320); ctx.quadraticCurveTo(430, 320, 440, 230); ctx.closePath(); fs(ctx, '#8fc7ff', OL, 4);
      ell(ctx, 320, 230, 120, 20, 0, '#d8ecff', OL, 4);
      var d = ease(seg(t, 0, 0.48)), crack = t >= 0.5;
      var ey = lerp(90, 196, d);
      if (!crack) {
        ell(ctx, 320, ey, 34, 44, 0.15, '#fff5e1', OL, 4);
        ell(ctx, 308, ey - 14, 8, 12, 0.15, 'rgba(255,255,255,0.9)', null);
      } else {
        var s = easeOut(seg(t, 0.5, 0.75));
        ctx.save(); ctx.translate(320 - s * 50, ey - s * 30); ctx.rotate(-s * 0.8);
        ctx.beginPath(); ctx.ellipse(0, 0, 34, 44, 0, Math.PI, TAU); ctx.lineTo(34, 2); ctx.lineTo(18, 10); ctx.lineTo(4, -2); ctx.lineTo(-12, 10); ctx.lineTo(-34, 0); fs(ctx, '#fff5e1', OL, 4);
        ctx.restore();
        ctx.save(); ctx.translate(320 + s * 50, ey - s * 30); ctx.rotate(s * 0.8 + Math.PI);
        ctx.beginPath(); ctx.ellipse(0, 0, 34, 44, 0, Math.PI, TAU); ctx.lineTo(34, 2); ctx.lineTo(18, 10); ctx.lineTo(4, -2); ctx.lineTo(-12, 10); ctx.lineTo(-34, 0); fs(ctx, '#fff5e1', OL, 4);
        ctx.restore();
        var fy = lerp(ey, 236, easeOut(seg(t, 0.52, 0.8)));
        ell(ctx, 320, fy + 4, 40 + s * 20, 16, 0, 'rgba(255,255,255,0.9)', null);
        circle(ctx, 320, fy, 18, '#ffbf1f', OL, 3);
        if (t < 0.65) { ctx.save(); ctx.globalAlpha = 1 - seg(t, 0.5, 0.65); ctx.strokeStyle = OL; ctx.lineWidth = 3; for (var k = 0; k < 6; k++) { var a = k / 6 * TAU; ctx.beginPath(); ctx.moveTo(320 + Math.cos(a) * 40, ey + Math.sin(a) * 40); ctx.lineTo(320 + Math.cos(a) * 62, ey + Math.sin(a) * 62); ctx.stroke(); } ctx.restore(); }
      }
    },
    pan: function (ctx, t, time) {
      kitchenBg(ctx);
      rect(ctx, 80, 250, 480, 120, 10, '#3a3f4a', OL, 4);
      for (var i = 0; i < 10; i++) {
        var fx = 230 + i * 20, fh = 16 + Math.sin(time * 20 + i * 1.7) * 5 + noise(i) * 6;
        poly(ctx, [fx - 8, 268, fx, 268 - fh, fx + 8, 268], i % 2 ? '#4aa3ff' : '#7cc4ff', null);
      }
      fryPan(ctx, 320, 236, 170, 46, 1);
      var oil = ease(seg(t, 0.35, 0.7));
      if (oil > 0) { ell(ctx, 310, 236, 40 + oil * 90, 10 + oil * 22, 0, 'rgba(255,214,90,' + (0.35 + oil * 0.25) + ')', null); }
      if (t > 0.45) { var g = bump(t, 0.45, 0.55, 0.8); star(ctx, 360, 228, 14 * g, '#fffbe0', 0.5); star(ctx, 270, 240, 9 * g, '#fffbe0', 0.2); }
      var rot = -ease(seg(t, 0.05, 0.35)) * 1.6 * (1 - seg(t, 0.75, 0.95));
      ctx.save(); ctx.translate(200, 110); ctx.rotate(rot);
      rect(ctx, -20, -70, 40, 110, 10, '#ffd75a', OL, 4); rect(ctx, -10, -96, 20, 30, 4, '#3a9a4a', OL, 3);
      ctx.fillStyle = '#c47a00'; ctx.font = '900 14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('あぶら', 0, -10);
      ctx.restore();
      if (t > 0.3 && t < 0.72) {
        var a = Math.cos(rot - Math.PI / 2), b = Math.sin(rot - Math.PI / 2);
        var sx = 200 + a * 96 - 0, sy = 110 + b * 96;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + 30, sy + 20, 300, 230); ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,200,40,0.85)'; ctx.stroke();
      }
    },
    drop: function (ctx, t, time) {
      kitchenBg(ctx);
      fryPan(ctx, 320, 262, 270, 82, 0);
      var d = ease(seg(t, 0, 0.45)), hit = t >= 0.45;
      if (!hit) {
        var y = lerp(-60, 240, d * d);
        ell(ctx, 320, y, 36, 46 - d * 10, 0, 'rgba(255,255,255,0.92)', OL, 3);
        circle(ctx, 320, y + 4, 20, '#ffbf1f', OL, 3);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 3;
        for (var k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(300 + k * 20, y - 60); ctx.lineTo(300 + k * 20, y - 90); ctx.stroke(); }
      } else {
        var s = easeOut(seg(t, 0.45, 0.7));
        ctx.beginPath();
        for (var i = 0; i <= 20; i++) { var a = i / 20 * TAU, r = (40 + s * 70) + Math.sin(a * 4 + 1) * 10 * s; ctx.lineTo(320 + Math.cos(a) * r, 258 + Math.sin(a) * r * 0.42); }
        ctx.closePath(); fs(ctx, '#ffffff', OL, 3);
        circle(ctx, 316, 252, 24, '#ffbf1f', OL, 3); circle(ctx, 308, 246, 7, 'rgba(255,255,255,0.7)', null);
        for (var j = 0; j < 16; j++) {
          var ang = noise(j) * TAU, rr = 90 + s * 60 + noise(j + 9) * 30, life = (time * 3 + noise(j + 3)) % 1;
          circle(ctx, 320 + Math.cos(ang) * rr, 258 + Math.sin(ang) * rr * 0.42 - life * 10, 3 + life * 3, 'rgba(255,255,255,' + (1 - life) + ')', null);
        }
        if (t < 0.7) { ctx.save(); ctx.globalAlpha = 1 - seg(t, 0.45, 0.7); for (var q = 0; q < 10; q++) { var aa = Math.PI + q / 9 * Math.PI; circle(ctx, 320 + Math.cos(aa) * (60 + s * 120), 250 + Math.sin(aa) * (40 + s * 90), 5, '#ffe9a8', OL, 2); } ctx.restore(); }
        steam(ctx, 320, 220, 120, time * 0.2 + t, 0.35 * s);
      }
    },
    salt: function (ctx, t, time) {
      kitchenBg(ctx);
      fryPan(ctx, 330, 300, 200, 50, 1);
      friedEgg(ctx, 330, 292, 1.1);
      var sh = Math.sin(t * 60) * (8 + 18 * bump(t, 0.35, 0.5, 0.7));
      ctx.save(); ctx.translate(330 + sh * 0.3, 120 + Math.abs(sh) * 0.6); ctx.rotate(Math.PI + sh * 0.01);
      rect(ctx, -34, -60, 68, 100, 16, 'rgba(230,245,255,0.9)', OL, 4);
      rect(ctx, -28, -10, 56, 46, 10, '#ffffff', null);
      rect(ctx, -36, -86, 72, 32, 8, '#c9d1dc', OL, 4);
      ctx.restore();
      ctx.fillStyle = '#2f6fd1'; ctx.font = '900 24px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('しお', 330 + sh * 0.3, 112 + Math.abs(sh) * 0.6);
      var n = 18 + Math.floor(40 * bump(t, 0.3, 0.5, 0.75));
      for (var i = 0; i < n; i++) {
        var life = (noise(i) + t * 3 + time * 0.0) % 1;
        var px = 330 + (noise(i + 4) - 0.5) * 60 + (noise(i + 7) - 0.5) * 80 * life, py = 210 + life * 80;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(px, py, 4, 4); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(px, py, 4, 4);
      }
    },
    flip: function (ctx, t) {
      kitchenBg(ctx);
      var y = 292 - Math.sin(clamp(t, 0, 1) * Math.PI) * 200;
      var ang = t * TAU, fl = Math.cos(ang);
      if (t > 0.08 && t < 0.92) {
        ctx.save(); ctx.globalAlpha = 0.3;
        for (var k = 1; k <= 3; k++) { var tt = clamp(t - k * 0.04, 0, 1); friedEgg(ctx, 320, 292 - Math.sin(tt * Math.PI) * 200, 0.9, 0, Math.cos(tt * TAU)); }
        ctx.restore();
      }
      var tilt = -bump(t, 0, 0.06, 0.18) * 0.25;
      ctx.save(); ctx.translate(320, 312); ctx.rotate(tilt); fryPan(ctx, 0, 0, 180, 40, -1); ctx.restore();
      friedEgg(ctx, 320, y, 1.05, 0, fl);
    },
    plate: function (ctx, t, time) {
      ctx.fillStyle = '#ffe9d6'; ctx.fillRect(0, 0, W, H);
      for (var y = 0; y < H; y += 40) for (var x = (y / 40) % 2 ? 0 : 40; x < W; x += 80) { ctx.fillStyle = 'rgba(230,80,80,0.35)'; ctx.fillRect(x, y, 40, 40); }
      ell(ctx, 320, 256, 190, 68, 0, 'rgba(0,0,0,0.15)', null);
      ell(ctx, 320, 240, 186, 66, 0, '#ffffff', OL, 4); ell(ctx, 320, 240, 140, 46, 0, '#f3f6fa', null);
      friedEgg(ctx, 310, 232, 1.4);
      circle(ctx, 420, 238, 16, '#ff5a4a', OL, 3); circle(ctx, 440, 226, 12, '#4fbf5a', OL, 2); circle(ctx, 428, 216, 10, '#5ccf66', OL, 2);
      line(ctx, 250, 230, 250, 150, '#c9a06a', 4);
      poly(ctx, [250, 150, 300, 162, 250, 176], '#ff5a4a', OL, 2);
      steam(ctx, 330, 200, 90, time * 0.15 + t, 0.4, 5);
      var g = bump(t, 0.55, 0.65, 0.95);
      [[220, 150, 26], [430, 130, 20], [380, 180, 14], [180, 220, 12]].forEach(function (s, i) { star(ctx, s[0], s[1], s[2] * g, '#fff7a0', t * 2 + i); });
    },

    // ===== カップ麺 =====
    pour: function (ctx, t, time) {
      kitchenBg(ctx, true);
      glow(ctx, 520, 40, 260, 'rgba(255,210,140,0.6)', 0.7);
      cupNoodle(ctx, 300, 250, 1);
      lidFlap(ctx, 300, 250, 1, -1.4);
      var flow = t > 0.08 && t < 0.92;
      ctx.save(); ctx.translate(430, 90); ctx.rotate(-0.55 - bump(t, 0, 0.15, 1) * 0.1);
      ell(ctx, 0, 0, 80, 60, 0, '#c9d1dc', OL, 4); rect(ctx, -40, -76, 80, 22, 10, '#2b2533', OL, 3);
      poly(ctx, [-70, -10, -130, -40, -136, -30, -76, 12], '#b4bcc8', OL, 4);
      ctx.restore();
      if (flow) {
        ctx.beginPath(); ctx.moveTo(318, 116);
        for (var i = 0; i <= 10; i++) ctx.lineTo(312 - i * 0.8 + Math.sin(time * 30 + i) * 1.5, 116 + i * 4.2);
        ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(160,220,255,0.9)'; ctx.stroke();
      }
      steam(ctx, 300, 140, 100, t + time * 0.1, 0.25 + 0.35 * seg(t, 0.2, 0.6));
    },
    lid: function (ctx, t) {
      kitchenBg(ctx, true);
      glow(ctx, 520, 40, 260, 'rgba(255,210,140,0.6)', 0.7);
      cupNoodle(ctx, 320, 260, 1.2);
      var ang = lerp(-1.5, 0, easeOut(seg(t, 0.2, 0.6)));
      if (ang < -0.02) steam(ctx, 320, 130, 80, t, 0.4 * (1 - seg(t, 0.4, 0.6)));
      lidFlap(ctx, 320, 260, 1.2, ang);
      var c = easeOut(seg(t, 0.62, 0.85));
      if (c > 0) {
        var cx = lerp(560, 330, c);
        line(ctx, cx - 120, 140, cx + 110, 146, '#c98a3c', 8); line(ctx, cx - 120, 154, cx + 110, 158, '#c98a3c', 8);
      }
    },
    clock: function (ctx, t) {
      fillBg(ctx, ['#2f3a57', '#1f2740']);
      glow(ctx, 320, 180, 260, 'rgba(255,220,160,0.35)', 1);
      circle(ctx, 320, 180, 138, '#7a5a3c', OL, 4);
      circle(ctx, 320, 180, 122, '#fffaf0', OL, 3);
      ctx.fillStyle = OL; ctx.font = '900 28px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      [['12', 0], ['3', 3], ['6', 6], ['9', 9]].forEach(function (n) { var a = n[1] / 12 * TAU - Math.PI / 2; ctx.fillText(n[0], 320 + Math.cos(a) * 92, 180 + Math.sin(a) * 92); });
      for (var i = 0; i < 60; i++) { var a = i / 60 * TAU; var r1 = i % 5 ? 112 : 104; line(ctx, 320 + Math.cos(a) * r1, 180 + Math.sin(a) * r1, 320 + Math.cos(a) * 118, 180 + Math.sin(a) * 118, OL, i % 5 ? 2 : 4); }
      var h = (1 + 2 / 60) / 12 * TAU - Math.PI / 2, m = 2 / 60 * TAU - Math.PI / 2;
      line(ctx, 320, 180, 320 + Math.cos(h) * 55, 180 + Math.sin(h) * 55, OL, 9);
      line(ctx, 320, 180, 320 + Math.cos(m) * 85, 180 + Math.sin(m) * 85, OL, 6);
      var step = Math.floor(t * 12 + 0.0001);
      var s = (40 + step) / 60 * TAU - Math.PI / 2;
      line(ctx, 320, 180, 320 + Math.cos(s) * 104, 180 + Math.sin(s) * 104, '#e8423f', 3);
      circle(ctx, 320, 180, 8, '#e8423f', OL, 2);
    },
    rain: function (ctx, t, time) {
      fillBg(ctx, ['#14203a', '#2b3a5c']);
      for (var i = 0; i < 18; i++) {
        var bx = noise(i) * W, by = 150 + noise(i + 30) * 160, br = 14 + noise(i + 60) * 26;
        var cols = ['rgba(255,190,90,0.6)', 'rgba(120,200,255,0.5)', 'rgba(255,120,160,0.5)'];
        glow(ctx, bx, by, br, cols[i % 3], 0.9);
      }
      ctx.strokeStyle = 'rgba(200,220,255,0.45)'; ctx.lineWidth = 2;
      for (var k = 0; k < 60; k++) {
        var rx = noise(k + 100) * W, ry = ((noise(k + 200) * H + (t * 3 + time * 0.0) * 700) % (H + 40)) - 20;
        ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 4, ry + 18); ctx.stroke();
      }
      for (var d = 0; d < 14; d++) {
        var dx = 40 + noise(d + 300) * 560, dy = 30 + noise(d + 400) * 280;
        ell(ctx, dx, dy, 4, 5, 0, 'rgba(220,235,255,0.6)', null);
      }
      var big = ease(seg(t, 0.5, 1));
      var gy = lerp(100, 300, big);
      ctx.beginPath(); ctx.moveTo(380, 80); ctx.lineTo(380, gy); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(220,235,255,0.35)'; ctx.stroke();
      ell(ctx, 380, gy, 9, 12, 0, 'rgba(230,240,255,0.85)', 'rgba(255,255,255,0.9)', 2);
      ctx.fillStyle = '#5a4030';
      ctx.fillRect(0, 0, W, 22); ctx.fillRect(0, 338, W, 22); ctx.fillRect(0, 0, 22, H); ctx.fillRect(618, 0, 22, H); ctx.fillRect(309, 0, 22, H); ctx.fillRect(0, 170, W, 16);
      ctx.strokeStyle = OL; ctx.lineWidth = 4; ctx.strokeRect(22, 22, 287, 148); ctx.strokeRect(331, 22, 287, 148); ctx.strokeRect(22, 186, 287, 152); ctx.strokeRect(331, 186, 287, 152);
    },
    open: function (ctx, t, time) {
      kitchenBg(ctx, true);
      var burst = ease(seg(t, 0.45, 0.6));
      if (burst > 0) {
        ctx.save(); ctx.globalAlpha = burst * 0.8; ctx.translate(320, 150);
        for (var i = 0; i < 14; i++) {
          ctx.rotate(TAU / 14);
          poly(ctx, [0, 0, -30, -400, 30, -400], 'rgba(255,224,120,0.35)', null);
        }
        ctx.restore();
        glow(ctx, 320, 160, 230, 'rgba(255,230,150,0.9)', burst * 0.7);
      }
      cupNoodle(ctx, 320, 280, 1.25, { open: t > 0.42 });
      var ang = -ease(seg(t, 0.15, 0.48)) * 1.9;
      lidFlap(ctx, 320, 280, 1.25, ang);
      if (burst > 0) {
        ctx.save(); ctx.globalAlpha = 0.85 * burst;
        for (var k = 0; k < 7; k++) {
          var life = (noise(k) + time * 0.35 + t) % 1;
          circle(ctx, 300 + (noise(k + 5) - 0.5) * 140 + Math.sin(life * 6 + k) * 10, 150 - life * 140, 26 + life * 30, 'rgba(255,255,255,' + (0.6 * (1 - life)) + ')', null);
        }
        ctx.restore();
      }
    },
    slurp: function (ctx, t, time) {
      kitchenBg(ctx, true);
      glow(ctx, 320, 120, 260, 'rgba(255,210,140,0.5)', 0.8);
      ell(ctx, 320, -70, 240, 160, 0, '#fff6ea', OL, 4);
      ell(ctx, 200, 40, 26, 12, 0, 'rgba(255,140,140,' + (0.3 + seg(t, 0.6, 1) * 0.5) + ')', null);
      ell(ctx, 440, 40, 26, 12, 0, 'rgba(255,140,140,' + (0.3 + seg(t, 0.6, 1) * 0.5) + ')', null);
      var happy = t > 0.75;
      if (happy) { ctx.beginPath(); ctx.arc(250, 20, 18, 0.1 * Math.PI, 0.9 * Math.PI); ctx.lineWidth = 4; ctx.strokeStyle = OL; ctx.stroke(); ctx.beginPath(); ctx.arc(390, 20, 18, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke(); }
      else { ell(ctx, 250, 22, 9, 12, 0, OL, null); ell(ctx, 390, 22, 9, 12, 0, OL, null); }
      ell(ctx, 320, 72, 22, 16, 0, '#7a1f2b', OL, 3);
      cupNoodle(ctx, 320, 300, 1.15, { open: true });
      var lift = ease(seg(t, 0.05, 0.6));
      var topY = lerp(190, 76, lift);
      ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      for (var i = 0; i < 7; i++) {
        ctx.beginPath();
        for (var j = 0; j <= 10; j++) {
          var yy = lerp(topY, 200, j / 10), xx = 304 + i * 6 + Math.sin(j * 1.3 + i + time * 4 * (1 - lift)) * 6 * (j / 10);
          if (j === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      }
      line(ctx, 280, topY + 40, 420, topY - 30, '#c98a3c', 7); line(ctx, 286, topY + 54, 430, topY - 12, '#c98a3c', 7);
      steam(ctx, 380, 170, 70, t + time * 0.1, 0.3);
    }
  };

  function drawShot(ctx, id, t, time) {
    var f = SHOTS[id];
    ctx.save();
    if (f) f(ctx, clamp(t, 0, 1), time || 0);
    else { ctx.fillStyle = '#333'; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }

  YG.Scenes = { W: W, H: H, drawShot: drawShot, helpers: { circle: circle, ell: ell, rect: rect, poly: poly, line: line, star: star, glow: glow, clamp: clamp, lerp: lerp, ease: ease, easeOut: easeOut, seg: seg, noise: noise, OL: OL } };
})(typeof window !== 'undefined' ? window : globalThis);
