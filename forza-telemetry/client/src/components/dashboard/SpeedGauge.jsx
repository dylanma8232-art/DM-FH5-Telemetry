import React from 'react';

function polarToCartesian(cx, cy, r, angleDeg) {
  const angleRad = (angleDeg - 90) * Math.PI / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad)
  };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return 'M ' + start.x + ' ' + start.y + ' A ' + r + ' ' + r + ' 0 ' + largeArcFlag + ' 0 ' + end.x + ' ' + end.y;
}

export function SpeedGauge({ speed = 0, maxSpeed = 350 }) {
  const startAngle = -135;
  const endAngle = 135;
  const totalAngle = endAngle - startAngle;
  const currentAngle = startAngle + (Math.min(speed, maxSpeed) / maxSpeed) * totalAngle;
  
  const cx = 100;
  const cy = 100;
  const r = 80;
  
  const ticks = [];
  for (let i = 0; i <= 7; i++) {
    const tickAngle = startAngle + (i / 7) * totalAngle;
    const value = Math.round((i / 7) * maxSpeed);
    const outer = polarToCartesian(cx, cy, r + 5, tickAngle);
    const inner = polarToCartesian(cx, cy, r - 8, tickAngle);
    const labelPos = polarToCartesian(cx, cy, r - 18, tickAngle);
    ticks.push({ outer, inner, labelPos, value, angle: tickAngle });
  }
  
  const needleEnd = polarToCartesian(cx, cy, r - 15, currentAngle);
  
  let color = 'var(--success)';
  if (speed > maxSpeed * 0.8) color = 'var(--danger)';
  else if (speed > maxSpeed * 0.6) color = 'var(--warning)';
  
  return (
    <svg viewBox="0 0 200 200" style={{ width: '100%', maxWidth: 200, margin: '0 auto', display: 'block' }}>
      <defs>
        <linearGradient id="speedGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--success)" />
          <stop offset="60%" stopColor="var(--warning)" />
          <stop offset="100%" stopColor="var(--danger)" />
        </linearGradient>
      </defs>
      
      <path 
        d={describeArc(cx, cy, r, startAngle, endAngle)} 
        stroke="var(--bg-tertiary)" 
        strokeWidth="8" 
        fill="none" 
        strokeLinecap="round"
      />
      
      <path 
        d={describeArc(cx, cy, r, startAngle, currentAngle)} 
        stroke={color}
        strokeWidth="8" 
        fill="none" 
        strokeLinecap="round"
        style={{ transition: 'all 0.1s linear' }}
      />
      
      {ticks.map((tick, i) => (
        <g key={i}>
          <line 
            x1={tick.outer.x} 
            y1={tick.outer.y} 
            x2={tick.inner.x} 
            y2={tick.inner.y} 
            stroke="var(--text-muted)" 
            strokeWidth="1.5" 
          />
          <text 
            x={tick.labelPos.x} 
            y={tick.labelPos.y} 
            textAnchor="middle" 
            dominantBaseline="middle"
            style={{ fontSize: 9, fill: 'var(--text-muted)' }}
          >
            {tick.value}
          </text>
        </g>
      ))}
      
      <line 
        x1={cx} 
        y1={cy} 
        x2={needleEnd.x} 
        y2={needleEnd.y} 
        stroke={color}
        strokeWidth="3" 
        strokeLinecap="round"
        style={{ transition: 'all 0.1s linear' }}
      />
      
      <circle cx={cx} cy={cy} r="5" fill={color} />
      
      <text 
        x={cx} 
        y={cy + 30} 
        textAnchor="middle" 
        style={{ fontSize: 36, fontWeight: 800, fill: 'var(--text-primary)', fontFamily: 'monospace' }}
      >
        {Math.round(speed)}
      </text>
      <text 
        x={cx} 
        y={cy + 45} 
        textAnchor="middle" 
        style={{ fontSize: 10, fill: 'var(--text-muted)' }}
      >
        km/h
      </text>
    </svg>
  );
}

export function RPMGauge({ rpm = 0, maxRpm = 8000 }) {
  const startAngle = -135;
  const endAngle = 135;
  const totalAngle = endAngle - startAngle;
  const currentAngle = startAngle + (Math.min(rpm, maxRpm) / maxRpm) * totalAngle;
  
  const cx = 80;
  const cy = 80;
  const r = 60;
  
  const needleEnd = polarToCartesian(cx, cy, r - 10, currentAngle);
  
  let color = 'var(--success)';
  if (rpm > maxRpm * 0.9) color = 'var(--danger)';
  else if (rpm > maxRpm * 0.7) color = 'var(--warning)';
  
  const redZoneStart = startAngle + 0.9 * totalAngle;
  
  return (
    <svg viewBox="0 0 160 120" style={{ width: '100%', maxWidth: 160, margin: '0 auto', display: 'block' }}>
      <path 
        d={describeArc(cx, cy, r, startAngle, endAngle)} 
        stroke="var(--bg-tertiary)" 
        strokeWidth="6" 
        fill="none" 
        strokeLinecap="round"
      />
      
      <path 
        d={describeArc(cx, cy, r, startAngle, currentAngle)} 
        stroke={color}
        strokeWidth="6" 
        fill="none" 
        strokeLinecap="round"
        style={{ transition: 'all 0.1s linear' }}
      />
      
      <path 
        d={describeArc(cx, cy, r, redZoneStart, endAngle)} 
        stroke="var(--danger)" 
        strokeWidth="6" 
        fill="none" 
        strokeLinecap="round"
        opacity="0.3"
      />
      
      <line 
        x1={cx} 
        y1={cy} 
        x2={needleEnd.x} 
        y2={needleEnd.y} 
        stroke={color}
        strokeWidth="2" 
        strokeLinecap="round"
        style={{ transition: 'all 0.1s linear' }}
      />
      
      <circle cx={cx} cy={cy} r="4" fill={color} />
      
      <text 
        x={cx} 
        y={cy + 25} 
        textAnchor="middle" 
        style={{ fontSize: 22, fontWeight: 700, fill: 'var(--text-primary)', fontFamily: 'monospace' }}
      >
        {Math.round(rpm)}
      </text>
      <text 
        x={cx} 
        y={cy + 37} 
        textAnchor="middle" 
        style={{ fontSize: 8, fill: 'var(--text-muted)' }}
      >
        RPM
      </text>
    </svg>
  );
}