import { PLAYER_PANEL_W, GH } from "../constants.js";
import { TS } from "../textStyles.js";
import { getRequiredExp } from "../manager/playerManager.js";

const SUIT_COLORS = { S: '#aaaaff', H: '#ff6666', D: '#ff9966', C: '#aaffaa' };
const SUIT_SYMS   = { S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663' };
const SUIT_DESCS  = {
  S: ['♠ Spade', '적 DEF 감소', 'Lv × 적응 × ♠장'],
  H: ['♥ Hearts', '내 HP 회복',  'Lv × 적응 × ♥장'],
  D: ['♦ Diamonds', '내 DEF 증가', 'Lv × 적응 × ♦장'],
  C: ['♣ Clubs',  '적 ATK 감소', 'Lv × 적응 × ♣장'],
};
const SUIT_KEYS = ['S', 'H', 'D', 'C'];

/**
 * PlayerUI — 좌측 플레이어 정보 패널 (200px)
 *
 * opts:
 *   round           {number}       라운드 번호
 *   battleLabel     {string|null}  전투 레이블 ("1","2","BOSS" 등, null → 숫자만)
 *   showAtk         {boolean}      ATK 행 표시 (기본 false)
 *   showDeckCounts  {boolean}      DECK/DUMMY/FIELD/HAND 카운트 표시 (기본 false)
 *   showTooltips    {boolean}      슈트 hover 툴팁 표시 (기본 false)
 *   depth           {number}       기본 depth (기본 12)
 */
export class PlayerUI {
  constructor(scene, player, opts = {}) {
    this.scene  = scene;
    this.player = player;
    this.opts   = {
      round: 1, battleLabel: null,
      showAtk: false, showDeckCounts: false, showTooltips: false,
      depth: 12,
      ...opts,
    };
    this._objs        = [];
    this._tooltipObjs = [];
    // mutable refs
    this.roundTxt        = null;
    this.goldTxt         = null;
    this._playerLevelTxt = null;
    this._xpBarFill      = null;
    this.playerHpTxt     = null;
    this._hpBarFill      = null;
    this.playerDefTxt    = null;
    this.playerAtkTxt    = null;
    this._attrTxts       = {};
    this._deckCountTxt   = null;
    this._dummyCountTxt  = null;
    this._fieldCountTxt  = null;
    this._handCountTxt   = null;
  }

  _add(obj) { this._objs.push(obj); return obj; }

  create() {
    const { scene, player: p, opts } = this;
    const D   = opts.depth;
    const PW  = PLAYER_PANEL_W;
    const px  = 10;
    const pcx = PW / 2 - 2;
    const R   = PW - 10;
    const ROW = 22;

    // ── 패널 배경 ──────────────────────────────────────────────────────────
    const g = this._add(scene.add.graphics().setDepth(0));
    g.fillStyle(0x0a1810, 0.92);
    g.fillRect(0, 0, PW - 4, GH);
    g.lineStyle(1, 0x2a5a38);
    g.strokeRect(0, 0, PW - 4, GH);

    // ── JOB ────────────────────────────────────────────────────────────────
    this._add(scene.add.text(pcx, 12, p.job.toUpperCase(), {
      fontFamily: "'PressStart2P', Arial", fontSize: '9px', color: '#ffdd88',
    }).setOrigin(0.5, 0).setDepth(D));

    let ry = 36;

    // ── ROUND ──────────────────────────────────────────────────────────────
    const roundLabel = opts.battleLabel != null
      ? `${opts.round}-${opts.battleLabel}`
      : `${opts.round}`;
    this._add(scene.add.text(px, ry, "ROUND", TS.infoLabel).setDepth(D));
    this.roundTxt = this._add(
      scene.add.text(R, ry, roundLabel, TS.levelValue).setOrigin(1, 0).setDepth(D)
    );

    // ── GOLD ───────────────────────────────────────────────────────────────
    ry += ROW;
    this._add(scene.add.text(px, ry, "GOLD", TS.infoLabel).setDepth(D));
    this.goldTxt = this._add(
      scene.add.text(R, ry, `${p.gold}`, TS.levelValue).setOrigin(1, 0).setDepth(D)
    );

    // ── LV + XP 바 ─────────────────────────────────────────────────────────
    ry += ROW;
    this._add(scene.add.text(px, ry, "LV", TS.infoLabel).setDepth(D));
    this._playerLevelTxt = this._add(
      scene.add.text(R, ry, String(p.level), TS.levelValue).setOrigin(1, 0).setDepth(D)
    );

    ry += ROW;
    this._add(scene.add.rectangle(px, ry, PW - 24, 5, 0x224433).setOrigin(0, 0.5).setDepth(D));
    this._xpBarFill = this._add(
      scene.add.rectangle(px, ry, 1, 5, 0x44ddaa).setOrigin(0, 0.5).setDepth(D + 1)
    );

    ry += 14;
    this._add(scene.add.rectangle(pcx, ry, PW - 20, 1, 0x2a5a38).setDepth(D));

    // ── HP + HP 바 ─────────────────────────────────────────────────────────
    ry += 14;
    this._add(scene.add.text(px, ry, "HP", TS.infoLabel).setDepth(D));
    this.playerHpTxt = this._add(
      scene.add.text(R, ry, "", TS.playerHp).setOrigin(1, 0).setDepth(D)
    );

    ry += ROW;
    this._add(scene.add.rectangle(px, ry, PW - 24, 7, 0x2a3a2a).setOrigin(0, 0.5).setDepth(D));
    this._hpBarFill = this._add(
      scene.add.rectangle(px, ry, 1, 7, 0xdd3333).setOrigin(0, 0.5).setDepth(D + 1)
    );

    // ── DEF ────────────────────────────────────────────────────────────────
    ry += 16;
    this._add(scene.add.text(px, ry, "DEF", TS.infoLabel).setDepth(D));
    this.playerDefTxt = this._add(
      scene.add.text(R, ry, "", TS.playerDef).setOrigin(1, 0).setDepth(D)
    );

    // ── ATK (선택) ──────────────────────────────────────────────────────────
    if (opts.showAtk) {
      ry += ROW;
      this._add(scene.add.text(px, ry, "ATK", TS.infoLabel).setDepth(D));
      this.playerAtkTxt = this._add(
        scene.add.text(R, ry, `${p.atk}`, TS.playerDef).setOrigin(1, 0).setDepth(D)
      );
    }

    ry += ROW + 6;
    this._add(scene.add.rectangle(pcx, ry, PW - 20, 1, 0x2a5a38).setDepth(D));

    // ── Suit 레벨 ───────────────────────────────────────────────────────────
    const SUIT_ROW = 30;
    ry += 12;
    SUIT_KEYS.forEach((suit, idx) => {
      const sy = ry + idx * SUIT_ROW;
      this._add(scene.add.text(px, sy, SUIT_SYMS[suit],
        { fontFamily: 'Arial', fontSize: '18px', color: SUIT_COLORS[suit] }).setDepth(D));
      this._attrTxts[suit] = this._add(scene.add.text(px + 26, sy + 2,
        `Lv${p.attrs[suit]}`,
        { fontFamily: "'PressStart2P', Arial", fontSize: '11px', color: SUIT_COLORS[suit] })
        .setDepth(D));

      if (opts.showTooltips) {
        const rowHit = this._add(
          scene.add.rectangle(pcx, sy + 10, PW - 16, 26, 0xffffff, 0)
            .setDepth(D + 2).setInteractive()
        );
        rowHit.on('pointerover', () => this._showTooltip(suit, sy));
        rowHit.on('pointerout',  () => this._hideTooltip());
        rowHit.on('pointerdown', () => this._showTooltip(suit, sy));
      }
    });

    // ── DECK / DUMMY / FIELD / HAND (선택) ──────────────────────────────────
    if (opts.showDeckCounts) {
      ry += SUIT_KEYS.length * SUIT_ROW + 8;
      this._add(scene.add.rectangle(pcx, ry, PW - 20, 1, 0x2a5a38).setDepth(D));
      ry += 12;

      this._add(scene.add.text(px, ry, "DECK", TS.infoLabel).setDepth(D));
      this._deckCountTxt = this._add(
        scene.add.text(R, ry, "0", TS.levelValue).setOrigin(1, 0).setDepth(D)
      );

      ry += ROW;
      this._add(scene.add.text(px, ry, "DUMMY", TS.infoLabel).setDepth(D));
      this._dummyCountTxt = this._add(
        scene.add.text(R, ry, "0", TS.levelValue).setOrigin(1, 0).setDepth(D)
      );

      ry += ROW;
      this._add(scene.add.text(px, ry, "FIELD", TS.infoLabel).setDepth(D));
      this._fieldCountTxt = this._add(
        scene.add.text(R, ry, "0/0", TS.levelValue).setOrigin(1, 0).setDepth(D)
      );

      ry += ROW;
      this._add(scene.add.text(px, ry, "HAND", TS.infoLabel).setDepth(D));
      this._handCountTxt = this._add(
        scene.add.text(R, ry, "0/0", TS.levelValue).setOrigin(1, 0).setDepth(D)
      );
    }

    this.refresh();
    return this;
  }

  // ── 슈트 툴팁 (내부) ──────────────────────────────────────────────────────
  _showTooltip(suit, rowY) {
    this._hideTooltip();
    const { scene } = this;
    const PW     = PLAYER_PANEL_W;
    const color  = SUIT_COLORS[suit];
    const lines  = SUIT_DESCS[suit];
    const tx     = PW + 12;
    const ty     = Math.min(rowY, GH - 80);
    const tw     = 160, lineH = 16, pad = 10;
    const th     = pad * 2 + lines.length * lineH;
    const colorN = parseInt(color.replace('#', ''), 16);

    const g = scene.add.graphics().setDepth(300);
    g.fillStyle(0x0a1e12, 0.95);
    g.fillRoundedRect(tx, ty, tw, th, 6);
    g.lineStyle(1, colorN);
    g.strokeRoundedRect(tx, ty, tw, th, 6);
    this._tooltipObjs.push(g);

    lines.forEach((line, i) => {
      const style = i === 0
        ? { fontFamily: "'PressStart2P', Arial", fontSize: '8px', color }
        : { fontFamily: 'Arial', fontSize: '11px', color: '#aaccbb' };
      this._tooltipObjs.push(
        scene.add.text(tx + pad, ty + pad + i * lineH, line, style)
          .setOrigin(0, 0).setDepth(301)
      );
    });
  }

  _hideTooltip() {
    this._tooltipObjs.forEach(o => o.destroy());
    this._tooltipObjs = [];
  }

  // ── 갱신 ─────────────────────────────────────────────────────────────────
  refresh() {
    const p    = this.player;
    const PW   = PLAYER_PANEL_W;
    const barW = PW - 24;

    this.goldTxt?.setText(`${p.gold}`);
    this.playerHpTxt?.setText(`${p.hp}/${p.maxHp}`);
    this.playerDefTxt?.setText(`${p.def}`);
    this.playerAtkTxt?.setText(`${p.atk}`);

    const ratio = Math.max(0, p.hp / p.maxHp);
    this._hpBarFill?.setDisplaySize(Math.max(1, barW * ratio), 7);
    this._hpBarFill?.setFillStyle(ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xddaa00 : 0xdd3333);

    this.refreshLevel();
    return this;
  }

  refreshLevel() {
    const p      = this.player;
    const req    = getRequiredExp(p.level);
    const xpFill = Math.max(1, Math.round((PLAYER_PANEL_W - 24) * Math.min(1, p.xp / req)));
    this._playerLevelTxt?.setText(String(p.level));
    this._xpBarFill?.setDisplaySize(xpFill, 5);
    SUIT_KEYS.forEach(s => this._attrTxts[s]?.setText(`Lv${p.attrs[s]}`));
    return this;
  }

  /** DECK/DUMMY/FIELD/HAND 카운트 갱신 (showDeckCounts=true 시) */
  setDeckCounts({ deck = 0, dummy = 0, field = '0/0', hand = '0/0' } = {}) {
    this._deckCountTxt?.setText(`${deck}`);
    this._dummyCountTxt?.setText(`${dummy}`);
    this._fieldCountTxt?.setText(field);
    this._handCountTxt?.setText(hand);
    return this;
  }

  destroy() {
    this._hideTooltip();
    this._objs.forEach(o => { try { o?.destroy(); } catch (_) {} });
    this._objs = [];
  }
}
