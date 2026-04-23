/**
 * Player.js
 * 플레이어 상태 관리 클래스.
 * 씬 전환 시 player.toData() 로 직렬화하여 넘깁니다.
 */
import { HAND_DATA, DEBUG_MODE } from "../constants.js";
import { relicMap as RELIC_MAP, getAllRelics, getRelicPrice } from './relicManager.js';
import { getItemPrice } from './itemManager.js';
import deckData from '../data/deck.json';

/** 기본 덱 설정 (usable:true 중 첫 번째, 없으면 첫 번째) */
const DEFAULT_DECK = deckData.decks.find(d => d.usable) ?? deckData.decks[0];

// HAND_DATA에서 { multi, aoe } 만 추출한 기본 handConfig
const DEFAULT_HAND_CONFIG = Object.fromEntries(
    Object.entries(HAND_DATA).map(([rank, d]) => [rank, { multi: d.multi, aoe: d.aoe }])
);

// rarity 가중치: common 우선
const RARITY_WEIGHT = { common: 60, rare: 30, epic: 10 };

function _pickStartingRelicIds(n) {
    const pool = getAllRelics().map(r => ({ id: r.id, w: RARITY_WEIGHT[r.rarity] ?? 10 }));
    const result = [];
    const avail = [...pool];
    while (result.length < n && avail.length > 0) {
        const total = avail.reduce((s, r) => s + r.w, 0);
        let rand = Math.random() * total;
        const idx = avail.findIndex(r => (rand -= r.w) <= 0) ?? avail.length - 1;
        result.push(avail.splice(Math.max(0, idx), 1)[0].id);
    }
    return result;
}

/**
 * 레벨업에 필요한 경험치를 반환합니다.
 * @param {number} level
 * @returns {number}
 */
export function getRequiredExp(level) {
    level = level * 1;
    return Math.floor((level * level + level + 14) / 2);
}

export class Player {
    /**
     * @param {object} [data]        - 이전 씬에서 넘긴 직렬화 데이터 (없으면 초기값)
     */
    constructor(data = {}) {
        // ── 기본 스탯 ────────────────────────────────────────────────────────────
        this.hp = data.hp ?? 100;
        this.maxHp = data.maxHp ?? 100;
        this.def = data.def ?? 0;
        this.score = data.score ?? 0;
        this.xp = data.xp ?? 0;
        this.gold = data.gold ?? DEFAULT_DECK.startGold;
        this.level = data.level ?? 1;
        /** 턴당 공격 가능 횟수 */
        this.attacksPerTurn = data.attacksPerTurn ?? DEFAULT_DECK.attacksPerTurn;
        /** 공격력 (기본 카드 점수에 합산) */
        this.atk = data.atk ?? 5;
        /** 슈트별 레벨 { S, H, D, C } */
        this.attrs = data.attrs ?? { S: 1, H: 1, D: 1, C: 1 };
        /** 구매한 아이템 목록 (최대 6개) */
        this.items = data.items ?? [];
        /** 보유 유물 ID 목록 */
        this.relics = data.relics ?? [];
        //this.relics = data.relics ?? ["flush_draw", "str_draw", "side_mirror", "one_eye"];  //test
        /** 유물 최대 보유 수 (deck.json 기준) */
        this.maxRelicCount = DEFAULT_DECK.maxRelicCount;
        /** 아이템 최대 보유 수 (deck.json 기준) */
        this.maxItemCount = DEFAULT_DECK.maxItemCount;
        /**
         * 유물 3×3 슬롯 배치 (index 0~8, row=floor(i/3), col=i%3).
         * null = 빈 슬롯, string = relicId.
         * 기존 세이브(relicSlots 없음)는 relics 순서대로 0~8에 자동 배치.
         */
        if (data.relicSlots && Array.isArray(data.relicSlots) && data.relicSlots.length === 9) {
            this.relicSlots = [...data.relicSlots];
        } else {
            this.relicSlots = Array(9).fill(null);
            this.relics.forEach((id, i) => { if (i < 9) this.relicSlots[i] = id; });
        }

        // ── 직업 & 슈트 적응도 ───────────────────────────────────────────────────
        /** 직업 */
        this.deckId = data.deckId ?? "standard";
        /**
         * 슈트별 적응도 (기본 1.0 = 100%)
         * 효과: suitLevel * adaptability * 해당 suit 카드 수
         *  S(Spade)   : 공격 대상 몬스터 DEF 감소 (음수 가능 → 데미지 보너스)
         *  H(Hearts)  : 플레이어 HP 회복
         *  D(Diamonds): 플레이어 DEF 추가
         *  C(Clubs)   : 공격 대상 몬스터 ATK 감소 (최소 0)
         */
        this.adaptability = data.adaptability ?? { S: 1.0, H: 1.0, D: 1.0, C: 1.0 };

        // ── 게임플레이 수치 (deck.json 기본값, 아이템/버프로 변경 가능) ──────────
        const lc = {
            handSize: DEFAULT_DECK.handSize,
            handSizeMinimum: DEFAULT_DECK.handSizeMinimum,
            handSizeLimit: DEFAULT_DECK.handSizeLimit,
            turnStartDrawLimit: DEFAULT_DECK.turnStartDrawLimit,
            fieldSize: DEFAULT_DECK.fieldSize,
            fieldSizeLimit: DEFAULT_DECK.fieldSize,
            fieldPickLimit: DEFAULT_DECK.fieldSize,
        };

        this.handSize = data.handSize ?? lc.handSize;
        this.handSizeMinimum = data.handSizeMinimum ?? lc.handSizeMinimum;
        this.handSizeLimit = data.handSizeLimit ?? lc.handSizeLimit;
        this.turnStartDrawLimit = data.turnStartDrawLimit ?? lc.turnStartDrawLimit;
        this.fieldSize = data.fieldSize ?? lc.fieldSize;
        this.fieldSizeLimit = data.fieldSizeLimit ?? lc.fieldSizeLimit;
        this.fieldPickLimit = data.fieldPickLimit ?? lc.fieldPickLimit;

        // ── 족보 설정 (배수 / AoE) — 아이템·유물로 변경 가능 ─────────────────────
        this.handConfig = data.handConfig
            ? JSON.parse(JSON.stringify(data.handConfig))
            : JSON.parse(JSON.stringify(DEFAULT_HAND_CONFIG));

        // ── 족보 사용 횟수 (handRank 번호 → 누적 횟수) ──────────────────────────
        // HAND_RANK: HIGH_CARD=0 ~ FIVE_CARD=9
        const defaultCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
        this.handUseCounts = data.handUseCounts
            ? { ...defaultCounts, ...data.handUseCounts }
            : { ...defaultCounts };

        /** 마지막으로 사용한 족보 handRank 번호 (null = 아직 없음) */
        this.lastHandRank = data.lastHandRank ?? null;
    }

    /** 현재 레벨에서 레벨업에 필요한 총 경험치 */
    get requiredXp() {
        return getRequiredExp(this.level);
    }

    /**
     * 경험치를 추가하고 레벨업을 처리합니다.
     * @param {number} amount
     * @returns {number[]} 새로 획득한 레벨 배열 (레벨업 없으면 [])
     */
    addXp(amount) {
        this.xp += amount;
        const gained = [];
        while (this.xp >= getRequiredExp(this.level)) {
            this.xp -= getRequiredExp(this.level);
            this.level++;
            this.maxHp += 5;
            this.hp = Math.min(this.hp + 5, this.maxHp);
            this.atk += 1;
            gained.push(this.level);
        }
        return gained;
    }

    /**
     * relic 추가 시도. 6개 미만이면 바로 추가하고 true 반환.
     * 6개 이상이면 false 반환 (호출 측에서 showRelicPickPopup 사용).
     */
    /**
     * 현재 활성화된 족보 Set<number> 반환.
     * 기본 HAND_DATA.enabled + 보유 relic의 enableHand 효과.
     */
    getEnabledHands() {
        const enabled = new Set(
            Object.entries(HAND_DATA)
                .filter(([, d]) => d.enabled !== false)
                .map(([k]) => Number(k))
        );
        for (const relicId of this.relics) {
            const relic = RELIC_MAP[relicId];
            if (!relic) continue;
            for (const eff of relic.effects ?? []) {
                if (eff.type === 'enableHand' && eff.handRank != null)
                    enabled.add(Number(eff.handRank));
            }
        }
        return enabled;
    }

    /**
     * relic 효과를 반영한 handConfig 반환.
     * setHandAoe, multiplyHandMulti 효과를 player.handConfig 위에 적용.
     * 반환값은 매번 새 객체 (this.handConfig 불변).
     */
    getEffectiveHandConfig() {
        const cfg = JSON.parse(JSON.stringify(this.handConfig));
        for (const relicId of this.relics) {
            const relic = RELIC_MAP[relicId];
            if (!relic) continue;
            for (const eff of relic.effects ?? []) {
                const rank = String(eff.handRank);
                if (cfg[rank] == null) continue;
                if (eff.type === 'setHandAoe')
                    cfg[rank].aoe = eff.value;
                else if (eff.type === 'multiplyHandMulti')
                    cfg[rank].multi *= eff.value;
            }
        }
        return cfg;
    }

    /**
     * relic suitAlias 효과를 반영한 suit 별칭 맵 반환.
     * 예: { H: "D" } → Hearts를 Diamonds로 취급.
     * 효과 없으면 null 반환.
     */
    getEffectiveSuitAliases() {
        const aliases = {};
        for (const relicId of this.relics) {
            const relic = RELIC_MAP[relicId];
            if (!relic) continue;
            for (const eff of relic.effects ?? []) {
                if (eff.type === 'suitAlias' && eff.suit && eff.aliasTo)
                    aliases[eff.suit] = eff.aliasTo;
            }
        }
        return Object.keys(aliases).length > 0 ? aliases : null;
    }

    /**
     * relic 제거 시 적용할 효과 (price 환급 + onRemove 이펙트).
     * relics 배열에서 제거하기 전에 호출해야 함.
     */
    applyRelicOnRemove(relicId) {
        const relic = RELIC_MAP[relicId];
        if (!relic) return;
        // onRemove scope 효과 먼저 적용 (환급 전 골드 기준)
        for (const eff of relic.effects ?? []) {
            if (eff.scope !== 'onRemove') continue;
            if (eff.type === 'multiplyGold') this.gold = Math.floor(this.gold * eff.value);
        }
        // price 환급 (1/3, 소수점 버림) — 효과 적용 후 추가
        this.gold += Math.trunc(getRelicPrice(relicId) / 3);
    }

    /**
     * item 판매 시 골드 환급. items 배열에서 제거하기 전에 호출해야 함.
     * @param {number} itemIdx - player.items 내 인덱스
     */
    applyItemOnSell(itemIdx) {
        const item = this.items[itemIdx];
        if (!item) return;
        this.gold += Math.trunc(getItemPrice(item.id) / 3);
    }

    tryAddRelic(relicId) {
        if (this.relics.length < this.maxRelicCount) {
            this.relics.push(relicId);
            const emptyIdx = this.relicSlots.findIndex(s => s === null);
            if (emptyIdx >= 0) this.relicSlots[emptyIdx] = relicId;
            return true;
        }
        return false;
    }

    /** 유물 제거 (relics + relicSlots 동시 갱신) */
    removeRelic(relicId) {
        // filter를 사용하여 모든 인스턴스 제거 (보통은 1개지만 안전을 위해)
        this.relics = this.relics.filter(id => id !== relicId);

        // relicSlots에서도 해당 ID가 있는 모든 슬롯을 null로 비움
        for (let i = 0; i < this.relicSlots.length; i++) {
            if (this.relicSlots[i] === relicId) {
                this.relicSlots[i] = null;
            }
        }
    }

    /** 유물 교체 (특정 위치의 유물을 새 유물로 교체) */
    replaceRelic(oldId, newId) {
        const si = this.relicSlots.indexOf(oldId);
        if (si >= 0) {
            this.relicSlots[si] = newId;
            this.relics = this.relics.map(id => id === oldId ? newId : id);
        } else {
            // 위치를 못 찾으면 단순 제거 후 추가
            this.removeRelic(oldId);
            this.tryAddRelic(newId);
        }
    }

    // ── 유물 위치 / 빙고 헬퍼 ─────────────────────────────────────────────

    /** 슬롯 인덱스(0~8) → {row, col} */
    static slotToPos(idx) { return { row: Math.floor(idx / 3), col: idx % 3 }; }

    /** {row, col} → 슬롯 인덱스 */
    static posToSlot(row, col) { return row * 3 + col; }

    /**
     * 특정 유물의 슬롯 위치 반환.
     * @returns {{ idx:number, row:number, col:number } | null}
     */
    getRelicPosition(relicId) {
        const idx = this.relicSlots.indexOf(relicId);
        if (idx < 0) return null;
        return { idx, row: Math.floor(idx / 3), col: idx % 3 };
    }

    /** 특정 (row, col) 슬롯의 유물 ID 반환. 없으면 null */
    getRelicAt(row, col) {
        return this.relicSlots[row * 3 + col] ?? null;
    }

    /**
     * 특정 유물의 인접 유물 정보 반환 (상하좌우 + 대각선).
     * 각 키는 relicId(string) 또는 null.
     * @returns {{ up, down, left, right, upLeft, upRight, downLeft, downRight } | null}
     */
    getRelicNeighbors(relicId) {
        const pos = this.getRelicPosition(relicId);
        if (!pos) return null;
        const { row: r, col: c } = pos;
        const at = (dr, dc) => (r + dr >= 0 && r + dr < 3 && c + dc >= 0 && c + dc < 3)
            ? this.getRelicAt(r + dr, c + dc) : null;
        return {
            up: at(-1, 0),
            down: at(1, 0),
            left: at(0, -1),
            right: at(0, 1),
            upLeft: at(-1, -1),
            upRight: at(-1, 1),
            downLeft: at(1, -1),
            downRight: at(1, 1),
        };
    }

    /**
     * 완성된 빙고 라인 목록 반환.
     * @returns {Array<{ type:'row'|'col'|'diag', index:number, slots:number[] }>}
     *   slots: 해당 라인의 슬롯 인덱스 배열
     */
    getBingoLines() {
        const lines = [];
        for (let r = 0; r < 3; r++) {
            const slots = [r * 3, r * 3 + 1, r * 3 + 2];
            if (slots.every(i => this.relicSlots[i])) lines.push({ type: 'row', index: r, slots });
        }
        for (let c = 0; c < 3; c++) {
            const slots = [c, c + 3, c + 6];
            if (slots.every(i => this.relicSlots[i])) lines.push({ type: 'col', index: c, slots });
        }
        const d0 = [0, 4, 8];
        if (d0.every(i => this.relicSlots[i])) lines.push({ type: 'diag', index: 0, slots: d0 });
        const d1 = [2, 4, 6];
        if (d1.every(i => this.relicSlots[i])) lines.push({ type: 'diag', index: 1, slots: d1 });
        return lines;
    }

    /** 빙고 라인이 하나라도 완성됐으면 true */
    hasBingo() { return this.getBingoLines().length > 0; }

    /** 씬 전환용 직렬화 */
    toData() {
        return {
            hp: this.hp,
            maxHp: this.maxHp,
            def: this.def,
            score: this.score,
            xp: this.xp,
            gold: this.gold,
            level: this.level,
            attacksPerTurn: this.attacksPerTurn,
            atk: this.atk,
            attrs: { ...this.attrs },
            deckId: this.deckId,
            adaptability: { ...this.adaptability },
            handSize: this.handSize,
            handSizeMinimum: this.handSizeMinimum,
            handSizeLimit: this.handSizeLimit,
            turnStartDrawLimit: this.turnStartDrawLimit,
            fieldSize: this.fieldSize,
            fieldSizeLimit: this.fieldSizeLimit,
            fieldPickLimit: this.fieldPickLimit,
            items: [...this.items],
            relics: [...this.relics],
            relicSlots: [...this.relicSlots],
            maxRelicCount: this.maxRelicCount,
            maxItemCount: this.maxItemCount,
            handConfig: JSON.parse(JSON.stringify(this.handConfig)),
            handUseCounts: { ...this.handUseCounts },
            lastHandRank: this.lastHandRank,
        };
    }
}
