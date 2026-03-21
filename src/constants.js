// ─── 캔버스 & 카드 크기 ──────────────────────────────────────────────────────
export const GW = 1280;
export const GH = 720;   // 16:9
export const CW = 100;
export const CH = 145;

// ─── 카드 데이터 ──────────────────────────────────────────────────────────────
export const SUITS      = ["S", "H", "D", "C"];
export const RANKS      = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
export const SUIT_ORDER = { S: 0, H: 1, D: 2, C: 3 };

// ─── 레이아웃 Y 좌표 (GH=720 기준) ───────────────────────────────────────────
//
//   0 ──── 40  : 배틀 로그 바
//  44 ── 256   : 몬스터 영역  (212px)
// 260 ── 298   : 플레이어 스탯 행
// 300 ── 480   : 필드 패널  (FIELD_Y=390, 카드: 390±72)
// 480 ── 660   : 핸드 패널  (HAND_Y=570, 카드: 570±72)
// 662 ── 720   : 하단 버튼 바
//
export const BATTLE_LOG_H     = 40;
export const MONSTER_AREA_TOP = 44;
export const MONSTER_AREA_H   = 212;
export const MONSTER_IMG_Y    = 152;   // MONSTER_AREA_TOP + 108
export const PLAYER_STAT_Y    = 260;

export const FIELD_Y  = 390;                    // 필드 카드 중심  (패널: 300~480)
export const HAND_Y   = 570;                    // 핸드 카드 중심  (패널: 480~660)
export const HAND_TOP = HAND_Y - CH / 2 - 18;  // 480 — 드롭 판정 기준

export const DEAL_DELAY = 110;
