/**
 * BINGO_LINES 정의 및 빙고 판단/점수 계산 관리 매니저
 */

export const BINGO_LINES = {
    HORIZONTAL: [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8]
    ],
    VERTICAL: [
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8]
    ],
    DIAGONAL: [
        [0, 4, 8],
        [2, 4, 6]
    ]
};

/**
 * 기본 빙고 보너스 및 레벨업 시 증가 수치
 */
export const BINGO_UPGRADES = {
    H: { base: 50, inc: 30 },
    V: { base: 2, inc: 1 },
    D: { base: 1.2, inc: 0.1 }
};

/**
 * 특정 타입과 레벨의 보너스 수치를 계산합니다.
 */
export function getBingoBonusValue(type, level = 1) {
    const config = BINGO_UPGRADES[type.toUpperCase()];
    if (!config) return 0;
    return config.base + (level - 1) * config.inc;
}

/**
 * 현재 슬롯 상태를 기반으로 완성된 빙고 정보를 반환합니다.
 * @param {Array} slots - 9칸의 유물 ID 배열 (null 포함)
 * @returns {Object} { h, v, d, lines }
 */
export function getBingoStats(slots) {
    if (!slots || slots.length !== 9) {
        return { h: 0, v: 0, d: 0, lines: [] };
    }

    const hLines = BINGO_LINES.HORIZONTAL.filter(line => line.every(i => slots[i] !== null));
    const vLines = BINGO_LINES.VERTICAL.filter(line => line.every(i => slots[i] !== null));
    const dLines = BINGO_LINES.DIAGONAL.filter(line => line.every(i => slots[i] !== null));

    const lines = [
        ...hLines.map(l => ({ type: 'row', slots: l })),
        ...vLines.map(l => ({ type: 'col', slots: l })),
        ...dLines.map(l => ({ type: 'diag', slots: l }))
    ];

    return {
        h: hLines.length,
        v: vLines.length,
        d: dLines.length,
        lines
    };
}

/**
 * 빙고 보너스를 ScoreState에 적용합니다.
 * @param {ScoreState} state - scoreService의 상태 객체
 * @param {Array} slots - 유물 슬롯
 * @param {Object} levels - 빙고별 레벨 { h, v, d }
 * @returns {Array} 적용된 델타 목록
 */
export function applyBingoBonuses(state, slots, levels = { h: 1, v: 1, d: 1 }) {
    const stats = getBingoStats(slots);
    const deltas = [];

    if (stats.h > 0) {
        const bonusValue = getBingoBonusValue('H', levels.h);
        const val = stats.h * bonusValue;
        const d = state.addBase(val, `BINGO:H (Lv.${levels.h})`);
        if (d !== 0) deltas.push({ relicId: 'sys_bingo_h', type: 'base', value: d });
    }

    if (stats.v > 0) {
        const bonusValue = getBingoBonusValue('V', levels.v);
        const val = stats.v * bonusValue;
        const d = state.addPlusMulti(val, `BINGO:V (Lv.${levels.v})`);
        if (d !== 0) deltas.push({ relicId: 'sys_bingo_v', type: 'plus_multi', value: d });
    }

    if (stats.d > 0) {
        const bonusValue = getBingoBonusValue('D', levels.d);
        const ratio = Math.pow(bonusValue, stats.d);
        state.multiplyTimes(ratio, `BINGO:D (Lv.${levels.d})`);
        if (Math.abs(ratio - 1.0) > 0.0001) deltas.push({ relicId: 'sys_bingo_d', type: 'times_multi', value: ratio });
    }

    return deltas;
}
