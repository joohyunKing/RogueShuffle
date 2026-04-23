import { HAND_RANK, HAND_DATA, DEBUG_MODE } from "../constants.js";
import { relicMap } from '../manager/relicManager.js';
import { sealMap } from '../manager/sealManager.js';

const ADD_TYPES = new Set(["add", "addPerHandUsage", "addPerTotalHandUsage", "addPerExcessDeck", "addCurrentHp"]);
const PLUS_MULTI_TYPES = new Set(["plus_multi", "plusMultiPerHandUsage"]);
const TIMES_MULTI_TYPES = new Set(["times_multi", "timesMultiPerDiagonalBingo", "plusMultiPerHandRemaining"]);

/**
 * 계산 과정을 추적하고 로그를 남기기 위한 상태 클래스
 */
class ScoreState {
    constructor(atk, handMulti) {
        this.baseScore = atk;
        this.plusMulti = handMulti;
        this.timesMulti = 1.0;
        this.history = [];
        this.initialLog(atk, handMulti);
    }

    initialLog(atk, handMulti) {
        this._addLog("INIT", `Base: ${atk}, PlusMulti: ${handMulti}, TimesMulti: 1.0`);
    }

    addBase(val, label) {
        if (Math.abs(val) < 0.0001) return 0;
        const before = this.baseScore;
        this.baseScore += val;
        this._addLog(label, `Base: ${Math.floor(before)} -> ${Math.floor(this.baseScore)} (+${Math.floor(val)})`);
        return val;
    }

    addPlusMulti(val, label) {
        if (Math.abs(val) < 0.0001) return 0;
        const before = this.plusMulti;
        this.plusMulti += val;
        this._addLog(label, `PlusMulti: ${before.toFixed(1)} -> ${this.plusMulti.toFixed(1)} (+${val.toFixed(1)})`);
        return val;
    }

    multiplyTimes(val, label) {
        if (Math.abs(val - 1.0) < 0.0001) return 0;
        const before = this.timesMulti;
        this.timesMulti *= val;
        this._addLog(label, `TimesMulti: ${before.toFixed(2)} -> ${this.timesMulti.toFixed(2)} (x${val.toFixed(2)})`);
        return this.timesMulti - before; // delta for animation compatibility
    }

    _addLog(label, msg) {
        const fullMsg = `[Score] ${label} | ${msg}`;
        this.history.push(fullMsg);
        if (DEBUG_MODE) console.log(fullMsg);
    }

    getTotal() {
        return Math.floor((this.baseScore * this.plusMulti) * this.timesMulti);
    }
}

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

/**
 * 유물 효과 적용 핵심 함수
 */
function applyEffect(score, effect, card, ctx) {
    if (!checkCondition(effect.condition, card, ctx)) return score;

    switch (effect.type) {
        case "add":
        case "plus_multi":
            return score + effect.value;

        case "times_multi":
            return score * effect.value;

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

        case "plusMultiPerHandRemaining": {
            const remaining = ctx.handRemainingCount ?? 0;
            if (remaining <= 0) return score;
            return score * (1 + effect.value * remaining);
        }

        case "addPerHandUsage":
        case "plusMultiPerHandUsage": {
            const usage = ctx.handUseCounts?.[ctx.handRank] ?? 0;
            return score + usage * effect.value;
        }

        case "addPerTotalHandUsage": {
            const total = Object.values(ctx.handUseCounts ?? {}).reduce((s, n) => s + n, 0);
            return score + total * effect.value;
        }

        case "addPerExcessDeck": {
            const excess = Math.max(0, (ctx.deckCount ?? 0) - (effect.threshold ?? 0));
            return score + excess * effect.value;
        }

        case "addCurrentHp":
            return score + (ctx.hp ?? 0);

        default:
            return score;
    }
}

function checkCondition(cond, card, ctx) {
    if (!cond) return true;

    if (cond.suit) {
        const cardSuit = ctx.suitAliases?.[card?.suit] ?? card?.suit;
        const condSuit = ctx.suitAliases?.[cond.suit] ?? cond.suit;
        if (cardSuit !== condSuit) return false;
    }
    if (cond.rank && card?.rank !== cond.rank) return false;
    if (cond.rankIn && !cond.rankIn.includes(card?.rank)) return false;

    if (cond.handRank != null && ctx.handRank !== cond.handRank) return false;

    if (cond.deckCountGte && ctx.deckCount < cond.deckCountGte) return false;
    if (cond.deckCountLte != null && ctx.deckCount > cond.deckCountLte) return false;

    if (cond.cardValSumLt != null) {
        const sum = (ctx.cards ?? []).reduce((s, c) => s + (c.val ?? 0), 0);
        if (sum >= cond.cardValSumLt) return false;
    }

    if (cond.isFullHp && ctx.hp !== ctx.maxHp) return false;

    return true;
}

/**
 * 증폭 효과(Amplify) 포함 적용
 */
function applyAmplifiedValue(currentVal, effect, card, ctx, amp) {
    const next = applyEffect(currentVal, effect, card, ctx);
    if (amp === 1 || next === currentVal) return next;
    return currentVal + (next - currentVal) * amp;
}

function getRelicsFromContext(context) {
    return (context.relics ?? [])
        .map(id => relicMap[id])
        .filter(Boolean);
}

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
                if (idx >= 3) { const id = relicSlots[idx - 3]; if (id) map[id] = (map[id] ?? 1) * eff.value; }
                if (idx < 6) { const id = relicSlots[idx + 3]; if (id) map[id] = (map[id] ?? 1) * eff.value; }
            }
        }
    }
    return map;
}

/**
 * 보스 스킬 등에서 카드 무력화 판독 (Hand Evaluate 용)
 */
function evaluateHand(cards, enabledHands, suitAliases) {
    if (!enabledHands) {
        enabledHands = new Set(Object.entries(HAND_DATA).filter(([, d]) => d.enabled !== false).map(([k]) => Number(k)));
    }

    const evalCards = cards.map(c =>
        suitAliases ? { ...c, suit: suitAliases[c.suit] ?? c.suit, _orig: c } : { ...c, _orig: c }
    );
    const sorted = [...evalCards].sort((a, b) => b.val - a.val);
    const valueMap = groupBy(sorted, c => c.val);
    const suitMap = groupBy(sorted, c => c.suit);

    const straightCards = getStraightCards(sorted);
    const flushSuit = Object.keys(suitMap).find(s => suitMap[s].length >= 5);
    const flushCards = flushSuit ? suitMap[flushSuit].slice(0, 5) : null;

    const groups = Object.values(valueMap).sort((a, b) => b.length - a.length);

    let bestCards = [];
    let rank = HAND_RANK.HIGH_CARD;

    if (!groups || groups.length === 0) {
        return { rank, score: 0, aoe: false, cards: [] };
    }

    // High Tier Hands
    if (groups[0] && groups[0].length === 5 && flushSuit) {
        const isFlushFive = groups[0].every(c => (suitAliases ? (suitAliases[c.suit] ?? c.suit) : c.suit) === flushSuit);
        if (isFlushFive) { rank = HAND_RANK.FLUSH_FIVE; bestCards = groups[0]; }
    }
    if (rank === HAND_RANK.HIGH_CARD && groups[0] && groups[0].length === 3 && groups[1] && groups[1].length === 2 && flushSuit) {
        const combined = [...groups[0], ...groups[1]];
        const isFlushFullHouse = combined.every(c => (suitAliases ? (suitAliases[c.suit] ?? c.suit) : c.suit) === flushSuit);
        if (isFlushFullHouse) { rank = HAND_RANK.FLUSH_FULL_HOUSE; bestCards = combined; }
    }

    // Mid Tier Hands
    if (rank === HAND_RANK.HIGH_CARD) {
        if (groups[0] && groups[0].length === 5) { rank = HAND_RANK.FIVE_CARD; bestCards = groups[0]; }
        else if (flushSuit && straightCards) {
            const flushSet = new Set(suitMap[flushSuit].map(c => c.val));
            const sf = straightCards.filter(c => flushSet.has(c.val));
            if (sf.length >= 5) { rank = HAND_RANK.STRAIGHT_FLUSH; bestCards = sf.slice(0, 5); }
        }
        else if (groups[0] && groups[0].length === 4) { rank = HAND_RANK.FOUR_OF_A_KIND; bestCards = [...groups[0]]; }
        else if (groups[0] && groups[0].length === 3 && groups[1] && groups[1].length >= 2) {
            rank = HAND_RANK.FULL_HOUSE; bestCards = [...groups[0], ...groups[1].slice(0, 2)];
        }
        else if (flushSuit) { rank = HAND_RANK.FLUSH; bestCards = flushCards; }
        else if (straightCards) { rank = HAND_RANK.STRAIGHT; bestCards = straightCards.slice(0, 5); }
    }

    // Draws
    if (rank === HAND_RANK.HIGH_CARD && enabledHands.has(HAND_RANK.FLUSH_DRAW)) {
        const fdSuit = Object.keys(suitMap).find(s => suitMap[s].length >= 4);
        if (fdSuit) { rank = HAND_RANK.FLUSH_DRAW; bestCards = suitMap[fdSuit].slice(0, 4); }
    }
    if (rank === HAND_RANK.HIGH_CARD && enabledHands.has(HAND_RANK.STRAIGHT_DRAW)) {
        const sdCards = getStraightDrawCards(sorted);
        if (sdCards) { rank = HAND_RANK.STRAIGHT_DRAW; bestCards = sdCards; }
    }

    // Low Tier Hands
    if (rank === HAND_RANK.HIGH_CARD && groups[0]) {
        const g0Len = groups[0].length, g1Len = groups[1] ? groups[1].length : 0;
        if (g0Len === 2 && g1Len === 2) { rank = HAND_RANK.TWO_PAIR; bestCards = [...groups[0], ...groups[1]]; }
        else if (g0Len === 3) { rank = HAND_RANK.TRIPLE; bestCards = [...groups[0]]; }
        else if (g0Len === 2) { rank = HAND_RANK.ONE_PAIR; bestCards = [...groups[0]]; }
        else { bestCards = sorted.slice(0, 1); }
    }

    const origCards = bestCards.map(c => c._orig ?? c);
    return { rank, score: origCards.reduce((sum, c) => sum + c.baseScore, 0), aoe: HAND_DATA[rank]?.aoe ?? false, cards: origCards };
}

/**
 * 메인 점수 상세 계산 함수
 */
export function getScoreDetails(cards, context) {
    const relics = getRelicsFromContext(context);
    const amplifierMap = buildAmplifierMap(relics, context.relicSlots ?? null);

    // 1. 핸드 평가 및 컨텍스트 초기화
    const enabledHands = context.enabledHands
        ?? new Set(Object.entries(HAND_DATA).filter(([, d]) => d.enabled !== false).map(([k]) => Number(k)));
    const handResult = evaluateHand(cards, enabledHands, context.suitAliases ?? null);
    const handRank = handResult.rank ?? HAND_RANK.HIGH_CARD;

    const ctx = {
        ...context,
        handRank,
        handName: (HAND_DATA[handRank]?.key) || "HIGH_CARD",
        cards: handResult.cards || [],
    };

    const atk = ctx.atk ?? 0;
    const baseHandMulti = ctx.handConfig?.[handRank]?.multi ?? 1;

    // 2. 상태 객체 생성
    const state = new ScoreState(atk, baseHandMulti);

    // 3. 카드별 점수 및 유물(card scope) 처리
    const cardDetails = ctx.cards.map(card => {
        let cardBase = card.baseScore;
        const initialCardBase = cardBase;

        // 씰 장착 효과
        for (const enh of (card.enhancements ?? [])) {
            if (enh.type === 'red') cardBase += sealMap['red']?.scoreBonus ?? 20;
            if (enh.type === 'rainbow') state.multiplyTimes(sealMap['rainbow']?.timesMultiBonus ?? 1.1, `RAINBOW SEAL (${card.key})`);
        }
        // 슈트 적응도 보너스
        if (ctx.attrs && ctx.adaptability) {
            const s = card.suit, sLevel = ctx.attrs[s] ?? 1, sAdapt = ctx.adaptability[s] ?? 0;
            cardBase += Math.floor((sLevel - 1) * sAdapt);
        }

        const cardLabel = `CARD:${card.key}`;
        state.addBase(cardBase, cardLabel);

        const cardRelicDeltas = [];
        let deltaBase = 0, deltaMulti = 0;

        // 카드 대상 유물 효과
        for (const relic of relics) {
            const amp = amplifierMap[relic.id] ?? 1;
            for (const eff of (relic.effects ?? [])) {
                if (eff.scope !== 'card') continue;
                const relicLabel = `${cardLabel} + RELIC:${relic.id}`;

                if (ADD_TYPES.has(eff.type)) {
                    const before = state.baseScore;
                    state.baseScore = applyAmplifiedValue(state.baseScore, eff, card, ctx, amp);
                    const d = state.baseScore - before;
                    if (d !== 0) {
                        deltaBase += d;
                        cardRelicDeltas.push({ relicId: relic.id, type: 'base', delta: d });
                        state._addLog(relicLabel, `Base: ${Math.floor(before)} -> ${Math.floor(state.baseScore)} (+${Math.floor(d)})`);
                    }
                } else if (PLUS_MULTI_TYPES.has(eff.type)) {
                    const before = state.plusMulti;
                    state.plusMulti = applyAmplifiedValue(state.plusMulti, eff, card, ctx, amp);
                    const d = state.plusMulti - before;
                    if (d !== 0) {
                        deltaMulti += d;
                        cardRelicDeltas.push({ relicId: relic.id, type: 'plus_multi', delta: d });
                        state._addLog(relicLabel, `PlusMulti: ${before.toFixed(1)} -> ${state.plusMulti.toFixed(1)} (+${d.toFixed(1)})`);
                    }
                }
            }
        }

        // sealedCardEcho: 씰 강화 카드 재발동
        if ((card.enhancements ?? []).length > 0) {
            for (const relic of relics) {
                for (const eff of (relic.effects ?? [])) {
                    if (eff.scope === 'card' && eff.type === 'sealedCardEcho') {
                        state.addBase(deltaBase + initialCardBase, `ECHO:${relic.id}(${card.key})`);
                        cardRelicDeltas.push({ relicId: relic.id, type: 'base', delta: deltaBase + initialCardBase });
                    }
                }
            }
        }

        return { card, baseScore: cardBase, cardRelicDeltas, deltaBase, deltaMulti };
    });

    // 4. 핸드 범위 유물(hand scope) 처리
    const handRelicDeltas = [];
    for (const relic of relics) {
        const amp = amplifierMap[relic.id] ?? 1;
        for (const eff of (relic.effects ?? [])) {
            if (eff.scope !== 'hand') continue;
            const label = `HAND RELIC:${relic.id}`;
            if (ADD_TYPES.has(eff.type)) {
                const d = state.addBase(applyAmplifiedValue(state.baseScore, eff, null, ctx, amp) - state.baseScore, label);
                if (d !== 0) handRelicDeltas.push({ relicId: relic.id, type: 'base', delta: d });
            } else if (PLUS_MULTI_TYPES.has(eff.type)) {
                const d = state.addPlusMulti(applyAmplifiedValue(state.plusMulti, eff, null, ctx, amp) - state.plusMulti, label);
                if (d !== 0) handRelicDeltas.push({ relicId: relic.id, type: 'plus_multi', delta: d });
            }
        }
    }

    // 5. 최종 범위 유물(final scope) 처리
    const finalRelicDeltas = [];
    for (const relic of relics) {
        const amp = amplifierMap[relic.id] ?? 1;
        for (const eff of (relic.effects ?? [])) {
            if (eff.scope !== 'final') continue;
            const label = `FINAL RELIC:${relic.id}`;
            if (ADD_TYPES.has(eff.type)) {
                const d = state.addBase(applyAmplifiedValue(state.baseScore, eff, null, ctx, amp) - state.baseScore, label);
                if (d !== 0) finalRelicDeltas.push({ relicId: relic.id, type: 'base', delta: d });
            } else if (PLUS_MULTI_TYPES.has(eff.type)) {
                const d = state.addPlusMulti(applyAmplifiedValue(state.plusMulti, eff, null, ctx, amp) - state.plusMulti, label);
                if (Math.abs(d) > 0.0001) finalRelicDeltas.push({ relicId: relic.id, type: 'plus_multi', delta: d });
            } else if (TIMES_MULTI_TYPES.has(eff.type)) {
                // times_multi 계열은 delta 방식이 아닌 원본 값 기준 연산 후 차이 계산
                const d = state.multiplyTimes(applyAmplifiedValue(state.timesMulti, eff, null, ctx, amp) / state.timesMulti, label);
                if (Math.abs(d) > 0.0001) finalRelicDeltas.push({ relicId: relic.id, type: 'times_multi', delta: d });
            }
        }
    }

    // 6. 시스템 빙고 보너스
    if (ctx.relicSlots) {
        const slots = ctx.relicSlots;
        const BINGO_H = [[0, 1, 2], [3, 4, 5], [6, 7, 8]], BINGO_V = [[0, 3, 6], [1, 4, 7], [2, 5, 8]], BINGO_D = [[0, 4, 8], [2, 4, 6]];
        let hCnt = BINGO_H.filter(line => line.every(i => slots[i])).length;
        let vCnt = BINGO_V.filter(line => line.every(i => slots[i])).length;
        let dCnt = BINGO_D.filter(line => line.every(i => slots[i])).length;

        if (hCnt > 0) {
            const d = state.addBase(hCnt * 50, "BINGO:H");
            finalRelicDeltas.push({ relicId: 'sys_bingo_h', type: 'base', delta: d });
        }
        if (vCnt > 0) {
            const d = state.addPlusMulti(vCnt * 2, "BINGO:V");
            finalRelicDeltas.push({ relicId: 'sys_bingo_v', type: 'plus_multi', delta: d });
        }
        if (dCnt > 0) {
            const before = state.timesMulti;
            state.multiplyTimes(Math.pow(1.2, dCnt), "BINGO:D");
            finalRelicDeltas.push({ relicId: 'sys_bingo_d', type: 'times_multi', delta: state.timesMulti - before });
        }
    }

    const totalScore = state.getTotal();
    state._addLog("FINAL", `Total Score: ${totalScore}`);

    return {
        atk,
        cards: ctx.cards,
        cardDetails,
        baseHandMulti,
        handRank,
        handName: ctx.handName,
        handRelicDeltas,
        finalRelicDeltas,
        baseScoreTotal: Math.floor(state.baseScore),
        plusMultiTotal: state.plusMulti,
        timesMultiTotal: state.timesMulti,
        totalScore,
        aoe: ctx.handConfig?.[handRank]?.aoe ?? handResult.aoe ?? false,
        logs: state.history,
    };
}

// ── 유틸리티 함수 ──────────────────────────────────────────────────────────
function groupBy(arr, keyFn) {
    const map = {};
    for (const item of arr) {
        const key = keyFn(item);
        if (map[key] === undefined) map[key] = [];
        map[key].push(item);
    }
    return map;
}

function getStraightDrawCards(cards) {
    let values = [...new Set(cards.map(c => c.val))];
    if (values.includes(14)) values.push(1);
    values.sort((a, b) => a - b);
    let seq = [];
    for (let i = 0; i < values.length; i++) {
        if (i === 0 || values[i] === values[i - 1] + 1) seq.push(values[i]);
        else seq = [values[i]];
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
        if (i === 0 || values[i] === values[i - 1] + 1) seq.push(values[i]);
        else seq = [values[i]];
        if (seq.length >= 5) {
            const needed = seq.slice(-5);
            return needed.map(v => cards.find(c => c.val === v || (v === 1 && c.val === 14)));
        }
    }
    return null;
}
