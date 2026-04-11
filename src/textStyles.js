/**
 * textStyles.js
 * 전체 씬에서 공유하는 Phaser Text 스타일 상수.
 * PressStart2P 픽셀 폰트 기준. 한글은 Arial fallback.
 */

const F = "'PressStart2P', Arial";

export const TS = {
  // ── 게임 헤더 ──────────────────────────────────────────────────────────────
  gameTitle:         { fontFamily: F, fontSize: '17px', color: '#ffffff' },

  // ── 배틀 로그 ──────────────────────────────────────────────────────────────
  log:               { fontFamily: F, fontSize: '14px', color: '#ffcc44', stroke: '#0a1a10', strokeThickness: 2 },
  msg:               { fontFamily: F, fontSize: '17px', color: '#ffcc44', stroke: '#1a472a', strokeThickness: 3 },

  // ── 몬스터 영역 정보 ────────────────────────────────────────────────────────
  infoLabel:         { fontFamily: F, fontSize: '12px', color: '#5fad6d' },
  infoValue:         { fontFamily: F, fontSize: '14px', color: '#aabbaa' },
  levelValue:        { fontFamily: F, fontSize: '17px', color: '#aaffcc' },

  // ── 플레이어 스탯 ──────────────────────────────────────────────────────────
  playerHp:          { fontFamily: F, fontSize: '14px', color: '#ff9999' },
  playerDef:         { fontFamily: F, fontSize: '14px', color: '#88ccff' },

  handRank:           { fontFamily: F, fontSize: '11px', color: '#aaccaa'  },
  handMulti:           { fontFamily: F, fontSize: '11px', color: '#ffdd44'  },

  // ── 족보 프리뷰 ────────────────────────────────────────────────────────────
  comboLabel:        { fontFamily: F, fontSize: '16px', color: '#88ffaa' },
  comboScore:        { fontFamily: F, fontSize: '16px', color: '#ffdd66' },

  // ── 패널 레이블 (FIELD / HAND) ─────────────────────────────────────────────
  panelLabel:        { fontFamily: F, fontSize: '13px', color: '#5fad6d', letterSpacing: 4 },

  // ── 정렬 버튼 ──────────────────────────────────────────────────────────────
  sortBtn:           { fontFamily: F, fontSize: '14px', color: '#aaffcc' },

  // ── 하단 버튼 ──────────────────────────────────────────────────────────────
  menuBtn:           { fontFamily: F, fontSize: '15px', color: '#ffffff' },
  turnEndBtn:        { fontFamily: F, fontSize: '15px', color: '#ffffff' },

  // ── 몬스터 ─────────────────────────────────────────────────────────────────
  monName:           { fontFamily: F, fontSize: '13px', color: '#ffffff', stroke: '#000000', strokeThickness: 2 },
  monStat:           { fontFamily: F, fontSize: '12px', color: '#cccccc' },
  monHpText:         { fontFamily: F, fontSize: '11px', color: '#ffffff', stroke: '#000000', strokeThickness: 2 },
  monStatNum:        { fontFamily: F, fontSize: '11px', stroke: '#000000', strokeThickness: 2 },
  monTarget:         { fontFamily: F, fontSize: '13px', color: '#ffdd44', stroke: '#000000', strokeThickness: 2 },
  monDead:           { fontFamily: F, fontSize: '32px', color: '#cc2222' },

  // ── 전투 이펙트 ────────────────────────────────────────────────────────────
  damageHit:         { fontFamily: F, fontSize: '20px', color: '#ff5555', stroke: '#000000', strokeThickness: 3 },
  damageBlocked:     { fontFamily: F, fontSize: '20px', color: '#88ccff', stroke: '#000000', strokeThickness: 3 },

  // ── 라운드 클리어 오버레이 ──────────────────────────────────────────────────
  clearTitle:        { fontFamily: F, fontSize: '24px', color: '#44ff88', stroke: '#000000', strokeThickness: 4 },
  clearSub:          { fontFamily: F, fontSize: '17px', color: '#aaffcc' },
  clearNote:         { fontFamily: F, fontSize: '14px', color: '#88bb99' },

  // ── 게임 오버 오버레이 ──────────────────────────────────────────────────────
  gameOverTitle:     { fontFamily: F, fontSize: '30px', color: '#ff4444', stroke: '#000000', strokeThickness: 5 },
  gameOverScoreLabel:{ fontFamily: F, fontSize: '17px', color: '#88bb99' },
  gameOverScore:     { fontFamily: F, fontSize: '26px', color: '#ffdd00' },
  overlayBtn:        { fontFamily: F, fontSize: '17px', color: '#ffffff' },

  // ── 메인 메뉴 ──────────────────────────────────────────────────────────────
  menuTitle:         { fontFamily: F, fontSize: '38px', color: '#ffffff', stroke: '#0a2a14', strokeThickness: 8 },
  menuSub:           { fontFamily: F, fontSize: '15px', color: '#88bb99' },
  menuPlayBtn:       { fontFamily: F, fontSize: '20px', color: '#ffffff' },
  menuOptBtn:        { fontFamily: F, fontSize: '17px', color: '#aaffcc' },
  version:           { fontFamily: F, fontSize: '12px', color: '#446655' },

  // ── 옵션 씬 ────────────────────────────────────────────────────────────────
  optTitle:          { fontFamily: F, fontSize: '24px', color: '#ffffff', letterSpacing: 4 },
  optLabel:          { fontFamily: F, fontSize: '17px', color: '#aaffcc' },
  optValue:          { fontFamily: F, fontSize: '22px', color: '#ffdd00' },
  optBtn:            { fontFamily: F, fontSize: '24px', color: '#ffffff' },
  optLangBtn:        { fontFamily: F, fontSize: '17px', color: '#ffffff' },
  optBackBtn:        { fontFamily: F, fontSize: '17px', color: '#ffffff' },

  // ── 마켓 씬 ────────────────────────────────────────────────────────────────
  marketTitle:       { fontFamily: F, fontSize: '22px', color: '#44ffaa' },
  marketSub:         { fontFamily: F, fontSize: '12px', color: '#88cc88' },
  marketContinue:    { fontFamily: F, fontSize: '16px', color: '#aaffcc' },

  // ── 아이템 카드 ────────────────────────────────────────────────────────────
  itemName:          { fontFamily: F, fontSize: '12px', color: '#aaffaa' },
  itemDesc:          { fontFamily: F, fontSize: '11px', color: '#cccccc' },
  itemCost:          { fontFamily: F, fontSize: '13px', color: '#ffdd44' },
  itemCostNA:        { fontFamily: F, fontSize: '13px', color: '#ff4444' },
  itemBuy:           { fontFamily: F, fontSize: '12px', color: '#aaffcc' },
  itemBought:        { fontFamily: F, fontSize: '12px', color: '#666666' },

  // ── 팝업 공통 ──────────────────────────────────────────────────────────────
  popupTitle:        { fontFamily: F, fontSize: '15px', color: '#ccffcc' },
  popupClose:        { fontFamily: F, fontSize: '14px', color: '#aaffaa' },
  logPopupTitle:     { fontFamily: F, fontSize: '17px', color: '#44ffaa' },
};
