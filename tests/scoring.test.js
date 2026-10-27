// 採点エンジン・URLコーデックのテスト（node --test tests/）
const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/js/data.js');
require('../src/js/scoring.js');
require('../src/js/codec.js');
const { DATA: D, Score: S, Codec } = globalThis.YG;

function edit(themeId, clips, extra) {
  const theme = D.getTheme(themeId);
  const e = S.newEdit(theme);
  clips.forEach((c, i) => Object.assign(e.clips[i], c));
  return Object.assign(e, extra || {});
}
const sub = (p) => ({ p });
const free = (t) => ({ t });

// お題ごとの「工夫した編集」
const GOOD = {
  fukusen: edit('fukusen', [
    { len: 2, sub: sub(0), fx: 'zoom' },
    { keep: false },
    { len: 1, sub: sub(3), se: 'don' },
    { len: 3, fx: 'slow' },
    { len: 2, sub: sub(5), fx: 'bigzoom' },
    { len: 3, sub: sub(8), fx: 'freeze', se: 'kane' }
  ]),
  horror: edit('horror', [
    { len: 2, sub: sub(0) },
    { len: 1, fx: 'bigzoom', se: 'don' },
    { keep: false },
    { len: 2, fx: 'mono', se: 'zawa' },
    { len: 2, fx: 'mono', sub: sub(1) },
    { len: 1, fx: 'freeze', sub: sub(5), se: 'don' }
  ]),
  sports: edit('sports', [
    { len: 1, fx: 'lines', sub: sub(1), se: 'shu' },
    { keep: false },
    { len: 1 },
    { len: 1, fx: 'zoom', sub: sub(4) },
    { len: 2, fx: 'slow', se: 'cheer' },
    { len: 2, fx: 'freeze', sub: sub(0), se: 'clap' }
  ]),
  emo: edit('emo', [
    { len: 2, sub: sub(2) },
    { keep: false },
    { len: 3, fx: 'slow', sub: sub(1) },
    { len: 3, fx: 'mono', sub: sub(3) },
    { len: 3, fx: 'slow', se: 'kane' },
    { len: 3, fx: 'zoom', sub: sub(5) }
  ])
};

test('何もしない編集は低得点で「素材の味」系の称号', () => {
  for (const theme of D.THEMES) {
    const r = S.evaluate(theme, S.newEdit(theme));
    assert.ok(r.total < 35, `${theme.id}: total ${r.total}`);
    assert.ok(['sozai', 'minarai'].includes(r.title.id), `${theme.id}: ${r.title.id}`);
    assert.ok(r.scores.hell < 40, `${theme.id}: hell ${r.scores.hell}`);
  }
});

test('工夫した編集は高得点（全お題）', () => {
  for (const theme of D.THEMES) {
    const r = S.evaluate(theme, GOOD[theme.id]);
    const ng = r.constraints.filter((c) => c.state !== 'ok').map((c) => c.label);
    assert.deepEqual(ng, [], `${theme.id}: 未達成 ${ng}`);
    assert.ok(r.total >= 80, `${theme.id}: total ${r.total} ${JSON.stringify(r.scores)}`);
    assert.ok(r.specials.length >= 1, `${theme.id}: コンボなし`);
  }
});

test('伏線→回収の構成が評価される', () => {
  const theme = D.getTheme('fukusen');
  const r = S.evaluate(theme, GOOD.fukusen);
  assert.ok(r.structure.fukusen);
  assert.ok(r.reasons.some((x) => x.text.includes('伏線→回収')));
  // 順番を逆にすると「回収してから伏線」
  const rev = edit('fukusen', [{ sub: sub(5) }, {}, {}, {}, { sub: sub(0) }, { fx: 'freeze' }]);
  const r2 = S.evaluate(theme, rev);
  assert.ok(r2.structure.gyakuFukusen);
  assert.equal(r2.title.id, 'gyakufukusen');
});

test('効果音連打は「効果音の暴力」で地獄度が高く、再生数は炎上で伸びる', () => {
  const theme = D.getTheme('fukusen');
  const e = edit('fukusen', theme.shots.map(() => ({ se: 'bomb', fx: 'shake' })));
  const r = S.evaluate(theme, e);
  assert.equal(r.title.id, 'se_bouryoku');
  assert.ok(r.scores.hell >= 60, `hell ${r.scores.hell}`);
  assert.ok(r.burning);
  assert.ok(r.specials.some((s) => s.id === 'tendon'));
  const plain = S.evaluate(theme, S.newEdit(theme));
  assert.ok(r.views > plain.views * 5, `${r.views} vs ${plain.views}`);
  assert.ok(r.likeRate < plain.likeRate);
});

test('字幕過多の罪', () => {
  const theme = D.getTheme('fukusen');
  const e = edit('fukusen', theme.shots.map(() => ({ sub: sub(2), len: 1 })));
  const r = S.evaluate(theme, e);
  assert.equal(r.title.id, 'jimaku_tsumi');
  assert.ok(r.reasons.some((x) => x.text === '読み切れない字幕'));
});

test('全カット削除は虚無', () => {
  const theme = D.getTheme('horror');
  const e = edit('horror', theme.shots.map(() => ({ keep: false })));
  const r = S.evaluate(theme, e);
  assert.equal(r.title.id, 'void');
  assert.equal(r.scores.hell, 100);
  assert.equal(r.total, 3);
});

test('採点は決定的（同じ編集なら同じ結果）', () => {
  const theme = D.getTheme('sports');
  const a = S.evaluate(theme, GOOD.sports);
  const b = S.evaluate(theme, JSON.parse(JSON.stringify(GOOD.sports)));
  assert.equal(a.total, b.total);
  assert.equal(a.views, b.views);
  assert.deepEqual(a.comments, b.comments);
});

test('締め切りオーバーと追加注文', () => {
  const theme = D.getTheme('fukusen');
  const base = JSON.parse(JSON.stringify(GOOD.fukusen));
  const ok = S.evaluate(theme, Object.assign({}, base, { order: true }));
  assert.equal(ok.order.state, 'ok');
  const late = Object.assign({}, base, { order: true, timeout: true });
  late.clips = base.clips.map((c) => (c.shot === 0 ? Object.assign({}, c, { sub: null, fx: 'none' }) : c));
  const r = S.evaluate(theme, late);
  assert.equal(r.order.state, 'ng');
  assert.ok(r.total < ok.total);
  assert.ok(r.reasons.some((x) => x.text === '締め切りオーバー'));
});

test('自由入力の字幕もタグ判定される', () => {
  assert.ok(S.inferTags('全ては計画通りだった').includes('payoff'));
  assert.ok(S.inferTags('逃げて！！').includes('horror'));
  assert.ok(S.inferTags('ゴール!!').includes('sports'));
  assert.ok(S.inferTags('ありがとう').includes('thanks'));
  assert.deepEqual(S.inferTags('ふつう'), []);
  const theme = D.getTheme('fukusen');
  const r = S.evaluate(theme, edit('fukusen', [{ sub: free('この鳩が黒幕') }, {}, {}, {}, {}, { fx: 'freeze' }]));
  assert.ok(r.reasons.some((x) => x.text === '自作の字幕'));
});

test('URLコーデック：往復と不正入力の拒否', () => {
  const e = JSON.parse(JSON.stringify(GOOD.fukusen));
  e.clips[1].sub = { t: '鳩が黒幕だった' };
  [e.clips[0], e.clips[3]] = [e.clips[3], e.clips[0]];
  e.order = true;
  const s = Codec.encode(e, 'ゆっくりch');
  assert.match(s, /^[A-Za-z0-9_-]+$/);
  const d = Codec.decode(s);
  assert.deepEqual(d.edit, e);
  assert.equal(d.name, 'ゆっくりch');
  const theme = D.getTheme('fukusen');
  assert.equal(S.evaluate(theme, d.edit).total, S.evaluate(theme, e).total);

  assert.equal(Codec.decode('!!!'), null);
  assert.equal(Codec.decode(''), null);
  const bad = (p) => Codec.decode(Buffer.from(JSON.stringify(p)).toString('base64url'));
  assert.equal(bad({ v: 1, t: 'nope', c: [] }), null);
  const c = Codec.encode(e);
  const p = JSON.parse(Buffer.from(c, 'base64url').toString());
  assert.equal(bad(Object.assign({}, p, { c: p.c.map((x) => [0, 1, 2, -1, 0, 0]) })), null, '同じ素材の重複');
  assert.equal(bad(Object.assign({}, p, { c: p.c.map((x, i) => [i, 1, 9, -1, 0, 0]) })), null, '不正な長さ');
  assert.equal(bad(Object.assign({}, p, { c: p.c.map((x, i) => [i, 1, 2, 99, 0, 0]) })), null, '不正な字幕番号');
  const long = bad(Object.assign({}, p, { c: p.c.map((x, i) => [i, 1, 2, 'あ'.repeat(100) + '\u0007', 0, 0]) }));
  assert.equal(long.edit.clips[0].sub.t.length, D.MAX_FREE_CHARS);
});

test('評価理由は必ず表示できる形で出る', () => {
  for (const theme of D.THEMES) {
    for (const e of [S.newEdit(theme), GOOD[theme.id]]) {
      const r = S.evaluate(theme, e);
      assert.ok(r.reasons.length > 3);
      r.reasons.forEach((x) => { assert.ok(['tech', 'tempo', 'neta'].includes(x.axis)); assert.equal(typeof x.text, 'string'); });
      assert.ok(r.tsukkomi.length >= 2);
      assert.equal(r.comments.clips.length, r.stats.count);
      assert.ok(r.title && r.title.name);
    }
  }
});
