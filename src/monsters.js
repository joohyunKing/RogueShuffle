/**
 * monsters.js
 *
 * 몬스터 종류를 4×4 그리드로 관리합니다.
 * 행(row) = 난이도 티어 (0: 약함 → 3: 강함)
 * 열(col) = 같은 티어 내 개별 종류 (0~3)
 *
 * image: Vite static import URL. null이면 placeholder 사용.
 *
 * 스프라이트시트 구성 (1024×1024, 4col × 3row):
 *   Row 0 (frames  0~3 ): idle   animation
 *   Row 1 (frames  4~7 ): attack animation
 *   Row 2 (frames 8~11 ): death  animation
 */

import skeletonUrl  from './assets/images/monster/skeleton.png';
import zombiUrl     from './assets/images/monster/zombi.png';
import goblinUrl    from './assets/images/monster/goblin.png';
import werewolfUrl  from './assets/images/monster/werewolf.png';

/** @typedef {{ id:string, name:string, image:string|null, tier:number }} MonsterType */

/**
 * 몬스터 스프라이트시트 애니메이션 프레임 정의
 * frameRate / repeat 는 필요에 따라 GameScene에서 조정 가능
 */
export const MONSTER_ANIMS = {
  idle:   { start: 0,  end: 3,  frameRate: 8,  repeat: -1 },
  attack: { start: 4,  end: 7,  frameRate: 10, repeat: 0  },
  death:  { start: 8,  end: 11, frameRate: 8,  repeat: 0  },
};

/**
 * 티어별 경험치·골드 보상 범위 [min, max]
 * 인덱스 = tier (0~3)
 */
export const TIER_REWARDS = [
  { xp: [3,  5],  gold: [1, 2] },   // tier 0
  { xp: [5,  10], gold: [3, 4] },   // tier 1
  { xp: [10, 15], gold: [5, 8] },   // tier 2
  { xp: [10, 15], gold: [5, 8] },   // tier 3
];

/** @type {MonsterType[][]} 4×4 grid [tier][col] */
export const MONSTER_GRID = [
  // ── Tier 0 ───────────────────────────────────────────────────────────────
  [
    { id: "skeleton", name: "스켈레톤", image: skeletonUrl,  tier: 0 },
    { id: "zombi",    name: "좀비",     image: zombiUrl,     tier: 0 },
    { id: "goblin",   name: "고블린",   image: goblinUrl,    tier: 0 },
  ],
  // ── Tier 1 ───────────────────────────────────────────────────────────────
  [
    { id: "orc",      name: "오크",     image: null,         tier: 1 },
    { id: "werewolf", name: "늑대인간", image: werewolfUrl,  tier: 1 },
    { id: "harpy",    name: "하피",     image: null,         tier: 1 },
    { id: "golem",    name: "골렘",     image: null,         tier: 1 },
  ],
  // ── Tier 2 ───────────────────────────────────────────────────────────────
  [
    { id: "vampire",  name: "뱀파이어", image: null,           tier: 2 },
    { id: "medusa",   name: "메두사",   image: null,           tier: 2 },
    { id: "chimera",  name: "키메라",   image: null,           tier: 2 },
    { id: "wyvern",   name: "와이번",   image: null,           tier: 2 },
  ],
  // ── Tier 3 ───────────────────────────────────────────────────────────────
  [
    { id: "lich",     name: "리치",     image: null,           tier: 3 },
    { id: "demon",    name: "데몬",     image: null,           tier: 3 },
    { id: "dragon",   name: "드래곤",   image: null,           tier: 3 },
    { id: "darkgod",  name: "암흑신",   image: null,           tier: 3 },
  ],
];

/** 전체 flat 목록 */
export const MONSTER_LIST = MONSTER_GRID.flat();

/**
 * 특정 티어의 몬스터 목록을 반환합니다.
 * @param {number} tier 0~3
 * @returns {MonsterType[]}
 */
export function getMonstersByTier(tier) {
  return MONSTER_GRID[tier] ?? MONSTER_GRID[0];
}

/**
 * 이미지가 있는 몬스터만 반환합니다.
 * @param {number} tier
 * @returns {MonsterType[]}
 */
export function getAvailableMonstersByTier(tier) {
  const pool = getMonstersByTier(tier);
  const available = pool.filter(m => m.image !== null);
  // 이미지가 없으면 tier 0 fallback
  return available.length > 0 ? available : MONSTER_GRID[0].filter(m => m.image !== null);
}

/**
 * Phaser scene의 preload 에서 호출 — 4×3 spritesheet(1024×1024)로 로드합니다.
 * 프레임 크기: 256×341 (1024÷4 × 1024÷3)
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
 * Phaser scene의 create 에서 호출 — 몬스터별 애니메이션을 등록합니다.
 * 이미 등록된 애니메이션은 건너뜁니다 (씬 재시작 안전).
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
        frames: scene.anims.generateFrameNumbers(key, { start: idle.start, end: idle.end }),
        frameRate: idle.frameRate, repeat: idle.repeat,
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
        frames: scene.anims.generateFrameNumbers(key, { start: death.start, end: death.end }),
        frameRate: death.frameRate, repeat: death.repeat,
      });
    }
  });
}
