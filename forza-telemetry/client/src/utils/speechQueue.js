class SpeechQueueManager {
  constructor() {
    this.isPlaying = false;
    this.currentPriority = 0; // 0为闲置，数值越大优先级越高
    this.currentUtterance = null;
    this.speechEnabled = true;

    // 缓存最近播报过的信息，防止短时间内（如1.5秒内）高频重复播报相同的一句话
    this.lastSpokenText = '';
    this.lastSpokenTime = 0;
  }

  /**
   * 触发语音播报
   * @param {string} text 要播报的文本内容
   * @param {number} priority 优先级。3: 极高 (刹车锁死/严重打滑收油)；2: 中 (路书弯道)；1: 低 (普通预警)
   * @param {object} options 语速/音量微调
   */
  speak(text, priority = 1, options = {}) {
    if (!this.speechEnabled || !window.speechSynthesis) return;

    const now = Date.now();

    // 防刷策略：相同文本在 1.5 秒内只能播报一次，避免如“严重打滑”在1秒内连续复读5遍
    if (text === this.lastSpokenText && (now - this.lastSpokenTime < 1500)) {
      return;
    }

    // 优先级冲突处理
    if (this.isPlaying) {
      if (priority > this.currentPriority) {
        // 新播报优先级更高：立即强行中断当前正在播报的低级内容，插播高级警告！
        this.cancelCurrent();
      } else {
        // 新播报优先级较低或相同：直接丢弃（赛车竞速瞬息万变，延迟播报旧信息已无意义，坚决不积压队列）
        return;
      }
    }

    this.isPlaying = true;
    this.currentPriority = priority;
    this.lastSpokenText = text;
    this.lastSpokenTime = now;

    const utterance = new SpeechSynthesisUtterance(text);
    // 强引用挂载到全局，防垃圾回收导致 onend 丢失
    if (!window._activeUtterances) window._activeUtterances = new Set();
    window._activeUtterances.add(utterance);

    // 竞速场景下语速适中，确保咬字清晰可辨 (默认 0.9，比正常略慢)
    utterance.rate = options.rate || 0.9; 
    utterance.volume = options.volume || 1.0;
    utterance.pitch = options.pitch || 1.0;

    // 绑定中文语音库
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('CHN'));
    if (zhVoice) {
      utterance.voice = zhVoice;
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
    };

    utterance.onend = cleanUp;
    utterance.onerror = cleanUp;

    // 5秒强行超时自愈，防止语音引擎底层死锁
    if (this.safeguardTimer) clearTimeout(this.safeguardTimer);
    this.safeguardTimer = setTimeout(() => {
      console.warn('[Speech] 语音播报触发保底超时自愈');
      cleanUp();
    }, 5000);

    this.currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  /**
   * 中断当前正在播报的语音
   */
  cancelCurrent() {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      this.isPlaying = false;
      this.currentPriority = 0;
      if (this.currentUtterance && window._activeUtterances) {
        window._activeUtterances.delete(this.currentUtterance);
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
      this.cancelCurrent();
    }
  }
}

export const speechManager = new SpeechQueueManager();
