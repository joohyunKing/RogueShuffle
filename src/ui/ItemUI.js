import { ITEM_PANEL_W, GW, GH, BATTLE_LOG_H } from "../constants.js";
import { TS } from "../textStyles.js";
import { relicMap as RELIC_MAP } from "../manager/relicManager.js";
import { TooltipUI } from "./TooltipUI.js";
import { getLang, getRelicName, getRelicDesc, getItemName, getItemDesc, getUiText } from "../service/langService.js";

const RARITY_STRIP  = { common: 0x4a9a5a, rare: 0x4a6aaa, epic: 0x8a4aaa, legend: 0xaa8822 };
const RARITY_COLOR  = { common: '#aaffaa', rare: '#aaaaff', epic: '#cc88ff', legend: '#ffdd44' };

/**
 * ItemUI — 우측 패널: Relic(위) + Item(아래)
 *
 * opts:
 *   panelX        {number}   패널 시작 x
 *   panelW        {number}   패널 폭
 *   startY        {number}   콘텐츠 시작 y
 *   draggable     {boolean}  item drag-to-use 여부 (기본 false)
 *   depth         {number}   기본 depth (기본 9)
 *   onItemClick   {function} 아이템 사용 콜백 (idx) => void
 *   onRelicSell   {function} relic 드래그 판매 콜백 (relicId) => void
 *   onItemSell    {function} item 드래그 판매 콜백 (idx) => void
 */
export class ItemUI {
  constructor(scene, player, opts = {}) {
    this.scene  = scene;
    this.player = player;
    this.opts   = {
      panelX:        GW - ITEM_PANEL_W,
      panelW:        ITEM_PANEL_W,
      startY:        BATTLE_LOG_H + 19,
      draggable:     false,
      onItemClick:   null,
      onRelicSell:   null,
      onItemSell:    null,
      depth:         9,
      ...opts,
    };
    this._objs       = [];
    this._tooltip    = new TooltipUI(scene, {});
    this._relicObjs  = {};
    this._isDragging = false;
    this._dragGhost    = null;
    this._dragGhostTxt = null;
    this._sellZone     = null;
    this._sellTxt      = null;
    this._tipPinned  = false;
    this._pinnedId   = null;
  }

  _add(obj) { this._objs.push(obj); return obj; }

  // ── 툴팁 헬퍼 ────────────────────────────────────────────────────────────
  _tipLeft() {
    return this.opts.panelX - 273 - 8;
  }

  _showTip(cy, title, desc, color) {
    this._tooltip.update({
      titleMsg:      title,
      contentMsg:    desc || '',
      titleMsgColor: color,
      tooltipW:      273,
      left:          this._tipLeft(),
      centerY:       cy,
      clampMin:      BATTLE_LOG_H + 4,
      clampMax:      GH - 10,
      onUse:         undefined,
      btnDisabled:   false,
      sold:          false,
      depth:         300,
    });
  }

  _getLang() {
    return getLang(this.scene);
  }

  _showRelicTip(cy, relic, color) {
    const lang = this._getLang();
    const stackMsg = this._getRelicStackMsg(relic, lang);
    const desc = getRelicDesc(lang, relic.id, relic.description ?? '');
    const fullDesc = stackMsg ? `${desc}\n${stackMsg}` : desc;
    this._showTip(cy, getRelicName(lang, relic.id, relic.name), fullDesc, color);
  }

  _getRelicStackMsg(relic, lang) {
    const counts = this.player?.handUseCounts ?? {};
    for (const effect of (relic.effects ?? [])) {
      if (effect.type === 'addPerHandUsage') {
        const usage = counts[effect.condition?.handRank] ?? 0;
        const pts   = usage * effect.value;
        return getUiText(lang, 'relicStack_perHand', { pts, usage });
      }
      if (effect.type === 'addPerTotalHandUsage') {
        const total = Object.values(counts).reduce((s, n) => s + n, 0);
        const pts   = total * effect.value;
        return getUiText(lang, 'relicStack_total', { pts, total });
      }
    }
    return null;
  }

  _showItemTip(cy, item, color, onUse) {
    const lang = this._getLang();
    this._tooltip.update({
      titleMsg:      getItemName(lang, item.id, item.name),
      contentMsg:    getItemDesc(lang, item.id, item.desc) || '',
      titleMsgColor: color,
      tooltipW:      273,
      left:          this._tipLeft(),
      centerY:       cy,
      clampMin:      BATTLE_LOG_H + 4,
      clampMax:      GH - 10,
      onUse,
      btnLabel:      '사 용',
      btnDisabled:   false,
      sold:          false,
      depth:         300,
    });
  }

  _clearTip() {
    this._tooltip.hide();
    this._tipPinned = false;
    this._pinnedId  = null;
  }

  // ── SELL 존 표시/숨김 ───────────────────────────────────────────────────
  _showSellZone() {
    if (this._sellZone) {
      this._sellZone.setVisible(true);
      this._sellTxt?.setVisible(true);
    }
  }

  _hideSellZone() {
    if (this._sellZone) {
      this._sellZone.setVisible(false);
      this._sellTxt?.setVisible(false);
    }
  }

  _isOverSellZone(x, y) {
    if (!this._sellZone || !this._sellZone.visible) return false;
    const r = this._sellZone;
    return x >= r.x - r.width / 2 && x <= r.x + r.width / 2
        && y >= r.y - r.height / 2 && y <= r.y + r.height / 2;
  }

  // ── 릴릭 드래그 시작 (lazy — 이동 감지 후 호출) ──────────────────────────
  _startRelicDrag(startPointer, relic, relicId, hit, borderC, D) {
    const { scene, opts } = this;
    const REL_SZ = 52;
    this._isDragging = true;
    this._clearTip();
    hit.setFillStyle(0xffffff, 0);
    this._showSellZone();

    this._dragGhost = scene.add.rectangle(startPointer.x, startPointer.y, REL_SZ, REL_SZ, borderC, 0.7)
      .setDepth(D + 10).setStrokeStyle(2, borderC);
    this._dragGhostTxt = scene.add.text(startPointer.x, startPointer.y, relic.name,
      { fontFamily: 'Arial', fontSize: '10px', color: '#fff',
        wordWrap: { width: REL_SZ - 4 } })
      .setOrigin(0.5).setDepth(D + 11);

    const onMove = (ptr) => {
      if (!this._isDragging) return;
      this._dragGhost?.setPosition(ptr.x, ptr.y);
      this._dragGhostTxt?.setPosition(ptr.x, ptr.y);
      const over = this._isOverSellZone(ptr.x, ptr.y);
      this._sellZone?.setFillStyle(over ? 0xaa1111 : 0x661111);
    };

    const onUp = (ptr) => {
      scene.input.off('pointermove', onMove);
      scene.input.off('pointerup',   onUp);

      const over = this._isOverSellZone(ptr.x, ptr.y);
      this._isDragging = false;
      if (this._dragGhost)    { this._dragGhost.destroy();    this._dragGhost    = null; }
      if (this._dragGhostTxt) { this._dragGhostTxt.destroy(); this._dragGhostTxt = null; }
      this._hideSellZone();
      this._sellZone?.setFillStyle(0x661111);
      hit.setFillStyle(0xffffff, 0);

      if (over) scene.time.delayedCall(0, () => opts.onRelicSell(relicId));
    };

    scene.input.on('pointermove', onMove);
    scene.input.on('pointerup',   onUp);
  }

  // ── 아이템 드래그 시작 (lazy — 이동 감지 후 호출) ─────────────────────────
  _startItemDrag(startPointer, item, itemIdx, hit, stripColor, D) {
    const { scene, opts } = this;
    const ITM_SZ = 56;
    this._isDragging = true;
    this._clearTip();
    hit.setFillStyle(0xffffff, 0);
    this._showSellZone();

    this._dragGhost = scene.add.rectangle(startPointer.x, startPointer.y, ITM_SZ, ITM_SZ, stripColor, 0.7)
      .setDepth(D + 10).setStrokeStyle(2, stripColor);
    this._dragGhostTxt = scene.add.text(startPointer.x, startPointer.y, item.name,
      { fontFamily: 'Arial', fontSize: '10px', color: '#fff',
        wordWrap: { width: ITM_SZ - 4 } })
      .setOrigin(0.5).setDepth(D + 11);

    const onMove = (ptr) => {
      if (!this._isDragging) return;
      this._dragGhost?.setPosition(ptr.x, ptr.y);
      this._dragGhostTxt?.setPosition(ptr.x, ptr.y);
      const over = this._isOverSellZone(ptr.x, ptr.y);
      this._sellZone?.setFillStyle(over ? 0xaa1111 : 0x661111);
    };

    const onUp = (ptr) => {
      scene.input.off('pointermove', onMove);
      scene.input.off('pointerup',   onUp);

      const over = this._isOverSellZone(ptr.x, ptr.y);
      this._isDragging = false;
      if (this._dragGhost)    { this._dragGhost.destroy();    this._dragGhost    = null; }
      if (this._dragGhostTxt) { this._dragGhostTxt.destroy(); this._dragGhostTxt = null; }
      this._hideSellZone();
      this._sellZone?.setFillStyle(0x661111);
      hit.setFillStyle(0xffffff, 0);

      if (over) scene.time.delayedCall(0, () => opts.onItemSell(itemIdx));
    };

    scene.input.on('pointermove', onMove);
    scene.input.on('pointerup',   onUp);
  }

  // ── 메인 렌더 ──────────────────────────────────────────────────────────
  create() {
    const { scene, player, opts } = this;
    const { panelX, panelW, startY, depth: D } = opts;
    const ipcx   = panelX + panelW / 2;
    const relics = player.relics ?? [];
    const items  = player.items  ?? [];
    const canSellRelic = !!opts.onRelicSell;
    const canSellItem  = !!opts.onItemSell;

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

    if (relics.length === 0) {
      this._add(
        scene.add.text(ipcx, relicContentY + 6, "—", TS.infoLabel)
          .setOrigin(0.5, 0).setDepth(D + 1)
      );
    } else {
      relics.forEach((relicId, i) => {
        const relic = RELIC_MAP[relicId];
        if (!relic) return;

        const col = i % REL_COLS;
        const row = Math.floor(i / REL_COLS);
        const cx  = panelX + REL_PAD + col * (REL_SZ + REL_GAPX) + REL_SZ / 2;
        const cy  = relicContentY + row * REL_ROW_H + REL_SZ / 2;

        const borderC = RARITY_STRIP[relic.rarity] ?? RARITY_STRIP.common;
        const tipC    = RARITY_COLOR[relic.rarity]  ?? RARITY_COLOR.common;
        const visObjs = [];

        const relBg = scene.add.rectangle(cx, cy, REL_SZ, REL_SZ, 0x0a1a0e).setDepth(D);
        this._add(relBg); visObjs.push(relBg);

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

        this._relicObjs[relic.id] = { objs: visObjs, baseCX: cx, baseCY: cy };

        const hit = this._add(
          scene.add.rectangle(cx, cy, REL_SZ, REL_SZ, 0xffffff, 0)
            .setDepth(D + 2).setInteractive()
        );

        hit.on('pointerover', () => {
          if (this._isDragging) return;
          if (!this._tipPinned) {
            this._showRelicTip(cy, relic, tipC);
            if (canSellRelic) hit.setFillStyle(0xff4444, 0.12);
          }
        });
        hit.on('pointerout', () => {
          if (this._isDragging) return;
          hit.setFillStyle(0xffffff, 0);
          if (!this._tipPinned) this._clearTip();
        });

        hit.on('pointerdown', (pointer) => {
          if (this._isDragging) return;
          const startX = pointer.x, startY = pointer.y;
          let moved = false;

          const onMove = (ptr) => {
            if (moved) return;
            if (Math.abs(ptr.x - startX) > 8 || Math.abs(ptr.y - startY) > 8) {
              moved = true;
              scene.input.off('pointermove', onMove);
              scene.input.off('pointerup',   onUpCheck);
              if (canSellRelic) {
                this._startRelicDrag(pointer, relic, relicId, hit, borderC, D);
              }
            }
          };

          const onUpCheck = () => {
            scene.input.off('pointermove', onMove);
            scene.input.off('pointerup',   onUpCheck);
            if (!moved) {
              if (this._tipPinned && this._pinnedId === relicId) {
                this._clearTip();
              } else {
                this._tipPinned = true;
                this._pinnedId  = relicId;
                this._showRelicTip(cy, relic, tipC);
              }
            }
          };

          scene.input.on('pointermove', onMove);
          scene.input.on('pointerup',   onUpCheck);
        });
      });
    }

    // ─── SELL 존 (relic/item 공용 판매 drop target) ──────────────────────
    const relicSectionH = 5 * REL_ROW_H;
    const sellZoneY     = relicContentY + relicSectionH + 2;

    if (canSellRelic || canSellItem) {
      const rz = scene.add.rectangle(ipcx, sellZoneY, panelW - 16, 32, 0x661111)
        .setDepth(D + 3).setVisible(false).setStrokeStyle(1, 0xff4444);
      const rt = scene.add.text(ipcx, sellZoneY, "[ SELL ]",
        { fontFamily: "'PressStart2P',Arial", fontSize: '9px', color: '#ff6666' })
        .setOrigin(0.5).setDepth(D + 4).setVisible(false);
      this._sellZone = rz;
      this._sellTxt  = rt;
      this._add(rz);
      this._add(rt);
    }

    // 구분선
    const relicSectionH2 = 5 * REL_ROW_H;
    const sepY = relicContentY + relicSectionH2 + ((canSellRelic || canSellItem) ? 42 : 16);
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

    const ITM_SZ   = 56;
    const ITM_IMG  = 44;
    const ITM_COLS = 3;
    const ITM_GAPX = 8;
    const ITM_GAPY = 8;
    const ITM_PAD  = Math.floor((panelW - ITM_COLS * ITM_SZ - (ITM_COLS - 1) * ITM_GAPX) / 2);
    const onItemClick = opts.onItemClick ?? null;

    items.forEach((item, i) => {
      const col = i % ITM_COLS;
      const row = Math.floor(i / ITM_COLS);
      const cx  = panelX + ITM_PAD + col * (ITM_SZ + ITM_GAPX) + ITM_SZ / 2;
      const cy  = itemStartY + row * (ITM_SZ + ITM_GAPY) + ITM_SZ / 2;

      const stripColor = RARITY_STRIP[item.rarity] ?? RARITY_STRIP.common;
      const tipColor   = RARITY_COLOR[item.rarity] ?? RARITY_COLOR.common;
      const itemKey    = `item_${i}`;

      this._add(
        scene.add.rectangle(cx, cy, ITM_SZ, ITM_SZ, 0x0c1a10).setDepth(D)
      );

      const imgKey = `item_${item.id}`;
      const useKey = scene.textures.exists(imgKey)             ? imgKey
                   : scene.textures.exists('item_heal_potion') ? 'item_heal_potion'
                   : null;
      if (useKey) {
        this._add(scene.add.image(cx, cy, useKey).setDisplaySize(ITM_IMG, ITM_IMG).setDepth(D + 1));
      } else {
        this._add(scene.add.rectangle(cx, cy, ITM_IMG, ITM_IMG, stripColor, 0.22).setDepth(D + 1));
        this._add(
          scene.add.text(cx, cy, '?', { fontFamily: 'Arial', fontSize: '18px', color: tipColor })
            .setOrigin(0.5).setDepth(D + 2)
        );
      }

      const hit = this._add(
        scene.add.rectangle(cx, cy, ITM_SZ, ITM_SZ, 0xffffff, 0)
          .setDepth(D + 2).setInteractive()
      );
      hit.on('pointerover', () => {
        if (this._isDragging) return;
        if (canSellItem) hit.setFillStyle(0xff4444, 0.12);
        else             hit.setFillStyle(0xffffff, 0.12);
        if (!this._tipPinned) {
          const lang = this._getLang();
          this._showTip(cy, getItemName(lang, item.id, item.name), getItemDesc(lang, item.id, item.desc ?? ''), tipColor);
        }
      });
      hit.on('pointerout', () => {
        if (this._isDragging) return;
        hit.setFillStyle(0xffffff, 0);
        if (!this._tipPinned) this._clearTip();
      });
      hit.on('pointerdown', (pointer) => {
        if (this._isDragging) return;
        const startX = pointer.x, startY = pointer.y;
        let moved = false;

        const onMove = (ptr) => {
          if (moved) return;
          if (Math.abs(ptr.x - startX) > 8 || Math.abs(ptr.y - startY) > 8) {
            moved = true;
            scene.input.off('pointermove', onMove);
            scene.input.off('pointerup',   onUpCheck);
            if (canSellItem) {
              this._startItemDrag(pointer, item, i, hit, stripColor, D);
            }
          }
        };

        const onUpCheck = () => {
          scene.input.off('pointermove', onMove);
          scene.input.off('pointerup',   onUpCheck);
          if (!moved) {
            if (this._tipPinned && this._pinnedId === itemKey) {
              this._clearTip();
              return;
            }
            this._tipPinned = true;
            this._pinnedId  = itemKey;
            if (onItemClick) {
              this._showItemTip(cy, item, tipColor, () => onItemClick(i));
            } else {
              const lang = this._getLang();
              this._showTip(cy, getItemName(lang, item.id, item.name), getItemDesc(lang, item.id, item.desc ?? ''), tipColor);
            }
          }
        };

        scene.input.on('pointermove', onMove);
        scene.input.on('pointerup',   onUpCheck);
      });
    });

    return this;
  }

  /** 특정 relic 한 번 pulse — 10% 커졌다 원상복귀 (공격 애니메이션용) */
  pulseRelic(relicId) {
    const entry = this._relicObjs[relicId];
    if (!entry) return;
    entry.objs.forEach(o => {
      const baseScale = o.scaleX;
      this.scene.tweens.killTweensOf(o);
      this.scene.tweens.add({
        targets: o,
        scaleX: baseScale * 1.1,
        scaleY: baseScale * 1.1,
        duration: 120, yoyo: true, ease: 'Sine.easeInOut',
        onComplete: () => { try { o.setScale(baseScale); } catch (_) {} },
      });
    });
  }

  /** 해당 relic id들만 달그락 애니메이션 */
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
    this._isDragging = false;
    if (this._dragGhost)    { try { this._dragGhost.destroy();    } catch(_) {} this._dragGhost    = null; }
    if (this._dragGhostTxt) { try { this._dragGhostTxt.destroy(); } catch(_) {} this._dragGhostTxt = null; }
    this._objs.forEach(o => { try { o?.destroy(); } catch (_) {} });
    this._objs = [];
    this._relicObjs = {};
    this._sellZone = null;
    this._sellTxt  = null;
  }
}
