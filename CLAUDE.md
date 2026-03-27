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
  constants.js          # 레이아웃 전용 상수
  save.js               # localStorage 세이브/로드 유틸
  CardRenderer.js       # Canvas2D API로 런타임 카드 텍스처 생성
  textStyles.js         # Phaser Text 스타일 상수 모음 (TS 객체)
  data/
    monster.json        # 몬스터 데이터 (name/tier/race/hp/atk/def/cost/sprite)
    item.json           # 아이템 데이터 (id/name/img/desc/cost/rarity/effect)
    relic.json          # 유물 데이터 (id/name/description/rarity/effects)
    round.json          # 라운드 데이터 (rounds[]: round/normalCount/monsterTier/totalCost/boss)
  manager/
    roundManager.js     # RoundManager — 라운드/배틀 순서 관리
    playerManager.js    # Player 클래스 + getRequiredExp
    deckManager.js      # DeckManager — 덱/핸드/필드/더미 상태 관리
    effectManager.js    # 시각 이펙트 (hitExplosion 등)
    optionManager.js    # 옵션 저장/로드 (registry 기반)
  scenes/
    MainMenuScene.js    # 타이틀 화면 (NEW GAME / CONTINUE / OPTIONS)
    OptionsScene.js     # BGM·SFX 볼륨 · 언어 설정
    GameScene.js        # 라우터 씬 — round/phase 따라 BattleScene or MarketScene 디스패치
    BattleScene.js      # 전투 씬 (카드 선택, 몬스터 공격, 턴 진행)
    MarketScene.js      # 상점 씬 (아이템 구매, 라운드 클리어 후)
  service/
    monsterService.js   # 몬스터 데이터 관리 + 스프라이트 애니메이션
    scoreService.js     # 족보 점수 계산 (calculateScore)
  assets/
    fonts/              # PressStart2P-Regular.ttf
    audio/sfx/          # card-shuffle.ogg, card-fan-1.ogg, card-slide-5.ogg,
                        # card-place-1.ogg, chop.ogg, knifeSlice.ogg
    images/
      symbol/           # spade_symbol.jpg, hearts_symbol.jpg, diamonds_symbol.jpg, clubs_symbol.jpg
      monster/          # 몬스터 스프라이트시트 PNG (384×384 프레임, 3col)
      item/             # 아이템 이미지 (red_portion.png, green_portion.png 등)
      bg/               # old_stone_castle.jpg (배경 — 정사각형, 가로 맞춤 하단 정렬)
      ui/               # card_back_deck.png, card_back_dummy.png, 버튼 이미지 등
public/
```

## 씬 전환 흐름
```
MainMenuScene → (NEW GAME) → GameScene {} (세이브 삭제 후 빈 데이터)
MainMenuScene → (CONTINUE) → GameScene { round, player } (세이브 데이터 로드)
MainMenuScene → (OPTIONS)  → OptionsScene → (BACK) → MainMenuScene

GameScene (라우터)
  → phase="battle"  → BattleScene { round, battleIndex, isBoss, player, deckData }
  → phase="market"  → MarketScene { round, player, deckData }

BattleScene → (라운드 클리어) → GameScene { round, player, deckData } (다음 배틀 or 마켓)
BattleScene → (게임오버)     → 세이브 삭제 → MainMenuScene
MarketScene → (계속)         → GameScene { round+1, player, deckData }
```

> **주의:** NEW GAME 시 반드시 `scene.start("GameScene", {})` 로 빈 객체를 전달해야 함.
> `scene.start("GameScene")` (data 없음)은 Phaser가 이전 settings.data를 유지해 버그 발생.

## 세이브 시스템 (save.js)
- `localStorage` 키: `"rogueShuffle_save"`
- 포맷: `{ round: number, player: PlayerData }`
- **자동 저장**: 라운드 클리어 시
- **삭제**: 게임오버 시 `deleteSave()`

## 설정 저장 (Phaser registry)
| 키 | 기본값 | 설명 |
|----|--------|------|
| `bgmVolume` | 7 | BGM 볼륨 (0~10) |
| `sfxVolume` | 7 | SFX 볼륨 (0~10) |
| `lang`      | `"ko"` | 언어 (`"ko"` \| `"en"`) |

- SFX 재생: `_sfx(key)` — `sfxVolume / 10 × 0.6` 적용

---

## 주요 상수 (constants.js)

### 캔버스 & 카드 크기
```js
GW = 1280, GH = 720              // 캔버스 (16:9)
CW = 100,  CH = 145              // 핸드 카드 원본 크기
FIELD_CW = 60, FIELD_CH = 87    // 필드/더미/덱 카드 크기
SUITS = ["S","H","D","C"]
RANKS = ["A","2",...,"K"]
SUIT_ORDER = { S:0, H:1, D:2, C:3 }
```

### 레이아웃
```
[플레이어 패널 0~199px] | [필드 영역 200~1079px] | [아이템 패널 1080~1279px]

  0 ──  40 : 배틀 로그 바       (BATTLE_LOG_H = 40)
 44 ── 404 : 몬스터 영역        (MONSTER_AREA_TOP=44, MONSTER_AREA_H=360)
408 ── 532 : 필드 패널          (FIELD_Y = 470)
535 ── 715 : 핸드 패널          (HAND_Y = 625)

플레이어 패널 (좌측 200px):
  JOB / ROUND / GOLD / LV / XP바 / HP / DEF / ATK / 슈트 레벨(♠♥♦♣) / DECK 수 / USED 수
아이템 패널 (우측 200px):
  OPTIONS 버튼 / 보유 아이템 카드 2열 / TURN END 버튼
```
```js
PLAYER_PANEL_W = 200
ITEM_PANEL_W   = 200
MONSTER_IMG_Y  = 310   // 몬스터 스프라이트 하단 기준 레이아웃
HAND_TOP       = 535   // 드래그 드롭 판정 기준 (HAND_Y - CH/2 - 18)
DEAL_DELAY     = 110
```

### 족보 랭크 (HAND_RANK / HAND_NAME)
```js
HAND_RANK = { FIVE_CARD:9, STRAIGHT_FLUSH:8, FOUR_OF_A_KIND:7,
              FULL_HOUSE:6, FLUSH:5, STRAIGHT:4,
              TWO_PAIR:3, TRIPLE:2, ONE_PAIR:1, HIGH_CARD:0 }
```

---

## Player 클래스 (manager/playerManager.js)

### 주요 속성
| 속성 | 기본값 | 설명 |
|------|--------|------|
| `hp / maxHp` | 100 | 플레이어 HP |
| `def` | 0 | 방어력 (라운드 클리어 시 0으로 리셋) |
| `atk` | 5 | 공격력 — 카드 점수에 합산 (레벨업 시 +1) |
| `score` | 0 | 누적 점수 |
| `xp / level` | 0 / 1 | 경험치 / 레벨 |
| `gold` | 0 | 골드 |
| `attacksPerTurn` | 2 | 턴당 공격 가능 횟수 |
| `attrs` | `{S:1,H:1,D:1,C:1}` | 슈트별 레벨 — 레벨업 suit 선택 팝업으로 증가 |
| `adaptability` | 각 1.0 | 슈트별 적응도 |
| `items` | `[]` | 보유 아이템 목록 `{uid, id, name, desc, rarity, img}` |
| `handSize` | 7 | 라운드 시작 핸드 배치 수 |
| `fieldSize` | 5 | 필드 배치 수 |

### 레벨업 효과
- `maxHp += 2`, `hp += 2`, `atk += 1` (레벨 1회당)
- suit 선택 팝업 → `attrs[suit]++`

### suit 적응 효과 (공격 시 자동 적용)
`적응 수치 = floor(attrs[suit] × adaptability[suit] × 해당 suit 카드 수)`
- **♠ Spade**: 몬스터 DEF 감소
- **♥ Hearts**: 플레이어 HP 회복
- **♦ Diamonds**: 플레이어 DEF 증가
- **♣ Clubs**: 몬스터 ATK 감소 (최소 0)

### 주요 메서드
```js
player.addXp(amount)   // XP 추가 + 레벨업 처리(스탯 자동 증가) → 새 레벨 배열 반환
player.toData()        // 씬 전환용 직렬화
new Player(data)       // data 없으면 내부 기본값
```

---

## DeckManager (manager/deckManager.js)
```js
new DeckManager(data)         // data.cards로 초기화 (없으면 빈 덱)
deck.initFull()               // 52장 완전한 덱 생성
deck.resetForNextBattle()     // 배틀 전 덱 리셋 (permanent 카드만, UID 중복 제거)
deck.deal(n)                  // 핸드로 n장 배분
deck.replenishField(size)     // 필드 보충
// 상태: deck.deckPile / deck.hand / deck.field / deck.dummyPile
```
- 카드 객체: `{ suit, rank, val, baseScore, key, uid, duration }`
- `duration: 'permanent'` — 배틀 간 유지되는 카드

---

## 아이템 시스템 (data/item.json)
- **구매**: MarketScene에서 gold 소모 → `player.items[]`에 추가 (uid 포함)
- **사용**: BattleScene 아이템 패널에서 drag → 몬스터/필드/핸드 영역에 드롭 → `_useItem()` 적용
- **effect 타입**: `heal`, `maxHp`, `def`, `attacksPerTurn`, `handSize`, `fieldSize`, `attr`

---

## service/scoreService.js
```js
calculateScore(cards, context)
// 반환: { rank, handName, score, cards }
// score = 족보 카드 baseScore 합산 + relic 효과
// 실제 공격 데미지 = score + player.atk
```

### 족보 우선순위
FIVE_CARD(9) > STRAIGHT_FLUSH(8) > FOUR_OF_A_KIND(7) > FULL_HOUSE(6) >
FLUSH(5) > STRAIGHT(4) > TWO_PAIR(3) > TRIPLE(2) > ONE_PAIR(1) > HIGH_CARD(0)

---

## BattleScene — 주요 상태 변수
| 변수 | 설명 |
|------|------|
| `this.player` | Player 인스턴스 |
| `this.deck` | DeckManager 인스턴스 |
| `this.handData[]` | 핸드 카드 배열 |
| `this.fieldData[]` | 필드 카드 배열 (각 카드에 `slotX` 포함) |
| `this.deckData[]` | 남은 덱 (`deck.deckPile` 참조) |
| `this.dummyData[]` | 버린 카드 더미 |
| `this.monsters[]` | `{mob, hp, maxHp, atk, def, isDead, deathAnimDone}` |
| `this.selected` | Set — 핸드 선택 인덱스 |
| `this.attackCount` | 이번 턴 공격 횟수 |
| `this.fieldPickCount` | 이번 턴 필드 픽 횟수 |
| `this.isDealing` | 애니메이션/팝업 중 인터랙션 차단 |
| `this.cardObjs[]` | render() 시마다 destroy 후 재생성 |
| `this.monsterObjs[]` | render() 시마다 destroy 후 재생성 |
| `this._monsterSprites[]` | 몬스터 스프라이트 본체 (index=몬스터idx) |

## BattleScene — 턴 흐름
```
create() → 딜링 애니메이션 → render()
  ↓ 플레이어 행동
  - 필드 카드 드래그 → 핸드로 이동 (fieldPickCount < fieldPickLimit)
  - 핸드 카드 클릭 → 선택/해제 → 족보 프리뷰 (미리보기 점수 = cardScore + player.atk)
  - 몬스터 클릭 (족보 있을 때) → attackMonster()
      → 카드 날아가기 애니메이션 → 몬스터 damaged 애니메이션
      → _afterAttack() → 오버킬 시 _applyOverkill()
      → _checkLevelUpThenProceed() → suit 선택 팝업 or 라운드 클리어 체크
  ↓ TURN END 클릭
  onTurnEnd() → 몬스터 반격 → 게임오버 or startTurn()
  startTurn() → 핸드 보충 + 필드 교체 → render()
```

## BattleScene — 핸드 카드 렌더
- 기본 크기: `CW * 0.95` (9장 이상이면 `max(0.65, 8/count)` 추가 축소)
- 선택 카드: selOffset만큼 위로 올라감
- 족보 구성 카드: x축 진동 tween
- hover: 1.35× 확대 tween

## BattleScene — 덱/더미 파일 표시
- 덱: `card_back_deck.png` 이미지, `FIELD_CW × FIELD_CH` 크기
- 더미: `card_back_dummy.png` 이미지
- 카운트는 플레이어 패널(DECK / USED 레이블)에 표시
- hover tooltip / 클릭 → 파일 팝업

## BattleScene — 몬스터 렌더
- 하단 기준 레이아웃: MON_BOTTOM → ATK/DEF → HP바(current/max 텍스트) → 스프라이트
- 몬스터 간격: `calcMonsterPositions()` — 최대 간격 130px, margin 100px
- 족보 있을 때 몬스터에 "ATTACK!" 힌트 + 히트 영역 표시

## BattleScene — 주요 주의사항
> `time.delayedCall` 콜백에서 예외 발생 시 `isDealing`이 영구 true로 남을 수 있음.
> `onTurnEnd`, `startTurn` 등 주요 콜백은 try-catch + finally로 보호.

> `_closeOptions()`에서 `isDealing`은 항상 `false`로 설정.
> (이전 `_prevIsDealing` 복원 방식은 경쟁 조건 버그 발생으로 제거됨)

---

## CardRenderer.js
Canvas2D API로 52장 카드 텍스처를 런타임 생성.
> `RenderTexture.saveTexture()` + `rt.destroy()` 조합은 텍스처가 까맣게 되는 버그 — Canvas 방식 사용.
> 씬 재시작 시 `scene.textures.exists(key)` 체크로 중복 등록 방지.

카드 텍스처 키: `${suit}${rank}` (예: `SA`, `H10`, `DK`)

---

## 개발 서버
```bash
cd C:/Users/rundo/Rogue-Shuffle
npm run dev   # http://localhost:5173
```

## GitHub 저장소
https://github.com/joohyunKing/RogueShuffle
