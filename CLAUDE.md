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
  - 한글은 NeoDGM  (`"'PressStart2P', 'NeoDGM', Arial"`)

## 파일 구조
```
src/
  main.js               # FontFace 로드 → Phaser.Game 생성, 씬 등록
  constants.js          # 레이아웃 전용 상수 + HAND_DATA
  save.js               # localStorage 세이브/로드 유틸
  CardRenderer.js       # Canvas2D API로 런타임 카드 텍스처 생성 + 씰 툴팁(TooltipUI 사용)
  textStyles.js         # Phaser Text 스타일 상수 모음 (TS 객체)
  data/
    monsters.json       # 몬스터 데이터 (id/name/race/job/cost/hp/atk/def/skill/sprite/img/useYn)
    boss.json           # 보스 데이터 (id/name/statScale/phases/passive/skills/summons/img/useYn)
    item.json           # 아이템 데이터 (id/name/img/desc/rarity/effect/useYn)
    relic.json          # 유물 데이터 (id/name/description/rarity/effects/img/useYn)
    seal.json           # 씰 데이터 (id/name/desc/border/scoreBonus/goldBonus/healBonus/shopLabel/img/usable)
    round.json          # 라운드 데이터 (rounds[]: round/battles[]/bg/races/bossId/baseStat)
    debuff.json         # 디버프 정의 (id/name/type/duration/durationValue/value/img)
    lang.json           # 다국어 텍스트 (ko/en: hand/playerUI/market/item/relic/ui)
  manager/
    roundManager.js     # RoundManager — 라운드/배틀 순서 관리
    playerManager.js    # Player 클래스 + getRequiredExp
    deckManager.js      # DeckManager — 덱/핸드/필드/더미 상태 관리
    itemManager.js      # 아이템 목록/맵 + applyItemEffect / revertItemEffect
    relicManager.js     # 유물 목록/맵 + getRelicById / getRelicsExcluding / getRelicPrice
    sealManager.js      # 씰 목록/맵 + getSealTypes()
    effectManager.js    # 시각 이펙트 (hitExplosion, throwOrb 등)
    optionManager.js    # 옵션 저장/로드 (registry 기반)
    spawnManager.js     # SpawnManager — 라운드별 몬스터/보스 그룹 생성 (cost 기반)
    bossManager.js      # BossManager — 보스 턴/패시브/페이즈/스킬 실행
    debuffManager.js    # DebuffManager — 디버프 상태 추적 및 적용/해제
    monsterManager.js   # MonsterManager — 일반 몬스터 턴/공격/스킬/피격 효과
  scenes/
    PreloadScene.js     # 에셋 로드 → GameScene 전환
    MainMenuScene.js    # 타이틀 화면 (NEW GAME / CONTINUE / OPTIONS)
    OptionsScene.js     # BGM·SFX 볼륨 · 언어 설정
    GameScene.js        # 라우터 씬 — round/phase 따라 BattleScene or MarketScene 디스패치
    BattleScene.js      # 전투 씬 (카드 선택, 몬스터 공격, 턴 진행)
    MarketScene.js      # 상점 씬 (아이템/유물 구매, 라운드 클리어 후)
  service/
    scoreService.js     # 족보 점수 계산 (getScoreDetails)
    langService.js      # 다국어 텍스트 유틸 (getLang, getHandName, getUiText 등)
  ui/
    TooltipUI.js        # 범용 툴팁 컴포넌트 (ItemUI/MarketScene/CardRenderer에서 사용)
    ItemUI.js           # 우측 패널: Relic + Item 렌더 + 현재/최대 수량 표시 (TooltipUI 사용)
    PlayerUI.js         # 좌측 플레이어 패널 + OPTIONS 버튼 (onOptions 콜백)
    BattleLogUI.js      # 배틀 로그 UI
    BossHPBarUI.js      # 보스 HP바
    PilePopupUI.js      # 덱/더미 팝업 (멀티 행 지원)
    RelicPickPopup.js   # 유물 선택 팝업
    MonsterView.js      # 몬스터 렌더 뷰 (tween 기반 idle/attack/hit/skill/die)
    OptionUI.js         # 옵션 오버레이
  assets/
    fonts/              # PressStart2P-Regular.ttf
    audio/
      bgm/              # Below_the_Iron_Throne.mp3, Beneath_the_Stone_Spire.mp3
      sfx/              # card-shuffle.ogg, card-fan-1.ogg, card-slide-5.ogg,
                        # card-place-1.ogg, chop.ogg, knifeSlice.ogg,
                        # monster_orb.wav, sfx_lightning.wav, sfx_explosion.wav
    images/
      symbol/           # spade_symbol.png, hearts_symbol.png, diamonds_symbol.png, clubs_symbol.png
                        # red_seal.png, yellow_seal.png, green_seal.png, rainbow_seal.png, pink_seal.png
      monster/          # 몬스터/보스 PNG 이미지 (mon_sample.png 포함)
      item/             # 아이템 이미지 (red_portion.png, green_portion.png, scroll*.png 등)
      relic/            # 유물 이미지
      debuff/           # 디버프 이미지
      bg/               # 라운드별 배경 이미지
      ui/               # 각종 UI 이미지 (아래 에셋 키 목록 참고)
public/
```

## 에셋 키 목록 (PreloadScene)

### BGM
| 키 | 파일 |
|----|------|
| `bgm_0` | Below_the_Iron_Throne.mp3 |
| `bgm_1` | Beneath_the_Stone_Spire.mp3 |

### SFX
| 키 | 파일 |
|----|------|
| `sfx_shuffle` | card-shuffle.ogg |
| `sfx_fan` | card-fan-1.ogg |
| `sfx_slide` | card-slide-5.ogg |
| `sfx_place` | card-place-1.ogg |
| `sfx_chop` | chop.ogg |
| `sfx_knifeSlice` | knifeSlice.ogg |
| `sfx_orb` | monster_orb.wav |
| `sfx_lightning` | sfx_lightning.wav |
| `sfx_explosion` | sfx_explosion.wav |

### UI 이미지 (정적 로드)
| 키 | 설명 |
|----|------|
| `card_back` | 카드 뒷면 |
| `card_back_deck` | 덱 파일 표시용 (deck_rembg.png) |
| `card_back_dummy` | 더미 파일 표시용 (dummy_rembg.png) |
| `ui_deck` | 덱 아이콘 |
| `ui_dummy` | 더미 아이콘 |
| `ui_option` | 옵션 기어 버튼 |
| `ui_btn` | 범용 버튼 이미지 |
| `ui_frame` | 9-slice 패널 프레임 |
| `ui_panel_parchment` | 양피지 패널 |
| `ui_panel_stone` | 돌 패널 |
| `ui_divider_iron` | 철제 구분선 |
| `ui_card_front` | 카드 앞면 프레임 |
| `ui_panel_item` | 아이템 패널 배경 |
| `ui_field_hand` | 필드/핸드 영역 배경 |
| `ui_hp_bar` | HP 바 장식 프레임 |
| `ui_sword` | 공격력 아이콘 |
| `ui_shield` | 방어력 아이콘 |
| `ui_popup` | 일반 팝업 배경 |
| `ui_battle_popup` | 배틀 클리어 팝업 배경 |
| `ui_fireball` | 파이어볼 스프라이트시트 (325×358) |

### 동적 로드 (JSON 기반)
- 배경: `bg_${round.round}` — round.json의 각 라운드 bg 파일
- 아이템: `item_${item.id}` — item.json의 img 필드
- 유물: `relic_${relic.id}` — relic.json의 img 필드
- 디버프: `debuff_${debuff.id}` — debuff.json의 img 필드
- 몬스터: `mon_${monster.id}` — monsters.json의 img 필드
- 보스: `mon_${boss.id}` — boss.json의 img 필드

## useYn 패턴
`boss.json`, `item.json`, `relic.json`, `monsters.json`의 각 항목에 `useYn: 'Y'|'N'` 필드가 있음.
- **Manager의 List**(relicList, itemList 등): `useYn === 'Y'` 필터링 → 상점/선택 풀에서만 제외
- **Manager의 Map**(relicMap, itemMap 등): 전체 데이터 유지 → 보유 아이템 효과 적용에 사용
- 테스트하기 싫은 보스/아이템/유물은 `useYn: 'N'`으로 비활성화

---

## 씬 전환 흐름
```
MainMenuScene → (NEW GAME) → GameScene {} (세이브 삭제 후 빈 데이터)
MainMenuScene → (CONTINUE) → GameScene { round, player } (세이브 데이터 로드)
MainMenuScene → (OPTIONS)  → OptionsScene → (BACK) → MainMenuScene

GameScene (라우터)
  → phase="battle"  → BattleScene { round, battleIndex, isBoss, player, deckData, battleLog }
  → phase="market"  → MarketScene { round, player, deckData }

BattleScene → (라운드 클리어) → GameScene { round, player, deckData, battleLog } (다음 배틀 or 마켓)
BattleScene → (게임오버)     → 세이브 삭제 → MainMenuScene
MarketScene → (계속)         → GameScene { round+1, player, deckData }
```

> **BattleLog 지속**: `battleLog` 배열이 씬 전환 시 GameScene → BattleScene으로 계속 전달되어
> 전체 런 동안 로그가 누적됨. MarketScene 경유 시에는 전달 안 됨(마켓엔 BattleLog 없음).

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
- BGM 실시간 볼륨 반영: `registry.events.on('changedata-bgmVolume', ...)` — BattleScene이 구독하여 `_bgmSound.setVolume(vol)` 즉시 적용

---

## 주요 상수 (constants.js)

### 캔버스 & 카드 크기
```js
GW = 1280, GH = 720              // 캔버스 (16:9)
CW = 100,  CH = 145              // 핸드 카드 원본 크기
FIELD_CW = 60, FIELD_CH = 87    // 필드 카드 표시 크기 (CW*0.6, CH*0.6)
PILE_CW = 125, PILE_CH = 86     // 덱/더미 파일 표시 크기
SUITS = ["S", "H", "C", "D"]    // 주의: C가 D 앞
RANKS = ["A","2",...,"K"]
SUIT_ORDER = { S:0, H:1, C:2, D:3 }
DEBUG_MODE = true
```

### 레이아웃
```
[플레이어 패널 0~259px] | [필드 영역 260~1019px] | [아이템 패널 1020~1279px]

  0 ──  70 : 배틀 로그 바       (BATTLE_LOG_H = 70, 최근 2줄 표시, 클릭 시 전체 확장)
 80 ── 395 : 몬스터 영역        (MONSTER_AREA_TOP=80, MONSTER_AREA_H=315)
408 ── 532 : 필드 패널          (FIELD_Y = 470)
535 ── 715 : 핸드 패널          (HAND_Y = 625, HAND_TOP = 535)

플레이어 패널 (좌측 260px):
  JOB / ROUND / GOLD / LV / XP바 / HP / DEF / ATK / 슈트 레벨(♠♥♦♣, hover→툴팁) / DECK 수 / USED 수 / OPTIONS 버튼
아이템 패널 (우측 260px):
  RELICS 헤더 / 유물 목록 + 현재/최대 수량 / 구분선 / ITEMS 헤더 / 아이템 카드 2열 + 현재/최대 수량 / TURN END 버튼
```
```js
PLAYER_PANEL_W = 260
ITEM_PANEL_W   = 260
BATTLE_LOG_H   = 70
MONSTER_AREA_TOP = 80
MONSTER_AREA_H   = 315
MONSTER_IMG_Y  = 310
HAND_TOP       = 535   // 드래그 드롭 판정 기준 (HAND_Y - CH/2 - 18)
DEAL_DELAY     = 110
```

### 족보 랭크 (HAND_RANK / HAND_DATA)
```js
HAND_RANK = {
  FIVE_CARD: 11, STRAIGHT_FLUSH: 10, FOUR_OF_A_KIND: 9,
  FULL_HOUSE: 8, FLUSH: 7, STRAIGHT: 6,
  FLUSH_DRAW: 5, STRAIGHT_DRAW: 4,   // enabled: false (미구현)
  TWO_PAIR: 3, TRIPLE: 2, ONE_PAIR: 1, HIGH_CARD: 0
}

HAND_DATA = {
  11: { key:"FIVE_CARD",      multi:8,   aoe:true,  enabled:true },
  10: { key:"STRAIGHT_FLUSH", multi:7,   aoe:true,  enabled:true },
   9: { key:"FOUR_OF_A_KIND", multi:6,   aoe:true,  enabled:true },
   8: { key:"FULL_HOUSE",     multi:4,   aoe:true,  enabled:true },
   7: { key:"FLUSH",          multi:4,   aoe:true,  enabled:true },
   6: { key:"STRAIGHT",       multi:4,   aoe:true,  enabled:true },
   5: { key:"FLUSH_DRAW",     multi:3.5, aoe:false, enabled:false },
   4: { key:"STRAIGHT_DRAW",  multi:3.5, aoe:false, enabled:false },
   3: { key:"TWO_PAIR",       multi:3,   aoe:false, enabled:true },
   2: { key:"TRIPLE",         multi:2,   aoe:false, enabled:true },
   1: { key:"ONE_PAIR",       multi:2,   aoe:false, enabled:true },
   0: { key:"HIGH_CARD",      multi:1,   aoe:false, enabled:true },
}
```

> **aoe=true**: STRAIGHT(6) 이상 족보. 전체 몬스터 광역 공격, suit 효과도 전체 적용.

### context 객체 (scoreService 호출 시 전달)
```js
context = {
  cards: [],            // 선택된 카드
  relics: [],           // 유물
  deckCount: 0,         // 덱 남은 카드 수
  dummyCount: 0,        // 더미 카드 수
  handRank: 0,          // 족보 랭크
  hp: 0,               // 플레이어 현재 HP (만피 조건용)
  maxHp: 0,            // 플레이어 최대 HP
  handRemainingCount: 0, // 공격에 사용되지 않은 핸드 카드 수 (빈손 조건용)
  handUseCounts: {},    // 족보별 누적 사용 횟수 (성장형 유물용)
}
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
| `attrs` | `{S:1,H:1,C:1,D:1}` | 슈트별 레벨 — 레벨업 suit 선택 팝업으로 증가 |
| `adaptability` | 각 1.0 | 슈트별 적응도 |
| `items` | `[]` | 보유 아이템 목록 `{uid, id, name, desc, rarity, img}` |
| `relics` | `[]` | 보유 유물 ID 배열 (최대 `maxRelicCount=9`) |
| `handSize` | 7 | 라운드 시작 핸드 배치 수 |
| `fieldSize` | 5 | 필드 배치 수 |
| `handConfig` | 족보별 멀티 설정 | `{ [rankNum]: { multi } }` — 강화서 아이템으로 증가 |
| `handUseCounts` | `{}` | 족보별 누적 사용 횟수 (성장형 유물 + 보스 디버프 참조) |
| `lastHandRank` | null | 마지막으로 사용한 족보 rank 번호 |

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
player.addXp(amount)        // XP 추가 + 레벨업 처리(스탯 자동 증가) → 새 레벨 배열 반환
player.tryAddRelic(relicId) // 유물 추가 (maxRelicCount 초과 시 false 반환)
player.toData()             // 씬 전환용 직렬화
new Player(data)            // data 없으면 내부 기본값
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
// 전체 카드: deck.cards (permanent 카드 배열)
```
- 카드 객체: `{ suit, rank, val, baseScore, key, uid, duration, enhancements }`
- `duration: 'permanent'` — 배틀 간 유지되는 카드
- `enhancements: [{ type: 'red'|'gold'|'green'|'pink' }]` — 씰 강화 (최대 1개)

---

## SpawnManager (manager/spawnManager.js)
라운드별 몬스터/보스 그룹을 생성. `spawnManager` 싱글톤으로 export.

```js
spawnManager.generate(roundData)
// roundData.isBoss ? 보스 그룹 생성 : 일반 몬스터 그룹 생성
// 반환: 몬스터 객체 배열 { id, name, race, job, hp, maxHp, atk, def, skill, sprite, xp, gold }
```

- **일반 몬스터**: `roundData.races`에 해당하는 종족만 풀링, `totalCost` 이내로 조합
  - 같은 몬스터 최대 2마리 제한
  - elite 배틀: cost 2 몬스터 가중치 증가
- **보스**: `boss.json`의 `statScale`로 스탯 계산 + `summons` 필드로 소환 몬스터 추가
- **종족 스탯 배율**: zombie/goblin/human/skell/undead/orc
- **직업 스탯 배율**: warrior/archer/thief/sniper/lancer/champion/knight/mage

---

## BossManager (manager/bossManager.js)
보스 전투 전용 매니저. BattleScene에서 `this.bossManager = new BossManager(scene)`로 생성.

### 주요 메서드
```js
bossManager.getCurrentPhase(boss)         // HP 비율로 현재 페이즈 반환
bossManager.activatePassive(boss, trigger) // 패시브 발동 (trigger: 'boss_turn'|'player_turn')
bossManager.doTurn(boss, onDone)          // 보스 턴 실행 (액션 큐 + 소환 몬스터 공격)
```

### 페이즈 시스템
```js
// boss.phases: [{ hpThreshold, actions: [{ type, skillId }] }]
// 현재 페이즈 = HP 비율 이상인 hpThreshold 중 가장 큰 것
```

### 액션 타입
| type | 동작 |
|------|------|
| `attack` | 일반 공격 |
| `skill` | 스킬 ID로 skill 실행 |
| `summon_or_attack` | 죽은 소환수 부활 / 없으면 공격 |

### 스킬 타입 (boss.skills[skillId].type)
| type | 동작 |
|------|------|
| `debuff` | debuffId로 디버프 적용 |
| `rank_disable` | 랜덤 랭크 봉인 (DebuffManager) |
| `suit_disable` | 랜덤 슈트 봉인 (DebuffManager) |
| `seal_most_used_hand` | 최다 사용 족보 봉인 |
| `seal_most_and_last_hand` | 최다+최근 사용 족보 이중 봉인 |
| `damage` | `atk * damMult` 강화 공격 |
| `buff` | 보스 스탯 버프 (stat += value) |
| `heal_lost_hp` | 잃은 HP의 ratio만큼 회복 |

### 패시브 타입 (boss.passive.type)
| type | 동작 |
|------|------|
| `atk_per_turn` | 보스 턴마다 ATK 증가 |
| `def_multiply_when_summoned` | 소환수 생존 시 DEF 배율 적용 |
| `def_multiply_when_healthy` | HP 비율 이상이면 DEF 배율 적용 |
| `reflect_heal` | 받은 피해의 일부를 보스 턴에 회복 |

---

## DebuffManager (manager/debuffManager.js)
디버프 상태를 추적하고 BattleScene/BossManager에서 호출됨.

```js
new DebuffManager(scene)
```

### 상태
```js
dm.activeDebuffs    // [{ id, turnsLeft }]  turnsLeft=-1이면 배틀 전체 지속
dm.disabledCardUids // Set — 사용 불가 카드 uid
dm.disabledRanks    // Set — 사용 불가 카드 랭크
dm.disabledSuits    // Set — 사용 불가 슈트
dm.disabledHandRanks // Set — 사용 불가 족보 handRank 번호
```

### 주요 메서드
```js
dm.applyDebuff(debuffId, monsterName)     // debuff.json 기반 디버프 적용
dm.tick()                                  // startTurn 시 호출 — turn 기반 디버프 만료 처리
dm.clearAll()                              // 배틀 종료 시 전체 해제
dm.applyRankDisable(sourceName)           // 랜덤 랭크 봉인
dm.applySuitDisable(sourceName)           // 랜덤 슈트 봉인
dm.applyMostUsedHandSeal(sourceName)      // 최다 사용 족보 봉인
dm.applyMostAndLastHandSeal(sourceName)   // 최다+최근 족보 이중 봉인
```

### 디버프 타입 (debuff.json의 type)
- `공격력감소` — player.atk 감소 (해제 시 복원)
- `핸드사이즈감소` — player.handSize 감소
- `필드사이즈감소` — player.fieldSize 감소
- `플레이어의 랜덤 카드사용불가` — 핸드 카드 임의 봉인 (disabledCardUids)
- `플레이어덱에 해로운 카드추가` — 독 카드 (baseScore=-10) 덱에 추가
- `랜덤랭크사용불가` — disabledRanks
- `랜덤슈트사용불가` — disabledSuits
- `족보사용불가` — disabledHandRanks

카드/슈트/랭크 봉인 여부는 `MonsterManager._isCardDisabled(card)`로 확인.

---

## 아이템 시스템 (data/item.json + manager/itemManager.js)
- **구매**: MarketScene에서 gold 소모 → `player.items[]`에 추가 (uid 포함)
- **사용**: BattleScene 아이템 패널 클릭/드롭 → `_useItem()` 호출
- **effect 타입** (`applyItemEffect`에서 처리):
  - `heal`, `maxHp`, `def`, `attacksPerTurn`, `handSize`, `fieldSize`, `attr`, `hand_multi`
- **effect 타입** (BattleScene `_useItem`에서 직접 처리 — 핸드 상태 접근 필요):
  - `copy_hand_card` — 선택한 카드 1장 복사해서 핸드에 추가 (정확히 1장 선택 필요)
  - `seal_hand_card` — 선택한 카드 1장에 씰 랜덤 강화 (정확히 1장, 씰 없는 카드만)
  - `remove_hand_cards` — 선택한 카드 제거, maxCards=2 (1~2장 선택 필요)
- `scope: 'battle'` 아이템(attacksPerTurn, handSize, fieldSize): 배틀 종료 시 `revertItemEffect()`로 되돌림
- **hand_multi**: `player.handConfig[rank].multi += value` — 강화서 아이템이 사용하는 타입
```js
import { getAllItems, getItemById, applyItemEffect, revertItemEffect, maxItemCount } from './itemManager.js';
// maxItemCount = 6
```

### 현재 아이템 목록 (useYn=Y)
| id | 이름 | 이미지 | 효과 |
|----|------|--------|------|
| heal_potion | 치료 물약 | red_portion.png | HP +20 |
| max_hp_up | 생명력 강화 | green_portion.png | 최대 HP +10 |
| extra_attack | 광폭화 | — | 턴당 공격 +1 (battle) |
| hand_expand | 패 확장 | — | 핸드 크기 +1 (battle) |
| field_expand | 필드 확장 | — | 필드 크기 +1 (battle) |
| copy_scroll | 복사 두루마리 | scroll_green.png | 선택 카드 1장 복사 |
| seal_scroll | 씰 두루마리 | scroll_blue.png | 선택 카드 1장 씰 랜덤 강화 |
| hand_remover | 제거 두루마리 | scroll_red.png | 선택 카드 1~2장 제거 |
| scroll_* | 각 족보 강화서 | scroll.png | 해당 족보 배수 +1 |

---

## 유물 시스템 (data/relic.json + manager/relicManager.js)
- 최대 보유: `maxRelicCount = 9`
- effects scope: `card`(카드별 점수), `hand`(족보 배수/가산), `final`(최종 점수), `special`(특수 효과), `onRemove`(제거 시)
```js
import { getAllRelics, getRelicById, getRelicsExcluding, getRelicPrice, maxRelicCount } from './relicManager.js';
```

---

## 씰 시스템 (data/seal.json + manager/sealManager.js)
카드 강화는 씰만 사용. BattleScene에서 씰 두루마리 아이템으로 적용.

| 씰 | 효과 | img |
|----|------|-----|
| red | 공격 시 +20점 | red_seal.png |
| gold | 공격 시 +5골드 | yellow_seal.png |
| green | 공격 시 아이템 추가 | green_seal.png |
| pink | 공격 시 HP +5 회복 | pink_seal.png |
| rainbow | 미구현 (usable:false) | rainbow_seal.png |

- 씰 이미지 key: `seal_${id}` (`CardRenderer.preload(scene)` 호출 시 로드)
- `getSealTypes()` — `usable:true` 인 씰 ID 배열 반환
- 씰 효과 처리: `BattleScene._applySealEffects()` — red(점수), gold(골드), green(아이템), pink(HP회복)

---

## 다국어 시스템 (service/langService.js + data/lang.json)
```js
import { getLang, getHandName, getHandDesc, getPlayerUI, getMarket,
         getItemName, getItemDesc, getRelicName, getRelicDesc, getUiText } from '../service/langService.js';

getLang(scene)                   // scene.registry.get('lang') → 'ko'|'en'
getHandName(lang, handKey)       // 족보 이름 (HAND_DATA[rank].key로 조회)
getUiText(lang, key, values)     // UI 텍스트 + {key} 치환
```
lang.json 구조: `{ ko: { hand, playerUI, market, item, relic, ui }, en: { ... } }`

---

## TooltipUI (src/ui/TooltipUI.js)
범용 툴팁 컴포넌트. ItemUI, MarketScene, CardRenderer에서 사용.

```js
new TooltipUI(scene, opts)
tip.show()                  // 렌더 (이전 것 자동 제거)
tip.hide()                  // 오브젝트 destroy
tip.update(partialOpts)     // opts 교체 후 즉시 재렌더
```

| 파라미터 | 기본값 | 설명 |
|----------|--------|------|
| `titleMsg` | 필수 | 제목 |
| `contentMsg` | — | 본문 (없으면 생략) |
| `titleMsgColor` | `'#ffffff'` | 제목 색 + 테두리 색 |
| `tooltipW` | `210` | 너비 |
| `left` | 필수 | 툴팁 좌측 X |
| `top` | — | 툴팁 상단 Y (`centerY`와 택일) |
| `centerY` | — | 수직 중앙 정렬 + clamp 적용 |
| `clampMin` | `4` | centerY 사용 시 최소 top |
| `clampMax` | `GH-10` | centerY 사용 시 최대 bottom |
| `onUse` | — | 활성 버튼 클릭 콜백 |
| `btnLabel` | `'사 용'` | 버튼 텍스트 |
| `btnDisabled` | `false` | 비활성 버튼 표시 |
| `btnDisabledMsg` | — | 비활성 버튼 클릭 시 일시 메시지 |
| `sold` | `false` | SOLD 텍스트 표시 |
| `depth` | `300` | 렌더 depth |

> 높이 계산: 한국어 혼합 텍스트 기준 `charsPerLine = innerW / 9` (ASCII 7px, 한글 13px 절충).
> 버튼/SOLD 폰트: 13px.

---

## service/scoreService.js
```js
getScoreDetails(cards, context)
// 반환: { rank, handName, score, cards, aoe, ... }
// score = 족보 카드 baseScore 합산 × multi + relic 효과 + 씰(red) 보너스
// aoe   = true이면 광역 공격 족보 (STRAIGHT 이상, rankNum >= 6)
// 실제 공격 데미지 = score + player.atk
```

### 족보 우선순위
FIVE_CARD(11) > STRAIGHT_FLUSH(10) > FOUR_OF_A_KIND(9) > FULL_HOUSE(8) >
FLUSH(7) > STRAIGHT(6) > TWO_PAIR(3) > TRIPLE(2) > ONE_PAIR(1) > HIGH_CARD(0)

> FLUSH_DRAW(5), STRAIGHT_DRAW(4): `enabled: false` — 현재 미사용.

> `aoe === true`: STRAIGHT(6) 이상 족보. 전체 몬스터 공격, suit 효과도 전체 적용, `hitExplosion` 사용.

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
| `this.monsters[]` | `{id, name, race, job, hp, maxHp, atk, def, skill, isDead, isBoss, isSummoned, ...}` |
| `this.selected` | Set — 핸드 선택 인덱스 (최대 5장) |
| `this.attackCount` | 이번 턴 공격 횟수 |
| `this.fieldPickCount` | 이번 턴 필드 픽 횟수 |
| `this.isDealing` | 애니메이션/팝업 중 인터랙션 차단 |
| `this.cardObjs[]` | render() 시마다 destroy 후 재생성 |
| `this.monsterViews[]` | MonsterView 인스턴스 배열 (index=몬스터idx) |
| `this.monsterManager` | MonsterManager 인스턴스 |
| `this.bossManager` | BossManager 인스턴스 (보스 배틀 시) |
| `this.debuffManager` | DebuffManager 인스턴스 |
| `this.enabledHands` | 현재 활성화된 족보 rank 번호 Set |

## BattleScene — 턴 흐름
```
create() → 딜링 애니메이션 → render()
  ↓ 플레이어 행동
  - 필드 카드 드래그 → 핸드로 이동 (fieldPickCount < fieldPickLimit)
  - 핸드 카드 클릭 → 선택/해제 → 족보 프리뷰 (미리보기 점수 = cardScore + player.atk)
    * 핸드 선택은 최대 5장으로 제한
    * DebuffManager.disabledHandRanks에 포함된 족보는 사용 불가
  - 몬스터 클릭 (족보 있을 때) → attackMonster()
      aoe=false (단일):
        → 카드 날아가기 + MonsterView.playHit() → _afterAttack()
        → overkill 시 _applyOverkill() / bullseye 시 _applyBullseye()
        → _checkLevelUpThenProceed()
      aoe=true (광역):
        → hitExplosion + 전체 몬스터 일괄 데미지 → render() → _checkLevelUpThenProceed()
  ↓ TURN END 클릭
  onTurnEnd()
    → debuffManager.tick()
    → 보스 배틀: bossManager.doTurn() → 게임오버 or startTurn()
    → 일반 배틀: monsterManager 반격 처리 → 게임오버 or startTurn()
    → bossManager.activatePassive(boss, 'player_turn') (플레이어 턴 시작 시)
  startTurn() → 핸드 보충 + 필드 교체 → render()
```

## BattleScene — 특수 처치 효과
| 효과 | 조건 | 동작 |
|------|------|------|
| **Overkill** | 데미지 > 몬스터 HP (남은 체력 초과) | 초과 데미지를 다음 살아있는 몬스터에 연쇄 |
| **Bullseye** | 데미지 = 몬스터 HP (딱 0으로 처치) | 죽인 몬스터의 `maxHp`를 다른 모든 몬스터에 광역 (`hitExplosion`) |

> Bullseye와 Overkill은 동시에 발동하지 않음 (overkill 우선).
> Bullseye AOE는 방어력 계산 적용됨 (`actualDmg = max(0, maxHp - target.def)`).

## BattleScene — 아이템 사용 (_useItem)
- `applyItemEffect`로 처리 불가한 타입은 `_useItem`에서 직접 처리
- `copy_hand_card`: 선택 1장 필수 → 복사본(새 uid) 핸드에 push
- `seal_hand_card`: 선택 1장 필수, 씰 없는 카드만 → `getSealTypes()` 랜덤 적용
- `remove_hand_cards`: 선택 1~2장 필수 → handData에서 제거 후 dummyPile로 이동

## BattleScene — 핸드 카드 렌더
- 기본 크기: `CW * 0.95` (9장 이상이면 `max(0.65, 8/count)` 추가 축소)
- 선택 카드: selOffset만큼 위로 올라감
- 족보 구성 카드: x축 진동 tween
- hover: 1.35× 확대 tween
- 디버프로 봉인된 카드: `disabled` 텍스처(회색) 적용

## BattleScene — BattleLog
- 평상시: 최근 2줄 표시 (위줄 55% alpha, 아래줄 100%)
- 클릭 시 확장: 몬스터 영역까지 덮는 패널, 전체 로그 표시, 마우스 휠 스크롤
- **씬 전환 시 로그 유지**: `battleLog` 배열이 GameScene을 통해 다음 BattleScene으로 전달됨

## BattleScene — 덱/더미 파일 표시
- 덱: `card_back_deck` 이미지, `PILE_CW × PILE_CH` 크기
- 더미: `card_back_dummy` 이미지
- 카운트는 플레이어 패널(DECK / USED 레이블)에 표시
- hover tooltip / 클릭 → PilePopupUI 팝업

## BattleScene — 몬스터 렌더
- 하단 기준 레이아웃: MON_BOTTOM → ATK/DEF → HP바(current/max 텍스트) → 스프라이트
- 몬스터 간격: `MonsterManager.calcMonsterPositions()` — 최대 간격 130px, margin 100px
- 족보 있을 때 몬스터에 "ATTACK!" 힌트 + 히트 영역 표시
- 몬스터 스프라이트: `MonsterView` (tween 기반 idle 부유 애니메이션)

## BattleScene — 배틀 클리어 팝업
- 배경: `ui_battle_popup` 이미지
- 버튼: `ui_btn` 이미지

## BattleScene — 주요 주의사항
> `time.delayedCall` 콜백에서 예외 발생 시 `isDealing`이 영구 true로 남을 수 있음.
> `onTurnEnd`, `startTurn` 등 주요 콜백은 try-catch + finally로 보호.

> `_closeOptions()`에서 `isDealing`은 항상 `false`로 설정.
> (이전 `_prevIsDealing` 복원 방식은 경쟁 조건 버그 발생으로 제거됨)

---

## MonsterManager (manager/monsterManager.js)
일반 몬스터 턴 처리 담당. BattleScene에서 `this.monsterManager = new MonsterManager(scene)`.

### 피격 이펙트 (_showPlayerHitEffect)
- 화면 왼쪽(플레이어 패널) 한정 붉은 플래시 + 카메라 셰이크
- 데미지 텍스트가 플레이어 HP 위치에서 위로 떠오름
- orb 날아가는 이펙트 없음 (제거됨)
- `time.delayedCall(190, ...)` — MonsterView.playAttack()의 돌진 피크(~190ms)에 동기화

### MonsterView tween 타이밍 (playAttack)
```
0ms   ─ 100ms : 준비 (x+16, scaleX 0.88 — 뒤로 웅크림)
100ms ─ 210ms : 돌진 (x-32, scaleX 1.14 — 앞으로 돌격)
                ↑ 190ms 부근에 _showPlayerHitEffect 호출 (피크 동기화)
210ms ─ 430ms : 복귀 (baseX, scaleX 원복, Bounce.Out)
```

---

## MonsterView (src/ui/MonsterView.js)
Phaser.GameObjects.Image 기반 몬스터 렌더. 스프라이트시트 애니메이션 미사용 (tween 대체).

```js
new MonsterView(scene, mon, idx, x, y, onClick, imgScale, offsetY)

view.update(mon, x, canBeTarget)  // 위치·HP·스탯 갱신 + ATTACK! 표시
view.updateStats(mon)              // HP바·ATK·DEF 수치만 갱신 (애니메이션 불간섭)
view.playAttack()  // 준비→돌진→복귀 tween (scaleX 찌그러짐/늘어남 포함)
view.playHit(cb)   // 흔들기 + 빨간 틴트 (완료 후 cb 호출)
view.playSkill()   // 고스트 잔상 3개 + 플래시
view.playDie()     // 기울어지며 페이드 아웃
view.revive()      // 부활 — sprite 상태 초기화 + idle tween 재시작
view.hideStats()   // ATK/DEF 아이콘+텍스트 숨김
view.hideHPBar()   // HP바 숨김
view.destroy()     // 모든 오브젝트 제거
```

---

## PlayerUI (src/ui/PlayerUI.js)
```js
new PlayerUI(scene, opts)
// opts: { depth, onOptions, ... }
```
- `onOptions` 콜백 전달 시 OPTIONS 버튼 렌더 (player panel 하단, `ui_btn` 이미지 사용)
- BattleScene/MarketScene 모두 PlayerUI를 통해 OPTIONS 버튼 표시
- `_add(obj)` 패턴으로 내부 오브젝트 관리 (refresh 시 자동 destroy)

---

## ItemUI (src/ui/ItemUI.js)
```js
// 우측 패널: 유물 목록 + 아이템 목록
// 유물 영역 우하단: `${relics.length}/${maxRelicCount}` (TS.countTxt)
// 아이템 영역 우하단: `${items.length}/${maxItemCount}` (TS.countTxtDark)
// hover 시: onItemClick 있으면 _showItemTip() (사용 버튼 포함), 없으면 일반 _showTip()
// 유물 tooltip: 사용 버튼 없음 (정보만 표시)
```

---

## PilePopupUI (src/ui/PilePopupUI.js)
덱/더미 카드 팝업. BattleScene/MarketScene 공용.

```js
popup.show(cards, title)  // cards: 카드 배열, title: 팝업 제목
popup.hide()
```

- 슈트별 행 분리, 카드 수가 많으면 멀티 행으로 자동 확장
- `maxPerRow = Math.floor(cardAreaW / GAP_X)` 로 행당 최대 카드 수 계산
- `rowOffset` 누적으로 슈트별 행 위치 계산
- 패널 높이를 totalRows 기반으로 동적 계산

---

## MarketScene
- **상점 구성**: relic 5개 + item 5개 (라운드별 rarity 가중치 적용)
- **버튼**: [카드관리] [상점갱신(5G)]
- **카드관리 팝업**: PilePopupUI 사용 (permanent 카드만 표시)
- **OPTIONS 버튼**: PlayerUI의 onOptions 콜백으로 표시 (별도 구현 없음)
- **카드 텍스처**: `preload()` + `create()` 초반에 `CardRenderer.createAll()` 호출
  → CONTINUE로 MarketScene 직행 시 카드가 까맣게 되는 버그 방지
- **툴팁**: `TooltipUI` 사용 (`_showShopTip` → `this._tooltip.update(...)`)

---

## CardRenderer.js
Canvas2D API로 52장 카드 텍스처를 런타임 생성.
> `RenderTexture.saveTexture()` + `rt.destroy()` 조합은 텍스처가 까맣게 되는 버그 — Canvas 방식 사용.
> 씬 재시작 시 `scene.textures.exists(key)` 체크로 중복 등록 방지.

카드 텍스처 키: `${suit}${rank}` (예: `SA`, `H10`, `DK`)

```js
CardRenderer.drawCard(scene, x, y, card, { width, height, depth, disabled, objs })
// 반환: { cardImg, sealImg } — cardImg: Image|Text, sealImg: Image|null
// disabled=true → `${key}_disabled` 텍스처 (회색) 사용
// objs 배열 전달 시 생성된 오브젝트 자동 push

CardRenderer.showSealTooltip(scene, card, cardX, cardY, cardH, depth)
// TooltipUI 사용. 씰 없는 카드는 표시 안 함.
CardRenderer.hideSealTooltip()
CardRenderer.preload(scene)   // sym_S/H/D/C + seal 이미지 로드
CardRenderer.createAll(scene) // 52장 + disabled 텍스처 생성
```

---

## 개발 서버
```bash
cd C:/Users/rundo/Rogue-Shuffle
npm run dev   # http://localhost:5173
```

## GitHub 저장소
https://github.com/joohyunKing/RogueShuffle
