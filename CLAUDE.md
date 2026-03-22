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
  scoring.js            # 족보 점수 계산 로직 (calcScore) — { score, label, cards } 반환
  levels.js             # 라운드별 게임플레이 수치 (getLevelConfig)
  monsters.js           # 몬스터 종류 4×4 그리드 + 스프라이트 애니메이션 정의
  save.js               # localStorage 세이브/로드 유틸 (hasSave/loadSave/writeSave/deleteSave)
  Player.js             # 플레이어 상태 클래스 (hp/xp/gold/level/attrs)
  CardRenderer.js       # Canvas2D API로 런타임 카드 텍스처 생성
  textStyles.js         # Phaser Text 스타일 상수 모음 (TS 객체)
  scenes/
    MainMenuScene.js    # 타이틀 화면 (NEW GAME / CONTINUE / OPTIONS)
    OptionsScene.js     # BGM·SFX 볼륨 · 언어 설정 (registry에 저장)
    GameScene.js        # 메인 플레이 씬
  assets/
    fonts/              # PressStart2P-Regular.ttf
    audio/sfx/          # card-shuffle.ogg, card-fan-1.ogg, card-slide-5.ogg,
                        # card-place-1.ogg, chop.ogg, knifeSlice.ogg
    images/
      symbol/           # spade_symbol.jpg, hearts_symbol.jpg,
                        # diamonds_symbol.jpg, clubs_symbol.jpg
      monster/          # skeleton.png, zombi.png, goblin.png, werewolf.png
                        # (1024×1024, 4col×3row spritesheet — PNG, Vite static import)
public/
  cards/        # 카드 이미지 (사용 안 함 — CardRenderer로 대체됨)
```

## 씬 전환 흐름
```
MainMenuScene → (NEW GAME) → GameScene (세이브 있을 때는 기존 세이브 삭제)
MainMenuScene → (CONTINUE) → GameScene { round, player } (세이브 데이터 로드)
MainMenuScene → (OPTIONS)  → OptionsScene → (BACK) → MainMenuScene
GameScene     → (OPTIONS 오버레이) → CLOSE → GameScene 복귀
GameScene     → (OPTIONS 오버레이) → MAIN MENU → 세이브 후 MainMenuScene
GameScene     → (라운드 클리어) → 자동 세이브(round+1) → GameScene { round+1, player }
GameScene     → (게임오버)     → 세이브 삭제 → GameOver 오버레이 → MainMenuScene
```

## 세이브 시스템 (save.js)
- `localStorage` 키: `"rogueShuffle_save"`
- 포맷: `{ round: number, player: PlayerData }`
- **자동 저장**: 라운드 클리어 시 `writeSave(round+1, player.toData())`
- **저장 후 이동**: 인게임 OPTIONS → MAIN MENU 클릭 시 현재 상태 저장
- **삭제**: 게임오버 시 `deleteSave()`
- **NEW GAME**: 기존 세이브 삭제 후 새 게임 시작

## 씬 데이터 전달
```js
// 라운드 클리어 / CONTINUE 시
this.scene.start("GameScene", { round: this.round + 1, player: this.player.toData() });

// GameScene.create()에서 수신
const data = this.scene.settings.data || {};
this.round  = data.round  ?? 1;
this.player = new Player(data.player);  // data.player 없으면 초기값
```

## 설정 저장 (Phaser registry)
| 키 | 기본값 | 설명 |
|----|--------|------|
| `bgmVolume` | 7 | BGM 볼륨 (0~10) |
| `sfxVolume` | 7 | SFX 볼륨 (0~10) |
| `lang`      | `"ko"` | 언어 (`"ko"` \| `"en"`) |

- SFX 재생: `_sfx(key)` — `sfxVolume / 10 × 0.6` 적용
- BGM 사운드는 미구현 (registry 키만 준비됨)

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

### MONSTER_ANIMS (스프라이트시트 구성 1024×1024, 4col×3row)
```js
export const MONSTER_ANIMS = {
  idle:   { start: 0,  end: 3,  frameRate: 8,  repeat: -1 },  // Row 0
  attack: { start: 4,  end: 7,  frameRate: 10, repeat: 0  },  // Row 1
  death:  { start: 8,  end: 11, frameRate: 8,  repeat: 0  },  // Row 2
};
```

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
createMonsterAnims(scene)         // idle/attack/death 애니메이션 등록 (씬 재시작 안전)
```

### 몬스터 이미지
- `src/assets/images/monster/` 하위 PNG 파일
- Vite static import (`import skeletonUrl from './assets/images/monster/skeleton.png'`)
- `m.image` 필드에 import된 URL이 직접 저장됨

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

반환값: `{ score: number, label: string, cards: CardObj[] }`
`cards` — 족보를 구성하는 카드 객체 배열 (진동 효과 등에 활용)

| 족보 | 조건 | 점수 공식 |
|------|------|-----------|
| 포카드 | 같은 val 4장 | val 합산 × 5 |
| 플러시 | 같은 suit 5장 이상 | 상위 5장 val 합산 × 4 |
| 스트레이트 | 연속 val 5장 이상 | 상위 5장 val 합산 × 4 |
| 트리플 | 같은 val 3장 | val 합산 × 2 |
| 페어 | 같은 val 2장 | val 합산 × 2 |
| 하이카드 | 패턴 없음 | 선택 카드 중 최고 val |

- A=14(스트레이트에서 A-로우는 1로도 처리), J=11, Q=12, K=13
- 여러 패턴 중 **가장 높은 점수 1개** 적용

---

## GameScene — 주요 상태 변수

| 변수 | 설명 |
|------|------|
| `this.round` | 현재 라운드 번호 (1~) |
| `this.lv` | `getLevelConfig(round)` 결과 |
| `this.player` | `Player` 인스턴스 |
| `this.handData[]` | 핸드 카드 배열 |
| `this.fieldData[]` | 필드 카드 배열 (각 카드에 `slotX` 포함) |
| `this.deckData[]` | 남은 덱 |
| `this.dummyData[]` | 버린 카드 더미 |
| `this.monsters[]` | 몬스터 배열 `{type, hp, maxHp, atk, def, xp, gold, isDead, deathAnimDone}` |
| `this.selected` | Set — 핸드 선택 인덱스 |
| `this.fieldPickCount` | 이번 턴 필드 픽 횟수 |
| `this.attackCount` | 이번 턴 공격 횟수 |
| `this.isDealing` | 애니메이션 중 인터랙션 차단 여부 |
| `this.sortMode` | `'suit'` \| `'rank'` \| `null` |
| `this.sortAsc` | 정렬 방향 (boolean) |
| `this.cardObjs[]` | 렌더 시마다 재생성 (카드 게임오브젝트) |
| `this.monsterObjs[]` | 렌더 시마다 재생성 (몬스터 UI — HP바, 텍스트 등) |
| `this._monsterSprites[]` | 렌더 시마다 재생성 (몬스터 스프라이트 본체, index=몬스터idx) |
| `this.animObjs[]` | 딜링 애니메이션 전용 |
| `this._optOverlayObjs` | 인게임 OPTIONS 오버레이 오브젝트 배열 (null이면 미표시) |
| `this.battleLogLines[]` | 배틀 로그 줄들 |

## GameScene — 턴 흐름
```
create() → startDealAnimation() → render()
  ↓ 플레이어 행동 (반복 가능)
  - 필드 카드 드래그 → 핸드로 (fieldPickCount < fieldPickLimit)
  - 핸드 카드 클릭 → 선택/해제 → 족보 프리뷰 + 족보 카드 진동
  - 몬스터 클릭 (족보 있을 때) → attackMonster()
      → 카드가 몬스터를 향해 날아가며 50%로 축소 → dummy로 이동
      → 몬스터 attack 애니메이션 (400ms) → _afterAttack()
  ↓ 턴종료 클릭
  onTurnEnd() → 몬스터 반격 → 게임오버 or startTurn()
  startTurn() → 핸드 보충 + 필드 교체 → render()
```

## GameScene — 렌더 방식
- `render()` 호출 시 `cardObjs` + `monsterObjs` + `_monsterSprites` 전체 destroy 후 재생성
- UI 요소(버튼, 텍스트)는 `create()`에서 한 번만 생성
- `refreshPlayerStats()` / `refreshPlayerLevel()` 로 UI 텍스트 갱신

## GameScene — 몬스터 렌더 및 애니메이션
- 살아있는 몬스터: `idle` 애니메이션 루프
- 사망 몬스터:
  - `mon.deathAnimDone === false`: `death` 애니메이션 1회 재생 후 플래그 설정
    (animationcomplete 이벤트 + 600ms fallback 타이머로 이중 보호)
  - `mon.deathAnimDone === true`: 마지막 프레임(11) 고정 표시
- 공격 시: `_monsterSprites[monIdx]`에 `attack` 애니메이션 재생 (400ms, `isDealing=true`)

## GameScene — 카드 크기 정책
- 핸드 카드: `CW × CH` (100×145)
- 필드 카드: `FIELD_CW × FIELD_CH` (80×116), `slotX`로 고정 슬롯 배치
- 덱/더미 파일: `PILE_CW × PILE_CH` (50×73), hover 시 개수 tooltip

## GameScene — 드래그 동작
- `dragstart`: 카드 90%로 축소 (`CW*0.9, CH*0.9`)
- `drop` (핸드 패널 위): 삽입 위치 탐지 후 `handData` splice
- `dragend` (핸드 밖): `_snapBack()` → origW/origH로 복원

## GameScene — 카드 애니메이션
- `_flyToDummy(fromX, fromY, key)`: 필드 교체 시 카드를 `(GW-80, FIELD_Y)`로 날림 (380ms)
- `_throwCardAtMonster(fromX, fromY, key, monX)`: 공격 카드 애니메이션
  - 핸드 → 몬스터 위치 (280ms, CW×0.5로 축소)
  - 몬스터 → dummy 파일 (220ms, 페이드아웃)

## GameScene — 핸드 UX
- 선택 카드: 22px 위로 올라감 (노란 테두리 없음)
- 족보 구성 카드만 x축 진동 tween (repeat: -1, 카드 파괴 시 자동 중단)
- 족보 없는 선택 카드: 위치만 올라가고 진동 없음

## GameScene — OPTIONS 오버레이
- 하단 OPTIONS 버튼 클릭 시 `_showOptions()` 호출 (isDealing 이전 상태 보존)
- BGM 볼륨, SFX 볼륨 조절 (registry 즉시 반영)
- MAIN MENU: 현재 상태 세이브 후 MainMenuScene 이동
- CLOSE: 오버레이 제거 후 게임 복귀
- 씬 재시작 시 `_optOverlayObjs = null` 초기화 (재진입 시 오버레이 정상 작동)

---

## 개발 서버
```bash
cd C:/Users/rundo/Rogue-Shuffle
npm run dev   # http://localhost:5173
```

## GitHub 저장소
https://github.com/joohyunKing/RogueShuffle
