export interface GameMap {
  id: string;
  name: string;
  blurb: string;
  playable: boolean;
  sky: [string, string];
  far: string; mid: string; ground: string; groundTop: string; trunk: string; leaf: [string, string, string];
}

// Add a map here (and a draw theme in game/render.ts if it needs new scenery) to make it selectable everywhere.
export const MAPS: GameMap[] = [
  { id: 'forest', name: 'Whimsy Forest', blurb: 'Rolling hills, giant boulders and chatty flowers.', playable: true,
    sky: ['#8fd3ff', '#e6f7ff'], far: '#a5d8a0', mid: '#6cbf6a', ground: '#4a9a4e', groundTop: '#7ed957', trunk: '#8a5a3c', leaf: ['#2f9e44', '#40c057', '#69db7c'] },
  { id: 'dunes', name: 'Candy Dunes', blurb: 'Sticky sweet sand. Coming soon.', playable: false,
    sky: ['#ffd6e7', '#fff3e0'], far: '#ffc9a8', mid: '#ffae80', ground: '#f08a5d', groundTop: '#ffd29c', trunk: '#b5651d', leaf: ['#ff6fa5', '#ff9ec4', '#ffc2da'] },
  { id: 'peaks', name: 'Frosty Peaks', blurb: 'Slippery slopes. Coming soon.', playable: false,
    sky: ['#b8d8ff', '#f2f8ff'], far: '#c9d9ee', mid: '#a9c0de', ground: '#8fa7c9', groundTop: '#ffffff', trunk: '#6b5b4b', leaf: ['#3b7d9a', '#5aa5c4', '#8ed0e8'] },
];
export const mapById = (id: string) => MAPS.find(m => m.id === id) ?? MAPS[0];
