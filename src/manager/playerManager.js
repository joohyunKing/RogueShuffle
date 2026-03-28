/**
 * Player.js
 * 플레이어 상태 관리 클래스.
 * 씬 전환 시 player.toData() 로 직렬화하여 넘깁니다.
 */
import { HAND_DATA, DEBUG_MODE } from "../constants.js";
import relicData from '../data/relic.json';

// HAND_DATA에서 { multi, aoe } 만 추출한 기본 handConfig
const DEFAULT_HAND_CONFIG = Object.fromEntries(
    Object.entries(HAND_DATA).map(([rank, d]) => [rank, { multi: d.multi, aoe: d.aoe }])
);

function _pickRandomRelicIds(n) {
    const ids = relicData.relics.map(r => r.id);
    return [...ids].sort(() => Math.random() - 0.5).slice(0, Math.min(n, ids.length));
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
        this.gold = data.gold ?? 0;
        this.level = data.level ?? 1;
        /** 턴당 공격 가능 횟수 */
        this.attacksPerTurn = data.attacksPerTurn ?? 2;
        /** 공격력 (기본 카드 점수에 합산) */
        this.atk = data.atk ?? 5;
        /** 슈트별 레벨 { S, H, D, C } */
        this.attrs = data.attrs ?? { S: 1, H: 1, D: 1, C: 1 };
        /** 구매한 아이템 목록 (최대 4개) */
        this.items = data.items ?? [];
        /** 보유 유물 ID 목록 (최대 15개) */
        this.relics = (data.relics ?? (DEBUG_MODE ? _pickRandomRelicIds(3) : [])).slice(0, 15);

        // ── 직업 & 슈트 적응도 ───────────────────────────────────────────────────
        /** 직업 */
        this.job = data.job ?? "Magician";
        /**
         * 슈트별 적응도 (기본 1.0 = 100%)
         * 효과: suitLevel * adaptability * 해당 suit 카드 수
         *  S(Spade)   : 공격 대상 몬스터 DEF 감소 (음수 가능 → 데미지 보너스)
         *  H(Hearts)  : 플레이어 HP 회복
         *  D(Diamonds): 플레이어 DEF 추가
         *  C(Clubs)   : 공격 대상 몬스터 ATK 감소 (최소 0)
         */
        this.adaptability = data.adaptability ?? { S: 1.0, H: 1.0, D: 1.0, C: 1.0 };

        // ── 게임플레이 수치 (LevelConfig 기본값, 아이템/버프로 변경 가능) ─────────
        const lc = {

            handSize: 7,
            handSizeLimit: 8,
            turnStartDrawLimit: 3,
            fieldSize: 5,
            fieldSizeLimit: this.fieldSize, //6,
            fieldPickLimit: this.fieldSize, //1,
        };

        this.handSize = data.handSize ?? lc.handSize;
        this.handSizeLimit = data.handSizeLimit ?? lc.handSizeLimit;
        this.turnStartDrawLimit = data.turnStartDrawLimit ?? lc.turnStartDrawLimit;
        this.fieldSize = data.fieldSize ?? lc.fieldSize;
        this.fieldSizeLimit = data.fieldSizeLimit ?? lc.fieldSizeLimit;
        this.fieldPickLimit = data.fieldPickLimit ?? lc.fieldPickLimit;

        // ── 족보 설정 (배수 / AoE) — 아이템·유물로 변경 가능 ─────────────────────
        this.handConfig = data.handConfig
            ? JSON.parse(JSON.stringify(data.handConfig))
            : JSON.parse(JSON.stringify(DEFAULT_HAND_CONFIG));
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
            this.maxHp += 2;
            this.hp = Math.min(this.hp + 2, this.maxHp);
            this.atk += 1;
            gained.push(this.level);
        }
        return gained;
    }

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
            job: this.job,
            adaptability: { ...this.adaptability },
            handSize: this.handSize,
            handSizeLimit: this.handSizeLimit,
            turnStartDrawLimit: this.turnStartDrawLimit,
            fieldSize: this.fieldSize,
            fieldSizeLimit: this.fieldSizeLimit,
            fieldPickLimit: this.fieldPickLimit,
            items: [...this.items],
            relics: [...this.relics],
            handConfig: JSON.parse(JSON.stringify(this.handConfig)),
        };
    }
}
