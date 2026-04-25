import Phaser from "phaser";
import { GW, GH } from "../constants.js";
import { TS } from "../textStyles.js";
import { saveOptionsByRegistry } from "../manager/optionManager.js";

/**
 * OptionUI — 인게임 옵션 오버레이 (BGM/SFX 볼륨, MAIN MENU, CLOSE)
 *
 * opts:
 *   onMainMenu {function}  MAIN MENU 버튼 클릭 시 콜백 (씬 전환 등)
 *   onOpen     {function}  오버레이 열릴 때 콜백 (예: isDealing = true)
 *   onClose    {function}  오버레이 닫힐 때 콜백 (예: isDealing = false)
 *   depth      {number}    기본 depth (기본 600)
 */
import { ModalUI } from "./ModalUI.js";

/**
 * OptionUI — 인게임 옵션 오버레이 (BGM/SFX 볼륨, MAIN MENU, CLOSE)
 */
export class OptionUI extends ModalUI {
  constructor(scene, opts = {}) {
    super(scene, {
      depth: 600,
      ...opts
    });
  }

  show() {
    if (this.isOpen) return;

    const pw = 420, ph = 540;
    const { cx, cy, D } = this.createBase(pw, ph, { bgKey: "ui_battle_popup_v" });
    const pt = cy - ph / 2 + 50;

    const { scene } = this;

    this.addObj(
      scene.add.text(cx, pt, "OPTIONS", TS.popupTitle)
        .setOrigin(0.5).setDepth(D + 2)
    );

    // ── BGM ──────────────────────────────────────────────────────────────
    let bgm = scene.registry.get("bgmVolume") ?? 7;
    const bgmY = pt + 70;
    this.addObj(
      scene.add.text(cx, bgmY - 28, "BGM", TS.popupContent).setOrigin(0.5).setDepth(D + 2)
    );

    const bgmMinus = scene.add.image(cx - 80, bgmY, "ui_btn")
      .setDisplaySize(44, 44).setDepth(D + 2).setInteractive();
    this.addObj(bgmMinus);
    this.addObj(scene.add.text(cx - 80, bgmY, "-", TS.optBtn).setOrigin(0.5).setDepth(D + 3));

    const bgmTxt = scene.add.text(cx, bgmY, String(bgm), TS.popupContent)
      .setOrigin(0.5).setDepth(D + 2);
    this.addObj(bgmTxt);

    const bgmPlus = scene.add.image(cx + 80, bgmY, "ui_btn")
      .setDisplaySize(44, 44).setDepth(D + 2).setInteractive();
    this.addObj(bgmPlus);
    this.addObj(scene.add.text(cx + 80, bgmY, "+", TS.optBtn).setOrigin(0.5).setDepth(D + 3));

    const bgmBarBg = scene.add.rectangle(cx, bgmY + 28, 204, 7, 0x224433).setDepth(D + 2);
    const bgmBar = scene.add.rectangle(cx - 102, bgmY + 28, bgm * 20.4, 7, 0x44dd88)
      .setOrigin(0, 0.5).setDepth(D + 3);
    this.addObj(bgmBarBg);
    this.addObj(bgmBar);

    const updateBgm = (v) => {
      bgm = Phaser.Math.Clamp(v, 0, 10);
      scene.registry.set("bgmVolume", bgm);
      bgmTxt.setText(String(bgm));
      bgmBar.setDisplaySize(Math.max(1, bgm * 20.4), 7);
      saveOptionsByRegistry(scene.registry);
    };
    bgmMinus.on("pointerdown", () => updateBgm(bgm - 1));
    bgmPlus.on("pointerdown", () => updateBgm(bgm + 1));
    bgmMinus.on("pointerover", () => bgmMinus.setTint(0xcccccc));
    bgmMinus.on("pointerout", () => bgmMinus.clearTint());
    bgmPlus.on("pointerover", () => bgmPlus.setTint(0xcccccc));
    bgmPlus.on("pointerout", () => bgmPlus.clearTint());

    // ── SFX ──────────────────────────────────────────────────────────────
    let sfx = scene.registry.get("sfxVolume") ?? 7;
    const sfxY = bgmY + 100;
    this.addObj(
      scene.add.text(cx, sfxY - 28, "SFX", TS.popupContent).setOrigin(0.5).setDepth(D + 2)
    );

    const sfxMinus = scene.add.image(cx - 80, sfxY, "ui_btn")
      .setDisplaySize(44, 44).setDepth(D + 2).setInteractive();
    this.addObj(sfxMinus);
    this.addObj(scene.add.text(cx - 80, sfxY, "-", TS.optBtn).setOrigin(0.5).setDepth(D + 3));

    const sfxTxt = scene.add.text(cx, sfxY, String(sfx), TS.popupContent)
      .setOrigin(0.5).setDepth(D + 2);
    this.addObj(sfxTxt);

    const sfxPlus = scene.add.image(cx + 80, sfxY, "ui_btn")
      .setDisplaySize(44, 44).setDepth(D + 2).setInteractive();
    this.addObj(sfxPlus);
    this.addObj(scene.add.text(cx + 80, sfxY, "+", TS.optBtn).setOrigin(0.5).setDepth(D + 3));

    const sfxBarBg = scene.add.rectangle(cx, sfxY + 28, 204, 7, 0x224433).setDepth(D + 2);
    const sfxBar = scene.add.rectangle(cx - 102, sfxY + 28, sfx * 20.4, 7, 0x44dd88)
      .setOrigin(0, 0.5).setDepth(D + 3);
    this.addObj(sfxBarBg);
    this.addObj(sfxBar);

    const updateSfx = (v) => {
      sfx = Phaser.Math.Clamp(v, 0, 10);
      scene.registry.set("sfxVolume", sfx);
      sfxTxt.setText(String(sfx));
      sfxBar.setDisplaySize(Math.max(1, sfx * 20.4), 7);
      saveOptionsByRegistry(scene.registry);
      if (sfx > 0 && scene.cache.audio.exists("sfx_place")) {
        scene.sound.play("sfx_place", { volume: (sfx / 10) * 0.6 });
      }
    };
    sfxMinus.on("pointerdown", () => updateSfx(sfx - 1));
    sfxPlus.on("pointerdown", () => updateSfx(sfx + 1));
    sfxMinus.on("pointerover", () => sfxMinus.setTint(0xcccccc));
    sfxMinus.on("pointerout", () => sfxMinus.clearTint());
    sfxPlus.on("pointerover", () => sfxPlus.setTint(0xcccccc));
    sfxPlus.on("pointerout", () => sfxPlus.clearTint());

    // ── LANGUAGE ─────────────────────────────────────────────────────────
    let lang = scene.registry.get("lang") ?? "ko";
    const langY = sfxY + 110;
    this.addObj(
      scene.add.text(cx, langY - 35, "LANGUAGE", TS.popupContent).setOrigin(0.5).setDepth(D + 2)
    );

    const koBtn = scene.add.image(cx - 70, langY, "ui_btn")
      .setDisplaySize(120, 44).setDepth(D + 2).setInteractive();
    const koTxt = scene.add.text(cx - 70, langY, "한국어", TS.optLangBtn).setOrigin(0.5).setDepth(D + 3);
    this.addObj(koBtn); this.addObj(koTxt);

    const enBtn = scene.add.image(cx + 70, langY, "ui_btn")
      .setDisplaySize(120, 44).setDepth(D + 2).setInteractive();
    const enTxt = scene.add.text(cx + 70, langY, "English", TS.optLangBtn).setOrigin(0.5).setDepth(D + 3);
    this.addObj(enBtn); this.addObj(enTxt);

    const updateLangUI = () => {
      koBtn.setTint(lang === "ko" ? 0xccffcc : 0xffffff);
      enBtn.setTint(lang === "en" ? 0xccffcc : 0xffffff);
    };
    updateLangUI();

    const setLang = (next) => {
      if (lang === next) return;
      lang = next;
      scene.registry.set("lang", lang);
      saveOptionsByRegistry(scene.registry);
      updateLangUI();
      this.opts.onLanguageChange?.(lang);
    };

    koBtn.on("pointerdown", () => setLang("ko"));
    enBtn.on("pointerdown", () => setLang("en"));
    koBtn.on("pointerover", () => { if (lang !== "ko") koBtn.setTint(0xcccccc); });
    koBtn.on("pointerout", () => updateLangUI());
    enBtn.on("pointerover", () => { if (lang !== "en") enBtn.setTint(0xcccccc); });
    enBtn.on("pointerout", () => updateLangUI());

    // ── 버튼 ─────────────────────────────────────────────────────────────
    const btnY = cy + (ph / 2) - 100;

    const exitBtn = scene.add.image(cx - 80, btnY, "ui_btn")
      .setDisplaySize(150, 52).setDepth(D + 2).setInteractive();
    this.addObj(exitBtn);
    this.addObj(scene.add.text(cx - 80, btnY, "MAIN MENU", TS.sortBtn).setOrigin(0.5).setDepth(D + 3));

    exitBtn.on("pointerdown", () => {
      this.opts.onMainMenu?.();
    });
    exitBtn.on("pointerover", () => exitBtn.setTint(0xcccccc));
    exitBtn.on("pointerout", () => exitBtn.clearTint());

    const closeBtn = scene.add.image(cx + 80, btnY, "ui_btn")
      .setDisplaySize(150, 52).setDepth(D + 2).setInteractive();
    this.addObj(closeBtn);
    this.addObj(scene.add.text(cx + 80, btnY, "CLOSE", TS.sortBtn).setOrigin(0.5).setDepth(D + 3));

    closeBtn.on("pointerdown", () => this.close());
    closeBtn.on("pointerover", () => closeBtn.setTint(0xcccccc));
    closeBtn.on("pointerout", () => closeBtn.clearTint());
  }
}

