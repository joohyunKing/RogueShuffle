import Phaser from "phaser";
import { calcScore } from "../scoring.js";
import {
  GW, GH, CW, CH, FIELD_CW, FIELD_CH, PILE_CW, PILE_CH,
  SUITS, RANKS, SUIT_ORDER,
  BATTLE_LOG_H, MONSTER_AREA_TOP, MONSTER_AREA_H, MONSTER_IMG_Y, PLAYER_STAT_Y,
  FIELD_Y, HAND_Y, HAND_TOP, DEAL_DELAY,
} from "../constants.js";
import { getLevelConfig } from "../levels.js";
import { preloadMonsters, getAvailableMonstersByTier, TIER_REWARDS } from "../monsters.js";
import { CardRenderer } from "../CardRenderer.js";
import { TS } from "../textStyles.js";
import { Player, getRequiredExp } from "../Player.js";
import sfxShuffle from "../assets/audio/sfx/card-shuffle.ogg?url";
import sfxFan     from "../assets/audio/sfx/card-fan-1.ogg?url";
import sfxSlide   from "../assets/audio/sfx/card-slide-5.ogg?url";
import sfxPlace   from "../assets/audio/sfx/card-place-1.ogg?url";
import sfxChop   from "../assets/audio/sfx/chop.ogg?url";
import sfxKnifeSlice   from "../assets/audio/sfx/knifeSlice.ogg?url";

// ─── 유틸 ────────────────────────────────────────────────────────────────────
function getRankNum(rank) {
  if (rank === "A") return 1;
  if (rank === "J") return 11;
  if (rank === "Q") return 12;
  if (rank === "K") return 13;
  return parseInt(rank);
}

function buildDeck() {
  return SUITS.flatMap(suit =>
    RANKS.map(rank => ({ suit, rank, val: getRankNum(rank), key: `${suit}${rank}` }))
  );
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── 씬 ──────────────────────────────────────────────────────────────────────
export class GameScene extends Phaser.Scene {
  constructor() { super("GameScene"); }

  // ── preload ──────────────────────────────────────────────────────────────
  preload() {
    this.load.image("card_back", "/cards/_card_back.png");
    CardRenderer.preload(this);
    preloadMonsters(this);
    this.load.audio("sfx_shuffle", sfxShuffle);
    this.load.audio("sfx_fan",     sfxFan);
    this.load.audio("sfx_slide",   sfxSlide);
    this.load.audio("sfx_place",   sfxPlace);
    this.load.audio("sfx_chop",   sfxChop);
    this.load.audio("sfx_knifeSlice",   sfxKnifeSlice);
  }

  _sfx(key) {
    this.sound.play(key, { volume: 0.6 });
  }

  // ── create ───────────────────────────────────────────────────────────────
  create() {
    const data = this.scene.settings.data || {};

    // 라운드 (게임 진행 회차)
    this.round = data.round ?? 1;
    this.lv    = getLevelConfig(this.round);

    // 플레이어 (라운드 클리어 시 유지)
    this.player = new Player(data.player);

    // 카드 상태
    const deck      = Phaser.Utils.Array.Shuffle(buildDeck());
    this.handData   = deck.splice(0, this.lv.handSize);
    const slotPos0  = this.calcFieldPositions(this.lv.fieldSize);
    this.fieldData  = deck.splice(0, this.lv.fieldSize)
                          .map((c, i) => ({ ...c, slotX: slotPos0[i].x }));
    this.deckData   = deck;
    this.dummyData = [];

    // UI/게임 상태
    this.selected       = new Set();
    this.cardObjs       = [];
    this.monsterObjs    = [];
    this.animObjs       = [];
    this.isDragging     = false;
    this.isDealing      = true;
    this.fieldPickCount = 0;
    this.sortMode       = null;
    this.sortAsc        = true;
    this.battleLogLines = [];

    // 몬스터 스폰
    this.monsters = this._spawnMonsters();

    CardRenderer.createAll(this);

    this.drawBg();
    this.createUI();
    this.createSortButtons();
    this.setupDrag();
    this.startDealAnimation();
  }

  // ── 몬스터 스폰 ──────────────────────────────────────────────────────────
  _spawnMonsters() {
    const { monsterCount, monsterTier, monsterStats } = this.lv;
    const pool    = getAvailableMonstersByTier(monsterTier);
    const shuffled = Phaser.Utils.Array.Shuffle([...pool]);
    return Array.from({ length: monsterCount }, (_, i) => {
      const type = shuffled[i % shuffled.length];
      const hp   = randInt(monsterStats.hp[0],  monsterStats.hp[1]);
      const rewards = TIER_REWARDS[type.tier] ?? TIER_REWARDS[0];
      return {
        type,
        hp, maxHp: hp,
        atk: randInt(monsterStats.atk[0], monsterStats.atk[1]),
        def: randInt(monsterStats.def[0], monsterStats.def[1]),
        xp:   randInt(rewards.xp[0],   rewards.xp[1]),
        gold: randInt(rewards.gold[0], rewards.gold[1]),
        isDead: false,
      };
    });
  }

  // ── 배경 & 패널 ──────────────────────────────────────────────────────────
  drawBg() {
    const g = this.add.graphics();

    // 전체 배경
    g.fillStyle(0x1a472a);
    g.fillRect(0, 0, GW, GH);

    // 배틀 로그 바
    g.fillStyle(0x0a1a10);
    g.fillRect(0, 0, GW, BATTLE_LOG_H);
    g.lineStyle(1, 0x2a5a38);
    g.strokeRect(0, 0, GW, BATTLE_LOG_H);

    // 몬스터 영역
    const mTop = MONSTER_AREA_TOP;
    g.fillStyle(0x112a1a);
    g.fillRoundedRect(20, mTop, GW - 40, MONSTER_AREA_H, 10);
    g.lineStyle(1, 0x2a5038);
    g.strokeRoundedRect(20, mTop, GW - 40, MONSTER_AREA_H, 10);

    // 플레이어 스탯 바
    g.fillStyle(0x0e2218);
    g.fillRoundedRect(20, PLAYER_STAT_Y - 6, GW * 0.55, 52, 8);

    // 필드 패널
    const fpY = FIELD_Y - CH / 2 - 18;
    g.fillStyle(0x155226);
    g.fillRoundedRect(20, fpY, GW - 40, CH + 36, 12);
    g.lineStyle(2, 0x2d7a3a);
    g.strokeRoundedRect(20, fpY, GW - 40, CH + 36, 12);

    // 핸드 패널
    const hpY = HAND_Y - CH / 2 - 18;
    g.fillStyle(0x155226);
    g.fillRoundedRect(20, hpY, GW - 40, CH + 36, 12);
    g.lineStyle(2, 0x2d7a3a);
    g.strokeRoundedRect(20, hpY, GW - 40, CH + 36, 12);

    // 패널 레이블
    this.add.text(GW / 2, fpY - 8, "FIELD", TS.panelLabel).setOrigin(0.5, 1);
    this.add.text(GW / 2, hpY - 8, "HAND",  TS.panelLabel).setOrigin(0.5, 1);
  }

  // ── UI 생성 (한 번만) ─────────────────────────────────────────────────────
  createUI() {
    // 타이틀
    this.add.text(22, 8, "ROGUE SHUFFLE", TS.gameTitle);

    // ── 몬스터 영역 왼쪽 — 라운드 / 플레이어 레벨 / 덱 / 버린카드 ─────
    const infoX = 30;
    const infoY = MONSTER_AREA_TOP + 10;

    // ROUND
    this.add.text(infoX, infoY,      "ROUND", TS.infoLabel).setDepth(12);
    this.roundTxt = this.add.text(infoX + 55, infoY, String(this.round), TS.levelValue).setDepth(12);

    // Gold
    this.add.text(infoX, infoY + 18, "GOLD",  TS.infoLabel).setDepth(12);
    this.goldTxt  = this.add.text(infoX + 55, infoY + 18,  `${this.player.gold}`, TS.levelValue).setDepth(12);
 
    // LV (플레이어 레벨)
    this.add.text(infoX, infoY + 36, "LV",    TS.infoLabel).setDepth(12);
    this._playerLevelTxt = this.add.text(infoX + 55, infoY + 36, String(this.player.level), TS.levelValue).setDepth(12);

    // XP 바
    this._xpBarBg   = this.add.rectangle(infoX, infoY + 55, 70, 5, 0x224433).setOrigin(0, 0.5).setDepth(12);
    this._xpBarFill = this.add.rectangle(infoX, infoY + 55, 1,  5, 0x44ddaa).setOrigin(0, 0.5).setDepth(13);
    //this._xpTxt = this.add.text(infoX, infoY + 68, "", { fontFamily: 'Arial', fontSize: '9px', color: '#66ccaa' }).setDepth(12);

    //this.player.gold

    // DECK / USED
    /*
    this.add.text(infoX, infoY + 80, "DECK",  TS.infoLabel).setDepth(12);
    this.add.text(infoX, infoY + 112, "USED", TS.infoLabel).setDepth(12);
    this.deckTxt  = this.add.text(infoX, infoY + 93,  `${this.deckData.length}`, TS.infoValue).setDepth(12);
    this.dummyTxt = this.add.text(infoX, infoY + 125, "0",                        TS.infoValue).setDepth(12);
    */

    // ── 슈트 레벨 표시 ──────────────────────────────────────────────────
    const attrY = infoY + 148;
    const SUIT_COLORS = { S: '#aaaaff', H: '#ff6666', D: '#ff6666', C: '#aaffaa' };
    const SUIT_SYMS   = { S: '♠', H: '♥', D: '♦', C: '♣' };
    const SUIT_KEYS   = ['S', 'H', 'D', 'C'];
    const attrStyle   = (suit) => ({ fontFamily: 'Arial', fontSize: '11px', color: SUIT_COLORS[suit] });
    this._attrTxts = {};
    SUIT_KEYS.forEach((suit, idx) => {
      const ax = infoX + (idx % 2) * 52;
      const ay = attrY + Math.floor(idx / 2) * 20;
      this.add.text(ax, ay, SUIT_SYMS[suit], attrStyle(suit)).setDepth(12);
      this._attrTxts[suit] = this.add.text(ax + 14, ay, `${this.player.attrs[suit]}`, TS.infoLabel).setDepth(12);
    });

    // ── 툴팁 (덱/더미 hover용) ──────────────────────────────────────────
    this._tooltipBg  = this.add.rectangle(0, 0, 70, 26, 0x000000, 0.85).setDepth(200).setVisible(false);
    this._tooltipTxt = this.add.text(0, 0, "", { fontFamily: "'PressStart2P', Arial", fontSize: '9px', color: '#ffffff' })
      .setOrigin(0.5).setDepth(201).setVisible(false);

    // 배틀 로그
    this.logTxt = this.add.text(GW / 2, BATTLE_LOG_H / 2, "", TS.log)
      .setOrigin(0.5).setDepth(10);

    // 임시 메시지 (팝업)
    this.msgTxt = this.add.text(GW / 2, BATTLE_LOG_H + 8, "", TS.msg)
      .setOrigin(0.5, 0).setDepth(100);

    // ── 플레이어 스탯 ────────────────────────────────────────────────────
    this.playerHpTxt  = this.add.text(36,  PLAYER_STAT_Y + 3, "", TS.playerHp).setDepth(10);
    this.playerDefTxt = this.add.text(300, PLAYER_STAT_Y + 3, "", TS.playerDef).setDepth(10);
    this._hpBarBg   = this.add.rectangle(36, PLAYER_STAT_Y + 32, 220, 9, 0x2a3a2a).setOrigin(0, 0.5).setDepth(10);
    this._hpBarFill = this.add.rectangle(36, PLAYER_STAT_Y + 32, 220, 9, 0xdd3333).setOrigin(0, 0.5).setDepth(11);

    // ── 족보 프리뷰 ──────────────────────────────────────────────────────
    const preY = HAND_Y + CH / 2 + 12;
    this.previewLabelTxt = this.add.text(GW / 2 - 10, preY, "", TS.comboLabel).setOrigin(1, 0).setDepth(50);
    this.previewScoreTxt = this.add.text(GW / 2 + 10, preY, "", TS.comboScore).setOrigin(0, 0).setDepth(50);

    // ── 하단 버튼 ────────────────────────────────────────────────────────
    const btnY = GH - 34;

    // 메뉴
    const menuBg = this.add.rectangle(80, btnY, 130, 46, 0x1e4e99).setDepth(50).setInteractive();
    this.add.text(80, btnY, "MENU", TS.menuBtn).setOrigin(0.5).setDepth(51);
    menuBg.on("pointerdown", () => this.scene.start("MainMenuScene"));
    menuBg.on("pointerover",  () => menuBg.setFillStyle(0x2d66cc));
    menuBg.on("pointerout",   () => menuBg.setFillStyle(0x1e4e99));

    // 턴종료
    this.turnEndBtn = this.add.rectangle(GW - 96, btnY, 160, 46, 0xaa6600).setDepth(50).setInteractive();
    this.add.text(GW - 96, btnY, "TURN END", TS.turnEndBtn).setOrigin(0.5).setDepth(51);
    this.turnEndBtn.on("pointerdown", () => { if (!this.isDealing) this.onTurnEnd(); });
    this.turnEndBtn.on("pointerover",  () => this.turnEndBtn.setFillStyle(0xdd8800));
    this.turnEndBtn.on("pointerout",   () => this.turnEndBtn.setFillStyle(0xaa6600));

    this.refreshPlayerStats();
  }

  // ── 정렬 버튼 ────────────────────────────────────────────────────────────
  createSortButtons() {
    const btnY = GH - 34;

    this.suitBg  = this.add.rectangle(270, btnY, 88, 38, 0x335544).setDepth(50).setInteractive();
    this.suitTxt = this.add.text(270, btnY, "SUIT", TS.sortBtn).setOrigin(0.5).setDepth(51);
    this.suitBg.on("pointerdown", () => { if (!this.isDealing) this.sortBy("suit"); });
    this.suitBg.on("pointerover", () => this.suitBg.setFillStyle(0x447766));
    this.suitBg.on("pointerout",  () => this.refreshSortBtns());

    this.rankBg  = this.add.rectangle(368, btnY, 88, 38, 0x335544).setDepth(50).setInteractive();
    this.rankTxt = this.add.text(368, btnY, "RANK", TS.sortBtn).setOrigin(0.5).setDepth(51);
    this.rankBg.on("pointerdown", () => { if (!this.isDealing) this.sortBy("rank"); });
    this.rankBg.on("pointerover", () => this.rankBg.setFillStyle(0x447766));
    this.rankBg.on("pointerout",  () => this.refreshSortBtns());
  }

  refreshSortBtns() {
    const arrow  = this.sortAsc ? " ▲" : " ▼";
    const isSuit = this.sortMode === "suit";
    const isRank = this.sortMode === "rank";
    this.suitBg.setFillStyle(isSuit ? 0x227744 : 0x335544);
    this.suitTxt.setText(isSuit ? `SUIT${arrow}` : "SUIT");
    this.rankBg.setFillStyle(isRank ? 0x227744 : 0x335544);
    this.rankTxt.setText(isRank ? `RANK${arrow}` : "RANK");
  }

  // ── 딜링 애니메이션 ──────────────────────────────────────────────────────
  startDealAnimation() {
    this._sfx("sfx_shuffle");
    const deckX = 80, deckY = FIELD_Y;   // renderDeckPile 과 동일 위치

    for (let i = Math.min(8, 51); i >= 0; i--) {
      this.animObjs.push(
        this.add.image(deckX - i * 2, deckY - i * 2, "card_back").setDisplaySize(CW, CH).setDepth(i)
      );
    }

    const handPos = this.calcHandPositions(this.lv.handSize);
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
      this.animObjs  = [];
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
    const gap = 18, areaW = GW - 160;
    const totalW = count * CW + (count - 1) * gap;
    const x0 = 40 + CW / 2 + (areaW - totalW) / 2;
    return Array.from({ length: count }, (_, i) => ({ x: x0 + i * (CW + gap), y: FIELD_Y }));
  }

  calcHandPositions(count) {
    if (count === 0) return [];
    const gap = 14, areaW = GW - 160;
    const spacing = count === 1 ? 0 : Math.min(CW + gap, (areaW - CW) / (count - 1));
    const x0 = 40 + CW / 2 + (areaW - (CW + spacing * (count - 1))) / 2;
    return Array.from({ length: count }, (_, i) => ({ x: x0 + i * spacing, y: HAND_Y }));
  }

  calcMonsterPositions(count) {
    const gaps = [0, 420, 300];
    const gap  = gaps[count - 1] ?? 300;
    const x0   = GW / 2 - gap * (count - 1) / 2;
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
        if (this.handData.length >= this.lv.handSizeLimit) {
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
      displayWidth:  obj.getData("origW") ?? FIELD_CW,
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

    //this.scoreTxt.setText(this.score);
    //this.deckTxt.setText(`${this.deckData.length}`);
    //this.dummyTxt.setText(`${this.dummyData.length}`);

    this.renderDeckPile();
    this.renderDummyPile();
    this.renderField();
    this.renderHand();
    this.renderMonsters();
    this.updatePreview();
    this.refreshSortBtns();
    this.refreshPlayerStats();
    this.refreshBattleLog();
  }

  renderDeckPile() {
    const x = 80, y = FIELD_Y;
    const count = this.deckData.length;
    if (count > 0) {
      for (let i = Math.min(3, count - 1); i >= 0; i--) {
        this.cardObjs.push(
          this.add.image(x - i * 1.5, y - i * 1.5, "card_back")
            .setDisplaySize(PILE_CW, PILE_CH).setDepth(i)
        );
      }
    }
    // hover 툴팁 히트 영역
    const hit = this.add.rectangle(x, y, PILE_CW + 10, PILE_CH + 10, 0xffffff, 0)
      .setDepth(10).setInteractive();
    hit.on("pointerover", () => {
      this._tooltipTxt.setText(`DECK: ${count}`);
      this._tooltipBg.setPosition(x, y - PILE_CH / 2 - 18);
      this._tooltipTxt.setPosition(x, y - PILE_CH / 2 - 18);
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
    const x = GW - 80, y = FIELD_Y;
    const count = this.dummyData.length;
    if (count > 0) {
      for (let i = Math.min(3, count - 1); i >= 0; i--) {
        this.cardObjs.push(
          this.add.image(x - i * 1.5, y - i * 1.5, "card_back")
            .setDisplaySize(PILE_CW, PILE_CH).setDepth(i).setTint(0x886644)
        );
      }
    }
    // hover 툴팁 히트 영역
    const hit = this.add.rectangle(x, y, PILE_CW + 10, PILE_CH + 10, 0xffffff, 0)
      .setDepth(10).setInteractive();
    hit.on("pointerover", () => {
      this._tooltipTxt.setText(`USED: ${count}`);
      this._tooltipBg.setPosition(x, y - PILE_CH / 2 - 18);
      this._tooltipTxt.setPosition(x, y - PILE_CH / 2 - 18);
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
    const canPick = this.fieldPickCount < this.lv.fieldPickLimit;

    this.fieldData.forEach((card, i) => {
      const x = card.slotX;   // 딜 시 고정된 슬롯 위치 사용
      const img = this.add.image(x, FIELD_Y, card.key).setDisplaySize(FIELD_CW, FIELD_CH).setDepth(10);

      if (canPick) {
        img.setInteractive({ draggable: true });
        img.setData("fieldIndex", i);
        img.setData("cardData",   card);
        img.setData("origX",  x);
        img.setData("origY",  FIELD_Y);
        img.setData("origW",  FIELD_CW);
        img.setData("origH",  FIELD_CH);
        img.on("pointerover", () => { if (!this.isDragging) { this.tweens.add({ targets: img, y: FIELD_Y - 12, duration: 100 }); img.setDepth(20); } });
        img.on("pointerout",  () => { if (!this.isDragging) { this.tweens.add({ targets: img, y: FIELD_Y,      duration: 100 }); img.setDepth(10); } });
      } else {
        img.setAlpha(0.45);
      }
      this.cardObjs.push(img);
    });
  }

  renderHand() {
    if (this.handData.length === 0) return;
    const positions = this.calcHandPositions(this.handData.length);

    this.handData.forEach((card, i) => {
      const sel = this.selected.has(i);
      const x   = positions[i].x;
      const y   = sel ? HAND_Y - 22 : HAND_Y;

      if (sel) {
        const hl = this.add.graphics().setDepth(31);
        hl.lineStyle(3, 0xffdd00);
        hl.strokeRect(x - CW / 2 - 2, y - CH / 2 - 2, CW + 4, CH + 4);
        this.cardObjs.push(hl);
      }

      const img = this.add.image(x, y, card.key)
        .setDisplaySize(CW, CH).setDepth(sel ? 32 : 30).setInteractive();
      img.on("pointerdown", () => { if (!this.isDragging && !this.isDealing) this.toggleHand(i); });
      this.cardObjs.push(img);
    });
  }

  // ── 몬스터 렌더 ──────────────────────────────────────────────────────────
  renderMonsters() {
    const positions = this.calcMonsterPositions(this.monsters.length);
    const hasCombo  = this._getSelectedCombo().score > 0;
    const imgW = 96, imgH = 124;

    this.monsters.forEach((mon, idx) => {
      const x = positions[idx].x;

      // ── 이미지 또는 컬러 블록 ─────────────────────────────────────────
      const texKey = `mon_${mon.type.id}`;
      // spritesheet 에서 frame 0 (4×4 그리드의 첫 번째 프레임) 사용
      const monImg = this.textures.exists(texKey)
        ? this.add.image(x, MONSTER_IMG_Y, texKey, 0).setDisplaySize(imgW, imgH).setDepth(15)
        : this.add.rectangle(x, MONSTER_IMG_Y, imgW, imgH, [0x886622, 0x226688, 0x662288, 0x228866][idx % 4]).setDepth(15);
      this.monsterObjs.push(monImg);

      if (mon.isDead) {
        // 사망 오버레이
        this.monsterObjs.push(
          this.add.rectangle(x, MONSTER_IMG_Y, imgW + 4, imgH + 4, 0x000000, 0.7).setDepth(16),
          this.add.text(x, MONSTER_IMG_Y, "X", TS.monDead).setOrigin(0.5).setDepth(17)
        );
        return;
      }

      // 이름
      /*
      this.monsterObjs.push(
        this.add.text(x, MONSTER_IMG_Y + imgH / 2 + 8, mon.type.name, TS.monName)
          .setOrigin(0.5, 0).setDepth(16)
      );
      */

      // 스탯 텍스트
      this.monsterObjs.push(
        this.add.text(x, MONSTER_IMG_Y + imgH / 2 + 8,
          `HP ${mon.hp}/${mon.maxHp}  ATK ${mon.atk}  DEF ${mon.def}`, TS.monStat)
          .setOrigin(0.5, 0).setDepth(16)
      );

      // HP 바
      const barW   = 100;
      const hpRatio = Math.max(0, mon.hp / mon.maxHp);
      this.monsterObjs.push(
        this.add.rectangle(x, MONSTER_IMG_Y + imgH / 2 + 28, barW, 7, 0x2a2a2a).setDepth(16),
        this.add.rectangle(x - barW / 2, MONSTER_IMG_Y + imgH / 2 + 28, Math.max(1, barW * hpRatio), 7, 0xdd3333)
          .setOrigin(0, 0.5).setDepth(17)
      );

      // ── 공격 타겟 표시 & 인터랙션 ─────────────────────────────────────
      if (hasCombo) {
        // 타겟 지시 화살표 (항상 표시)
        this.monsterObjs.push(
          this.add.text(x, MONSTER_IMG_Y - imgH / 2 - 24, "ATTACK!", TS.monTarget)
            .setOrigin(0.5, 1).setDepth(18)
        );

        // 클릭 히트 영역
        const hit = this.add.rectangle(x, MONSTER_IMG_Y + imgH / 2 - 10, imgW + 20, imgH + 60, 0xffdd00, 0)
          .setDepth(19).setInteractive();
        hit.on("pointerover", () => hit.setFillStyle(0xffdd00, 0.12));
        hit.on("pointerout",  () => hit.setFillStyle(0xffdd00, 0));
        hit.on("pointerdown", () => { if (!this.isDealing) this.attackMonster(idx); });
        this.monsterObjs.push(hit);
      }
    });
  }

  // ── 족보 계산 헬퍼 ───────────────────────────────────────────────────────
  _getSelectedCombo() {
    if (this.selected.size === 0) return { score: 0, label: "" };
    return calcScore([...this.selected].map(i => this.handData[i]));
  }

  // ── 족보 프리뷰 ──────────────────────────────────────────────────────────
  updatePreview() {
    const { score, label } = this._getSelectedCombo();
    if (score > 0) {
      this.previewLabelTxt.setText(`${label}  →`).setColor("#88ffaa");
      this.previewScoreTxt.setText(`${score}점`).setColor("#ffdd66");
    } else if (label) {
      this.previewLabelTxt.setText(label).setColor("#ff9966");
      this.previewScoreTxt.setText("");
    } else {
      this.previewLabelTxt.setText("");
      this.previewScoreTxt.setText("");
    }
  }

  // ── 플레이어 스탯 갱신 ───────────────────────────────────────────────────
  refreshPlayerStats() {
    const p = this.player;
    this.playerHpTxt.setText(`HP  ${p.hp} / ${p.maxHp}`);
    this.playerDefTxt.setText(`DEF  ${p.def}`);
    const ratio = Math.max(0, p.hp / p.maxHp);
    this._hpBarFill.setDisplaySize(Math.max(1, 220 * ratio), 9);
    this._hpBarFill.setFillStyle(ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xddaa00 : 0xdd3333);
    this.refreshPlayerLevel();
    this.goldTxt.setText(`${p.gold}`);
  }

  // ── 플레이어 레벨 / XP 갱신 ──────────────────────────────────────────────
  refreshPlayerLevel() {
    const p      = this.player;
    const req    = getRequiredExp(p.level);
    const xpFill = Math.max(1, Math.round(90 * Math.min(1, p.xp / req)));
    this._playerLevelTxt.setText(String(p.level));
    this._xpBarFill.setDisplaySize(xpFill, 5);
    //this._xpTxt.setText(`${p.xp}/${req}`);
    // 슈트 레벨
    ['S', 'H', 'D', 'C'].forEach(s => {
      this._attrTxts[s]?.setText(String(p.attrs[s]));
    });
  }

  // ── 배틀 로그 ────────────────────────────────────────────────────────────
  addBattleLog(text) {
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

  // ── 카드를 dummy 파일로 날리는 애니메이션 ───────────────────────────────
  _flyToDummy(fromX, fromY, key = "card_back") {
    this._sfx("sfx_fan");
    const img = this.add.image(fromX, fromY, key).setDisplaySize(CW, CH).setDepth(200);
    this.tweens.add({
      targets: img,
      x: GW - 80, y: FIELD_Y,
      displayWidth:  CW * 0.3,
      displayHeight: CH * 0.3,
      alpha: 0,
      duration: 380,
      ease: "Power2.In",
      onComplete: () => img.destroy(),
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
    const label   = damage > 0 ? `-${damage} HP` : "BLOCKED!";
    const txtStyle = damage > 0 ? TS.damageHit : TS.damageBlocked;
    const txt = this.add.text(mX, MONSTER_AREA_TOP + MONSTER_AREA_H + 8, label, txtStyle)
      .setOrigin(0.5, 0).setDepth(501);

    this.tweens.add({
      targets: txt,
      y: PLAYER_STAT_Y + 6,
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
      this.sortAsc  = true;
    }
    const asc = this.sortAsc;
    if (this.sortMode === "suit") {
      this.handData.sort((a, b) => {
        const sd = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
        return sd !== 0 ? (asc ? sd : -sd) : (asc ? a.val - b.val : b.val - a.val);
      });
    } else {
      this.handData.sort((a, b) => {
        const vd = a.val - b.val;
        return vd !== 0
          ? (asc ? vd : -vd)
          : (asc ? SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] : SUIT_ORDER[b.suit] - SUIT_ORDER[a.suit]);
      });
    }
  }

  // ── 정렬 버튼 클릭 (토글 + 렌더) ─────────────────────────────────────────
  sortBy(mode) {
    this.sortMode === mode
      ? (this.sortAsc = !this.sortAsc)
      : (this.sortMode = mode, this.sortAsc = true);

    if (mode === "suit") {
      this.handData.sort((a, b) => {
        const sd = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
        return sd !== 0 ? (this.sortAsc ? sd : -sd) : (this.sortAsc ? a.val - b.val : b.val - a.val);
      });
    } else {
      this.handData.sort((a, b) => {
        const vd = a.val - b.val;
        return vd !== 0
          ? (this.sortAsc ? vd : -vd)
          : (this.sortAsc ? SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] : SUIT_ORDER[b.suit] - SUIT_ORDER[a.suit]);
      });
    }
    this.selected.clear();
    this.render();
  }

  // ── 몬스터 공격 ──────────────────────────────────────────────────────────
  attackMonster(monIdx) {
    const mon = this.monsters[monIdx];
    if (!mon || mon.isDead || this.isDealing) return;

    const { score, label } = this._getSelectedCombo();
    if (score <= 0) return;

    const damage = Math.max(0, score - mon.def);
    mon.hp  = Math.max(0, mon.hp - damage);
    mon.def = Math.trunc(mon.def / 2);
    this.player.score += score;

    this.addBattleLog(`${mon.type.name}에게 ${label}로 ${damage} 데미지!`);
    this._sfx("sfx_knifeSlice");

    // 선택 카드 → dummy 애니메이션 + dummyData 이동
    const handPositions = this.calcHandPositions(this.handData.length);
    [...this.selected].forEach(i => {
      this._flyToDummy(handPositions[i].x, HAND_Y - 22, this.handData[i].key);
    });
    const usedCards = [...this.selected].sort((a, b) => b - a)
      .map(i => this.handData.splice(i, 1)[0]);
    this.dummyData.push(...usedCards);
    this.selected.clear();

    if (mon.hp <= 0) {
      mon.isDead = true;
      const newLevels = this.player.addXp(mon.xp);
      this.player.gold += mon.gold;
      this.addBattleLog(`${mon.type.name} 처치! +${mon.xp}XP +${mon.gold}G`);
      if (newLevels.length > 0) {
        this.addBattleLog(`LEVEL UP! Lv${this.player.level}`);
      }
      if (this.monsters.every(m => m.isDead)) {
        this.render();
        this.time.delayedCall(700, () => this.onRoundClear());
        return;
      }
    }

    this.render();
  }

  // ── 턴 종료 ──────────────────────────────────────────────────────────────
  onTurnEnd() {
    this.isDealing = true;
    const alive   = this.monsters.filter(m => !m.isDead);
    const ATK_GAP = 650;   // 몬스터 한 마리당 공격 간격 (ms)

    alive.forEach((m, localIdx) => {
      const globalIdx = this.monsters.indexOf(m);
      this.time.delayedCall(localIdx * ATK_GAP, () => {
        const dmg     = Math.max(0, m.atk - this.player.def);
        this.player.hp  = Math.max(0, this.player.hp - dmg);
        this.player.def = Math.trunc(this.player.def / 2);
        this.addBattleLog(`${m.type.name}의 공격! ${dmg} 데미지!`);
        this._showMonsterAttack(globalIdx, dmg);
        this.refreshPlayerStats();
        this.refreshBattleLog();
      });
    });

    // 모든 공격 종료 후 처리
    this.time.delayedCall(alive.length * ATK_GAP + 300, () => {
      this.render();
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
      this.lv.handSize - this.handData.length,
      this.lv.turnStartDrawLimit,
      this.deckData.length,
    ));
    for (let i = 0; i < need; i++) this.handData.push(this.deckData.pop());

    // 기존 필드 → dummy 애니메이션
    this.fieldData.forEach(card => this._flyToDummy(card.slotX, FIELD_Y, card.key));
    this.dummyData.push(...this.fieldData);

    // _flyToDummy 애니메이션(380ms) 완료 후 새 필드 딜
    this.time.delayedCall(420, () => {
      //this._sfx("sfx_shuffle");
      const slotPos = this.calcFieldPositions(this.lv.fieldSize);
      const draw    = Math.min(this.lv.fieldSize, this.deckData.length);
      this.fieldData = Array.from({ length: draw }, (_, k) => ({
        ...this.deckData.pop(),
        slotX: slotPos[k].x,
      }));

      this.fieldPickCount = 0;
      this.selected.clear();
      this.isDealing = false;
      this._applySortToHand();  // 턴 시작마다 기존 정렬 적용
      this.render();
    });
  }

  // ── 라운드 클리어 ────────────────────────────────────────────────────────
  onRoundClear() {
    this.isDealing = true;

    // 오버레이
    const g = this.add.graphics().setDepth(300);
    g.fillStyle(0x000000, 0.6);
    g.fillRect(0, 0, GW, GH);
    const pw = 460, ph = 260, px = GW / 2 - 230, py = GH / 2 - 130;
    g.fillStyle(0x0a2a10, 1);
    g.fillRoundedRect(px, py, pw, ph, 20);
    g.lineStyle(3, 0x44dd88);
    g.strokeRoundedRect(px, py, pw, ph, 20);

    this.add.text(GW / 2, py + 66,  "ROUND CLEAR!", TS.clearTitle).setOrigin(0.5).setDepth(301);
    this.add.text(GW / 2, py + 126, `ROUND ${this.round}  SCORE: ${this.player.score}`, TS.clearSub).setOrigin(0.5).setDepth(301);
    this.add.text(GW / 2, py + 166, "NEXT ROUND...", TS.clearNote).setOrigin(0.5).setDepth(301);

    this.time.delayedCall(2500, () => {
      this.scene.start("GameScene", {
        round:  this.round + 1,
        player: this.player.toData(),
      });
    });
  }

  // ── 게임 오버 ────────────────────────────────────────────────────────────
  showGameOver() {
    this.isDealing = true;

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
    btnBg.on("pointerover",  () => btnBg.setFillStyle(0x2d66cc));
    btnBg.on("pointerout",   () => btnBg.setFillStyle(0x1e4e99));
  }

  // ── 메시지 ───────────────────────────────────────────────────────────────
  showMsg(text, dur = 2000) {
    this.msgTxt.setText(text);
    if (this._mt) this._mt.remove();
    this._mt = this.time.delayedCall(dur, () => this.msgTxt.setText(""));
  }
}
