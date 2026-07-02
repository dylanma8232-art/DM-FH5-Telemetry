// 生成PWA图标脚本 (Node.js)
const fs = require('fs');
const { createCanvas } = require('canvas');

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // 背景
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, size, size);

  // 圆角
  const r = size * 0.18;
  ctx.fillStyle = '#161b22';
  ctx.beginPath();
  ctx.roundRect(size * 0.1, size * 0.1, size * 0.8, size * 0.8, r);
  ctx.fill();

  // 边框
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = size * 0.015;
  ctx.beginPath();
  ctx.roundRect(size * 0.1, size * 0.1, size * 0.8, size * 0.8, r);
  ctx.stroke();

  // 速度表弧线
  ctx.strokeStyle = '#58a6ff';
  ctx.lineWidth = size * 0.04;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.28, Math.PI * 0.8, Math.PI * 2.2);
  ctx.stroke();

  // 中心文字 FH5
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${size * 0.22}px "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FH5', size / 2, size / 2);

  // 底部小字
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `${size * 0.06}px "Segoe UI", sans-serif`;
  ctx.fillText('TELEMETRY', size / 2, size * 0.78);

  return canvas.toBuffer('image/png');
}

fs.writeFileSync(__dirname + '/icon-192.png', generateIcon(192));
fs.writeFileSync(__dirname + '/icon-512.png', generateIcon(512));
console.log('Icons generated successfully');
