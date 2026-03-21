import Phaser from "phaser";
import { MainMenuScene } from "./scenes/MainMenuScene.js";
import { OptionsScene  } from "./scenes/OptionsScene.js";
import { GameScene     } from "./scenes/GameScene.js";
import { GW, GH } from "./constants.js";
import fontUrl from "./assets/fonts/PressStart2P-Regular.ttf?url";

// PressStart2P 폰트를 브라우저에 등록 후 Phaser 게임 시작
const font = new FontFace("PressStart2P", `url(${fontUrl})`);
font.load().then(loaded => {
  document.fonts.add(loaded);
  new Phaser.Game({
    type:            Phaser.AUTO,
    width:           GW,
    height:          GH,
    backgroundColor: "#0d2b18",
    parent:          "app",
    scale: {
      mode:       Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [MainMenuScene, OptionsScene, GameScene],
  });
});
