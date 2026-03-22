// ─── 캔버스 & 카드 크기 ──────────────────────────────────────────────────────
export const GW = 1280;
export const GH = 720;   // 16:9
export const CW = 100;
export const CH = 145;
export const FIELD_CW = Math.round(CW * 0.6);   // 60 — 필드 카드 표시 크기
export const FIELD_CH = Math.round(CH * 0.6);   // 87
export const PILE_CW  = Math.round(CW * 0.5);   // 50 — 덱/더미 파일 표시 크기
export const PILE_CH  = Math.round(CH * 0.5);   // 73

// ─── 카드 데이터 ──────────────────────────────────────────────────────────────
export const SUITS      = ["S", "H", "D", "C"];
export const RANKS      = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
export const SUIT_ORDER = { S: 0, H: 1, D: 2, C: 3 };

// ─── 레이아웃 Y 좌표 (GH=720 기준) ───────────────────────────────────────────
//
//   0 ──── 40  : 배틀 로그 바
//  44 ── 294   : 몬스터 영역  (250px)
// 298 ── 355   : 플레이어 스탯 행
// 358 ── 481   : 필드 패널  (FIELD_Y=420, 카드: 420±44)
// 482 ── 690   : 핸드 패널  (HAND_Y=600, 카드: 600±73)
// 690 ── 720   : 하단 여백
//
export const BATTLE_LOG_H     = 40;
export const MONSTER_AREA_TOP = 44;
export const MONSTER_AREA_H   = 250;
export const MONSTER_IMG_Y    = 169;   // MONSTER_AREA_TOP + MONSTER_AREA_H/2
export const PLAYER_STAT_Y    = 310;

export const FIELD_Y  = 420;                    // 필드 카드 중심  (패널: 358~481)
export const HAND_Y   = 600;                    // 핸드 카드 중심  (패널: 482~690)
export const HAND_TOP = HAND_Y - CH / 2 - 18;  // 509 — 드롭 판정 기준

export const DEAL_DELAY = 110;
