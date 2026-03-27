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


/*
//test 용
export const SUITS = ["S", "H"];
export const RANKS = ["A", "2", "3", "4", "5"];
*/

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
// [플레이어 패널 0~299] | [필드 영역 300~999] | [아이템 패널 1000~1279]
//
//   0 ───  40  : 배틀 로그 바  (필드 영역)
//  44 ── 404   : 몬스터 영역  (360px)
// 408 ── 532   : 필드 패널  (FIELD_Y=470, 카드: 470±44)
// 535 ── 715   : 핸드 패널  (HAND_Y=625, 카드: 625±73)
// 715 ── 720   : 하단 여백
//
export const PLAYER_PANEL_W = 200;            // 왼쪽 플레이어 정보 패널 폭
export const ITEM_PANEL_W   = 200;            // 오른쪽 아이템 패널 폭

export const BATTLE_LOG_H = 40;
export const MONSTER_AREA_TOP = 44;
export const MONSTER_AREA_H = 360;            // 310 → 360 (높이 증가)
export const MONSTER_IMG_Y = 310;             // 몬스터 영역 하단 정렬 (스프라이트 중심)

export const FIELD_Y = 470;                   // 필드 카드 중심  (패널: 408~532)
export const HAND_Y  = 625;                   // 핸드 카드 중심  (패널: 535~715)
export const HAND_TOP = HAND_Y - CH / 2 - 18; // 535 — 드롭 판정 기준

export const DEAL_DELAY = 110;
