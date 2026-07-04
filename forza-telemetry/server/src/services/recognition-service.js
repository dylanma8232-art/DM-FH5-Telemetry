import { recognizeTrack as coreRecognizeTrack } from '../track-builder.js';

class RecognitionService {
  constructor() {
    this.lastMatchResult = null;
    this.recognitionTimer = null;
  }

  match(currentTrajectory, trackDatabase) {
    if (!currentTrajectory || currentTrajectory.length < 20) return [];
    return coreRecognizeTrack(currentTrajectory, trackDatabase);
  }
}

export const recognitionService = new RecognitionService();
