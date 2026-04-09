import { PLAYER_PANEL_W, ITEM_PANEL_W, GW, MONSTER_AREA_TOP, MONSTER_AREA_H } from '../constants.js';

export default class effectManager {
    constructor(scene) {
        this.scene = scene;
    }

    // ⚔️ 단일 공격 (slash 느낌)
    hitSlash(monster) {
        const { x, y } = monster;

        const g = this.scene.add.graphics()
            .setDepth(9999)
            .setBlendMode(Phaser.BlendModes.ADD);

        g.lineStyle(6, 0xffffff, 1);
        g.beginPath();
        g.moveTo(x - 40, y - 60);
        g.lineTo(x + 40, y + 60);
        g.strokePath();

        this.scene.tweens.add({
            targets: g,
            alpha: { from: 0, to: 1 },
            duration: 50,
            yoyo: true,
            hold: 50,
            onComplete: () => g.destroy()
        });

        this._hitReaction(monster, 0xffaaaa);
        this.scene.cameras.main.shake(120, 0.01);
    }

    // ⚡ 번개 — scoreTxt 위치에서 몬스터에 번개 타격
    hitLightning(toX, toY, monsterSprite) {
        const scene = this.scene;

        try {
            const sfxVol = (scene.registry?.get("sfxVolume") ?? 7) / 10;
            scene.sound.play("sfx_lightning", { volume: sfxVol * 0.8 });
        } catch(e) {}

        const fromX = PLAYER_PANEL_W + (GW - PLAYER_PANEL_W - ITEM_PANEL_W) / 2;
        const fromY = MONSTER_AREA_TOP + 20;

        // 지그재그 경로 생성 (매번 새로운 랜덤)
        const makePts = () => {
            const pts = [{ x: fromX, y: fromY }];
            const NUM_SEG = 10;
            for (let i = 1; i < NUM_SEG; i++) {
                const t = i / NUM_SEG;
                const bx = fromX + (toX - fromX) * t;
                const by = fromY + (toY - fromY) * t;
                const jitter = Math.sin(t * Math.PI) * 24;
                pts.push({
                    x: bx + Phaser.Math.Between(-jitter, jitter),
                    y: by + Phaser.Math.Between(-6, 6),
                });
            }
            pts.push({ x: toX, y: toY });
            return pts;
        };

        const gGlow = scene.add.graphics().setDepth(9998).setBlendMode(Phaser.BlendModes.ADD);
        const gCore = scene.add.graphics().setDepth(9999).setBlendMode(Phaser.BlendModes.ADD);

        const redraw = () => {
            const pts = makePts();
            gGlow.clear();
            gGlow.lineStyle(10, 0x4488ff, 0.5);
            gGlow.beginPath();
            gGlow.moveTo(pts[0].x, pts[0].y);
            pts.slice(1).forEach(p => gGlow.lineTo(p.x, p.y));
            gGlow.strokePath();

            gCore.clear();
            gCore.lineStyle(3, 0xeeeeff, 1.0);
            gCore.beginPath();
            gCore.moveTo(pts[0].x, pts[0].y);
            pts.slice(1).forEach(p => gCore.lineTo(p.x, p.y));
            gCore.strokePath();
        };

        // 1st flash
        redraw();
        // 2nd flash (flickering)
        scene.time.delayedCall(70, () => {
            if (gCore.active) redraw();
        });

        // 발사 지점 글로우
        const origin = scene.add.circle(fromX, fromY, 8, 0x88bbff, 0.9)
            .setDepth(9999).setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({
            targets: origin, scale: 3, alpha: 0, duration: 200, ease: 'Expo.easeOut',
            onComplete: () => origin.destroy(),
        });

        // 타격 지점 임팩트 스파크
        const spark = scene.add.circle(toX, toY, 14, 0xffffff, 1)
            .setDepth(9999).setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({
            targets: spark, scale: 3.5, alpha: 0, duration: 220, ease: 'Expo.easeOut',
            onComplete: () => spark.destroy(),
        });
        // 타격점 파편 4개
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2;
            const frag = scene.add.circle(toX, toY, 4, 0x88ccff, 1)
                .setDepth(9998).setBlendMode(Phaser.BlendModes.ADD);
            scene.tweens.add({
                targets: frag,
                x: toX + Math.cos(angle) * 28,
                y: toY + Math.sin(angle) * 28,
                alpha: 0, duration: 200,
                onComplete: () => frag.destroy(),
            });
        }

        scene.tweens.add({
            targets: [gGlow, gCore], alpha: 0, delay: 160, duration: 120,
            onComplete: () => { gGlow.destroy(); gCore.destroy(); },
        });

        scene.cameras.main.flash(130, 80, 120, 255);
        scene.cameras.main.shake(150, 0.013);

        if (monsterSprite) this._hitReaction(monsterSprite, 0xaaaaff);
    }

    // ⛓ 오버킬 체인 번개 — 몬스터 → 몬스터
    hitChainLightning(fromX, fromY, toX, toY, toSprite) {
        const scene = this.scene;

        try {
            const sfxVol = (scene.registry?.get("sfxVolume") ?? 7) / 10;
            scene.sound.play("sfx_lightning", { volume: sfxVol * 0.6 });
        } catch(e) {}

        const makePts = () => {
            const pts = [{ x: fromX, y: fromY }];
            const SEG = 8;
            for (let i = 1; i < SEG; i++) {
                const t = i / SEG;
                const bx = fromX + (toX - fromX) * t;
                const by = fromY + (toY - fromY) * t;
                const jitter = Math.sin(t * Math.PI) * 22;
                pts.push({ x: bx + Phaser.Math.Between(-jitter, jitter), y: by + Phaser.Math.Between(-5, 5) });
            }
            pts.push({ x: toX, y: toY });
            return pts;
        };

        const drawLine = (g1, g2) => {
            const pts = makePts();
            g1.clear(); g1.lineStyle(9, 0xff5511, 0.55);
            g1.beginPath(); g1.moveTo(pts[0].x, pts[0].y);
            pts.slice(1).forEach(p => g1.lineTo(p.x, p.y)); g1.strokePath();

            g2.clear(); g2.lineStyle(2.5, 0xffddaa, 1.0);
            g2.beginPath(); g2.moveTo(pts[0].x, pts[0].y);
            pts.slice(1).forEach(p => g2.lineTo(p.x, p.y)); g2.strokePath();
        };

        const gGlow = scene.add.graphics().setDepth(9998).setBlendMode(Phaser.BlendModes.ADD);
        const gCore = scene.add.graphics().setDepth(9999).setBlendMode(Phaser.BlendModes.ADD);
        drawLine(gGlow, gCore);
        scene.time.delayedCall(55, () => { if (gCore.active) drawLine(gGlow, gCore); });
        scene.tweens.add({
            targets: [gGlow, gCore], alpha: 0, delay: 110, duration: 90,
            onComplete: () => { gGlow.destroy(); gCore.destroy(); },
        });

        // 출발점 스파크
        const origin = scene.add.circle(fromX, fromY, 7, 0xff6633, 0.9)
            .setDepth(9999).setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({ targets: origin, scale: 2.5, alpha: 0, duration: 160, ease: 'Expo.easeOut', onComplete: () => origin.destroy() });

        // 도착점 임팩트
        const spark = scene.add.circle(toX, toY, 13, 0xff7722, 1)
            .setDepth(9999).setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({ targets: spark, scale: 3.2, alpha: 0, duration: 200, ease: 'Expo.easeOut', onComplete: () => spark.destroy() });

        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2;
            const frag = scene.add.circle(toX, toY, 3, 0xffaa55, 1)
                .setDepth(9998).setBlendMode(Phaser.BlendModes.ADD);
            scene.tweens.add({ targets: frag, x: toX + Math.cos(angle) * 22, y: toY + Math.sin(angle) * 22, alpha: 0, duration: 180, onComplete: () => frag.destroy() });
        }

        scene.cameras.main.shake(90, 0.009);
        if (toSprite) this._hitReaction(toSprite, 0xff9955);
    }

    // 💥 폭발 (AOE) — 콰콰쾅
    hitExplosion(centerX, centerY, monsters) {
        const scene = this.scene;

        try {
            const sfxVol = (scene.registry?.get("sfxVolume") ?? 7) / 10;
            scene.sound.play("sfx_explosion", { volume: sfxVol * 0.95 });
        } catch(e) {}

        // 1. 순간 화이트 플래시 코어
        const flash = scene.add.circle(centerX, centerY, 22, 0xffffff, 1)
            .setDepth(10000).setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({
            targets: flash, scale: 10, alpha: 0, duration: 260, ease: 'Expo.easeOut',
            onComplete: () => flash.destroy(),
        });

        // 2. 메인 폭발 코어 (오렌지)
        const core = scene.add.circle(centerX, centerY, 32, 0xff5500, 1)
            .setDepth(9999).setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({
            targets: core, scale: 6, alpha: 0, duration: 420, ease: 'Cubic.easeOut',
            onComplete: () => core.destroy(),
        });

        // 3. 충격파 링 3개 (순차)
        [[0, 18, 6, 0xffcc44], [80, 12, 4, 0xff8822], [160, 8, 2.5, 0xff4400]].forEach(([delay, r, lw, col]) => {
            scene.time.delayedCall(delay, () => {
                const ring = scene.add.circle(centerX, centerY, r)
                    .setStrokeStyle(lw, col)
                    .setDepth(9997).setBlendMode(Phaser.BlendModes.ADD);
                scene.tweens.add({
                    targets: ring, scale: 9, alpha: 0,
                    duration: 520, ease: 'Expo.easeOut',
                    onComplete: () => ring.destroy(),
                });
            });
        });

        // 4. 파편 22개 방사형
        for (let i = 0; i < 22; i++) {
            const angle = (i / 22) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.1, 0.1);
            const dist = Phaser.Math.FloatBetween(90, 170);
            const size = Phaser.Math.Between(3, 9);
            const colors = [0xffee44, 0xff8800, 0xff4422, 0xffffff, 0xffcc00];
            const dot = scene.add.circle(centerX, centerY, size, colors[i % colors.length], 1)
                .setDepth(9998).setBlendMode(Phaser.BlendModes.ADD);
            scene.tweens.add({
                targets: dot,
                x: centerX + Math.cos(angle) * dist,
                y: centerY + Math.sin(angle) * dist,
                alpha: 0, scale: 0.2,
                duration: Phaser.Math.Between(340, 620),
                ease: 'Quad.easeOut',
                onComplete: () => dot.destroy(),
            });
        }

        // 5. 각 몬스터에 미니 폭발 + 파편
        monsters.forEach((sprite, i) => {
            scene.time.delayedCall(60 + i * 60, () => {
                const sx = sprite.x, sy = sprite.y - 40;

                const mini = scene.add.circle(sx, sy, 12, 0xff7700, 1)
                    .setDepth(9998).setBlendMode(Phaser.BlendModes.ADD);
                scene.tweens.add({
                    targets: mini, scale: 5, alpha: 0, duration: 300, ease: 'Expo.easeOut',
                    onComplete: () => mini.destroy(),
                });

                for (let j = 0; j < 8; j++) {
                    const a = (j / 8) * Math.PI * 2;
                    const d = Phaser.Math.FloatBetween(30, 80);
                    const frag = scene.add.circle(sx, sy, Phaser.Math.Between(2, 6), 0xffaa44, 1)
                        .setDepth(9997).setBlendMode(Phaser.BlendModes.ADD);
                    scene.tweens.add({
                        targets: frag,
                        x: sx + Math.cos(a) * d,
                        y: sy + Math.sin(a) * d,
                        alpha: 0, duration: Phaser.Math.Between(280, 400), ease: 'Quad.easeOut',
                        onComplete: () => frag.destroy(),
                    });
                }
            });

            this._hitReaction(sprite, 0xff8844);
        });

        // 카메라 (강화)
        scene.cameras.main.shake(300, 0.03);
        scene.cameras.main.flash(220, 255, 160, 60);
    }

    // 🔮 orb 날아가기 — 몬스터 → 플레이어 HP or 디버프 아이콘
    throwOrb(fromX, fromY, toX, toY, color = 0xff4444) {
        const scene = this.scene;
        const duration = 260;

        try {
            const sfxVol = (scene.registry?.get("sfxVolume") ?? 7) / 10;
            scene.sound.play("sfx_orb", { volume: sfxVol });
        } catch (e) { }


        const glow = scene.add.circle(fromX, fromY, 12, color, 0.35)
            .setDepth(9998).setBlendMode(Phaser.BlendModes.ADD);
        const orb = scene.add.circle(fromX, fromY, 7, color, 1)
            .setDepth(9999).setBlendMode(Phaser.BlendModes.ADD);

        scene.tweens.add({
            targets: [orb, glow],
            x: toX, y: toY,
            duration,
            ease: 'Quad.easeIn',
            onComplete: () => {
                orb.destroy(); glow.destroy();
                const impact = scene.add.circle(toX, toY, 8, color, 1)
                    .setDepth(9999).setBlendMode(Phaser.BlendModes.ADD);
                scene.tweens.add({
                    targets: impact, scale: 3.5, alpha: 0, duration: 220, ease: 'Expo.easeOut',
                    onComplete: () => impact.destroy(),
                });
            },
        });
    }

    // 🔧 공통 피격 반응
    _hitReaction(monster, color) {
        try {
            monster.setTint(color);
        } catch (ex) { }

        this.scene.tweens.add({
            targets: monster,
            scale: 1.1,
            duration: 80,
            yoyo: true
        });

        this.scene.time.delayedCall(120, () => {
            try {
                monster.clearTint();
            } catch (ex) { }
        });
    }
}
