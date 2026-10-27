/* ゆっくり編集地獄 - 編集内容 <-> URL文字列（サーバー不要の再現URL） */
(function (root) {
  'use strict';
  var YG = root.YG = root.YG || {};
  var D = YG.DATA;

  function b64urlEncode(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }

  // 制御文字を除去して長さを制限（表示は textContent / Canvas のみなので HTML エスケープは不要）
  function cleanText(s, max) {
    return Array.from(String(s).replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '')).slice(0, max).join('').trim();
  }

  function encode(edit, name) {
    var p = {
      v: 1, t: edit.themeId,
      c: edit.clips.map(function (c) {
        var sub = !c.sub ? -1 : typeof c.sub.p === 'number' ? c.sub.p : cleanText(c.sub.t, D.MAX_FREE_CHARS);
        return [c.shot, c.keep ? 1 : 0, c.len, sub, D.FX_KEYS.indexOf(c.fx), D.SE_KEYS.indexOf(c.se)];
      }),
      o: edit.order ? 1 : 0,
      x: edit.timeout ? 1 : 0
    };
    if (name) p.n = cleanText(name, 20);
    return b64urlEncode(JSON.stringify(p));
  }

  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }

  // 不正な入力は null を返す
  function decode(str) {
    var p;
    try { p = JSON.parse(b64urlDecode(str)); } catch (e) { return null; }
    if (!p || typeof p !== 'object' || p.v !== 1) return null;
    var theme = D.getTheme(p.t);
    if (!theme || !Array.isArray(p.c) || p.c.length !== theme.shots.length) return null;
    var seen = {}, subs = D.subsFor(theme), clips = [];
    for (var i = 0; i < p.c.length; i++) {
      var a = p.c[i];
      if (!Array.isArray(a) || a.length !== 6) return null;
      var shot = a[0], keep = a[1], len = a[2], sub = a[3], fx = a[4], se = a[5];
      if (!isInt(shot) || shot < 0 || shot >= theme.shots.length || seen[shot]) return null;
      seen[shot] = true;
      if (keep !== 0 && keep !== 1) return null;
      if (D.LENS.indexOf(len) < 0) return null;
      if (!isInt(fx) || fx < 0 || fx >= D.FX_KEYS.length) return null;
      if (!isInt(se) || se < 0 || se >= D.SE_KEYS.length) return null;
      var subRef = null;
      if (typeof sub === 'string') { var t = cleanText(sub, D.MAX_FREE_CHARS); subRef = t ? { t: t } : null; }
      else if (isInt(sub)) { if (sub >= subs.length || sub < -1) return null; subRef = sub >= 0 ? { p: sub } : null; }
      else return null;
      clips.push({ shot: shot, keep: keep === 1, len: len, sub: subRef, fx: D.FX_KEYS[fx], se: D.SE_KEYS[se] });
    }
    return {
      edit: { themeId: theme.id, clips: clips, order: p.o === 1, timeout: p.x === 1 },
      name: typeof p.n === 'string' ? cleanText(p.n, 20) : ''
    };
  }

  YG.Codec = { encode: encode, decode: decode, cleanText: cleanText };
})(typeof window !== 'undefined' ? window : globalThis);
