import { HAND_RANK, HAND_DATA } from "../constants.js";
import { relicMap } from '../manager/relicManager.js';
import { sealMap } from '../manager/sealManager.js';

const ADD_TYPES      = new Set(["add", "addPerHandUsage", "addPerTotalHandUsage"]);
const PLUS_MULTI_TYPES = new Set(["plus_multi", "plusMultiPerHandRemaining"]);
const TIMES_MULTI_TYPES = new Set(["times_multi"]);

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
            if (eff.scope !== 'special' || eff.type !== 'sideAmplify') continue;
            const idx = relicSlots.indexOf(relic.id);
            if (idx < 0) continue;
            const col = idx % 3;
            if (col > 0) {
                const leftId = relicSlots[idx - 1];
                if (leftId) map[leftId] = (map[leftId] ?? 1) * eff.value;
            }
            if (col < 2) {
                const rightId = relicSlots[idx + 1];
                if (rightId) map[rightId] = (map[rightId] ?? 1) * eff.value;
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

        // 핸드에 남은 카드 수 × value 만큼 배수 추가 (빈손 유물)
        case "plusMultiPerHandRemaining": {
            const remaining = ctx.handRemainingCount ?? 0;
            if (remaining <= 0) return score;
            return score + (effect.value * remaining);
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


export function getScoreDetails(cards, context) {
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
        }

        let deltaBase = baseScore;
        let deltaMulti = 0;
        const cardRelicDeltas = [];

        // 카드 대상 Base Score Add
        let runBase = deltaBase;
        for (const relic of relics) {
            let rd = 0;
            const amp = amplifierMap[relic.id] ?? 1;
            for (const effect of (relic.effects ?? [])) {
                if (effect.scope !== "card" || !ADD_TYPES.has(effect.type)) continue;
                const before = runBase;
                runBase = applyAmplifiedEffect(runBase, effect, card, ctx, amp);
                rd += runBase - before;
            }
            if (rd !== 0) cardRelicDeltas.push({ relicId: relic.id, type: 'base', delta: rd });
        }
        deltaBase = runBase;

        // 카드 대상 Plus Multi
        let runMulti = 0;
        for (const relic of relics) {
            let rd = 0;
            const amp = amplifierMap[relic.id] ?? 1;
            for (const effect of (relic.effects ?? [])) {
                if (effect.scope !== "card" || !PLUS_MULTI_TYPES.has(effect.type)) continue;
                const before = runMulti;
                runMulti = applyAmplifiedEffect(runMulti, effect, card, ctx, amp);
                rd += runMulti - before;
            }
            if (rd !== 0) cardRelicDeltas.push({ relicId: relic.id, type: 'plus_multi', delta: rd });
        }
        deltaMulti = runMulti;

        baseScorePool += deltaBase;
        plusMultiPool += deltaMulti;

        return { card, baseScore, cardRelicDeltas, deltaBase, deltaMulti };
    });

    // ── hand ADD, hand MULTI 유물 ──────────────────────────────────────────
    const handRelicDeltas = [];
    for (const relic of relics) {
        let delta = 0;
        const amp = amplifierMap[relic.id] ?? 1;
        for (const effect of (relic.effects ?? [])) {
            if (effect.scope !== "hand" || !ADD_TYPES.has(effect.type)) continue;
            const before = baseScorePool;
            baseScorePool = applyAmplifiedEffect(baseScorePool, effect, null, ctx, amp);
            delta += baseScorePool - before;
        }
        if (delta !== 0) handRelicDeltas.push({ relicId: relic.id, type: 'base', delta });
    }
    for (const relic of relics) {
        let delta = 0;
        const amp = amplifierMap[relic.id] ?? 1;
        for (const effect of (relic.effects ?? [])) {
            if (effect.scope !== "hand" || !PLUS_MULTI_TYPES.has(effect.type)) continue;
            const before = plusMultiPool;
            plusMultiPool = applyAmplifiedEffect(plusMultiPool, effect, null, ctx, amp);
            delta += plusMultiPool - before;
        }
        if (delta !== 0) handRelicDeltas.push({ relicId: relic.id, type: 'plus_multi', delta });
    }

    // ── final add, times_multi 유물 ─────────────────────────────────────────
    const finalRelicDeltas = [];
    for (const relic of relics) {
        let delta = 0;
        const amp = amplifierMap[relic.id] ?? 1;
        for (const effect of (relic.effects ?? [])) {
            if (effect.scope !== "final" || !ADD_TYPES.has(effect.type)) continue;
            const before = baseScorePool;
            baseScorePool = applyAmplifiedEffect(baseScorePool, effect, null, ctx, amp);
            delta += baseScorePool - before;
        }
        if (delta !== 0) finalRelicDeltas.push({ relicId: relic.id, type: 'base', delta });
    }
    for (const relic of relics) {
        let delta = 0;
        const amp = amplifierMap[relic.id] ?? 1;
        for (const effect of (relic.effects ?? [])) {
            if (effect.scope !== "final" || !TIMES_MULTI_TYPES.has(effect.type)) continue;
            const before = timesMultiPool;
            timesMultiPool = applyAmplifiedEffect(timesMultiPool, effect, null, ctx, amp);
            delta = timesMultiPool - before;
        }
        if (delta !== 0) finalRelicDeltas.push({ relicId: relic.id, type: 'times_multi', delta });
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
