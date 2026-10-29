import test from 'node:test';
import assert from 'node:assert/strict';

// speechQueue 依赖浏览器 speechSynthesis / localStorage，测试内注入桩环境。
class FakeSpeechSynthesis {
  constructor() {
    this.spoken = [];
    this.cancelCount = 0;
  }
  getVoices() { return [{ name: 'zh-CN-1', lang: 'zh-CN' }]; }
  speak(u) { this.spoken.push(u); }
  cancel() { this.cancelCount++; }
  resume() {}
}

function setupEnv() {
  const fake = new FakeSpeechSynthesis();
  globalThis.window = {
    speechSynthesis: fake,
    _activeUtterances: new Set(),
  };
  // speechQueue 直接引用全局 SpeechSynthesisUtterance，注入测试桩
  globalThis.SpeechSynthesisUtterance = class SpeechSynthesisUtterance {
    constructor(text) { this.text = text; }
  };
  globalThis.localStorage = {
    _d: {},
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = v; },
  };
  return fake;
}

async function loadManager() {
  const mod = await import('../src/utils/speechQueue.js');
  // 单例跨测试残留状态，先复位
  mod.speechManager.queue = [];
  mod.speechManager.speechEnabled = true;
  mod.speechManager.lastSpokenText = '';
  mod.speechManager.lastSpokenTime = 0;
  if (mod.speechManager.safeguardTimer) {
    clearTimeout(mod.speechManager.safeguardTimer);
    mod.speechManager.safeguardTimer = null;
  }
  // 手动复位，不经 cancelCurrent（避免向测试桩多计一次 cancel）
  mod.speechManager.isPlaying = false;
  mod.speechManager.currentPriority = 0;
  mod.speechManager.currentUtterance = null;
  return mod;
}

test('空闲时播报立即送入语音引擎', async () => {
  const fake = setupEnv();
  const { speechManager } = await loadManager();
  const ok = speechManager.speak('左3', 2);
  assert.equal(ok, true);
  assert.equal(fake.spoken.length, 1);
  assert.equal(fake.spoken[0].text, '左3');
});

test('语音忙碌时同优先级新句入队而非被丢弃，上一句播完后串行接续', async () => {
  const fake = setupEnv();
  const { speechManager } = await loadManager();
  speechManager.speak('左3', 2);
  assert.equal(fake.spoken.length, 1);
  // 正在播报时来的第二句：入队，不吞掉也不立即打断
  const ok = speechManager.speak('接右4', 2);
  assert.equal(ok, true);
  assert.equal(fake.spoken.length, 1);
  assert.equal(speechManager.queue.length, 1);
  // 第一句播完 → 队列接续
  fake.spoken[0].onend();
  assert.equal(fake.spoken.length, 2);
  assert.equal(fake.spoken[1].text, '接右4');
});

test('极高优先级可打断当前播报并清空队列', async () => {
  const fake = setupEnv();
  const { speechManager } = await loadManager();
  speechManager.speak('左3', 2);
  speechManager.speak('接右4', 2);
  speechManager.speak('接左2', 2);
  assert.equal(speechManager.queue.length, 2);
  speechManager.speak('刹车锁死收油', 3);
  assert.equal(fake.cancelCount, 1);
  assert.equal(speechManager.queue.length, 0);
  // 插播有 50ms 音频通道释放延迟，等它真正送入语音引擎
  await new Promise(r => setTimeout(r, 80));
  assert.equal(fake.spoken.length, 2);
  assert.equal(fake.spoken[1].text, '刹车锁死收油');
  // 收尾：触发插播句结束回调，避免 5 秒保底定时器悬挂
  fake.spoken[1].onend();
});

test('相同文本 1.5 秒内被防刷拦截', async () => {
  const fake = setupEnv();
  const { speechManager } = await loadManager();
  speechManager.speak('严重打滑', 3);
  fake.spoken[0].onend(); // 立即播完释放
  const ok = speechManager.speak('严重打滑', 3);
  assert.equal(ok, false);
  assert.equal(fake.spoken.length, 1);
});

test('队列满时丢弃最旧排队句、保留最新', async () => {
  const fake = setupEnv();
  const { speechManager } = await loadManager();
  speechManager.speak('第一句', 2); // 立即播报
  speechManager.speak('第二句', 2);
  speechManager.speak('第三句', 2);
  speechManager.speak('第四句', 2);
  speechManager.speak('第五句', 2); // 队列已满(3)，丢弃最旧的“第二句”
  const texts = speechManager.queue.map(q => q.text);
  assert.deepEqual(texts, ['第三句', '第四句', '第五句']);
});

test('禁用语音时清空队列且不再播报', async () => {
  const fake = setupEnv();
  const { speechManager } = await loadManager();
  speechManager.speak('第一句', 2);
  speechManager.speak('第二句', 2);
  speechManager.setSpeechEnabled(false);
  assert.equal(speechManager.queue.length, 0);
  assert.equal(speechManager.speak('第三句', 2), false);
});
