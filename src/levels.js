/**
 * levels.js
 * 레벨별 게임플레이 수치 설정.
 *
 * getLevelConfig(level) 로 현재 레벨 설정을 가져옴.
 * 정의된 레벨 수를 초과하면 마지막 레벨 설정을 반복 사용.
 */

/**
 * @typedef {Object} LevelConfig
 * @property {number} handSize            - 라운드 시작 시 핸드 배치 수
 * @property {number} handSizeLimit       - 핸드 최대 보유 수
 * @property {number} turnStartDrawLimit  - 턴 시작 시 핸드 보충 최대 수
 * @property {number} fieldSize           - 라운드 시작 / 턴 시작 시 필드 배치 수
 * @property {number} fieldSizeLimit      - 필드 최대 카드 수
 * @property {number} fieldPickLimit      - 턴당 필드에서 픽업 가능한 카드 수
 * @property {number|number[]} monsterTier  - 등장 몬스터 티어. 단일 숫자 또는 배열로 복수 티어 지정
 * @property {[number,number]} monsterCost  - 등장 몬스터 총 cost 범위 [min, max]
 *                                            monster.json cost 합산으로 배치 수 결정 (최소 1, 최대 5)
 */

/** @type {LevelConfig[]} */
const LEVEL_CONFIGS = [
  // ── Level 1 ──────────────────────────────────────────────────────────────
  {
    handSize:           7,
    handSizeLimit:      8,
    turnStartDrawLimit: 3,
    fieldSize:          5,
    fieldSizeLimit:     6,
    fieldPickLimit:     1,
    monsterTier:        0,
    monsterCost:        [2, 3],
  },
  // ── Level 2 ──────────────────────────────────────────────────────────────
  {
    handSize:           7,
    handSizeLimit:      8,
    turnStartDrawLimit: 3,
    fieldSize:          5,
    fieldSizeLimit:     6,
    fieldPickLimit:     1,
    monsterTier:        [0, 1],
    monsterCost:        [2, 4],
  },
  // ── Level 3 ──────────────────────────────────────────────────────────────
  {
    handSize:           7,
    handSizeLimit:      8,
    turnStartDrawLimit: 3,
    fieldSize:          5,
    fieldSizeLimit:     6,
    fieldPickLimit:     1,
    monsterTier:        [0, 1],
    monsterCost:        [3, 5],
  },
  // ── Level 4 ──────────────────────────────────────────────────────────────
  {
    handSize:           7,
    handSizeLimit:      8,
    turnStartDrawLimit: 3,
    fieldSize:          5,
    fieldSizeLimit:     6,
    fieldPickLimit:     1,
    monsterTier:        [1, 2],
    monsterCost:        [4, 7],
  },
  // ── Level 5 ──────────────────────────────────────────────────────────────
  {
    handSize:           7,
    handSizeLimit:      8,
    turnStartDrawLimit: 3,
    fieldSize:          5,
    fieldSizeLimit:     6,
    fieldPickLimit:     1,
    monsterTier:        [2, 3],
    monsterCost:        [6, 9],
  },
  // ── Level 6 ──────────────────────────────────────────────────────────────
  {
    handSize:           7,
    handSizeLimit:      8,
    turnStartDrawLimit: 3,
    fieldSize:          5,
    fieldSizeLimit:     6,
    fieldPickLimit:     1,
    monsterTier:        [3, 4],
    monsterCost:        [7, 10],
  },
];

/**
 * 현재 레벨에 맞는 설정을 반환합니다.
 * 정의된 레벨 수를 초과하면 마지막 레벨 설정을 반환합니다.
 * @param {number} level - 1부터 시작
 * @returns {LevelConfig}
 */
export function getLevelConfig(level) {
  const idx = Math.min(level - 1, LEVEL_CONFIGS.length - 1);
  return LEVEL_CONFIGS[idx];
}

/** 현재 정의된 최대 레벨 수 */
export const MAX_DEFINED_LEVEL = LEVEL_CONFIGS.length;
