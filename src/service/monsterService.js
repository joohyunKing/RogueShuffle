/**
 * monsterService.js
 *
 * 몬스터 데이터를 src/data/monster.json 에서 읽어 관리합니다.
 * MONSTER_GRID는 tier 기준 배열로 자동 구성됩니다.
 *
 * sprite 구조: { idle, attack, damaged, die, skill? } — GIF 파일명
 * → 각 상태 GIF를 DOM <img> 요소에 직접 표시 (Phaser 스프라이트 불사용)
 */

import monsterData from '../data/monster.json';

function _resolveSprite(sprite) {
  if (!sprite || typeof sprite !== 'object') return null;
  const result = {};
  for (const [state, file] of Object.entries(sprite)) {
    result[state] = `assets/images/monster/${file}`;
  }
  return result;
}

function _getMonstersByTier(tier) {
  return MONSTER_GRID[tier] ?? MONSTER_GRID[0];
}

// 랜덤 숫자
function _randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * sprite가 있는 몬스터만 반환합니다. tier는 숫자 또는 숫자 배열.
 * 해당 티어에 sprite가 없으면 tier 0 fallback.
 * @param {number|number[]} tier
 * @returns {MonsterType[]}
 */
function _getAvailableMonstersByTier(tier) {
  const tiers = Array.isArray(tier) ? tier : [tier];
  const pool = tiers.flatMap(t => _getMonstersByTier(t));
  const available = pool.filter(m => m.sprite !== null);
  return available.length > 0
    ? available
    : MONSTER_GRID[0].filter(m => m.sprite !== null);
}


// ── cost 예산 기반 몬스터 그룹 구성 (1~4마리) ─────────────────────────────
function _buildMonsterGroup(monsterTier, totalCost) {
  const pool = _getAvailableMonstersByTier(monsterTier);
  if (!pool.length) return [];

  const result = [];

  while (result.length < 4 && totalCost > 0) {
    const affordable = pool.filter(m => m.cost <= totalCost);
    if (!affordable.length) break;

    const pick = affordable[Math.floor(Math.random() * affordable.length)];
    result.push(pick);
    totalCost -= pick.cost;
  }

  // 최소 1마리 보장 (예산이 가장 싼 몬스터 cost보다 작을 경우 대비)
  if (result.length === 0) {
    const cheapest = [...pool].sort((a, b) => a.cost - b.cost)[0];
    result.push(cheapest);
  }

  return result;
}


// ── 타입 정의 ──────────────────────────────────────────────────────────────
/**
 * @typedef {{
 *   id:     string,
 *   name:   string,
 *   sprite: {idle:string, attack:string, damaged:string, die:string, skill?:string}|null,
 *   tier:   number,
 *   race:   string,
 *   cost:   number,
 *   hp:     [number, number],
 *   atk:    [number, number],
 *   def:    [number, number],
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
    name: d.name ?? id,
    sprite: _resolveSprite(d.sprite),
    tier,
    race: d.race ?? 'unknown',
    cost: d.cost ?? 1,
    hp: d.hp,
    atk: d.atk,
    def: d.def,
    skill: d.skill ?? null,
  });
}

/** 전체 flat 목록 */
export const MONSTER_LIST = MONSTER_GRID.flat();

// ── 보상 테이블 ───────────────────────────────────────────────────────────
/** 티어별 경험치·골드 보상 범위 [min, max] */
export const TIER_REWARDS = [
  { xp: [3, 5], gold: [1, 2] },   // tier 0
  { xp: [5, 10], gold: [3, 4] },   // tier 1
  { xp: [10, 15], gold: [5, 8] },   // tier 2
  { xp: [10, 15], gold: [5, 8] },   // tier 3
];

// ── 조회 함수 ─────────────────────────────────────────────────────────────
/**
 * 특정 티어의 몬스터 목록을 반환합니다.
 * @param {number} tier
 * @returns {MonsterType[]}
 */
export function getMonstersByTier(tier) {
  return _getMonstersByTier(tier);
}

/**
 * sprite가 있는 몬스터만 반환합니다. tier는 숫자 또는 숫자 배열.
 * 해당 티어에 sprite가 없으면 tier 0 fallback.
 * @param {number|number[]} tier
 * @returns {MonsterType[]}
 */
export function getAvailableMonstersByTier(tier) {
  return _getAvailableMonstersByTier(tier);
}


export function spawnMonsters(monsterTier, totalCost) {
  //console.log("monsterTier : " + monsterTier + " / totalCost : " + totalCost);
  const monsterGroup = _buildMonsterGroup(monsterTier, totalCost);
  return monsterGroup.map(mob => {
    const hp = _randInt(mob.hp[0], mob.hp[1]);
    const rewards = TIER_REWARDS[Math.min(mob.tier, TIER_REWARDS.length - 1)];
    return {
      mob,
      hp, maxHp: hp,
      atk: _randInt(mob.atk[0], mob.atk[1]),
      def: _randInt(mob.def[0], mob.def[1]),
      xp: _randInt(rewards.xp[0], rewards.xp[1]),
      gold: _randInt(rewards.gold[0], rewards.gold[1]),
      isDead: false,
    };
  });
}