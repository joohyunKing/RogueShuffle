/**
 * TooltipUI — 범용 툴팁 컴포넌트
 *
 * @param {Phaser.Scene} scene
 * @param {object} opts
 * @param {string}   opts.titleMsg           제목 텍스트
 * @param {string}   [opts.contentMsg]       본문 텍스트
 * @param {string}   [opts.titleMsgColor]    제목 색상 + 테두리 색 (기본 '#ffffff')
 * @param {number}   [opts.tooltipW=210]     툴팁 너비
 * @param {number}   opts.left               툴팁 좌측 X
 * @param {number}   [opts.top]              툴팁 상단 Y (centerY와 택일)
 * @param {number}   [opts.centerY]          지정 시 툴팁을 수직 중앙 정렬, clampMin/Max로 보정
 * @param {number}   [opts.clampMin=4]       centerY 사용 시 최소 top
 * @param {number}   [opts.clampMax]         centerY 사용 시 최대 bottom (기본 720-10)
 * @param {Function} [opts.onUse]            액션 버튼 클릭 시 실행 (버튼 활성)
 * @param {string}   [opts.btnLabel='사 용'] 액션 버튼 텍스트
 * @param {boolean}  [opts.btnDisabled]      버튼 비활성 표시 (onUse 없이 버튼만 렌더)
 * @param {string}   [opts.btnDisabledMsg]   비활성 버튼 클릭 시 일시 표시 메시지
 * @param {boolean}  [opts.sold]             SOLD 텍스트 표시 (구매 완료)
 * @param {number}   [opts.depth=300]        렌더 depth
 */
export class TooltipUI {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.opts = opts;
    this._objs = [];
  }

  // ── 높이 계산 (show 전 사전 계산용) ────────────────────────────────────────
  _calcHeight() {
    const {
      contentMsg,
      tooltipW = 210,
      onUse,
      btnDisabled,
      sold,
    } = this.opts;

    const PAD = 12;
    const TITLE_H = 28;
    const LINE_H = 18;
    const BTN_H = 34;
    const BTN_GAP = 10;
    const innerW = tooltipW - PAD * 2;
    const charsPerLine = Math.max(1, Math.floor(innerW / 7));
    const contentLines = contentMsg
      ? Math.max(1, Math.ceil(contentMsg.length / charsPerLine))
      : 0;
    const contentH = contentLines * LINE_H;
    const hasBtn = !!(onUse || btnDisabled || sold);
    const btnBlock = hasBtn ? BTN_GAP + BTN_H : 0;

    return PAD * 2 + TITLE_H + (contentH > 0 ? PAD / 2 + contentH : 0) + btnBlock;
  }

  // ── 렌더 ────────────────────────────────────────────────────────────────
  show() {
    this.hide();

    const {
      titleMsg,
      contentMsg,
      titleMsgColor = '#ffffff',
      tooltipW = 210,
      left,
      top,
      centerY,
      clampMin = 4,
      clampMax,
      onUse,
      btnLabel = '사 용',
      btnDisabled = false,
      btnDisabledMsg,
      sold = false,
      depth = 300,
    } = this.opts;

    const scene = this.scene;
    const PAD = 12;
    const TITLE_H = 28;
    const LINE_H = 18;
    const BTN_H = 34;
    const BTN_GAP = 10;
    const colorN = parseInt(titleMsgColor.replace('#', ''), 16);
    const tooltipH = this._calcHeight();
    const maxBottom = clampMax ?? (scene.scale?.height ?? 720) - 10;

    // top 결정
    let ty = top ?? 0;
    if (centerY !== undefined) {
      ty = Math.max(clampMin, Math.min(centerY - tooltipH / 2, maxBottom - tooltipH));
    }

    // ── 배경 ──────────────────────────────────────────────────────────────
    const bg = scene.add.graphics().setDepth(depth);
    bg.fillStyle(0x0a1e12, 0.97);
    bg.fillRoundedRect(left, ty, tooltipW, tooltipH, 6);
    bg.lineStyle(1, colorN);
    bg.strokeRoundedRect(left, ty, tooltipW, tooltipH, 6);
    this._objs.push(bg);

    // ── 제목 ──────────────────────────────────────────────────────────────
    this._objs.push(
      scene.add.text(left + PAD, ty + PAD, titleMsg, {
        fontFamily: "'PressStart2P', Arial",
        fontSize: '16px',
        color: titleMsgColor,
      }).setOrigin(0, 0).setDepth(depth + 1)
    );

    // ── 본문 ──────────────────────────────────────────────────────────────
    if (contentMsg) {
      this._objs.push(
        scene.add.text(left + PAD, ty + PAD + TITLE_H + PAD / 2, contentMsg, {
          fontFamily: 'Arial',
          fontSize: '13px',
          color: '#aaccbb',
          wordWrap: { width: tooltipW - PAD * 2 },
        }).setOrigin(0, 0).setDepth(depth + 1)
      );
    }

    // ── 버튼 영역 ─────────────────────────────────────────────────────────
    const hasBtn = !!(onUse || btnDisabled || sold);
    if (hasBtn) {
      const btnY = ty + tooltipH - PAD / 2 - BTN_H / 2;
      const btnW = tooltipW - PAD * 2;
      const btnCX = left + tooltipW / 2;

      if (sold) {
        this._objs.push(
          scene.add.text(btnCX, btnY, 'SOLD', {
            fontFamily: "'PressStart2P', Arial",
            fontSize: '10px',
            color: '#555555',
          }).setOrigin(0.5).setDepth(depth + 1)
        );
      } else if (onUse) {
        // 활성 버튼
        const btn = scene.add.rectangle(btnCX, btnY, btnW, BTN_H, 0x1a5533)
          .setDepth(depth + 1).setStrokeStyle(1, 0x44dd88).setInteractive();
        const btnTxt = scene.add.text(btnCX, btnY, btnLabel, {
          fontFamily: "'PressStart2P', Arial",
          fontSize: '10px',
          color: '#aaffaa',
        }).setOrigin(0.5).setDepth(depth + 2);
        btn.on('pointerdown', () => { this.hide(); onUse(); });
        btn.on('pointerover', () => btn.setFillStyle(0x2a7744));
        btn.on('pointerout', () => btn.setFillStyle(0x1a5533));
        this._objs.push(btn, btnTxt);
      } else if (btnDisabled) {
        // 비활성 버튼
        const btn = scene.add.rectangle(btnCX, btnY, btnW, BTN_H, 0x2a1a1a)
          .setDepth(depth + 1).setStrokeStyle(1, 0x554444).setInteractive();
        const btnTxt = scene.add.text(btnCX, btnY, btnLabel, {
          fontFamily: "'PressStart2P', Arial",
          fontSize: '10px',
          color: '#aa6644',
        }).setOrigin(0.5).setDepth(depth + 2);
        if (btnDisabledMsg) {
          btn.on('pointerdown', () => {
            const orig = btnLabel;
            btnTxt.setText(btnDisabledMsg).setColor('#ff6644');
            scene.time.delayedCall(900, () => {
              try { btnTxt.setText(orig).setColor('#aa6644'); } catch (_) { }
            });
          });
        }
        this._objs.push(btn, btnTxt);
      }
    }
  }

  // ── 제거 ────────────────────────────────────────────────────────────────
  hide() {
    this._objs.forEach(o => { try { o?.destroy(); } catch (_) { } });
    this._objs = [];
  }

  /** opts 일부를 교체 후 즉시 재렌더 */
  update(partialOpts) {
    this.opts = { ...this.opts, ...partialOpts };
    this.show();
  }
}
