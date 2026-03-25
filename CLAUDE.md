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
  save.js               # localStorage 세이브/로드 유틸 (hasSave/loadSave/writeSave/deleteSave)
  CardRenderer.js       # Canvas2D API로 런타임 카드 텍스처 생성
  textStyles.js         # Phaser Text 스타일 상수 모음 (TS 객체)
  data/
    monster.json        # 몬스터 데이터 (name/tier/race/hp/atk/def/cost/sprite)
    relic.json          # 유물 데이터 (id/name/description/rarity/effects)
    round.json          # 라운드 데이터 (rounds[]: round/normalCount/monsterTier/totalCost/boss)
  manager/
    roundManager.js     # RoundManager 클래스 (라운드/배틀 순서 관리, getNextBattle 등)
    playerManager.js    # Player 클래스 + getRequiredExp (hp/xp/gold/level/attrs/job/adaptability 등)
  scenes/
    MainMenuScene.js    # 타이틀 화면 (NEW GAME / CONTINUE / OPTIONS)
    OptionsScene.js     # BGM·SFX 볼륨 · 언어 설정 (registry에 저장)
    GameScene.js        # 메인 플레이 씬
  service/
    cardService.js    # 카드 컨트롤 (생성 / 복사 / 삭제 / 추가 등)
    monsterService.js           # 몬스터 데이터 관리 (monster.json 기반, 스프라이트 애니메이션)
    scoreService.js            # 족보 점수 계산 로직  반환
  assets/
    fonts/              # PressStart2P-Regular.ttf
    audio/sfx/          # card-shuffle.ogg, card-fan-1.ogg, card-slide-5.ogg,
                        # card-place-1.ogg, chop.ogg, knifeSlice.ogg
    images/
      symbol/           # spade_symbol.jpg, hearts_symbol.jpg,
                        # diamonds_symbol.jpg, clubs_symbol.jpg
      monster/          # skeleton.png, zombi.png, goblin.png, werewolf.png, golem.png
                        # (1024×1024, 4col×3row spritesheet — PNG, Vite glob import)
      ui/               # 버튼용 이미지 (임시 미사용 — 현재 텍스트 버튼으로 대체)
public/

```

## 씬 전환 흐름
```
MainMenuScene → (NEW GAME) → GameScene {} (세이브 삭제 후 빈 데이터로 시작)
MainMenuScene → (CONTINUE) → GameScene { round, player } (세이브 데이터 로드)
MainMenuScene → (OPTIONS)  → OptionsScene → (BACK) → MainMenuScene
GameScene     → (OPT 오버레이) → CLOSE → GameScene 복귀
GameScene     → (OPT 오버레이) → MAIN MENU → 세이브 후 MainMenuScene
GameScene     → (라운드 클리어) → 자동 세이브(round+1) → GameScene { round+1, player }
GameScene     → (게임오버)     → 세이브 삭제 → GameOver 오버레이 → MainMenuScene
```

> **주의:** NEW GAME 시 반드시 `scene.start("GameScene", {})` 로 빈 객체를 전달해야 함.
> `scene.start("GameScene")` (data 없음)은 Phaser가 이전 settings.data를 유지해 버그 발생.

## 세이브 시스템 (save.js)
- `localStorage` 키: `"rogueShuffle_save"`
- 포맷: `{ round: number, player: PlayerData }`
- **자동 저장**: 라운드 클리어 시 `writeSave(round+1, player.toData())`
- **저장 후 이동**: 인게임 OPT → MAIN MENU 클릭 시 현재 상태 저장
- **삭제**: 게임오버 시 `deleteSave()`
- **NEW GAME**: 기존 세이브 삭제 후 `scene.start("GameScene", {})` 로 새 게임 시작

## 씬 데이터 전달
```js
// 라운드 클리어 / CONTINUE 시
this.scene.start("GameScene", { round: this.round + 1, player: this.player.toData() });

// GameScene.create()에서 수신
const data = this.scene.settings.data || {};
const startRound = data.round ?? 1;
this.roundManager = new RoundManager(roundData, startRound);
this.round = this.roundManager.getRound();
this.player = new Player(data.player);  // levelConfig 인자 없이 Player 내부 기본값 사용
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
FIELD_CW = 60, FIELD_CH = 87    // 필드 카드 (60%)
PILE_CW  = 50, PILE_CH  = 73    // 덱/더미 파일 (50%)
SUITS = ["S","H","D","C"]        // 슈트 배열
RANKS = ["A","2",...,"K"]        // 랭크 배열
SUIT_ORDER = { S:0, H:1, D:2, C:3 }
```

### 족보 랭크 (HAND_RANK / HAND_NAME)
```js
HAND_RANK = { FIVE_CARD:9, STRAIGHT_FLUSH:8, FOUR_OF_A_KIND:7,
              FULL_HOUSE:6, FLUSH:5, STRAIGHT:4,
              TWO_PAIR:3, TRIPLE:2, ONE_PAIR:1, HIGH_CARD:0 }
HAND_NAME = { 9:"FIVE_CARD", 8:"STRAIGHT_FLUSH", ..., 0:"HIGH_CARD" }
```

### 점수 계산 컨텍스트 (context)
```js
export const context = {
  cards: [],      // 선택된 카드
  relics: [],     // 유물 ID 배열
  deckCount: 0,   // 덱 남은 카드 수
  dummyCount: 0,  // dummy 카드 수
  handRank: 0     // 족보 랭크
};
// GameScene에서 공격 전 deckCount/dummyCount 갱신 후 calculateScore()에 전달
```

### 레이아웃 (GW=1280, GH=720 기준)
```
[플레이어 패널 0~199px] | [컨텐츠 영역 200~1280px]

  0 ──  40 : 배틀 로그 바       (BATTLE_LOG_H = 40)
 44 ── 354 : 몬스터 영역        (MONSTER_AREA_TOP=44, MONSTER_AREA_H=310)
358 ── 481 : 필드 패널          (FIELD_Y = 420, 카드 중심)
482 ── 690 : 핸드 패널          (HAND_Y = 600, 카드 중심)
690 ── 720 : 하단 여백

플레이어 패널 (좌측 200px): JOB / ROUND / GOLD / LV / XP바 / HP / DEF / 슈트 레벨(♠♥♦♣)
```
```js
PLAYER_PANEL_W = 200             // 왼쪽 플레이어 정보 패널 폭
MONSTER_IMG_Y = 199              // 몬스터 스프라이트 중심 Y
HAND_TOP      = HAND_Y - CH/2 - 18  // ≈509 (드래그 드롭 판정 기준)
DEAL_DELAY    = 110              // 딜링 애니메이션 카드 간 딜레이 (ms)
```

---

## Player 클래스 (manager/playerManager.js)

### 주요 속성
| 속성 | 설명 |
|------|------|
| `hp / maxHp` | 플레이어 HP |
| `def` | 방어력 (라운드 클리어 시 0으로 리셋) |
| `score` | 누적 점수 |
| `xp` | 현재 경험치 |
| `gold` | 골드 |
| `level` | 플레이어 레벨 (1~) |
| `attacksPerTurn` | 턴당 공격 가능 횟수 |
| `attrs` | 슈트별 레벨 `{ S, H, D, C }` — 레벨업 시 suit 선택 팝업으로 증가 |
| `job` | 직업 (default: `"Magician"`) |
| `adaptability` | 슈트별 적응도 `{ S, H, D, C }` (default: 각 `1.0` = 100%) |
| `handSize` | 라운드 시작 시 핸드 배치 수 (Player 생성자 내부 기본값, 버프로 변경 가능) |
| `handSizeLimit` | 핸드 최대 보유 수 |
| `turnStartDrawLimit` | 턴 시작 시 핸드 보충 최대 수 |
| `fieldSize` | 라운드/턴 시작 시 필드 배치 수 |
| `fieldSizeLimit` | 필드 최대 카드 수 |
| `fieldPickLimit` | 턴당 필드에서 픽업 가능한 카드 수 |

### suit 적응 효과 (공격 시 자동 적용)
`적응 수치 = floor(attrs[suit] × adaptability[suit] × 해당 suit 카드 수)`
- **♠ Spade**: 공격 대상 몬스터 DEF 감소 (음수 가능 → 데미지 보너스)
- **♥ Hearts**: 플레이어 HP 회복
- **♦ Diamonds**: 플레이어 DEF 추가
- **♣ Clubs**: 공격 대상 몬스터 ATK 감소 (최소 0)

### 주요 메서드
```js
getRequiredExp(level)    // 레벨업 필요 경험치: floor((level²+level+14)/2) — 모듈 export
player.requiredXp        // getter — getRequiredExp(this.level)
player.addXp(amount)     // XP 추가 + 레벨업 처리 → 새 레벨 배열 반환
player.toData()          // 씬 전환용 직렬화 (plain object)
new Player(data)         // data 없으면 내부 기본값 사용 (levelConfig 인자 제거됨)
```

---

## CardRenderer.js
Canvas2D API로 52장 카드 텍스처를 런타임 생성. `scene.textures.addCanvas(key, canvas)` 등록.

> **주의:** `RenderTexture.saveTexture()` + `rt.destroy()` 조합은 텍스처가 까맣게 되는 버그 발생.
> Canvas 방식이 안전한 해결책.
> 씬 재시작 시 `scene.textures.exists(key)` 체크 후 중복 등록 방지.

### 메서드
```js
CardRenderer.preload(scene)    // sym_S/H/D/C 심볼 이미지 로드
CardRenderer.createAll(scene)  // 52장 카드 텍스처 일괄 생성 (중복 등록 방지)
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

## service/monsterService.js

### 데이터 소스
- `src/data/monster.json` — 몬스터 정의 (name/tier/race/hp/atk/def/cost/sprite)
- `import.meta.glob('../assets/images/monster/*.png', { eager:true, query:'?url' })` 로 이미지 수집
- `MONSTER_GRID[tier][]` — tier 기준 자동 분류 (tier 값이 아무리 커도 동적 확장)

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
                                  // tier는 숫자 또는 숫자 배열 모두 가능
preloadMonsters(scene)            // spritesheet 로드 (frameWidth:256, frameHeight:341)
createMonsterAnims(scene)         // idle/attack/death 애니메이션 등록 (씬 재시작 안전)
```

---


## RoundManager (manager/roundManager.js)

라운드별 일반/보스 배틀 순서를 관리합니다. `src/data/round.json` 기반.

```js
new RoundManager(roundData, startRound)   // roundData = round.json import
roundManager.getRound()                   // 현재 라운드 번호
roundManager.setRound(round)              // 라운드 설정 (battleIndex 리셋)
roundManager.startNextRound()             // 다음 라운드로 이동
roundManager.getCurrentRoundData()        // 현재 라운드 JSON 데이터
roundManager.getNextBattle()              // 다음 배틀 정보 { type, tier, cost } — null이면 라운드 종료
```

### round.json 구조
```json
{ "rounds": [
  { "round": 1, "normalCount": 3,
    "monsterTier": [1], "totalCost": 5,
    "boss": { "monsterTier": [2], "totalCost": 10 }
  }, ...
]}
```

`totalCost`가 `[min, max]` 배열인 경우 `_buildMonsterGroup`에서 예산으로 마리 수 결정 (최소 1, 최대 5).

---

## service/scoreService.js (calculateScore)

```js
calculateScore(cards, context)
// 반환값: { rank: number, handName: string, score: number, cards: CardObj[] }
// cards — 족보를 구성하는 카드 객체 배열 (진동 효과 등에 활용)
// context — constants.js의 context 객체 (relics, deckCount 등)
```

### 족보 판별 우선순위 (높음 → 낮음)
| 족보 | HAND_RANK | 조건 |
|------|-----------|------|
| 파이브카드 | 9 | 같은 val 5장 |
| 스트레이트 플러시 | 8 | 같은 suit 스트레이트 5장 |
| 포카드 | 7 | 같은 val 4장 |
| 풀하우스 | 6 | 3장 + 2장 |
| 플러시 | 5 | 같은 suit 5장 이상 |
| 스트레이트 | 4 | 연속 val 5장 이상 |
| 투페어 | 3 | 페어 2개 |
| 트리플 | 2 | 같은 val 3장 |
| 원페어 | 1 | 같은 val 2장 |
| 하이카드 | 0 | 패턴 없음 |

- A=14(스트레이트에서 A-로우는 1로도 처리), J=11, Q=12, K=13
- 점수 = 족보 카드의 `baseScore` 합산 (A=11, J/Q/K=10, 숫자=face value)

### 유물(relic) 효과 시스템
- `relic.json`에서 id → relic 객체 매핑
- **scope**: `"card"` (카드별 적용) → `"hand"` (핸드 합산 후) → `"final"` (최종 점수)
- **effect type**: `"add"` (덧셈), `"multiply"` (곱셈)
- **condition**: suit, rank, handName, deckCountGte 등 조건 필터

---

## GameScene — 주요 상태 변수

| 변수 | 설명 |
|------|------|
| `this.round` | 현재 라운드 번호 (1~) — `this.roundManager.getRound()` 동기화 |
| `this.roundManager` | `RoundManager` 인스턴스 — 라운드/배틀 데이터 참조 |
| `this.player` | `Player` 인스턴스 |
| `this.handData[]` | 핸드 카드 배열 |
| `this.fieldData[]` | 필드 카드 배열 (각 카드에 `slotX` 포함) |
| `this.deckData[]` | 남은 덱 |
| `this.dummyData[]` | 버린 카드 더미 |
| `this.monsters[]` | 몬스터 배열 `{type, hp, maxHp, atk, def, xp, gold, isDead, deathAnimDone}` |
| `this.selected` | Set — 핸드 선택 인덱스 |
| `this.fieldPickCount` | 이번 턴 필드 픽 횟수 |
| `this.attackCount` | 이번 턴 공격 횟수 |
| `this.isDealing` | 애니메이션/팝업 중 인터랙션 차단 여부 |
| `this.sortMode` | `'suit'` \| `'rank'` \| `null` |
| `this.sortAsc` | 정렬 방향 (boolean) |
| `this.cardObjs[]` | 렌더 시마다 재생성 (카드 게임오브젝트) |
| `this.monsterObjs[]` | 렌더 시마다 재생성 (몬스터 UI — HP바, 텍스트 등) |
| `this._monsterSprites[]` | 렌더 시마다 재생성 (몬스터 스프라이트 본체, index=몬스터idx) |
| `this.animObjs[]` | 딜링 애니메이션 전용 |
| `this._optOverlayObjs` | 인게임 OPT 오버레이 오브젝트 배열 (null이면 미표시) |
| `this.battleLogLines[]` | 배틀 로그 줄들 (최근 4개) |
| `this._fullBattleLog[]` | 전체 배틀 로그 (팝업용) |
| `this._suitLevelUpCount` | 레벨업으로 누적된 미사용 suit 선택 횟수 |
| `this._logPopupObjs` | 배틀 로그 팝업 오브젝트 배열 (null이면 미표시) |

## GameScene — 턴 흐름
```
create() → startDealAnimation() → render()
  ↓ 플레이어 행동 (반복 가능)
  - 필드 카드 드래그 → 핸드로 (fieldPickCount < fieldPickLimit)
  - 핸드 카드 클릭 → 선택/해제 → 족보 프리뷰 + 족보 카드 진동
  - 몬스터 클릭 (족보 있을 때) → attackMonster()
      → 카드가 몬스터를 향해 날아가며 50%로 축소 → dummy로 이동
      → 몬스터 attack 애니메이션 (400ms) → _afterAttack()
      → 오버킬 시 → _applyOverkill() → 카드 날아가는 연쇄 애니메이션
      → _checkLevelUpThenProceed() → 레벨업 있으면 suit 선택 팝업
      → 모든 몬스터 사망 시 → onRoundClear()
  ↓ 턴종료 클릭
  onTurnEnd() → 몬스터 반격 → 게임오버 or startTurn()
  startTurn() → 핸드 보충 + 필드 교체 → render()
```

## GameScene — 레벨업 suit 선택 팝업
- 몬스터 처치로 레벨업 발생 시 `_suitLevelUpCount += 레벨업 횟수`
- 공격/오버킬 완료 후 `_checkLevelUpThenProceed()` 호출
- `_suitLevelUpCount > 0` 이면 `_showLevelUpPopup(onAllDone)` 표시
  - ♠♥♦♣ 버튼 4개, 남은 선택 횟수 표시
  - 버튼 클릭 → `player.attrs[suit]++`, `_suitLevelUpCount--`
  - 횟수 소진 시 팝업 닫고 `onAllDone()` (라운드 클리어 체크)
- 레벨업 없으면 바로 라운드 클리어 체크

## GameScene — DEF 규칙
- **라운드 클리어 시**: `player.def = 0` (리셋)
- **공격받을 때**: DEF 절반 감소 로직 없음 (공격마다 DEF 유지)
- **♦ Diamonds 적응**: 공격 시 DEF 누적 증가

## GameScene — 오버킬 연쇄
- 공격 데미지 > 몬스터 HP → 초과분(overkill)이 다음 대상으로 전달
- 대상 선택: **오른쪽 가장 가까운 살아있는 몬스터** → 없으면 **맨 왼쪽** 살아있는 몬스터
- 연쇄 사망 시 동일 규칙 반복 (재귀)
- 애니메이션: `card_back` 이미지가 죽은 몬스터 위치 → 대상 몬스터로 날아감 (280ms)
- 오버킬 중 `isDealing = true` → 완료 후 `render()` + `_checkLevelUpThenProceed()`

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
- 몬스터 위치: `calcMonsterPositions(count)` — 마리 수에 따라 동적 간격 계산
  - 최대 간격 480px, margin 120px 적용, 5마리까지 화면 이탈 없음

## GameScene — 카드 크기 정책
- 핸드 카드: `CW × CH` (100×145)
- 필드 카드: `FIELD_CW × FIELD_CH` (60×87), `slotX`로 고정 슬롯 배치
- 덱/더미: 텍스트(DECK/USED) + 숫자 표시, hover 시 개수 tooltip

## GameScene — 버튼 레이아웃
- **OPT** (rectangle+text): 우측 상단 (x=GW-52, y=22)
- **TURN END** (rectangle+text): 핸드 패널 우측, 바닥을 핸드 카드 바닥에 정렬
- **SORT** (rectangle+text): 핸드 카드 바로 위 중앙 — 클릭마다 SUIT ▲ / RANK ▲ 토글 (항상 오름차순)

## GameScene — 드래그 동작
- `dragstart`: 카드 90%로 축소 (`CW*0.9, CH*0.9`)
- `drop` (핸드 패널 위): 삽입 위치 탐지 후 `handData` splice
- `dragend` (핸드 밖): `_snapBack()` → origW/origH로 복원

## GameScene — 카드 애니메이션
- `_flyToDummy(fromX, fromY, key)`: 필드 교체 시 카드를 `(GW-60, FIELD_Y)`로 날림 (380ms)
- `_throwCardAtMonster(fromX, fromY, key, monX)`: 공격 카드 애니메이션
  - 핸드 → 몬스터 위치 (280ms, CW×0.5로 축소)
  - 몬스터 → dummy 파일 (220ms, 페이드아웃)
- `_applyOverkill(fromIdx, dmg, onDone)`: 오버킬 연쇄 애니메이션 (콜백 방식)

## GameScene — 핸드 UX
- 선택 카드: 22px 위로 올라감 (테두리 없음)
- 족보 구성 카드만 x축 진동 tween (repeat: -1, 카드 파괴 시 자동 중단)
- 족보 없는 선택 카드: 위치만 올라가고 진동 없음

## GameScene — 배틀 로그 팝업
- 배틀 로그 바 클릭 → `_showBattleLogPopup()` 호출
- 팝업 위치: 배틀 로그 바 **바로 아래** (y=BATTLE_LOG_H=40), 컨텐츠 전체 폭
- 최근 18개 로그 표시, 오래된 것일수록 반투명
- 배경 딤 또는 CLOSE 버튼 클릭으로 닫기

## GameScene — OPTIONS 오버레이
- OPT 버튼(우측 상단) 클릭 시 `_showOptions()` 호출
- BGM 볼륨, SFX 볼륨 조절 (registry 즉시 반영)
- MAIN MENU: 현재 상태 세이브 후 MainMenuScene 이동
- CLOSE: 오버레이 제거 후 `isDealing = false` 로 복귀
- 씬 재시작 시 `_optOverlayObjs = null` 초기화

> **주의:** `_closeOptions()`에서 `isDealing`은 항상 `false`로 설정.
> 이전에 `_prevIsDealing` 복원 방식을 사용했으나, 딜링 타이머와 경쟁 조건이 생겨 영구 블록되는 버그 발생.

> **주의:** `time.delayedCall` 콜백 내부에서 예외 발생 시 이후 코드가 실행되지 않아 `isDealing`이 영구적으로 true로 남는 버그 발생 가능.
> `onTurnEnd`, `startTurn` 등 주요 타이머 콜백에는 try-catch + finally로 보호.

---

## 개발 서버
```bash
cd C:/Users/rundo/Rogue-Shuffle
npm run dev   # http://localhost:5173
```

## GitHub 저장소
https://github.com/joohyunKing/RogueShuffle
