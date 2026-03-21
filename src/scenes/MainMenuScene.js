import Phaser from "phaser";
import { GW, GH } from "../constants.js";

export class MainMenuScene extends Phaser.Scene {
  constructor() { super("MainMenuScene"); }

  create() {
    this._drawBg();
    this._drawTitle();
    this._createButtons();
  }

  _drawBg() {
    const g = this.add.graphics();
    g.fillStyle(0x0d2b18);
    g.fillRect(0, 0, GW, GH);

    // 장식용 카드 실루엣 (배경)
    g.fillStyle(0x1a472a);
    g.fillRoundedRect(GW / 2 - 420, 80, 840, 640, 24);
    g.lineStyle(2, 0x2d7a3a);
    g.strokeRoundedRect(GW / 2 - 420, 80, 840, 640, 24);
  }

  _drawTitle() {
    this.add.text(GW / 2, 210, "ROGUE SHUFFLE", {
      fontSize: "72px",
      color: "#ffffff",
      fontStyle: "bold",
      fontFamily: "Arial",
      stroke: "#0a2a14",
      strokeThickness: 8,
    }).setOrigin(0.5);

    this.add.text(GW / 2, 300, "트럼프 카드 로그라이크 점수 게임", {
      fontSize: "22px",
      color: "#88bb99",
      fontFamily: "Arial",
    }).setOrigin(0.5);
  }

  _createButtons() {
    // ── PLAY 버튼 ──────────────────────────────────────────────────────────
    const playBg = this.add.rectangle(GW / 2, 430, 260, 70, 0x22aa44)
      .setInteractive();
    this.add.text(GW / 2, 430, "▶  P L A Y", {
      fontSize: "28px",
      color: "#ffffff",
      fontStyle: "bold",
      fontFamily: "Arial",
    }).setOrigin(0.5);

    playBg.on("pointerdown", () => this.scene.start("GameScene"));
    playBg.on("pointerover",  () => playBg.setFillStyle(0x33cc55));
    playBg.on("pointerout",   () => playBg.setFillStyle(0x22aa44));

    // ── OPTIONS 버튼 ───────────────────────────────────────────────────────
    const optBg = this.add.rectangle(GW / 2, 530, 260, 60, 0x335544)
      .setInteractive();
    this.add.text(GW / 2, 530, "⚙  O P T I O N S", {
      fontSize: "22px",
      color: "#aaffcc",
      fontFamily: "Arial",
    }).setOrigin(0.5);

    optBg.on("pointerdown", () => this.scene.start("OptionsScene"));
    optBg.on("pointerover",  () => optBg.setFillStyle(0x447766));
    optBg.on("pointerout",   () => optBg.setFillStyle(0x335544));

    // ── 버전 표기 ──────────────────────────────────────────────────────────
    this.add.text(GW - 20, GH - 12, "v0.1.0", {
      fontSize: "13px",
      color: "#446655",
      fontFamily: "Arial",
    }).setOrigin(1, 1);
  }
}
