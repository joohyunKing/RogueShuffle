import { HAND_RANK, HAND_DATA } from "../constants.js";
import { relicMap } from '../manager/relicManager.js';
import { sealMap } from '../manager/sealManager.js';

const ADD_TYPES      = new Set(["add", "addPerHandUsage", "addPerTotalHandUsage", "addPerExcessDeck"]);
const PLUS_MULTI_TYPES = new Set(["plus_multi"]);
const TIMES_MULTI_TYPES = new Set(["times_multi", "timesMultiPerDiagonalBingo", "plusMultiPerHandRemaining"]);

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

/**
 * sideAmplify 유물 위치를 기반으로 각 유물의 증폭 배율 맵 생성.
 * relicSlots[i] 의 좌우(col±1, 같은 row) 유물에 value 배율 적용.
 * @returns {Object} { relicId: multiplier } — 기본 1 (없으면 맵에 없음)
 */
function buildAmplifierMap(relics, relicSlots) {
    const map = {};
    if (!relicSlots) return map;
    for (const relic of relics) {
        for (const eff of (relic.effects ?? [])) {
            if (eff.scope !== 'special') continue;
            const idx = relicSlots.indexOf(relic.id);
            if (idx < 0) continue;

            if (eff.type === 'sideAmplify') {
                const col = idx % 3;
                if (col > 0) { const id = relicSlots[idx - 1]; if (id) map[id] = (map[id] ?? 1) * eff.value; }
                if (col < 2) { const id = relicSlots[idx + 1]; if (id) map[id] = (map[id] ?? 1) * eff.value; }
            } else if (eff.type === 'verticalAmplify') {
                if (idx >= 3)  { const id = relicSlots[idx - 3]; if (id) map[id] = (map[id] ?? 1) * eff.value; }
                if (idx < 6)   { const id = relicSlots[idx + 3]; if (id) map[id] = (map[id] ?? 1) * eff.value; }
            }
        }
    }
    return map;
}

/**
 * applyEffect에 증폭 배율(amplifier)을 적용한 wrapper.
 * 조건 불충족으로 점수가 변하지 않으면 그대로 반환.
 */
function applyAmplifiedEffect(score, effect, card, ctx, amplifier) {
    const before = score;
    const after = applyEffect(score, effect, card, ctx);
    if (amplifier === 1 || after === before) return after;
    // times_multi 계열은 배율 자체를 증폭 (score × mult × amp)
    if (TIMES_MULTI_TYPES.has(effect.type)) {
        // 기존 배수가 after / before 입니다. 이 곱하기 연산에서 -1 한 값의 amp배만큼 추가.
        // 또는 단순히 기존 곱연산 로직을 유지해서 before + (after - before) * amplifier 처리해도 실질 배수가 됩니다.
        // ex: 1 * 1.5 = 1.5. delta = 0.5. 0.5 * amp = 1.0. 최종 1 + 1.0 = 2.0 (즉 2배)
        return before + (after - before) * amplifier;
    }
    // add, plus_multi 계열은 증가분을 증폭 (score + delta × amp)
    return before + (after - before) * amplifier;
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
        case "plus_multi":
            return score + effect.value;

        case "times_multi":
            return score * effect.value;

        // 대각선 빙고 수 × value 배율 (9슬롯 3×3 기준, 주대각선[0,4,8] + 반대각선[2,4,6])
        case "timesMultiPerDiagonalBingo": {
            const slots = ctx.relicSlots ?? [];
            const diagonals = [[0, 4, 8], [2, 4, 6]];
            let bingoCount = 0;
            for (const diag of diagonals) {
                if (diag.every(i => slots[i])) bingoCount++;
            }
            if (bingoCount === 0) return score;
            return score * (effect.value * bingoCount);
        }

        // 핸드에 남은 카드 수 × value 만큼 배수 추가 (빈손 유물)
        case "plusMultiPerHandRemaining": {
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

        // 덱 초과 장수 × value 점수 가산 (hand scope, 곱셈 전)
        case "addPerExcessDeck": {
            const excess = Math.max(0, (ctx.deckCount ?? 0) - (effect.threshold ?? 0));
            return score + excess * effect.value;
        }

        default:
            return score;
    }
}

function applyRelicEffects(startValue, relics, amplifierMap, scope, typeSet, deltaType, deltaArray, ctx, card = null) {
    let runValue = startValue;
    for (const relic of relics) {
        let delta = 0;
        const amp = amplifierMap[relic.id] ?? 1;
        for (const effect of (relic.effects ?? [])) {
            if (effect.scope !== scope || !typeSet.has(effect.type)) continue;
            const before = runValue;
            runValue = applyAmplifiedEffect(runValue, effect, card, ctx, amp);
            delta += runValue - before;
        }
        if (delta !== 0) deltaArray.push({ relicId: relic.id, type: deltaType, delta });
    }
    return runValue;
}export function getScoreDetails(cards, context) {
    const relics = getRelicsFromContext(context);
    const amplifierMap = buildAmplifierMap(relics, context.relicSlots ?? null);

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
    const baseHandMulti = ctx.handConfig?.[ctx.handRank]?.multi ?? 1;

    let baseScorePool = atk;
    let plusMultiPool = baseHandMulti;
    let timesMultiPool = 1;

    // ── per-card breakdown ────────────────────────────────────────────────
    const cardDetails = ctx.cards.map(card => {
        let baseScore = card.baseScore;
        for (const enh of (card.enhancements ?? [])) {
            if (enh.type === 'red') baseScore += sealMap['red']?.scoreBonus ?? 20;
            if (enh.type === 'rainbow') timesMultiPool *= sealMap['rainbow']?.timesMultiBonus ?? 1.1;
        }
        // 슈트 적응 보너스: (레벨-1) × 적응도 (레벨 1이면 0)
        if (ctx.attrs && ctx.adaptability) {
            const s = card.suit;
            baseScore += Math.floor((ctx.attrs[s] - 1) * ctx.adaptability[s]);
        }

        let deltaBase = baseScore;
        let deltaMulti = 0;
        const cardRelicDeltas = [];

        // 카드 대상 Base Score Add
        deltaBase = applyRelicEffects(deltaBase, relics, amplifierMap, "card", ADD_TYPES, 'base', cardRelicDeltas, ctx, card);

        // 카드 대상 Plus Multi
        deltaMulti = applyRelicEffects(0, relics, amplifierMap, "card", PLUS_MULTI_TYPES, 'plus_multi', cardRelicDeltas, ctx, card);

        baseScorePool += deltaBase;
        plusMultiPool += deltaMulti;

        return { card, baseScore, cardRelicDeltas, deltaBase, deltaMulti };
    });

    // ── hand ADD, hand MULTI 유물 ──────────────────────────────────────────
    const handRelicDeltas = [];
    baseScorePool = applyRelicEffects(baseScorePool, relics, amplifierMap, "hand", ADD_TYPES, 'base', handRelicDeltas, ctx);
    plusMultiPool = applyRelicEffects(plusMultiPool, relics, amplifierMap, "hand", PLUS_MULTI_TYPES, 'plus_multi', handRelicDeltas, ctx);

    // ── final add, times_multi 유물 ─────────────────────────────────────────
    const finalRelicDeltas = [];
    baseScorePool = applyRelicEffects(baseScorePool, relics, amplifierMap, "final", ADD_TYPES, 'base', finalRelicDeltas, ctx);
    timesMultiPool = applyRelicEffects(timesMultiPool, relics, amplifierMap, "final", TIMES_MULTI_TYPES, 'times_multi', finalRelicDeltas, ctx);

    // ── system bingo ───────────────────────────────────────────────────────
    if (ctx.relicSlots) {
        const slots = ctx.relicSlots;
        const BINGO_H = [[0, 1, 2], [3, 4, 5], [6, 7, 8]];
        const BINGO_V = [[0, 3, 6], [1, 4, 7], [2, 5, 8]];
        const BINGO_D = [[0, 4, 8], [2, 4, 6]];

        let hCount = BINGO_H.filter(line => line.every(i => slots[i])).length;
        let vCount = BINGO_V.filter(line => line.every(i => slots[i])).length;
        let dCount = BINGO_D.filter(line => line.every(i => slots[i])).length;

        if (hCount > 0) {
            const delta = hCount * 50;
            baseScorePool += delta;
            finalRelicDeltas.push({ relicId: 'sys_bingo_h', type: 'base', delta });
        }
        if (vCount > 0) {
            const delta = vCount * 2;
            plusMultiPool += delta;
            finalRelicDeltas.push({ relicId: 'sys_bingo_v', type: 'plus_multi', delta });
        }
        if (dCount > 0) {
            const oldTimes = timesMultiPool;
            timesMultiPool *= Math.pow(1.2, dCount);
            finalRelicDeltas.push({ relicId: 'sys_bingo_d', type: 'times_multi', delta: timesMultiPool - oldTimes });
        }
    }

    const totalScore = (baseScorePool * plusMultiPool) * timesMultiPool;

    return {
        atk,
        cards: ctx.cards,
        cardDetails,
        baseHandMulti,
        handRank: ctx.handRank,
        handName: ctx.handName,
        handRelicDeltas,
        finalRelicDeltas,
        baseScoreTotal: Math.floor(baseScorePool),
        plusMultiTotal: plusMultiPool,
        timesMultiTotal: timesMultiPool,
        totalScore: Math.floor(totalScore),
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
