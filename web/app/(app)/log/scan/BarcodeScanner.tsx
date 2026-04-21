'use client';

// Barcode scanner powered by the native BarcodeDetector API where available
// (iOS 17+ Safari, Chrome, Edge). Falls back to manual entry otherwise — no
// 3rd-party scanner lib, no bundle tax.

import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  onDetected: (code: string) => void;
}

// Minimal typings for the BarcodeDetector API — TS lib doesn't ship them.
type DetectedBarcode = { rawValue: string; format: string };
type BarcodeDetectorClass = new (opts?: { formats?: string[] }) => {
  detect(source: HTMLVideoElement | ImageBitmap): Promise<DetectedBarcode[]>;
};

declare global {
  interface Window { BarcodeDetector?: BarcodeDetectorClass }
}

export function BarcodeScanner({ onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [status, setStatus] = useState<'idle' | 'requesting' | 'scanning' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<InstanceType<BarcodeDetectorClass> | null>(null);
  const loopRef = useRef<number | null>(null);

  useEffect(() => {
    setSupported('BarcodeDetector' in window);
    return () => stopAll();
  }, []);

  const stopAll = useCallback(() => {
    if (loopRef.current != null) {
      cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    setErrorMsg(null);
    setStatus('requesting');
    try {
      if (!('BarcodeDetector' in window)) throw new Error('BarcodeDetector unsupported on this device.');
      const Detector = window.BarcodeDetector!;
      detectorRef.current = new Detector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'],
      });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setStatus('scanning');

      const tick = async () => {
        const det = detectorRef.current;
        const vid = videoRef.current;
        if (!det || !vid || vid.readyState < 2) {
          loopRef.current = requestAnimationFrame(tick);
          return;
        }
        try {
          const results = await det.detect(vid);
          if (results.length > 0) {
            stopAll();
            setStatus('idle');
            onDetected(results[0].rawValue);
            return;
          }
        } catch {
          // Transient decode errors — keep scanning.
        }
        loopRef.current = requestAnimationFrame(tick);
      };
      loopRef.current = requestAnimationFrame(tick);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Camera unavailable';
      setErrorMsg(msg);
      setStatus('error');
      stopAll();
    }
  }, [onDetected, stopAll]);

  const stop = useCallback(() => {
    stopAll();
    setStatus('idle');
  }, [stopAll]);

  if (supported === false) {
    return (
      <p className="text-[13px] text-zinc-500">
        Scanner unsupported on this browser. Enter the barcode manually below.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-zinc-200 bg-black dark:border-zinc-800">
        <video
          ref={videoRef}
          playsInline muted
          className="h-full w-full object-cover"
        />
        {status !== 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center text-[13px] text-zinc-300">
            {status === 'requesting' ? 'Requesting camera…' : 'Camera off'}
          </div>
        )}
        {status === 'scanning' && (
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-[2px] -translate-y-1/2 bg-emerald-400/80" />
        )}
      </div>
      {errorMsg && <p className="text-[13px] text-amber-600">{errorMsg}</p>}
      <div className="grid grid-cols-2 gap-2">
        {status === 'scanning' ? (
          <button
            onClick={stop}
            className="h-10 rounded-xl border border-zinc-200 text-[14px] font-medium dark:border-zinc-800"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={start}
            className="h-10 rounded-xl bg-zinc-900 text-[14px] font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Start camera
          </button>
        )}
        <span className="flex items-center justify-center text-[12px] text-zinc-500">
          {status === 'scanning' ? 'Point at the barcode' : 'or type the code below'}
        </span>
      </div>
    </div>
  );
}
