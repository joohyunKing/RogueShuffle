import Phaser from "phaser";
import { GW, GH, PLAYER_PANEL_W, ITEM_PANEL_W, SUITS, RANKS, FIELD_CW, FIELD_CH } from "../constants.js";
import { TS } from "../textStyles.js";
import { Player } from "../manager/playerManager.js";
import DeckManager from "../manager/deckManager.js";
import { getAllItems } from '../manager/itemManager.js';
import { getRelicsExcluding } from '../manager/relicManager.js';
import { PlayerUI } from '../ui/PlayerUI.js';
import { ItemUI } from '../ui/ItemUI.js';
import { OptionUI } from '../ui/OptionUI.js';
import { roundManager } from '../manager/roundManager.js';

const RARITY_WEIGHT = { common: 60, rare: 30, epic: 10 };
const RARITY_COLORS = {
  common: { bg: 0x1a3a22, label: '#aaffaa' },
  rare:   { bg: 0x1a2a4a, label: '#aaaaff' },
  epic:   { bg: 0x2a1a3a, label: '#cc88ff' },
};
const SUIT_CHARS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const CARD_OP_COST = 20;
const CARD_OP_MAX  = 2;

// 레이아웃 상수
const PW  = PLAYER_PANEL_W;
const IPW = ITEM_PANEL_W;
const IPX = GW - IPW;
const FAW = GW - PW - IPW;
const CX  = PW + FAW / 2;

// 유물 카드
const RELIC_W = 150, RELIC_H = 186, RELIC_GAP = 22;
const RELIC_SECTION_TOP = 58;
const RELIC_CARD_TOP    = 76;

// 아이템 카드 (유물과 동일 크기, 5×1 그리드)
const ITEM_W = 150, ITEM_H = 186, ITEM_GAP_X = 16, ITEM_GAP_Y = 16;
const ITEM_COLS = 5;
const ITEM_SECTION_TOP = RELIC_CARD_TOP + RELIC_H + 14;  // ~276
const ITEM_CARD_TOP    = ITEM_SECTION_TOP + 18;           // ~294

// 카드 관리 섹션 (아이템 1행)
const CARD_MGMT_TOP = ITEM_CARD_TOP + ITEM_H + ITEM_GAP_Y + 10;  // ~516
const CARD_MGMT_H   = 62;

function pickWeighted(pool, n, weightFn) {
  const result = [];
  const avail  = [...pool];
  while (result.length < n && avail.length > 0) {
    const total = avail.reduce((s, r) => s + weightFn(r), 0);
    if (total <= 0) break;
    let rand = Math.random() * total;
    let idx  = avail.findIndex(r => (rand -= weightFn(r)) <= 0);
    if (idx < 0) idx = avail.length - 1;
    result.push(avail.splice(idx, 1)[0]);
  }
  return result;
}

export class MarketScene extends Phaser.Scene {
  constructor() { super("MarketScene"); }

  //round, player, deck, battleIndex
  create() {

    const data     = this.scene.settings.data || {};
    this.round     = data.round  ?? 1;
    this.player    = new Player(data.player ?? {});
    this._deckData = data.deck ?? null;
    this._deck     = new DeckManager(this._deckData ?? {});
    this.battleIndex = data.battleIndex  ?? 0;

    // 상점 초기화 — 보유하지 않은 유물만 판매
    const ownedRelics = new Set(this.player.relics);
    const relicPool   = getRelicsExcluding(ownedRelics);
    this._shopRelics  = pickWeighted(relicPool, 3, r => RARITY_WEIGHT[r.rarity] ?? 10)
      .map(r => ({ ...r, bought: false }));

    this._shopItems = pickWeighted(getAllItems(), 5, r => RARITY_WEIGHT[r.rarity] ?? 30)
      .map(r => ({ ...r, bought: false }));

    this._deckOpsUsed      = 0;
    this._deckSelectedCard = null;
    this._tipObjs       = [];
    this._tipPinned     = false;
    this._optionUI      = new OptionUI(this, {
      onMainMenu: () => this.scene.start("MainMenuScene"),
    });
    this._deckPopupObjs = null;

    this._drawScene();
  }

  // ── 툴팁 ────────────────────────────────────────────────────────────────
  _clearTip() {
    this._tipObjs.forEach(o => { try { o?.destroy(); } catch(_) {} });
    this._tipObjs   = [];
    this._tipPinned = false;
  }

  /**
   * 구매 버튼이 포함된 상점 툴팁
   */
  _showShopTip(nearX, nearY, title, desc, colorHex, price, canBuy, bought, onBuy) {
    this._tipObjs.forEach(o => { try { o?.destroy(); } catch(_) {} });
    this._tipObjs = [];

    const tw = 190, pad = 10, titleH = 18, lineH = 15, btnH = 30;
    const descLines = Math.max(1, Math.ceil((desc?.length ?? 0) / 13));
    const th = pad * 2 + titleH + descLines * lineH + 8 + btnH + 6;
    const colorN = parseInt(colorHex.replace('#', ''), 16);

    let tx = nearX - tw - 8;
    if (tx < PW + 4) tx = nearX + 8;
    const ty = Math.max(60, Math.min(nearY - th / 2, GH - th - 10));

    const g = this.add.graphics().setDepth(300);
    g.fillStyle(0x0a1e12, 0.97);
    g.fillRoundedRect(tx, ty, tw, th, 6);
    g.lineStyle(1, colorN);
    g.strokeRoundedRect(tx, ty, tw, th, 6);
    this._tipObjs.push(g);

    this._tipObjs.push(
      this.add.text(tx + pad, ty + pad, title,
        { fontFamily: "'PressStart2P',Arial", fontSize: '10px', color: colorHex })
        .setOrigin(0, 0).setDepth(301)
    );
    this._tipObjs.push(
      this.add.text(tx + pad, ty + pad + titleH, desc ?? '',
        { fontFamily: 'Arial', fontSize: '12px', color: '#aaccbb',
          wordWrap: { width: tw - pad * 2 } })
        .setOrigin(0, 0).setDepth(301)
    );

    // 구매 버튼 영역
    const btnY = ty + th - pad - btnH / 2;
    if (bought) {
      this._tipObjs.push(
        this.add.text(tx + tw / 2, btnY, 'SOLD',
          { fontFamily: "'PressStart2P',Arial", fontSize: '10px', color: '#555555' })
          .setOrigin(0.5).setDepth(301)
      );
    } else {
      const btnFill = canBuy ? 0x1a5533 : 0x2a1a1a;
      const btnBrd  = canBuy ? 0x44dd88 : 0x554444;
      const priceC  = canBuy ? '#ffdd44' : '#aa6644';
      const btn = this.add.rectangle(tx + tw / 2, btnY, tw - pad * 2, btnH, btnFill)
        .setDepth(301).setStrokeStyle(1, btnBrd).setInteractive();
      const btnTxt = this.add.text(tx + tw / 2, btnY, `구매  ${price}G`,
        { fontFamily: "'PressStart2P',Arial", fontSize: '10px', color: priceC })
        .setOrigin(0.5).setDepth(302);

      if (canBuy && onBuy) {
        btn.on('pointerdown', () => { this._clearTip(); onBuy(); });
        btn.on('pointerover',  () => btn.setFillStyle(0x2a7744));
        btn.on('pointerout',   () => btn.setFillStyle(btnFill));
      } else if (!canBuy) {
        btn.on('pointerdown', () => {
          btnTxt.setText('골드 부족!').setColor('#ff6644');
          this.time.delayedCall(900, () => {
            try { btnTxt.setText(`구매  ${price}G`).setColor(priceC); } catch(_) {}
          });
        });
      }
      this._tipObjs.push(btn, btnTxt);
    }
  }

  // ── 씬 전체 그리기 ──────────────────────────────────────────────────────
  _drawScene() {
    this.children.removeAll(true);
    this._tipObjs       = [];
    this._tipPinned     = false;
    this._deckPopupObjs = null;

    // 배경
    const bgKey = this._bgKey ?? `bg_${this.round}`;
    if (this.textures.exists(bgKey)) {
      this.add.image(GW / 2, GH, bgKey).setOrigin(0.5, 1).setDisplaySize(GW, GW).setDepth(-1);
    } else {
      this.add.rectangle(GW / 2, GH / 2, GW, GH, 0x0d2b18).setDepth(-1);
    }

    // 배경 클릭 캐처 — 핀된 툴팁 해제
    this.add.rectangle(GW / 2, GH / 2, GW, GH, 0xffffff, 0)
      .setDepth(0).setInteractive()
      .on('pointerdown', () => { this._tipPinned = false; this._clearTip(); });

    // 플레이어 패널
    this.playerUI = new PlayerUI(this, this.player, { round: this.round, showHandConfig: true });
    this.playerUI.create();

    // 헤더
    const hg = this.add.graphics().setDepth(1);
    hg.fillStyle(0x050e08, 0.88);
    hg.fillRect(PW, 0, FAW, 54);
    hg.lineStyle(1, 0x2a5a38);
    hg.strokeRect(PW, 0, FAW, 54);
    this.add.text(CX, 14, "MARKET",           TS.marketTitle).setOrigin(0.5, 0).setDepth(10);
    this.add.text(CX, 36, `ROUND ${this.round}`, TS.marketSub).setOrigin(0.5, 0).setDepth(10);

    // 옵션 버튼
    if (this.textures.exists("ui_option")) {
      const optImg = this.add.image(IPX - 58, 27, "ui_option")
        .setDisplaySize(90, 44).setDepth(10).setInteractive();
      optImg.on("pointerdown", () => this._showOptions());
      optImg.on("pointerover", () => optImg.setTint(0xaaddff));
      optImg.on("pointerout",  () => optImg.clearTint());
    }

    this._drawRelicSection();
    this._drawItemSection();
    this._drawCardMgmtSection();

    // CONTINUE 버튼
    const btnY = GH - 42;
    const btn  = this.add.rectangle(CX, btnY, 220, 50, 0x1a5533)
      .setDepth(10).setInteractive().setStrokeStyle(2, 0x44dd88);
    this.add.text(CX, btnY, "CONTINUE  ▶", TS.marketContinue).setOrigin(0.5).setDepth(11);
    btn.on("pointerdown", () => this._proceed());
    btn.on("pointerover",  () => btn.setFillStyle(0x2a7744));
    btn.on("pointerout",   () => btn.setFillStyle(0x1a5533));

    // 우측 아이템 패널
    const ig = this.add.graphics().setDepth(1);
    ig.fillStyle(0x080f14, 0.92);
    ig.fillRect(IPX, 0, IPW, GH);
    ig.lineStyle(1, 0x2a4a5a);
    ig.strokeRect(IPX, 0, IPW, GH);

    this.itemUI = new ItemUI(this, this.player, {
      panelX: IPX, panelW: IPW,
      startY: 10,
      draggable: false,
      depth: 10,
      onRelicRemove: (relicId) => {
        this.player.applyRelicOnRemove(relicId);
        this.player.relics = this.player.relics.filter(id => id !== relicId);
        this._drawScene();
      },
    });
    this.itemUI.create();
  }

  // ── 유물 섹션 ────────────────────────────────────────────────────────────
  _drawRelicSection() {
    const totalW   = this._shopRelics.length * RELIC_W + (this._shopRelics.length - 1) * RELIC_GAP;
    const gridLeft = PW + (FAW - totalW) / 2;
    const secH     = RELIC_CARD_TOP + RELIC_H - RELIC_SECTION_TOP + 10;

    const secG = this.add.graphics().setDepth(2);
    secG.fillStyle(0x050d08, 0.72);
    secG.fillRoundedRect(PW + 8, RELIC_SECTION_TOP, FAW - 16, secH, 6);
    this.add.text(CX, RELIC_SECTION_TOP + 8, "RELICS",
      { fontFamily: "'PressStart2P',Arial", fontSize: '12px', color: '#44cc88' })
      .setOrigin(0.5, 0).setDepth(10);

    this._shopRelics.forEach((relic, i) => {
      const cx = gridLeft + i * (RELIC_W + RELIC_GAP) + RELIC_W / 2;
      const cy = RELIC_CARD_TOP + RELIC_H / 2;
      this._drawRelicCard(cx, cy, relic, i);
    });
  }

  _drawRelicCard(cx, cy, relic, idx) {
    const W = RELIC_W, H = RELIC_H;
    const rar    = RARITY_COLORS[relic.rarity] ?? RARITY_COLORS.common;
    const canBuy = !relic.bought && this.player.gold >= relic.price
                   && this.player.relics.length < 6;
    const alpha  = relic.bought ? 0.4 : 1;
    const top    = cy - H / 2;

    // 카드 배경 (테두리 없음)
    const bg = this.add.graphics().setDepth(5);
    bg.fillStyle(relic.bought ? 0x1a1a1a : rar.bg, alpha);
    bg.fillRoundedRect(cx - W / 2, top, W, H, 6);

    // 이미지 (상단)
    const imgKey = `relic_${relic.id}`;
    const imgY   = top + 16 + 40;
    if (this.textures.exists(imgKey)) {
      this.add.image(cx, imgY, imgKey)
        .setDisplaySize(80, 80).setDepth(6).setAlpha(alpha);
    } else {
      this.add.rectangle(cx, imgY, 80, 80, 0x333333, 0.3).setDepth(6).setAlpha(alpha);
      this.add.text(cx, imgY, '?',
        { fontFamily: 'Arial', fontSize: '24px', color: rar.label })
        .setOrigin(0.5).setDepth(7).setAlpha(alpha);
    }

    // 이름 (중간)
    const nameY = top + 16 + 80 + 14;
    this.add.text(cx, nameY, relic.name,
      { fontFamily: "'PressStart2P',Arial", fontSize: '9px',
        color: relic.bought ? '#555555' : '#ffffff',
        wordWrap: { width: W - 14 }, align: 'center' })
      .setOrigin(0.5, 0).setDepth(6).setAlpha(alpha);

    // 가격 (하단)
    const priceY = cy + H / 2 - 18;
    if (relic.bought) {
      this.add.text(cx, priceY, "SOLD",
        { fontFamily: "'PressStart2P',Arial", fontSize: '10px', color: '#555555' })
        .setOrigin(0.5).setDepth(6);
    } else {
      const costColor = this.player.gold >= relic.price ? '#ffdd44' : '#aa6644';
      this.add.text(cx, priceY, `${relic.price}G`,
        { fontFamily: "'PressStart2P',Arial", fontSize: '11px', color: costColor })
        .setOrigin(0.5).setDepth(6).setAlpha(alpha);
    }

    // 히트 영역
    const hit = this.add.rectangle(cx, cy, W, H, 0xffffff, 0).setDepth(8).setInteractive();

    const showTip = () => {
      this._showShopTip(cx - W / 2, cy, relic.name, relic.description ?? '',
        rar.label, relic.price, canBuy, relic.bought,
        canBuy ? () => this._buyRelic(idx) : null);
    };

    hit.on('pointerover', () => {
      if (!relic.bought) hit.setFillStyle(0xffffff, 0.07);
      if (!this._tipPinned) showTip();
    });
    hit.on('pointerout', () => {
      hit.setFillStyle(0xffffff, 0);
      if (!this._tipPinned) this._clearTip();
    });
    hit.on('pointerdown', () => {
      this._tipPinned = true;
      showTip();
    });
  }

  _buyRelic(idx) {
    const relic = this._shopRelics[idx];
    if (relic.bought || this.player.gold < relic.price || this.player.relics.length >= 6) return;
    this.player.gold -= relic.price;
    relic.bought = true;
    this.player.tryAddRelic(relic.id);
    this._drawScene();
  }

  // ── 아이템 섹션 ──────────────────────────────────────────────────────────
  _drawItemSection() {
    const rows     = 1;
    const secH     = rows * ITEM_H + (ITEM_CARD_TOP - ITEM_SECTION_TOP) + 10;
    const totalW   = ITEM_COLS * ITEM_W + (ITEM_COLS - 1) * ITEM_GAP_X;
    const gridLeft = PW + (FAW - totalW) / 2;

    const secG = this.add.graphics().setDepth(2);
    secG.fillStyle(0x050d08, 0.72);
    secG.fillRoundedRect(PW + 8, ITEM_SECTION_TOP, FAW - 16, secH, 6);
    this.add.text(CX, ITEM_SECTION_TOP + 6, "ITEMS",
      { fontFamily: "'PressStart2P',Arial", fontSize: '12px', color: '#44cc88' })
      .setOrigin(0.5, 0).setDepth(10);

    this._shopItems.forEach((item, i) => {
      const col = i % ITEM_COLS;
      const cx  = gridLeft + col * (ITEM_W + ITEM_GAP_X) + ITEM_W / 2;
      const cy  = ITEM_CARD_TOP + ITEM_H / 2;
      this._drawItemCard(cx, cy, item, i);
    });
  }

  _drawItemCard(cx, cy, item, idx) {
    const W = ITEM_W, H = ITEM_H;
    const rar    = RARITY_COLORS[item.rarity] ?? RARITY_COLORS.common;
    const canBuy = !item.bought && this.player.gold >= item.cost
                   && this.player.items.length < 6;
    const alpha  = item.bought ? 0.4 : 1;
    const top    = cy - H / 2;

    // 카드 배경 (테두리 없음)
    const bg = this.add.graphics().setDepth(5);
    bg.fillStyle(item.bought ? 0x1a1a1a : rar.bg, alpha);
    bg.fillRoundedRect(cx - W / 2, top, W, H, 6);

    // 이미지 (상단)
    const imgKey = `item_${item.id}`;
    const imgY   = top + 16 + 40;
    const IMG_SZ = 80;
    if (this.textures.exists(imgKey)) {
      this.add.image(cx, imgY, imgKey)
        .setDisplaySize(IMG_SZ, IMG_SZ).setDepth(6).setAlpha(alpha);
    } else {
      this.add.rectangle(cx, imgY, IMG_SZ, IMG_SZ, 0x333333, 0.3).setDepth(6).setAlpha(alpha);
      this.add.text(cx, imgY, '?',
        { fontFamily: 'Arial', fontSize: '24px', color: rar.label })
        .setOrigin(0.5).setDepth(7).setAlpha(alpha);
    }

    // 이름 (중간)
    const nameY = top + 16 + 80 + 14;
    this.add.text(cx, nameY, item.name,
      { fontFamily: "'PressStart2P',Arial", fontSize: '9px',
        color: item.bought ? '#555555' : '#ffffff',
        wordWrap: { width: W - 14 }, align: 'center' })
      .setOrigin(0.5, 0).setDepth(6).setAlpha(alpha);

    // 가격 (하단)
    const priceY = cy + H / 2 - 18;
    if (item.bought) {
      this.add.text(cx, priceY, "SOLD",
        { fontFamily: "'PressStart2P',Arial", fontSize: '10px', color: '#555555' })
        .setOrigin(0.5).setDepth(6);
    } else {
      const costColor = this.player.gold >= item.cost ? '#ffdd44' : '#aa6644';
      this.add.text(cx, priceY, `${item.cost}G`,
        { fontFamily: "'PressStart2P',Arial", fontSize: '11px', color: costColor })
        .setOrigin(0.5).setDepth(6).setAlpha(alpha);
    }

    const hit = this.add.rectangle(cx, cy, W, H, 0xffffff, 0).setDepth(8).setInteractive();

    const showTip = () => {
      this._showShopTip(cx - W / 2, cy, item.name, item.desc ?? '',
        rar.label, item.cost, canBuy, item.bought,
        canBuy ? () => this._buyItem(idx) : null);
    };

    hit.on('pointerover', () => {
      if (!item.bought) hit.setFillStyle(0xffffff, 0.08);
      if (!this._tipPinned) showTip();
    });
    hit.on('pointerout', () => {
      hit.setFillStyle(0xffffff, 0);
      if (!this._tipPinned) this._clearTip();
    });
    hit.on('pointerdown', () => {
      this._tipPinned = true;
      showTip();
    });
  }

  _buyItem(idx) {
    const item = this._shopItems[idx];
    if (item.bought || this.player.gold < item.cost || this.player.items.length >= 6) return;
    this.player.gold -= item.cost;
    item.bought = true;
    const uid = `${item.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.player.items.push({
      uid, id: item.id, name: item.name,
      desc: item.desc, rarity: item.rarity, img: item.img ?? null,
    });
    this._drawScene();
  }

  // ── 카드 관리 섹션 ────────────────────────────────────────────────────────
  _drawCardMgmtSection() {
    const secG = this.add.graphics().setDepth(2);
    secG.fillStyle(0x050d08, 0.72);
    secG.fillRoundedRect(PW + 8, CARD_MGMT_TOP, FAW - 16, CARD_MGMT_H, 6);

    const btnY  = CARD_MGMT_TOP + CARD_MGMT_H / 2;
    const BTN_W = 188, BTN_H = 42;

    // 카드관리
    const mgmtX = CX - BTN_W / 2 - 12;
    const mgmt  = this.add.rectangle(mgmtX, btnY, BTN_W, BTN_H, 0x1a3a5a)
      .setDepth(10).setInteractive().setStrokeStyle(2, 0x4a8aaa);
    this.add.text(mgmtX, btnY, "카드관리",
      { fontFamily: "'PressStart2P',Arial", fontSize: '12px', color: '#88ccff' })
      .setOrigin(0.5).setDepth(11);
    mgmt.on("pointerdown", () => this._showDeckPopup());
    mgmt.on("pointerover",  () => mgmt.setFillStyle(0x2a5a7a));
    mgmt.on("pointerout",   () => mgmt.setFillStyle(0x1a3a5a));

    // 카드추가
    const opsLeft = CARD_OP_MAX - this._deckOpsUsed;
    const canAdd  = this.player.gold >= CARD_OP_COST && opsLeft > 0;
    const addX    = CX + BTN_W / 2 + 12;
    const addFill = canAdd ? 0x1a4a2a : 0x202020;
    const addBrd  = canAdd ? 0x4a9a5a : 0x444444;
    const addBtn  = this.add.rectangle(addX, btnY, BTN_W, BTN_H, addFill)
      .setDepth(10).setInteractive().setStrokeStyle(2, addBrd);
    this.add.text(addX, btnY, `카드추가  (${CARD_OP_COST}G)`,
      { fontFamily: "'PressStart2P',Arial", fontSize: '10px',
        color: canAdd ? '#aaffaa' : '#555555' })
      .setOrigin(0.5).setDepth(11);
    if (canAdd) {
      addBtn.on("pointerdown", () => this._addCard());
      addBtn.on("pointerover",  () => addBtn.setFillStyle(0x2a6a3a));
      addBtn.on("pointerout",   () => addBtn.setFillStyle(0x1a4a2a));
    }
  }

  _addCard() {
    if (this.player.gold < CARD_OP_COST || this._deckOpsUsed >= CARD_OP_MAX) return;
    const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
    const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
    this._deck.createCard(suit, rank, [{ type: 'add', value: 20 }], 'permanent', 'market', 'dummy');
    this.player.gold -= CARD_OP_COST;
    this._deckOpsUsed++;
    this._drawScene();
  }

  // ── 덱 팝업 (_showPilePopup 스타일) ──────────────────────────────────────
  _showDeckPopup() {
    if (this._deckPopupObjs) return;
    const objs = this._deckPopupObjs = [];

    const RANK_LIST = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    const CW_  = FIELD_CW, CH_ = FIELD_CH;
    const GAP_X = CW_ + 4, ROW_H = CH_ + 16, LABEL_W = 30, PAD = 20;
    const panelX  = PLAYER_PANEL_W + PAD;
    const panelW  = GW - PLAYER_PANEL_W - PAD * 2;
    const panelCX = panelX + panelW / 2;

    // 카드를 슈트별로 정렬
    const cards = this._deck.cards.filter(c => c.duration === 'permanent');
    const bySuit = { S: [], H: [], D: [], C: [] };
    for (const card of cards) {
      const s = card.suit ?? card.key?.[0];
      if (bySuit[s]) bySuit[s].push(card);
    }
    SUITS.forEach(s =>
      bySuit[s].sort((a, b) =>
        RANK_LIST.indexOf(a.rank ?? a.key?.slice(1)) -
        RANK_LIST.indexOf(b.rank ?? b.key?.slice(1))
      )
    );

    const titleH = 38, closeH = 40, actionH = 128;
    const panelH  = titleH + SUITS.length * ROW_H + actionH + closeH;
    const panelTop = Math.max(70, Math.round((GH - panelH) / 2));

    // 딤
    const dim = this.add.rectangle(GW / 2, GH / 2, GW, GH, 0x000000, 0.78)
      .setDepth(500).setInteractive();
    objs.push(dim);

    // 패널 배경
    objs.push(
      this.add.rectangle(panelCX, panelTop + panelH / 2, panelW, panelH, 0x0a1e12, 0.97)
        .setDepth(501).setStrokeStyle(1, 0x3a7a4a)
    );

    // 제목
    objs.push(
      this.add.text(panelCX, panelTop + titleH / 2,
        `카드 관리  (${cards.length}장)`,
        { fontFamily: "'PressStart2P',Arial", fontSize: '11px', color: '#ccffcc' })
        .setOrigin(0.5).setDepth(502)
    );

    // 슈트별 카드 표시
    const SUIT_SYMS   = { S: '♠', H: '♥', D: '♦', C: '♣' };
    const SUIT_COLORS = { S: '#8888ff', H: '#ff6666', D: '#ff6666', C: '#8888ff' };
    const rowsTop     = panelTop + titleH;

    SUITS.forEach((suit, si) => {
      const cy    = rowsTop + si * ROW_H + CH_ / 2 + 8;
      const sCards = bySuit[suit];

      objs.push(
        this.add.text(panelX + LABEL_W / 2, cy, SUIT_SYMS[suit],
          { fontFamily: 'Arial', fontSize: '18px', color: SUIT_COLORS[suit] })
          .setOrigin(0.5).setDepth(502)
      );

      sCards.forEach((card, ci) => {
        const cx = panelX + LABEL_W + 6 + ci * GAP_X + CW_ / 2;
        const isSelected = this._deckSelectedCard?.uid === card.uid;
        const hasEnh     = (card.enhancements?.length ?? 0) > 0;
        const isRed      = card.suit === 'H' || card.suit === 'D';

        let cardObj;
        if (this.textures.exists(card.key)) {
          cardObj = this.add.image(cx, cy, card.key)
            .setDisplaySize(CW_, CH_).setDepth(502);
        } else {
          const cg = this.add.graphics().setDepth(502);
          cg.fillStyle(isRed ? 0x2a0808 : 0x08102a);
          cg.fillRect(cx - CW_ / 2, cy - CH_ / 2, CW_, CH_);
          objs.push(cg);
          cardObj = this.add.text(cx, cy,
            `${card.rank ?? card.key?.slice(1)}\n${SUIT_SYMS[card.suit]}`,
            { fontFamily: 'Arial', fontSize: '12px', fontStyle: 'bold',
              color: isRed ? '#ff9999' : '#aaaaff', align: 'center' })
            .setOrigin(0.5).setDepth(503);
        }
        objs.push(cardObj);

        // 선택 테두리
        if (isSelected) {
          const selG = this.add.graphics().setDepth(503);
          selG.lineStyle(3, 0xffdd44);
          selG.strokeRect(cx - CW_ / 2, cy - CH_ / 2, CW_, CH_);
          objs.push(selG);
        }

        // 강화 표시 (노란 점)
        if (hasEnh) {
          objs.push(
            this.add.circle(cx + CW_ / 2 - 5, cy - CH_ / 2 + 5, 4, 0xffdd44).setDepth(504)
          );
        }

        const hitR = this.add.rectangle(cx, cy, CW_, CH_, 0xffffff, 0)
          .setDepth(505).setInteractive();
        hitR.on('pointerover', () => {
          this.tweens.add({ targets: cardObj,
            displayWidth: CW_ * 1.5, displayHeight: CH_ * 1.5, duration: 100 });
          cardObj.setDepth(560);
        });
        hitR.on('pointerout', () => {
          this.tweens.add({ targets: cardObj,
            displayWidth: CW_, displayHeight: CH_, duration: 100 });
          cardObj.setDepth(502);
        });
        hitR.on('pointerdown', () => {
          this._deckSelectedCard =
            (this._deckSelectedCard?.uid === card.uid) ? null : card;
          this._closeDeckPopup();
          this._showDeckPopup();
        });
        objs.push(hitR);
      });
    });

    // ── 하단 액션 영역 ──────────────────────────────────────────────────────
    const actionTop = panelTop + titleH + SUITS.length * ROW_H;
    const opsLeft   = CARD_OP_MAX - this._deckOpsUsed;
    const selCard   = this._deckSelectedCard;

    // 구분선
    const divG = this.add.graphics().setDepth(502);
    divG.lineStyle(1, 0x2a5a3a, 0.7);
    divG.lineBetween(panelX + 20, actionTop, panelX + panelW - 20, actionTop);
    objs.push(divG);

    // 선택 카드 정보
    if (selCard) {
      const isRed    = selCard.suit === 'H' || selCard.suit === 'D';
      const enhBonus = (selCard.enhancements ?? [])
        .reduce((s, e) => s + (e.type === 'add' ? e.value : 0), 0);
      const dispScore = selCard.baseScore + enhBonus;
      const enhLabel  = enhBonus > 0 ? ` (+${enhBonus})` : '';
      const suitSym   = SUIT_CHARS[selCard.suit] ?? '';
      objs.push(
        this.add.text(panelCX, actionTop + 14,
          `선택: ${selCard.rank ?? selCard.key?.slice(1)}${suitSym}  기본점수: ${dispScore}${enhLabel}`,
          { fontFamily: 'Arial', fontSize: '14px', color: isRed ? '#ff9999' : '#aaccff' })
          .setOrigin(0.5, 0).setDepth(502)
      );
    } else {
      objs.push(
        this.add.text(panelCX, actionTop + 14, '카드를 선택하세요',
          { fontFamily: "'PressStart2P',Arial", fontSize: '11px', color: '#446655' })
          .setOrigin(0.5, 0).setDepth(502)
      );
    }

    // 강화 버튼
    const canEnhance = !!selCard && this.player.gold >= CARD_OP_COST && opsLeft > 0;
    const enhX    = panelCX - 90;
    const btnActY = actionTop + 64;
    const enhBtn  = this.add.rectangle(enhX, btnActY, 162, 42,
      canEnhance ? 0x1a3a5a : 0x1a1a1a)
      .setDepth(502).setStrokeStyle(2, canEnhance ? 0x4488cc : 0x333333).setInteractive();
    objs.push(enhBtn,
      this.add.text(enhX, btnActY, `강화  (+20점)`,
        { fontFamily: "'PressStart2P',Arial", fontSize: '10px',
          color: canEnhance ? '#88ccff' : '#444444' })
        .setOrigin(0.5).setDepth(503));
    if (canEnhance) {
      enhBtn.on('pointerdown', () => this._deckEnhance());
      enhBtn.on('pointerover',  () => enhBtn.setFillStyle(0x2a5a8a));
      enhBtn.on('pointerout',   () => enhBtn.setFillStyle(0x1a3a5a));
    }

    // 제거 버튼 (비용 20G)
    const canRemove = !!selCard && this.player.gold >= CARD_OP_COST && opsLeft > 0;
    const remX   = panelCX + 90;
    const remBtn = this.add.rectangle(remX, btnActY, 162, 42,
      canRemove ? 0x3a1a1a : 0x1a1a1a)
      .setDepth(502).setStrokeStyle(2, canRemove ? 0xaa3333 : 0x333333).setInteractive();
    objs.push(remBtn,
      this.add.text(remX, btnActY, `제거  (${CARD_OP_COST}G)`,
        { fontFamily: "'PressStart2P',Arial", fontSize: '10px',
          color: canRemove ? '#ffaaaa' : '#444444' })
        .setOrigin(0.5).setDepth(503));
    if (canRemove) {
      remBtn.on('pointerdown', () => this._deckRemove());
      remBtn.on('pointerover',  () => remBtn.setFillStyle(0x5a2a2a));
      remBtn.on('pointerout',   () => remBtn.setFillStyle(0x3a1a1a));
    }

    // 비용 / 사용 횟수
    objs.push(
      this.add.text(panelX + panelW - 14, panelTop + panelH - 12,
        `비용: ${CARD_OP_COST}G  사용: ${this._deckOpsUsed} / ${CARD_OP_MAX}`,
        { fontFamily: 'Arial', fontSize: '13px', color: '#88aa77' })
        .setOrigin(1, 1).setDepth(502)
    );

    // 현재 골드
    const goldColor = this.player.gold >= CARD_OP_COST ? '#ffdd44' : '#aa6644';
    objs.push(
      this.add.text(panelX + 14, panelTop + panelH - 12,
        `골드: ${this.player.gold}G`,
        { fontFamily: 'Arial', fontSize: '13px', color: goldColor })
        .setOrigin(0, 1).setDepth(502)
    );

    // 닫기 버튼
    const closeY  = actionTop + actionH + closeH / 2;
    const closeBg = this.add.rectangle(panelCX, closeY, 130, 28, 0x1a3a22)
      .setDepth(502).setStrokeStyle(1, 0x4a9a5a);
    const closeTxt = this.add.text(panelCX, closeY, 'CLOSE',
      { fontFamily: "'PressStart2P',Arial", fontSize: '10px', color: '#aaffaa' })
      .setOrigin(0.5).setDepth(503).setInteractive();
    closeTxt.on('pointerdown', () => this._closeDeckPopup());
    dim.on('pointerdown',      () => this._closeDeckPopup());
    objs.push(closeBg, closeTxt);
  }

  _closeDeckPopup() {
    if (!this._deckPopupObjs) return;
    this._deckPopupObjs.forEach(o => { try { o?.destroy(); } catch (_) {} });
    this._deckPopupObjs = null;
  }

  _deckEnhance() {
    const card = this._deckSelectedCard;
    if (!card || this.player.gold < CARD_OP_COST || this._deckOpsUsed >= CARD_OP_MAX) return;
    card.enhancements = card.enhancements ?? [];
    card.enhancements.push({ type: 'add', value: 20 });
    this.player.gold -= CARD_OP_COST;
    this._deckOpsUsed++;
    this._deckSelectedCard = null;
    this._closeDeckPopup();
    this._drawScene();
    this._showDeckPopup();
  }

  _deckRemove() {
    const card = this._deckSelectedCard;
    if (!card || this.player.gold < CARD_OP_COST || this._deckOpsUsed >= CARD_OP_MAX) return;
    const rm = (arr) => arr.filter(c => c.uid !== card.uid);
    this._deck.cards     = rm(this._deck.cards);
    this._deck.deckPile  = rm(this._deck.deckPile);
    this._deck.hand      = rm(this._deck.hand);
    this._deck.field     = rm(this._deck.field);
    this._deck.dummyPile = rm(this._deck.dummyPile);
    this.player.gold    -= CARD_OP_COST;
    this._deckOpsUsed++;
    this._deckSelectedCard = null;
    this._closeDeckPopup();
    this._drawScene();
    this._showDeckPopup();
  }

  // ── 옵션 오버레이 ─────────────────────────────────────────────────────────
  _showOptions()  { this._optionUI.show(); }
  _closeOptions() { this._optionUI.close(); }

  _proceed() {
    const next = roundManager.getNextStep(this.round, this.battleIndex);

    this.scene.start('GameScene', {
      round:       next.round,
      player:      this.player.toData(),
      deck:        this._deck.getState(),
      battleIndex: next.battleIndex,
    });
  }
}
