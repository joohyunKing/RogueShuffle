import Phaser from "phaser";
import { GW, GH, PLAYER_PANEL_W, ITEM_PANEL_W, SUITS, FIELD_CW, FIELD_CH } from "../constants.js";
import { CardRenderer } from "../CardRenderer.js";
import { TS } from "../textStyles.js";
import { Player } from "../manager/playerManager.js";
import DeckManager from "../manager/deckManager.js";
import { getAllItems, maxItemCount } from '../manager/itemManager.js';
import { getRelicsExcluding, maxRelicCount } from '../manager/relicManager.js';
import { PlayerUI } from '../ui/PlayerUI.js';
import { ItemUI } from '../ui/ItemUI.js';
import { OptionUI } from '../ui/OptionUI.js';
import { TooltipUI } from '../ui/TooltipUI.js';
import { roundManager } from '../manager/roundManager.js';

// 라운드별 rarity 확률 (round 1: common 60/rare 30/epic 10, round 10: common 20/rare 50/epic 30)
function getRarityWeights(round) {
  const t = Math.min(Math.max((round - 1) / 9, 0), 1); // 0(1라운드) ~ 1(10라운드)
  return {
    common: Math.round(60 - 40 * t),  // 60 → 20
    rare: Math.round(30 + 20 * t),  // 30 → 50
    epic: Math.round(10 + 20 * t),  // 10 → 30
  };
}
const ITEM_PRICE = { common: 5, rare: 10, epic: 15 };
const RELIC_PRICE = { common: 20, rare: 30, epic: 40 };
const RARITY_COLORS = {
  common: { bg: 0x1a3a22, label: '#aaffaa' },
  rare: { bg: 0x1a2a4a, label: '#aaaaff' },
  epic: { bg: 0x2a1a3a, label: '#cc88ff' },
};

// 레이아웃 상수
const PW = PLAYER_PANEL_W;
const IPW = ITEM_PANEL_W;
const IPX = GW - IPW;
const FAW = GW - PW - IPW;
const CX = PW + FAW / 2;

// 유물 카드
const RELIC_W = 150, RELIC_H = 186, RELIC_GAP = 22;
const RELIC_SECTION_TOP = 58;
const RELIC_CARD_TOP = 76;

// 아이템 카드 (유물과 동일 크기, 4×1 그리드)
const ITEM_W = 150, ITEM_H = 186, ITEM_GAP_X = 16, ITEM_GAP_Y = 16;
const ITEM_COLS = 5;
const ITEM_SECTION_TOP = RELIC_CARD_TOP + RELIC_H + 14;  // ~276
const ITEM_CARD_TOP = ITEM_SECTION_TOP + 18;           // ~294

// 카드 관리 섹션 (아이템 1행)
const CARD_MGMT_TOP = ITEM_CARD_TOP + ITEM_H + ITEM_GAP_Y + 10;  // ~516
const CARD_MGMT_H = 62;

// rarity 그룹을 먼저 가중치로 뽑은 뒤, 그 안에서 랜덤 선택
// → rarity별 아이템 수에 관계없이 weights 비율이 정확히 반영됨
// weights: { common, rare, epic } (getRarityWeights(round) 결과)
function pickWeighted(pool, n, weights) {
  const result = [];
  const avail = [...pool];
  while (result.length < n && avail.length > 0) {
    // 현재 pool에 존재하는 rarity 집합만 추림
    const presentRarities = [...new Set(avail.map(r => r.rarity ?? 'common'))];
    const rarityTotal = presentRarities.reduce((s, rar) => s + (weights[rar] ?? 0), 0);
    if (rarityTotal <= 0) break;

    // 1단계: rarity 선택
    let rand = Math.random() * rarityTotal;
    let chosenRarity = presentRarities[presentRarities.length - 1];
    for (const rar of presentRarities) {
      rand -= weights[rar] ?? 0;
      if (rand <= 0) { chosenRarity = rar; break; }
    }

    // 2단계: 해당 rarity 내에서 랜덤 선택
    const candidates = avail.reduce((acc, r, i) => {
      if ((r.rarity ?? 'common') === chosenRarity) acc.push(i);
      return acc;
    }, []);
    if (candidates.length === 0) break;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    result.push(avail.splice(pick, 1)[0]);
  }
  return result;
}

export class MarketScene extends Phaser.Scene {
  constructor() { super("MarketScene"); }

  preload() {
    CardRenderer.preload(this);
  }

  //round, player, deck, battleIndex
  create() {
    CardRenderer.createAll(this);

    const data = this.scene.settings.data || {};
    this.round = data.round ?? 1;
    this.player = new Player(data.player ?? {});
    this._deckData = data.deck ?? null;
    this._deck = new DeckManager(this._deckData ?? {});
    this.battleIndex = data.battleIndex ?? 0;
    this._battleLog = data.battleLog ?? [];

    // 상점 초기화 — 라운드별 rarity 확률 적용
    const rarityWeights = getRarityWeights(this.round);
    const ownedRelics = new Set(this.player.relics);
    const relicPool = getRelicsExcluding(ownedRelics);
    this._shopRelics = pickWeighted(relicPool, 5, rarityWeights)
      .map(r => ({ ...r, bought: false }));

    this._shopItems = pickWeighted(getAllItems(), 5, rarityWeights)
      .map(r => ({ ...r, bought: false }));

    this._tooltip = new TooltipUI(this, {});
    this._tipPinned = false;
    this._optionUI = new OptionUI(this, {
      onMainMenu: () => this.scene.start("MainMenuScene"),
    });
    this._deckPopupObjs = null;

    this._drawScene();
  }

  // ── 툴팁 ────────────────────────────────────────────────────────────────
  _clearTip() {
    this._tooltip.hide();
    this._tipPinned = false;
  }

  _showShopTip(nearX, nearY, title, desc, colorHex, price, canBuy, bought, onBuy) {
    const TIP_W = 210;
    let left = nearX - TIP_W - 8;
    if (left < PW + 4) left = nearX + 8;

    this._tooltip.update({
      titleMsg: title,
      contentMsg: desc ?? '',
      titleMsgColor: colorHex,
      tooltipW: TIP_W,
      left,
      centerY: nearY,
      clampMin: 60,
      clampMax: GH - 10,
      onUse: (canBuy && !bought && onBuy) ? onBuy : undefined,
      btnLabel: `구매  ${price}G`,
      btnDisabled: (!canBuy && !bought),
      btnDisabledMsg: '골드 부족!',
      sold: bought,
      depth: 300,
    });
  }

  // ── 씬 전체 그리기 ──────────────────────────────────────────────────────
  _drawScene() {
    this.children.removeAll(true);
    this._tooltip = new TooltipUI(this, {});
    this._tipPinned = false;
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
    this.add.text(CX, 14, "MARKET", TS.marketTitle).setOrigin(0.5, 0).setDepth(10);
    this.add.text(CX, 36, `ROUND ${this.round}`, TS.marketSub).setOrigin(0.5, 0).setDepth(10);

    // 옵션 버튼
    if (this.textures.exists("ui_option")) {
      const optImg = this.add.image(IPX - 58, 27, "ui_option")
        .setDisplaySize(90, 44).setDepth(10).setInteractive();
      optImg.on("pointerdown", () => this._showOptions());
      optImg.on("pointerover", () => optImg.setTint(0xaaddff));
      optImg.on("pointerout", () => optImg.clearTint());
    }

    this._drawRelicSection();
    this._drawItemSection();
    this._drawCardMgmtSection();

    // CONTINUE 버튼
    const btnY = GH - 42;
    const btn = this.add.rectangle(CX, btnY, 220, 50, 0x1a5533)
      .setDepth(10).setInteractive().setStrokeStyle(2, 0x44dd88);
    this.add.text(CX, btnY, "CONTINUE  ▶", TS.marketContinue).setOrigin(0.5).setDepth(11);
    btn.on("pointerdown", () => this._proceed());
    btn.on("pointerover", () => btn.setFillStyle(0x2a7744));
    btn.on("pointerout", () => btn.setFillStyle(0x1a5533));

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
    const totalW = this._shopRelics.length * RELIC_W + (this._shopRelics.length - 1) * RELIC_GAP;
    const gridLeft = PW + (FAW - totalW) / 2;
    const secH = RELIC_CARD_TOP + RELIC_H - RELIC_SECTION_TOP + 10;

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
    const rar = RARITY_COLORS[relic.rarity] ?? RARITY_COLORS.common;
    const price = RELIC_PRICE[relic.rarity] ?? RELIC_PRICE.common;
    const canBuy = !relic.bought && this.player.gold >= price
      && this.player.relics.length < maxRelicCount;
    const alpha = relic.bought ? 0.4 : 1;
    const top = cy - H / 2;

    // 카드 배경 (테두리 없음)
    const bg = this.add.graphics().setDepth(5);
    bg.fillStyle(relic.bought ? 0x1a1a1a : rar.bg, alpha);
    bg.fillRoundedRect(cx - W / 2, top, W, H, 6);

    // 이미지 (상단)
    const imgKey = `relic_${relic.id}`;
    const imgY = top + 16 + 40;
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
      {
        fontFamily: "'PressStart2P',Arial", fontSize: '13px',
        color: relic.bought ? '#555555' : '#ffffff',
        wordWrap: { width: W - 14 }, align: 'center'
      })
      .setOrigin(0.5, 0).setDepth(6).setAlpha(alpha);

    // 가격 (하단)
    const priceY = cy + H / 2 - 18;
    if (relic.bought) {
      this.add.text(cx, priceY, "SOLD",
        { fontFamily: "'PressStart2P',Arial", fontSize: '10px', color: '#555555' })
        .setOrigin(0.5).setDepth(6);
    } else {
      const costColor = this.player.gold >= price ? '#ffdd44' : '#aa6644';
      this.add.text(cx, priceY, `${price}G`,
        { fontFamily: "'PressStart2P',Arial", fontSize: '11px', color: costColor })
        .setOrigin(0.5).setDepth(6).setAlpha(alpha);
    }

    // 히트 영역
    const hit = this.add.rectangle(cx, cy, W, H, 0xffffff, 0).setDepth(8).setInteractive();

    const showTip = () => {
      this._showShopTip(cx - W / 2, cy, relic.name, relic.description ?? '',
        rar.label, price, canBuy, relic.bought,
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
    const price = RELIC_PRICE[relic.rarity] ?? RELIC_PRICE.common;
    if (relic.bought || this.player.gold < price || this.player.relics.length >= maxRelicCount) return;
    this.player.gold -= price;
    relic.bought = true;
    this.player.tryAddRelic(relic.id);
    this._drawScene();
  }

  // ── 아이템 섹션 ──────────────────────────────────────────────────────────
  _drawItemSection() {
    const rows = 1;
    const secH = rows * ITEM_H + (ITEM_CARD_TOP - ITEM_SECTION_TOP) + 10;
    const totalW = ITEM_COLS * ITEM_W + (ITEM_COLS - 1) * ITEM_GAP_X;
    const gridLeft = PW + (FAW - totalW) / 2;

    const secG = this.add.graphics().setDepth(2);
    secG.fillStyle(0x050d08, 0.72);
    secG.fillRoundedRect(PW + 8, ITEM_SECTION_TOP, FAW - 16, secH, 6);
    this.add.text(CX, ITEM_SECTION_TOP + 6, "ITEMS",
      { fontFamily: "'PressStart2P',Arial", fontSize: '12px', color: '#44cc88' })
      .setOrigin(0.5, 0).setDepth(10);

    this._shopItems.forEach((item, i) => {
      const col = i % ITEM_COLS;
      const cx = gridLeft + col * (ITEM_W + ITEM_GAP_X) + ITEM_W / 2;
      const cy = ITEM_CARD_TOP + ITEM_H / 2;
      this._drawItemCard(cx, cy, item, i);
    });
  }

  _drawItemCard(cx, cy, item, idx) {
    const W = ITEM_W, H = ITEM_H;
    const rar = RARITY_COLORS[item.rarity] ?? RARITY_COLORS.common;
    const price = ITEM_PRICE[item.rarity] ?? ITEM_PRICE.common;
    const canBuy = !item.bought && this.player.gold >= price
      && this.player.items.length < maxItemCount;
    const alpha = item.bought ? 0.4 : 1;
    const top = cy - H / 2;

    // 카드 배경 (테두리 없음)
    const bg = this.add.graphics().setDepth(5);
    bg.fillStyle(item.bought ? 0x1a1a1a : rar.bg, alpha);
    bg.fillRoundedRect(cx - W / 2, top, W, H, 6);

    // 이미지 (상단)
    const imgKey = `item_${item.id}`;
    const imgY = top + 16 + 40;
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
      {
        fontFamily: "'PressStart2P',Arial", fontSize: '13px',
        color: item.bought ? '#555555' : '#ffffff',
        wordWrap: { width: W - 14 }, align: 'center'
      })
      .setOrigin(0.5, 0).setDepth(6).setAlpha(alpha);

    // 가격 (하단)
    const priceY = cy + H / 2 - 18;
    if (item.bought) {
      this.add.text(cx, priceY, "SOLD",
        { fontFamily: "'PressStart2P',Arial", fontSize: '10px', color: '#555555' })
        .setOrigin(0.5).setDepth(6);
    } else {
      const costColor = this.player.gold >= price ? '#ffdd44' : '#aa6644';
      this.add.text(cx, priceY, `${price}G`,
        { fontFamily: "'PressStart2P',Arial", fontSize: '11px', color: costColor })
        .setOrigin(0.5).setDepth(6).setAlpha(alpha);
    }

    const hit = this.add.rectangle(cx, cy, W, H, 0xffffff, 0).setDepth(8).setInteractive();

    const showTip = () => {
      this._showShopTip(cx - W / 2, cy, item.name, item.desc ?? '',
        rar.label, price, canBuy, item.bought,
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
    const price = ITEM_PRICE[item.rarity] ?? ITEM_PRICE.common;
    if (item.bought || this.player.gold < price || this.player.items.length >= 6) return;
    this.player.gold -= price;
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

    const btnY = CARD_MGMT_TOP + CARD_MGMT_H / 2;
    const BTN_W = 170, BTN_H = 42, BTN_GAP = 14;

    // 버튼 2개 균등 배치: [카드관리] [상점갱신]
    const mgmtX = CX - BTN_W / 2 - BTN_GAP / 2;
    const rfshX = CX + BTN_W / 2 + BTN_GAP / 2;

    // 카드관리
    const mgmt = this.add.rectangle(mgmtX, btnY, BTN_W, BTN_H, 0x1a3a5a)
      .setDepth(10).setInteractive().setStrokeStyle(2, 0x4a8aaa);
    this.add.text(mgmtX, btnY, "카드관리",
      { fontFamily: "'PressStart2P',Arial", fontSize: '12px', color: '#88ccff' })
      .setOrigin(0.5).setDepth(11);
    mgmt.on("pointerdown", () => this._showDeckPopup());
    mgmt.on("pointerover", () => mgmt.setFillStyle(0x2a5a7a));
    mgmt.on("pointerout", () => mgmt.setFillStyle(0x1a3a5a));

    // 상점갱신 (5G)
    const REFRESH_COST = 5;
    const canRefresh = this.player.gold >= REFRESH_COST;
    const rfshFill = canRefresh ? 0x3a2a1a : 0x202020;
    const rfshBrd = canRefresh ? 0xaa7a3a : 0x444444;
    const rfsh = this.add.rectangle(rfshX, btnY, BTN_W, BTN_H, rfshFill)
      .setDepth(10).setInteractive().setStrokeStyle(2, rfshBrd);
    this.add.text(rfshX, btnY, `상점갱신  (${REFRESH_COST}G)`,
      { fontFamily: "'PressStart2P',Arial", fontSize: '10px', color: canRefresh ? '#ffcc66' : '#555555' })
      .setOrigin(0.5).setDepth(11);
    if (canRefresh) {
      rfsh.on("pointerdown", () => this._refreshShop());
      rfsh.on("pointerover", () => rfsh.setFillStyle(0x5a4a2a));
      rfsh.on("pointerout", () => rfsh.setFillStyle(rfshFill));
    }
  }

  // ── 상점 갱신 ────────────────────────────────────────────────────────────
  _refreshShop() {
    const REFRESH_COST = 5;
    if (this.player.gold < REFRESH_COST) return;
    this.player.gold -= REFRESH_COST;
    const rarityWeights = getRarityWeights(this.round);
    const ownedRelics = new Set(this.player.relics);
    const relicPool = getRelicsExcluding(ownedRelics);
    this._shopRelics = pickWeighted(relicPool, 5, rarityWeights)
      .map(r => ({ ...r, bought: false }));
    this._shopItems = pickWeighted(getAllItems(), 5, rarityWeights)
      .map(r => ({ ...r, bought: false }));
    this._drawScene();
  }

  // ── 덱 팝업 (조회 전용) ───────────────────────────────────────────────────
  _showDeckPopup() {
    if (this._deckPopupObjs) return;
    const objs = this._deckPopupObjs = [];

    const RANK_LIST = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const CW_ = FIELD_CW, CH_ = FIELD_CH;
    const GAP_X = CW_ + 4, ROW_H = CH_ + 16, LABEL_W = 30, PAD = 20;
    const panelX = PLAYER_PANEL_W + PAD;
    const panelW = GW - PLAYER_PANEL_W - PAD * 2;
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

    const titleH = 38, closeH = 40;
    const panelH = titleH + SUITS.length * ROW_H + closeH;
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
        `덱 조회  (${cards.length}장)`,
        { fontFamily: "'PressStart2P',Arial", fontSize: '11px', color: '#ccffcc' })
        .setOrigin(0.5).setDepth(502)
    );

    // 슈트별 카드 표시
    const SUIT_SYMS = { S: '♠', H: '♥', D: '♦', C: '♣' };
    const SUIT_COLORS = { S: '#8888ff', H: '#ff6666', D: '#ff6666', C: '#8888ff' };
    const rowsTop = panelTop + titleH;

    SUITS.forEach((suit, si) => {
      const cy = rowsTop + si * ROW_H + CH_ / 2 + 8;
      const sCards = bySuit[suit];

      objs.push(
        this.add.text(panelX + LABEL_W / 2, cy, SUIT_SYMS[suit],
          { fontFamily: 'Arial', fontSize: '18px', color: SUIT_COLORS[suit] })
          .setOrigin(0.5).setDepth(502)
      );

      sCards.forEach((card, ci) => {
        const cx = panelX + LABEL_W + 6 + ci * GAP_X + CW_ / 2;
        const { cardImg: cardObj, sealImg } = CardRenderer.drawCard(this, cx, cy, card, { width: CW_, height: CH_, depth: 502, objs });

        const hitR = this.add.rectangle(cx, cy, CW_, CH_, 0xffffff, 0)
          .setDepth(505).setInteractive();
        hitR.on('pointerover', () => {
          this.tweens.add({ targets: cardObj, displayWidth: CW_ * 1.5, displayHeight: CH_ * 1.5, duration: 100 });
          cardObj.setDepth(560);
          sealImg?.setVisible(false);
          CardRenderer.showSealTooltip(this, card, cx, cy, CH_, 560);
        });
        hitR.on('pointerout', () => {
          this.tweens.add({ targets: cardObj, displayWidth: CW_, displayHeight: CH_, duration: 100 });
          cardObj.setDepth(502);
          sealImg?.setVisible(true);
          CardRenderer.hideSealTooltip();
        });
        objs.push(hitR);
      });
    });

    // 닫기 버튼
    const closeY = panelTop + panelH - closeH / 2;
    const closeBg = this.add.rectangle(panelCX, closeY, 130, 28, 0x1a3a22)
      .setDepth(502).setStrokeStyle(1, 0x4a9a5a);
    const closeTxt = this.add.text(panelCX, closeY, 'CLOSE',
      { fontFamily: "'PressStart2P',Arial", fontSize: '10px', color: '#aaffaa' })
      .setOrigin(0.5).setDepth(503).setInteractive();
    closeTxt.on('pointerdown', () => this._closeDeckPopup());
    dim.on('pointerdown', () => this._closeDeckPopup());
    objs.push(closeBg, closeTxt);
  }

  _closeDeckPopup() {
    if (!this._deckPopupObjs) return;
    this._deckPopupObjs.forEach(o => { try { o?.destroy(); } catch (_) { } });
    this._deckPopupObjs = null;
  }

  // ── 옵션 오버레이 ─────────────────────────────────────────────────────────
  _showOptions() { this._optionUI.show(); }
  _closeOptions() { this._optionUI.close(); }

  _proceed() {
    const next = roundManager.getNextStep(this.round, this.battleIndex);

    this.scene.start('GameScene', {
      round: next.round,
      player: this.player.toData(),
      deck: this._deck.getState(),
      battleIndex: next.battleIndex,
      battleLog: this._battleLog,
    });
  }
}
