# Rogue Shuffle — CLAUDE.md

## 프로젝트 개요
트럼프 카드 기반 로그라이크 점수 게임.
Phaser 3 + Vite(ES Modules) 구성.

## 기술 스택
- **Phaser 3** (npm install로 설치됨)
- **Vite ^8.0.0** (개발 서버: `npm run dev`)
- **ES Modules** (import/export)
- 캔버스 크기: **1280 × 720** (16:9, `Phaser.Scale.FIT + CENTER_BOTH`)
- **PressStart2P** 픽셀 폰트 (`src/assets/fonts/PressStart2P-Regular.ttf`)
  - `main.js`에서 `FontFace` API로 Phaser 시작 전에 미리 로드
  - 한글은 Arial fallback (`"'PressStart2P', Arial"`)

## 파일 구조
```
src/
  main.js               # FontFace 로드 → Phaser.Game 생성, 씬 등록
  constants.js          # 레이아웃 전용 상수 (GW/GH/CW/CH/FIELD_*/PILE_*/Y좌표 등)
  scoring.js            # 족보 점수 계산 로직 (calcScore)
  levels.js             # 라운드별 게임플레이 수치 (getLevelConfig)
  monsters.js           # 몬스터 종류 4×4 그리드 + TIER_REWARDS + preloadMonsters
  Player.js             # 플레이어 상태 클래스 (hp/xp/gold/level/attrs)
  CardRenderer.js       # Canvas2D API로 런타임 카드 텍스처 생성
  textStyles.js         # Phaser Text 스타일 상수 모음 (TS 객체)
  scenes/
    MainMenuScene.js    # 타이틀 화면 (PLAY / OPTIONS 버튼)
    OptionsScene.js     # 볼륨 · 언어 설정 (registry에 저장)
    GameScene.js        # 메인 플레이 씬
  assets/
    fonts/              # PressStart2P-Regular.ttf
    audio/sfx/          # card-shuffle.ogg, card-fan-1.ogg, card-slide-5.ogg,
                        # card-place-1.ogg, card-place-2.ogg, chop.ogg, knifeSlice.ogg
    images/symbol/      # spade_symbol.jpg, hearts_symbol.jpg,
                        # diamonds_symbol.jpg, clubs_symbol.jpg
public/
  cards/        # 카드 이미지 (사용 안 함 — CardRenderer로 대체됨)
  monster/      # 몬스터 이미지 (skeleton.jpg, zombi.jpg — monsters.js에 등록)
```

## 씬 전환 흐름
```
MainMenuScene → (PLAY)    → GameScene
MainMenuScene → (OPTIONS) → OptionsScene → (BACK) → MainMenuScene
GameScene     → (≡ MENU)  → MainMenuScene
GameScene     → (라운드 클리어) → GameScene { round+1, player.toData() }
GameScene     → (게임오버)     → GameOver 오버레이 → MainMenuScene
```

## 씬 데이터 전달
```js
// 라운드 클리어 시
this.scene.start("GameScene", { round: this.round + 1, player: this.player.toData() });

// GameScene.create()에서 수신
const data = this.scene.settings.data || {};
this.round  = data.round  ?? 1;
this.player = new Player(data.player);  // data.player 없으면 초기값
```

## 설정 저장 (Phaser registry)
| 키 | 기본값 | 설명 |
|----|--------|------|
| `volume` | 7 | 볼륨 (0~10) |
| `lang`   | `"ko"` | 언어 (`"ko"` \| `"en"`) |

---

## 주요 상수 (constants.js)

### 캔버스 & 카드 크기
```js
GW = 1280, GH = 720              // 캔버스 (16:9)
CW = 100,  CH = 145              // 핸드 카드 (100%)
FIELD_CW = 80, FIELD_CH = 116   // 필드 카드 (80%)
PILE_CW  = 50, PILE_CH  = 73    // 덱/더미 파일 (50%)
```

### 레이아웃 Y 좌표 (GH=720 기준)
```
  0 ──  40 : 배틀 로그 바       (BATTLE_LOG_H = 40)
 44 ── 256 : 몬스터 영역        (MONSTER_AREA_TOP=44, MONSTER_AREA_H=212)
256 ── 298 : 플레이어 스탯 행   (PLAYER_STAT_Y = 260)
300 ── 480 : 필드 패널          (FIELD_Y = 390, 카드 중심)
480 ── 660 : 핸드 패널          (HAND_Y = 570, 카드 중심)
662 ── 720 : 하단 버튼 바
```
```js
HAND_TOP   = HAND_Y - CH/2 - 18  // = 480 (드래그 드롭 판정 기준)
DEAL_DELAY = 110                  // 딜링 애니메이션 카드 간 딜레이 (ms)
```

---

## Player 클래스 (Player.js)

### 주요 속성
| 속성 | 설명 |
|------|------|
| `hp / maxHp` | 플레이어 HP |
| `def` | 방어력 |
| `score` | 누적 점수 |
| `xp` | 현재 경험치 |
| `gold` | 골드 |
| `level` | 플레이어 레벨 (1~) |
| `attrs` | 슈트별 레벨 `{ S, H, D, C }` |

### 주요 메서드
```js
getRequiredExp(level)   // 레벨업 필요 경험치: floor((level²+level+14)/2)
player.requiredXp       // getter — getRequiredExp(this.level)
player.addXp(amount)    // XP 추가 + 레벨업 처리 → 새 레벨 배열 반환
player.toData()         // 씬 전환용 직렬화 (plain object)
```

---

## CardRenderer.js
Canvas2D API로 52장 카드 텍스처를 런타임 생성. `scene.textures.addCanvas(key, canvas)` 등록.

> **주의:** `RenderTexture.saveTexture()` + `rt.destroy()` 조합은 텍스처가 까맣게 되는 버그 발생.
> Canvas 방식이 안전한 해결책.

### 메서드
```js
CardRenderer.preload(scene)    // sym_S/H/D/C 심볼 이미지 로드
CardRenderer.createAll(scene)  // 52장 카드 텍스처 일괄 생성
```

### 카드 텍스처 키: `${suit}${rank}` (예: `SA`, `H10`, `DK`)

### 렌더링 방식
- A: 중앙에 심볼 크게 (50px)
- 2~10: `LAYOUTS` pip 좌표 배치 (카드 W/H 비율, y>0.5이면 flip)
- J/Q/K: 컬러 배경 패널 + 대형 랭크 문자 (face card placeholder)
- 좌상단/우하단 모서리: 랭크 텍스트 + 작은 심볼

---

## textStyles.js (TS 객체)
```js
import { TS } from './textStyles.js';
this.add.text(x, y, "text", TS.gameTitle);
```
주요 키: `gameTitle`, `log`, `msg`, `infoLabel`, `infoValue`, `levelValue`,
`playerHp`, `playerDef`, `comboLabel`, `comboScore`, `panelLabel`,
`sortBtn`, `menuBtn`, `turnEndBtn`, `monName`, `monStat`, `monTarget`, `monDead`,
`damageHit`, `damageBlocked`, `clearTitle`, `clearSub`, `clearNote`,
`gameOverTitle`, `gameOverScoreLabel`, `gameOverScore`, `overlayBtn`,
`menuTitle`, `menuSub`, `menuPlayBtn`, `menuOptBtn`, `version`,
`optTitle`, `optLabel`, `optValue`, `optBtn`, `optLangBtn`, `optBackBtn`

---

## monsters.js

### TIER_REWARDS
```js
export const TIER_REWARDS = [
  { xp: [3,  5],  gold: [1, 2] },  // tier 0
  { xp: [5,  10], gold: [3, 4] },  // tier 1
  { xp: [10, 15], gold: [5, 8] },  // tier 2
  { xp: [10, 15], gold: [5, 8] },  // tier 3
];
```

### 주요 함수
```js
getMonstersByTier(tier)           // 티어 몬스터 목록
getAvailableMonstersByTier(tier)  // image != null 인 것만 (없으면 tier 0 fallback)
preloadMonsters(scene)            // spritesheet 로드 (frameWidth:256, frameHeight:341)
```

---

## levels.js
```js
getLevelConfig(round)   // round(1~) → LevelConfig 반환
MAX_DEFINED_LEVEL       // 현재 정의된 최대 라운드 수 (4)
```

| 필드 | 설명 |
|------|------|
| `handSize` | 라운드 시작 시 핸드 배치 수 |
| `handSizeLimit` | 핸드 최대 보유 수 |
| `turnStartDrawLimit` | 턴 시작 시 핸드 보충 최대 수 |
| `fieldSize` | 라운드/턴 시작 시 필드 배치 수 |
| `fieldSizeLimit` | 필드 최대 카드 수 |
| `fieldPickLimit` | 턴당 필드 픽업 가능 수 |
| `monsterCount` | 등장 몬스터 수 (1~3) |
| `monsterTier` | 등장 몬스터 티어 (0~3) |
| `monsterStats` | `{ hp:[min,max], atk:[min,max], def:[min,max] }` |

---

## scoring.js (calcScore)

| 족보 | 조건 | 점수 공식 |
|------|------|-----------|
| 포카드 | 같은 val 4장 | val 합산 × 5 |
| 플러시 | 같은 suit 5장 이상 | 상위 5장 val 합산 × 4 |
| 스트레이트 | 연속 val 5장 이상 | 상위 5장 val 합산 × 4 |
| 트리플 | 같은 val 3장 | val 합산 × 2 |
| 페어 | 같은 val 2장 | val 합산 × 2 |
| 하이카드 | 패턴 없음 | 선택 카드 중 최고 val |

- A=1, J=11, Q=12, K=13
- 여러 패턴 중 **가장 높은 점수 1개** 적용

---

## GameScene — 주요 상태 변수

| 변수 | 설명 |
|------|------|
| `this.round` | 현재 라운드 번호 (게임 진행 회차, 1~) |
| `this.lv` | `getLevelConfig(round)` 결과 |
| `this.player` | `Player` 인스턴스 (hp/xp/gold/level/attrs) |
| `this.handData[]` | 핸드 카드 배열 |
| `this.fieldData[]` | 필드 카드 배열 (각 카드에 `slotX` 포함) |
| `this.deckData[]` | 남은 덱 |
| `this.dummyData[]` | 버린 카드 더미 |
| `this.monsters[]` | 몬스터 배열 `{type, hp, maxHp, atk, def, xp, gold, isDead}` |
| `this.selected` | Set — 핸드 선택 인덱스 |
| `this.fieldPickCount` | 이번 턴 필드 픽 횟수 |
| `this.isDealing` | 딜링/애니메이션 중 인터랙션 차단 여부 |
| `this.sortMode` | `'suit'` \| `'rank'` \| `null` |
| `this.sortAsc` | 정렬 방향 (boolean) |
| `this.cardObjs[]` | 렌더 시마다 재생성 (카드 게임오브젝트) |
| `this.monsterObjs[]` | 렌더 시마다 재생성 (몬스터 UI) |
| `this.animObjs[]` | 딜링 애니메이션 전용 |
| `this.battleLogLines[]` | 배틀 로그 줄들 |

## GameScene — 턴 흐름
```
create() → startDealAnimation() → render()
  ↓ 플레이어 행동 (반복 가능)
  - 필드 카드 드래그 → 핸드로 (fieldPickCount < fieldPickLimit)
  - 핸드 카드 클릭 → 선택/해제 → 족보 프리뷰
  - 몬스터 클릭 (족보 있을 때) → attackMonster() → 카드 소모
  ↓ 턴종료 클릭
  onTurnEnd() → 몬스터 반격 → 게임오버 or startTurn()
  startTurn() → 핸드 보충 + 필드 교체 → render()
```

## GameScene — 렌더 방식
- `render()` 호출 시 `cardObjs` 전체 destroy 후 재생성
- UI 요소(버튼, 텍스트)는 `create()`에서 한 번만 생성 — `cardObjs`에 넣지 않음
- 정렬 버튼도 한 번만 생성, `refreshSortBtns()`로 상태만 갱신
- `refreshPlayerStats()` / `refreshPlayerLevel()` 로 UI 텍스트 갱신

## GameScene — 카드 크기 정책
- 핸드 카드: `CW × CH` (100×145)
- 필드 카드: `FIELD_CW × FIELD_CH` (80×116), `slotX`로 고정 슬롯 배치
- 덱/더미 파일: `PILE_CW × PILE_CH` (50×73), hover 시 개수 tooltip

## GameScene — 드래그 동작
- `dragstart`: 카드 90%로 축소 (`CW*0.9, CH*0.9`)
- `drop` (핸드 패널 위): 삽입 위치 탐지 후 `handData` splice
- `dragend` (핸드 밖): `_snapBack()` → origW/origH로 복원

## GameScene — 더미 fly 애니메이션
- `_flyToDummy(cardObjs)`: 카드들을 `(GW-80, FIELD_Y)`로 tween
- 420ms 딜레이 후 `startTurn()` 호출

---

## 개발 서버
```bash
cd C:/Users/rundo/Rogue-Shuffle
npm run dev   # http://localhost:5173
```

## GitHub 저장소
https://github.com/joohyunKing/RogueShuffle
