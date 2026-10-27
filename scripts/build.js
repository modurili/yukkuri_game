// src/ のHTML・CSS・JSを1つの index.html にまとめる（依存なし）。
// できた index.html は単体で完結するので、ダブルクリックで開いても、どの静的ホスティングに置いても動く。
//   node scripts/build.js          … index.html を生成
//   node scripts/build.js --check  … index.html が src/ と一致しているか確認（不一致なら終了コード1）
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'index.html');
const NOTE = '<!-- このファイルは自動生成です。編集は src/ で行い、npm run build で更新してください。 -->';

function read(rel) {
  const f = path.normalize(path.join(SRC, rel));
  if (!f.startsWith(SRC + path.sep)) throw new Error('src/ の外は読み込めません: ' + rel);
  return fs.readFileSync(f, 'utf8');
}

function build() {
  let html = read('index.html');
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => {
    const css = read(href);
    if (/<\/style/i.test(css)) throw new Error(href + ' に </style が含まれています');
    return '<style>\n' + css + '</style>';
  });
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const js = read(src);
    // インライン化したときにHTMLパーサーがスクリプトを途中で閉じないように
    if (/<\/script|<!--/i.test(js)) throw new Error(src + ' に </script または <!-- が含まれています');
    return '<script>\n' + js + '</script>';
  });
  if (/<script[^>]+src=|<link[^>]+rel="stylesheet"/i.test(html)) throw new Error('外部ファイルの参照が残っています');
  return html.replace(/^<!doctype html>\n/i, '<!doctype html>\n' + NOTE + '\n');
}

const out = build();
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== out) {
    console.error('index.html が src/ と一致しません。npm run build を実行してください。');
    process.exit(1);
  }
  console.log('index.html は最新です');
} else {
  fs.writeFileSync(OUT, out);
  console.log('index.html を生成しました（' + Math.round(Buffer.byteLength(out) / 1024) + ' KB、外部ファイル参照なし）');
}
