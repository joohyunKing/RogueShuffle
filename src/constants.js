// ─── 캔버스 & 카드 크기 ──────────────────────────────────────────────────────
export const GW = 1280;
export const GH = 720;   // 16:9
export const CW = 100;
export const CH = 145;
export const FIELD_CW = Math.round(CW * 0.6);   // 60 — 필드 카드 표시 크기
export const FIELD_CH = Math.round(CH * 0.6);   // 87
export const PILE_CW = Math.round(125);   // 46 — 덱/더미 파일 표시 크기
export const PILE_CH = Math.round(86);   // 67

// ─── 카드 데이터 ──────────────────────────────────────────────────────────────
export const SUITS = ["S", "H", "C", "D"];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const SUIT_ORDER = { S: 0, H: 1, C: 2, D: 3 };


/*
//test 용
export const SUITS = ["S", "H"];
export const RANKS = ["A", "2", "3", "4", "5"];
*/

// ─── hand rank  ──────────────────────────────────────────────────────────────
export const HAND_RANK = {
    FLUSH_FIVE: 13,       // 플러시 파이브 (같은 숫자 5장 + 같은 무늬)
    FLUSH_FULL_HOUSE: 12, // 플러시 풀하우스 (트리플 + 페어 + 5장 모두 같은 무늬)
    FIVE_CARD: 11,        // 파이브카드 (같은 숫자 5장)
    STRAIGHT_FLUSH: 10,
    FOUR_OF_A_KIND: 9,
    FULL_HOUSE: 8,
    FLUSH: 7,
    STRAIGHT: 6,
    TWO_PAIR: 3,
    TRIPLE: 2,
    ONE_PAIR: 1,
    HIGH_CARD: 0
};

export const HAND_DATA = {
    13: { key: "FLUSH_FIVE", multi: 15, aoe: true, enabled: true },
    12: { key: "FLUSH_FULL_HOUSE", multi: 14, aoe: true, enabled: true },
    11: { key: "FIVE_CARD", multi: 12, aoe: true, enabled: true },
    10: { key: "STRAIGHT_FLUSH", multi: 7, aoe: true, enabled: true },
    9: { key: "FOUR_OF_A_KIND", multi: 6, aoe: true, enabled: true },
    8: { key: "FULL_HOUSE", multi: 4, aoe: true, enabled: true },
    7: { key: "FLUSH", multi: 4, aoe: true, enabled: true },
    6: { key: "STRAIGHT", multi: 4, aoe: true, enabled: true },
    3: { key: "TWO_PAIR", multi: 3, aoe: false, enabled: true },
    2: { key: "TRIPLE", multi: 2, aoe: false, enabled: true },
    1: { key: "ONE_PAIR", multi: 2, aoe: false, enabled: true },
    0: { key: "HIGH_CARD", multi: 1, aoe: false, enabled: true },
};


// ─── context ──────────────────────────────────────────────────────────────
export const context = {
    cards: [],           // 선택된 카드
    relics: [],          // 유물 ID 배열
    relicSlots: null,    // 유물 3×3 슬롯 배열 (sideAmplify 등 위치 기반 효과용)
    deckCount: 0,        // deck 남은 카드
    dummyCount: 0,       // dummy 카드
    handRank: 0,         // 족보 랭크
    hp: 0,               // 플레이어 현재 HP (만피 조건용)
    maxHp: 0,            // 플레이어 최대 HP
    handRemainingCount: 0, // 공격에 사용되지 않은 핸드 카드 수 (빈손 조건용)
    handUseCounts: {},     // 족보별 누적 사용 횟수 (성장형 유물용)
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
export const PLAYER_PANEL_W = 260;            // 왼쪽 플레이어 정보 패널 폭
export const ITEM_PANEL_W = 260;            // 오른쪽 아이템 패널 폭

export const BATTLE_LOG_H = 70;
export const MONSTER_AREA_TOP = 80;
export const MONSTER_AREA_H = 315;
export const MONSTER_IMG_Y = 310;             // 몬스터 영역 하단 정렬 (스프라이트 중심)

export const FIELD_Y = 470;                   // 필드 카드 중심  (패널: 408~532)
export const HAND_Y = 625;                   // 핸드 카드 중심  (패널: 535~715)
export const HAND_TOP = HAND_Y - CH / 2 - 18; // 535 — 드롭 판정 기준

export const DEAL_DELAY = 110;

export const DEBUG_MODE = true;
export const SLOW_ANIM = false;

// ─── 전투 시스템 애니메이션 속도 ──────────────────────────────────────────────
export const ANIM_SPEED = {
    orbFlight: SLOW_ANIM ? 440 : 300,     // 구슬 날아가는 시간
    orbFade: SLOW_ANIM ? 220 : 180,       // 구슬 팽창하며 사라지는 시간
    countUp: SLOW_ANIM ? 400 : 230,       // 점수 텍스트 오르는 시간
    queueDelay: SLOW_ANIM ? 300 : 130,    // 다음 애니메이션 전 대기 시간
    pulseCard: SLOW_ANIM ? 250 : 160,     // 카드 반짝임 지속 시간
    mergeScale: SLOW_ANIM ? 500 : 320,    // 베이스×멀티 점수 합쳐질 때 커지는 연출
    mergeDelay: SLOW_ANIM ? 600 : 430     // 연출 후 다음 단계까지 대기 시간
};