import { ITEM_PANEL_W, GW, GH, BATTLE_LOG_H } from "../constants.js";
import { TS } from "../textStyles.js";
import relicData from "../data/relic.json";

const RARITY_STRIP  = { common: 0x4a9a5a, rare: 0x4a6aaa, epic: 0x8a4aaa };
const RARITY_COLOR  = { common: '#aaffaa', rare: '#aaaaff', epic: '#cc88ff' };

// relic id → relic 객체
const RELIC_MAP = Object.fromEntries(relicData.relics.map(r => [r.id, r]));

/**
 * ItemUI — 우측 패널: Relic(위) + Item(아래)
 *
 * opts:
 *   panelX    {number}   패널 시작 x  (기본: GW - ITEM_PANEL_W)
 *   panelW    {number}   패널 폭       (기본: ITEM_PANEL_W)
 *   startY    {number}   콘텐츠 시작 y (기본: BATTLE_LOG_H + 19)
 *   cardW     {number}   아이템 카드 폭 (기본 80)
 *   cardH     {number}   아이템 카드 높이 (기본 116)
 *   draggable {boolean}  drag-to-use 여부 (기본 false)
 *   depth     {number}   기본 depth (기본 9)
 */
export class ItemUI {
  constructor(scene, player, opts = {}) {
    this.scene  = scene;
    this.player = player;
    this.opts   = {
      panelX:    GW - ITEM_PANEL_W,
      panelW:    ITEM_PANEL_W,
      startY:    BATTLE_LOG_H + 19,
      cardW:     80,
      cardH:     116,
      draggable: false,
      depth:     9,
      ...opts,
    };
    this._objs      = [];
    this._tipObjs   = [];
    this._relicObjs = {}; // id → { objs: [], baseCX: number }
  }

  _add(obj) { this._objs.push(obj); return obj; }

  // ── 툴팁 (패널 왼쪽에 표시) ────────────────────────────────────────────
  _clearTip() {
    this._tipObjs.forEach(o => { try { o?.destroy(); } catch (_) {} });
    this._tipObjs = [];
  }

  _showTip(nearY, title, desc, color) {
    this._clearTip();
    const { scene } = this;
    const { panelX } = this.opts;
    const tw = 164, pad = 10, titleH = 18, descLineH = 18;
    const descLines = Math.max(1, Math.ceil(desc.length / 13));
    const th = pad * 2 + titleH + descLines * descLineH;
    const tx = panelX - tw - 8;
    const ty = Math.max(BATTLE_LOG_H + 4, Math.min(nearY - th / 2, GH - th - 10));
    const colorN = parseInt(color.replace('#', ''), 16);

    const g = scene.add.graphics().setDepth(300);
    g.fillStyle(0x0a1e12, 0.95);
    g.fillRoundedRect(tx, ty, tw, th, 6);
    g.lineStyle(1, colorN);
    g.strokeRoundedRect(tx, ty, tw, th, 6);
    this._tipObjs.push(g);

    this._tipObjs.push(
      scene.add.text(tx + pad, ty + pad, title,
        { fontFamily: "'PressStart2P', Arial", fontSize: '10px', color })
        .setOrigin(0, 0).setDepth(301)
    );
    this._tipObjs.push(
      scene.add.text(tx + pad, ty + pad + titleH, desc,
        { fontFamily: 'Arial', fontSize: '14px', color: '#aaccbb',
          wordWrap: { width: tw - pad * 2 } })
        .setOrigin(0, 0).setDepth(301)
    );
  }

  // ── 메인 렌더 ──────────────────────────────────────────────────────────
  create() {
    const { scene, player, opts } = this;
    const { panelX, panelW, startY, cardW, cardH, draggable, depth: D } = opts;
    const ipcx   = panelX + panelW / 2;
    const relics = player.relics ?? [];
    const items  = player.items  ?? [];

    // ─── RELIC 섹션 ──────────────────────────────────────────────────────
    this._add(
      scene.add.text(ipcx, startY, "RELICS", TS.panelLabel)
        .setOrigin(0.5, 0).setDepth(D + 1)
    );

    const REL_SZ    = 52;
    const REL_IMG   = 44;
    const REL_COLS  = 3;
    const REL_GAPX  = 8;
    const REL_GAPY  = 6;
    const REL_PAD   = Math.floor((panelW - REL_COLS * REL_SZ - (REL_COLS - 1) * REL_GAPX) / 2);
    const REL_ROW_H = REL_SZ + REL_GAPY;

    const relicContentY = startY + 20;
    let relicRows = 0;

    if (relics.length === 0) {
      this._add(
        scene.add.text(ipcx, relicContentY + 6, "—", TS.infoLabel)
          .setOrigin(0.5, 0).setDepth(D + 1)
      );
    } else {
      relicRows = Math.ceil(relics.length / REL_COLS);
      relics.forEach((relicId, i) => {
        const relic = RELIC_MAP[relicId];
        if (!relic) return;

        const col = i % REL_COLS;
        const row = Math.floor(i / REL_COLS);
        const cx  = panelX + REL_PAD + col * (REL_SZ + REL_GAPX) + REL_SZ / 2;
        const cy  = relicContentY + row * REL_ROW_H + REL_SZ / 2;

        const borderC = RARITY_STRIP[relic.rarity]  ?? RARITY_STRIP.common;
        const tipC    = RARITY_COLOR[relic.rarity]   ?? RARITY_COLOR.common;
        const visObjs = [];

        // 배경
        const relBg = scene.add.rectangle(cx, cy, REL_SZ, REL_SZ, 0x0a1a0e).setDepth(D);
        this._add(relBg); visObjs.push(relBg);

        // 이미지
        const imgKey = `relic_${relic.id}`;
        if (scene.textures.exists(imgKey)) {
          const img = scene.add.image(cx, cy, imgKey).setDisplaySize(REL_IMG, REL_IMG).setDepth(D + 1);
          this._add(img); visObjs.push(img);
        } else {
          const ph    = scene.add.rectangle(cx, cy, REL_IMG, REL_IMG, borderC, 0.18).setDepth(D + 1);
          const phTxt = scene.add.text(cx, cy, '?',
            { fontFamily: 'Arial', fontSize: '18px', color: tipC }).setOrigin(0.5).setDepth(D + 2);
          this._add(ph); this._add(phTxt);
          visObjs.push(ph, phTxt);
        }

        this._relicObjs[relic.id] = { objs: visObjs, baseCX: cx };

        // hover 툴팁 (hit은 rattle 대상 아님)
        const hit = this._add(
          scene.add.rectangle(cx, cy, REL_SZ, REL_SZ, 0xffffff, 0)
            .setDepth(D + 2).setInteractive()
        );
        hit.on('pointerover', () => this._showTip(cy, relic.name, relic.description, tipC));
        hit.on('pointerout',  () => this._clearTip());
      });
    }

    // 구분선
    //const relicSectionH = relicRows > 0 ? relicRows * REL_ROW_H : 26;
    const relicSectionH = 5 * REL_ROW_H;  // item 늘 같은 위치에 보이는게 깔끔
    const sepY = relicContentY + relicSectionH + 16;
    this._add(
      scene.add.rectangle(ipcx, sepY, panelW - 16, 1, 0x2a4a3a).setDepth(D)
    );

    // ─── ITEM 섹션 ───────────────────────────────────────────────────────
    const itemHeaderY = sepY + 20;
    this._add(
      scene.add.text(ipcx, itemHeaderY, "ITEMS", TS.panelLabel)
        .setOrigin(0.5, 0).setDepth(D + 1)
    );

    const itemStartY = itemHeaderY + 20;

    if (items.length === 0) {
      this._add(
        scene.add.text(ipcx, itemStartY + 6, "—", TS.infoLabel)
          .setOrigin(0.5, 0).setDepth(D + 1)
      );
      return this;
    }

    const GAP    = 8;
    const PAD_L  = Math.floor((panelW - cardW * 2 - GAP) / 2);
    const NAME_H = 18;

    items.forEach((item, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx  = panelX + PAD_L + col * (cardW + GAP) + cardW / 2;
      const cy  = itemStartY + row * (cardH + GAP) + cardH / 2;

      const stripColor = RARITY_STRIP[item.rarity] ?? RARITY_STRIP.common;

      const container = scene.add.container(cx, cy).setDepth(D);
      container.setSize(cardW, cardH);
      container.setInteractive();
      if (draggable) scene.input.setDraggable(container);
      container.setData("itemIndex", i);
      container.setData("origX", cx);
      container.setData("origY", cy);

      container.add(scene.add.rectangle(0, 0, cardW, cardH, 0xffffff).setStrokeStyle(1, 0xaaaaaa));

      const stripY = -cardH / 2 + NAME_H / 2;
      container.add(scene.add.rectangle(0, stripY, cardW, NAME_H, stripColor));
      container.add(
        scene.add.text(0, stripY, item.name,
          { fontFamily: "'PressStart2P',Arial", fontSize: '5px', color: '#ffffff' })
          .setOrigin(0.5)
      );

      const imgKey = `item_${item.id}`;
      const imgY   = -cardH / 2 + NAME_H + 28;
      if (item.img && scene.textures.exists(imgKey)) {
        container.add(scene.add.image(0, imgY, imgKey).setDisplaySize(40, 40));
      } else {
        container.add(scene.add.rectangle(0, imgY, 40, 40, 0xdddddd).setStrokeStyle(1, 0xaaaaaa));
        container.add(
          scene.add.text(0, imgY, '?',
            { fontFamily: 'Arial', fontSize: '16px', color: '#888888' }).setOrigin(0.5)
        );
      }

      container.add(
        scene.add.text(0, -cardH / 2 + NAME_H + 58, item.desc ?? "",
          { fontFamily: "'PressStart2P',Arial", fontSize: '5px', color: '#444444',
            wordWrap: { width: cardW - 8 } })
          .setOrigin(0.5, 0)
      );

      container.on("pointerover", () => {
        scene.tweens.add({ targets: container, scaleX: 1.3, scaleY: 1.3, y: cy - 8, duration: 100 });
        container.setDepth(25);
      });
      container.on("pointerout", () => {
        scene.tweens.add({ targets: container, scaleX: 1, scaleY: 1, y: cy, duration: 100 });
        container.setDepth(D);
      });

      this._add(container);
    });

    return this;
  }

  /** 해당 relic id들만 달그락 애니메이션. 빈 배열이면 전체 정지 */
  rattleRelics(ids = []) {
    const idSet = new Set(ids);
    Object.entries(this._relicObjs).forEach(([id, { objs, baseCX }]) => {
      objs.forEach(o => { this.scene.tweens.killTweensOf(o); o.x = baseCX; });
      if (!idSet.has(id)) return;
      objs.forEach(o => {
        this.scene.tweens.add({
          targets: o,
          x: { from: baseCX - 2, to: baseCX + 2 },
          duration: 70, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
      });
    });
  }

  refresh() { this.destroy(); this.create(); return this; }

  destroy() {
    this._clearTip();
    this._objs.forEach(o => { try { o?.destroy(); } catch (_) {} });
    this._objs = [];
    this._relicObjs = {};
  }
}
