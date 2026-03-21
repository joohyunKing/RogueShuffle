/**
 * textStyles.js
 * 전체 씬에서 공유하는 Phaser Text 스타일 상수.
 * PressStart2P 픽셀 폰트 기준. 한글은 Arial fallback.
 */

const F = "'PressStart2P', Arial";

export const TS = {
  // ── 게임 헤더 ──────────────────────────────────────────────────────────────
  gameTitle:         { fontFamily: F, fontSize: '13px', color: '#ffffff' },

  // ── 배틀 로그 ──────────────────────────────────────────────────────────────
  log:               { fontFamily: F, fontSize: '10px', color: '#ffcc44', stroke: '#0a1a10', strokeThickness: 2 },
  msg:               { fontFamily: F, fontSize: '13px', color: '#ffcc44', stroke: '#1a472a', strokeThickness: 3 },

  // ── 몬스터 영역 정보 (레벨/덱/버린카드) ────────────────────────────────────
  infoLabel:         { fontFamily: F, fontSize: '8px',  color: '#5fad6d' },
  infoValue:         { fontFamily: F, fontSize: '10px', color: '#aabbaa' },
  levelValue:        { fontFamily: F, fontSize: '13px', color: '#aaffcc' },

  // ── 플레이어 스탯 ──────────────────────────────────────────────────────────
  playerHp:          { fontFamily: F, fontSize: '10px', color: '#ff9999' },
  playerDef:         { fontFamily: F, fontSize: '10px', color: '#88ccff' },

  // ── 족보 프리뷰 ────────────────────────────────────────────────────────────
  comboLabel:        { fontFamily: F, fontSize: '12px', color: '#88ffaa' },
  comboScore:        { fontFamily: F, fontSize: '12px', color: '#ffdd66' },

  // ── 패널 레이블 (FIELD / HAND) ─────────────────────────────────────────────
  panelLabel:        { fontFamily: F, fontSize: '9px',  color: '#5fad6d', letterSpacing: 4 },

  // ── 정렬 버튼 ──────────────────────────────────────────────────────────────
  sortBtn:           { fontFamily: F, fontSize: '10px', color: '#aaffcc' },

  // ── 하단 버튼 ──────────────────────────────────────────────────────────────
  menuBtn:           { fontFamily: F, fontSize: '11px', color: '#ffffff' },
  turnEndBtn:        { fontFamily: F, fontSize: '11px', color: '#ffffff' },

  // ── 몬스터 ─────────────────────────────────────────────────────────────────
  monName:           { fontFamily: F, fontSize: '9px',  color: '#ffffff', stroke: '#000000', strokeThickness: 2 },
  monStat:           { fontFamily: F, fontSize: '8px',  color: '#cccccc' },
  monTarget:         { fontFamily: F, fontSize: '9px',  color: '#ffdd44', stroke: '#000000', strokeThickness: 2 },
  monDead:           { fontFamily: F, fontSize: '28px', color: '#cc2222' },

  // ── 전투 이펙트 ────────────────────────────────────────────────────────────
  damageHit:         { fontFamily: F, fontSize: '16px', color: '#ff5555', stroke: '#000000', strokeThickness: 3 },
  damageBlocked:     { fontFamily: F, fontSize: '16px', color: '#88ccff', stroke: '#000000', strokeThickness: 3 },

  // ── 라운드 클리어 오버레이 ──────────────────────────────────────────────────
  clearTitle:        { fontFamily: F, fontSize: '20px', color: '#44ff88', stroke: '#000000', strokeThickness: 4 },
  clearSub:          { fontFamily: F, fontSize: '13px', color: '#aaffcc' },
  clearNote:         { fontFamily: F, fontSize: '10px', color: '#88bb99' },

  // ── 게임 오버 오버레이 ──────────────────────────────────────────────────────
  gameOverTitle:     { fontFamily: F, fontSize: '26px', color: '#ff4444', stroke: '#000000', strokeThickness: 5 },
  gameOverScoreLabel:{ fontFamily: F, fontSize: '13px', color: '#88bb99' },
  gameOverScore:     { fontFamily: F, fontSize: '22px', color: '#ffdd00' },
  overlayBtn:        { fontFamily: F, fontSize: '13px', color: '#ffffff' },

  // ── 메인 메뉴 ──────────────────────────────────────────────────────────────
  menuTitle:         { fontFamily: F, fontSize: '34px', color: '#ffffff', stroke: '#0a2a14', strokeThickness: 8 },
  menuSub:           { fontFamily: F, fontSize: '11px', color: '#88bb99' },
  menuPlayBtn:       { fontFamily: F, fontSize: '16px', color: '#ffffff' },
  menuOptBtn:        { fontFamily: F, fontSize: '13px', color: '#aaffcc' },
  version:           { fontFamily: F, fontSize: '8px',  color: '#446655' },

  // ── 옵션 씬 ────────────────────────────────────────────────────────────────
  optTitle:          { fontFamily: F, fontSize: '20px', color: '#ffffff', letterSpacing: 4 },
  optLabel:          { fontFamily: F, fontSize: '13px', color: '#aaffcc' },
  optValue:          { fontFamily: F, fontSize: '18px', color: '#ffdd00' },
  optBtn:            { fontFamily: F, fontSize: '20px', color: '#ffffff' },
  optLangBtn:        { fontFamily: F, fontSize: '13px', color: '#ffffff' },
  optBackBtn:        { fontFamily: F, fontSize: '13px', color: '#ffffff' },
};
