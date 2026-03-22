/**
 * monsters.js
 *
 * 몬스터 데이터를 src/data/monster.json 에서 읽어 관리합니다.
 * MONSTER_GRID는 tier 기준 4×N 배열로 자동 구성됩니다.
 *
 * 스프라이트시트 구성 (1024×1024, 4col × 3row):
 *   Row 0 (frames  0~3 ): idle   animation
 *   Row 1 (frames  4~7 ): attack animation
 *   Row 2 (frames 8~11 ): death  animation
 */

import monsterData from './data/monster.json';

// Vite glob import — monster PNG 전체를 URL로 수집
const _imgs = import.meta.glob(
  './assets/images/monster/*.png',
  { eager: true, query: '?url', import: 'default' }
);

function _resolveImage(sprite) {
  if (!sprite) return null;
  return _imgs[`./assets/images/monster/${sprite}`] ?? null;
}

// ── 타입 정의 ──────────────────────────────────────────────────────────────
/**
 * @typedef {{
 *   id:    string,
 *   name:  string,
 *   image: string|null,
 *   tier:  number,
 *   race:  string,
 *   cost:  number,
 *   hp:    [number, number],
 *   atk:   [number, number],
 *   def:   [number, number],
 * }} MonsterType
 */

// ── MONSTER_GRID 구성 (JSON → tier 기준 분류) ────────────────────────────
/** @type {MonsterType[][]} [tier][col] */
export const MONSTER_GRID = [];

for (const [id, d] of Object.entries(monsterData)) {
  const tier = d.tier ?? 0;
  while (MONSTER_GRID.length <= tier) MONSTER_GRID.push([]);
  MONSTER_GRID[tier].push({
    id,
    name:  d.name  ?? id,
    image: _resolveImage(d.sprite),
    tier,
    race:  d.race  ?? 'unknown',
    cost:  d.cost  ?? 1,
    hp:    d.hp,
    atk:   d.atk,
    def:   d.def,
  });
}

/** 전체 flat 목록 */
export const MONSTER_LIST = MONSTER_GRID.flat();

// ── 애니메이션 정의 ───────────────────────────────────────────────────────
/**
 * 몬스터 스프라이트시트 애니메이션 프레임 정의
 */
export const MONSTER_ANIMS = {
  idle:   { start: 0,  end: 3,  frameRate: 8,  repeat: -1 },
  attack: { start: 4,  end: 7,  frameRate: 10, repeat: 0  },
  death:  { start: 8,  end: 11, frameRate: 8,  repeat: 0  },
};

// ── 보상 테이블 ───────────────────────────────────────────────────────────
/** 티어별 경험치·골드 보상 범위 [min, max] */
export const TIER_REWARDS = [
  { xp: [3,  5],  gold: [1, 2] },   // tier 0
  { xp: [5,  10], gold: [3, 4] },   // tier 1
  { xp: [10, 15], gold: [5, 8] },   // tier 2
  { xp: [10, 15], gold: [5, 8] },   // tier 3
];

// ── 조회 함수 ─────────────────────────────────────────────────────────────
/**
 * 특정 티어의 몬스터 목록을 반환합니다.
 * @param {number} tier 0~3
 * @returns {MonsterType[]}
 */
export function getMonstersByTier(tier) {
  return MONSTER_GRID[tier] ?? MONSTER_GRID[0];
}

/**
 * 이미지가 있는 몬스터만 반환합니다. tier는 숫자 또는 숫자 배열.
 * 해당 티어에 이미지가 없으면 tier 0 fallback.
 * @param {number|number[]} tier
 * @returns {MonsterType[]}
 */
export function getAvailableMonstersByTier(tier) {
  const tiers     = Array.isArray(tier) ? tier : [tier];
  const pool      = tiers.flatMap(t => getMonstersByTier(t));
  const available = pool.filter(m => m.image !== null);
  return available.length > 0
    ? available
    : MONSTER_GRID[0].filter(m => m.image !== null);
}

// ── Phaser 연동 ───────────────────────────────────────────────────────────
/**
 * scene.preload() 에서 호출 — 스프라이트시트 로드 (256×341 프레임)
 * @param {Phaser.Scene} scene
 */
export function preloadMonsters(scene) {
  MONSTER_LIST.forEach(m => {
    if (m.image) {
      scene.load.spritesheet(`mon_${m.id}`, m.image, {
        frameWidth:  256,
        frameHeight: 341,
      });
    }
  });
}

/**
 * scene.create() 에서 호출 — idle/attack/death 애니메이션 등록 (재시작 안전)
 * @param {Phaser.Scene} scene
 */
export function createMonsterAnims(scene) {
  const { idle, attack, death } = MONSTER_ANIMS;
  MONSTER_LIST.forEach(m => {
    if (!m.image) return;
    const key = `mon_${m.id}`;
    if (!scene.textures.exists(key)) return;

    if (!scene.anims.exists(`${key}_idle`)) {
      scene.anims.create({
        key: `${key}_idle`,
        frames: scene.anims.generateFrameNumbers(key, { start: idle.start,   end: idle.end   }),
        frameRate: idle.frameRate,   repeat: idle.repeat,
      });
    }
    if (!scene.anims.exists(`${key}_attack`)) {
      scene.anims.create({
        key: `${key}_attack`,
        frames: scene.anims.generateFrameNumbers(key, { start: attack.start, end: attack.end }),
        frameRate: attack.frameRate, repeat: attack.repeat,
      });
    }
    if (!scene.anims.exists(`${key}_death`)) {
      scene.anims.create({
        key: `${key}_death`,
        frames: scene.anims.generateFrameNumbers(key, { start: death.start,  end: death.end  }),
        frameRate: death.frameRate,  repeat: death.repeat,
      });
    }
  });
}
