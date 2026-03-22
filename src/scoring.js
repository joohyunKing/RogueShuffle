/**
 * scoring.js
 * 선택된 카드 배열로 최고 족보를 찾아 점수를 반환합니다.
 *
 * 족보 우선순위 (점수 높은 순):
 *   포카드   : 같은 val 4장 → val 합산 × 5
 *   플러시   : 같은 suit 5장 이상 → 높은 val 상위 5장 합산 × 4
 *   스트레이트: 연속된 val 5장 이상 → 높은 쪽 5장 합산 × 4
 *   트리플   : 같은 val 3장 → val 합산 × 2
 *   페어     : 같은 val 2장 → val 합산 × 2
 *   하이카드  : 가장 높은 1장
 *
 * 반환값: { score, label, cards }
 *   cards — 족보를 구성하는 카드 객체 배열 (진동 효과 등에 활용)
 */

/**
 * @param {Array<{suit:string, rank:string, val:number}>} cards
 * @returns {{ score: number, label: string, cards: Array }}
 */
export function calcScore(cards) {
  if (!cards || cards.length === 0) return { score: 0, label: '', cards: [] };

  const candidates = [
    findFourOfKind(cards),
    findFlush(cards),
    findStraight(cards),
    ...findAllTriples(cards),
    ...findAllPairs(cards),
  ].filter(Boolean);

  if (candidates.length === 0) {
    const best = cards.reduce((a, b) => a.val > b.val ? a : b);
    return { score: best.val, label: '하이카드', cards: [best] };
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

// ── 포카드 ────────────────────────────────────────────────────────────────────
function findFourOfKind(cards) {
  let best = null;
  for (const g of Object.values(groupByVal(cards))) {
    if (g.length >= 4) {
      const used  = g.slice(0, 4);
      const score = used.reduce((s, c) => s + c.val, 0) * 5;
      if (!best || score > best.score) best = { score, label: '포카드', cards: used };
    }
  }
  return best;
}

// ── 플러시 ────────────────────────────────────────────────────────────────────
function findFlush(cards) {
  let best = null;
  for (const g of Object.values(groupBySuit(cards))) {
    if (g.length >= 5) {
      const sorted = [...g].sort((a, b) => b.val - a.val);
      const used   = sorted.slice(0, 5);
      const score  = used.reduce((s, c) => s + c.val, 0) * 4;
      if (!best || score > best.score) best = { score, label: '플러시', cards: used };
    }
  }
  return best;
}

// ── 스트레이트 ────────────────────────────────────────────────────────────────
function findStraight(cards) {
  const rawVals = [...new Set(cards.map(c => c.val))];
  const vals = rawVals.includes(14)
    ? [...new Set([1, ...rawVals])].sort((a, b) => a - b)
    : rawVals.sort((a, b) => a - b);

  let best = null;
  let i = 0;
  while (i < vals.length) {
    let j = i;
    while (j + 1 < vals.length && vals[j + 1] === vals[j] + 1) j++;
    if (j - i + 1 >= 5) {
      const top5vals = vals.slice(Math.max(i, j - 4), j + 1);
      const top5sum  = top5vals.reduce((s, v) => s + v, 0);
      const score    = top5sum * 4;
      if (!best || score > best.score) {
        // val=1 은 A(14)에 대응
        const used = top5vals.map(v => cards.find(c => c.val === (v === 1 ? 14 : v))).filter(Boolean);
        best = { score, label: '스트레이트', cards: used };
      }
    }
    i = j + 1;
  }
  return best;
}

// ── 트리플 (여러 개 가능) ─────────────────────────────────────────────────────
function findAllTriples(cards) {
  return Object.values(groupByVal(cards))
    .filter(g => g.length === 3)
    .map(g => ({ score: g.reduce((s, c) => s + c.val, 0) * 2, label: '트리플', cards: g }));
}

// ── 페어 (여러 개 가능) ───────────────────────────────────────────────────────
function findAllPairs(cards) {
  return Object.values(groupByVal(cards))
    .filter(g => g.length === 2)
    .map(g => ({ score: g.reduce((s, c) => s + c.val, 0) * 2, label: '페어', cards: g }));
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────
function groupByVal(cards) {
  return cards.reduce((acc, c) => {
    (acc[c.val] = acc[c.val] || []).push(c);
    return acc;
  }, {});
}

function groupBySuit(cards) {
  return cards.reduce((acc, c) => {
    (acc[c.suit] = acc[c.suit] || []).push(c);
    return acc;
  }, {});
}
