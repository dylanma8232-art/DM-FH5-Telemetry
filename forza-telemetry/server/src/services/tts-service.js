class TtsService {
  constructor() {
    this.cache = new Map();
  }

  async formatAnnounce(text) {
    return {
      text: text,
      localAnnounce: true,
      audioUrl: null // 设为 null 告知前端使用本地 SpeechSynthesis
    };
  }
}

export const ttsService = new TtsService();
