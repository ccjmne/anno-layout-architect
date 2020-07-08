const { writeFile } = require('fs');

const { from } = require('node-vibrant');
const { resolve } = require('path');

const { Buildings } = require('../assets/anno-designer-presets/presets.json');

function img(path) {
  return resolve(__dirname, '../assets/anno-designer-presets/icons', path);
}

const output = resolve(__dirname, '../assets', 'building-types.json');

Promise.all(
  Buildings.filter(({ Header }) => /\(a7\)/i.test(Header))
    .map(({
      Identifier: id,
      Localization: { eng: name },
      IconFileName: icon,
      BuildBlocker: { x, z },
    }) => from(img(icon)).getPalette().then(({ Vibrant, LightVibrant, DarkVibrant }) => {
      const colour = [Vibrant, LightVibrant, DarkVibrant].filter(c => c.getPopulation());
      return {
        id: id.replace(/[^\d\w]+/g, '-').toLowerCase(),
        name,
        icon,
        colour: colour.length ? colour[0].getHex() : '#ffffff',
        w: Math.max(x, z),
        h: Math.min(x, z),
      };
    })),
).then(types => writeFile(output, JSON.stringify(types), () => console.log(`Building Types generated at ${output}`)));
