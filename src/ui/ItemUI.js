import { ITEM_PANEL_W, GW, BATTLE_LOG_H } from "../constants.js";
import { TS } from "../textStyles.js";

const RARITY_STRIP = { common: 0x4a9a5a, rare: 0x4a6aaa, epic: 0x8a4aaa };
const RARITY_LBL   = { common: '#ffffff', rare: '#ffffff', epic: '#ffffff' };

/**
 * ItemUI — 보유 아이템 패널 (우측)
 *
 * opts:
 *   panelX    {number}   패널 시작 x (기본: GW - ITEM_PANEL_W)
 *   panelW    {number}   패널 폭     (기본: ITEM_PANEL_W)
 *   startY    {number}   아이템 목록 시작 y (기본: BATTLE_LOG_H + 38)
 *   cardW     {number}   카드 폭  (기본 80)
 *   cardH     {number}   카드 높이 (기본 116)
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
      startY:    BATTLE_LOG_H + 38,
      cardW:     80,
      cardH:     116,
      draggable: false,
      depth:     9,
      ...opts,
    };
    this._objs = [];
  }

  _add(obj) { this._objs.push(obj); return obj; }

  create() {
    const { scene, player, opts } = this;
    const { panelX, panelW, startY, cardW, cardH, draggable, depth } = opts;
    const items = player.items ?? [];
    const D     = depth;
    const ipcx  = panelX + panelW / 2;

    // ITEMS 헤더
    this._add(
      scene.add.text(ipcx, BATTLE_LOG_H + 19, "ITEMS", TS.panelLabel)
        .setOrigin(0.5).setDepth(D + 1)
    );

    if (items.length === 0) {
      this._add(
        scene.add.text(ipcx, startY + 10, "—", TS.infoLabel)
          .setOrigin(0.5, 0).setDepth(D + 1)
      );
      return this;
    }

    const GAP   = 8;
    const PAD_L = Math.floor((panelW - cardW * 2 - GAP) / 2);
    const NAME_H = 18;

    items.forEach((item, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx  = panelX + PAD_L + col * (cardW + GAP) + cardW / 2;
      const cy  = startY + row * (cardH + GAP) + cardH / 2;

      const stripColor = RARITY_STRIP[item.rarity] ?? RARITY_STRIP.common;
      const lblColor   = RARITY_LBL[item.rarity]   ?? RARITY_LBL.common;

      const container = scene.add.container(cx, cy).setDepth(D);
      container.setSize(cardW, cardH);
      container.setInteractive();
      if (draggable) scene.input.setDraggable(container);
      container.setData("itemIndex", i);
      container.setData("origX", cx);
      container.setData("origY", cy);

      // 흰 카드 배경
      container.add(scene.add.rectangle(0, 0, cardW, cardH, 0xffffff).setStrokeStyle(1, 0xaaaaaa));

      // 이름 띠
      const stripY = -cardH / 2 + NAME_H / 2;
      container.add(scene.add.rectangle(0, stripY, cardW, NAME_H, stripColor));
      container.add(
        scene.add.text(0, stripY, item.name,
          { fontFamily: "'PressStart2P',Arial", fontSize: '5px', color: lblColor })
          .setOrigin(0.5)
      );

      // 이미지 or 플레이스홀더
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

      // desc
      container.add(
        scene.add.text(0, -cardH / 2 + NAME_H + 58, item.desc ?? "",
          { fontFamily: "'PressStart2P',Arial", fontSize: '5px', color: '#444444',
            wordWrap: { width: cardW - 8 } })
          .setOrigin(0.5, 0)
      );

      // hover 확대
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

  /** 아이템 목록 새로 그리기 */
  refresh() {
    this.destroy();
    this.create();
    return this;
  }

  destroy() {
    this._objs.forEach(o => { try { o?.destroy(); } catch (_) {} });
    this._objs = [];
  }
}
