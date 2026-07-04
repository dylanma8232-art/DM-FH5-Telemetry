export function formatTime(seconds) {
  if (!seconds || seconds === 0) return '--:--.---';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(3).padStart(6, '0')}`;
}

export function formatGear(gear) {
  // 极限竞速地平线5协议：0为倒档(R)，1为空档(N)，2为1档...
  if (gear === undefined || gear === null) return '-';
  if (gear === 0) return 'R';
  if (gear === 1) return 'N';
  if (gear === 11 || gear === 255 || gear < 0) return 'R';
  return (gear - 1).toString();
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