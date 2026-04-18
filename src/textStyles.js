/**
 * textStyles.js
 * 전체 씬에서 공유하는 Phaser Text 스타일 상수.
 * PressStart2P 픽셀 폰트 기준. 한글은 Arial fallback.
 */

const F = "'PressStart2P', Arial";

// ── 공통 색상 팔레트 ────────────────────────────────────────────────────────
const C = {
  LABEL: '#1a1d1a', // 진한 잉크색 (기존 레이블)
  VALUE: '#1a1d1a', // 진한 잉크색 (기존 수치)
  GOLD: '#4a3a1a', // 진한 갈색/금색 (강조용)
  HP: '#7a2d2d', // 더 진한 핏빛 (체력용)
  STAT: '#1a1d1a', // 진한 잉크색 (스탯용)
  BRIGHT: '#e8e0c8', // 밝은 크림색 (제목/버튼용)
  DARK: '#f0e8d0', // 밝은 배경용 역스트로크 (필요시)
  ORANGE: '#ffaa44', // 어두운 배경에 주황색 표시
};

export const suitColors = { S: '#293c52ff', H: '#893131ff', D: '#d0712dff', C: '#1b4b24ff' };

export const TS = {
  // ── 게임 헤더 / 제목 ────────────────────────────────────────────────────────
  gameTitle: { fontFamily: F, fontSize: '17px', color: C.BRIGHT },
  menuTitle: { fontFamily: F, fontSize: '38px', color: C.BRIGHT, stroke: C.DARK, strokeThickness: 8 },

  // ── 배틀 로그 ──────────────────────────────────────────────────────────────
  log: { fontFamily: F, fontSize: '14px', color: '#ffbb33', stroke: '#000000', strokeThickness: 2 },
  msg: { fontFamily: F, fontSize: '17px', color: '#ffbb33', stroke: '#000000', strokeThickness: 2 },

  // ── 팝업 ──────────────────────────────────────────────
  popupTitle: { fontFamily: F, fontSize: '15px', color: C.LABEL },
  popupContent: { fontFamily: F, fontSize: '14px', color: C.VALUE },

  // ── UI 패널 정보 (PlayerUI 등) ──────────────────────────────────────────────
  infoLabel: { fontFamily: F, fontSize: '12px', color: C.LABEL },
  infoValue: { fontFamily: F, fontSize: '14px', color: C.VALUE },
  goldValue: { fontFamily: F, fontSize: '14px', color: C.GOLD },
  levelValue: { fontFamily: F, fontSize: '17px', color: C.VALUE },

  playerHp: { fontFamily: F, fontSize: '14px', color: C.HP },
  playerDef: { fontFamily: F, fontSize: '14px', color: C.STAT },
  playerAtk: { fontFamily: F, fontSize: '14px', color: C.GOLD },

  // ── 족보 / 카드 정보 ────────────────────────────────────────────────────────
  handRank: { fontFamily: F, fontSize: '11px', color: C.VALUE },
  handMulti: { fontFamily: F, fontSize: '11px', color: C.VALUE },
  comboLabel: { fontFamily: F, fontSize: '16px', color: C.LABEL },
  comboScore: { fontFamily: F, fontSize: '16px', color: C.GOLD },

  // ── 패널 레이블 (FIELD / HAND / ITEMS) ──────────────────────────────────────
  panelLabel: { fontFamily: F, fontSize: '13px', color: C.LABEL, letterSpacing: 4 },

  // ── 버튼 ───────────────────────────────────────────────────────────────────
  sortBtn: { fontFamily: F, fontSize: '13px', color: C.BRIGHT },
  menuBtn: { fontFamily: F, fontSize: '15px', color: C.BRIGHT },
  turnEndBtn: { fontFamily: F, fontSize: '13px', color: C.BRIGHT },

  // ── 몬스터 ─────────────────────────────────────────────────────────────────
  monName: { fontFamily: F, fontSize: '13px', color: C.BRIGHT, stroke: C.DARK, strokeThickness: 2 },
  monStat: { fontFamily: F, fontSize: '12px', color: C.VALUE },
  monHpText: { fontFamily: F, fontSize: '11px', color: '#ffffff', stroke: '#000000', strokeThickness: 2 },
  monStatNum: { fontFamily: F, fontSize: '11px', color: '#ffffff', stroke: '#000000', strokeThickness: 2 },
  monTarget: { fontFamily: F, fontSize: '13px', color: C.GOLD, stroke: '#000000', strokeThickness: 2 },
  monDead: { fontFamily: F, fontSize: '32px', color: C.HP },

  // ── 전투 이펙트 ────────────────────────────────────────────────────────────
  damageHit: { fontFamily: F, fontSize: '20px', color: C.HP, stroke: C.DARK, strokeThickness: 3 },
  damageBlocked: { fontFamily: F, fontSize: '20px', color: C.STAT, stroke: C.DARK, strokeThickness: 3 },

  // ── 시스템 오버레이 (클리어/오버) ─────────────────────────────────────────────
  clearTitle: { fontFamily: F, fontSize: '24px', color: C.LABEL, stroke: C.DARK, strokeThickness: 4 },
  clearSub: { fontFamily: F, fontSize: '17px', color: C.VALUE },
  clearNote: { fontFamily: F, fontSize: '17px', color: C.VALUE },
  gameOverTitle: { fontFamily: F, fontSize: '30px', color: C.HP, stroke: C.DARK, strokeThickness: 5 },
  gameOverScore: { fontFamily: F, fontSize: '26px', color: C.HP },

  // ── 마켓 씬 ────────────────────────────────────────────────────────────────
  marketTitle: { fontFamily: F, fontSize: '22px', color: C.BRIGHT },
  marketSub: { fontFamily: F, fontSize: '12px', color: C.LABEL },

  itemName: { fontFamily: F, fontSize: '12px', color: C.VALUE },
  itemDesc: { fontFamily: F, fontSize: '11px', color: C.VALUE, alpha: 0.8 },
  itemCost: { fontFamily: F, fontSize: '13px', color: C.GOLD },

  // ── 툴팁 ────────────────────────────────────────────────────────────────
  tooltipTxt: { fontFamily: F, fontSize: '13px', color: '#ffffff' },


  // ── 숫자 ────────────────────────────────────────────────────────────────
  countTxt: { fontFamily: F, fontSize: '10px', color: C.ORANGE },
  countTxtDark: { fontFamily: F, fontSize: '10px', color: C.LABEL },
  countTxtBright: { fontFamily: F, fontSize: '10px', color: C.BRIGHT },

  // ── 컬러 ────────────────────────────────────────────────────────────────
  color: C,
};
