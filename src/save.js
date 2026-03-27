/**
 * save.js — localStorage 기반 세이브/로드 유틸리티
 *
 * 저장 포맷:
 *   { round, player, deck, battle? }
 *
 * battle (턴 시작 시 저장):
 *   { isBoss, battleIndex, normalCount, monsterTier, totalCost, monsters }
 *   → CONTINUE 시 해당 배틀로 직접 복귀
 */

const SAVE_KEY = "rogueShuffle_save";

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/**
 * @param {number} round
 * @param {object} playerData
 * @param {object} deckData
 * @param {object|null} battleData  턴 시작 컨텍스트 (null이면 라운드 경계 세이브)
 */
export function writeSave(round, playerData, deckData, battleData = null) {
  try {
    const save = { round, player: playerData, deck: deckData };
    if (battleData) save.battle = battleData;
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch { /* 스토리지 비활성화 환경 무시 */ }
}

export function deleteSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
}
