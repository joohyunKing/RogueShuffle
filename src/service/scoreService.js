import { HAND_RANK, HAND_DATA } from "../constants.js";
import { relicMap } from '../manager/relicManager.js';
import { sealMap } from '../manager/sealManager.js';

const ADD_TYPES      = new Set(["add", "addPerHandUsage", "addPerTotalHandUsage"]);
const MULTIPLY_TYPES = new Set(["multiply", "multiplyPerHandRemaining"]);

// calculateScore — getScoreDetails의 경량 wrapper (프리뷰용)
export function calculateScore(cards, context) {
    const d = getScoreDetails(cards, context);
    return {
        rank: d.handRank,
        handName: d.handName,
        score: d.totalScore,
        cards: d.cards,
        aoe: d.aoe,
    };
}

//카드 점수
function calcCardScore(card, ctx, relics) {
    let score = card.baseScore;
    for (const enh of (card.enhancements ?? [])) {
        if (enh.type === 'red')  score += sealMap['red']?.scoreBonus ?? 20;
        // if (enh.type === 'add')  score += enh.value;   // 하위 호환 (미사용)
    }

    for (const relic of relics) {
        for (const effect of (relic.effects ?? [])) {
            if (effect.scope !== "card") continue;
            score = applyEffect(score, effect, card, ctx);
        }
    }

    return score;
}

function getRelicsFromContext(context) {
    return context.relics
        .map(id => relicMap[id])
        .filter(Boolean);
}

function checkCondition(cond, card, ctx) {
    if (!cond) return true;

    // 카드 조건 (suitAlias 정규화 적용)
    if (cond.suit) {
        const cardSuit = ctx.suitAliases?.[card?.suit] ?? card?.suit;
        const condSuit = ctx.suitAliases?.[cond.suit] ?? cond.suit;
        if (cardSuit !== condSuit) return false;
    }
    if (cond.rank && card?.rank !== cond.rank) return false;

    // 핸드 조건
    if (cond.handRank != null && ctx.handRank !== cond.handRank) return false;

    // 덱 조건
    if (cond.deckCountGte && ctx.deckCount < cond.deckCountGte) return false;
    if (cond.deckCountLte != null && ctx.deckCount > cond.deckCountLte) return false;

    // 카드 값 합 조건 (사용된 카드 기준)
    if (cond.cardValSumLt != null) {
        const sum = (ctx.cards ?? []).reduce((s, c) => s + (c.val ?? 0), 0);
        if (sum >= cond.cardValSumLt) return false;
    }

    // 만피 조건
    if (cond.isFullHp && ctx.hp !== ctx.maxHp) return false;

    return true;
}

function applyEffect(score, effect, card, ctx) {
    if (!checkCondition(effect.condition, card, ctx)) return score;

    switch (effect.type) {
        case "add":
            return score + effect.value;

        case "multiply":
            return score * effect.value;

        // 핸드에 남은 카드 수 × value 만큼 배수 추가 (빈손 유물)
        case "multiplyPerHandRemaining": {
            const remaining = ctx.handRemainingCount ?? 0;
            if (remaining <= 0) return score;
            return score * (1 + effect.value * remaining);
        }

        // 현재 족보 사용 횟수 × value 점수 가산 (성장형 유물, hand scope 권장)
        case "addPerHandUsage": {
            const usage = ctx.handUseCounts?.[ctx.handRank] ?? 0;
            return score + usage * effect.value;
        }

        // 전체 족보 사용 횟수 합산 × value 점수 가산 (성장형 유물, final scope 권장)
        case "addPerTotalHandUsage": {
            const total = Object.values(ctx.handUseCounts ?? {}).reduce((s, n) => s + n, 0);
            return score + total * effect.value;
        }

        default:
            return score;
    }
}


/**
 * 점수 계산 단계별 내역 반환 (공격 애니메이션용)
 * @returns {{
 *   atk: number,
 *   cardDetails: Array<{card, baseScore, cardRelicDeltas: {relicId,delta}[], total}>,
 *   multi: number,
 *   handRank: number,
 *   handName: string,
 *   handRelicDeltas: {relicId,delta}[],
 *   finalRelicDeltas: {relicId,delta}[],
 *   totalScore: number,
 *   aoe: boolean,
 * }}
 */
export function getScoreDetails(cards, context) {
    const relics = getRelicsFromContext(context);

    const enabledHands = context.enabledHands
        ?? new Set(Object.entries(HAND_DATA).filter(([,d]) => d.enabled !== false).map(([k]) => Number(k)));
    const handResult = evaluateHand(cards, enabledHands, context.suitAliases ?? null);

    const ctx = {
        ...context,
        handRank: handResult.rank,
        handName: HAND_DATA[handResult.rank].key,
        cards: handResult.cards,
    };

    const atk   = ctx.atk ?? 0;
    const multi = ctx.handConfig?.[ctx.handRank]?.multi ?? 1;

    // ── per-card breakdown ────────────────────────────────────────────────
    const cardDetails = ctx.cards.map(card => {
        let baseScore = card.baseScore;
        for (const enh of (card.enhancements ?? [])) {
            if (enh.type === 'red') baseScore += sealMap['red']?.scoreBonus ?? 20;
            // if (enh.type === 'add') baseScore += enh.value; // 하위 호환 (미사용)
        }
        const cardRelicDeltas = [];
        let runCard = baseScore;
        for (const relic of relics) {
            let delta = 0;
            for (const effect of (relic.effects ?? [])) {
                if (effect.scope !== "card") continue;
                const before = runCard;
                runCard = applyEffect(runCard, effect, card, ctx);
                delta += runCard - before;
            }
            if (delta !== 0) cardRelicDeltas.push({ relicId: relic.id, delta });
        }
        return { card, baseScore, cardRelicDeltas, total: runCard };
    });

    // ── running total ─────────────────────────────────────────────────────
    let running = cardDetails.reduce((s, d) => s + d.total, 0) + atk;

    // ── hand ADD 유물: multi 이전 가산 (pair_legacy 등 multi에 곱해져야 하는 보너스)
    const handRelicDeltas = [];
    for (const relic of relics) {
        let delta = 0;
        for (const effect of (relic.effects ?? [])) {
            if (effect.scope !== "hand" || !ADD_TYPES.has(effect.type)) continue;
            const before = running;
            running = applyEffect(running, effect, null, ctx);
            delta += running - before;
        }
        if (delta !== 0) handRelicDeltas.push({ relicId: relic.id, delta });
    }

    running *= multi;

    // ── hand MULTIPLY 유물: multi 이후 추가 배율
    for (const relic of relics) {
        let delta = 0;
        for (const effect of (relic.effects ?? [])) {
            if (effect.scope !== "hand" || !MULTIPLY_TYPES.has(effect.type)) continue;
            const before = running;
            running = applyEffect(running, effect, null, ctx);
            delta += running - before;
        }
        if (delta !== 0) handRelicDeltas.push({ relicId: relic.id, delta });
    }

    // ── final-scope relics (add first, multiply second) ───────────────────
    const finalRelicDeltas = [];
    for (const relic of relics) {
        let delta = 0;
        for (const effect of (relic.effects ?? [])) {
            if (effect.scope !== "final" || !ADD_TYPES.has(effect.type)) continue;
            const before = running;
            running = applyEffect(running, effect, null, ctx);
            delta += running - before;
        }
        if (delta !== 0) finalRelicDeltas.push({ relicId: relic.id, delta });
    }
    for (const relic of relics) {
        let delta = 0;
        for (const effect of (relic.effects ?? [])) {
            if (effect.scope !== "final" || !MULTIPLY_TYPES.has(effect.type)) continue;
            const before = running;
            running = applyEffect(running, effect, null, ctx);
            delta += running - before;
        }
        if (delta !== 0) finalRelicDeltas.push({ relicId: relic.id, delta });
    }

    return {
        atk,
        cards: ctx.cards,
        cardDetails,
        multi,
        handRank: ctx.handRank,
        handName: ctx.handName,
        handRelicDeltas,
        finalRelicDeltas,
        totalScore: Math.floor(running),
        aoe: ctx.handConfig?.[handResult.rank]?.aoe ?? handResult.aoe ?? false,
    };
}

//족보판별
function evaluateHand(cards, enabledHands, suitAliases) {
    if (!enabledHands) {
        enabledHands = new Set(Object.entries(HAND_DATA).filter(([,d]) => d.enabled !== false).map(([k]) => Number(k)));
    }

    // suit 정규화 (alias 적용). 원본 카드는 _orig 로 보존
    const evalCards = cards.map(c =>
        suitAliases ? { ...c, suit: suitAliases[c.suit] ?? c.suit, _orig: c } : { ...c, _orig: c }
    );

    const sorted = [...evalCards].sort((a, b) => b.val - a.val);

    const valueMap = groupBy(sorted, c => c.val);
    const suitMap  = groupBy(sorted, c => c.suit);

    const straightCards = getStraightCards(sorted);
    const flushSuit  = Object.keys(suitMap).find(s => suitMap[s].length >= 5);
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
        bestCards = [...groups[0]];
    }
    // Full house
    else if (groups[0].length === 3 && groups[1]?.length >= 2) {
        rank = HAND_RANK.FULL_HOUSE;
        bestCards = [...groups[0], ...groups[1].slice(0, 2)];
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

    // Flush Draw (4장 동일 슈트, enabled 일 때만) — 별도 if (chain 분리)
    if (rank === HAND_RANK.HIGH_CARD && enabledHands.has(HAND_RANK.FLUSH_DRAW)) {
        const fdSuit = Object.keys(suitMap).find(s => suitMap[s].length >= 4);
        if (fdSuit) {
            rank = HAND_RANK.FLUSH_DRAW;
            bestCards = suitMap[fdSuit].slice(0, 4);
        }
    }

    // Straight Draw (4연속, enabled 일 때만)
    if (rank === HAND_RANK.HIGH_CARD && enabledHands.has(HAND_RANK.STRAIGHT_DRAW)) {
        const sdCards = getStraightDrawCards(sorted);
        if (sdCards) {
            rank = HAND_RANK.STRAIGHT_DRAW;
            bestCards = sdCards;
        }
    }

    // Two pair / Triple / One pair / High card — rank가 아직 HIGH_CARD일 때만
    if (rank === HAND_RANK.HIGH_CARD) {
        if (groups[0].length === 2 && groups[1]?.length === 2) {
            rank = HAND_RANK.TWO_PAIR;
            bestCards = [...groups[0], ...groups[1]];
        } else if (groups[0].length === 3) {
            rank = HAND_RANK.TRIPLE;
            bestCards = [...groups[0]];
        } else if (groups[0].length === 2) {
            rank = HAND_RANK.ONE_PAIR;
            bestCards = [...groups[0]];
        } else {
            bestCards = sorted.slice(0, 1);
        }
    }

    // 원본 카드로 복원 (suit 정규화 이전 카드)
    const origCards = bestCards.map(c => c._orig ?? c);
    const aoe = HAND_DATA[rank]?.aoe ?? false;
    const score = origCards.reduce((sum, c) => sum + c.baseScore, 0);

    return { rank, score, aoe, cards: origCards };
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

function getStraightDrawCards(cards) {
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
        if (seq.length >= 4) {
            const needed = seq.slice(-4);
            return needed.map(v => cards.find(c => c.val === v || (v === 1 && c.val === 14)));
        }
    }
    return null;
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
