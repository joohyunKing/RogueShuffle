/**
 * save.js — localStorage 기반 세이브/로드 유틸리티
 *
 * 저장 포맷: { round: number, player: PlayerData }
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

export function writeSave(round, playerData) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ round, player: playerData }));
  } catch { /* 스토리지 비활성화 환경 무시 */ }
}

export function deleteSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
}
