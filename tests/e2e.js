// ブラウザで1プレイを最後まで通すE2Eテスト（要 Playwright + Chromium）
// 使い方: node tests/e2e.js [スクリーンショット出力先]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert/strict');

const OUT = process.argv[2] || path.join(os.tmpdir(), 'yukkuri-e2e');
fs.mkdirSync(OUT, { recursive: true });
const { createServer } = require('../scripts/serve.js');

function serve() {
  return new Promise((resolve) => { const srv = createServer().listen(0, () => resolve(srv)); });
}

(async () => {
  const srv = await serve();
  const base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch();
  const errors = [];
  const watch = (p, tag) => {
    p.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] console: ${m.text()}`); });
  };
  const shot = (p, name, full) => p.screenshot({ path: path.join(OUT, name + '.png'), fullPage: !!full });
  const step = (s) => console.log('・' + s);

  // ===== PC：お題1を「工夫した編集」で最後まで =====
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  await ctx.route(/twitter\.com|x\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
  const page = await ctx.newPage();
  watch(page, 'pc');
  await page.goto(base);
  await shot(page, '01-title');
  await page.click('#btn-start');
  await shot(page, '02-select', true);
  step('タイトル → お題選択');
  await page.click('.theme-card >> nth=0');
  await shot(page, '03-brief', true);
  await page.click('#btn-go');
  await page.waitForTimeout(400);
  await shot(page, '04-edit-start');
  step('ブリーフィング → 編集開始');

  const pick = async (cell, chip) => { await page.click(`[data-k="${cell}"]`); await page.click(`[data-k="${chip}"]`); };
  await pick('s0', 'sub-0'); await pick('f0', 'fx-zoom');
  await page.click('[data-k="v1"]'); await page.click('#btn-cut');
  await pick('s2', 'sub-3'); await pick('a2', 'se-don'); await page.click('#tab-len'); await page.click('[data-k="len-1"]');
  await pick('f3', 'fx-slow'); await page.click('#tab-len'); await page.click('[data-k="len-3"]');
  await pick('s4', 'sub-5'); await pick('f4', 'fx-bigzoom');
  await pick('s5', 'sub-8'); await pick('f5', 'fx-freeze'); await pick('a5', 'se-kane'); await page.click('#tab-len'); await page.click('[data-k="len-3"]');
  // 自由入力の字幕（判定タグが出る）
  await page.click('[data-k="s3"]');
  await page.fill('[data-k="sub-free"]', '風が全てを');
  assert.match(await page.textContent('.free-tags'), /判定/);
  await page.click('[data-k="sub-none"]');
  const cons = await page.$$eval('#cons-list li', (els) => els.map((e) => e.className.split(' ')[0]));
  assert.deepEqual(cons, ['ok', 'ok', 'ok'], '制約がすべて達成になる');
  await page.click('[data-k="v4"]');
  await page.waitForTimeout(1300);
  await shot(page, '05-edit-done');
  step('字幕・演出・効果音・長さ・カットを操作 → 制約3つ達成');

  await page.click('#btn-pv-all');
  await page.waitForTimeout(5200);
  await shot(page, '06-preview-all');
  await page.click('#btn-export');
  await page.waitForTimeout(1000 + 4300);
  await shot(page, '07-playing');
  step('書き出し → コメント付き再生');
  await page.waitForSelector('#scr-result.is-active', { timeout: 30000 });
  await page.waitForTimeout(3600);
  await shot(page, '08-result', true);
  const total = +(await page.textContent('#res-total'));
  const title = await page.textContent('#res-title');
  console.log(`  結果: ${total}点 ${title}`);
  assert.ok(total >= 80, '工夫した編集は高得点');
  const src = await page.getAttribute('#res-image', 'src');
  assert.ok(src && src.startsWith('data:image/png'), '結果画像が生成される');
  fs.writeFileSync(path.join(OUT, '09-result-image.png'), Buffer.from(src.split(',')[1], 'base64'));
  step('結果画面と結果画像');

  await page.fill('#inp-name', 'テスト実況ch');
  await page.waitForTimeout(500);
  const src2 = await page.getAttribute('#res-image', 'src');
  assert.notEqual(src, src2, 'チャンネル名で画像が更新される');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-save')]);
  assert.match(dl.suggestedFilename(), /\.png$/);
  const [pop] = await Promise.all([page.waitForEvent('popup'), page.click('#btn-x')]);
  const xurl = new URL(pop.url());
  assert.equal(xurl.pathname, '/intent/tweet');
  assert.match(xurl.searchParams.get('text'), /ゆっくり編集地獄/);
  const link = xurl.searchParams.get('url');
  assert.match(link, /\?r=[A-Za-z0-9_-]+$/);
  await pop.close();
  step('チャンネル名 → 画像保存 → Xの投稿画面（再現リンク付き）');

  // ===== 再現リンクを開く =====
  const p2 = await ctx.newPage();
  watch(p2, 'shared');
  await p2.goto(link);
  await p2.waitForSelector('#scr-shared.is-active');
  assert.match(await p2.textContent('#shared-by'), /テスト実況ch/);
  await shot(p2, '10-shared');
  await p2.click('#btn-shared-play');
  await p2.click('#btn-skip');
  await p2.waitForSelector('#scr-result.is-active');
  await p2.waitForTimeout(1300);
  assert.equal(+(await p2.textContent('#res-total')), total, '再現リンクで同じ点数になる');
  await p2.click('#btn-retry');
  await p2.waitForSelector('#scr-brief.is-active');
  assert.ok(!p2.url().includes('?r='), '自分で挑戦するとURLから共有パラメータが消える');
  step('再現リンク → 同じ編集を再生・同じ点数 → そのまま挑戦');

  // 壊れたリンク
  await p2.goto(base + '?r=broken!!');
  await p2.waitForSelector('#scr-title.is-active');
  assert.match(await p2.textContent('#toast'), /壊れて/);
  step('壊れたリンクでもタイトルに戻る');

  // ===== 追加注文と締め切り =====
  await page.click('#btn-retry');
  await page.waitForSelector('#scr-edit.is-active');
  // キーボード操作：→でカット選択、2で演出タブ、Xでカット（もう一度で戻す）
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('2');
  assert.equal(await page.evaluate(() => YG.App.state.sel), 1);
  assert.equal(await page.getAttribute('#tab-fx', 'aria-selected'), 'true');
  await page.keyboard.press('x');
  assert.equal(await page.evaluate(() => YG.App.state.edit.clips[1].keep), false);
  await page.keyboard.press('x');
  assert.equal(await page.evaluate(() => YG.App.state.edit.clips[1].keep), true);
  step('キーボード操作（← → / 1〜4 / X）');
  await page.evaluate(() => { YG.App.state.timeLeft = 45.5; });
  await page.waitForSelector('#order-pop:not([hidden])', { timeout: 3000 });
  await shot(page, '11-order');
  assert.ok(await page.isVisible('#order-box'), '追加注文が制約欄に出る');
  await page.evaluate(() => { YG.App.state.timeLeft = 1.2; });
  await page.waitForSelector('#deadline-pop:not([hidden])', { timeout: 4000 });
  await shot(page, '12-deadline');
  await page.waitForSelector('#scr-play.is-active', { timeout: 4000 });
  await page.click('#btn-skip');
  await page.waitForSelector('#scr-result.is-active');
  await page.waitForTimeout(1800);
  const t2 = await page.textContent('#res-title');
  assert.match(t2, /編集放棄/, '何もせず締め切り → 編集放棄');
  await shot(page, '13-result-houki');
  step('追加注文の割り込み → 締め切りで強制書き出し → 称号「編集放棄」');

  // ===== スマホ：お題3を地獄編集 =====
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const m = await mctx.newPage();
  watch(m, 'mobile');
  await m.goto(base);
  await shot(m, '20-m-title');
  await m.tap('#btn-start');
  await m.tap('.theme-card >> nth=2');
  await m.tap('#btn-go');
  await m.waitForTimeout(300);
  await shot(m, '21-m-edit');
  for (let i = 0; i < 6; i++) {
    await m.tap(`[data-k="a${i}"]`); await m.tap('[data-k="se-bomb"]');
    await m.tap(`[data-k="f${i}"]`); await m.tap('[data-k="fx-shake"]');
  }
  await m.tap('[data-k="s5"]');
  await m.fill('[data-k="sub-free"]', 'ゴールしたけど全部爆発した!!');
  await m.tap('[data-k="sub-apply"]');
  await shot(m, '22-m-edit-hell', true);
  await m.tap('#btn-export');
  await m.waitForTimeout(3500);
  await shot(m, '23-m-playing');
  await m.tap('#btn-skip');
  await m.waitForSelector('#scr-result.is-active');
  await m.waitForTimeout(3600);
  await shot(m, '24-m-result', true);
  const mt = await m.textContent('#res-title');
  console.log(`  スマホ地獄編集: ${await m.textContent('#res-total')}点 ${mt}`);
  assert.match(mt, /効果音の暴力/);
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, '横スクロールが発生しない: ' + overflow);
  step('スマホ幅：タップ操作で地獄編集 → 「効果音の暴力」');

  await browser.close();
  srv.close();
  if (errors.length) { console.error('ページエラー:\n' + errors.join('\n')); process.exit(1); }
  console.log('E2E OK（スクリーンショット: ' + OUT + '）');
})().catch((e) => { console.error(e); process.exit(1); });
