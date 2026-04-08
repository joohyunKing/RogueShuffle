import { PLAYER_PANEL_W, GH, HAND_DATA } from "../constants.js";
import { TS } from "../textStyles.js";
import { getRequiredExp } from "../manager/playerManager.js";
import langData from "../data/lang.json";

const SUIT_COLORS = { S: '#aaaaff', H: '#ff6666', D: '#ff9966', C: '#aaffaa' };
const SUIT_SYMS   = { S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663' };
const SUIT_DESCS  = {
  S: ['♠ Spade', '적 DEF 감소', 'Lv × ♠장'],
  H: ['♥ Hearts', '내 HP 회복',  'Lv × ♥장'],
  D: ['♦ Diamonds', '내 DEF 증가', 'Lv × ♦장'],
  C: ['♣ Clubs',  '적 ATK 감소', 'Lv × ♣장'],
};
const SUIT_KEYS = ['S', 'H', 'D', 'C'];

const DEF_TOOLTIP = ['DEF', '받는 피해를 감소시킵니다', '라운드 종료 시 0으로 초기화']; //, '실제 피해 = max(0, 피해 - DEF)'
const ATK_TOOLTIP = ['ATK', '카드 점수에 합산됩니다', '레벨업 시 +1 증가'];             //, '공격력 = 카드 점수 + ATK'

// 높은 rank → 낮은 rank 순으로 표시
const HAND_RANKS_DESC = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

/** lang.json에서 족보 표시 이름 가져오기 */
function getHandName(rank, lang) {
  const key = HAND_DATA[rank]?.key;
  return langData[lang]?.hand?.[key]?.name ?? key ?? String(rank);
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
    this.scene  = scene;
    this.player = player;
    this.opts   = {
      round: 1, battleLabel: null,
      showDeckCounts: false,
      showHandConfig: false,
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
    // handConfig 표시용 mutable refs (rank → { multiTxt, aoeDot })
    this._handConfigRows = {};
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

    // ── DEF + ATK (같은 행) ─────────────────────────────────────────────────
    ry += 16;
    this._add(scene.add.text(px, ry, "DEF", TS.infoLabel).setDepth(D));
    this.playerDefTxt = this._add(
      scene.add.text(PW / 2 - 8, ry, "", TS.playerDef).setOrigin(1, 0).setDepth(D)
    );
    this._add(scene.add.text(PW / 2 + 4, ry, "ATK", TS.infoLabel).setDepth(D));
    this.playerAtkTxt = this._add(
      scene.add.text(R, ry, `${p.atk}`, TS.playerDef).setOrigin(1, 0).setDepth(D)
    );

    // DEF / ATK 툴팁 히트 영역 (rowY를 const로 고정해 클로저 캡처 오류 방지)
    {
      const rowY   = ry;
      const hitH   = ROW;
      const halfW  = PW / 2 - 8;
      const defHit = this._add(
        scene.add.rectangle(px + halfW / 2, rowY + hitH / 2, halfW, hitH, 0xffffff, 0)
          .setDepth(D + 2).setInteractive()
      );
      defHit.on('pointerover', () => this._showTooltipAt(DEF_TOOLTIP, '#aaaadd', rowY));
      defHit.on('pointerout',  () => this._hideTooltip());
      defHit.on('pointerdown', () => this._showTooltipAt(DEF_TOOLTIP, '#aaaadd', rowY));

      const atkHit = this._add(
        scene.add.rectangle(PW / 2 + 4 + halfW / 2, rowY + hitH / 2, halfW, hitH, 0xffffff, 0)
          .setDepth(D + 2).setInteractive()
      );
      atkHit.on('pointerover', () => this._showTooltipAt(ATK_TOOLTIP, '#ffdd44', rowY));
      atkHit.on('pointerout',  () => this._hideTooltip());
      atkHit.on('pointerdown', () => this._showTooltipAt(ATK_TOOLTIP, '#ffdd44', rowY));
    }

    ry += ROW + 6;
    this._add(scene.add.rectangle(pcx, ry, PW - 20, 1, 0x2a5a38).setDepth(D));

    // ── Suit 레벨 (2×2 grid) ────────────────────────────────────────────────
    const SUIT_ROW  = 30;
    const SUIT_COLS = [['S', 'H'], ['D', 'C']];
    const colX      = [px, PW / 2];
    ry += 12;
    SUIT_COLS.forEach((pair, rowIdx) => {
      const sy = ry + rowIdx * SUIT_ROW;
      pair.forEach((suit, colIdx) => {
        const sx = colX[colIdx];
        this._add(scene.add.text(sx, sy, SUIT_SYMS[suit],
          { fontFamily: 'Arial', fontSize: '18px', color: SUIT_COLORS[suit] }).setDepth(D));
        this._attrTxts[suit] = this._add(scene.add.text(sx + 24, sy + 2,
          `Lv${p.attrs[suit]}`,
          { fontFamily: "'PressStart2P', Arial", fontSize: '11px', color: SUIT_COLORS[suit] })
          .setDepth(D));

        const hitW = PW / 2 - 8;
        const hitX = sx + hitW / 2;
        const rowHit = this._add(
          scene.add.rectangle(hitX, sy + 10, hitW, 26, 0xffffff, 0)
            .setDepth(D + 2).setInteractive()
        );
        rowHit.on('pointerover', () => this._showTooltip(suit, sy));
        rowHit.on('pointerout',  () => this._hideTooltip());
        rowHit.on('pointerdown', () => this._showTooltip(suit, sy));
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
      const lineH  = 14;
      const multiX = PW - 32;  // ×N 오른쪽 정렬
      const aoeX   = R;        // ● 오른쪽 정렬

      // 섹션 높이 계산 후 추적
      if (opts.showDeckCounts) ry += ROW + 6;
      else                      ry += 2 * SUIT_ROW + 8;
      this._add(scene.add.rectangle(pcx, ry, PW - 20, 1, 0x2a5a38).setDepth(D));
      ry += 8;
      this._add(scene.add.text(px, ry, "HANDS", TS.infoLabel).setDepth(D));
      ry += lineH + 2;

      const lang         = scene.registry?.get('lang') ?? 'ko';
      const enabledHands = p.getEnabledHands?.() ?? new Set(HAND_RANKS_DESC);
      const effHandCfg   = p.getEffectiveHandConfig?.() ?? p.handConfig;
      HAND_RANKS_DESC.filter(rank => enabledHands.has(rank)).forEach(rank => {
        const rowY   = ry;  // 클로저용 고정값
        const cfg    = effHandCfg?.[rank] ?? { multi: 1, aoe: false };
        const isAoe  = cfg.aoe;
        const nameColor    = '#aaccaa'; //Aoe 아니어도 훌륭한 hand isAoe ? '#aaccaa' : '#666666';
        const tooltipColor = '#aaccaa'; //Aoe 아니어도 훌륭한 hand isAoe ? '#aaccaa' : '#888888';
        const handKey      = HAND_DATA[rank]?.key;
        const desc         = langData[lang]?.hand?.[handKey]?.desc ?? '';

        // 반짝 효과용 glow 배경 (fillAlpha=1, 오브젝트 alpha=0으로 초기 숨김)
        const glowBg = this._add(
          scene.add.rectangle(pcx, rowY + lineH / 2, PW - 16, lineH, 0xffdd44)
            .setAlpha(0).setDepth(D - 1)
        );

        this._add(scene.add.text(px, rowY, getHandName(rank, lang),
          { ...TS.handRank, color: nameColor }).setDepth(D));

        const multiTxt = this._add(
          scene.add.text(multiX, rowY, `x${cfg.multi}`, TS.handMulti)
            .setOrigin(1, 0).setDepth(D)
        );

        const aoeDot = this._add(
          scene.add.text(aoeX, rowY, isAoe ? '\u25cf' : '',
            { fontFamily: 'Arial', fontSize: '10px', color: '#44ffaa' })
            .setOrigin(1, 0).setDepth(D)
        );

        // 행 전체 툴팁 hit area
        const rowHit = this._add(
          scene.add.rectangle(pcx, rowY + lineH / 2, PW - 16, lineH, 0xffffff, 0)
            .setDepth(D + 2).setInteractive()
        );
        rowHit.on('pointerover', () => this._showTooltipAt([getHandName(rank, lang), desc], tooltipColor, rowY, 285));
        rowHit.on('pointerout',  () => this._hideTooltip());
        rowHit.on('pointerdown', () => this._showTooltipAt([getHandName(rank, lang), desc], tooltipColor, rowY, 285));

        this._handConfigRows[rank] = { multiTxt, aoeDot, glowBg };
        ry += lineH;
      });
    }

    this.refresh();
    return this;
  }

  // ── 툴팁 (내부) ──────────────────────────────────────────────────────────
  _showTooltip(suit, rowY) {
    this._showTooltipAt(SUIT_DESCS[suit], SUIT_COLORS[suit], rowY);
  }

  _showTooltipAt(lines, color, rowY, tooltipW = 210) {
    this._hideTooltip();
    const { scene } = this;
    const PW     = PLAYER_PANEL_W;
    const tx     = PW + 12;
    const ty     = Math.min(rowY, GH - 100);
    const tw     = tooltipW, lineH = 20, pad = 12;
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
        ? { fontFamily: "'PressStart2P', Arial", fontSize: '13px', color }
        : { fontFamily: 'Arial', fontSize: '16px', color: '#aaccbb' };
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
    if (this.opts.showHandConfig) {
      this.refreshHandConfig();
    }
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

  /** 족보 배수 / AoE 갱신 — 아이템 사용 후 호출 */
  refreshHandConfig() {
    const handConfig = this.player.getEffectiveHandConfig?.() ?? this.player.handConfig;
    HAND_RANKS_DESC.forEach(rank => {
      const row = this._handConfigRows[rank];
      if (!row) return;
      const cfg   = handConfig?.[rank] ?? { multi: 1, aoe: false };
      const isAoe = cfg.aoe;
      row.multiTxt.setText(`x${cfg.multi}`);
      row.multiTxt.setColor(isAoe ? '#ffdd44' : '#888888');
      row.aoeDot.setText(isAoe ? '\u25cf' : '');
    });
    return this;
  }

  /** 족보 일치 행 반짝 효과. rank=null 이면 전체 해제 */
  highlightHand(rank) {
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
    this._objs.forEach(o => { try { o?.destroy(); } catch (_) {} });
    this._objs = [];
  }
}
