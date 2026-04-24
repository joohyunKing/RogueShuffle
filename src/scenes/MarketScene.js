import Phaser from "phaser";
import { GW, GH, PLAYER_PANEL_W, ITEM_PANEL_W, SUITS } from "../constants.js";
import { CardRenderer } from "../CardRenderer.js";
import { TS } from "../textStyles.js";
import { Player } from "../manager/playerManager.js";
import DeckManager from "../manager/deckManager.js";
import { getAllItems } from '../manager/itemManager.js';
import { getRelicsExcluding } from '../manager/relicManager.js';
import { PlayerUI } from '../ui/PlayerUI.js';
import { ItemUI } from '../ui/ItemUI.js';
import { OptionUI } from '../ui/OptionUI.js';
import { TooltipUI } from '../ui/TooltipUI.js';
import { PilePopupUI } from '../ui/PilePopupUI.js';
import { roundManager } from '../manager/roundManager.js';
import { getLang, getItemName, getItemDesc, getRelicName, getRelicDesc, getMarket } from '../service/langService.js';

// 라운드별 rarity 확률 (round 1: common 60/rare 30/epic 10, round 10: common 20/rare 45/epic 27/legend 8)
function getRarityWeights(round) {
  const t = Math.min(Math.max((round - 1) / 9, 0), 1); // 0(1라운드) ~ 1(10라운드)
  return {
    common: Math.round(70 - 40 * t),  // 70 → 30
    rare: Math.round(25 + 15 * t),  // 25 → 40
    epic: Math.round(5 + 17 * t),  // 5 → 22
    legend: Math.round(0 + 8 * t),  //  0 →  8
  };
}
const ITEM_PRICE = { common: 10, rare: 15, epic: 20, legend: 25 };
const RELIC_PRICE = { common: 20, rare: 30, epic: 40, legend: 50 };
const RARITY_COLORS = {
  common: { bg: 0x1a3a22, label: '#aaffaa' },
  rare: { bg: 0x1a2a4a, label: '#aaaaff' },
  epic: { bg: 0x2a1a3a, label: '#cc88ff' },
  legend: { bg: 0x2a1e00, label: '#ffdd44' },
};

// 레이아웃 상수
const PW = PLAYER_PANEL_W;
const IPW = ITEM_PANEL_W;
const IPX = GW - IPW;
const FAW = GW - PW - IPW;
const CX = PW + FAW / 2;

// 유물 카드 (사이즈 축소)
const RELIC_W = 120, RELIC_H = 150, RELIC_GAP = 18;
const RELIC_SECTION_TOP = 64;
const RELIC_CARD_TOP = 82;

// 아이템 카드 (유물과 동일 크기)
const ITEM_W = 120, ITEM_H = 150, ITEM_GAP_X = 14, ITEM_GAP_Y = 14;
const ITEM_COLS = 5;
const ITEM_SECTION_TOP = RELIC_CARD_TOP + RELIC_H + 10;
const ITEM_CARD_TOP = ITEM_SECTION_TOP + 18;

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

    // BGM
    this._playBgm();
    this._bgmListener = (_parent, value) => {
      if (this._bgmSound) this._bgmSound.setVolume(value / 10);
    };
    this.registry.events.on('changedata-bgmVolume', this._bgmListener);

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
    this._pilePopup = new PilePopupUI(this);

    this._drawScene();
  }

  // ── BGM ─────────────────────────────────────────────────────────────────
  _playBgm() {
    const vol = (this.registry.get("bgmVolume") ?? 7) / 10;
    this._bgmSound = this.sound.add("bgm_market", { volume: vol, loop: true });
    this._bgmSound.play();
  }

  _stopBgm() {
    if (this._bgmSound) {
      this._bgmSound.stop();
      this._bgmSound.destroy();
      this._bgmSound = null;
    }
  }

  // ── 툴팁 ────────────────────────────────────────────────────────────────
  _clearTip() {
    this._tooltip.hide();
    this._tipPinned = false;
  }

  _showShopTip(nearX, nearY, title, desc, colorHex, price, canBuy, bought, onBuy) {
    const TIP_W = 273;
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
      btnLabel: `${price}G`,
      btnDisabled: (!canBuy && !bought),
      btnDisabledMsg: getMarket(getLang(this)).msg_no_gold,
      sold: bought,
      depth: 300,
    });
  }

  // ── 씬 전체 그리기 ──────────────────────────────────────────────────────
  _drawScene() {
    this.children.removeAll(true);
    this._tooltip = new TooltipUI(this, {});
    this._tipPinned = false;
    this._pilePopup = new PilePopupUI(this);

    // 배경
    const bgKey = this._bgKey ?? `bg_${this.round}`;
    if (this.textures.exists(bgKey)) {
      this.add.image(GW / 2, GH / 2, bgKey).setOrigin(0.5, 0.5).setDisplaySize(GW, GW).setDepth(-1);
    } else {
      this.add.rectangle(GW / 2, GH / 2, GW, GH, 0x0d2b18).setDepth(-1);
    }

    // 배경 클릭 캐처 — 핀된 툴팁 해제
    this.add.rectangle(GW / 2, GH / 2, GW, GH, 0xffffff, 0)
      .setDepth(0).setInteractive()
      .on('pointerdown', () => { this._tipPinned = false; this._clearTip(); });

    // 플레이어 패널
    this.playerUI = new PlayerUI(this, this.player, { round: this.round, showHandConfig: true, onOptions: () => this._optionUI.show() });
    this.playerUI.create();

    // 헤더
    if (this.textures.exists("ui_frame")) {
      this.add.nineslice(PW, 0, "ui_frame", 0, FAW, 54, 8, 8, 8, 8)
        .setOrigin(0, 0).setDepth(1);
    } else {
      const hg = this.add.graphics().setDepth(1);
      hg.fillStyle(0x050e08, 0.88);
      hg.fillRect(PW, 0, FAW, 54);
      hg.lineStyle(1, 0x2a5a38);
      hg.strokeRect(PW, 0, FAW, 54);
    }
    this.add.text(CX, 14, "MARKET", TS.marketTitle).setOrigin(0.5, 0).setDepth(10);
    this.add.text(CX, 36, `ROUND ${this.round}`, TS.marketSub).setOrigin(0.5, 0).setDepth(10);

    this._drawRelicSection();
    this._drawItemSection();
    this._drawCardMgmtSection();

    // CONTINUE 버튼
    const btnX = GW - IPW / 2;
    const btnY = GH - 42;
    const btn = this.add.image(btnX, btnY, "ui_btn")
      .setDisplaySize(220, 56).setDepth(10).setInteractive();
    this.add.text(btnX, btnY, "CONTINUE", TS.sortBtn).setOrigin(0.5).setDepth(11);
    btn.on("pointerdown", () => this._proceed());
    btn.on("pointerover", () => btn.setTint(0xcccccc));
    btn.on("pointerout", () => btn.clearTint());

    // 우측 아이템 패널
    if (this.textures.exists("ui_frame")) {
      this.add.nineslice(IPX, 0, "ui_frame", 0, IPW, GH, 8, 8, 8, 8)
        .setOrigin(0, 0).setDepth(1);
    } else {
      const ig = this.add.graphics().setDepth(1);
      ig.fillStyle(0x080f14, 0.92);
      ig.fillRect(IPX, 0, IPW, GH);
      ig.lineStyle(1, 0x2a4a5a);
      ig.strokeRect(IPX, 0, IPW, GH);
    }

    this.itemUI = new ItemUI(this, this.player, {
      panelX: IPX, panelW: IPW,
      startY: 10,
      draggable: false,
      depth: 10,
      onRelicSell: (relicId) => {
        this.player.applyRelicOnRemove(relicId);
        this.player.removeRelic(relicId);
        this._drawScene();
      },
      onItemSell: (idx) => {
        this.player.applyItemOnSell(idx);
        this.player.items.splice(idx, 1);
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

    // 섹션 배경 (테두리 제거, 단색/투명 배경)
    const secG = this.add.graphics().setDepth(2);
    secG.fillStyle(0x000000, 0.4);
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
      && this.player.relics.length < this.player.maxRelicCount;
    const alpha = relic.bought ? 0.4 : 1;
    const top = cy - H / 2;

    // 카드 배경 (테두리 없음)
    const bg = this.add.graphics().setDepth(5);
    bg.fillStyle(relic.bought ? 0x1a1a1a : rar.bg, alpha);
    bg.fillRoundedRect(cx - W / 2, top, W, H, 6);

    // 이미지 (상단)
    const imgKey = `relic_${relic.id}`;
    const imgY = top + 10 + 35;
    const IMG_SZ = 64;
    if (this.textures.exists(imgKey)) {
      this.add.image(cx, imgY, imgKey)
        .setDisplaySize(IMG_SZ, IMG_SZ).setDepth(6).setAlpha(alpha);
    } else {
      this.add.rectangle(cx, imgY, 80, 80, 0x333333, 0.3).setDepth(6).setAlpha(alpha);
      this.add.text(cx, imgY, '?',
        { fontFamily: 'Arial', fontSize: '24px', color: rar.label })
        .setOrigin(0.5).setDepth(7).setAlpha(alpha);
    }

    // 이름 (중간)
    const lang = getLang(this);
    const nameY = imgY + 38;
    this.add.text(cx, nameY, getRelicName(lang, relic.id, relic.name),
      {
        fontFamily: "'PressStart2P',Arial", fontSize: '11px',
        color: relic.bought ? '#555555' : '#ffffff',
        wordWrap: { width: W - 10 }, align: 'center'
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
      this._showShopTip(cx - W / 2, cy,
        getRelicName(lang, relic.id, relic.name),
        getRelicDesc(lang, relic.id, relic.description ?? ''),
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
    if (relic.bought || this.player.gold < price || this.player.relics.length >= this.player.maxRelicCount) return;
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

    // 섹션 배경 (테두리 제거)
    const secG = this.add.graphics().setDepth(2);
    secG.fillStyle(0x000000, 0.4);
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
      && this.player.items.length < this.player.maxItemCount;
    const alpha = item.bought ? 0.4 : 1;
    const top = cy - H / 2;

    // 카드 배경 (테두리 없음)
    const bg = this.add.graphics().setDepth(5);
    bg.fillStyle(item.bought ? 0x1a1a1a : rar.bg, alpha);
    bg.fillRoundedRect(cx - W / 2, top, W, H, 6);

    // 이미지 (상단)
    const imgKey = `item_${item.id}`;
    const imgY = top + 10 + 35;
    const IMG_SZ = 64;
    if (this.textures.exists(imgKey)) {
      this.add.image(cx, imgY, imgKey)
        .setDisplaySize(IMG_SZ, IMG_SZ).setDepth(6).setAlpha(alpha);
    } else {
      this.add.rectangle(cx, imgY, IMG_SZ, IMG_SZ, 0x333333, 0.3).setDepth(6).setAlpha(alpha);
      this.add.text(cx, imgY, '?',
        { fontFamily: 'Arial', fontSize: '20px', color: rar.label })
        .setOrigin(0.5).setDepth(7).setAlpha(alpha);
    }

    // 이름 (중간)
    const lang = getLang(this);
    const nameY = imgY + 38;
    this.add.text(cx, nameY, getItemName(lang, item.id, item.name),
      {
        fontFamily: "'PressStart2P',Arial", fontSize: '11px',
        color: item.bought ? '#555555' : '#ffffff',
        wordWrap: { width: W - 10 }, align: 'center'
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
      this._showShopTip(cx - W / 2, cy,
        getItemName(lang, item.id, item.name),
        getItemDesc(lang, item.id, item.desc ?? ''),
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
    //const btnY = CARD_MGMT_TOP + CARD_MGMT_H / 2;
    const btnY = GH - 42;
    //const BTN_W = 170, BTN_H = 42, BTN_GAP = 14;
    const BTN_W = 220, BTN_H = 56, BTN_GAP = 14;

    // 버튼 2개 균등 배치: [카드관리] [상점갱신]
    const mgmtX = CX - BTN_W / 2 - BTN_GAP / 2;
    const rfshX = CX + BTN_W / 2 + BTN_GAP / 2;

    const m = getMarket(getLang(this));

    // 카드관리
    const mgmt = this.add.image(mgmtX, btnY, "ui_btn")
      .setDisplaySize(BTN_W, BTN_H + 4).setDepth(10).setInteractive();
    this.add.text(mgmtX, btnY, m.btn_deck_mgmt, TS.sortBtn)
      .setOrigin(0.5).setDepth(11);
    mgmt.on("pointerdown", () => {
      const cards = this._deck.cards.filter(c => c.duration === 'permanent');
      const title = getMarket(getLang(this)).deck_title.replace('{n}', cards.length);
      this._pilePopup.show(cards, title);
    });
    mgmt.on("pointerover", () => mgmt.setTint(0xcccccc));
    mgmt.on("pointerout", () => mgmt.clearTint());

    // 상점갱신 (5G)
    const REFRESH_COST = 5;
    const canRefresh = this.player.gold >= REFRESH_COST;
    const rfsh = this.add.image(rfshX, btnY, "ui_btn")
      .setDisplaySize(BTN_W, BTN_H + 4).setDepth(10).setInteractive();
    if (!canRefresh) rfsh.setAlpha(0.6).setTint(0x666666);

    this.add.text(rfshX, btnY, m.btn_shop_refresh.replace('{cost}', REFRESH_COST), TS.sortBtn)
      .setOrigin(0.5).setDepth(11);
    if (canRefresh) {
      rfsh.on("pointerdown", () => this._refreshShop());
      rfsh.on("pointerover", () => rfsh.setTint(0xcccccc));
      rfsh.on("pointerout", () => rfsh.clearTint());
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

  _proceed() {
    this.registry.events.off('changedata-bgmVolume', this._bgmListener);
    this._stopBgm();

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
