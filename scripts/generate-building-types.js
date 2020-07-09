const { writeFile } = require('fs');

const { from } = require('node-vibrant');
const { resolve } = require('path');

const { Buildings } = require('../assets/anno-designer-presets/presets.json');

function img(path) {
  return resolve(__dirname, '../assets/anno-designer-presets/icons', path);
}

const output = resolve(__dirname, '../assets', 'building-types.json');

Promise.all(
  Buildings
    .map(({
      Header: header,
      Identifier: id,
      Localization: { eng: name },
      IconFileName: icon,
      BuildBlocker: { x, z },
    }) => ({ header, id, name, icon, x, z }))
    .filter(({ header, id }) => /\(a7\)/i.test(header) && !/ornament|1x1|2x2|3x3/i.test(id))
    .map(({ name, icon, x, z }, i) => from(img(icon)).getPalette().then(({ Vibrant, LightVibrant, DarkVibrant }) => {
      const colour = [Vibrant, LightVibrant, DarkVibrant].filter(c => c.getPopulation());
      return {
        id: i,
        name,
        icon,
        colour: colour.length ? colour[0].getHex() : '#ffffff',
        w: Math.max(x, z),
        h: Math.min(x, z),
      };
    })),
).then(types => writeFile(output, JSON.stringify(types), () => console.log(`Building Types generated at ${output}`)));
