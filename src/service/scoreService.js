/*
사용법

const sample_cards = [
    { suit: "S", rank: "A", val: 14, baseScore: 11 },
    { suit: "D", rank: "10", val: 10, baseScore: 10 },
    { suit: "H", rank: "10", val: 10, baseScore: 10 }
];
const sample_context = {
    handRank: 2,
    deckCount: 32,
    cards: [],
    relics: ["relic_a", "relic_b"],
    debug: false
};
;

console.log(calculateScore(sample_cards, sample_context));

*/

import { HAND_RANK, HAND_NAME } from "../constants.js";
import relicData from '../data/relic.json';

//최종 점수
export function calculateScore(cards, context) {
    const relics = getRelicsFromContext(context);

    // 1. 족보 계산
    const handResult = evaluateHand(cards);

    const ctx = {
      ...context,
      handRank: handResult.rank,
      handName : HAND_NAME[handResult.rank],
      cards: handResult.cards // 실제 사용된 5장
    };

    // 2. 기본 점수
    let score = calcHandScore(ctx.cards, ctx, relics);
  
    // 3. final scope 적용
    for (const relic of relics) {
      for (const effect of relic.effects) {
        if (effect.scope !== "final") continue;
        score = applyEffect(score, effect, null, ctx);
      }
    }
  
    return {
      rank: ctx.handRank,
      handName: ctx.handName,
      score,
      cards: ctx.cards
    };
  }

//핸드 점수
function calcHandScore(cards, ctx, relics) {
    let total = 0;
  
    for (const card of cards) {
      total += calcCardScore(card, ctx, relics);
    }
  
    // hand scope 적용
    for (const relic of relics) {
      for (const effect of relic.effects) {
        if (effect.scope !== "hand") continue;
        total = applyEffect(total, effect, null, ctx);
      }
    }
  
    return total;
  }

//카드 점수
function calcCardScore(card, ctx, relics) {
    let score = card.baseScore;
  
    for (const relic of relics) {
      for (const effect of relic.effects) {
        if (effect.scope !== "card") continue;
        score = applyEffect(score, effect, card, ctx);
      }
    }
  
    return score;
  }

// id → relic 객체 빠르게 찾기
const relicMap = Object.fromEntries(
    relicData.relics.map(r => [r.id, r])
);


function getRelicsFromContext(context) {
    return context.relics
        .map(id => relicMap[id])
        .filter(Boolean);
}

function checkCondition(cond, card, ctx) {
    console.log(cond, card, ctx);


    if (!cond) return true;

    // 카드 조건
    if (cond.suit && card?.suit !== cond.suit) return false;
    if (cond.rank && card?.rank !== cond.rank) return false;

    // 핸드 조건
    if (cond.handName && ctx.handName !== cond.handName) return false;

    // 덱 조건
    if (cond.deckCountGte && ctx.deckCount < cond.deckCountGte) return false;

    return true;
}

function applyEffect(score, effect, card, ctx) {
    if (!checkCondition(effect.condition, card, ctx)) return score;

    switch (effect.type) {
        case "add":
            return score + effect.value;

        case "multiply":
            return score * effect.value;

        default:
            return score;
    }
}


//족보판별
function evaluateHand(cards) {
    const sorted = [...cards].sort((a, b) => b.val - a.val);

    const valueMap = groupBy(sorted, c => c.val);
    const suitMap = groupBy(sorted, c => c.suits);

    //const values = sorted.map(c => c.val);

    const straightCards = getStraightCards(sorted);
    const flushSuit = Object.keys(suitMap).find(s => suitMap[s].length >= 5);
    const flushCards = flushSuit ? suitMap[flushSuit].slice(0, 5) : null;

    const groups = Object.values(valueMap).sort((a, b) => b.length - a.length);

    let bestCards = [];
    let rank = HAND_RANK.HIGH_CARD;

    // Five Card
    if (groups[0].length === 5) {
        rank = HAND_RANK.FIVE_CARD;
        bestCards = groups[0];
    }

    // Straight Flush
    else if (flushSuit && straightCards) {
        const flushSet = new Set(suitMap[flushSuit].map(c => c.val));
        const sf = straightCards.filter(c => flushSet.has(c.val));

        if (sf.length >= 5) {
            rank = HAND_RANK.STRAIGHT_FLUSH;
            bestCards = sf.slice(0, 5);
        }
    }

    // Four of a kind
    else if (groups[0].length === 4) {
        rank = HAND_RANK.FOUR_OF_A_KIND;
        bestCards = [
            ...groups[0]
            //,...getKickers(sorted, groups[0], 1)
        ];
    }

    // Full house
    else if (groups[0].length === 3 && groups[1]?.length >= 2) {
        rank = HAND_RANK.FULL_HOUSE;
        bestCards = [
            ...groups[0],
            ...groups[1].slice(0, 2)
        ];
    }

    // Flush
    else if (flushSuit) {
        rank = HAND_RANK.FLUSH;
        bestCards = flushCards;
    }

    // Straight
    else if (straightCards) {
        rank = HAND_RANK.STRAIGHT;
        bestCards = straightCards.slice(0, 5);
    }

    // Two pair
    else if (groups[0].length === 2 && groups[1]?.length === 2) {
        rank = HAND_RANK.TWO_PAIR;
        bestCards = [
            ...groups[0],
            ...groups[1],
            ...getKickers(sorted, [...groups[0], ...groups[1]], 1)
        ];
    }

    // TRIPLE
    else if (groups[0].length === 3) {
        rank = HAND_RANK.TRIPLE;
        bestCards = [
            ...groups[0]
            //,...getKickers(sorted, groups[0], 2)
        ];
    }

    // One pair
    else if (groups[0].length === 2) {
        rank = HAND_RANK.ONE_PAIR;
        bestCards = [
            ...groups[0]
            //,...getKickers(sorted, groups[0], 3)
        ];
    }

    // High card
    else {
        bestCards = sorted.slice(0, 5);
    }

    const score = bestCards.reduce((sum, c) => sum + c.baseScore, 0);

    return {
        rank,
        score,
        cards: bestCards
    };
}

function groupBy(arr, keyFn) {
    const map = {};
    for (const item of arr) {
        const key = keyFn(item);
        if (!map[key]) map[key] = [];
        map[key].push(item);
    }
    return map;
}

function getKickers(sorted, usedCards, count) {
    const usedSet = new Set(usedCards);
    return sorted.filter(c => !usedSet.has(c)).slice(0, count);
}

function getStraightCards(cards) {
    let values = [...new Set(cards.map(c => c.val))];

    if (values.includes(14)) values.push(1);

    values.sort((a, b) => a - b);

    let seq = [];

    for (let i = 0; i < values.length; i++) {
        if (i === 0 || values[i] === values[i - 1] + 1) {
            seq.push(values[i]);
        } else {
            seq = [values[i]];
        }

        if (seq.length >= 5) {
            const needed = seq.slice(-5);

            return needed.map(v =>
                cards.find(c => c.val === v || (v === 1 && c.val === 14))
            );
        }
    }

    return null;
}
