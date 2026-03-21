import Phaser from "phaser";
import { GW, GH } from "../constants.js";

const PANEL_W = 560;
const PANEL_H = 460;
const PANEL_X = GW / 2 - PANEL_W / 2;
const PANEL_Y = 160;

export class OptionsScene extends Phaser.Scene {
  constructor() { super("OptionsScene"); }

  create() {
    // registry 기본값 초기화 (최초 1회)
    if (this.registry.get("volume") == null) this.registry.set("volume", 7);
    if (this.registry.get("lang")   == null) this.registry.set("lang",   "ko");

    this._volume = this.registry.get("volume");
    this._lang   = this.registry.get("lang");

    this._drawBg();
    this._createVolumeRow();
    this._createLangRow();
    this._createBackButton();
  }

  _drawBg() {
    // 어두운 전체 배경
    const g = this.add.graphics();
    g.fillStyle(0x0d2b18);
    g.fillRect(0, 0, GW, GH);

    // 패널
    g.fillStyle(0x1a472a);
    g.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 20);
    g.lineStyle(2, 0x2d7a3a);
    g.strokeRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 20);

    this.add.text(GW / 2, PANEL_Y + 52, "O P T I O N S", {
      fontSize: "32px",
      color: "#ffffff",
      fontStyle: "bold",
      fontFamily: "Arial",
      letterSpacing: 4,
    }).setOrigin(0.5);
  }

  // ── 볼륨 ──────────────────────────────────────────────────────────────────
  _createVolumeRow() {
    const rowY = PANEL_Y + 160;

    this.add.text(GW / 2, rowY - 36, "볼  륨", {
      fontSize: "20px",
      color: "#aaffcc",
      fontFamily: "Arial",
      letterSpacing: 2,
    }).setOrigin(0.5);

    // − 버튼
    const minusBg = this.add.rectangle(GW / 2 - 90, rowY, 50, 50, 0x335544)
      .setInteractive();
    this.add.text(GW / 2 - 90, rowY, "−", {
      fontSize: "30px", color: "#ffffff", fontFamily: "Arial",
    }).setOrigin(0.5);

    // 볼륨 값
    this._volTxt = this.add.text(GW / 2, rowY, String(this._volume), {
      fontSize: "28px", color: "#ffdd00", fontStyle: "bold", fontFamily: "Arial",
    }).setOrigin(0.5);

    // + 버튼
    const plusBg = this.add.rectangle(GW / 2 + 90, rowY, 50, 50, 0x335544)
      .setInteractive();
    this.add.text(GW / 2 + 90, rowY, "+", {
      fontSize: "30px", color: "#ffffff", fontFamily: "Arial",
    }).setOrigin(0.5);

    // 볼륨 바 (시각적 표시)
    this._volBarBg = this.add.rectangle(GW / 2, rowY + 38, 200, 8, 0x224433);
    this._volBar   = this.add.rectangle(
      GW / 2 - 100 + this._volume * 10,
      rowY + 38,
      this._volume * 20,
      8,
      0x44dd88,
    ).setOrigin(0, 0.5).setX(GW / 2 - 100);

    this._updateVolBar();

    minusBg.on("pointerdown", () => this._changeVolume(-1));
    plusBg.on("pointerdown",  () => this._changeVolume(+1));
    minusBg.on("pointerover", () => minusBg.setFillStyle(0x447766));
    minusBg.on("pointerout",  () => minusBg.setFillStyle(0x335544));
    plusBg.on("pointerover",  () => plusBg.setFillStyle(0x447766));
    plusBg.on("pointerout",   () => plusBg.setFillStyle(0x335544));
  }

  _changeVolume(delta) {
    this._volume = Phaser.Math.Clamp(this._volume + delta, 0, 10);
    this.registry.set("volume", this._volume);
    this.sound.volume = this._volume / 10;
    this._volTxt.setText(String(this._volume));
    this._updateVolBar();
  }

  _updateVolBar() {
    const w = this._volume * 20;          // 0~200px
    this._volBar.setDisplaySize(Math.max(w, 1), 8);
  }

  // ── 언어 ──────────────────────────────────────────────────────────────────
  _createLangRow() {
    const rowY = PANEL_Y + 300;

    this.add.text(GW / 2, rowY - 36, "언어  /  Language", {
      fontSize: "20px",
      color: "#aaffcc",
      fontFamily: "Arial",
    }).setOrigin(0.5);

    // KO 버튼
    this._koBg = this.add.rectangle(GW / 2 - 70, rowY, 120, 50, 0x335544)
      .setInteractive();
    this._koTxt = this.add.text(GW / 2 - 70, rowY, "한국어", {
      fontSize: "20px", color: "#ffffff", fontFamily: "Arial",
    }).setOrigin(0.5);

    // EN 버튼
    this._enBg = this.add.rectangle(GW / 2 + 70, rowY, 120, 50, 0x335544)
      .setInteractive();
    this._enTxt = this.add.text(GW / 2 + 70, rowY, "English", {
      fontSize: "20px", color: "#ffffff", fontFamily: "Arial",
    }).setOrigin(0.5);

    this._refreshLangBtns();

    this._koBg.on("pointerdown", () => this._setLang("ko"));
    this._enBg.on("pointerdown", () => this._setLang("en"));
    this._koBg.on("pointerover", () => { if (this._lang !== "ko") this._koBg.setFillStyle(0x447766); });
    this._koBg.on("pointerout",  () => this._refreshLangBtns());
    this._enBg.on("pointerover", () => { if (this._lang !== "en") this._enBg.setFillStyle(0x447766); });
    this._enBg.on("pointerout",  () => this._refreshLangBtns());
  }

  _setLang(lang) {
    this._lang = lang;
    this.registry.set("lang", lang);
    this._refreshLangBtns();
  }

  _refreshLangBtns() {
    this._koBg.setFillStyle(this._lang === "ko" ? 0x227744 : 0x335544);
    this._enBg.setFillStyle(this._lang === "en" ? 0x227744 : 0x335544);
  }

  // ── 뒤로가기 버튼 ─────────────────────────────────────────────────────────
  _createBackButton() {
    const backBg = this.add.rectangle(GW / 2, PANEL_Y + PANEL_H - 48, 200, 54, 0x1e4e99)
      .setInteractive();
    this.add.text(GW / 2, PANEL_Y + PANEL_H - 48, "← 뒤로", {
      fontSize: "22px", color: "#ffffff", fontFamily: "Arial",
    }).setOrigin(0.5);

    backBg.on("pointerdown", () => this.scene.start("MainMenuScene"));
    backBg.on("pointerover",  () => backBg.setFillStyle(0x2d66cc));
    backBg.on("pointerout",   () => backBg.setFillStyle(0x1e4e99));
  }
}
