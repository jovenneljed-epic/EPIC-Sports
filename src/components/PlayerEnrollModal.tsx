import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, Check, X, RefreshCw } from 'lucide-react';
import { faceEngine } from '../faceRecognition';

interface PlayerEnrollModalProps {
  player: { id: string; name: string; jersey: number; descriptor?: number[] };
  onClose: () => void;
  onEnrollSuccess: (playerId: string, descriptor: number[]) => void;
}

export const PlayerEnrollModal: React.FC<PlayerEnrollModalProps> = ({
  player,
  onClose,
  onEnrollSuccess,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [status, setStatus] = useState<string>('Ready to enroll headshot.');
  const [isProcessing, setIsProcessing] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const startCamera = async () => {
    try {
      setStatus('Starting webcam feed...');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);
        setStatus('Camera active! Center your face in the box and capture.');
      }
    } catch (err: unknown) {
      console.error('Camera initialization error:', err);
      setStatus('Failed to access camera. Ensure permissions are granted.');
    }
  };

  const handleCaptureAndExtract = async () => {
    if (!videoRef.current || videoRef.current.videoWidth === 0) {
      setStatus('Camera feed is still buffering. Please wait a second.');
      return;
    }

    setIsProcessing(true);
    setStatus('Analyzing facial landmarks and creating 128-d vector...');

    try {
      const vector = await faceEngine.extractDescriptor(videoRef.current);

      if (vector && vector.length === 128) {
        setStatus('Biometrics saved successfully!');
        stopCamera();
        onEnrollSuccess(player.id, vector);
        setTimeout(onClose, 800);
      } else {
        setStatus('No clear face detected. Face the camera directly in good lighting.');
      }
    } catch (err) {
      console.error(err);
      setStatus('Extraction failed. Check model network connection.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-white">Enroll Player Biometrics</h3>
            <p className="text-xs text-amber-400 font-mono">#{player.jersey} {player.name}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-white cursor-pointer transition p-1"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport with Face Reticle */}
        <div className="relative aspect-4/3 w-full bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center">
          {/* Keep video element rendered in the DOM from the start */}
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className={`w-full h-full object-cover transform scale-x-[-1] ${isCameraActive ? 'block' : 'hidden'}`}
          />

          {isCameraActive && (
            <div className="absolute inset-0 border-2 border-dashed border-amber-400/40 m-8 rounded-3xl pointer-events-none flex items-center justify-center">
              <div className="w-full h-0.5 bg-amber-400/20 animate-pulse" />
            </div>
          )}

          {!isCameraActive && (
            <div className="text-center p-6 space-y-2">
              <Camera className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-400">Click below to activate webcam</p>
            </div>
          )}
        </div>

        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-center text-slate-300">
          {status}
        </div>

        <div className="flex gap-2">
          {!isCameraActive ? (
            <button
              type="button"
              onClick={startCamera}
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
            >
              Start Camera
            </button>
          ) : (
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleCaptureAndExtract}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2"
            >
              {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Capture & Save Fingerprint
            </button>
          )}
        </div>
      </div>
    </div>
  );
};