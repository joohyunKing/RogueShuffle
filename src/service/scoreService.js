import { HAND_RANK, HAND_DATA, DEBUG_MODE } from "../constants.js";
import { relicMap } from '../manager/relicManager.js';
import { sealMap } from '../manager/sealManager.js';
import { applyBingoBonuses, getBingoStats } from '../manager/bingoManager.js';

const ADD_TYPES = new Set(["add", "addPerHandUsage", "addPerTotalHandUsage", "addPerExcessDeck", "addCurrentHp"]);
const PLUS_MULTI_TYPES = new Set(["plus_multi", "plusMultiPerHandUsage"]);
const TIMES_MULTI_TYPES = new Set(["times_multi", "timesMultiPerDiagonalBingo", "plusMultiPerHandRemaining", "timesMultiPerRankInDeck", "timesMultiWhenNoHand"]);

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
        if (Math.abs(val - 1.0) < 0.0001) return 1.0;
        const before = this.timesMulti;
        this.timesMulti *= val;
        this._addLog(label, `TimesMulti: ${before.toFixed(2)} -> ${this.timesMulti.toFixed(2)} (x${val.toFixed(2)})`);
        return val; // Return ratio instead of delta
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
            const stats = getBingoStats(ctx.relicSlots);
            if (stats.d === 0) return score;
            return score * (effect.value * stats.d);
        }

        case "plusMultiPerHandRemaining": {
            const remaining = ctx.handRemainingCount ?? 0;
            if (remaining <= 0) return score;
            return score * (1 + effect.value * remaining);
        }

        case "timesMultiPerRankInDeck": {
            const count = ctx.deckRankCounts?.[effect.rank] ?? 0;
            if (count <= 0) return score;
            return score * (1 + effect.value * count);
        }

        case "timesMultiWhenNoHand": {
            const remaining = ctx.handRemainingCount ?? 0;
            if (remaining > 0) return score;
            return score * effect.value;
        }

        case "sealedCardEcho":
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
        const sum = (ctx.cards ?? []).reduce((s, c) => s + (c.baseScore ?? 0), 0);
        if (sum >= cond.cardValSumLt) return false;
    }

    if (cond.isFullHp && ctx.hp !== ctx.maxHp) return false;
    if (cond.cardCount != null && (ctx.cards?.length ?? 0) !== cond.cardCount) return false;

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
function evaluateHand(cards, enabledHands, suitAliases, config = {}) {
    if (!enabledHands) {
        enabledHands = new Set(Object.entries(HAND_DATA).filter(([, d]) => d.enabled !== false).map(([k]) => Number(k)));
    }

    const flushReq = config.flushReq || 5;
    const strReq = config.strReq || 5;

    const evalCards = cards.map(c =>
        suitAliases ? { ...c, suit: suitAliases[c.suit] ?? c.suit, _orig: c } : { ...c, _orig: c }
    );
    const sorted = [...evalCards].sort((a, b) => b.val - a.val);
    const valueMap = groupBy(sorted, c => c.val);
    const suitMap = groupBy(sorted, c => c.suit);

    const straightCards = getStraightCards(sorted, strReq);
    const flushSuit = Object.keys(suitMap).find(s => suitMap[s].length >= flushReq);
    const flushCards = flushSuit ? suitMap[flushSuit].slice(0, Math.max(5, flushReq)) : null;

    const groups = Object.values(valueMap).sort((a, b) => b.length - a.length);

    let bestCards = [];
    let rank = HAND_RANK.HIGH_CARD;

    if (!groups || groups.length === 0) {
        return { rank, score: 0, aoe: false, cards: [] };
    }

    // High Tier Hands
    if (groups[0] && groups[0].length === 5 && flushSuit && suitMap[flushSuit].length >= 5) {
        const isFlushFive = groups[0].every(c => (suitAliases ? (suitAliases[c.suit] ?? c.suit) : c.suit) === flushSuit);
        if (isFlushFive) { rank = HAND_RANK.FLUSH_FIVE; bestCards = groups[0]; }
    }
    if (rank === HAND_RANK.HIGH_CARD && groups[0] && groups[0].length === 3 && groups[1] && groups[1].length === 2 && flushSuit && suitMap[flushSuit].length >= 5) {
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
            // Straight Flush check: if both requirements are met
            // Balatro style: if you have 4 seq and those 4 are same suit (and both reqs are 4)
            const sfReq = Math.max(flushReq, strReq);
            if (sf.length >= sfReq) { rank = HAND_RANK.STRAIGHT_FLUSH; bestCards = sf.slice(0, Math.max(5, sfReq)); }
        }
        else if (groups[0] && groups[0].length === 4) { rank = HAND_RANK.FOUR_OF_A_KIND; bestCards = [...groups[0]]; }
        else if (groups[0] && groups[0].length === 3 && groups[1] && groups[1].length >= 2) {
            rank = HAND_RANK.FULL_HOUSE; bestCards = [...groups[0], ...groups[1].slice(0, 2)];
        }
        else if (flushSuit) { rank = HAND_RANK.FLUSH; bestCards = flushCards.slice(0, 5); }
        else if (straightCards) { rank = HAND_RANK.STRAIGHT; bestCards = straightCards.slice(0, 5); }
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

    // 유물 효과에서 족보 요구치 추출
    let flushReq = 5, strReq = 5;
    relics.forEach(r => {
        (r.effects ?? []).forEach(e => {
            if (e.type === 'reduceHandReq') {
                if (e.target === 'FLUSH') flushReq = Math.min(flushReq, e.value);
                if (e.target === 'STRAIGHT') strReq = Math.min(strReq, e.value);
            }
        });
    });

    const handResult = evaluateHand(cards, enabledHands, context.suitAliases ?? null, { flushReq, strReq });
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

        const cardRelicDeltas = [];

        // 씰 장착 효과
        for (const enh of (card.enhancements ?? [])) {
            if (enh.type === 'red') {
                cardBase += sealMap['red']?.scoreBonus ?? 20;
            }
            if (enh.type === 'blue') {
                const d = sealMap['blue']?.plusMultiBonus ?? 2;
                state.addPlusMulti(d, `BLUE SEAL (${card.key})`);
                cardRelicDeltas.push({ relicId: 'seal_blue', type: 'plus_multi', value: d });
            }
            if (enh.type === 'rainbow') {
                const ratio = sealMap['rainbow']?.timesMultiBonus ?? 1.1;
                state.multiplyTimes(ratio, `RAINBOW SEAL (${card.key})`);
                cardRelicDeltas.push({ relicId: 'seal_rainbow', type: 'times_multi', value: ratio });
            }
        }
        // 슈트 적응도 보너스
        if (ctx.attrs && ctx.adaptability) {
            const s = card.suit, sLevel = ctx.attrs[s] ?? 1, sAdapt = ctx.adaptability[s] ?? 0;
            cardBase += Math.floor((sLevel - 1) * sAdapt);
        }

        const cardLabel = `CARD:${card.key}`;
        state.addBase(cardBase, cardLabel);

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
                        cardRelicDeltas.push({ relicId: relic.id, type: 'base', value: d });
                        state._addLog(relicLabel, `Base: ${Math.floor(before)} -> ${Math.floor(state.baseScore)} (+${Math.floor(d)})`);
                    }
                } else if (PLUS_MULTI_TYPES.has(eff.type)) {
                    const before = state.plusMulti;
                    state.plusMulti = applyAmplifiedValue(state.plusMulti, eff, card, ctx, amp);
                    const d = state.plusMulti - before;
                    if (d !== 0) {
                        deltaMulti += d;
                        cardRelicDeltas.push({ relicId: relic.id, type: 'plus_multi', value: d });
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
                        cardRelicDeltas.push({ relicId: relic.id, type: 'base', value: deltaBase + initialCardBase });
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
                if (d !== 0) handRelicDeltas.push({ relicId: relic.id, type: 'base', value: d });
            } else if (PLUS_MULTI_TYPES.has(eff.type)) {
                const d = state.addPlusMulti(applyAmplifiedValue(state.plusMulti, eff, null, ctx, amp) - state.plusMulti, label);
                if (d !== 0) handRelicDeltas.push({ relicId: relic.id, type: 'plus_multi', value: d });
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
                if (d !== 0) finalRelicDeltas.push({ relicId: relic.id, type: 'base', value: d });
            } else if (PLUS_MULTI_TYPES.has(eff.type)) {
                const d = state.addPlusMulti(applyAmplifiedValue(state.plusMulti, eff, null, ctx, amp) - state.plusMulti, label);
                if (Math.abs(d) > 0.0001) finalRelicDeltas.push({ relicId: relic.id, type: 'plus_multi', value: d });
            } else if (TIMES_MULTI_TYPES.has(eff.type)) {
                // times_multi 계열은 ratio를 그대로 전달
                const ratio = state.multiplyTimes(applyAmplifiedValue(state.timesMulti, eff, null, ctx, amp) / state.timesMulti, label);
                if (Math.abs(ratio - 1.0) > 0.0001) finalRelicDeltas.push({ relicId: relic.id, type: 'times_multi', value: ratio });
            }
        }
    }

    // 6. 시스템 빙고 보너스
    if (ctx.relicSlots) {
        const bingoDeltas = applyBingoBonuses(state, ctx.relicSlots, ctx.bingoLevels);
        finalRelicDeltas.push(...bingoDeltas);
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

function getStraightCards(cards, reqCount = 5) {
    let values = [...new Set(cards.map(c => c.val))];
    if (values.includes(14)) values.push(1);
    values.sort((a, b) => a - b);
    let seq = [];
    for (let i = 0; i < values.length; i++) {
        if (i === 0 || values[i] === values[i - 1] + 1) seq.push(values[i]);
        else seq = [values[i]];
        if (seq.length >= reqCount) {
            const needed = seq.slice(-reqCount);
            return needed.map(v => cards.find(c => c.val === v || (v === 1 && c.val === 14)));
        }
    }
    return null;
}
