import {
  BATTLE_LOG_H, PLAYER_PANEL_W, GW, ITEM_PANEL_W,
  MONSTER_AREA_TOP, MONSTER_AREA_H,
} from "../constants.js";
import { TS } from "../textStyles.js";

/**
 * BattleLogUI — 배틀 로그 2줄 표시 + 클릭 시 확장 패널
 *
 * opts:
 *   depth  {number}  기본 depth (기본 10)
 */
export class BattleLogUI {
  constructor(scene, logs = [], opts = {}) {
    this.scene = scene;
    this._logs = logs;
    this.opts  = { depth: 10, ...opts };

    this._objs   = [];
    this._logLine1 = null;
    this._logLine2 = null;

    this._expanded           = false;
    this._expandedBg         = null;
    this._expandedLines      = null;
    this._logScrollOffset    = 0;
    this._logWheelHandler    = null;
    this._logPointerHandlers = null;

    // create() 시 결정
    this._cx   = 0;
    this._CX   = 0;
    this._FAW_ = 0;
  }

  _add(obj) { this._objs.push(obj); return obj; }

  create() {
    const { scene, opts } = this;
    const D    = opts.depth;
    const PW   = PLAYER_PANEL_W;
    const IPW  = ITEM_PANEL_W;
    const FAW  = GW - PW - IPW;
    const cx   = PW + FAW / 2;
    const FAW_ = FAW - 20;
    const CX   = PW + 10;

    this._cx   = cx;
    this._FAW_ = FAW_;
    this._CX   = CX;

    this._logLine1 = this._add(
      scene.add.text(cx, 18, "", TS.log).setOrigin(0.5, 0.5).setDepth(D).setAlpha(0.55)
    );
    this._logLine2 = this._add(
      scene.add.text(cx, 46, "", TS.log).setOrigin(0.5, 0.5).setDepth(D)
    );

    const logHit = this._add(
      scene.add.rectangle(cx, BATTLE_LOG_H / 2, FAW_, BATTLE_LOG_H, 0xffffff, 0)
        .setDepth(D + 5).setInteractive()
    );
    logHit.on('pointerdown', () => this.toggle());

    this.refresh();
    return this;
  }

  get logs() { return this._logs; }

  addLog(text) {
    this._logs.push(text);
    this.refresh();
    if (this._expanded) this._updateExpandedLines();
    return this;
  }

  refresh() {
    const logs = this._logs;
    this._logLine1?.setText(logs.length >= 2 ? logs[logs.length - 2] : "");
    this._logLine2?.setText(logs.length >= 1 ? logs[logs.length - 1] : "");
    return this;
  }

  toggle() {
    if (this._expanded) this.hideExpanded();
    else this.showExpanded();
  }

  showExpanded() {
    if (this._expanded) return;
    this._expanded      = true;
    this._expandedBg    = [];
    this._expandedLines = [];

    const scene  = this.scene;
    const cx     = this._cx;
    const CX     = this._CX;
    const FAW_   = this._FAW_;
    const panelH = MONSTER_AREA_TOP + MONSTER_AREA_H;
    const lineH  = 20;
    const maxLines = Math.floor((panelH - BATTLE_LOG_H - 8) / lineH);

    // 패널 배경
    const g = scene.add.graphics().setDepth(500);
    g.fillStyle(0x050e08, 0.97);
    g.fillRoundedRect(CX, 0, FAW_, panelH, { tl: 0, tr: 0, bl: 10, br: 10 });
    g.lineStyle(1, 0x4a7055);
    g.strokeRoundedRect(CX, 0, FAW_, panelH, { tl: 0, tr: 0, bl: 10, br: 10 });
    g.lineStyle(1, 0x2a5a38);
    g.lineBetween(CX, BATTLE_LOG_H, CX + FAW_, BATTLE_LOG_H);
    this._expandedBg.push(g);

    this._expandedBg.push(
      scene.add.text(cx, BATTLE_LOG_H / 2, '▲ BATTLE LOG', TS.log)
        .setOrigin(0.5).setDepth(501).setColor('#44ffaa')
    );

    this._logScrollOffset = Math.max(0, this._logs.length - maxLines);
    this._updateExpandedLines();

    // 마우스 휠 스크롤
    this._logWheelHandler = (_p, _g, _dx, dy) => {
      const maxOff = Math.max(0, this._logs.length - maxLines);
      if (dy > 0) this._logScrollOffset = Math.min(maxOff, this._logScrollOffset + 3);
      else        this._logScrollOffset = Math.max(0, this._logScrollOffset - 3);
      this._updateExpandedLines();
    };
    scene.input.on('wheel', this._logWheelHandler);

    // 터치 드래그 + 바깥 클릭 닫기
    let dragStartY = null, dragStartOffset = 0;
    const onDown = (pointer) => {
      const inPanel = pointer.x >= CX && pointer.x <= CX + FAW_ &&
                      pointer.y >= 0  && pointer.y <= panelH;
      if (!inPanel) { this.hideExpanded(); return; }
      dragStartY = pointer.y;
      dragStartOffset = this._logScrollOffset;
    };
    const onMove = (pointer) => {
      if (dragStartY === null || !pointer.isDown) return;
      const maxOff = Math.max(0, this._logs.length - maxLines);
      this._logScrollOffset = Math.max(0, Math.min(maxOff,
        Math.round(dragStartOffset + (dragStartY - pointer.y) / lineH)));
      this._updateExpandedLines();
    };
    const onUp = () => { dragStartY = null; };

    scene.input.on('pointerdown', onDown);
    scene.input.on('pointermove', onMove);
    scene.input.on('pointerup',   onUp);
    this._logPointerHandlers = { onDown, onMove, onUp };
  }

  _updateExpandedLines() {
    this._expandedLines.forEach(o => o.destroy());
    this._expandedLines = [];

    const scene    = this.scene;
    const cx       = this._cx;
    const panelH   = MONSTER_AREA_TOP + MONSTER_AREA_H;
    const lineH    = 20;
    const maxLines = Math.floor((panelH - BATTLE_LOG_H - 8) / lineH);
    const logs     = this._logs;
    const start    = Math.max(0, Math.min(this._logScrollOffset, Math.max(0, logs.length - maxLines)));
    const slice    = logs.slice(start, start + maxLines);

    slice.forEach((line, i) => {
      const isLast = i === slice.length - 1;
      const alpha  = isLast ? 1.0 : 0.4 + 0.55 * (i / Math.max(1, slice.length - 1));
      this._expandedLines.push(
        scene.add.text(cx, BATTLE_LOG_H + 6 + i * lineH, line, TS.log)
          .setColor(isLast ? '#ffff88' : '#ffcc44')
          .setAlpha(alpha).setOrigin(0.5, 0).setDepth(503)
      );
    });

    if (logs.length > maxLines) {
      const end = Math.min(start + maxLines, logs.length);
      this._expandedLines.push(
        scene.add.text(cx, panelH - 6,
          `${start + 1}-${end} / ${logs.length}`,
          { fontFamily: "'PressStart2P', Arial", fontSize: '7px', color: '#446655' })
          .setOrigin(0.5, 1).setDepth(503)
      );
    }
  }

  hideExpanded() {
    if (!this._expanded) return;
    this._expanded = false;
    [...(this._expandedBg ?? []), ...(this._expandedLines ?? [])].forEach(o => o.destroy());
    this._expandedBg    = null;
    this._expandedLines = null;

    if (this._logWheelHandler) {
      this.scene.input.off('wheel', this._logWheelHandler);
      this._logWheelHandler = null;
    }
    if (this._logPointerHandlers) {
      const { onDown, onMove, onUp } = this._logPointerHandlers;
      this.scene.input.off('pointerdown', onDown);
      this.scene.input.off('pointermove', onMove);
      this.scene.input.off('pointerup',   onUp);
      this._logPointerHandlers = null;
    }
  }

  destroy() {
    this.hideExpanded();
    this._objs.forEach(o => { try { o?.destroy(); } catch (_) {} });
    this._objs = [];
  }
}
