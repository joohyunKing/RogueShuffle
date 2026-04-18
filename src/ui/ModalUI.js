import Phaser from "phaser";
import { GW, GH } from "../constants.js";

/**
 * ModalUI - 모든 팝업 및 오버레이의 베이스 클래스
 */
export class ModalUI {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.opts = {
      depth: 600,
      onOpen: null,
      onClose: null,
      isDealing: false, // 여닫을 때 isDealing 제어 여부
      ...opts,
    };
    this._objs = null;
    this._dim = null;
    this._panel = null;
  }

  get isOpen() { return !!this._objs; }

  /**
   * 베이스 레이어(딤 + 패널 프레임) 생성
   */
  createBase(pw, ph, options = {}) {
    if (this._objs) return;

    if (this.opts.onOpen) this.opts.onOpen();
    if (this.opts.isDealing) {
        this.scene.isDealing = true;
    }

    const D = options.depth ?? this.opts.depth;
    this._objs = [];
    const cx = GW / 2, cy = GH / 2;

    // 1. 딤 (배경 클릭 시 닫기 기본 지원)
    this._dim = this.scene.add.rectangle(cx, cy, GW, GH, 0x000000, options.dimAlpha ?? 0.65)
      .setDepth(D).setInteractive();
    
    if (options.closeOnDim !== false) {
        this._dim.on('pointerdown', () => this.close());
    }
    this._objs.push(this._dim);

    // 2. 패널
    const panelY = options.panelY ?? cy;
    const bgKey = options.bgKey;
    if (bgKey && this.scene.textures.exists(bgKey)) {
      this._panel = this.scene.add.image(cx, panelY, bgKey)
        .setDisplaySize(pw, ph).setOrigin(0.5).setDepth(D + 1);
    } else if (this.scene.textures.exists("ui_frame")) {
      this._panel = this.scene.add.nineslice(cx, panelY, "ui_frame", 0, pw, ph, 8, 8, 8, 8)
        .setOrigin(0.5).setDepth(D + 1).setAlpha(0.97);
    } else {
      const g = this.scene.add.graphics().setDepth(D + 1);
      const color = options.panelColor ?? 0x0d2b18;
      const stroke = options.strokeColor ?? 0x2d7a3a;
      g.fillStyle(color, 0.95);
      g.fillRoundedRect(cx - pw / 2, panelY - ph / 2, pw, ph, 12);
      g.lineStyle(2, stroke);
      g.strokeRoundedRect(cx - pw / 2, panelY - ph / 2, pw, ph, 12);
      this._panel = g;
    }
    this._objs.push(this._panel);

    return { cx, cy, D, panelTop: panelY - ph / 2, panelBottom: panelY + ph / 2 };
  }

  /**
   * 팝업 닫기 및 정리
   */
  close() {
    if (!this._objs) return;

    if (this.opts.onClose) this.opts.onClose();
    if (this.opts.isDealing) {
        this.scene.isDealing = false;
    }

    this._objs.forEach(o => {
      try {
        if (o && o.active !== false) o.destroy();
      } catch (e) {
        // console.warn("ModalUI close error:", e);
      }
    });
    this._objs = null;
    this._dim = null;
    this._panel = null;
  }

  /**
   * 하위 오브젝트 등록 (자동 정리용)
   */
  addObj(obj) {
    if (this._objs) this._objs.push(obj);
    return obj;
  }
}
