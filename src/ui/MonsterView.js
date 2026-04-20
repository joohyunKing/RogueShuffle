import { TS } from "../textStyles.js";
import { TooltipUI } from "./TooltipUI.js";

export default class MonsterView {
  constructor(scene, mon, idx, x, y, onClick, imgScale = 1.0, offsetY = 0) {
    this.scene = scene;
    this.mon = mon;
    this.idx = idx;
    this.onClick = onClick;
    this._canBeTarget = false;
    this._idleTween = null;
    this._isDead = false;

    const imgW = Math.round(156 * imgScale);
    const imgH = Math.round(156 * imgScale);

    // ── 위치 기준 계산
    const MON_BOTTOM = 400;
    const BAR_H = 14;
    const STAT_H = 16;

    this.barY = MON_BOTTOM - STAT_H - 6 - BAR_H / 2 + offsetY;
    this.statY = MON_BOTTOM - STAT_H / 2 + offsetY;
    this.spriteY = this.barY - BAR_H / 2 - 8 - imgH / 2;

    this.imgW = imgW;
    this.imgH = imgH;
    this.BAR_H = BAR_H;

    // ── sprite (Image 사용 — tween 애니메이션)
    // [기존 Sprite 방식 주석 처리]
    // this.sprite = scene.add.sprite(x, this.spriteY, `${mon.id}_idle`)
    const imgKey = scene.textures.exists(`mon_${mon.id}`) ? `mon_${mon.id}` : 'mon_sample';
    this.sprite = scene.add.image(x, this.spriteY, imgKey)
      .setDisplaySize(imgW, imgH)
      .setDepth(15);

    // [기존 idle 애니메이션 재생 주석 처리]
    // const idleKey = `${mon.id}_idle`;
    // if (scene.anims.exists(idleKey)) { this.sprite.play(idleKey); }

    // ── Idle tween 시작
    this._playIdle();

    // ── HP 바 (Ornate Frame)
    const frameW = 140;
    const frameH = 28;
    this.barW = 110;

    this.hpBarBg = scene.add.image(x, this.barY, "ui_hp_bar")
      .setDisplaySize(frameW, frameH)
      .setDepth(16);

    this.hpBar = scene.add.rectangle(x - this.barW / 2, this.barY, this.barW, 10, 0x44cc44)
      .setOrigin(0, 0.5)
      .setDepth(17);

    this.hpText = scene.add.text(x, this.barY, '', TS.monHpText)
      .setOrigin(0.5)
      .setDepth(18);

    // ── ATK / DEF
    this.atkIcon = scene.add.image(x - 30, this.statY, "ui_sword")
      .setDisplaySize(5, 14)
      .setDepth(16);

    this.atkText = scene.add.text(x - 26, this.statY, '',
      { ...TS.monStatNum, color: '#ffaaaa' })
      .setOrigin(0, 0.5)
      .setDepth(17);

    this.defIcon = scene.add.image(x + 6, this.statY, "ui_shield")
      .setDisplaySize(12, 12)
      .setDepth(16);

    this.defText = scene.add.text(x + 14, this.statY, '',
      { ...TS.monStatNum, color: '#aaaaff' })
      .setOrigin(0, 0.5)
      .setDepth(17);

    // ── 기믹 아이콘 (몬스터 이미지 위쪽 센터)
    const ICON_SIZE = 2;
    const iconX = x;
    const iconY = this.spriteY - imgH / 2 - 12;
    this._gimmickIconOffsetX = 0;
    this._gimmickIconY = iconY;
    this._tooltip = null;

    this.gimmickIcon = scene.add.image(iconX, iconY, '__DEFAULT')
      .setDisplaySize(ICON_SIZE, ICON_SIZE)
      .setDepth(22)
      .setVisible(false)
      .setInteractive();

    this.gimmickIcon.on('pointerover', () => this._showGimmickTip());
    this.gimmickIcon.on('pointerdown', () => this._showGimmickTip());
    this.gimmickIcon.on('pointerout', () => this._hideGimmickTip());

    // ── ATTACK 표시
    this.attackText = scene.add.text(x, this.spriteY - imgH / 2 - 10, "ATTACK!", TS.monTarget)
      .setOrigin(0.5, 1)
      .setDepth(18)
      .setVisible(false);

    // ── 히트 영역
    const hitH = MON_BOTTOM - (this.spriteY - imgH / 2) + 10;
    const hitCY = this.spriteY - imgH / 2 + hitH / 2;

    this.hitArea = scene.add.rectangle(x, hitCY, imgW + 20, hitH, 0x000000, 0)
      .setDepth(19)
      .setInteractive();

    this.hitArea.on("pointerdown", () => {
      this.hideTooltip();
      if (this._canBeTarget && this.onClick) this.onClick(this.idx);
    });

    if (this.mon.isBoss) {
      this.hitArea.on('pointerover', () => this._showBossTip());
      this.hitArea.on('pointerout', () => this.hideTooltip());
    } else {
      // 일반 몬스터도 기믹 팁은 상시 확인 가능하도록 처리
      this.hitArea.on('pointerover', () => this._showGimmickTip());
      this.hitArea.on('pointerout', () => this.hideTooltip());
    }
  }

  _formatHP(val) {
    if (val >= 1000000) {
      const v = (val / 1000000).toFixed(1);
      return v.endsWith('.0') ? v.slice(0, -2) + 'M' : v + 'M';
    }
    if (val >= 10000) {
      const v = (val / 1000).toFixed(1);
      return v.endsWith('.0') ? v.slice(0, -2) + 'K' : v + 'K';
    }
    return val.toString();
  }

  // ── Idle tween (위아래 부유) ────────────────────────────────────────────────
  _playIdle() {
    if (this._idleTween) this._idleTween.destroy();
    const baseY = this.spriteY;
    const baseScaleY = this.sprite.scaleY;
    this._idleTween = this.scene.tweens.add({
      targets: this.sprite,
      y: baseY - 3,
      scaleY: baseScaleY * 0.985,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // ── 공격 tween (준비 → 돌진 → 복귀) ──────────────────────────────────────
  // 타이밍: 0~100ms 준비(뒤로+찌그러짐), 100~200ms 돌진(앞으로+늘어남), 200~400ms 복귀
  // 피크(190ms 부근)에 _showPlayerHitEffect 호출하면 타이밍이 맞음
  playAttack() {
    if (this._isDead) return;
    const baseX = this.sprite.x;
    const baseScaleX = this.sprite.scaleX;
    this._idleTween?.pause();
    this.scene.tweens.chain({
      targets: this.sprite,
      tweens: [
        { x: baseX + 16, scaleX: baseScaleX * 0.88, duration: 100, ease: 'Power2.Out' },
        { x: baseX - 32, scaleX: baseScaleX * 1.14, duration: 110, ease: 'Power3.In' },
        { x: baseX, scaleX: baseScaleX, duration: 220, ease: 'Bounce.Out' },
      ],
      onComplete: () => { this._idleTween?.resume(); }
    });
  }

  // ── 피격 tween (흔들기 + 빨간 틴트) ────────────────────────────────────────
  playHit(cb) {
    if (this._isDead) { cb?.(); return; }
    const baseX = this.sprite.x;
    this._idleTween?.pause();
    this.sprite.setTint(0xff4444);
    this.scene.tweens.chain({
      targets: this.sprite,
      tweens: [
        { x: baseX + 9, duration: 40 },
        { x: baseX - 9, duration: 40 },
        { x: baseX + 6, duration: 40 },
        { x: baseX - 6, duration: 40 },
        { x: baseX, duration: 40 },
      ],
      onComplete: () => {
        this.sprite.clearTint();
        this._idleTween?.resume();
        cb?.();
      }
    });
  }

  // ── 스킬 tween (고스트 잔상 + 플래시) ──────────────────────────────────────
  playSkill() {
    if (this._isDead) return;
    const { scene, sprite } = this;
    for (let i = 0; i < 3; i++) {
      scene.time.delayedCall(i * 60, () => {
        const ghost = scene.add.image(sprite.x + (i - 1) * 20, sprite.y, sprite.texture.key)
          .setDisplaySize(this.imgW, this.imgH)
          .setAlpha(0.4)
          .setTint(0x8888ff)
          .setDepth(14);
        scene.tweens.add({ targets: ghost, alpha: 0, duration: 350, onComplete: () => ghost.destroy() });
      });
    }
    const flash = scene.add.rectangle(sprite.x, sprite.y, this.imgW, this.imgH, 0xffffff, 0.7)
      .setDepth(16);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 300, onComplete: () => flash.destroy() });
  }

  // ── 부활 (sprite 상태 완전 초기화 후 idle 재시작) ───────────────────────
  revive() {
    this._isDead = false;
    this.sprite.setAlpha(1).setAngle(0).setY(this.spriteY);
    this._playIdle();
  }

  // ── 사망 tween (기울어지며 페이드) ─────────────────────────────────────────
  playDie() {
    if (this._isDead) return;
    this._isDead = true;
    this._idleTween?.stop();
    this._idleTween = null;
    this.hideTooltip();
    const baseY = this.sprite.y;
    this.scene.tweens.add({
      targets: this.sprite,
      angle: 85,
      alpha: 0,
      y: baseY + 35,
      duration: 550,
      ease: 'Power2.In',
    });
  }

  update(mon, x, canBeTarget = false) {
    this.mon = mon;

    // ── 애니메이션 상태 전환 (기존 sprite 방식 주석 처리 — tween으로 대체)
    // const state = mon.isDead ? 'die' : (mon.state ?? 'idle');
    // const animKey = `${mon.id}_${state}`;
    // if (this.scene.anims.exists(animKey) && this.sprite.anims.currentAnim?.key !== animKey) {
    //   this.sprite.play(animKey);
    // }

    // ── 위치 업데이트
    this.sprite.setX(x);
    this.hpBarBg.setX(x);
    this.hpBar.setX(x - this.barW / 2);
    this.hpText.setX(x);

    this.atkIcon.setX(x - 30);
    this.atkText.setX(x - 26);
    this.defIcon.setX(x + 6);
    this.defText.setX(x + 14);

    this.attackText.setX(x);
    this.hitArea.setX(x);
    this.gimmickIcon.setX(x + this._gimmickIconOffsetX);

    // ── HP
    const hpRatio = Math.max(0, mon.hp / mon.maxHp);
    const hpColor =
      hpRatio > 0.5 ? 0x44cc44 :
        hpRatio > 0.25 ? 0xddaa00 :
          0xdd3333;

    this.hpBar.width = Math.max(1, this.barW * hpRatio);
    this.hpBar.fillColor = hpColor;

    this.hpText.setText(`${this._formatHP(mon.hp)}/${this._formatHP(mon.maxHp)}`);

    // ── ATK / DEF
    this.atkText.setText(mon.atk);
    this.defText.setText(mon.def);

    // ── 기믹 아이콘
    if (mon.gimmick) {
      const g = mon.gimmick;
      const key = `gimmick_${g.id}`;
      if (this.scene.textures.exists(key)) this.gimmickIcon.setTexture(key);
      const active = g.type !== 'first_turn_def' || g.firstTurnActive;
      this.gimmickIcon.setAlpha(active ? 1 : 0.35).setVisible(true);
    } else {
      this.gimmickIcon.setVisible(false);
    }

    // ── ATTACK 표시
    this._canBeTarget = canBeTarget;
    if (canBeTarget) {
      this.attackText.setVisible(true);
    } else {
      this.attackText.setVisible(false);
    }
  }

  // HP바 · ATK · DEF 수치만 갱신 (애니메이션 불간섭)
  updateStats(mon) {
    const hpRatio = Math.max(0, mon.hp / mon.maxHp);
    const hpColor =
      hpRatio > 0.5 ? 0x44cc44 :
        hpRatio > 0.25 ? 0xddaa00 :
          0xdd3333;
    this.hpBar.width = Math.max(1, this.barW * hpRatio);
    this.hpBar.fillColor = hpColor;
    this.hpText.setText(`${this._formatHP(mon.hp)}/${this._formatHP(mon.maxHp)}`);
    this.atkText.setText(mon.atk);
    this.defText.setText(mon.def);
  }

  hideStats() {
    [this.atkIcon, this.atkText, this.defIcon, this.defText].forEach(o => o?.setVisible(false));
  }

  hideHPBar() {
    [this.hpBarBg, this.hpBar, this.hpText].forEach(o => o?.setVisible(false));
  }

  _showGimmickTip() {
    const g = this.mon?.gimmick;
    if (!g) return;
    this.hideTooltip();
    const iconX = this.gimmickIcon.x;
    const left = iconX > 640 ? iconX - 225 : iconX + 20;
    this._tooltip = new TooltipUI(this.scene, {
      titleMsg: g.name,
      contentMsg: g.description,
      titleMsgColor: '#ffcc44',
      tooltipW: 200,
      left,
      centerY: this._gimmickIconY,
      depth: 350,
    });
    this._tooltip.show();
  }

  _showBossTip() {
    if (!this.mon || !this.mon.isBoss) return;
    this.hideTooltip();

    const boss = this.mon;
    let content = "";

    // 1. 공통 패시브
    const globalPassives = Array.isArray(boss.passive) ? boss.passive : (boss.passive ? [boss.passive] : []);

    // 2. 현재 페이즈 패시브 찾기
    const hpRatio = boss.hp / boss.maxHp;
    const sortedPhases = [...(boss.phases || [])].sort((a, b) => b.hpThreshold - a.hpThreshold);
    const currentPhase = sortedPhases.find(p => hpRatio >= p.hpThreshold) ?? sortedPhases[sortedPhases.length - 1];

    const phasePassives = currentPhase && currentPhase.passive
      ? (Array.isArray(currentPhase.passive) ? currentPhase.passive : [currentPhase.passive])
      : [];

    const allPassives = [...globalPassives, ...phasePassives];

    allPassives.forEach(p => {
      if (p.name && p.description) {
        content += `[${p.name}]\n${p.description}\n\n`;
      }
    });

    // 3. 고유 규칙 (initSkillId)
    if (boss.initSkillId && boss.skills?.[boss.initSkillId]) {
      const s = boss.skills[boss.initSkillId];
      content += `[특수: ${s.name}]\n${s.description}\n\n`;
    }

    if (!content) content = "특별한 기믹 정보가 없습니다.";

    const iconX = this.sprite.x;
    const tooltipW = 280;
    const left = iconX > 640 ? iconX - (tooltipW + 25) : iconX + 25;

    this._tooltip = new TooltipUI(this.scene, {
      titleMsg: `${boss.name} (BOSS)`,
      contentMsg: content.trim(),
      titleMsgColor: '#ff4444',
      tooltipW: tooltipW,
      left,
      centerY: this.spriteY,
      depth: 350,
    });
    this._tooltip.show();
  }

  hideTooltip() {
    this._tooltip?.hide();
    this._tooltip = null;
  }

  destroy() {
    this._idleTween?.stop();
    this._idleTween = null;
    this.hideTooltip();
    [
      this.sprite,
      this.hpBarBg, this.hpBar, this.hpText,
      this.atkIcon, this.atkText,
      this.defIcon, this.defText,
      this.gimmickIcon,
      this.attackText,
      this.hitArea
    ].forEach(obj => obj.destroy());
  }
}
