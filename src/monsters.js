/**
 * monsters.js
 *
 * 몬스터 종류를 4×4 그리드로 관리합니다.
 * 행(row) = 난이도 티어 (0: 약함 → 3: 강함)
 * 열(col) = 같은 티어 내 개별 종류 (0~3)
 *
 * image: 'public/monster/' 하위 파일명. null이면 placeholder 사용.
 */

/** @typedef {{ id:string, name:string, image:string|null, tier:number }} MonsterType */

/** @type {MonsterType[][]} 4×4 grid [tier][col] */
export const MONSTER_GRID = [
  // ── Tier 0 ───────────────────────────────────────────────────────────────
  [
    { id: "skeleton", name: "스켈레톤", image: "skeleton.jpg", tier: 0 },
    { id: "zombi",    name: "좀비",     image: "zombi.jpg",    tier: 0 },
    { id: "slime",    name: "슬라임",   image: null,           tier: 0 },
    { id: "goblin",   name: "고블린",   image: null,           tier: 0 },
  ],
  // ── Tier 1 ───────────────────────────────────────────────────────────────
  [
    { id: "orc",      name: "오크",     image: null,           tier: 1 },
    { id: "werewolf", name: "늑대인간", image: null,           tier: 1 },
    { id: "harpy",    name: "하피",     image: null,           tier: 1 },
    { id: "golem",    name: "골렘",     image: null,           tier: 1 },
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
 * Phaser scene의 preload 에서 호출 — 4×4 spritesheet(1024×1024)로 로드합니다.
 * 프레임 크기: 256×256 (1024 ÷ 4)
 * @param {Phaser.Scene} scene
 */
export function preloadMonsters(scene) {
  MONSTER_LIST.forEach(m => {
    if (m.image) {
      scene.load.spritesheet(`mon_${m.id}`, `/monster/${m.image}`, {
        frameWidth:  256,
        frameHeight: 256,
      });
    }
  });
}
