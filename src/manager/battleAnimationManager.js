import {
  GW, GH, CW, CH, FIELD_CW, FIELD_CH,
  PLAYER_PANEL_W, ITEM_PANEL_W,
  FIELD_Y, HAND_Y, DEAL_DELAY, ANIM_SPEED
} from "../constants.js";
import { TS } from "../textStyles.js";
import { getLang, getHandName } from "../service/langService.js";

/**
 * BattleAnimationManager - 전투 중의 복잡한 애니메이션을 담당
 */
export class BattleAnimationManager {
  constructor(scene) {
    this.scene = scene;
    this.animObjs = [];
    this._isAnimatingDraw = false;
  }

  /**
   * 덱 비주얼 스택 생성
   */
  createDeckStack() {
    const deckX = PLAYER_PANEL_W + 50, deckY = FIELD_Y;
    for (let i = Math.min(8, 51); i >= 0; i--) {
      this.animObjs.push(
        this.scene.add.image(deckX - i * 2, deckY - i * 2, "card_back")
          .setDisplaySize(FIELD_CW, FIELD_CH).setDepth(i)
      );
    }
  }

  /**
   * 카드를 특정 위치로 날려 보내는 기본 애니메이션
   */
  flyCard(cardData, fromX, fromY, toX, toY, options = {}) {
    let cardWidth = (toY === FIELD_Y) ? FIELD_CW : CW;
    let cardHeight = (toY === FIELD_Y) ? FIELD_CH : CH;

    // 약간 축소된 크기로 시작
    cardWidth = cardWidth * 0.85;
    cardHeight = cardHeight * 0.85;

    const startTex = options.immediateFace ? cardData.key : "card_back";
    const img = this.scene.add.image(fromX, fromY, startTex)
      .setDisplaySize(cardWidth, cardHeight).setDepth(200);
    this.animObjs.push(img);
    if (options.immediateFace) {
      this.scene.tweens.add({
        targets: img, x: toX, y: toY, duration: 320, ease: "Power2.Out",
        onComplete: () => options.onComplete?.(img)
      });
      return;
    }

    this.scene.tweens.add({
      targets: img, x: toX, y: toY, duration: 320, ease: "Power2.Out",
      onComplete: () => {
        this.scene.tweens.add({
          targets: img, displayWidth: 1, duration: 70, ease: "Linear",
          onComplete: () => {
            img.setTexture(cardData.key);
            img.setDisplaySize(1, cardHeight);
            this.scene.tweens.add({
              targets: img, displayWidth: cardWidth, duration: 70, ease: "Linear",
              onComplete: () => options.onComplete?.(img)
            });
          },
        });
      },
    });
  }

  /**
   * 핸드로 카드 배분
   */
  dealToHand(startDelay, handData) {
    const handPos = this.scene.calcHandPositions(handData.length);
    const deckX = PLAYER_PANEL_W + 50, deckY = FIELD_Y;
    let delay = startDelay;

    handData.forEach((card, i) => {
      this.scene.time.delayedCall(delay, () => this.flyCard(card, deckX, deckY, handPos[i].x, handPos[i].y));
      delay += DEAL_DELAY;
    });
    return delay;
  }

  /**
   * 필드로 카드 배분
   */
  dealToField(startDelay, fieldData) {
    const deckX = PLAYER_PANEL_W + 50, deckY = FIELD_Y;
    let delay = startDelay;

    fieldData.forEach(card => {
      this.scene.time.delayedCall(delay, () => this.flyCard(card, deckX, deckY, card.slotX, FIELD_Y));
      delay += DEAL_DELAY;
    });
    return delay;
  }

  /**
   * 초기 배분 애니메이션 통합
   */
  startDealAnimation(handData, fieldData, onComplete) {
    this.scene._sfx("sfx_shuffle");
    this.createDeckStack();

    let delay = 300;
    delay = this.dealToHand(delay, handData);
    delay = this.dealToField(delay, fieldData);

    this.scene.time.delayedCall(delay + 550, () => {
      this.clearAnimObjs();
      onComplete?.();
    });
  }

  /**
   * 공격 애니메이션 (점수 카운팅 + orb)
   */
  playAttackAnimation(details, cardFlyInfo, onCardsConsumed, onComplete) {
    const PW = PLAYER_PANEL_W;
    const FAW = GW - PW - ITEM_PANEL_W;
    const cX = PW + FAW / 2;
    const scoreY = 80 + 14; // MONSTER_AREA_TOP = 80

    const tmpObjs = [];
    let currentBase = 0;
    let currentMulti = 0;
    let currentTimes = 1;
    let isMerged = false;
    let currentScore = 0;

    const getScoreStr = () => {
      if (isMerged) return String(Math.floor(currentScore));
      return `${Math.floor(currentBase)} X ${parseFloat(currentMulti.toFixed(1))}`;
    };

    const scoreTxt = this.scene.add.text(cX, scoreY, getScoreStr(), {
      fontFamily: TS.defaultFont,
      fontSize: '30px', color: '#ffdd44',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5, 0).setDepth(400);
    tmpObjs.push(scoreTxt);

    const orbTarget = { x: cX, y: scoreY + 15 };

    const throwLabel = (fromX, fromY, color, label) => {
      const txt = this.scene.add.text(fromX, fromY, label, {
        fontFamily: TS.defaultFont,
        fontSize: '20px', color: '#ffffff',
        stroke: Phaser.Display.Color.IntegerToColor(color).rgba,
        strokeThickness: 5
      }).setOrigin(0.5).setDepth(420);
      tmpObjs.push(txt);

      const cpX = (fromX + orbTarget.x) / 2;
      const cpY = Math.min(fromY, orbTarget.y) - 60;
      const t = { v: 0 };

      this.scene.tweens.add({
        targets: t, v: 1, duration: ANIM_SPEED.orbFlight, ease: 'Sine.easeIn',
        onUpdate: () => {
          const s = t.v, r = 1 - s;
          const x = r * r * fromX + 2 * r * s * cpX + s * s * orbTarget.x;
          const y = r * r * fromY + 2 * r * s * cpY + s * s * orbTarget.y;
          txt.setPosition(x, y);
        },
        onComplete: () => {
          this.scene.tweens.add({
            targets: txt,
            scaleX: 2.5, scaleY: 2.5, alpha: 0,
            duration: ANIM_SPEED.orbFade, ease: 'Sine.easeOut',
          });
        },
      });
    };

    const getCountUpTweenObj = () => {
      this.scene._sfx("sfx_orb");
      this.scene.tweens.killTweensOf(scoreTxt);
      scoreTxt.y = scoreY;
      this.scene.tweens.add({
        targets: scoreTxt, y: scoreY - 12,
        duration: 56, // 140 * 0.4
        yoyo: true, ease: 'Sine.easeOut',
      });
      return { base: currentBase, multi: currentMulti, score: currentScore };
    };

    const countUpBase = (targetBase, duration, onDone) => {
      const tweenObj = getCountUpTweenObj();
      this.scene.tweens.add({
        targets: tweenObj, base: targetBase, duration, ease: 'Circular.In',
        onUpdate: () => { currentBase = tweenObj.base; scoreTxt.setText(getScoreStr()); },
        onComplete: () => { currentBase = targetBase; scoreTxt.setText(getScoreStr()); onDone?.(); },
      });
    };

    const countUpMulti = (targetMulti, duration, onDone) => {
      const tweenObj = getCountUpTweenObj();
      this.scene.tweens.add({
        targets: tweenObj, multi: targetMulti, duration, ease: 'Circular.In',
        onUpdate: () => { currentMulti = tweenObj.multi; scoreTxt.setText(getScoreStr()); },
        onComplete: () => { currentMulti = targetMulti; scoreTxt.setText(getScoreStr()); onDone?.(); },
      });
    };

    // 천/만/십만 단위 돌파 시 펀치 이펙트
    const punchMilestone = () => {
      const cs = scoreTxt.scaleX;
      scoreTxt.setScale(cs * 1.5, cs * 1.5);
      this.scene.tweens.add({
        targets: scoreTxt, scaleX: cs, scaleY: cs,
        duration: 240, ease: 'Back.Out',
      });
      this.scene.cameras.main.shake(170, 0.009);
      const flash = this.scene.add.rectangle(GW / 2, GH / 2, GW, GH, 0xffffff, 0.22).setDepth(500);
      this.scene.tweens.add({
        targets: flash, alpha: 0, duration: 300,
        onComplete: () => flash.destroy(),
      });
      this.scene._sfx("sfx_milestone");
    };

    // 마일스톤 감지 포함 점수 카운트업 (merged 이후 전용)
    const countUpScoreWithMilestone = (targetScore, duration, onDone) => {
      const startVal = currentScore;
      const milestones = [1000, 10000, 100000].filter(m => startVal < m && m <= targetScore);
      const passed = [];
      const triggered = new Set();
      const tweenObj = { v: startVal };

      // 점수가 올라갈 때 슬롯머신처럼 따르륵거리는 효과음 타격 타이머
      const tickTimer = this.scene.time.addEvent({
        delay: 60,
        loop: true,
        callback: () => {
          this.scene.sound.play("sfx_tick", { volume: 0.15 });
        }
      });

      this.scene.tweens.add({
        targets: tweenObj, v: targetScore, duration, ease: 'Power2.Out',
        onUpdate: () => {
          currentScore = tweenObj.v;
          scoreTxt.setText(getScoreStr());
          for (const m of milestones) {
            if (!triggered.has(m) && currentScore >= m) {
              triggered.add(m);
              passed.push(m);
            }
          }
        },
        onComplete: () => {
          tickTimer.remove(); // 종료 시 타이머 제거
          currentScore = targetScore;
          scoreTxt.setText(getScoreStr());

          // 마일스톤이 하나라도 있었다면 순차적으로 터뜨림
          if (passed.length > 0) {
            let idx = 0;
            const playNext = () => {
              if (idx < passed.length) {
                punchMilestone();
                idx++;
                this.scene.time.delayedCall(240, playNext);
              } else {
                // 모두 재생 완료 후 최종 콜백
                onDone?.();
              }
            };
            playNext();
          } else {
            onDone?.();
          }
        },
      });
    };

    const relicPos = (relicId) => {
      const r = this.scene.itemUI?._relicObjs?.[relicId];
      return r ? { x: r.baseCX, y: r.baseCY } : { x: GW - ITEM_PANEL_W / 2, y: 200 };
    };

    const queue = [];

    // 1. Hand Rank Multi
    queue.push(next => {
      this.scene.playerUI?.pulseHandRow(details.handRank);
      if (details.baseHandMulti > 0) {
        const rankRow = this.scene.playerUI?._handConfigRows?.[details.handRank];
        throwLabel(rankRow?.multiTxt?.x ?? PW / 2, rankRow?.multiTxt?.y ?? 400, 0x44eeff, `x${details.baseHandMulti}`);
        this.scene.time.delayedCall(ANIM_SPEED.queueDelay, () => countUpMulti(details.baseHandMulti, ANIM_SPEED.countUp, next));
      } else {
        next();
      }
    });

    // 2. ATK Base
    if (details.atk > 0) {
      queue.push(next => {
        this.scene.playerUI?.pulseAtk();
        const atkText = this.scene.playerUI?.playerAtkTxt;
        throwLabel(atkText ? atkText.x : PW * 0.75, atkText ? atkText.y : 168, 0xff8833, `+${details.atk}`);
        this.scene.time.delayedCall(ANIM_SPEED.queueDelay, () => countUpBase(currentBase + details.atk, ANIM_SPEED.countUp, next));
      });
    }

    const pulseCard = (obj) => {
      if (!obj?.active) return;
      this.scene.tweens.killTweensOf(obj);
      const bx = obj.scaleX, by = obj.scaleY;
      this.scene.tweens.add({
        targets: obj, scaleX: bx * 1.1, scaleY: by * 1.1,
        duration: ANIM_SPEED.pulseCard, yoyo: true, ease: 'Sine.easeInOut',
        onComplete: () => { try { obj.setScale(bx, by); } catch (_) { } },
      });
    };

    // 3. Cards Base + Plus Multi
    cardFlyInfo.forEach((info) => {
      if (info.scoringDetail) {
        const cd = info.scoringDetail;
        queue.push(next => {
          if (info.isFlipped && info.obj?.active) {
            info.obj.setTexture(info.key);
          }
          pulseCard(info.obj);
          throwLabel(info.fromX, info.fromY, 0xffdd44, `+${cd.baseScore}`);
          this.scene.time.delayedCall(ANIM_SPEED.queueDelay, () => countUpBase(currentBase + cd.baseScore, ANIM_SPEED.countUp, next));
        });

        cd.cardRelicDeltas.forEach(({ relicId, type, delta }) => {
          queue.push(next => {
            this.scene.itemUI?.pulseRelic(relicId);
            const rp = relicPos(relicId);
            const isBase = type === 'base';
            const label = isBase ? `+${delta}` : `+${delta}X`;
            throwLabel(rp.x, rp.y, isBase ? 0xcc88ff : 0x44eeff, label);
            this.scene.time.delayedCall(ANIM_SPEED.queueDelay, () => {
              if (isBase) countUpBase(currentBase + delta, ANIM_SPEED.countUp, next);
              else countUpMulti(currentMulti + delta, ANIM_SPEED.countUp, next);
            });
          });
        });
      } else {
        queue.push(next => {
          if (info.isFlipped && info.obj?.active) {
            info.obj.setTexture(info.key);
          }
          pulseCard(info.obj);
          next();
        });
      }
    });

    // 4. Hand Relic DB (base + plus_multi)
    details.handRelicDeltas.forEach(({ relicId, type, delta }) => {
      queue.push(next => {
        this.scene.itemUI?.pulseRelic(relicId);
        const rp = relicPos(relicId);
        const isBase = type === 'base';
        const label = isBase ? `+${delta}` : `+${delta}X`;
        throwLabel(rp.x, rp.y, isBase ? 0xcc88ff : 0x44eeff, label);
        this.scene.time.delayedCall(ANIM_SPEED.queueDelay, () => {
          if (isBase) countUpBase(currentBase + delta, ANIM_SPEED.countUp, next);
          else countUpMulti(currentMulti + delta, ANIM_SPEED.countUp, next);
        });
      });
    });

    // 5. Final Relic Base
    details.finalRelicDeltas.forEach(({ relicId, type, delta }) => {
      if (type !== 'base') return;
      queue.push(next => {
        this.scene.itemUI?.pulseRelic(relicId);
        const rp = relicPos(relicId);
        throwLabel(rp.x, rp.y, 0xee66ff, `+${delta}`);
        this.scene.time.delayedCall(ANIM_SPEED.queueDelay, () => countUpBase(currentBase + delta, ANIM_SPEED.countUp, next));
      });
    });

    // 6. MERGE: multi 사라지고 숫자만 화면 중앙으로 이동 → base → merged 카운트업
    queue.push(next => {
      const mergedScore = Math.floor(currentBase * currentMulti);
      isMerged = true;
      currentScore = currentBase;
      scoreTxt.setText(getScoreStr());

      const destX = GW / 2;
      const destY = GH * 0.36;

      // 족보 이름 텍스트 (scoreTxt 위에 표시)
      const lang = getLang(this.scene);
      const handLabel = getHandName(lang, details.handName);
      const handNameTxt = this.scene.add.text(cX, scoreY - 28, handLabel, {
        fontFamily: TS.defaultFont,
        fontSize: '14px', color: '#aaddff',
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5, 1).setDepth(400);
      tmpObjs.push(handNameTxt);

      this.scene.tweens.killTweensOf(scoreTxt);
      this.scene.tweens.add({
        targets: [scoreTxt, handNameTxt],
        x: destX, y: destY, scaleX: 1.8, scaleY: 1.8,
        duration: 300, ease: 'Back.easeOut',
        onComplete: () => {
          orbTarget.x = destX;
          orbTarget.y = destY + scoreTxt.height * scoreTxt.scaleY * 0.5;
          countUpScoreWithMilestone(mergedScore, 420, next);
        },
      });
    });

    // 7. Final Relic Times Multi
    details.finalRelicDeltas.forEach(({ relicId, type, delta }) => {
      if (type !== 'times_multi') return;
      queue.push(next => {
        this.scene.itemUI?.pulseRelic(relicId);
        const rp = relicPos(relicId);
        throwLabel(rp.x, rp.y, 0xff0044, `x${delta}`);
        this.scene.time.delayedCall(ANIM_SPEED.queueDelay, () => {
          currentTimes += delta;
          const targetScore = Math.floor(currentBase * currentMulti * currentTimes);
          countUpScoreWithMilestone(targetScore, Math.round(ANIM_SPEED.countUp * 1.8), next);
        });
      });
    });

    // 8. 카드 더미로 날리기 (전체 애니메이션 완료 후)
    if (cardFlyInfo.length > 0) {
      queue.push(next => { onCardsConsumed?.(); next(); });
    }

    // 9. End: 최종 펀치 후 페이드
    queue.push(next => {
      //this.scene._sfx("sfx_chop");
      const cs = scoreTxt.scaleX;
      scoreTxt.setScale(cs * 1.25, cs * 1.25);
      this.scene.tweens.add({
        targets: scoreTxt, scaleX: cs, scaleY: cs,
        duration: ANIM_SPEED.mergeScale, ease: 'Back.Out',
        onComplete: () => this.scene.time.delayedCall(Math.round(ANIM_SPEED.mergeDelay * 0.6), next),
      });
    });

    queue.push(next => {
      this.scene.tweens.add({
        targets: tmpObjs, alpha: 0, duration: 180,
        onComplete: () => {
          tmpObjs.forEach(o => { try { o?.destroy(); } catch (_) { } });
          tmpObjs.length = 0;
          next();
        },
      });
    });

    const runNext = () => {
      if (queue.length === 0) { onComplete?.(); return; }
      queue.shift()(runNext);
    };
    runNext();
  }

  animateDraw(cards, handData, onComplete) {
    if (!cards?.length) { onComplete?.(); return; }
    const deckX = PLAYER_PANEL_W + 50;
    const deckY = FIELD_Y;
    const baseLen = handData.length;
    const allPos = this.scene.calcHandPositions(baseLen + cards.length);

    let delay = 0;
    let completed = 0;

    cards.forEach((card, ci) => {
      const pos = allPos[baseLen + ci];
      this.scene.time.delayedCall(delay, () => {
        this.scene._sfx('sfx_slide');
        this.flyCard(card, deckX, deckY, pos?.x ?? GW / 2, HAND_Y, {
          onComplete: (img) => {
            img.destroy();
            handData.push(card);
            this.scene.render();
            completed++;
            if (completed >= cards.length) {
              onComplete?.();
            }
          }
        });
      });
      delay += DEAL_DELAY;
    });
  }

  animateField(fieldCards, onComplete) {
    if (!fieldCards?.length) { onComplete?.(); return; }
    const deckX = PLAYER_PANEL_W + 50, deckY = FIELD_Y;
    let completed = 0;

    fieldCards.forEach((card, i) => {
      this.scene.time.delayedCall(i * DEAL_DELAY, () => {
        this.scene._sfx('sfx_slide');
        this.flyCard(card, deckX, deckY, card.slotX, FIELD_Y, {
          onComplete: (img) => {
            img.destroy();
            completed++;
            if (completed === fieldCards.length) onComplete?.();
          }
        });
      });
    });
  }

  flyToDummy(fromX, fromY, key = "card_back") {
    this.scene._sfx("sfx_fan");
    const img = this.scene.add.image(fromX, fromY, key).setDisplaySize(CW, CH).setDepth(200);
    this.scene.tweens.add({
      targets: img, x: GW - ITEM_PANEL_W - 40, y: FIELD_Y,
      displayWidth: CW * 0.3, displayHeight: CH * 0.3, alpha: 0,
      duration: 380, ease: "Power2.In",
      onComplete: () => img.destroy(),
    });
  }

  clearAnimObjs() {
    this.animObjs.forEach(o => o.destroy());
    this.animObjs = [];
  }
}
