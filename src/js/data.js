/* ゆっくり編集地獄 - ゲームデータ（お題・素材・演出・効果音・称号）
 * ブラウザでは window.YG.DATA、Node では globalThis.YG.DATA に載る。 */
(function (root) {
  'use strict';
  var YG = root.YG = root.YG || {};

  // ---- タグ（採点の語彙） ----
  var TAG_LABELS = {
    foreshadow: '伏線', payoff: '回収', epic: '壮大', dramatic: '劇的', emotional: '感動',
    horror: 'ホラー', suspense: '不穏', impact: '衝撃', sports: 'スポーツ', hype: '熱狂',
    action: '動き', comedy: '笑い', fail: '失敗', meme: 'ネット', cute: 'かわいい',
    calm: '静か', chaos: 'カオス', ending: '締め', trailer: '予告', emphasis: '強調',
    retro: 'レトロ', question: '疑問', mundane: '日常', thanks: '感謝', meta: 'メタ'
  };

  // 自由入力の字幕をタグ判定するキーワード辞書
  var KEYWORDS = [
    ['foreshadow', /伏線|まだ|知らなかった|あの日|あの時|始まり|予感|この時|気づ|やがて/],
    ['payoff', /だったのか|回収|計画通り|すべては|全ては|真実|正体|黒幕|繋がっ|つながっ|そういうこと/],
    ['epic', /運命|伝説|世界|神|奇跡|壮大|宇宙|最強|究極|全米|歴史/],
    ['horror', /呪|恐|怖|死|闇|血|霊|来る|逃げ|振り向|助けて|ホラー|殺|悲鳴/],
    ['suspense', /まさか|謎|…|\.\.\.|誰|なぜ|何か|ざわ|不穏/],
    ['sports', /ゴール|GOAL|goal|決まっ|選手|試合|優勝|記録|速い|勝|実況|解説|VAR|メダル|決勝/],
    ['hype', /[!！]|ー{2,}|うお|やった|キター|きたー/],
    ['emotional', /涙|泣|ありがと|感動|愛|思い出|家族|母|父|心|夢|人生|エモ/],
    ['thanks', /ありがと|感謝|サンキュ|thank/i],
    ['comedy', /草|w{2,}|ｗ|笑|ワロ|なんで|は？|ちーん|チーン/],
    ['meme', /草|w{2,}|ｗ|オワタ|それな|乙|ワロ|バズ/],
    ['cute', /にゃ|かわい|可愛|ねこ|ネコ|ふわ|もふ/],
    ['trailer', /公開|乞うご期待|映画|予告|20\d\d|劇場|近日/],
    ['ending', /完|つづく|続く|終わ|fin|END|おわり|おしまい/i],
    ['question', /[？?]/],
    ['fail', /失敗|のびた|伸びた|焦げ|こげ|やらかし|オワタ/]
  ];

  // ---- 演出（1クリップに1つ） ----
  var FX = {
    none: { name: 'なし', icon: '－', tags: [], power: 0 },
    zoom: { name: 'ズーム', icon: '🔍', tags: ['emphasis'], power: 1, desc: 'ゆっくり寄る' },
    bigzoom: { name: '顔面ドアップ', icon: '😳', tags: ['emphasis', 'impact', 'meme'], power: 3, desc: '一気に急接近' },
    shake: { name: '揺れ', icon: '〰️', tags: ['impact', 'chaos'], power: 2, desc: '画面がガタガタ' },
    slow: { name: 'スロー', icon: '🐢', tags: ['dramatic', 'emotional'], power: 1, desc: '見せ場をじっくり' },
    freeze: { name: '静止画', icon: '⏸️', tags: ['dramatic', 'ending'], power: 2, desc: '見せ場で止める' },
    mono: { name: 'モノクロ', icon: '◐', tags: ['horror', 'retro', 'emotional'], power: 1, desc: '白黒フィルム風' },
    reverse: { name: '逆再生', icon: '⏪', tags: ['meme', 'chaos'], power: 1, desc: '時間が戻る' },
    lines: { name: '集中線', icon: '💥', tags: ['impact', 'hype'], power: 2, desc: '少年漫画風' }
  };
  var FX_KEYS = Object.keys(FX);

  // ---- 効果音（WebAudioで合成） hard=衝撃系（見せ場に合わせるべき音） ----
  var SE = {
    none: { name: 'なし', text: '', tags: [], power: 0 },
    don: { name: 'ドン', text: 'ドンッ!!', tags: ['impact', 'horror', 'dramatic'], power: 2, hard: true, color: '#ff4040' },
    bomb: { name: '爆発', text: 'ドカーン!!', tags: ['chaos', 'impact'], power: 3, hard: true, color: '#ff8a00' },
    cheer: { name: '歓声', text: 'ワァァァ!!', tags: ['sports', 'hype'], power: 2, hard: true, color: '#ffd400' },
    shu: { name: 'シュッ', text: 'シュッ', tags: ['action', 'sports'], power: 1, hard: true, color: '#6fe0ff' },
    kane: { name: '鐘', text: 'ゴーン…', tags: ['epic', 'emotional', 'ending'], power: 2, color: '#e8c060' },
    zawa: { name: 'ざわ…', text: 'ざわ…ざわ…', tags: ['suspense'], power: 1, color: '#b49bff' },
    clap: { name: '拍手', text: 'パチパチ', tags: ['emotional', 'sports', 'ending'], power: 1, color: '#7dff9a' },
    chin: { name: 'チーン', text: 'チーン…', tags: ['fail', 'comedy'], power: 1, color: '#c8d0dc' },
    hyu: { name: 'ヒュ〜', text: 'ヒュ〜', tags: ['comedy', 'fail'], power: 1, color: '#9ad0ff' }
  };
  var SE_KEYS = Object.keys(SE);

  var LENS = [1, 2, 3];

  // どのお題でも使える字幕
  var GENERIC_SUBS = [
    { text: '草', tags: ['meme', 'comedy'] },
    { text: 'は？', tags: ['question', 'comedy'] },
    { text: 'えぇ…', tags: ['comedy', 'suspense'] }
  ];

  // ---- ヘルパー（制約・コンボ判定で使う） ----
  function has(item, tag) { return item && item.tags && item.tags.indexOf(tag) >= 0; }
  function subHas(c, tag) { return !!(c.sub && c.sub.tags.indexOf(tag) >= 0); }
  function subHasAny(c, tags) { for (var i = 0; i < tags.length; i++) if (subHas(c, tags[i])) return true; return false; }
  function fxIn(c, keys) { return keys.indexOf(c.fx) >= 0; }
  function seIn(c, keys) { return keys.indexOf(c.se) >= 0; }
  function isShot(c, id) { return c.shot.id === id; }
  var LOOK_FX = ['zoom', 'bigzoom', 'lines', 'freeze', 'slow'];

  function limitCheck(n, max, unit) {
    if (n === 0) return { state: 'idle', detail: '0/' + max + unit + '（未使用）' };
    return n <= max ? { state: 'ok', detail: n + '/' + max + unit } : { state: 'ng', detail: n + unit + '使用（上限' + max + unit + '）' };
  }

  // ---- お題 ----
  var THEMES = [
    {
      id: 'fukusen', no: 1, color: '#ffb400', difficulty: 2,
      short: '公園 → 伏線回収',
      title: '何の変哲もない公園の映像を、壮大な伏線回収シーンに編集せよ',
      source: '昼下がりの公園',
      brief: '鳩、おじさん、自販機…何も起きない公園の映像。でも編集次第で、すべてが繋がる物語になる。',
      hint: '序盤に「伏線」っぽい字幕、終盤に「回収」の字幕を置くと…？',
      weights: { tech: 0.4, tempo: 0.25, neta: 0.35 },
      targets: { foreshadow: 3, payoff: 3, epic: 3, dramatic: 2, emotional: 2, suspense: 1, ending: 1 },
      ideal: [8, 14], tempoPref: 'normal',
      shots: [
        { id: 'hato', name: '鳩', desc: '地面をつつく鳩', tags: ['animal', 'mundane', 'cute'], event: 0.55, focus: [420, 205], peak: true, comments: ['鳩', 'ぽっぽー', 'こっち見た'] },
        { id: 'bench', name: 'ベンチ', desc: '新聞を読むおじさん', tags: ['person', 'mundane', 'face'], event: 0.5, focus: [320, 150], peak: false, comments: ['おじさん', '平和'] },
        { id: 'vending', name: '自販機', desc: '缶ジュースが落ちる', tags: ['object', 'mundane'], event: 0.6, focus: [320, 285], peak: true, comments: ['ガコン', 'ジュース'] },
        { id: 'hat', name: '帽子', desc: '風で帽子が飛ぶ', tags: ['action'], event: 0.5, focus: [320, 110], peak: true, comments: ['帽子ー！', '風つよ'] },
        { id: 'turn', name: '振り返り', desc: 'おじさんが振り返る', tags: ['person', 'face', 'reveal'], event: 0.7, focus: [320, 165], peak: true, climax: true, comments: ['振り返った', '目が…'] },
        { id: 'sunset', name: '夕焼け', desc: '夕日とカラス', tags: ['scenery', 'emotional', 'calm'], event: 0.6, focus: [320, 230], peak: false, comments: ['きれい', 'エモい'] }
      ],
      subs: [
        { text: 'あの日の鳩…', tags: ['foreshadow', 'suspense'] },
        { text: 'まだ気づかない', tags: ['foreshadow', 'suspense'] },
        { text: 'この時はまだ誰も知らなかった', tags: ['foreshadow', 'epic'] },
        { text: '運命の缶', tags: ['epic', 'foreshadow'] },
        { text: '風が、告げていた', tags: ['foreshadow', 'dramatic'] },
        { text: 'お前だったのか', tags: ['payoff', 'dramatic'] },
        { text: '全ては計画通り', tags: ['payoff', 'epic'] },
        { text: '伏線回収', tags: ['payoff', 'meta', 'meme'] },
        { text: 'つづく', tags: ['ending'] }
      ],
      constraints: [
        {
          id: 'sub7', label: '字幕は各7文字以内', kind: 'must', pts: 12,
          check: function (st) {
            if (!st.subs.length) return { state: 'ng', detail: '字幕がまだ1つもない' };
            var over = st.subs.filter(function (c) { return c.sub.chars > 7; });
            return over.length ? { state: 'ng', detail: over.length + '個の字幕が8文字以上' } : { state: 'ok', detail: '字幕' + st.subs.length + '個、すべて7文字以内' };
          }
        },
        {
          id: 'se2', label: '効果音は2回まで', kind: 'limit', pts: 10,
          check: function (st) { return limitCheck(st.seClips.length, 2, '回'); }
        },
        {
          id: 'lastfreeze', label: '最後は静止画で締める', kind: 'must', pts: 12,
          check: function (st) {
            if (!st.last) return { state: 'ng', detail: 'クリップがない' };
            return st.last.fx === 'freeze' ? { state: 'ok', detail: '最後の「' + st.last.shot.name + '」が静止画' } : { state: 'ng', detail: '最後の「' + st.last.shot.name + '」が静止画じゃない' };
          }
        }
      ],
      order: {
        label: '鳩をもっと目立たせて！', detail: '鳩のカットに字幕か演出を付ける',
        check: function (st) {
          var c = st.kept.filter(function (k) { return isShot(k, 'hato'); })[0];
          if (!c) return { state: 'ng', detail: '鳩がカットされている' };
          return (c.sub || fxIn(c, LOOK_FX)) ? { state: 'ok', detail: '鳩が主役になった' } : { state: 'ng', detail: '鳩が目立っていない' };
        }
      },
      structure: function (st, add) {
        // 最初の「伏線」字幕より後に「回収」字幕があれば成立。回収しか出てこない後に伏線が来たら「逆」
        var fore = -1, pay = -1, firstPay = -1;
        st.kept.forEach(function (c) {
          if (subHas(c, 'foreshadow') && fore < 0) fore = c.pos;
          if (subHas(c, 'payoff')) { if (firstPay < 0) firstPay = c.pos; if (fore >= 0 && pay < 0 && c.pos > fore) pay = c.pos; }
        });
        var payBeforeFore = firstPay >= 0 && fore > firstPay && pay < 0;
        if (fore >= 0 && pay > fore) {
          add('neta', 15, '伏線→回収の流れが成立', '「伏線」の字幕のあとに「回収」の字幕');
          add('tech', 5, '物語の構成ができている');
          if (pay - fore >= 3) add('neta', 5, '長距離の伏線回収', fore + 1 + '番目→' + (pay + 1) + '番目');
          return { fukusen: true };
        }
        if (payBeforeFore) { add('neta', 3, '回収してから伏線を張っている', '順番が逆。それはそれで笑える'); return { gyakuFukusen: true }; }
        return {};
      },
      specials: [
        { id: 'hato_kuromaku', hint: '鳩に黒幕の風格を…', name: '鳩、黒幕説', desc: 'ただの鳩に黒幕の風格が宿った', pts: 12,
          test: function (c) { return isShot(c, 'hato') && subHasAny(c, ['payoff', 'epic']) && fxIn(c, ['freeze', 'zoom', 'bigzoom', 'lines']); },
          comments: ['鳩が黒幕www', '全部こいつの仕業', 'ハト「計画通り」'] },
        { id: 'unmei_can', hint: 'ただの缶ジュースに運命を…', name: '運命の缶ジュース', desc: 'ただのジュースが物語の鍵に', pts: 10,
          test: function (c) { return isShot(c, 'vending') && subHasAny(c, ['epic', 'foreshadow']) && (seIn(c, ['don', 'kane']) || fxIn(c, ['zoom', 'slow', 'freeze', 'bigzoom'])); },
          comments: ['ジュースが重い', '運命の缶w', 'この缶が全ての始まり'] },
        { id: 'kaze', hint: '飛んでいく帽子をじっくり…', name: '風が告げていた', desc: 'スローの帽子が意味深に', pts: 10,
          test: function (c) { return isShot(c, 'hat') && c.fx === 'slow' && subHasAny(c, ['foreshadow', 'dramatic', 'epic']); },
          comments: ['意味深', '風が…', 'ポエムきた'] },
        { id: 'furikaeri', hint: '振り向いた瞬間に真実を…', name: '振り返りの真実', desc: '振り向いた瞬間にすべてが繋がる', pts: 12,
          test: function (c) { return isShot(c, 'turn') && fxIn(c, ['zoom', 'bigzoom', 'lines', 'freeze']) && subHas(c, 'payoff'); },
          comments: ['お前だったのか!!', '鳥肌', '真犯人おじさん'] },
        { id: 'gekijoban', hint: '夕日で物語を締めくくる…', name: '劇場版への引き', desc: '夕日で止めて「つづく」', pts: 10,
          test: function (c, st) { return c === st.last && isShot(c, 'sunset') && c.fx === 'freeze' && subHas(c, 'ending'); },
          comments: ['劇場版決定', 'つづくな', '続編はよ'] },
        { id: 'shinbun', hint: 'おじさんと目を合わせる…', name: '新聞の向こうの目', desc: 'おじさんと目が合ってしまった', pts: 6,
          test: function (c) { return isShot(c, 'bench') && fxIn(c, ['bigzoom', 'lines']); },
          comments: ['こっち見んな', '目が合った', 'おじさんの圧'] }
      ],
      legend: { name: '伏線回収の神', desc: '何気ない日常を、壮大な物語に変えてしまった。' }
    },
    {
      id: 'horror', no: 2, color: '#d23c5a', difficulty: 2,
      short: '猫 → ホラー予告編',
      title: 'のんびりした猫の映像を、全米が震えるホラー映画の予告編にせよ',
      source: 'うちの猫の休日',
      brief: '寝て、あくびして、箱に入るだけの猫。でも暗くして、音を足せば…？',
      hint: 'モノクロと「ドン」は恐怖の基本。かわいさとのギャップも武器になる。',
      weights: { tech: 0.35, tempo: 0.3, neta: 0.35 },
      targets: { horror: 3, suspense: 3, trailer: 3, impact: 2, dramatic: 2, ending: 1 },
      ideal: [6, 10], tempoPref: 'normal',
      shots: [
        { id: 'sleep', name: 'お昼寝', desc: '丸まって眠る猫', tags: ['animal', 'cute', 'calm'], event: 0.5, focus: [320, 225], peak: false, comments: ['かわいい', 'すやすや'] },
        { id: 'yawn', name: 'あくび', desc: '大きなあくび', tags: ['animal', 'cute', 'face'], event: 0.5, focus: [320, 215], peak: true, comments: ['あくび', '牙'] },
        { id: 'hall', name: '廊下', desc: '誰もいない暗い廊下', tags: ['scenery', 'calm'], event: 0.6, focus: [320, 165], peak: true, comments: ['暗い', '何かいた？'] },
        { id: 'box', name: '箱', desc: 'ガタガタ動く段ボール', tags: ['object', 'mundane'], event: 0.7, focus: [320, 200], peak: true, comments: ['箱', '動いてる'] },
        { id: 'stare', name: '見つめる', desc: '暗闇で光る目', tags: ['animal', 'face', 'reveal'], event: 0.6, focus: [320, 165], peak: true, comments: ['目', 'ひえっ'] },
        { id: 'punch', name: '猫パンチ', desc: 'カメラに猫パンチ', tags: ['animal', 'action', 'impact', 'cute'], event: 0.5, focus: [320, 180], peak: true, climax: true, comments: ['肉球!!', 'パンチw'] }
      ],
      subs: [
        { text: '奴が来る', tags: ['horror', 'suspense'] },
        { text: '振り向くな', tags: ['horror'] },
        { text: 'それは、突然だった', tags: ['suspense', 'trailer'] },
        { text: '逃げて', tags: ['horror'] },
        { text: '全米が震えた', tags: ['trailer', 'epic'] },
        { text: '2026年 夏 公開', tags: ['trailer', 'ending'] },
        { text: 'にゃーん', tags: ['cute'] },
        { text: 'かわいい', tags: ['cute'] },
        { text: '乞うご期待', tags: ['trailer', 'ending'] }
      ],
      constraints: [
        {
          id: 'mono2', label: 'モノクロを2カット以上', kind: 'must', pts: 12,
          check: function (st) { var n = st.fxCount('mono'); return n >= 2 ? { state: 'ok', detail: n + 'カットがモノクロ' } : { state: 'ng', detail: n + '/2カット' }; }
        },
        {
          id: 'sub3', label: '字幕は3回まで', kind: 'limit', pts: 10,
          check: function (st) { return limitCheck(st.subs.length, 3, '回'); }
        },
        {
          id: 'len10', label: '尺は10秒以内', kind: 'must', pts: 12,
          check: function (st) {
            if (!st.count) return { state: 'ng', detail: '0秒' };
            return st.total <= 10 ? { state: 'ok', detail: st.total + '秒' } : { state: 'ng', detail: st.total + '秒（' + (st.total - 10) + '秒オーバー）' };
          }
        }
      ],
      order: {
        label: '猫のかわいさも少し入れて！', detail: '「にゃーん」「かわいい」など、かわいい字幕を1つ',
        check: function (st) {
          return st.subs.some(function (c) { return subHas(c, 'cute'); }) ? { state: 'ok', detail: 'かわいさ注入済み' } : { state: 'ng', detail: 'かわいい字幕がない' };
        }
      },
      structure: function (st, add) {
        var r = {};
        if (st.last && subHas(st.last, 'trailer')) { add('neta', 8, '予告編の作法', '最後に公開日・煽り文句'); r.trailer = true; }
        if (st.count >= 3 && st.kept[st.count - 1].len === 1 && st.kept[st.count - 2].len === 1) { add('tempo', 6, '終盤の畳みかけ', 'ラスト2カットを1秒で連打'); }
        return r;
      },
      specials: [
        { id: 'zekkyo', hint: 'あくびを悲鳴に…', name: '絶叫あくび', desc: 'あくびが悲鳴にしか見えない', pts: 12,
          test: function (c) { return isShot(c, 'yawn') && fxIn(c, ['zoom', 'bigzoom', 'lines', 'shake']) && seIn(c, ['don', 'bomb']); },
          comments: ['叫んでるようにしか見えない', 'あくびが怖いwww', '牙!!'] },
        { id: 'miteha', hint: '暗闇の目を白黒で…', name: '見てはいけない目', desc: '白黒の闇に光る目', pts: 12,
          test: function (c) { return isShot(c, 'stare') && c.fx === 'mono' && subHasAny(c, ['horror', 'suspense']); },
          comments: ['目が光った', '夢に出る', 'ひぃ'] },
        { id: 'hako', hint: '揺れる箱に不穏な音を…', name: '箱の中の何か', desc: '揺れる箱から不穏な気配', pts: 10,
          test: function (c) { return isShot(c, 'box') && fxIn(c, ['shake', 'mono', 'zoom']) && seIn(c, ['zawa', 'don']); },
          comments: ['何か入ってる', '開けるな', '猫だよ'] },
        { id: 'arashi', hint: '眠る猫に不穏な言葉を…', name: '嵐の前の静けさ', desc: '寝顔に不穏な字幕', pts: 8,
          test: function (c) { return isShot(c, 'sleep') && subHasAny(c, ['horror', 'suspense']); },
          comments: ['寝てるだけなのに', 'フラグ', '静かすぎる'] },
        { id: 'gapmoe', hint: '怖い演出にかわいい字幕を…', name: 'ギャップ萌え恐怖', desc: '恐怖演出に「にゃーん」', pts: 10,
          test: function (c) { return fxIn(c, ['mono', 'shake', 'bigzoom']) && subHas(c, 'cute') && !isShot(c, 'sleep'); },
          comments: ['にゃーん(低音)', 'かわいいのか怖いのか', '情緒が迷子'] },
        { id: 'shime', hint: '最後は猫パンチで…', name: '予告編の締め', desc: '猫パンチで暗転', pts: 10,
          test: function (c, st) { return c === st.last && isShot(c, 'punch') && (c.fx === 'freeze' || seIn(c, ['don', 'bomb'])); },
          comments: ['公開日いつ？', '映画館で見たい', '猫パンチで締めw'] },
        { id: 'gyakurouka', hint: '廊下の時間を巻き戻す…', name: '逆再生の怪', desc: '廊下の何かが戻ってくる', pts: 8,
          test: function (c) { return isShot(c, 'hall') && c.fx === 'reverse'; },
          comments: ['逆再生こわ', '何か戻ってきた', 'うしろ！'] }
      ],
      legend: { name: '全米を震わせし者', desc: '猫の休日を、誰も眠れない予告編に変えた。' }
    },
    {
      id: 'sports', no: 3, color: '#2fa8ff', difficulty: 3,
      short: '目玉焼き → スポーツ決勝',
      title: '地味な料理動画を、熱狂のスポーツ決勝戦に編集せよ',
      source: 'はじめての目玉焼き',
      brief: '卵を割って焼くだけ。でも実況と歓声があれば、それは世界大会の決勝だ。',
      hint: '短いカットを畳みかけてテンポよく。歓声と「！」で熱狂を作れ。',
      weights: { tech: 0.3, tempo: 0.45, neta: 0.25 },
      targets: { sports: 3, hype: 3, impact: 2, action: 2, payoff: 1, ending: 1 },
      ideal: [5, 8], tempoPref: 'fast',
      shots: [
        { id: 'egg', name: '卵割り', desc: '卵をボウルに割る', tags: ['action', 'mundane'], event: 0.5, focus: [320, 175], peak: true, comments: ['卵', 'パカッ'] },
        { id: 'pan', name: 'フライパン', desc: '油をひくだけ', tags: ['object', 'mundane', 'calm'], event: 0.5, focus: [320, 230], peak: false, comments: ['油', '地味'] },
        { id: 'drop', name: '投入', desc: '卵がフライパンへ', tags: ['action'], event: 0.45, focus: [320, 235], peak: true, comments: ['ジュワー', 'いい音'] },
        { id: 'salt', name: '塩', desc: '塩をふる', tags: ['object', 'mundane'], event: 0.5, focus: [330, 140], peak: false, comments: ['塩', 'ぱらぱら'] },
        { id: 'flip', name: 'フリップ', desc: '目玉焼きが宙を舞う', tags: ['action'], event: 0.5, focus: [320, 105], peak: true, climax: true, comments: ['飛んだ!!', '高い'] },
        { id: 'plate', name: '完成', desc: 'お皿に盛り付け', tags: ['object', 'ending', 'calm'], event: 0.6, focus: [320, 210], peak: false, comments: ['うまそう', '完成'] }
      ],
      subs: [
        { text: '決まったー!!', tags: ['sports', 'hype', 'payoff'] },
        { text: '速い!', tags: ['sports', 'hype'] },
        { text: 'GOAL!!', tags: ['sports', 'hype'] },
        { text: '世界新記録!', tags: ['sports', 'epic', 'hype'] },
        { text: '解説の塩です', tags: ['sports', 'meme'] },
        { text: 'VAR判定中…', tags: ['sports', 'meme', 'suspense'] },
        { text: 'まさかの展開', tags: ['suspense'] },
        { text: 'いい焼き色ですね', tags: ['calm'] },
        { text: '優勝', tags: ['sports', 'ending', 'payoff'] }
      ],
      constraints: [
        {
          id: 'len8', label: '合計8秒以内', kind: 'must', pts: 12,
          check: function (st) {
            if (!st.count) return { state: 'ng', detail: '0秒' };
            return st.total <= 8 ? { state: 'ok', detail: st.total + '秒' } : { state: 'ng', detail: st.total + '秒（' + (st.total - 8) + '秒オーバー）' };
          }
        },
        {
          id: 'se3', label: '効果音を3回以上', kind: 'must', pts: 12,
          check: function (st) { var n = st.seClips.length; return n >= 3 ? { state: 'ok', detail: n + '回' } : { state: 'ng', detail: n + '/3回' }; }
        },
        {
          id: 'bang2', label: '「!」付きの字幕を2つ以上', kind: 'must', pts: 10,
          check: function (st) {
            var n = st.subs.filter(function (c) { return /[!！]/.test(c.sub.text); }).length;
            return n >= 2 ? { state: 'ok', detail: n + '個' } : { state: 'ng', detail: n + '/2個' };
          }
        }
      ],
      order: {
        label: 'スポンサーの「塩」をアピールして！', detail: '塩のカットに字幕か演出を付ける',
        check: function (st) {
          var c = st.kept.filter(function (k) { return isShot(k, 'salt'); })[0];
          if (!c) return { state: 'ng', detail: '塩がカットされている' };
          return (c.sub || fxIn(c, LOOK_FX)) ? { state: 'ok', detail: '塩が輝いている' } : { state: 'ng', detail: '塩が目立っていない' };
        }
      },
      structure: function (st, add) {
        if (st.count < 3) return {};
        var half = Math.floor(st.count / 2), a = 0, b = 0;
        st.kept.forEach(function (c) {
          var n = (subHasAny(c, ['sports', 'hype']) ? 1 : 0) + (SE[c.se].tags.indexOf('hype') >= 0 || SE[c.se].tags.indexOf('sports') >= 0 ? 1 : 0) + (FX[c.fx].tags.indexOf('hype') >= 0 ? 1 : 0);
          if (c.pos < half) a += n; else b += n;
        });
        if (b > a && b >= 2) { add('neta', 8, '後半に向けて実況が加熱', '前半' + a + ' → 後半' + b + 'の熱量'); return { escalate: true }; }
        return {};
      },
      specials: [
        { id: 'kuchu', hint: '舞う目玉焼きをじっくり、観客と…', name: '空中戦の名場面', desc: '舞い上がる目玉焼きをスローで', pts: 12,
          test: function (c) { return isShot(c, 'flip') && c.fx === 'slow' && seIn(c, ['cheer', 'clap']); },
          comments: ['うおおおお', '美しい…', '滞空時間なが'] },
        { id: 'jikan', hint: '目玉焼きの時間を戻す…', name: '時を戻す目玉焼き', desc: 'フリップを逆再生', pts: 8,
          test: function (c) { return isShot(c, 'flip') && c.fx === 'reverse'; },
          comments: ['戻ったw', 'もう一回!', '物理法則どこ'] },
        { id: 'kaisetsu', hint: '塩に解説を任せる…', name: '名解説者・塩', desc: '塩が解説席に座った', pts: 10,
          test: function (c) { return isShot(c, 'salt') && c.sub && /塩|解説/.test(c.sub.text) && fxIn(c, ['zoom', 'bigzoom', 'lines', 'freeze']); },
          comments: ['塩が喋ったw', '解説の塩さん', 'しょっぱい解説'] },
        { id: 'shinsoku', hint: '卵割りを少年漫画風に…', name: '神速の卵割り', desc: '集中線で割る、それは競技', pts: 10,
          test: function (c) { return isShot(c, 'egg') && fxIn(c, ['lines', 'bigzoom']) && (subHasAny(c, ['sports', 'hype']) || seIn(c, ['shu', 'cheer'])); },
          comments: ['速すぎて見えない', '手首の返しが違う', '世界レベル'] },
        { id: 'hyoshodai', hint: '最後の皿を表彰台に…', name: '表彰台の目玉焼き', desc: '完成の皿が金メダルに見える', pts: 10,
          test: function (c, st) { return c === st.last && isShot(c, 'plate') && (c.fx === 'freeze' || seIn(c, ['clap', 'cheer', 'kane'])) && subHasAny(c, ['payoff', 'sports', 'epic']); },
          comments: ['金メダル', '国歌流れそう', '感動した'] },
        { id: 'var', hint: '判定のために止める…', name: 'VAR判定', desc: '静止して判定を待つ', pts: 10,
          test: function (c) { return fxIn(c, ['freeze', 'slow']) && c.sub && /VAR/i.test(c.sub.text) && (isShot(c, 'flip') || isShot(c, 'drop') || isShot(c, 'egg')); },
          comments: ['VARw', '判定は…？', 'オフサイド？'] },
        { id: 'bakuhatsu', hint: '卵を入れたら…', name: '爆発的ジュワー', desc: '卵を入れたら爆発した', pts: 6,
          test: function (c) { return isShot(c, 'drop') && c.se === 'bomb'; },
          comments: ['火事!?', '爆発したw', '火力どうなってんの'] }
      ],
      legend: { name: '名実況の料理人', desc: '目玉焼きひとつで、スタジアムを総立ちにした。' }
    },
    {
      id: 'emo', no: 4, color: '#59c27a', difficulty: 3,
      short: 'カップ麺 → 感動ドキュメンタリー',
      title: 'カップ麺ができるまでの3分間を、涙の感動ドキュメンタリーにせよ',
      source: '深夜のカップ麺',
      brief: 'お湯を注いで、待って、食べる。それだけの3分間に、人生のすべてを詰め込め。',
      hint: 'うるさい演出は禁物。スローと余韻で泣かせろ。長めのカットが効く。',
      weights: { tech: 0.35, tempo: 0.3, neta: 0.35 },
      targets: { emotional: 3, thanks: 2, dramatic: 2, calm: 2, epic: 2, payoff: 1, ending: 1 },
      ideal: [14, 18], tempoPref: 'slow',
      shots: [
        { id: 'pour', name: 'お湯', desc: 'お湯を注ぐ', tags: ['action', 'mundane'], event: 0.5, focus: [300, 215], peak: false, comments: ['お湯', '夜食'] },
        { id: 'lid', name: 'フタ', desc: 'フタを閉める', tags: ['object', 'mundane'], event: 0.6, focus: [320, 175], peak: false, comments: ['3分', '待つ'] },
        { id: 'clock', name: '時計', desc: '秒針が進む', tags: ['object', 'calm'], event: 0.5, focus: [320, 175], peak: false, comments: ['カチ…カチ…', '長い'] },
        { id: 'rain', name: '雨の窓', desc: '窓の外は雨', tags: ['scenery', 'calm', 'emotional'], event: 0.6, focus: [320, 180], peak: false, comments: ['雨', 'しんみり'] },
        { id: 'open', name: 'フタを開ける', desc: '湯気があふれる', tags: ['reveal', 'emotional'], event: 0.5, focus: [320, 190], peak: true, climax: true, comments: ['湯気!!', 'できた'] },
        { id: 'slurp', name: 'すする', desc: '麺をすする', tags: ['action', 'ending'], event: 0.6, focus: [320, 140], peak: true, comments: ['うまそう', 'ずるずる'] }
      ],
      subs: [
        { text: '3分間の奇跡', tags: ['emotional', 'epic'] },
        { text: '待つ、という勇気', tags: ['emotional', 'dramatic'] },
        { text: '深夜1時', tags: ['calm', 'foreshadow'] },
        { text: '彼は、泣いた', tags: ['emotional'] },
        { text: '人生は、カップ麺だ', tags: ['epic', 'meme'] },
        { text: 'ありがとう', tags: ['emotional', 'thanks', 'ending'] },
        { text: '麺が、のびた', tags: ['fail', 'comedy'] },
        { text: '完', tags: ['ending'] }
      ],
      constraints: [
        {
          id: 'se1', label: '効果音は1回まで', kind: 'limit', pts: 10,
          check: function (st) { return limitCheck(st.seClips.length, 1, '回'); }
        },
        {
          id: 'slow2', label: 'スローを2カット以上', kind: 'must', pts: 12,
          check: function (st) { var n = st.fxCount('slow'); return n >= 2 ? { state: 'ok', detail: n + 'カットがスロー' } : { state: 'ng', detail: n + '/2カット' }; }
        },
        {
          id: 'len14', label: '合計14秒以上', kind: 'must', pts: 12,
          check: function (st) { return st.total >= 14 ? { state: 'ok', detail: st.total + '秒' } : { state: 'ng', detail: st.total + '秒（あと' + (14 - st.total) + '秒）' }; }
        }
      ],
      order: {
        label: '最後に感謝の言葉を入れて！', detail: '最後のカットに「ありがとう」系の字幕',
        check: function (st) {
          return st.last && subHas(st.last, 'thanks') ? { state: 'ok', detail: '感謝が伝わった' } : { state: 'ng', detail: '最後に感謝の字幕がない' };
        }
      },
      structure: function (st, add) {
        if (st.count < 3) return {};
        var first = st.kept[0];
        var quiet = first.se === 'none' && !fxIn(first, ['shake', 'bigzoom', 'lines', 'reverse']);
        if (quiet && st.last && subHasAny(st.last, ['emotional', 'thanks', 'ending'])) {
          add('neta', 8, '静寂から感動へ', '静かな始まりから、最後に言葉で泣かせる');
          return { quietToEmo: true };
        }
        return {};
      },
      specials: [
        { id: 'mikata', hint: '秒針をゆっくり、言葉を添えて…', name: '時間を味方に', desc: 'スローの秒針が人生の重みに', pts: 10,
          test: function (c) { return isShot(c, 'clock') && c.fx === 'slow' && subHasAny(c, ['emotional', 'dramatic', 'calm']); },
          comments: ['秒針が重い', '時間って…', 'エモい'] },
        { id: 'kougou', hint: 'フタを開けた瞬間に鐘を…', name: '神々しい湯気', desc: 'フタを開けたら後光が差した', pts: 12,
          test: function (c) { return isShot(c, 'open') && fxIn(c, ['freeze', 'slow', 'zoom']) && c.se === 'kane'; },
          comments: ['後光が差してる', 'ありがたや', '神降臨'] },
        { id: 'kansha', hint: '最後の一口に感謝を…', name: '感謝の一杯', desc: 'すする姿に「ありがとう」', pts: 12,
          test: function (c, st) { return c === st.last && isShot(c, 'slurp') && subHas(c, 'thanks'); },
          comments: ['いただきます', '泣いた', 'ありがとう…'] },
        { id: 'amenamida', hint: '雨の窓に涙の字幕を…', name: '雨と涙', desc: '白黒の雨に涙の字幕', pts: 10,
          test: function (c) { return isShot(c, 'rain') && fxIn(c, ['mono', 'slow']) && subHas(c, 'emotional'); },
          comments: ['エモすぎる', '雨…', '(´；ω；｀)'] },
        { id: 'nobita', hint: '感動の最後にまさかのオチ…', name: '悲劇のオチ', desc: '感動の果てに麺がのびた', pts: 10,
          test: function (c, st) { return c === st.last && subHas(c, 'fail'); },
          comments: ['のびてるwww', '3分どころじゃない', '感動を返せ'] },
        { id: 'jinsei', hint: '湯気の中で人生を語る…', name: '人生哲学', desc: '湯気の中で人生を語る', pts: 8,
          test: function (c) { return (isShot(c, 'open') || isShot(c, 'slurp')) && c.sub && /人生/.test(c.sub.text) && fxIn(c, ['freeze', 'slow', 'zoom']); },
          comments: ['深い…？', '名言出た', '何言ってんだw'] }
      ],
      legend: { name: '涙腺破壊職人', desc: 'カップ麺で、視聴者の涙腺を3分で破壊した。' }
    }
  ];

  // ---- どのお題でも起きるコンボ（極端な編集を「芸」として拾う） ----
  var GENERIC_SPECIALS = [
    { id: 'deochi', hint: '一番の見せ場を最初に…', name: '出オチ', desc: 'いきなりクライマックスから始まる', pts: 8, scope: 'edit',
      test: function (st) { return st.count >= 3 && st.kept[0].shot.climax; },
      comments: ['出オチw', 'いきなりクライマックス', 'もう終わり？'] },
    { id: 'tendon', hint: '同じ効果音を何度も…', name: '天丼', desc: '同じ効果音を4回以上', pts: 12, scope: 'edit',
      test: function (st) { var m = st.seMaxSame; return m.n >= 4; },
      comments: ['また!?', 'しつこいwww', '天丼'] },
    { id: 'kaomen', hint: '寄って寄って寄りまくる…', name: '顔面ドアップ地獄', desc: '4カット以上で急接近', pts: 10, scope: 'edit',
      test: function (st) { return st.fxCount('bigzoom') >= 4; },
      comments: ['近い近い近い', '圧がすごい', '毛穴見えそう'] },
    { id: 'jimakutendon', hint: '同じ字幕を何度も…', name: '字幕の天丼', desc: '同じ字幕を3回以上', pts: 6, scope: 'edit',
      test: function (st) { return st.subMaxSame >= 3; },
      comments: ['またそれw', '字幕コピペ', '天丼やめろw'] },
    { id: 'jimakuwall', hint: 'とにかく長い字幕を…', name: '字幕で画面が見えない', desc: '20文字以上の字幕', pts: 6, scope: 'edit',
      test: function (st) { return st.subs.some(function (c) { return c.sub.chars >= 20; }); },
      comments: ['読めない', '字幕が本体', '映像どこ'] },
    { id: 'onepoint', hint: '1カットに全部を注ぎ込む…', name: '一点豪華主義', desc: '1カットに字幕・演出・効果音を全部', pts: 10, scope: 'edit',
      test: function (st) { var c = st.kept[0]; return st.count === 1 && c.sub && c.fx !== 'none' && c.se !== 'none'; },
      comments: ['1カットで勝負w', '潔い', '短っ'] },
    { id: 'chinochi', hint: '最後に「チーン」…', name: 'チーン落ち', desc: '最後に「チーン」', pts: 8, scope: 'edit',
      test: function (st) { return st.count >= 2 && st.last.se === 'chin'; },
      comments: ['チーン', 'オチたw', '台無しで草'] },
    { id: 'gyakko', hint: '何度も時間を戻す…', name: '時間逆行編集', desc: '逆再生を3回以上', pts: 8, scope: 'edit',
      test: function (st) { return st.fxCount('reverse') >= 3; },
      comments: ['全部戻ってるw', '時空が歪んでる', 'TENETかな'] },
    { id: 'zenbu', hint: '全カットに全部乗せ…', name: '全部盛り', desc: '全カットに字幕・演出・効果音', pts: 10, scope: 'edit',
      test: function (st) { return st.count >= 4 && st.kept.every(function (c) { return c.sub && c.fx !== 'none' && c.se !== 'none'; }); },
      comments: ['全部乗せ', '情報過多', '編集者寝てない'] }
  ];

  // ---- 視聴者コメントの素材 ----
  var COMMENTS = {
    start: ['わこつ', 'はじまった', 'お題きた', 'きたー', '待ってた'],
    tag: {
      impact: ['ドンッ', 'びくっとした', '急に!?'],
      horror: ['こわ', 'ひえっ', '夜に見るんじゃなかった', '鳥肌'],
      comedy: ['草', 'www', 'なんでやねん'],
      epic: ['壮大すぎる', '映画化決定', 'BGM流れてる'],
      foreshadow: ['伏線きた', 'これは…', '覚えておこう'],
      payoff: ['伏線回収!!', '繋がった!!', 'そういうことか'],
      sports: ['いけえええ', 'うおおお', '実況うますぎ'],
      hype: ['うおおお', 'アツい', 'キター'],
      emotional: ['泣いた', '(´；ω；｀)', 'エモい', 'なぜか涙が'],
      cute: ['かわいい', 'にゃーん', '癒し'],
      suspense: ['不穏', 'ざわざわする', 'え…？'],
      trailer: ['公開日いつ', '絶対見る', '予告うまい'],
      meme: ['草', 'ワロタ', 'これは伸びる'],
      fail: ['あっ', 'ドンマイ', 'オチたw'],
      ending: ['終わった…', '余韻', 'つづくの!?'],
      chaos: ['うるさいwww', '情報量が多い', '編集者疲れてる？'],
      thanks: ['こちらこそ', 'ありがとう', '泣いた']
    },
    fx: {
      zoom: ['寄った', 'ズームきた'],
      bigzoom: ['近い近い', '顔www', 'ドアップ草'],
      shake: ['揺れてる', '地震？', '酔う'],
      slow: ['スロー入った', '美しい…'],
      freeze: ['止まったw', 'ここで静止', 'サムネ確定'],
      mono: ['急に白黒', '雰囲気ある', '昭和'],
      reverse: ['逆再生w', '戻ってる', 'ん？'],
      lines: ['集中線w', '少年漫画かな', '熱い']
    },
    se: {
      don: ['ドンッ', 'びくっとした'],
      bomb: ['爆発!?', 'なんで爆発w'],
      cheer: ['ワァァァ', '観客どこw'],
      shu: ['シュッ', '速い'],
      kane: ['ゴーン…', '除夜の鐘？'],
      zawa: ['ざわ…', '不穏'],
      clap: ['8888', 'パチパチ'],
      chin: ['チーン', '終わった…'],
      hyu: ['ヒュ〜w', '落ちた']
    },
    nothing: ['素材そのまま？', '編集とは', '虚無', '何も起きない'],
    overload: ['字幕が本体', '読めねえ', '文字で見えない'],
    endGood: ['8888888', '神編集', '保存した', 'これは伸びる', '天才か'],
    endMid: ['888', 'いいね', 'おつ', 'なるほど'],
    endBad: ['は？', 'これで終わり？', '草', '事故', 'おつ…'],
    endHell: ['なんだこれwww', '地獄', '耳がぁぁ', '炎上不可避', 'クセになる']
  };

  // ---- 称号（優先度が高いものがメイン、それ以外はバッジ） ----
  // cond(ctx) の ctx: { st, sc, specials, timeout, edits }
  var TITLES = [
    { id: 'void', name: '虚無の創造主', desc: '0秒の動画を投稿した。ある意味で前衛芸術。', prio: 100, cond: function (x) { return x.st.count === 0; } },
    { id: 'houki', name: '編集放棄', desc: '何もしないまま締め切りを迎えた。素材が泣いている。', prio: 96, cond: function (x) { return x.edits === 0 && x.timeout; } },
    { id: 'legend', name: null, desc: null, prio: 92, cond: function (x) { return x.sc.total >= 88; } },
    { id: 'se_bouryoku', name: '効果音の暴力', desc: '視聴者の鼓膜を本気で殴りにいった。', prio: 86, cond: function (x) { return x.st.seClips.length >= 5; } },
    { id: 'jimaku_tsumi', name: '字幕過多の罪', desc: '映像より文字のほうが多い。もはや小説。', prio: 85, cond: function (x) { return (x.st.subs.length >= 5 && x.st.subChars >= 35) || x.st.subs.some(function (c) { return c.sub.chars >= 24; }); } },
    { id: 'zoom_izon', name: 'ズーム依存症', desc: '寄らずにはいられない。被写体との距離感がバグっている。', prio: 84, cond: function (x) { return x.st.fxCount('zoom') + x.st.fxCount('bigzoom') >= 4; } },
    { id: 'kamishibai', name: '紙芝居職人', desc: '止めすぎて、もはや動画ではない。', prio: 83, cond: function (x) { return x.st.fxCount('freeze') >= 3; } },
    { id: 'tokikake', name: '時をかける編集者', desc: '時間を巻き戻しすぎて視聴者が迷子。', prio: 82, cond: function (x) { return x.st.fxCount('reverse') >= 3; } },
    { id: 'zenbu', hint: '全カットに全部乗せ…', name: '全部盛り職人', desc: '足し算しか知らない。引き算はどこへ。', prio: 81, cond: function (x) { return x.specials.indexOf('zenbu') >= 0; } },
    { id: 'gyakufukusen', name: '回収してから伏線を張る人', desc: '答えを先に言ってしまう、正直者。', prio: 80, cond: function (x) { return !!x.structure.gyakuFukusen; } },
    { id: 'shirokuro', name: '白黒つけたがり', desc: '世界から色を奪いすぎた。', prio: 79, cond: function (x) { return x.st.fxCount('mono') >= 4; } },
    { id: 'nagamawashi', name: '長回しの求道者', desc: '切らない勇気。いや、切って。', prio: 78, cond: function (x) { return x.st.count >= 3 && x.st.kept.every(function (c) { return c.len === 3; }) && x.st.themeId !== 'emo'; } },
    { id: 'onecut', name: 'ワンカット至上主義', desc: '1カットにすべてを懸けた。', prio: 77, cond: function (x) { return x.st.count === 1; } },
    { id: 'nobita', hint: '感動の最後にまさかのオチ…', name: '感動クラッシャー', desc: '最後の最後で、全部台無しにした。', prio: 76, cond: function (x) { return x.specials.indexOf('nobita') >= 0 || x.specials.indexOf('chinochi') >= 0; } },
    { id: 'deadline', name: '締め切りブレイカー', desc: '「すみません、あと5分だけ…」', prio: 70, cond: function (x) { return x.timeout; } },
    { id: 'combo', name: 'コンボマスター', desc: '素材と演出の化学反応を見抜く目を持つ。', prio: 66, cond: function (x) { return x.specials.length >= 3; } },
    { id: 'lovable', name: '愛すべきクソ編集', desc: '技術はないが、なぜか目が離せない。', prio: 62, cond: function (x) { return x.sc.neta >= 60 && x.sc.tech < 40; } },
    { id: 'enjou', name: '炎上請負人', desc: '低評価の数だけ、再生数が伸びる。', prio: 60, cond: function (x) { return x.sc.hell >= 60; } },
    { id: 'shokunin', name: '職人気質', desc: '制約を完璧に守る、締め切りに強いタイプ。', prio: 50, cond: function (x) { return x.sc.tech >= 85 && x.sc.total >= 50; } },
    { id: 'tempo_oni', name: 'テンポの鬼', desc: 'カット割りに一切の迷いがない。', prio: 49, cond: function (x) { return x.sc.tempo >= 88 && x.sc.total >= 50; } },
    { id: 'neta_god', name: 'ネタの申し子', desc: '素材から笑いを掘り当てる才能。', prio: 48, cond: function (x) { return x.sc.neta >= 85 && x.sc.total >= 50; } },
    { id: 'rookie', name: '期待の新人編集者', desc: 'このまま伸びれば、いつか神編集。', prio: 30, cond: function (x) { return x.sc.total >= 70; } },
    { id: 'soso', name: 'そこそこ編集者', desc: '可もなく不可もなく。それが一番むずかしい。', prio: 20, cond: function (x) { return x.sc.total >= 50; } },
    { id: 'sozai', name: '素材の味を活かす人', desc: '編集はほぼしていない。素材を信じている。', prio: 15, cond: function (x) { return x.edits <= 2; } },
    { id: 'minarai', name: '編集見習い', desc: 'まずは字幕と効果音から覚えよう。', prio: 10, cond: function () { return true; } }
  ];

  var RANKS = [
    { min: 88, rank: 'S', label: '神編集' },
    { min: 75, rank: 'A', label: '名編集' },
    { min: 60, rank: 'B', label: '良編集' },
    { min: 45, rank: 'C', label: 'ふつう' },
    { min: 30, rank: 'D', label: '微妙' },
    { min: 0, rank: 'E', label: '事故' }
  ];

  var CHARAS = {
    mochi: { name: 'もち監督', color: '#fff3dd' },
    anko: { name: 'あんこ', color: '#ffc9d8' }
  };

  YG.DATA = {
    TAG_LABELS: TAG_LABELS, KEYWORDS: KEYWORDS, FX: FX, FX_KEYS: FX_KEYS, SE: SE, SE_KEYS: SE_KEYS,
    LENS: LENS, GENERIC_SUBS: GENERIC_SUBS, THEMES: THEMES, GENERIC_SPECIALS: GENERIC_SPECIALS,
    COMMENTS: COMMENTS, TITLES: TITLES, RANKS: RANKS, CHARAS: CHARAS,
    EDIT_SECONDS: 90, ORDER_AT: 45, MAX_FREE_CHARS: 30,
    getTheme: function (id) { for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i]; return null; },
    subsFor: function (theme) { return theme.subs.concat(GENERIC_SUBS); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
