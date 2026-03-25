import Phaser from "phaser";
import { calculateScore } from "../service/scoreService.js";
import {
  GW, GH, CW, CH, FIELD_CW, FIELD_CH, PILE_CW, PILE_CH,
  SUITS, RANKS, SUIT_ORDER,
  PLAYER_PANEL_W,
  BATTLE_LOG_H, MONSTER_AREA_TOP, MONSTER_AREA_H, MONSTER_IMG_Y,
  FIELD_Y, HAND_Y, HAND_TOP, DEAL_DELAY,
  context
} from "../constants.js";

import roundData from '../data/round.json';
import { RoundManager } from '../manager/roundManager.js';

//import { preloadMonsters, getAvailableMonstersByTier, TIER_REWARDS, createMonsterAnims } from "../monsters.js";
import { preloadMonsters, getAvailableMonstersByTier, TIER_REWARDS, createMonsterAnims } from "../service/monsterService.js";
import { writeSave, deleteSave } from "../save.js";
import { buildDeck, cloneCard, removeCardById } from "../service/cardService.js";
import { CardRenderer } from "../CardRenderer.js";
import { TS } from "../textStyles.js";
import { Player, getRequiredExp } from "../manager/playerManager.js";
import sfxShuffle from "../assets/audio/sfx/card-shuffle.ogg?url";
import sfxFan from "../assets/audio/sfx/card-fan-1.ogg?url";
import sfxSlide from "../assets/audio/sfx/card-slide-5.ogg?url";
import sfxPlace from "../assets/audio/sfx/card-place-1.ogg?url";
import sfxChop from "../assets/audio/sfx/chop.ogg?url";
import sfxKnifeSlice from "../assets/audio/sfx/knifeSlice.ogg?url";
import uiDeckUrl from "../assets/images/ui/deck.png?url";
import uiDummyUrl from "../assets/images/ui/dummy.png?url";
import uiOptionUrl from "../assets/images/ui/option.jpg?url";
import uiEndTurnUrl from "../assets/images/ui/end_turn.jpg?url";
import uiSortUrl from "../assets/images/ui/SuitRank.jpg?url";

// ─── 카드 생성  ────────────────────────────────────────────────────────────────────
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── 씬 ──────────────────────────────────────────────────────────────────────
export class GameScene extends Phaser.Scene {
  constructor() { super("GameScene"); }

  // ── preload ──────────────────────────────────────────────────────────────
  preload() {
    this.load.image("card_back", "/_card_back.png");
    CardRenderer.preload(this);
    preloadMonsters(this);
    this.load.audio("sfx_shuffle", sfxShuffle);
    this.load.audio("sfx_fan", sfxFan);
    this.load.audio("sfx_slide", sfxSlide);
    this.load.audio("sfx_place", sfxPlace);
    this.load.audio("sfx_chop", sfxChop);
    this.load.audio("sfx_knifeSlice", sfxKnifeSlice);
    if (!this.textures.exists("ui_deck")) this.load.image("ui_deck", uiDeckUrl);
    if (!this.textures.exists("ui_dummy")) this.load.image("ui_dummy", uiDummyUrl);
    if (!this.textures.exists("ui_option")) this.load.image("ui_option", uiOptionUrl);
    if (!this.textures.exists("ui_end_turn")) this.load.image("ui_end_turn", uiEndTurnUrl);
    if (!this.textures.exists("ui_sort")) this.load.image("ui_sort", uiSortUrl);
  }

  _sfx(key) {
    const sfxVol = (this.registry.get("sfxVolume") ?? 7) / 10;
    this.sound.play(key, { volume: sfxVol * 0.6 });
  }

  // ── create ───────────────────────────────────────────────────────────────
  create() {
    const data = this.scene.settings.data || {};

    // 라운드 결정
    const startRound = data.round ?? 1;

    // roundManager 생성
    this.roundManager = new RoundManager(roundData, startRound);

    // 필요하면 기존 코드 호환용
    this.round = this.roundManager.getRound();



    // 플레이어 (라운드 클리어 시 유지, 새 게임 시 levelConfig로 초기값 설정)
    this.player = new Player(data.player);

    // 카드 상태
    const deck = Phaser.Utils.Array.Shuffle(buildDeck());
    this.handData = deck.splice(0, this.player.handSize);
    const slotPos0 = this.calcFieldPositions(this.player.fieldSize);
    this.fieldData = deck.splice(0, this.player.fieldSize)
      .map((c, i) => ({ ...c, slotX: slotPos0[i].x }));
    this.deckData = deck;
    this.dummyData = [];

    // 컨텍스트 셋팅
    context.deckCount = deck.length;
    context.dummyCount = 0;

    // UI/게임 상태
    this.selected = new Set();
    this.cardObjs = [];
    this.monsterObjs = [];
    this._monsterSprites = [];
    this.animObjs = [];
    this._optOverlayObjs = null;
    this.isDragging = false;
    this.isDealing = true;
    this.fieldPickCount = 0;
    this.attackCount = 0;
    this.sortMode = null;
    this.sortAsc = true;
    this.battleLogLines = [];
    this._fullBattleLog = [];
    this._suitLevelUpCount = 0;
    this._logPopupObjs = null;

    // 몬스터 스폰
    this.monsters = this._spawnMonsters();

    CardRenderer.createAll(this);
    createMonsterAnims(this);

    // 볼륨 기본값 초기화
    if (this.registry.get("bgmVolume") == null) this.registry.set("bgmVolume", 7);
    if (this.registry.get("sfxVolume") == null) this.registry.set("sfxVolume", 7);

    this.drawBg();
    this.createUI();
    this.createSortButton();
    this.setupDrag();
    this.startDealAnimation();
  }

  // ── 몬스터 스폰 ──────────────────────────────────────────────────────────
  _spawnMonsters() {

    const { monsterTier, totalCost } = this.roundManager.getCurrentRoundData();

    console.log(monsterTier, totalCost);

    const pool = getAvailableMonstersByTier(monsterTier);
    const types = this._buildMonsterGroup(pool, totalCost[0], totalCost[1]);

    return types.map(type => {
      const hp = randInt(type.hp[0], type.hp[1]);
      const rewards = TIER_REWARDS[Math.min(type.tier, TIER_REWARDS.length - 1)];
      return {
        type,
        hp, maxHp: hp,
        atk: randInt(type.atk[0], type.atk[1]),
        def: randInt(type.def[0], type.def[1]),
        xp: randInt(rewards.xp[0], rewards.xp[1]),
        gold: randInt(rewards.gold[0], rewards.gold[1]),
        isDead: false,
      };
    });
  }

  // ── cost 예산 기반 몬스터 그룹 구성 (1~5마리) ─────────────────────────────
  _buildMonsterGroup(pool, minCost, maxCost) {
    if (!pool.length) return [];

    let remaining = randInt(minCost, maxCost);
    const result = [];

    while (result.length < 5 && remaining > 0) {
      const affordable = pool.filter(m => m.cost <= remaining);
      if (!affordable.length) break;

      const pick = affordable[Math.floor(Math.random() * affordable.length)];
      result.push(pick);
      remaining -= pick.cost;
    }

    // 최소 1마리 보장 (예산이 가장 싼 몬스터 cost보다 작을 경우 대비)
    if (result.length === 0) {
      const cheapest = [...pool].sort((a, b) => a.cost - b.cost)[0];
      result.push(cheapest);
    }

    return result;
  }

  // ── 배경 & 패널 ──────────────────────────────────────────────────────────
  drawBg() {
    const g = this.add.graphics();
    const PW = PLAYER_PANEL_W;
    const CX = PW + 10;          // 컨텐츠 영역 패널 시작 X
    const CW_ = GW - PW - 20;   // 컨텐츠 영역 패널 폭

    // 전체 배경
    g.fillStyle(0x1a472a);
    g.fillRect(0, 0, GW, GH);

    // ── 왼쪽 플레이어 패널 ─────────────────────────────────────────────
    g.fillStyle(0x0e2218);
    g.fillRect(0, 0, PW - 4, GH);
    g.lineStyle(1, 0x2a5a38);
    g.strokeRect(0, 0, PW - 4, GH);

    // ── 배틀 로그 바 (컨텐츠 상단) ────────────────────────────────────
    g.fillStyle(0x0a1a10);
    g.fillRect(PW, 0, GW - PW, BATTLE_LOG_H);
    g.lineStyle(1, 0x2a5a38);
    g.strokeRect(PW, 0, GW - PW, BATTLE_LOG_H);

    // ── 몬스터 영역 ───────────────────────────────────────────────────
    g.fillStyle(0x112a1a);
    g.fillRoundedRect(CX, MONSTER_AREA_TOP, CW_, MONSTER_AREA_H, 10);
    g.lineStyle(1, 0x2a5038);
    g.strokeRoundedRect(CX, MONSTER_AREA_TOP, CW_, MONSTER_AREA_H, 10);

    // ── 필드 패널 ─────────────────────────────────────────────────────
    const fpY = FIELD_Y - FIELD_CH / 2 - 18;
    g.fillStyle(0x155226);
    g.fillRoundedRect(CX, fpY, CW_, FIELD_CH + 36, 12);
    g.lineStyle(2, 0x2d7a3a);
    g.strokeRoundedRect(CX, fpY, CW_, FIELD_CH + 36, 12);

    // ── 핸드 패널 ─────────────────────────────────────────────────────
    const hpY = HAND_Y - CH / 2 - 18;
    g.fillStyle(0x155226);
    g.fillRoundedRect(CX, hpY, CW_, CH + 36, 12);
    g.lineStyle(2, 0x2d7a3a);
    g.strokeRoundedRect(CX, hpY, CW_, CH + 36, 12);
  }

  // ── UI 생성 (한 번만) ─────────────────────────────────────────────────────
  createUI() {
    const PW = PLAYER_PANEL_W;
    const px = 10;
    const pcx = PW / 2 - 2;

    // JOB
    this.add.text(pcx, 14, this.player.job.toUpperCase(), {
      fontFamily: "'PressStart2P', Arial", fontSize: '9px', color: '#ffdd88',
    }).setOrigin(0.5, 0).setDepth(12);

    // ROUND
    this.add.text(px, 36, "ROUND", TS.infoLabel).setDepth(12);
    this.roundTxt = this.add.text(PW - 14, 36, String(this.round), TS.levelValue)
      .setOrigin(1, 0).setDepth(12);

    // GOLD
    this.add.text(px, 54, "GOLD", TS.infoLabel).setDepth(12);
    this.goldTxt = this.add.text(PW - 14, 54, `${this.player.gold}`, TS.levelValue)
      .setOrigin(1, 0).setDepth(12);

    // LV
    this.add.text(px, 72, "LV", TS.infoLabel).setDepth(12);
    this._playerLevelTxt = this.add.text(PW - 14, 72, String(this.player.level), TS.levelValue)
      .setOrigin(1, 0).setDepth(12);

    // XP 바
    this._xpBarBg = this.add.rectangle(px, 90, PW - 24, 5, 0x224433).setOrigin(0, 0.5).setDepth(12);
    this._xpBarFill = this.add.rectangle(px, 90, 1, 5, 0x44ddaa).setOrigin(0, 0.5).setDepth(13);

    // 구분선
    this.add.rectangle(pcx, 102, PW - 20, 1, 0x2a5a38).setDepth(12);

    // HP
    this.add.text(px, 110, "HP", TS.infoLabel).setDepth(12);
    this.playerHpTxt = this.add.text(px + 22, 110, "", TS.playerHp).setDepth(12);
    this._hpBarBg = this.add.rectangle(px, 128, PW - 24, 7, 0x2a3a2a).setOrigin(0, 0.5).setDepth(12);
    this._hpBarFill = this.add.rectangle(px, 128, 1, 7, 0xdd3333).setOrigin(0, 0.5).setDepth(13);

    // DEF
    this.add.text(px, 138, "DEF", TS.infoLabel).setDepth(12);
    this.playerDefTxt = this.add.text(px + 32, 138, "", TS.playerDef).setDepth(12);

    // 구분선
    this.add.rectangle(pcx, 162, PW - 20, 1, 0x2a5a38).setDepth(12);

    // 슈트 레벨 (크게, 1열 배치)
    const SUIT_COLORS = { S: '#aaaaff', H: '#ff6666', D: '#ff9966', C: '#aaffaa' };
    const SUIT_SYMS = { S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663' };
    const SUIT_KEYS = ['S', 'H', 'D', 'C'];
    this._attrTxts = {};
    this._suitUpBtns = {};
    SUIT_KEYS.forEach((suit, idx) => {
      const sy = 172 + idx * 28;
      // 심볼
      this.add.text(px, sy, SUIT_SYMS[suit],
        { fontFamily: 'Arial', fontSize: '18px', color: SUIT_COLORS[suit] }).setDepth(12);
      // Lv 텍스트
      this._attrTxts[suit] = this.add.text(px + 26, sy + 2,
        `Lv${this.player.attrs[suit]}`,
        { fontFamily: "'PressStart2P', Arial", fontSize: '11px', color: SUIT_COLORS[suit] })
        .setDepth(12);
      // ▲ 버튼 (레벨업 가능 시 표시)
      const btnX = PW - 28;
      const btnBg = this.add.rectangle(btnX, sy + 8, 38, 22, 0x2a6644)
        .setDepth(12).setInteractive().setVisible(false);
      const btnTxt = this.add.text(btnX, sy + 8, '\u25b2',
        { fontFamily: 'Arial', fontSize: '13px', color: '#aaffcc' })
        .setOrigin(0.5).setDepth(13).setVisible(false);
      btnBg.on('pointerdown', () => {
        if (this._suitLevelUpCount <= 0) return;
        this.player.attrs[suit]++;
        this._suitLevelUpCount--;
        this.addBattleLog(`${SUIT_SYMS[suit]} 적응 Lv${this.player.attrs[suit]}!`);
        this.refreshPlayerLevel();
      });
      btnBg.on('pointerover', () => btnBg.setFillStyle(0x3a8855));
      btnBg.on('pointerout', () => btnBg.setFillStyle(0x2a6644));
      this._suitUpBtns[suit] = { bg: btnBg, txt: btnTxt };
    });

    // ── 툴팁 (덱/더미 hover용) ──────────────────────────────────────────
    this._tooltipBg = this.add.rectangle(0, 0, 70, 26, 0x000000, 0.85).setDepth(200).setVisible(false);
    this._tooltipTxt = this.add.text(0, 0, "", { fontFamily: "'PressStart2P', Arial", fontSize: '9px', color: '#ffffff' })
      .setOrigin(0.5).setDepth(201).setVisible(false);

    // 배틀 로그 (컨텐츠 영역 중앙)
    const contentCX = PW + (GW - PW) / 2;
    this.logTxt = this.add.text(contentCX, BATTLE_LOG_H / 2, "", TS.log)
      .setOrigin(0.5).setDepth(10);

    // 배틀 로그 클릭 → 전체 로그 팝업
    const logHit = this.add.rectangle(contentCX, BATTLE_LOG_H / 2, GW - PW, BATTLE_LOG_H, 0xffffff, 0)
      .setDepth(15).setInteractive();
    logHit.on('pointerdown', () => this._showBattleLogPopup());
    logHit.on('pointerover', () => this.logTxt.setStyle({ color: '#ffffff' }));
    logHit.on('pointerout', () => this.logTxt.setStyle({ color: '#ffcc44' }));

    // 임시 메시지 (팝업)
    this.msgTxt = this.add.text(contentCX, BATTLE_LOG_H + 8, "", TS.msg)
      .setOrigin(0.5, 0).setDepth(100);

    // 족보 프리뷰
    const preY = HAND_Y + CH / 2 + 14;
    this.previewLabelTxt = this.add.text(contentCX - 10, preY, "", TS.comboLabel).setOrigin(1, 0).setDepth(50);
    this.previewScoreTxt = this.add.text(contentCX + 10, preY, "", TS.comboScore).setOrigin(0, 0).setDepth(50);

    // ── OPTIONS 버튼 (우측 상단) ────────────────────────────────────────
    const optBg = this.add.rectangle(GW - 52, 22, 84, 32, 0x335566).setDepth(60).setInteractive();
    this.add.text(GW - 52, 22, "OPT", TS.menuBtn).setOrigin(0.5).setDepth(61);
    optBg.on("pointerdown", () => this._showOptions());
    optBg.on("pointerover", () => optBg.setFillStyle(0x446688));
    optBg.on("pointerout", () => optBg.setFillStyle(0x335566));

    // ── TURN END 버튼 (핸드 우측, 바닥 정렬) ────────────────────────────
    const turnBtnX = GW - 72;
    const turnBtnBottom = HAND_Y + CH / 2;
    const turnBtnH = 130;
    const turnBtnY = turnBtnBottom - turnBtnH / 2;
    this.turnEndBtn = this.add.rectangle(turnBtnX, turnBtnY, 110, turnBtnH, 0xaa6600)
      .setDepth(60).setInteractive();
    this.add.text(turnBtnX, turnBtnY, "TURN\nEND", TS.turnEndBtn).setOrigin(0.5).setDepth(61);
    this.turnEndBtn.on("pointerdown", () => { if (!this.isDealing) this.onTurnEnd(); });
    this.turnEndBtn.on("pointerover", () => this.turnEndBtn.setFillStyle(0xdd8800));
    this.turnEndBtn.on("pointerout", () => this.turnEndBtn.setFillStyle(0xaa6600));

    // 공격 횟수 표시 (TURN END 버튼 위)
    this._attackTxt = this.add.text(turnBtnX, turnBtnY - turnBtnH / 2 - 8, "", TS.infoLabel)
      .setOrigin(0.5, 1).setDepth(61);

    this.refreshPlayerStats();
  }

  // ── 정렬 버튼 (통합, 핸드 위 중앙) ──────────────────────────────────────
  createSortButton() {
    const sortY = HAND_Y - CH / 2 - 14;
    const sortCX = PLAYER_PANEL_W + (GW - PLAYER_PANEL_W) / 2;
    this.sortBg = this.add.rectangle(sortCX, sortY, 110, 22, 0x335544).setDepth(60).setInteractive();
    this.sortTxt = this.add.text(sortCX, sortY, "SORT", TS.sortBtn).setOrigin(0.5).setDepth(61);
    this.sortBg.on("pointerdown", () => {
      if (this.isDealing) return;
      const nextMode = this.sortMode === "suit" ? "rank" : "suit";
      this.sortBy(nextMode);
    });
    this.sortBg.on("pointerover", () => this.sortBg.setFillStyle(0x447766));
    this.sortBg.on("pointerout", () => this.refreshSortBtns());
  }

  refreshSortBtns() {
    const label = this.sortMode === "suit" ? "SUIT ▲" : this.sortMode === "rank" ? "RANK ▲" : "SORT";
    this.sortTxt?.setText(label);
    this.sortBg?.setFillStyle(this.sortMode ? 0x227744 : 0x335544);
  }

  // ── 딜링 애니메이션 ──────────────────────────────────────────────────────
  startDealAnimation() {
    this._sfx("sfx_shuffle");
    const deckX = PLAYER_PANEL_W + 50, deckY = FIELD_Y;   // renderDeckPile 과 동일 위치

    for (let i = Math.min(8, 51); i >= 0; i--) {
      this.animObjs.push(
        this.add.image(deckX - i * 2, deckY - i * 2, "card_back").setDisplaySize(CW, CH).setDepth(i)
      );
    }

    const handPos = this.calcHandPositions(this.player.handSize);
    let delay = 300;

    this.handData.forEach((card, i) => {
      this.time.delayedCall(delay, () => this.flyCard(card, deckX, deckY, handPos[i].x, handPos[i].y));
      delay += DEAL_DELAY;
    });
    // fieldData 는 slotX 를 이미 보유 중
    this.fieldData.forEach(card => {
      this.time.delayedCall(delay, () => this.flyCard(card, deckX, deckY, card.slotX, FIELD_Y));
      delay += DEAL_DELAY;
    });

    this.time.delayedCall(delay + 550, () => {
      this.animObjs.forEach(o => o.destroy());
      this.animObjs = [];
      this.isDealing = false;
      this._applySortToHand();  // 기본 rank 정렬
      this.render();
    });
  }

  flyCard(cardData, fromX, fromY, toX, toY) {
    const img = this.add.image(fromX, fromY, "card_back").setDisplaySize(CW, CH).setDepth(200);
    this.animObjs.push(img);
    this.tweens.add({
      targets: img, x: toX, y: toY, duration: 320, ease: "Power2.Out",
      onComplete: () => {
        this.tweens.add({
          targets: img, displayWidth: 1, duration: 70, ease: "Linear",
          onComplete: () => {
            img.setTexture(cardData.key);
            img.setDisplaySize(1, CH);
            this.tweens.add({ targets: img, displayWidth: CW, duration: 70, ease: "Linear" });
          },
        });
      },
    });
  }

  // ── 위치 계산 ────────────────────────────────────────────────────────────
  calcFieldPositions(count) {
    const PW = PLAYER_PANEL_W;
    const gap = 14, areaW = GW - PW - 160;
    const totalW = count * FIELD_CW + (count - 1) * gap;
    const x0 = PW + 40 + FIELD_CW / 2 + (areaW - totalW) / 2;
    return Array.from({ length: count }, (_, i) => ({ x: x0 + i * (FIELD_CW + gap), y: FIELD_Y }));
  }

  calcHandPositions(count) {
    if (count === 0) return [];
    const PW = PLAYER_PANEL_W;
    const gap = 14, areaW = GW - PW - 160;
    const spacing = count === 1 ? 0 : Math.min(CW + gap, (areaW - CW) / (count - 1));
    const x0 = PW + 40 + CW / 2 + (areaW - (CW + spacing * (count - 1))) / 2;
    return Array.from({ length: count }, (_, i) => ({ x: x0 + i * spacing, y: HAND_Y }));
  }

  calcMonsterPositions(count) {
    const PW = PLAYER_PANEL_W;
    const cx = PW + (GW - PW) / 2;
    if (count <= 1) return [{ x: cx }];
    const margin = 120;
    const gap = Math.min(480, Math.floor((GW - PW - margin * 2) / (count - 1)));
    const x0 = Math.round(cx - gap * (count - 1) / 2);
    return Array.from({ length: count }, (_, i) => ({ x: x0 + i * gap }));
  }

  // ── 드래그 ───────────────────────────────────────────────────────────────
  setupDrag() {
    this.input.on("dragstart", (pointer, obj) => {
      if (this.isDealing) return;
      this._sfx("sfx_slide");
      this.isDragging = true;
      obj.setDepth(200);
      obj.setDisplaySize(Math.round(CW * 0.9), Math.round(CH * 0.9));
      const idx = this.cardObjs.indexOf(obj);
      if (idx !== -1) this.cardObjs.splice(idx, 1);
    });
    this.input.on("drag", (pointer, obj, dragX, dragY) => {
      obj.x = dragX; obj.y = dragY;
    });
    this.input.on("dragend", (pointer, obj) => {
      this.isDragging = false;
      if (pointer.y >= HAND_TOP) {
        const cardData = obj.getData("cardData");
        const fieldIdx = obj.getData("fieldIndex");
        if (this.handData.length >= this.player.handSizeLimit) {
          this._snapBack(obj);
          return;
        }
        // 드롭 X 위치를 기준으로 삽입 인덱스 결정
        const newPositions = this.calcHandPositions(this.handData.length + 1);
        const insertIdx = newPositions.findIndex(p => pointer.x < p.x);
        const handInsert = insertIdx === -1 ? this.handData.length : insertIdx;

        this.fieldData.splice(fieldIdx, 1);
        this.handData.splice(handInsert, 0, cardData);
        this.fieldPickCount++;
        this.selected.clear();
        obj.destroy();
        this.render();
      } else {
        this._snapBack(obj);
      }
    });
  }

  _snapBack(obj) {
    this.tweens.add({
      targets: obj,
      x: obj.getData("origX"),
      y: obj.getData("origY"),
      displayWidth: obj.getData("origW") ?? FIELD_CW,
      displayHeight: obj.getData("origH") ?? FIELD_CH,
      duration: 200,
      ease: "Back.Out",
      onComplete: () => { obj.destroy(); this.render(); },
    });
  }

  // ── 전체 렌더 ────────────────────────────────────────────────────────────
  render() {
    this.cardObjs.forEach(o => o.destroy());
    this.cardObjs = [];
    this.monsterObjs.forEach(o => o.destroy());
    this.monsterObjs = [];
    this._monsterSprites.forEach(s => s?.destroy());
    this._monsterSprites = [];

    this.renderDeckPile();
    this.renderDummyPile();
    this.renderField();
    this.renderHand();
    this.renderMonsters();
    this.updatePreview();
    this.refreshSortBtns();
    this.refreshPlayerStats();
    this.refreshAttackCount();
    this.refreshBattleLog();
  }

  renderDeckPile() {
    const x = PLAYER_PANEL_W + 50, y = FIELD_Y;
    const count = this.deckData.length;
    const imgH = FIELD_CH, imgW = Math.round(imgH * 0.72);

    const bg = this.add.rectangle(x, y, imgW, imgH, 0x223344).setDepth(10);
    this.add.rectangle(x, y, imgW, imgH, 0x000000, 0).setStrokeStyle(1, 0x445566).setDepth(11);
    const label = this.add.text(x, y - 10, "DECK", { fontFamily: "'PressStart2P',Arial", fontSize: '8px', color: '#88bbcc' }).setOrigin(0.5).setDepth(11);
    const cntTxt = this.add.text(x, y + 10, `${count}`, { fontFamily: "'PressStart2P',Arial", fontSize: '12px', color: '#aaffcc' }).setOrigin(0.5).setDepth(11);
    this.cardObjs.push(bg, label, cntTxt);

    const hit = this.add.rectangle(x, y, imgW + 10, imgH + 20, 0xffffff, 0)
      .setDepth(12).setInteractive();
    hit.on("pointerover", () => {
      this._tooltipTxt.setText(`DECK: ${count}`);
      this._tooltipBg.setPosition(x, y - imgH / 2 - 18);
      this._tooltipTxt.setPosition(x, y - imgH / 2 - 18);
      this._tooltipBg.setVisible(true).setDisplaySize(this._tooltipTxt.width + 16, 26);
      this._tooltipTxt.setVisible(true);
    });
    hit.on("pointerout", () => {
      this._tooltipBg.setVisible(false);
      this._tooltipTxt.setVisible(false);
    });
    this.cardObjs.push(hit);
  }

  renderDummyPile() {
    const x = GW - 60, y = FIELD_Y;
    const count = this.dummyData.length;
    const imgH = FIELD_CH, imgW = Math.round(imgH * 0.72);

    const bg = this.add.rectangle(x, y, imgW, imgH, 0x332211).setDepth(10);
    this.add.rectangle(x, y, imgW, imgH, 0x000000, 0).setStrokeStyle(1, 0x665544).setDepth(11);
    const label = this.add.text(x, y - 10, "USED", { fontFamily: "'PressStart2P',Arial", fontSize: '8px', color: '#ccbb88' }).setOrigin(0.5).setDepth(11);
    const cntTxt = this.add.text(x, y + 10, `${count}`, { fontFamily: "'PressStart2P',Arial", fontSize: '12px', color: '#ffccaa' }).setOrigin(0.5).setDepth(11);
    this.cardObjs.push(bg, label, cntTxt);

    const hit = this.add.rectangle(x, y, imgW + 10, imgH + 20, 0xffffff, 0)
      .setDepth(12).setInteractive();
    hit.on("pointerover", () => {
      this._tooltipTxt.setText(`USED: ${count}`);
      this._tooltipBg.setPosition(x, y - imgH / 2 - 18);
      this._tooltipTxt.setPosition(x, y - imgH / 2 - 18);
      this._tooltipBg.setVisible(true).setDisplaySize(this._tooltipTxt.width + 16, 26);
      this._tooltipTxt.setVisible(true);
    });
    hit.on("pointerout", () => {
      this._tooltipBg.setVisible(false);
      this._tooltipTxt.setVisible(false);
    });
    this.cardObjs.push(hit);
  }

  renderField() {
    const canPick = this.fieldPickCount < this.player.fieldPickLimit;

    this.fieldData.forEach((card, i) => {
      const x = card.slotX;   // 딜 시 고정된 슬롯 위치 사용
      const img = this.add.image(x, FIELD_Y, card.key).setDisplaySize(FIELD_CW, FIELD_CH).setDepth(10);

      if (canPick) {
        img.setInteractive({ draggable: true });
        img.setData("fieldIndex", i);
        img.setData("cardData", card);
        img.setData("origX", x);
        img.setData("origY", FIELD_Y);
        img.setData("origW", FIELD_CW);
        img.setData("origH", FIELD_CH);
        img.on("pointerover", () => { if (!this.isDragging) { this.tweens.add({ targets: img, y: FIELD_Y - 12, duration: 100 }); img.setDepth(20); } });
        img.on("pointerout", () => { if (!this.isDragging) { this.tweens.add({ targets: img, y: FIELD_Y, duration: 100 }); img.setDepth(10); } });
      } else {
        img.setAlpha(0.45);
      }
      this.cardObjs.push(img);
    });
  }

  renderHand() {
    if (this.handData.length === 0) return;
    const positions = this.calcHandPositions(this.handData.length);

    const combo = this._getSelectedCombo();
    const comboCardSet = new Set(combo.cards ?? []);
    const hasValidCombo = combo.score > 0;

    this.handData.forEach((card, i) => {
      const sel = this.selected.has(i);
      const inCombo = sel && hasValidCombo && comboCardSet.has(card);
      const x = positions[i].x;
      const y = sel ? HAND_Y - 22 : HAND_Y;

      const img = this.add.image(x, y, card.key)
        .setDisplaySize(CW, CH).setDepth(sel ? 32 : 30).setInteractive();
      img.on("pointerdown", () => { if (!this.isDragging && !this.isDealing) this.toggleHand(i); });
      this.cardObjs.push(img);

      // 족보 구성 카드만 진동
      if (inCombo) {
        this.tweens.add({
          targets: img,
          x: { from: x - 3, to: x + 3 },
          duration: 55,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    });
  }

  // ── 몬스터 렌더 ──────────────────────────────────────────────────────────
  renderMonsters() {
    const positions = this.calcMonsterPositions(this.monsters.length);
    const hasCombo = this._getSelectedCombo().score > 0
      && this.attackCount < this.player.attacksPerTurn;
    const imgW = 96, imgH = 124;

    this.monsters.forEach((mon, idx) => {
      const x = positions[idx].x;
      const texKey = `mon_${mon.type.id}`;

      // ── 스프라이트 (idle / death 애니메이션) ─────────────────────────
      let monSprite;
      if (this.textures.exists(texKey)) {
        monSprite = this.add.sprite(x, MONSTER_IMG_Y, texKey)
          .setDisplaySize(imgW, imgH).setDepth(15);

        if (mon.isDead) {
          if (!mon.deathAnimDone) {
            const deathKey = `${texKey}_death`;
            if (this.anims.exists(deathKey)) monSprite.play(deathKey);
            monSprite.once('animationcomplete', () => { mon.deathAnimDone = true; });
            // 스프라이트가 render로 먼저 파괴될 때를 대비한 타이머
            this.time.delayedCall(600, () => { mon.deathAnimDone = true; });
          } else {
            monSprite.setFrame(11); // death 마지막 프레임 고정
          }
        } else {
          const idleKey = `${texKey}_idle`;
          if (this.anims.exists(idleKey)) monSprite.play(idleKey);
        }
      } else {
        monSprite = this.add.rectangle(
          x, MONSTER_IMG_Y, imgW, imgH,
          [0x886622, 0x226688, 0x662288, 0x228866][idx % 4]
        ).setDepth(15);
      }
      this._monsterSprites[idx] = monSprite;

      if (mon.isDead) {
        this.monsterObjs.push(
          this.add.rectangle(x, MONSTER_IMG_Y, imgW + 4, imgH + 4, 0x000000, 0.55).setDepth(16),
          this.add.text(x, MONSTER_IMG_Y, "X", TS.monDead).setOrigin(0.5).setDepth(17)
        );
        return;
      }

      // 스탯 텍스트
      this.monsterObjs.push(
        this.add.text(x, MONSTER_IMG_Y + imgH / 2 + 8,
          `HP ${mon.hp}/${mon.maxHp}  ATK ${mon.atk}  DEF ${mon.def}`, TS.monStat)
          .setOrigin(0.5, 0).setDepth(16)
      );

      // HP 바
      const barW = 100;
      const hpRatio = Math.max(0, mon.hp / mon.maxHp);
      this.monsterObjs.push(
        this.add.rectangle(x, MONSTER_IMG_Y + imgH / 2 + 28, barW, 7, 0x2a2a2a).setDepth(16),
        this.add.rectangle(x - barW / 2, MONSTER_IMG_Y + imgH / 2 + 28, Math.max(1, barW * hpRatio), 7, 0xdd3333)
          .setOrigin(0, 0.5).setDepth(17)
      );

      // 공격 타겟
      if (hasCombo) {
        this.monsterObjs.push(
          this.add.text(x, MONSTER_IMG_Y - imgH / 2 - 24, "ATTACK!", TS.monTarget)
            .setOrigin(0.5, 1).setDepth(18)
        );
        const hit = this.add.rectangle(x, MONSTER_IMG_Y + imgH / 2 - 10, imgW + 20, imgH + 60, 0x000000, 0)
          .setDepth(19).setInteractive();
        hit.on("pointerdown", () => { if (!this.isDealing) this.attackMonster(idx); });
        this.monsterObjs.push(hit);
      }
    });
  }

  // ── 족보 계산 헬퍼 ───────────────────────────────────────────────────────
  _getSelectedCombo() {
    if (this.selected.size === 0) return { score: 0, handName: "" };
    //return calcScore([...this.selected].map(i => this.handData[i]));
    return calculateScore([...this.selected].map(i => this.handData[i]), context);
  }

  // ── 족보 프리뷰 ──────────────────────────────────────────────────────────
  updatePreview() {
    const { score, handName } = this._getSelectedCombo();
    if (score > 0) {
      this.previewLabelTxt.setText(`${handName}  →`).setColor("#88ffaa");
      this.previewScoreTxt.setText(`${score}점`).setColor("#ffdd66");
    } else if (handName) {
      this.previewLabelTxt.setText(handName).setColor("#ff9966");
      this.previewScoreTxt.setText("");
    } else {
      this.previewLabelTxt.setText("");
      this.previewScoreTxt.setText("");
    }
  }

  // ── 공격 횟수 표시 갱신 ──────────────────────────────────────────────────
  refreshAttackCount() {
    const used = this.attackCount;
    const max = this.player.attacksPerTurn;
    this._attackTxt.setText(`ATK ${used}/${max}`);
    this._attackTxt.setColor(used >= max ? '#ff6666' : '#aaffcc');
  }

  // ── 플레이어 스탯 갱신 ───────────────────────────────────────────────────
  refreshPlayerStats() {
    const p = this.player;
    const PW = PLAYER_PANEL_W;
    const barW = PW - 24;
    this.playerHpTxt.setText(`${p.hp}/${p.maxHp}`);
    this.playerDefTxt.setText(`${p.def}`);
    const ratio = Math.max(0, p.hp / p.maxHp);
    this._hpBarFill.setDisplaySize(Math.max(1, barW * ratio), 7);
    this._hpBarFill.setFillStyle(ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xddaa00 : 0xdd3333);
    this.refreshPlayerLevel();
    this.goldTxt.setText(`${p.gold}`);
  }

  // ── 플레이어 레벨 / XP 갱신 ──────────────────────────────────────────────
  refreshPlayerLevel() {
    const p = this.player;
    const req = getRequiredExp(p.level);
    const xpFill = Math.max(1, Math.round((PLAYER_PANEL_W - 24) * Math.min(1, p.xp / req)));
    this._playerLevelTxt.setText(String(p.level));
    this._xpBarFill.setDisplaySize(xpFill, 5);
    // 슈트 레벨 텍스트 갱신
    ['S', 'H', 'D', 'C'].forEach(s => {
      this._attrTxts[s]?.setText(`Lv${p.attrs[s]}`);
    });
    // ▲ 버튼은 사용하지 않음 (레벨업 팝업으로 대체)
  }

  // ── 배틀 로그 ────────────────────────────────────────────────────────────
  addBattleLog(text) {
    this._fullBattleLog.push(text);
    this.battleLogLines.push(text);
    if (this.battleLogLines.length > 4) this.battleLogLines.shift();
    this.refreshBattleLog();
  }

  refreshBattleLog() {
    this.logTxt.setText(this.battleLogLines.slice(-2).join("  |  "));
  }

  // ── 핸드 선택 토글 ───────────────────────────────────────────────────────
  toggleHand(i) {
    this._sfx("sfx_place");
    this.selected.has(i) ? this.selected.delete(i) : this.selected.add(i);
    this.render();
  }

  // ── 카드를 dummy 파일로 날리는 애니메이션 (필드 교체용) ──────────────────
  _flyToDummy(fromX, fromY, key = "card_back") {
    this._sfx("sfx_fan");
    const img = this.add.image(fromX, fromY, key).setDisplaySize(CW, CH).setDepth(200);
    this.tweens.add({
      targets: img,
      x: GW - 60, y: FIELD_Y,
      displayWidth: CW * 0.3,
      displayHeight: CH * 0.3,
      alpha: 0,
      duration: 380,
      ease: "Power2.In",
      onComplete: () => img.destroy(),
    });
  }

  // ── 공격 카드: 몬스터로 날아가 50%까지 축소 → dummy로 이동 ───────────────
  _throwCardAtMonster(fromX, fromY, key, monX) {
    this._sfx("sfx_fan");
    const img = this.add.image(fromX, fromY, key).setDisplaySize(CW, CH).setDepth(200);
    this.tweens.add({
      targets: img,
      x: monX,
      y: MONSTER_IMG_Y,
      displayWidth: CW * 0.5,
      displayHeight: CH * 0.5,
      duration: 280,
      ease: "Power2.In",
      onComplete: () => {
        this.tweens.add({
          targets: img,
          x: GW - 80,
          y: FIELD_Y,
          displayWidth: CW * 0.15,
          displayHeight: CH * 0.15,
          alpha: 0,
          duration: 220,
          ease: "Power2.In",
          onComplete: () => img.destroy(),
        });
      },
    });
  }

  // ── 몬스터 공격 시각 효과 ────────────────────────────────────────────────
  _showMonsterAttack(monIdx, damage) {
    const positions = this.calcMonsterPositions(this.monsters.length);
    const mX = positions[monIdx]?.x ?? GW / 2;

    // 빨간 화면 플래시
    const flash = this.add.rectangle(GW / 2, GH / 2, GW, GH, 0xcc0000, 0.22).setDepth(500);
    this.tweens.add({
      targets: flash, alpha: 0, duration: 480,
      onComplete: () => flash.destroy(),
    });
    this._sfx("sfx_chop");

    // 데미지 수치가 몬스터 → 플레이어 HP 쪽으로 날아옴
    const label = damage > 0 ? `-${damage} HP` : "BLOCKED!";
    const txtStyle = damage > 0 ? TS.damageHit : TS.damageBlocked;
    const txt = this.add.text(mX, MONSTER_AREA_TOP + MONSTER_AREA_H + 8, label, txtStyle)
      .setOrigin(0.5, 0).setDepth(501);

    this.tweens.add({
      targets: txt,
      y: 128,
      alpha: 0,
      duration: 480,
      delay: 80,
      ease: "Power1.In",
      onComplete: () => txt.destroy(),
    });
  }

  // ── 내부 정렬 (UI 상태 변경 없이 handData 만 정렬) ───────────────────────
  _applySortToHand() {
    if (this.sortMode === null) {
      this.sortMode = "rank";
      this.sortAsc = true;
    }

    this.doSorting(this.sortMode);
  }

  // ── 정렬 버튼 클릭 (토글 + 렌더) ─────────────────────────────────────────
  sortBy(mode) {
    this.sortMode === mode
      ? (this.sortAsc = !this.sortAsc)
      : (this.sortMode = mode, this.sortAsc = true);

    this.doSorting(mode);

    this.selected.clear();
    this.render();
  }

  doSorting(mode) {
    if (mode === "suit") {
      this.handData.sort((a, b) => {
        const sd = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
        return sd !== 0
          ? (this.sortAsc ? sd : -sd)
          : (this.sortAsc ? RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank) : RANKS.indexOf(b.rank) - RANKS.indexOf(a.rank));
      });
    } else {
      this.handData.sort((a, b) => {
        const vd = RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank);
        return vd !== 0
          ? (this.sortAsc ? vd : -vd)
          : (this.sortAsc ? SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] : SUIT_ORDER[b.suit] - SUIT_ORDER[a.suit]);
      });
    }

  }

  // ── 몬스터 공격 ──────────────────────────────────────────────────────────
  attackMonster(monIdx) {
    const mon = this.monsters[monIdx];
    if (!mon || mon.isDead || this.isDealing) return;

    // 컨텍스트 셋팅
    context.deckCount = this.deckData.length;
    context.dummyCount = this.dummyData.length;

    const { score, handName } = this._getSelectedCombo();
    if (score <= 0) return;

    if (this.attackCount >= this.player.attacksPerTurn) {
      this.addBattleLog(`이번 턴 공격 횟수 초과! (${this.player.attacksPerTurn}회)`);
      return;
    }
    this.attackCount++;

    // ── suit 적응 효과 ──────────────────────────────────────────────────
    const suitCounts = { S: 0, H: 0, D: 0, C: 0 };
    [...this.selected].forEach(i => { suitCounts[this.handData[i].suit]++; });
    const suitEff = (s) => Math.floor(
      this.player.attrs[s] * this.player.adaptability[s] * suitCounts[s]
    );

    // Spade: 몬스터 방어 감소 (음수 가능 → 데미지 보너스)
    if (suitCounts.S > 0) {
      const eff = suitEff('S');
      mon.def -= eff;
      if (eff > 0) this.addBattleLog(`\u2660 적응: ${mon.type.name} DEF -${eff}`);
    }
    // Clubs: 몬스터 공격력 감소 (최소 0)
    if (suitCounts.C > 0) {
      const eff = suitEff('C');
      const reduced = Math.min(eff, mon.atk);
      mon.atk = Math.max(0, mon.atk - eff);
      if (reduced > 0) this.addBattleLog(`\u2663 적응: ${mon.type.name} ATK -${reduced}`);
    }

    // 데미지 계산 (mon.def 음수이면 score에서 빼도 데미지 증가)
    const damage = score - mon.def;
    const prevHp = mon.hp;
    mon.hp = Math.max(0, mon.hp - Math.max(0, damage));
    const overkill = Math.max(0, damage - prevHp);  // 남은 초과 데미지
    this.player.score += score;

    // Hearts: 플레이어 HP 회복
    if (suitCounts.H > 0) {
      const eff = suitEff('H');
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + eff);
      if (eff > 0) this.addBattleLog(`\u2665 적응: HP +${eff}`);
    }
    // Diamonds: 플레이어 방어 추가
    if (suitCounts.D > 0) {
      const eff = suitEff('D');
      this.player.def += eff;
      if (eff > 0) this.addBattleLog(`\u2666 적응: DEF +${eff}`);
    }

    this.addBattleLog(`${mon.type.name}에게 ${handName}로 ${Math.max(0, damage)} 데미지!`);
    this._sfx("sfx_knifeSlice");

    // 선택 카드 → 몬스터를 향해 던진 후 dummy로 이동
    const monX = this.calcMonsterPositions(this.monsters.length)[monIdx].x;
    const handPositions = this.calcHandPositions(this.handData.length);
    [...this.selected].forEach(i => {
      this._throwCardAtMonster(handPositions[i].x, HAND_Y - 22, this.handData[i].key, monX);
    });
    const usedCards = [...this.selected].sort((a, b) => b - a)
      .map(i => this.handData.splice(i, 1)[0]);
    this.dummyData.push(...usedCards);
    this.selected.clear();

    // 공격 애니메이션 재생 후 결과 처리
    const sprite = this._monsterSprites?.[monIdx];
    const atkKey = `mon_${mon.type.id}_attack`;
    const ANIM_DUR = 400; // 4 frames × 10fps

    if (sprite instanceof Phaser.GameObjects.Sprite && this.anims.exists(atkKey)) {
      this.isDealing = true;
      sprite.play(atkKey);
      this.time.delayedCall(ANIM_DUR, () => {
        this.isDealing = false;
        this._afterAttack(mon, monIdx, overkill);
      });
    } else {
      this._afterAttack(mon, monIdx, overkill);
    }
  }

  _afterAttack(mon, monIdx, overkill = 0) {
    if (mon.hp <= 0) {
      mon.isDead = true;
      const newLevels = this.player.addXp(mon.xp);
      this.player.gold += mon.gold;
      this.addBattleLog(`${mon.type.name} 처치! +${mon.xp}XP +${mon.gold}G`);
      if (newLevels.length > 0) {
        this.addBattleLog(`LEVEL UP! Lv${this.player.level}`);
        this._suitLevelUpCount += newLevels.length;
      }
      if (overkill > 0) {
        this.isDealing = true;
        this._applyOverkill(monIdx, overkill, () => {
          this.isDealing = false;
          this.render();
          this._checkLevelUpThenProceed();
        });
      } else {
        this.render();
        this._checkLevelUpThenProceed();
      }
    } else {
      this.render();
    }
  }

  // ── 오버킬 연쇄 (오른쪽 가장 가까운 → 없으면 제일 왼쪽, 애니메이션 포함) ──
  _applyOverkill(fromIdx, dmg, onDone) {
    if (dmg <= 0) { onDone?.(); return; }

    // 오른쪽에서 가장 가까운 살아있는 몬스터 탐색
    let idx = -1;
    for (let i = fromIdx + 1; i < this.monsters.length; i++) {
      if (!this.monsters[i].isDead) { idx = i; break; }
    }
    // 오른쪽에 없으면 제일 왼쪽 살아있는 몬스터
    if (idx === -1) {
      for (let i = 0; i < fromIdx; i++) {
        if (!this.monsters[i].isDead) { idx = i; break; }
      }
    }
    if (idx === -1) { onDone?.(); return; }

    const positions = this.calcMonsterPositions(this.monsters.length);
    const fromX = positions[fromIdx].x;
    const toX = positions[idx].x;

    // 카드 날아가는 애니메이션 (죽은 몬스터 → 오버킬 대상)
    const img = this.add.image(fromX, MONSTER_IMG_Y, "card_back")
      .setDisplaySize(CW * 0.5, CH * 0.5).setDepth(200);
    this.tweens.add({
      targets: img,
      x: toX, y: MONSTER_IMG_Y,
      displayWidth: CW * 0.2,
      displayHeight: CH * 0.2,
      alpha: 0.6,
      duration: 280,
      ease: "Power2.In",
      onComplete: () => {
        img.destroy();

        // 데미지 적용
        const target = this.monsters[idx];
        const actualDmg = Math.max(0, dmg - target.def);
        const prevHp = target.hp;
        target.hp = Math.max(0, target.hp - actualDmg);
        const chain = Math.max(0, actualDmg - prevHp);

        this.addBattleLog(`오버킬! ${target.type.name}에게 ${actualDmg} 연쇄!`);
        this._sfx("sfx_knifeSlice");

        // 몬스터 공격 애니메이션
        const sprite = this._monsterSprites?.[idx];
        const atkKey = `mon_${target.type.id}_attack`;
        const afterAnim = () => {
          if (target.hp <= 0 && !target.isDead) {
            target.isDead = true;
            const newLevels = this.player.addXp(target.xp);
            this.player.gold += target.gold;
            this.addBattleLog(`${target.type.name} 연쇄 처치! +${target.xp}XP`);
            if (newLevels.length > 0) {
              this.addBattleLog(`LEVEL UP! Lv${this.player.level}`);
              this._suitLevelUpCount += newLevels.length;
            }
            if (chain > 0) this._applyOverkill(idx, chain, onDone);
            else onDone?.();
          } else {
            onDone?.();
          }
        };

        if (sprite instanceof Phaser.GameObjects.Sprite && this.anims.exists(atkKey)) {
          sprite.play(atkKey);
          this.time.delayedCall(400, afterAnim);
        } else {
          afterAnim();
        }
      },
    });
  }

  // ── 턴 종료 ──────────────────────────────────────────────────────────────
  onTurnEnd() {
    this.isDealing = true;
    const alive = this.monsters.filter(m => !m.isDead);
    const ATK_GAP = 650;   // 몬스터 한 마리당 공격 간격 (ms)

    alive.forEach((m, localIdx) => {
      const globalIdx = this.monsters.indexOf(m);
      this.time.delayedCall(localIdx * ATK_GAP, () => {
        const dmg = Math.max(0, m.atk - this.player.def);
        this.player.hp = Math.max(0, this.player.hp - dmg);
        this.addBattleLog(`${m.type.name}의 공격! ${dmg} 데미지!`);
        this._showMonsterAttack(globalIdx, dmg);
        this.refreshPlayerStats();
        this.refreshBattleLog();
      });
    });

    // 모든 공격 종료 후 처리
    this.time.delayedCall(alive.length * ATK_GAP + 300, () => {
      try {
        this.render();
      } catch (e) {
        console.error("[onTurnEnd render]", e);
      }
      if (this.player.hp <= 0) {
        this.time.delayedCall(500, () => this.showGameOver());
        return;
      }
      if (this.deckData.length === 0) {
        this.addBattleLog("덱 소진!");
        this.refreshBattleLog();
        this.time.delayedCall(500, () => this.showGameOver());
        return;
      }
      this.time.delayedCall(500, () => this.startTurn());
    });
  }

  // ── 턴 시작 ──────────────────────────────────────────────────────────────
  startTurn() {
    // 핸드 보충 (handSize 목표치, turnStartDrawLimit 이내)
    const need = Math.max(0, Math.min(
      this.player.handSize - this.handData.length,
      this.player.turnStartDrawLimit,
      this.deckData.length,
    ));
    for (let i = 0; i < need; i++) this.handData.push(this.deckData.pop());

    // 기존 필드 → dummy 애니메이션
    this.fieldData.forEach(card => this._flyToDummy(card.slotX, FIELD_Y, card.key));
    this.dummyData.push(...this.fieldData);

    // _flyToDummy 애니메이션(380ms) 완료 후 새 필드 딜
    this.time.delayedCall(420, () => {
      try {
        //this._sfx("sfx_shuffle");
        const slotPos = this.calcFieldPositions(this.player.fieldSize);
        const draw = Math.min(this.player.fieldSize, this.deckData.length);
        this.fieldData = Array.from({ length: draw }, (_, k) => ({
          ...this.deckData.pop(),
          slotX: slotPos[k].x,
        }));

        this.fieldPickCount = 0;
        this.attackCount = 0;
        this.selected.clear();
        this._applySortToHand();
        this.render();
      } catch (e) {
        console.error("[startTurn timer]", e);
      } finally {
        this.isDealing = false;
      }
    });
  }

  // ── 라운드 클리어 ────────────────────────────────────────────────────────
  onRoundClear() {
    this.isDealing = true;
    this.player.def = 0;
    writeSave(this.round + 1, this.player.toData());

    // 오버레이
    const g = this.add.graphics().setDepth(300);
    g.fillStyle(0x000000, 0.6);
    g.fillRect(0, 0, GW, GH);
    const pw = 460, ph = 260, px = GW / 2 - 230, py = GH / 2 - 130;
    g.fillStyle(0x0a2a10, 1);
    g.fillRoundedRect(px, py, pw, ph, 20);
    g.lineStyle(3, 0x44dd88);
    g.strokeRoundedRect(px, py, pw, ph, 20);

    this.add.text(GW / 2, py + 66, "ROUND CLEAR!", TS.clearTitle).setOrigin(0.5).setDepth(301);
    this.add.text(GW / 2, py + 126, `ROUND ${this.round}  SCORE: ${this.player.score}`, TS.clearSub).setOrigin(0.5).setDepth(301);
    this.add.text(GW / 2, py + 166, "NEXT ROUND...", TS.clearNote).setOrigin(0.5).setDepth(301);

    this.time.delayedCall(2500, () => {
      this.scene.start("GameScene", {
        round: this.round + 1,
        player: this.player.toData(),
      });
    });
  }

  // ── 레벨업 후 처리: 레벨업 팝업 → 라운드 클리어 ──────────────────────────
  _checkLevelUpThenProceed() {
    const allDead = this.monsters.every(m => m.isDead);
    if (this._suitLevelUpCount > 0) {
      this.isDealing = true;
      this._showLevelUpPopup(() => {
        this.isDealing = false;
        if (allDead) {
          this.time.delayedCall(500, () => this.onRoundClear());
        }
      });
    } else if (allDead) {
      this.time.delayedCall(700, () => this.onRoundClear());
    }
  }

  // ── 레벨업 suit 선택 팝업 (blocking) ─────────────────────────────────────
  _showLevelUpPopup(onAllDone) {
    const SUIT_COLORS = { S: '#aaaaff', H: '#ff6666', D: '#ff9966', C: '#aaffaa' };
    const SUIT_SYMS = { S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663' };
    const SUIT_DESCS = { S: 'MON DEF\u2193', H: 'HP\u2191', D: 'MY DEF\u2191', C: 'MON ATK\u2193' };
    const SUIT_KEYS = ['S', 'H', 'D', 'C'];

    const objs = [];
    const destroy = () => objs.forEach(o => o?.destroy());

    const cx = GW / 2, cy = GH / 2;
    const pw = 460, ph = 310;
    const px = cx - pw / 2, py = cy - ph / 2;

    // 딤 배경 (클릭 차단)
    const dim = this.add.rectangle(cx, cy, GW, GH, 0x000000, 0.72).setDepth(800).setInteractive();
    objs.push(dim);

    // 패널
    const pg = this.add.graphics().setDepth(801);
    pg.fillStyle(0x082012);
    pg.fillRoundedRect(px, py, pw, ph, 16);
    pg.lineStyle(3, 0x44dd88);
    pg.strokeRoundedRect(px, py, pw, ph, 16);
    objs.push(pg);

    objs.push(this.add.text(cx, py + 38,
      `LEVEL UP!  Lv${this.player.level}`,
      { fontFamily: "'PressStart2P', Arial", fontSize: '14px', color: '#ffdd44' })
      .setOrigin(0.5).setDepth(802));

    const remTxt = this.add.text(cx, py + 72,
      `SUIT 선택 (${this._suitLevelUpCount}회 남음)`,
      { fontFamily: "'PressStart2P', Arial", fontSize: '9px', color: '#aaffcc' })
      .setOrigin(0.5).setDepth(802);
    objs.push(remTxt);

    // suit 버튼 4개
    const btnY = py + 160;
    const btnW = 84, btnH = 68, btnGap = 100;
    const btnX0 = cx - btnGap * 1.5;

    SUIT_KEYS.forEach((suit, idx) => {
      const bx = btnX0 + idx * btnGap;

      const btnBg = this.add.rectangle(bx, btnY, btnW, btnH, 0x1a4a2a)
        .setDepth(802).setInteractive();
      const symTxt = this.add.text(bx, btnY - 12, SUIT_SYMS[suit],
        { fontFamily: 'Arial', fontSize: '24px', color: SUIT_COLORS[suit] })
        .setOrigin(0.5).setDepth(803);
      const lvTxt = this.add.text(bx, btnY + 10, `Lv${this.player.attrs[suit]}`,
        { fontFamily: "'PressStart2P', Arial", fontSize: '9px', color: SUIT_COLORS[suit] })
        .setOrigin(0.5).setDepth(803);
      const descTxt = this.add.text(bx, btnY + 26, SUIT_DESCS[suit],
        { fontFamily: "'PressStart2P', Arial", fontSize: '7px', color: '#88aa88' })
        .setOrigin(0.5).setDepth(803);

      btnBg.on('pointerdown', () => {
        if (this._suitLevelUpCount <= 0) return;
        this.player.attrs[suit]++;
        this._suitLevelUpCount--;
        this.addBattleLog(`${SUIT_SYMS[suit]} Lv${this.player.attrs[suit]}!`);
        lvTxt.setText(`Lv${this.player.attrs[suit]}`);
        remTxt.setText(`SUIT 선택 (${this._suitLevelUpCount}회 남음)`);
        this.refreshPlayerLevel();
        if (this._suitLevelUpCount <= 0) {
          destroy();
          onAllDone?.();
        }
      });
      btnBg.on('pointerover', () => btnBg.setFillStyle(0x2a6644));
      btnBg.on('pointerout', () => btnBg.setFillStyle(0x1a4a2a));
      objs.push(btnBg, symTxt, lvTxt, descTxt);
    });
  }

  // ── 배틀 로그 전체 팝업 (로그 바 바로 아래) ───────────────────────────────
  _showBattleLogPopup() {
    if (this._logPopupObjs) return;
    const objs = this._logPopupObjs = [];
    const pw = GW - PLAYER_PANEL_W;
    const ph = 430;
    const px = PLAYER_PANEL_W, py = BATTLE_LOG_H;
    const cx = px + pw / 2;

    // 딤 배경 (클릭으로 닫기)
    const dim = this.add.rectangle(GW / 2, GH / 2, GW, GH, 0x000000, 0.65)
      .setDepth(700).setInteractive();
    dim.on('pointerdown', () => this._closeBattleLogPopup());
    objs.push(dim);

    // 패널
    const pg = this.add.graphics().setDepth(701);
    pg.fillStyle(0x0a1e12);
    pg.fillRoundedRect(px, py, pw, ph, 14);
    pg.lineStyle(2, 0x2d7a3a);
    pg.strokeRoundedRect(px, py, pw, ph, 14);
    objs.push(pg);

    objs.push(this.add.text(cx, py + 22, 'BATTLE LOG',
      { fontFamily: "'PressStart2P', Arial", fontSize: '13px', color: '#44ffaa' })
      .setOrigin(0.5).setDepth(702));

    // 로그 라인 (최근 18개, 오래된 것이 위)
    const lines = this._fullBattleLog.slice(-18);
    const lineH = 18;
    const startY = py + 50;
    lines.forEach((line, i) => {
      const alpha = 0.5 + 0.5 * (i / Math.max(1, lines.length - 1));
      objs.push(this.add.text(px + 16, startY + i * lineH, line,
        { fontFamily: 'Arial', fontSize: '12px', color: '#ccffcc', alpha })
        .setOrigin(0, 0).setDepth(702));
    });

    // 닫기 버튼
    const closeBtn = this.add.rectangle(cx, py + ph - 28, 140, 34, 0x335544)
      .setDepth(702).setInteractive();
    objs.push(closeBtn,
      this.add.text(cx, py + ph - 28, 'CLOSE',
        { fontFamily: "'PressStart2P', Arial", fontSize: '10px', color: '#ffffff' })
        .setOrigin(0.5).setDepth(703));
    closeBtn.on('pointerdown', () => this._closeBattleLogPopup());
    closeBtn.on('pointerover', () => closeBtn.setFillStyle(0x447766));
    closeBtn.on('pointerout', () => closeBtn.setFillStyle(0x335544));
  }

  _closeBattleLogPopup() {
    if (!this._logPopupObjs) return;
    this._logPopupObjs.forEach(o => o.destroy());
    this._logPopupObjs = null;
  }

  showGameOver() {
    this.isDealing = true;
    deleteSave();

    const g = this.add.graphics().setDepth(300);
    g.fillStyle(0x000000, 0.72);
    g.fillRect(0, 0, GW, GH);
    const pw = 500, ph = 320, px = GW / 2 - 250, py = GH / 2 - 160;
    g.fillStyle(0x0d2b18, 1);
    g.fillRoundedRect(px, py, pw, ph, 20);
    g.lineStyle(3, 0xcc2200);
    g.strokeRoundedRect(px, py, pw, ph, 20);

    this.add.text(GW / 2, py + 72, "GAME OVER", TS.gameOverTitle).setOrigin(0.5).setDepth(301);

    this.add.text(GW / 2, py + 148, "FINAL SCORE", TS.gameOverScoreLabel).setOrigin(0.5).setDepth(301);
    this.add.text(GW / 2, py + 182, `${this.player.score}`, TS.gameOverScore).setOrigin(0.5).setDepth(301);

    const btnBg = this.add.rectangle(GW / 2, py + ph - 50, 220, 54, 0x1e4e99).setDepth(302).setInteractive();
    this.add.text(GW / 2, py + ph - 50, "MAIN MENU", TS.overlayBtn).setOrigin(0.5).setDepth(303);
    btnBg.on("pointerdown", () => this.scene.start("MainMenuScene"));
    btnBg.on("pointerover", () => btnBg.setFillStyle(0x2d66cc));
    btnBg.on("pointerout", () => btnBg.setFillStyle(0x1e4e99));
  }

  // ── 메시지 ───────────────────────────────────────────────────────────────
  showMsg(text, dur = 2000) {
    this.msgTxt.setText(text);
    if (this._mt) this._mt.remove();
    this._mt = this.time.delayedCall(dur, () => this.msgTxt.setText(""));
  }

  // ── 인게임 옵션 오버레이 ─────────────────────────────────────────────────
  _showOptions() {
    if (this._optOverlayObjs) return;
    this.isDealing = true;

    const objs = this._optOverlayObjs = [];
    const cx = GW / 2, cy = GH / 2;
    const pw = 400, ph = 360;

    // 딤 배경
    const dim = this.add.rectangle(cx, cy, GW, GH, 0x000000, 0.65)
      .setDepth(600).setInteractive(); // 클릭 막기
    objs.push(dim);

    // 패널
    const panelG = this.add.graphics().setDepth(601);
    panelG.fillStyle(0x0d2b18);
    panelG.fillRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 16);
    panelG.lineStyle(2, 0x2d7a3a);
    panelG.strokeRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 16);
    objs.push(panelG);

    objs.push(
      this.add.text(cx, cy - ph / 2 + 44, "OPTIONS", TS.optTitle).setOrigin(0.5).setDepth(602)
    );

    // BGM 볼륨
    let bgm = this.registry.get("bgmVolume") ?? 7;
    const bgmY = cy - 70;
    objs.push(this.add.text(cx, bgmY - 28, "BGM", TS.optLabel).setOrigin(0.5).setDepth(602));

    const bgmMinus = this.add.rectangle(cx - 80, bgmY, 44, 44, 0x335544).setDepth(602).setInteractive();
    objs.push(bgmMinus, this.add.text(cx - 80, bgmY, "-", TS.optBtn).setOrigin(0.5).setDepth(603));

    const bgmTxt = this.add.text(cx, bgmY, String(bgm), TS.optValue).setOrigin(0.5).setDepth(602);
    objs.push(bgmTxt);

    const bgmPlus = this.add.rectangle(cx + 80, bgmY, 44, 44, 0x335544).setDepth(602).setInteractive();
    objs.push(bgmPlus, this.add.text(cx + 80, bgmY, "+", TS.optBtn).setOrigin(0.5).setDepth(603));

    const bgmBarBg = this.add.rectangle(cx, bgmY + 28, 190, 7, 0x224433).setDepth(602);
    const bgmBar = this.add.rectangle(cx - 95, bgmY + 28, bgm * 19, 7, 0x44dd88).setOrigin(0, 0.5).setDepth(603);
    objs.push(bgmBarBg, bgmBar);

    const updateBgm = (v) => {
      bgm = Phaser.Math.Clamp(v, 0, 10);
      this.registry.set("bgmVolume", bgm);
      bgmTxt.setText(String(bgm));
      bgmBar.setDisplaySize(Math.max(1, bgm * 19), 7);
    };
    bgmMinus.on("pointerdown", () => updateBgm(bgm - 1));
    bgmPlus.on("pointerdown", () => updateBgm(bgm + 1));
    bgmMinus.on("pointerover", () => bgmMinus.setFillStyle(0x447766));
    bgmMinus.on("pointerout", () => bgmMinus.setFillStyle(0x335544));
    bgmPlus.on("pointerover", () => bgmPlus.setFillStyle(0x447766));
    bgmPlus.on("pointerout", () => bgmPlus.setFillStyle(0x335544));

    // SFX 볼륨
    let sfx = this.registry.get("sfxVolume") ?? 7;
    const sfxY = cy + 50;
    objs.push(this.add.text(cx, sfxY - 28, "SFX", TS.optLabel).setOrigin(0.5).setDepth(602));

    const sfxMinus = this.add.rectangle(cx - 80, sfxY, 44, 44, 0x335544).setDepth(602).setInteractive();
    objs.push(sfxMinus, this.add.text(cx - 80, sfxY, "-", TS.optBtn).setOrigin(0.5).setDepth(603));

    const sfxTxt = this.add.text(cx, sfxY, String(sfx), TS.optValue).setOrigin(0.5).setDepth(602);
    objs.push(sfxTxt);

    const sfxPlus = this.add.rectangle(cx + 80, sfxY, 44, 44, 0x335544).setDepth(602).setInteractive();
    objs.push(sfxPlus, this.add.text(cx + 80, sfxY, "+", TS.optBtn).setOrigin(0.5).setDepth(603));

    const sfxBarBg = this.add.rectangle(cx, sfxY + 28, 190, 7, 0x224433).setDepth(602);
    const sfxBar = this.add.rectangle(cx - 95, sfxY + 28, sfx * 19, 7, 0x44dd88).setOrigin(0, 0.5).setDepth(603);
    objs.push(sfxBarBg, sfxBar);

    const updateSfx = (v) => {
      sfx = Phaser.Math.Clamp(v, 0, 10);
      this.registry.set("sfxVolume", sfx);
      sfxTxt.setText(String(sfx));
      sfxBar.setDisplaySize(Math.max(1, sfx * 19), 7);
    };
    sfxMinus.on("pointerdown", () => updateSfx(sfx - 1));
    sfxPlus.on("pointerdown", () => updateSfx(sfx + 1));
    sfxMinus.on("pointerover", () => sfxMinus.setFillStyle(0x447766));
    sfxMinus.on("pointerout", () => sfxMinus.setFillStyle(0x335544));
    sfxPlus.on("pointerover", () => sfxPlus.setFillStyle(0x447766));
    sfxPlus.on("pointerout", () => sfxPlus.setFillStyle(0x335544));

    // 나가기 버튼
    const exitBtn = this.add.rectangle(cx - 80, cy + ph / 2 - 48, 140, 48, 0x882211)
      .setDepth(602).setInteractive();
    objs.push(exitBtn, this.add.text(cx - 80, cy + ph / 2 - 48, "MAIN MENU", TS.menuBtn).setOrigin(0.5).setDepth(603));
    exitBtn.on("pointerdown", () => {
      writeSave(this.round, this.player.toData());
      this.scene.start("MainMenuScene");
    });
    exitBtn.on("pointerover", () => exitBtn.setFillStyle(0xaa2222));
    exitBtn.on("pointerout", () => exitBtn.setFillStyle(0x882211));

    // 닫기 버튼
    const closeBtn = this.add.rectangle(cx + 80, cy + ph / 2 - 48, 140, 48, 0x335544)
      .setDepth(602).setInteractive();
    objs.push(closeBtn, this.add.text(cx + 80, cy + ph / 2 - 48, "CLOSE", TS.menuBtn).setOrigin(0.5).setDepth(603));
    closeBtn.on("pointerdown", () => this._closeOptions());
    closeBtn.on("pointerover", () => closeBtn.setFillStyle(0x447766));
    closeBtn.on("pointerout", () => closeBtn.setFillStyle(0x335544));
  }

  _closeOptions() {
    if (!this._optOverlayObjs) return;
    this._optOverlayObjs.forEach(o => o.destroy());
    this._optOverlayObjs = null;
    this.isDealing = false;
  }
}
