import { PLAYER_PANEL_W, GH, HAND_DATA } from "../constants.js";
import { TS, suitColors } from "../textStyles.js";
import { getRequiredExp } from "../manager/playerManager.js";
import { getLang, getHandName, getHandDesc, getPlayerUI } from "../service/langService.js";
import deckData from "../data/deck.json";
import { TooltipUI } from "./TooltipUI.js";

function getDeckDisplayName(deckId) {
  return deckData.decks.find(d => d.deckId === deckId)?.deckName ?? deckId;
}

const SUIT_SYMS = { S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663' };
const SUIT_KEYS = ['S', 'H', 'D', 'C'];

/** lang.json playerUI 섹션 가져오기 (fallback: ko) */
const getPUI = getPlayerUI;

// 높은 rank → 낮은 rank 순으로 표시
const HAND_RANKS_DESC = [13, 12, 11, 10, 9, 8, 7, 6, 3, 2, 1, 0];
// 발견/해금 전에는 숨겨둘 특수 족보들
const RARE_RANKS = [11, 12, 13];

/** 족보 rank → 표시 이름 */
function getHandNameByRank(rank, lang) {
  const key = HAND_DATA[rank]?.key;
  return getHandName(lang, key) ?? String(rank);
}

/**
 * PlayerUI — 좌측 플레이어 정보 패널 (200px)
 *
 * opts:
 *   round           {number}       라운드 번호
 *   battleLabel     {string|null}  전투 레이블 ("1","2","BOSS" 등, null → 숫자만)
 *   showDeckCounts  {boolean}      DECK/DUMMY/FIELD/HAND 카운트 표시 (기본 false)
 *   depth           {number}       기본 depth (기본 12)
 */
export class PlayerUI {
  constructor(scene, player, opts = {}) {
    this.scene = scene;
    this.player = player;
    this.opts = {
      round: 1, battleLabel: null,
      showDeckCounts: false,
      showHandConfig: false,
      onOptions: null,
      depth: 12,
      ...opts,
    };
    this._objs = [];
    this._tooltip = new TooltipUI(scene);
    // mutable refs
    this.roundTxt = null;
    this.goldTxt = null;
    this._playerLevelTxt = null;
    this._xpBarFill = null;
    this.playerHpTxt = null;
    this._hpBarFill = null;
    this.playerDefTxt = null;
    this.playerAtkTxt = null;
    this._attrTxts = {};
    this._deckCountTxt = null;
    this._dummyCountTxt = null;
    // handConfig 표시용 mutable refs (rank → { multiTxt, aoeDot })
    this._handConfigRows = {};
  }

  _add(obj) { this._objs.push(obj); return obj; }

  create() {
    const { scene, player: p, opts } = this;
    const D = opts.depth;
    const PW = PLAYER_PANEL_W;
    const px = 10;
    const pcx = PW / 2 - 2;
    const R = PW - 10;
    const ROW = 22;

    // ── 패널 배경 ──────────────────────────────────────────────────────────
    if (scene.textures.exists("ui_panel_parchment")) {
      // 배경을 검은색으로 먼저 채움 (이미지 뒤쪽)
      const g = this._add(scene.add.graphics().setDepth(0));
      g.fillStyle(0x000000, 1.0);
      g.fillRect(0, 0, PW - 4, GH);

      this._add(scene.add.image(0, 0, "ui_panel_parchment")
        .setOrigin(0, 0).setDisplaySize(PW, GH).setDepth(1));
    } else if (scene.textures.exists("ui_frame")) {
      this._add(scene.add.nineslice(0, 0, "ui_frame", 0, PW, GH, 8, 8, 8, 8)
        .setOrigin(0, 0).setDepth(0));
    } else {
      const g = this._add(scene.add.graphics().setDepth(0));
      g.fillStyle(0x0a1810, 0.92);
      g.fillRect(0, 0, PW, GH);
      g.lineStyle(1, 0x2a5a38);
      g.strokeRect(0, 0, PW, GH);
    }

    // ── DeckName ────────────────────────────────────────────────────────────────
    this._add(scene.add.text(pcx, 12, getDeckDisplayName(p.deckId).toUpperCase(), TS.gameTitle)
      .setOrigin(0.5, 0).setDepth(D));

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
      scene.add.text(R, ry, `${p.gold}`, TS.goldValue).setOrigin(1, 0).setDepth(D)
    );

    // ── LV + XP 바 ─────────────────────────────────────────────────────────
    ry += ROW;
    this._add(scene.add.text(px, ry, "LV", TS.infoLabel).setDepth(D));
    this._playerLevelTxt = this._add(
      scene.add.text(R, ry, String(p.level), TS.levelValue).setOrigin(1, 0).setDepth(D)
    );

    ry += ROW;
    this._add(scene.add.rectangle(px, ry, PW - 24, 5, 0x1a2a1a).setOrigin(0, 0.5).setDepth(D));
    this._xpBarFill = this._add(
      scene.add.rectangle(px, ry, 1, 5, 0x4d6655).setOrigin(0, 0.5).setDepth(D + 1)
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
    this._add(scene.add.rectangle(px, ry, PW - 24, 7, 0x2a1a1a).setOrigin(0, 0.5).setDepth(D));
    this._hpBarFill = this._add(
      scene.add.rectangle(px, ry, 1, 7, 0xa34d4d).setOrigin(0, 0.5).setDepth(D + 1)
    );

    // ── DEF + ATK (같은 행) ─────────────────────────────────────────────────
    ry += 16;
    this._add(scene.add.text(px, ry, "DEF", TS.infoLabel).setDepth(D));
    this.playerDefTxt = this._add(
      scene.add.text(PW / 2 - 8, ry, "", TS.playerDef).setOrigin(1, 0).setDepth(D)
    );
    this._add(scene.add.text(PW / 2 + 4, ry, "ATK", TS.infoLabel).setDepth(D));
    this.playerAtkTxt = this._add(
      scene.add.text(R, ry, `${p.atk}`, TS.playerAtk).setOrigin(1, 0).setDepth(D)
    );

    // DEF / ATK 툴팁 히트 영역 (rowY를 const로 고정해 클로저 캡처 오류 방지)
    {
      const rowY = ry;
      const hitH = ROW;
      const halfW = PW / 2 - 8;
      const defHit = this._add(
        scene.add.rectangle(px + halfW / 2, rowY + hitH / 2, halfW, hitH, 0xffffff, 0)
          .setDepth(D + 2).setInteractive()
      );
      const getDefTip = () => { const u = getPUI(getLang(scene)); return ['DEF', ...u.def_lines]; };
      const getAtkTip = () => { const u = getPUI(getLang(scene)); return ['ATK', ...u.atk_lines]; };
      defHit.on('pointerover', () => this._showTooltipAt(getDefTip(), TS.color.BRIGHT, rowY));
      defHit.on('pointerout', () => this._hideTooltip());
      defHit.on('pointerdown', () => this._showTooltipAt(getDefTip(), TS.color.BRIGHT, rowY));

      const atkHit = this._add(
        scene.add.rectangle(PW / 2 + 4 + halfW / 2, rowY + hitH / 2, halfW, hitH, 0xffffff, 0)
          .setDepth(D + 2).setInteractive()
      );
      atkHit.on('pointerover', () => this._showTooltipAt(getAtkTip(), TS.color.BRIGHT, rowY));
      atkHit.on('pointerout', () => this._hideTooltip());
      atkHit.on('pointerdown', () => this._showTooltipAt(getAtkTip(), TS.color.BRIGHT, rowY));
    }

    ry += ROW + 6;
    this._add(scene.add.rectangle(pcx, ry, PW - 20, 1, 0x2a5a38).setDepth(D));

    // ── Suit 레벨 (2×2 grid) ────────────────────────────────────────────────
    const SUIT_ROW = 30;
    const SUIT_COLS = [['S', 'H'], ['D', 'C']];
    const colX = [px, PW / 2];
    ry += 12;
    SUIT_COLS.forEach((pair, rowIdx) => {
      const sy = ry + rowIdx * SUIT_ROW;
      pair.forEach((suit, colIdx) => {
        const sx = colX[colIdx];
        this._add(scene.add.text(sx, sy, SUIT_SYMS[suit],
          { fontFamily: 'Arial', fontSize: '18px', color: suitColors[suit] }).setDepth(D));
        this._attrTxts[suit] = this._add(scene.add.text(sx + 24, sy + 2,
          `Lv${p.attrs[suit]}`,
          { fontFamily: TS.defaultFont, fontSize: '11px', color: suitColors[suit] })
          .setDepth(D));

        const hitW = PW / 2 - 8;
        const hitX = sx + hitW / 2;
        const rowHit = this._add(
          scene.add.rectangle(hitX, sy + 10, hitW, 26, 0xffffff, 0)
            .setDepth(D + 2).setInteractive()
        );
        rowHit.on('pointerover', () => this._showTooltip(suit, sy, getLang(scene)));
        rowHit.on('pointerout', () => this._hideTooltip());
        rowHit.on('pointerdown', () => this._showTooltip(suit, sy, getLang(scene)));
      });
    });

    // ── DECK / DUMMY (선택) ──────────────────────────────────────────────────
    if (opts.showDeckCounts) {
      ry += 2 * SUIT_ROW + 8;
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
    }

    // ── 족보 배수 / AoE 목록 (선택) ─────────────────────────────────────────
    if (opts.showHandConfig) {
      const lineH = 18;
      const multiX = PW - 32;  // ×N 오른쪽 정렬
      const aoeX = R;        // ● 오른쪽 정렬

      // 섹션 높이 계산 후 추적
      if (opts.showDeckCounts) ry += ROW + 6;
      else ry += 2 * SUIT_ROW + 8;
      this._add(scene.add.rectangle(pcx, ry, PW - 20, 1, 0x2a5a38).setDepth(D));
      ry += 8;
      this._add(scene.add.text(px, ry, "HANDS", TS.infoLabel).setDepth(D));
      ry += lineH + 2;
      this._handsStartY = ry;

      const lang = getLang(scene);
      const enabledHands = p.getEnabledHands?.() ?? new Set(HAND_RANKS_DESC);
      const effHandCfg = p.getEffectiveHandConfig?.() ?? p.handConfig;

      HAND_RANKS_DESC.filter(rank => enabledHands.has(rank)).forEach(rank => {
        const rowY = ry;
        const cfg = effHandCfg?.[rank] ?? { multi: 1, aoe: false };
        const isAoe = cfg.aoe;
        const handKey = HAND_DATA[rank]?.key;
        const desc = getHandDesc(lang, handKey);

        const glowBg = this._add(
          scene.add.rectangle(pcx, rowY + lineH / 2, PW - 16, lineH, 0xffdd44)
            .setAlpha(0).setDepth(D - 1)
        );

        const labelTxt = this._add(scene.add.text(px, rowY, getHandNameByRank(rank, lang),
          TS.handRank).setDepth(D));

        const multiTxt = this._add(
          scene.add.text(multiX, rowY, `x${cfg.multi}`, TS.handMulti)
            .setOrigin(1, 0).setDepth(D)
        );

        const aoeDot = this._add(
          scene.add.text(aoeX, rowY, isAoe ? '\u25cf' : '',
            { fontFamily: 'Arial', fontSize: '10px', color: TS.infoValue.color })
            .setOrigin(1, 0).setDepth(D)
        );

        const rowHit = this._add(
          scene.add.rectangle(pcx, rowY + lineH / 2, PW - 16, lineH, 0xffffff, 0)
            .setDepth(D + 2).setInteractive()
        );

        const tooltipHead = getHandNameByRank(rank, lang) + (isAoe ? " (광역)" : "");

        rowHit.on('pointerover', () => this._showTooltipAt([tooltipHead, desc], TS.color.BRIGHT, rowHit.y - lineH / 2, 285));
        rowHit.on('pointerout', () => this._hideTooltip());
        rowHit.on('pointerdown', () => this._showTooltipAt([tooltipHead, desc], TS.color.BRIGHT, rowHit.y - lineH / 2, 285));

        this._handConfigRows[rank] = { labelTxt, multiTxt, aoeDot, glowBg, rowHit, lineH };
        ry += lineH;
      });
      this._repositionHandRows(null);
    }

    // ── OPTIONS 버튼 ────────────────────────────────────────────────────────
    if (opts.onOptions) {
      const optY = GH - 108;
      const optBg = this._add(
        scene.add.image(pcx, optY, "ui_btn")
          .setDisplaySize(140, 52).setDepth(D + 2).setInteractive()
      );
      this._add(scene.add.text(pcx, optY, "OPTIONS", TS.sortBtn).setOrigin(0.5).setDepth(D + 3));
      optBg.on("pointerdown", () => opts.onOptions());
      optBg.on("pointerover", () => optBg.setTint(0xdddddd));
      optBg.on("pointerout", () => optBg.clearTint());
    }

    this.refresh();
    return this;
  }

  // ── 툴팁 (내부) ──────────────────────────────────────────────────────────
  _showTooltip(suit, rowY, lang = 'ko') {
    const p = this.player;
    const perCard = Math.floor((p.attrs[suit] ?? 1) * (p.adaptability?.[suit] ?? 1));
    const sym = { S: '♠', H: '♥', D: '♦', C: '♣' }[suit];
    const u = getPUI(lang);
    const [title, effect] = u[`suit_${suit}`];
    const cardLine = (u.suit_cards ?? '{n} × {sym}장')
      .replace('{n}', perCard).replace('{sym}', sym);
    this._showTooltipAt([title, effect + " " + cardLine], suitColors[suit], rowY);
  }

  _showTooltipAt(lines, color, rowY) {
    this._tooltip.update({
      titleMsg: lines[0],
      contentMsg: lines.slice(1).join('\n'),
      titleMsgColor: color,
      left: PLAYER_PANEL_W + 12,
      centerY: rowY,
      depth: 300
    });
  }

  _hideTooltip() {
    this._tooltip.hide();
  }

  // ── 갱신 ─────────────────────────────────────────────────────────────────
  refresh() {
    const p = this.player;
    const PW = PLAYER_PANEL_W;
    const barW = PW - 24;

    this.goldTxt?.setText(`${p.gold}`);
    this.playerHpTxt?.setText(`${p.hp}/${p.maxHp}`);
    this.playerDefTxt?.setText(`${p.def}`);
    this.playerAtkTxt?.setText(`${p.atk}`);

    const ratio = Math.max(0, p.hp / p.maxHp);
    this._hpBarFill?.setDisplaySize(Math.max(1, barW * ratio), 7);
    this._hpBarFill?.setFillStyle(ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xddaa00 : 0xdd3333);

    this.refreshLevel();
    if (this.opts.showHandConfig) {
      this.refreshHandConfig();
    }
    return this;
  }

  refreshLevel() {
    const p = this.player;
    const req = getRequiredExp(p.level);
    const xpFill = Math.max(1, Math.round((PLAYER_PANEL_W - 24) * Math.min(1, p.xp / req)));
    this._playerLevelTxt?.setText(String(p.level));
    this._xpBarFill?.setDisplaySize(xpFill, 5);
    SUIT_KEYS.forEach(s => this._attrTxts[s]?.setText(`Lv${p.attrs[s]}`));
    return this;
  }

  /** 족보 배수 / AoE 갱신 — 아이템 사용 후 호출 */
  refreshHandConfig() {
    const handConfig = this.player.getEffectiveHandConfig?.() ?? this.player.handConfig;
    HAND_RANKS_DESC.forEach(rank => {
      const row = this._handConfigRows[rank];
      if (!row) return;
      const cfg = handConfig?.[rank] ?? { multi: 1, aoe: false };
      const isAoe = cfg.aoe;

      row.multiTxt.setText(`x${cfg.multi}`);
      //row.multiTxt.setColor(isAoe ? '#ffdd44' : '#888888');
      row.aoeDot.setText(isAoe ? '\u25cf' : '');
    });
    return this;
  }

  /** 족보 일치 행 반짝 효과. rank=null 이면 전체 해제 */
  highlightHand(rank) {
    this._repositionHandRows(rank);

    HAND_RANKS_DESC.forEach(r => {
      const row = this._handConfigRows[r];
      if (!row?.glowBg) return;
      this.scene.tweens.killTweensOf(row.glowBg);
      row.glowBg.setAlpha(0);
    });
    if (rank == null) return;
    const row = this._handConfigRows[rank];
    if (!row?.glowBg) return;
    this.scene.tweens.add({
      targets: row.glowBg,
      alpha: { from: 0.12, to: 0.52 },
      duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  /** 족보 목록 재배치 (희귀 족보 노출/숨김) */
  _repositionHandRows(currentRank) {
    if (!this.opts.showHandConfig) return;
    const p = this.player;
    let currentY = this._handsStartY;

    HAND_RANKS_DESC.forEach(rank => {
      const row = this._handConfigRows[rank];
      if (!row) return;

      const usage = p.handUseCounts?.[rank] ?? 0;
      const isRare = RARE_RANKS.includes(rank);
      // 노출 조건: 희귀 족보가 아니거나, 한 번이라도 썼거나, 현재 선택된 족보이거나
      const visible = !isRare || usage > 0 || rank === currentRank;

      if (visible) {
        const y = currentY;
        row.labelTxt.setY(y).setVisible(true);
        row.multiTxt.setY(y).setVisible(true);
        row.aoeDot.setY(y).setVisible(true);
        row.glowBg.setY(y + row.lineH / 2).setVisible(true);
        row.rowHit.setY(y + row.lineH / 2).setVisible(true);
        currentY += row.lineH;
      } else {
        row.labelTxt.setVisible(false);
        row.multiTxt.setVisible(false);
        row.aoeDot.setVisible(false);
        row.glowBg.setVisible(false);
        row.rowHit.setVisible(false);
      }
    });
  }

  /** ATK 텍스트 한 번 pulse (공격 애니메이션용) */
  pulseAtk() {
    if (!this.playerAtkTxt) return;
    const txt = this.playerAtkTxt;
    this.scene.tweens.killTweensOf(txt);
    this.scene.tweens.add({
      targets: txt,
      scaleX: { from: 1, to: 1.8 },
      scaleY: { from: 1, to: 1.8 },
      duration: 200, yoyo: true, ease: 'Back.easeOut',
    });
  }

  /** 특정 족보 행 한 번 pulse (공격 애니메이션용) */
  pulseHandRow(rank) {
    const row = this._handConfigRows[rank];
    if (!row) return;
    if (row.glowBg) {
      this.scene.tweens.killTweensOf(row.glowBg);
      this.scene.tweens.add({
        targets: row.glowBg,
        alpha: { from: 0, to: 0.65 },
        duration: 220, yoyo: true, ease: 'Sine.easeOut',
      });
    }
    const textTargets = [row.multiTxt, row.aoeDot].filter(Boolean);
    if (textTargets.length > 0) {
      this.scene.tweens.killTweensOf(textTargets);
      this.scene.tweens.add({
        targets: textTargets,
        scaleX: { from: 1, to: 1.5 },
        scaleY: { from: 1, to: 1.5 },
        duration: 220, yoyo: true, ease: 'Back.easeOut',
      });
    }
  }

  /** DECK/DUMMY 카운트 갱신 (showDeckCounts=true 시) */
  setDeckCounts({ deck = 0, dummy = 0 } = {}) {
    this._deckCountTxt?.setText(`${deck}`);
    this._dummyCountTxt?.setText(`${dummy}`);
    return this;
  }

  destroy() {
    this._hideTooltip();
    this._objs.forEach(o => { try { o?.destroy(); } catch (_) { } });
    this._objs = [];
  }
}
