import Phaser from "phaser";
import { MainMenuScene } from "./scenes/MainMenuScene.js";
import { OptionsScene  } from "./scenes/OptionsScene.js";
import { GameScene     } from "./scenes/GameScene.js";
import { GW, GH } from "./constants.js";

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
