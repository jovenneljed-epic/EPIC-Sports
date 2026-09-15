import * as faceapi from '@vladmandic/face-api';

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/vladmandic/face-api@master/model/';
const DEFAULT_DISTANCE_THRESHOLD = 0.58;

export type RosterVector = {
  id: string;
  name: string;
  jersey: number;
  descriptor: number[] | Record<string, number>;
};

export interface ScanResult {
  matchedId: string | null;
  isBlinking: boolean;
  currentEAR: number;
  distance?: number;
  debugInfo?: string;
}

class FaceRecognitionEngine {
  private isLoaded = false;
  private loadPromise: Promise<void> | null = null;
  private faceMatcher: faceapi.FaceMatcher | null = null;

  // Baseline calibration per session
  private baselineEAR: number | null = null;
  private calibrationSamples: number[] = [];

  private ssdOptionsEnroll = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.25 });
  private ssdOptionsScan = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.25 });
  private tinyOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.2 });

  resetLivenessBaseline() {
    this.baselineEAR = null;
    this.calibrationSamples = [];
  }

  async loadModels(): Promise<void> {
    if (this.isLoaded) return;

    if (!this.loadPromise) {
      this.loadPromise = Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ])
        .then(() => {
          this.isLoaded = true;
        })
        .catch((err) => {
          this.loadPromise = null;
          throw err;
        });
    }

    return this.loadPromise;
  }

  calculateEAR(eyePoints: faceapi.Point[]): number {
    if (!eyePoints || eyePoints.length < 6) return 0.3;

    const p0 = eyePoints[0];
    const p1 = eyePoints[1];
    const p2 = eyePoints[2];
    const p3 = eyePoints[3];
    const p4 = eyePoints[4];
    const p5 = eyePoints[5];

    const vertical1 = Math.hypot(p1.x - p5.x, p1.y - p5.y);
    const vertical2 = Math.hypot(p2.x - p4.x, p2.y - p4.y);
    const horizontal = Math.hypot(p0.x - p3.x, p0.y - p3.y);

    if (horizontal <= 0) return 0.3;
    const ear = (vertical1 + vertical2) / (2.0 * horizontal);
    return Number.isFinite(ear) ? ear : 0.3;
  }

  private normalizeDescriptor(desc: number[] | Record<string, number> | undefined): Float32Array | null {
    if (!desc) return null;

    let rawValues: number[];
    if (Array.isArray(desc)) {
      rawValues = desc;
    } else if (typeof desc === 'object') {
      rawValues = Object.values(desc);
    } else {
      return null;
    }

    if (rawValues.length === 128) {
      return new Float32Array(rawValues);
    }
    return null;
  }

  async extractDescriptor(input: HTMLImageElement | HTMLVideoElement): Promise<number[] | null> {
    await this.loadModels();

    if (input instanceof HTMLVideoElement) {
      if (input.readyState < 2 || input.videoWidth === 0 || input.videoHeight === 0) {
        return null;
      }
    }

    let detection = await faceapi
      .detectSingleFace(input, this.ssdOptionsEnroll)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      detection = await faceapi
        .detectSingleFace(input, this.tinyOptions)
        .withFaceLandmarks()
        .withFaceDescriptor();
    }

    return detection ? Array.from(detection.descriptor) : null;
  }

  initializeMatcher(roster: RosterVector[], distanceThreshold: number = DEFAULT_DISTANCE_THRESHOLD) {
    const labeledDescriptors: faceapi.LabeledFaceDescriptors[] = [];

    for (const player of roster) {
      const floatVector = this.normalizeDescriptor(player.descriptor);
      if (floatVector) {
        labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(player.id, [floatVector]));
      }
    }

    if (labeledDescriptors.length > 0) {
      this.faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, distanceThreshold);
    } else {
      this.faceMatcher = null;
    }
  }

  async scanLiveFrame(
    video: HTMLVideoElement,
    hasBlinked: boolean
  ): Promise<ScanResult> {
    if (!this.faceMatcher) {
      return { matchedId: null, isBlinking: false, currentEAR: 0, debugInfo: 'No roster vectors loaded' };
    }

    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return { matchedId: null, isBlinking: false, currentEAR: 0, debugInfo: 'Buffering stream...' };
    }

    let detection = await faceapi
      .detectSingleFace(video, this.ssdOptionsScan)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      detection = await faceapi
        .detectSingleFace(video, this.tinyOptions)
        .withFaceLandmarks()
        .withFaceDescriptor();
    }

    if (!detection) {
      return { matchedId: null, isBlinking: false, currentEAR: 0, debugInfo: 'No face detected in box' };
    }

    const leftEye = detection.landmarks.getLeftEye();
    const rightEye = detection.landmarks.getRightEye();
    const avgEAR = (this.calculateEAR(leftEye) + this.calculateEAR(rightEye)) / 2.0;

    // Dynamically calibrate open-eye baseline over first 5 detections
    if (this.calibrationSamples.length < 5) {
      this.calibrationSamples.push(avgEAR);
      if (this.calibrationSamples.length === 5) {
        this.baselineEAR =
          this.calibrationSamples.reduce((a, b) => a + b, 0) / this.calibrationSamples.length;
      }
    }

    // Adaptive threshold: a blink is when EAR drops below 75% of baseline (or an absolute floor of 0.28)
    const dynamicThreshold = this.baselineEAR ? Math.max(this.baselineEAR * 0.75, 0.22) : 0.28;
    const isBlinking = avgEAR < dynamicThreshold;

    if (!hasBlinked && !isBlinking) {
      return {
        matchedId: null,
        isBlinking: false,
        currentEAR: avgEAR,
        debugInfo: `EAR: ${avgEAR.toFixed(2)} (Blink below ${dynamicThreshold.toFixed(2)})`,
      };
    }

    // If currently blinking, register blink event
    if (isBlinking && !hasBlinked) {
      return {
        matchedId: null,
        isBlinking: true,
        currentEAR: avgEAR,
        debugInfo: `Blink Registered! (EAR: ${avgEAR.toFixed(2)})`,
      };
    }

    // Compare biometric vectors
    const bestMatch = this.faceMatcher.findBestMatch(detection.descriptor);
    const isMatched = bestMatch.label !== 'unknown';

    return {
      matchedId: isMatched ? bestMatch.label : null,
      isBlinking,
      currentEAR: avgEAR,
      distance: bestMatch.distance,
      debugInfo: isMatched
        ? `Matched: ${bestMatch.label} (dist: ${bestMatch.distance.toFixed(2)})`
        : `Unknown face (dist: ${bestMatch.distance.toFixed(2)})`,
    };
  }
}

export const faceEngine = new FaceRecognitionEngine();