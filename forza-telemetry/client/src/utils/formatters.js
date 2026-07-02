export function formatTime(seconds) {
  if (!seconds || seconds === 0) return '--:--.---';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(3).padStart(6, '0')}`;
}

export function formatGear(gear) {
  // FH5 协议: 0 = 空档(N), 1-10 = 1档-10档, 倒车通常用负值或单独字段
  if (gear === undefined || gear === null) return '-';
  if (gear === 0) return 'N';
  if (gear < 0) return 'R';
  return gear.toString();
}

export function formatSpeed(speedMs) {
  if (!speedMs) return 0;
  return speedMs * 3.6;
}

export function formatPower(watts) {
  if (!watts) return 0;
  return watts / 745.7;
}

export function formatTemp(fahrenheit) {
  if (!fahrenheit) return 0;
  return (fahrenheit - 32) * 5 / 9;
}

export function formatPercent(value, max) {
  if (!value || !max) return 0;
  return Math.min(Math.abs(value) / max * 100, 100);
}