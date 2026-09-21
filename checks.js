// AI原稿の赤字点検。ブラウザでもNodeでも同じ関数で動く（外部通信なし）。
// 黄 = AIっぽい言い回し（直す候補）。赤 = 人が確かめる箇所（数字・断定・出典・法令に触れる語）。
(function (root) {
  // 黄: 言い回し。reason は画面にそのまま出す説明、fix は直し方の例。
  const STYLE_RULES = [
    { id: 'closing', label: '締めの決まり文句', re: /いかがでした(?:でしょう)?か|参考になれば幸いです|お役に立てれば幸いです|ぜひ[^。\n]{0,20}てみてください/g,
      reason: 'AIの記事の締めでよく出る定型。読者はここで「AIが書いた」と気づきやすい', fix: '最後は「次にやること」を1文で書いて終える' },
    { id: 'kanou', label: '「〜することができます」', re: /することができ(?:ます|る)|することが可能(?:です|な)/g,
      reason: '同じ意味を長く言っている', fix: '「〜できます」「〜せます」に縮める' },
    { id: 'hedge', label: 'ぼかしの文末', re: /と言えるでしょう|と言っても過言ではありません|ではないでしょうか|と考えられます|かもしれません/g,
      reason: '言い切らずに逃げる文末。続くと中身が薄く見える', fix: '根拠があれば言い切る。なければ文ごと消す' },
    { id: 'abstract', label: '中身のない強調語', re: /さまざまな|様々な|多岐にわたる|重要です|重要な(?:ポイント|要素|役割)|鍵(?:となります|を握ります)|不可欠です|欠かせません|効果的です|大切です/g,
      reason: '何がどう大事かを言わずに強調している', fix: '「何が」「どれくらい」を具体的な物や数で言い直す' },
    { id: 'guide', label: '案内役の定型文', re: /結論から言うと|結論から申し上げますと|について(?:詳しく)?解説します|(?:詳しく)?見ていきましょう|それでは(?:早速|さっそく)|本記事では|この記事では|まとめると/g,
      reason: '中身の前に「これから話します」と言うだけの文', fix: '案内の文を消して、中身の1文目から始める' },
    { id: 'kotode', label: '「〜することで、」の連発', re: /することで、/g, countMin: 3,
      reason: '1本に3回以上あると、同じ骨組みの文が並んで見える', fix: '「〜すれば」「〜すると」に替えるか、2文に分ける' },
    { id: 'soshite', label: '「A、B、そしてC」の3つ並べ', re: /、そして[^。\n]{1,30}/g,
      reason: 'AIは3つ並べて最後を「そして」でつなぐ癖が強い', fix: '本当に3つ要るか見直す。1つに絞れるなら絞る' },
    { id: 'katakana', label: '抽象的なカタカナ語', re: /シームレス|ソリューション|ポテンシャル|アプローチ|包括的|最適化|活用しましょう|パフォーマンスを最大化/g,
      reason: '意味の幅が広すぎて、読者の頭に絵が浮かばない', fix: '日本語の具体的な動作に言い換える（例: 最適化→待ち時間を半分にする）' },
    { id: 'nayami', label: '導入の問いかけの定型', re: /そんな(?:お)?悩み(?:は|を)?(?:ありませんか|抱えていませんか)|こんな(?:お)?悩みはありませんか|と(?:感じた|思った)ことはありませんか/g,
      reason: 'AIの記事の書き出しで非常によく出る型', fix: '読者が困っている場面を1つだけ具体的に書いて始める' },
    { id: 'symbol', label: '貼る前に消す記号', density: false, re: /\*\*[^*\n]+\*\*|^-{3,}\s*$|^\s*\*\s{2,}|——|—|：(?=[^\n]{8,})|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gmu,
      reason: 'チャット画面の太字記号・区切り線・ダッシュ・文中のコロン・絵文字。入稿先でそのまま表示されたり、AIの文章に見えたりする', fix: '太字記号と区切り線は消す。コロンやダッシュは読点か、文を分けて書く' },
  ];

  // 赤: 人が確かめる箇所。ここは直す前に「本当か」を見る。
  const FACT_RULES = [
    { id: 'number', label: '数字', re: /[0-9０-９](?:[0-9０-９,，]|[.．](?=[0-9０-９]))*(?:%|％|パーセント|倍|万人|人|万円|円|億|件|社|年|か月|ヶ月|カ月|日|時間|分|秒|歳|位|割|kg|km|本|℃|度|ml|mL|cm|mm|g|回|セット)/g,
      reason: 'AIは数字を作ることがある。依頼者の資料か出典にある数字か確かめる' },
    { id: 'absolute', label: '断定・最上級', re: /必ず|絶対に?|確実に|100[%％]|誰でも|No\.?1|ナンバーワン|業界初|日本一|最も|最高の|最強/g,
      reason: '根拠がないと景品表示法や依頼者の信用に触れる言い方になる' },
    { id: 'source', label: '出典のない根拠', re: /調査によると|研究(?:では|によると)|と言われています|一般的に|データによると|統計(?:では|によると)|専門家によると/g,
      reason: '「誰の」「いつの」調査かが書かれていない。出典を足すか文を消す' },
    { id: 'claim', label: '効果・お金の約束', re: /治る|治ります|改善します|痩せ(?:る|ます)|稼げ(?:る|ます)|儲か(?:る|ります)|節税(?:でき|になり)|効果があります|効果が期待でき/g,
      reason: '健康・美容・お金の効果の言い切りは、薬機法や景品表示法の確認が要る' },
    { id: 'date', label: '日付・年', re: /(?:19|20)[0-9]{2}年(?:[0-9]{1,2}月)?|昨年|今年|最新の/g,
      reason: 'AIの知識は古いことがある。今の情報か確かめる' },
  ];

  function sentences(text) {
    const out = [];
    const re = /[^。！？!?\n]+[。！？!?]?/g;
    let m;
    while ((m = re.exec(text))) {
      const s = m[0].trim();
      if (s.length >= 4) out.push({ text: s, start: m.index, end: m.index + m[0].length });
    }
    return out;
  }

  function findAll(text, rules, kind) {
    const hits = [];
    for (const r of rules) {
      const re = new RegExp(r.re.source, r.re.flags);
      const found = [];
      let m;
      while ((m = re.exec(text))) {
        if (!m[0]) { re.lastIndex++; continue; }
        found.push({ kind, id: r.id, density: r.density, label: r.label, reason: r.reason, fix: r.fix || '', start: m.index, end: m.index + m[0].length, match: m[0] });
      }
      if (r.countMin && found.length < r.countMin) continue;
      hits.push(...found);
    }
    return hits;
  }

  // 文末の単調さ: 同じ文末が4文以上続いた箇所。
  function endingRuns(text) {
    const ss = sentences(text).filter(s => /[。！？!?]$/.test(s.text));
    const tail = s => s.text.replace(/[。！？!?]$/, '').slice(-2);
    const runs = [];
    let i = 0;
    while (i < ss.length) {
      let j = i;
      while (j + 1 < ss.length && tail(ss[j + 1]) === tail(ss[i])) j++;
      if (j - i + 1 >= 4) runs.push({ kind: 'style', id: 'ending', label: `同じ文末「${tail(ss[i])}」が${j - i + 1}文続く`, reason: '文末が同じだと読むリズムが単調になり、機械的に見える',
        fix: '途中の1〜2文を体言止め・問いかけ・短い1文に替える', start: ss[i].start, end: ss[j].end, match: ss.slice(i, j + 1).map(s => s.text).join('') });
      i = j + 1;
    }
    return runs;
  }

  function charCount(text) { return [...text.replace(/\s/g, '')].length; }

  // 同じ文字範囲に黄と赤が重なることは許す。表示では赤を優先する。
  function check(text, opts) {
    opts = opts || {};
    const style = findAll(text, STYLE_RULES, 'style').concat(endingRuns(text)).sort((a, b) => a.start - b.start);
    const facts = findAll(text, FACT_RULES, 'fact').sort((a, b) => a.start - b.start);
    const chars = charCount(text);
    const wording = style.filter(h => h.density !== false);
    const per1000 = chars ? Math.round((wording.length / chars) * 1000 * 10) / 10 : 0;
    const limit = opts.styleLimit != null ? opts.styleLimit : STYLE_LIMIT;
    const byRule = {};
    for (const h of style) byRule[h.label] = (byRule[h.label] || 0) + 1;
    const factByRule = {};
    for (const h of facts) factByRule[h.label] = (factByRule[h.label] || 0) + 1;
    return { chars, style, facts, wordingCount: wording.length, markupCount: style.length - wording.length, stylePer1000: per1000, styleLimit: limit, byRule, factByRule,
      styleOk: per1000 <= limit };
  }

  // 納品の判定。赤は全部「確かめた」印がつくまで出さない。黄は1000字あたりの数で見る。
  function verdict(result, confirmedCount) {
    const unconfirmed = result.facts.length - (confirmedCount || 0);
    if (unconfirmed > 0) return { level: 'stop', text: `まだ出さない。人が確かめる箇所が${unconfirmed}か所残っています` };
    if (!result.styleOk) return { level: 'fix', text: `事実の確認は済み。言い回しが1000字あたり${result.stylePer1000}件（目安${result.styleLimit}件以下）なので、黄色の箇所を直してから出す` };
    return { level: 'go', text: '赤は全部確かめ済み、言い回しも目安以内。最後に声に出して1回読んでから出す' };
  }

  // 直す前後で、数字・断定・日付が変わっていないかを見る（書き直しでAIが事実を足したり消したりするのを止める）。
  function factDiff(before, after) {
    const pick = t => findAll(t, FACT_RULES.filter(r => r.id === 'number' || r.id === 'date' || r.id === 'absolute'), 'fact').map(h => h.match.replace(/\s/g, ''));
    const count = arr => arr.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {});
    const b = count(pick(before)), a = count(pick(after));
    const removed = [], added = [];
    for (const k of Object.keys(b)) if ((a[k] || 0) < b[k]) removed.push(k);
    for (const k of Object.keys(a)) if ((b[k] || 0) < a[k]) added.push(k);
    return { same: removed.length === 0 && added.length === 0, removed, added };
  }

  // 依頼メモにない数字。メモが空なら判定しない（全部を赤のまま人が見る）。
  function notInMemo(text, memo) {
    if (!memo || !memo.trim()) return null;
    // 数字と単位をセットで照合する（メモの「2つ」で本文の「2倍」を見逃さないため）
    const norm = x => x.replace(/[０-９]/g, d => '０１２３４５６７８９'.indexOf(d)).replace(/[,，\s]/g, '').replace(/[ヶカ]月/g, 'か月').replace(/％/g, '%');
    const m = norm(memo);
    return findAll(text, FACT_RULES.filter(r => r.id === 'number'), 'fact').filter(h => !m.includes(norm(h.match)));
  }

  // 書き直しの指示文。黄色の文だけを渡し、赤の語は変えるなと指示する。
  function rewritePrompt(text, result, styleMemo) {
    const ss = sentences(text);
    const targets = [];
    for (const s of ss) {
      const hs = result.style.filter(h => h.density !== false && h.start < s.end && h.end > s.start);
      if (hs.length) targets.push({ s: s.text, why: [...new Set(hs.map(h => h.label))].join('／') });
    }
    const locked = [...new Set(result.facts.map(h => h.match))];
    const lines = [];
    lines.push('次の原稿のうち、番号つきの文だけを書き直してください。');
    lines.push('');
    lines.push('# 守ること');
    lines.push('- 番号つきの文以外は1文字も変えない');
    lines.push('- 書き直した文だけを「番号: 新しい文」の形で返す。説明や前置きは書かない');
    lines.push('- 意味・事実を足さない。例や数字を新しく作らない');
    if (locked.length) lines.push('- 次の語句は、そのまま残す: ' + locked.join('、'));
    lines.push('- 「〜することができます」「さまざまな」「重要です」「ではないでしょうか」「いかがでしたか」は使わない');
    lines.push('- 下の「私の書き方」は文末・長さ・語り口を寄せるための参考。そこにある口癖や締め方を、文に無理に足さない（口癖は全体で1回まで）');
    lines.push('- 文を消したほうが自然なら「番号: （削除）」と返す');
    lines.push('');
    lines.push('# 私の書き方（この書き方に寄せる）');
    lines.push(styleMemo && styleMemo.trim() ? styleMemo.trim() : '（文体メモが空です。ページの「文体メモ」欄に書くと、ここに入ります）');
    lines.push('');
    lines.push('# 書き直す文');
    targets.forEach((t, i) => lines.push(`${i + 1}: ${t.s}　（理由: ${t.why}）`));
    return { prompt: lines.join('\n'), targets };
  }

  // 返ってきた「番号: 新しい文」を元の原稿に差し戻す。
  function applyRewrite(text, targets, answer) {
    let out = text;
    let applied = 0;
    const map = {};
    for (const line of answer.split('\n')) {
      const m = line.match(/^\s*([0-9０-９]+)\s*[:：.．]\s*(.+)$/);
      if (m) map[Number(m[1].replace(/[０-９]/g, d => '０１２３４５６７８９'.indexOf(d)))] = m[2].trim();
    }
    targets.forEach((t, i) => {
      const nw = map[i + 1];
      if (nw && out.includes(t.s)) { out = out.replace(t.s, /^[（(]削除[）)]$/.test(nw) ? '' : nw); applied++; }
    });
    return { text: out, applied, expected: targets.length };
  }

  // チャット画面からコピーしたときに残る記号を消す（太字の**・区切り線・行頭の*）。文の中身は変えない。
  function stripMarkup(text) {
    return text
      .replace(/\*\*([^*\n]+)\*\*/g, '$1')
      .replace(/^\s*-{3,}\s*$/gm, '')
      .replace(/^(\s*)\*\s{1,}/gm, '$1・')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/\n{3,}/g, '\n\n');
  }

  // 目安は実測で決めた値（experience/kit/results/calibration.json）。
  let STYLE_LIMIT = 2;
  function setStyleLimit(v) { STYLE_LIMIT = v; }

  const api = { notInMemo, stripMarkup, STYLE_RULES, FACT_RULES, sentences, check, verdict, factDiff, rewritePrompt, applyRewrite, charCount, setStyleLimit, endingRuns };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Akaji = api;
})(typeof window !== 'undefined' ? window : globalThis);
