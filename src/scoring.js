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
 */

/**
 * @param {Array<{suit:string, rank:string, val:number}>} cards
 * @returns {{ score: number, label: string }}
 */
export function calcScore(cards) {
  if (!cards || cards.length === 0) return { score: 0, label: '' };

  const candidates = [
    findFourOfKind(cards),
    findFlush(cards),
    findStraight(cards),
    ...findAllTriples(cards),
    ...findAllPairs(cards),
  ].filter(Boolean);

  if (candidates.length === 0) {
    const best = cards.reduce((a, b) => a.val > b.val ? a : b);
    return { score: best.val, label: '하이카드' };
  }

  // 가장 높은 점수 반환
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

// ── 포카드 ────────────────────────────────────────────────────────────────────
function findFourOfKind(cards) {
  let best = null;
  for (const g of Object.values(groupByVal(cards))) {
    if (g.length >= 4) {
      const score = g.slice(0, 4).reduce((s, c) => s + c.val, 0) * 5;
      if (!best || score > best.score) best = { score, label: '포카드' };
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
      const score  = sorted.slice(0, 5).reduce((s, c) => s + c.val, 0) * 4;
      if (!best || score > best.score) best = { score, label: '플러시' };
    }
  }
  return best;
}

// ── 스트레이트 ────────────────────────────────────────────────────────────────
function findStraight(cards) {
  const vals = [...new Set(cards.map(c => c.val))].sort((a, b) => a - b);
  let best = null;
  let i = 0;
  while (i < vals.length) {
    let j = i;
    while (j + 1 < vals.length && vals[j + 1] === vals[j] + 1) j++;
    if (j - i + 1 >= 5) {
      // 연속 구간에서 가장 높은 5장
      const top5sum = vals.slice(Math.max(i, j - 4), j + 1).reduce((s, v) => s + v, 0);
      const score   = top5sum * 4;
      if (!best || score > best.score) best = { score, label: '스트레이트' };
    }
    i = j + 1;
  }
  return best;
}

// ── 트리플 (여러 개 가능) ─────────────────────────────────────────────────────
function findAllTriples(cards) {
  return Object.values(groupByVal(cards))
    .filter(g => g.length === 3)
    .map(g => ({ score: g.reduce((s, c) => s + c.val, 0) * 2, label: '트리플' }));
}

// ── 페어 (여러 개 가능) ───────────────────────────────────────────────────────
function findAllPairs(cards) {
  return Object.values(groupByVal(cards))
    .filter(g => g.length === 2)
    .map(g => ({ score: g.reduce((s, c) => s + c.val, 0) * 2, label: '페어' }));
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
