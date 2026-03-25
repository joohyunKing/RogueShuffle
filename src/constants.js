// ─── 캔버스 & 카드 크기 ──────────────────────────────────────────────────────
export const GW = 1280;
export const GH = 720;   // 16:9
export const CW = 100;
export const CH = 145;
export const FIELD_CW = Math.round(CW * 0.6);   // 60 — 필드 카드 표시 크기
export const FIELD_CH = Math.round(CH * 0.6);   // 87
export const PILE_CW = Math.round(CW * 0.5);   // 50 — 덱/더미 파일 표시 크기
export const PILE_CH = Math.round(CH * 0.5);   // 73

// ─── 카드 데이터 ──────────────────────────────────────────────────────────────
export const SUITS = ["S", "H", "D", "C"];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const SUIT_ORDER = { S: 0, H: 1, D: 2, C: 3 };

// ─── hand rank  ──────────────────────────────────────────────────────────────
export const HAND_RANK = {
    FIVE_CARD: 9,        // 파이브카드 (같은 숫자 5장)
    STRAIGHT_FLUSH: 8,
    FOUR_OF_A_KIND: 7,
    FULL_HOUSE: 6,
    FLUSH: 5,
    STRAIGHT: 4,
    TWO_PAIR: 3,
    TRIPLE: 2,
    ONE_PAIR: 1,
    HIGH_CARD: 0
};

export const HAND_NAME = {
    9: "FIVE_CARD",
    8: "STRAIGHT_FLUSH",
    7: "FOUR_OF_A_KIND",
    6: "FULL_HOUSE",
    5: "FLUSH",
    4: "STRAIGHT",
    3: "TWO_PAIR",
    2: "TRIPLE",
    1: "ONE_PAIR",
    0: "HIGH_CARD"
};

// ─── context ──────────────────────────────────────────────────────────────
export const context = {
    cards: [],      // 선택된 카드
    relics: [],     //유물
    deckCount: 0,   //deck 남은 카드
    dummyCount: 0,  //dummy 카드
    handRank: 0     //족보 랭크
};

// ─── 레이아웃 (GW=1280, GH=720 기준) ─────────────────────────────────────────
//
// [플레이어 패널 0~199] | [컨텐츠 영역 200~1280]
//
//   0 ───  40  : 배틀 로그 바  (컨텐츠 영역)
//  44 ── 354   : 몬스터 영역  (310px)
// 358 ── 481   : 필드 패널  (FIELD_Y=420, 카드: 420±44)
// 482 ── 690   : 핸드 패널  (HAND_Y=600, 카드: 600±73)
// 690 ── 720   : 하단 여백
//
export const PLAYER_PANEL_W = 200;            // 왼쪽 플레이어 정보 패널 폭

export const BATTLE_LOG_H = 40;
export const MONSTER_AREA_TOP = 44;
export const MONSTER_AREA_H = 310;            // 250 → 310 (플레이어 스탯 행 제거)
export const MONSTER_IMG_Y = 199;            // MONSTER_AREA_TOP + MONSTER_AREA_H/2

export const FIELD_Y = 420;                    // 필드 카드 중심  (패널: 358~481)
export const HAND_Y = 600;                    // 핸드 카드 중심  (패널: 482~690)
export const HAND_TOP = HAND_Y - CH / 2 - 18;  // 509 — 드롭 판정 기준

export const DEAL_DELAY = 110;
