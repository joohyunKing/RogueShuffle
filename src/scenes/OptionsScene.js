import Phaser from "phaser";
import { GW, GH } from "../constants.js";
import { TS } from "../textStyles.js";

const PANEL_W = 560;
const PANEL_H = 520;
const PANEL_X = GW / 2 - PANEL_W / 2;
const PANEL_Y = 130;

export class OptionsScene extends Phaser.Scene {
  constructor() { super("OptionsScene"); }

  create() {
    // 기본값 초기화
    if (this.registry.get("bgmVolume") == null) this.registry.set("bgmVolume", 7);
    if (this.registry.get("sfxVolume") == null) this.registry.set("sfxVolume", 7);
    if (this.registry.get("lang")      == null) this.registry.set("lang",      "ko");

    this._bgm  = this.registry.get("bgmVolume");
    this._sfx  = this.registry.get("sfxVolume");
    this._lang = this.registry.get("lang");

    this._drawBg();
    this._createBgmRow();
    this._createSfxRow();
    this._createLangRow();
    this._createBackButton();
  }

  _drawBg() {
    const g = this.add.graphics();
    g.fillStyle(0x0d2b18);
    g.fillRect(0, 0, GW, GH);
    g.fillStyle(0x1a472a);
    g.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 20);
    g.lineStyle(2, 0x2d7a3a);
    g.strokeRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 20);

    this.add.text(GW / 2, PANEL_Y + 52, "OPTIONS", TS.optTitle).setOrigin(0.5);
  }

  // ── BGM 볼륨 ─────────────────────────────────────────────────────────────
  _createBgmRow() {
    const rowY = PANEL_Y + 150;
    this.add.text(GW / 2, rowY - 38, "BGM VOLUME", TS.optLabel).setOrigin(0.5);

    const minusBg = this.add.rectangle(GW / 2 - 90, rowY, 50, 50, 0x335544).setInteractive();
    this.add.text(GW / 2 - 90, rowY, "-", TS.optBtn).setOrigin(0.5);

    this._bgmTxt = this.add.text(GW / 2, rowY, String(this._bgm), TS.optValue).setOrigin(0.5);

    const plusBg = this.add.rectangle(GW / 2 + 90, rowY, 50, 50, 0x335544).setInteractive();
    this.add.text(GW / 2 + 90, rowY, "+", TS.optBtn).setOrigin(0.5);

    this._bgmBarBg = this.add.rectangle(GW / 2, rowY + 40, 200, 8, 0x224433);
    this._bgmBar   = this.add.rectangle(GW / 2 - 100, rowY + 40, this._bgm * 20, 8, 0x44dd88).setOrigin(0, 0.5);
    this._updateBgmBar();

    minusBg.on("pointerdown", () => this._changeBgm(-1));
    plusBg.on("pointerdown",  () => this._changeBgm(+1));
    minusBg.on("pointerover", () => minusBg.setFillStyle(0x447766));
    minusBg.on("pointerout",  () => minusBg.setFillStyle(0x335544));
    plusBg.on("pointerover",  () => plusBg.setFillStyle(0x447766));
    plusBg.on("pointerout",   () => plusBg.setFillStyle(0x335544));
  }

  _changeBgm(delta) {
    this._bgm = Phaser.Math.Clamp(this._bgm + delta, 0, 10);
    this.registry.set("bgmVolume", this._bgm);
    this._bgmTxt.setText(String(this._bgm));
    this._updateBgmBar();
    // BGM 사운드가 있으면 여기서 볼륨 적용
  }

  _updateBgmBar() {
    this._bgmBar.setDisplaySize(Math.max(1, this._bgm * 20), 8);
  }

  // ── SFX 볼륨 ─────────────────────────────────────────────────────────────
  _createSfxRow() {
    const rowY = PANEL_Y + 280;
    this.add.text(GW / 2, rowY - 38, "SFX VOLUME", TS.optLabel).setOrigin(0.5);

    const minusBg = this.add.rectangle(GW / 2 - 90, rowY, 50, 50, 0x335544).setInteractive();
    this.add.text(GW / 2 - 90, rowY, "-", TS.optBtn).setOrigin(0.5);

    this._sfxTxt = this.add.text(GW / 2, rowY, String(this._sfx), TS.optValue).setOrigin(0.5);

    const plusBg = this.add.rectangle(GW / 2 + 90, rowY, 50, 50, 0x335544).setInteractive();
    this.add.text(GW / 2 + 90, rowY, "+", TS.optBtn).setOrigin(0.5);

    this._sfxBarBg = this.add.rectangle(GW / 2, rowY + 40, 200, 8, 0x224433);
    this._sfxBar   = this.add.rectangle(GW / 2 - 100, rowY + 40, this._sfx * 20, 8, 0x44dd88).setOrigin(0, 0.5);
    this._updateSfxBar();

    minusBg.on("pointerdown", () => this._changeSfx(-1));
    plusBg.on("pointerdown",  () => this._changeSfx(+1));
    minusBg.on("pointerover", () => minusBg.setFillStyle(0x447766));
    minusBg.on("pointerout",  () => minusBg.setFillStyle(0x335544));
    plusBg.on("pointerover",  () => plusBg.setFillStyle(0x447766));
    plusBg.on("pointerout",   () => plusBg.setFillStyle(0x335544));
  }

  _changeSfx(delta) {
    this._sfx = Phaser.Math.Clamp(this._sfx + delta, 0, 10);
    this.registry.set("sfxVolume", this._sfx);
    this._sfxTxt.setText(String(this._sfx));
    this._updateSfxBar();
    // 볼륨 미리듣기 (GameScene을 거쳐서 온 경우에만 소리 있음)
    if (this._sfx > 0 && this.cache.audio.exists("sfx_place")) {
      this.sound.play("sfx_place", { volume: (this._sfx / 10) * 0.6 });
    }
  }

  _updateSfxBar() {
    this._sfxBar.setDisplaySize(Math.max(1, this._sfx * 20), 8);
  }

  // ── 언어 ─────────────────────────────────────────────────────────────────
  _createLangRow() {
    const rowY = PANEL_Y + 400;
    this.add.text(GW / 2, rowY - 38, "LANGUAGE", TS.optLabel).setOrigin(0.5);

    this._koBg = this.add.rectangle(GW / 2 - 70, rowY, 120, 50, 0x335544).setInteractive();
    this._koTxt = this.add.text(GW / 2 - 70, rowY, "한국어", TS.optLangBtn).setOrigin(0.5);

    this._enBg = this.add.rectangle(GW / 2 + 70, rowY, 120, 50, 0x335544).setInteractive();
    this._enTxt = this.add.text(GW / 2 + 70, rowY, "English", TS.optLangBtn).setOrigin(0.5);

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

  // ── 뒤로 ─────────────────────────────────────────────────────────────────
  _createBackButton() {
    const backBg = this.add.rectangle(GW / 2, PANEL_Y + PANEL_H - 48, 200, 54, 0x1e4e99).setInteractive();
    this.add.text(GW / 2, PANEL_Y + PANEL_H - 48, "BACK", TS.optBackBtn).setOrigin(0.5);
    backBg.on("pointerdown", () => this.scene.start("MainMenuScene"));
    backBg.on("pointerover",  () => backBg.setFillStyle(0x2d66cc));
    backBg.on("pointerout",   () => backBg.setFillStyle(0x1e4e99));
  }
}
