const Canvas = require('canvas');
const fs = require('fs');
const path = require('path');

module.exports = function(config) {

  config.fileMode = config.fileMode || 0;
  config.size = config.size || 4;
  config.height = config.height || 24;
  config.width = config.width || config.height * config.size + 8;
  config.color = config.color || 'rgb(0,0,0)';
  config.background = config.background || 'rgb(255,255,255)';
  config.lineWidth = config.lineWidth || 2;
  config.text = config.text || ('' + Math.random()).substr(2, config.size);
  config.noise = (config.noise !== false) ? true : false;
  config.noiseColor = config.noiseColor || config.color;
  config.complexity = config.complexity || 3;
  config.complexity = (config.complexity < 1 || config.complexity > 5) ? 3 : config.complexity;
  config.spacing = config.spacing || 2;
  config.spacing = (config.spacing < 1 || config.spacing > 3) ? 2 : config.spacing;


  return new Promise(function(resolve, reject) {
    const fontSize = Math.round(config.height * 0.5);
    const canvas = new Canvas(config.width, config.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = config.background;
    ctx.fillRect(0, 0, config.width, config.height);
    ctx.fillStyle = config.color;
    ctx.lineWidth = config.lineWidth;
    ctx.font = fontSize + 'px sans';

    if (config.noise) {
      ctx.strokeStyle = config.noiseColor;
      var noiseHeight = config.height * 0.5;
      for (let i = 0; i < 2; i++) {
        ctx.moveTo(20, Math.random() * noiseHeight);
        ctx.bezierCurveTo(80, Math.random() * noiseHeight, 160, Math.random() * noiseHeight, 230, Math.random() * noiseHeight);
        ctx.stroke();
      }
    }
    var modifier = config.complexity / 5;
    ctx.strokeStyle = config.color;
    for (let i = 0; i < config.text.length; i++) {
      ctx.setTransform(Math.random() * modifier + 1 + modifier / 3, Math.random() * modifier + modifier / 3,
        Math.random() * modifier + modifier / 3, Math.random() * modifier + 1 + modifier / 3,
        (config.height * i) / (4 - config.spacing) + (config.height - fontSize) / 3 + 10, config.height - (config.height - fontSize) / 2);
      ctx.fillText(config.text.charAt(i), 0, 0);
    }

    canvas.toDataURL('image/png', function(err, data) {
      return resolve([config.text, data]);
    });

  });
};
