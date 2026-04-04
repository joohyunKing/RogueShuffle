import { GW, GH, MONSTER_AREA_TOP, MONSTER_AREA_H, PLAYER_PANEL_W, ITEM_PANEL_W } from '../constants.js';

const BAR_Y  = MONSTER_AREA_TOP + 4;              // 몬스터 영역 최상단
const BAR_H  = 20;
const BAR_W  = GW - PLAYER_PANEL_W - ITEM_PANEL_W - 40;
const BAR_X  = PLAYER_PANEL_W + 20;

export class BossHPBarUI {
  constructor(scene, boss, bossManager) {
    this.scene = scene;

    // 배경
    const g = scene.add.graphics().setDepth(20);
    g.fillStyle(0x1a0000, 1);
    g.fillRoundedRect(BAR_X, BAR_Y, BAR_W, BAR_H, 4);
    this._bg = g;

    // 채움 바
    this._fill = scene.add.graphics().setDepth(21);

    // 페이즈 구분선
    this._phaseObjs = [];
    this._drawPhaseMarkers(boss);

    // 보스 이름 (바 왼쪽 안)
    this._nameText = scene.add.text(BAR_X + 6, BAR_Y + BAR_H / 2, boss.name,
      { fontFamily: "'PressStart2P',Arial", fontSize: '8px', color: '#ffaaaa', stroke: '#000000', strokeThickness: 2 })
      .setOrigin(0, 0.5)
      .setDepth(23);

    // HP 수치 (바 중앙)
    this._hpText = scene.add.text(BAR_X + BAR_W / 2, BAR_Y + BAR_H / 2, '',
      { fontFamily: "'PressStart2P',Arial", fontSize: '7px', color: '#ffffff', stroke: '#000000', strokeThickness: 2 })
      .setOrigin(0.5)
      .setDepth(23);

    // 페이즈 레이블 (바 오른쪽 안)
    this._phaseLabel = scene.add.text(BAR_X + BAR_W - 6, BAR_Y + BAR_H / 2, '',
      { fontFamily: "'PressStart2P',Arial", fontSize: '7px', color: '#ffcc44', stroke: '#000000', strokeThickness: 2 })
      .setOrigin(1, 0.5)
      .setDepth(23);

    // 초기 페이즈 저장 (변경 감지용)
    this._trackedPhaseLabel = bossManager
      ? (bossManager.getCurrentPhase(boss)?.label ?? '')
      : '';

    this.update(boss, bossManager, false);
  }

  _drawPhaseMarkers(boss) {
    this._phaseObjs.forEach(o => o.destroy());
    this._phaseObjs = [];

    const phases = [...boss.phases].sort((a, b) => b.hpThreshold - a.hpThreshold);
    phases.forEach(p => {
      if (p.hpThreshold <= 0 || p.hpThreshold >= 1) return;
      const mx = BAR_X + BAR_W * p.hpThreshold;
      const line = this.scene.add.graphics().setDepth(22);
      line.fillStyle(0xffcc44, 0.9);
      line.fillRect(mx - 1, BAR_Y, 2, BAR_H);
      this._phaseObjs.push(line);
    });
  }

  // detectChange: true일 때만 페이즈 변경 연출 실행 (플레이어 공격 후 render에서만)
  update(boss, bossManager, detectChange = true) {
    const ratio = Math.max(0, boss.hp / boss.maxHp);

    const color =
      ratio > 0.5 ? 0xcc2222 :
      ratio > 0.25 ? 0xdd6611 :
      0xaa1111;

    this._fill.clear();
    this._fill.fillStyle(color, 1);
    this._fill.fillRoundedRect(BAR_X, BAR_Y, Math.max(4, BAR_W * ratio), BAR_H, 4);

    this._hpText.setText(`${boss.hp} / ${boss.maxHp}`);

    if (!bossManager) return;

    const phase = bossManager.getCurrentPhase(boss);
    const label = phase?.label ?? '';
    this._phaseLabel.setText(label);

    if (detectChange && label !== this._trackedPhaseLabel) {
      this._trackedPhaseLabel = label;
      this._showPhaseChange(label);
    }
  }

  // ── 페이즈 전환 연출 ─────────────────────────────────────────────────────
  _showPhaseChange(label) {
    const { scene } = this;
    const cx = PLAYER_PANEL_W + (GW - PLAYER_PANEL_W - ITEM_PANEL_W) / 2;
    const cy = MONSTER_AREA_TOP + MONSTER_AREA_H / 2;

    // 붉은 플래시
    const flash = scene.add.rectangle(GW / 2, GH / 2, GW, GH, 0xff0000, 0.35).setDepth(500);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 700, onComplete: () => flash.destroy() });

    // 페이즈 이름 텍스트
    const txt = scene.add.text(cx, cy, `⚠ ${label} ⚠`,
      { fontFamily: "'PressStart2P',Arial", fontSize: '20px', color: '#ffcc44', stroke: '#000000', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(501)
      .setAlpha(0);

    scene.tweens.add({
      targets: txt,
      alpha: { from: 0, to: 1 },
      scaleX: { from: 0.5, to: 1 },
      scaleY: { from: 0.5, to: 1 },
      duration: 250,
      ease: 'Back.Out',
      onComplete: () => {
        scene.tweens.add({
          targets: txt,
          alpha: 0,
          delay: 1200,
          duration: 400,
          onComplete: () => txt.destroy()
        });
      }
    });

    scene.addBattleLog?.(`⚠ 보스 페이즈 전환: ${label}!`);
    scene.refreshBattleLog?.();
  }

  destroy() {
    [this._bg, this._fill, this._nameText, this._hpText, this._phaseLabel]
      .forEach(o => o?.destroy());
    this._phaseObjs.forEach(o => o.destroy());
  }
}
