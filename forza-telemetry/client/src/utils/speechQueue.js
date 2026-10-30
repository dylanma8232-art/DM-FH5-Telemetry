// 播报优先级常量：
// 3: 极高 (刹车锁死/严重打滑收油) —— 可打断一切并清空队列
// 2: 中 (路书弯道) —— 串行排队，不打断已播内容
// 1: 低 (普通预警) —— 串行排队
export const SPEECH_PRIORITY_CRITICAL = 3;
export const SPEECH_PRIORITY_TURN = 2;
export const SPEECH_PRIORITY_LOW = 1;

// 队列容量上限：超过后丢弃最旧的低优先级句子，防止竞速场景积压过期信息
const QUEUE_MAX_LENGTH = 3;

class SpeechQueueManager {
  constructor() {
    this.isPlaying = false;
    this.currentPriority = 0; // 0为闲置，数值越大优先级越高
    this.currentUtterance = null;
    this.speechEnabled = true;
    this.queue = []; // 待播报队列：{ text, priority, options }

    // 缓存最近播报过的信息，防止短时间内（如1.5秒内）高频重复播报相同的一句话
    this.lastSpokenText = '';
    this.lastSpokenTime = 0;
  }

  /**
   * 触发语音播报（队列版）
   * 规则：
   * - 极高优先级（3）：立即打断当前播报并清空队列，插播；
   * - 其他优先级：若当前空闲则立即播；若正忙则进入队列串行播完，新句不吞旧句；
   *   仅当队列已满时按「丢弃队首最旧项」腾位，保证信息不过度积压。
   * @param {string} text 要播报的文本内容
   * @param {number} priority 优先级
   * @param {object} options 语速/音量微调
   * @returns {boolean} 是否已被接受（立即播报或入队）
   */
  speak(text, priority = SPEECH_PRIORITY_LOW, options = {}) {
    if (!this.speechEnabled || !window.speechSynthesis) return false;

    const now = Date.now();

    // 防刷策略：相同文本在 1.5 秒内只能播报一次，避免如“严重打滑”在1秒内连续复读5遍
    if (text === this.lastSpokenText && (now - this.lastSpokenTime < 1500)) {
      return false;
    }

    // 极高优先级：打断一切、清空队列、立即插播
    if (priority >= SPEECH_PRIORITY_CRITICAL && this.isPlaying) {
      this.queue = [];
      this.cancelCurrent();
      return this._enqueueOrSpeak(text, priority, options, 50);
    }

    if (this.isPlaying) {
      // 正在播报非极高优先级内容：新句排队，串行播完（新句不吞旧句）
      // 队列去重：同文本已在队列中则不再重复入队
      if (this.queue.some(item => item.text === text)) {
        return true;
      }
      while (this.queue.length >= QUEUE_MAX_LENGTH) {
        // 丢掉队首最旧的排队句，保证最新信息能进入
        this.queue.shift();
      }
      this.queue.push({ text, priority, options });
      this.lastSpokenText = text;
      this.lastSpokenTime = now;
      return true;
    }

    return this._enqueueOrSpeak(text, priority, options, 0);
  }

  _enqueueOrSpeak(text, priority, options, delay) {
    this.isPlaying = true;
    this.currentPriority = priority;
    this.lastSpokenText = text;
    this.lastSpokenTime = Date.now();

    const utterance = new SpeechSynthesisUtterance(text);
    // 强引用挂载到全局，防垃圾回收导致 onend 丢失
    if (!window._activeUtterances) window._activeUtterances = new Set();
    window._activeUtterances.add(utterance);

    // 读取用户 TTS 设置（语速、选择的语音名称）
    let userRate = 0.9;
    let userVoiceName = '';
    try {
      const saved = localStorage.getItem('fh5-telemetry-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.tts?.rate) userRate = parsed.tts.rate;
        if (parsed?.tts?.voiceName) userVoiceName = parsed.tts.voiceName;
      }
    } catch {}

    utterance.rate = options.rate || userRate;
    utterance.volume = options.volume || 1.0;
    utterance.pitch = options.pitch || 1.0;

    // 按用户选择的语音名称精确匹配，找不到则降级到第一个中文语音
    const voices = window.speechSynthesis.getVoices();
    let selectedVoice = null;
    if (userVoiceName) {
      selectedVoice = voices.find(v => v.name === userVoiceName);
    }
    if (!selectedVoice) {
      selectedVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('CHN'));
    }
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    const cleanUp = () => {
      this.isPlaying = false;
      this.currentPriority = 0;
      this.currentUtterance = null;
      if (window._activeUtterances) {
        window._activeUtterances.delete(utterance);
      }
      if (this.safeguardTimer) {
        clearTimeout(this.safeguardTimer);
        this.safeguardTimer = null;
      }
      this._playNext();
    };

    utterance.onend = cleanUp;
    utterance.onerror = cleanUp;

    // 5秒强行超时自愈，防止语音引擎底层死锁
    if (this.safeguardTimer) clearTimeout(this.safeguardTimer);
    this.safeguardTimer = setTimeout(() => {
      console.warn('[Speech] 语音播报触发保底超时自愈');
      try {
        if (window.speechSynthesis) {
          window.speechSynthesis.resume();
          window.speechSynthesis.cancel();
        }
      } catch (_) {}
      cleanUp();
    }, 5000);

    this.currentUtterance = utterance;

    if (delay > 0) {
      this._delayTimer = setTimeout(() => {
        this._delayTimer = null;
        if (this.currentUtterance === utterance) {
          window.speechSynthesis.speak(utterance);
        }
      }, delay);
    } else {
      window.speechSynthesis.speak(utterance);
    }
    return true;
  }

  /**
   * 播放队列中的下一条（由上一条的 onend/onerror/超时自愈触发）
   */
  _playNext() {
    if (this.isPlaying || this.queue.length === 0) return;
    const next = this.queue.shift();
    // 直接走 _enqueueOrSpeak：队列接续不是新句子，不应用 1.5 秒防刷拦截
    // （入队时已记录过 lastSpokenText，重走 speak 会被防刷误吞）。
    this._enqueueOrSpeak(next.text, next.priority, next.options, 0);
  }

  /**
   * 中断当前正在播报的语音
   */
  cancelCurrent() {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      this.isPlaying = false;
      this.currentPriority = 0;
      if (window._activeUtterances) {
        window._activeUtterances.clear();
      }
      if (this._delayTimer) {
        clearTimeout(this._delayTimer);
        this._delayTimer = null;
      }
      this.currentUtterance = null;
      if (this.safeguardTimer) {
        clearTimeout(this.safeguardTimer);
        this.safeguardTimer = null;
      }
    }
  }

  setSpeechEnabled(enabled) {
    this.speechEnabled = enabled;
    if (!enabled) {
      this.queue = [];
      this.cancelCurrent();
    }
  }
}

export const speechManager = new SpeechQueueManager();
