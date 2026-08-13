"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createOrbScene, type OrbSceneApi } from "@/lib/orbScene";
import { HandTracker, type TrackerStatus } from "@/lib/handTracker";

type CameraState = "off" | "starting" | "on" | "error";

const MODE_LABEL: Record<TrackerStatus["mode"], string> = {
  idle: "STANDBY",
  spin: "SPIN",
  zoom: "ZOOM",
};

export default function JarvisOrb() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
const screenStreamRef = useRef<MediaStream | null>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OrbSceneApi | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);

  const [camera, setCamera] = useState<CameraState>("off");
const [status, setStatus] = useState<TrackerStatus>({ hands: 0, mode: "idle" });
const [error, setError] = useState<string | null>(null);
const [listening, setListening] = useState(false);
const [sharingScreen, setSharingScreen] = useState(false);

const recognitionRef = useRef<any>(null);

const speak = useCallback((text: string) => {
  console.log("SPEAK CALLED", text);

  const synth = window.speechSynthesis;

  const startSpeak = () => {
    const voice = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();

    if (voices.length > 0) {
      voice.voice = voices[0];
    }

    voice.rate = 1;
    voice.pitch = 0.8;
    voice.volume = 1;

    voice.onstart = () => console.log("VOICE STARTED");
    voice.onend = () => console.log("VOICE FINISHED");
    voice.onerror = (e) => console.log("VOICE ERROR", e);

    synth.speak(voice);
  };

  if (synth.getVoices().length === 0) {
    synth.onvoiceschanged = startSpeak;
  } else {
    startSpeak();
  }

}, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scene = createOrbScene(container);
    sceneRef.current = scene;
    return () => {
      trackerRef.current?.stop();
      trackerRef.current = null;
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  const stopGestures = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    setCamera("off");
    setStatus({ hands: 0, mode: "idle" });
  }, []);

  const startGestures = useCallback(async () => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay || trackerRef.current) return;

    setCamera("starting");
    setError(null);

    const tracker = new HandTracker(video, overlay, {
      onRotate: (dt, dp) => sceneRef.current?.rotateBy(dt, dp),
      onZoom: (factor) => sceneRef.current?.zoomBy(factor),
      onStatus: setStatus,
    });
    trackerRef.current = tracker;

    try {
      await tracker.start();
      setCamera("on");
    } catch (err) {
      trackerRef.current = null;
      tracker.stop();
      setCamera("error");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "CAMERA ACCESS DENIED"
          : "TRACKING INIT FAILED",
      );
    }
  }, []);

  const toggleGestures = useCallback(() => {
  if (trackerRef.current) stopGestures();
  else void startGestures();
}, [startGestures, stopGestures]);

const talkToUltron = async (message: string) => {
  console.log("ULTRON received:", message);

  console.time("ULTRON");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
  message,
  image: sharingScreen ? captureScreen() : null,
}),
    });

    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }
    const data = await res.json();

    console.timeEnd("ULTRON");

    speak(data.reply);
  } catch (err) {
    console.timeEnd("ULTRON");
    console.error("ULTRON fetch failed:", err);
  }
};
const startScreenShare = async () => {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });

    screenStreamRef.current = stream;

    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = stream;
      await screenVideoRef.current.play();
    }

    setSharingScreen(true);


    stream.getVideoTracks()[0].onended = () => {
      setSharingScreen(false);
      screenStreamRef.current = null;

      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = null;
      }
    };
  } catch (err) {
    console.error("Screen sharing failed:", err);
  }
};
const captureScreen = (): string | null => {
  const video = screenVideoRef.current;

  if (!video) {
  console.log("SCREEN VIDEO MISSING");
  return null;
}

console.log("SCREEN VIDEO STATE:", {
  readyState: video.readyState,
  videoWidth: video.videoWidth,
  videoHeight: video.videoHeight,
  paused: video.paused,
});

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    console.log("CANVAS FAILED");
    return null;
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/jpeg", 0.8);
};
const startListening = () => {
  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  // ...rest of your listening code...

  if (!SpeechRecognition) {
    alert("Speech Recognition is not supported in this browser.");
    return;
  }

  const recognition = new SpeechRecognition();

  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    console.log("🎤 Listening...");
    setListening(true);
  };

  recognition.onend = () => {
    console.log("🛑 Listening stopped");
    setListening(false);
  };

  recognition.onerror = (event: any) => {
  console.error("Speech recognition error:", event.error);
  console.error(event);

  setListening(false);
};

 recognition.onresult = (event: any) => {
  const transcript = event.results[0][0].transcript;
  const command = transcript.toLowerCase();

  console.log("RAW TRANSCRIPT:", transcript);
  console.log("LOWERCASE:", command);

  if (command.includes("open youtube")) {
    const search = command.replace("open youtube", "").trim();

    console.log("SEARCH:", search);

    if (search.length > 0) {
      speak(`Searching YouTube for ${search}`);
      window.open(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(search)}`,
        "_blank"
      );
    } else {
      speak("Opening YouTube.");
      window.open("https://www.youtube.com", "_blank");
    }

    return;
  }

  talkToUltron(transcript);
};

  recognition.start();
};

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "+":
        case "=":
          sceneRef.current?.zoomIn();
          break;
        case "-":
        case "_":
          sceneRef.current?.zoomOut();
          break;
        case "r":
        case "R":
          sceneRef.current?.resetView();
          break;
        case "g":
        case "G":
          toggleGestures();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleGestures]);

  const cameraOn = camera === "on";

  return (
    <>
      <div ref={containerRef} className="orb-root" />

      <div className="overlay-vignette" />
      <div className="overlay-grain" />
      <div className="overlay-scanlines" />

      <div className="hud hud-title">U.L.T.R.O.N.</div>

      <div className="hud hud-hint">
        <div>
          <span className="key">DRAG</span> spin&nbsp;&nbsp;
          <span className="key">SCROLL</span> zoom
        </div>
        {cameraOn ? (
          <div>
            <span className="key">PINCH + MOVE</span> spin&nbsp;&nbsp;
            <span className="key">PINCH BOTH HANDS ± SPREAD</span> zoom
          </div>
        ) : (
          <div>
            <span className="key">G</span> hand gestures&nbsp;&nbsp;
            <span className="key">R</span> reset&nbsp;&nbsp;
            <span className="key">+/−</span> zoom
          </div>
        )}
      </div>

      <div className="hud hud-controls">
        <div className={`camera-panel${cameraOn ? " visible" : ""}`}>
          {/* Mirrored preview so it behaves like a mirror */}
          <video ref={videoRef} muted playsInline className="camera-video" />

<video
  ref={screenVideoRef}
  muted
  playsInline
  style={{ display: "none" }}
/>

<canvas
  ref={overlayRef}
  width={208}
  height={156}
  className="camera-overlay"
/>
          <canvas ref={overlayRef} width={208} height={156} className="camera-overlay" />
          <div className="camera-status">
            {status.hands > 0
              ? `${status.hands} HAND${status.hands > 1 ? "S" : ""} · ${MODE_LABEL[status.mode]}`
              : "SHOW HANDS"}
          </div>
        </div>

        {error && <div className="hud-error">{error}</div>}

        <div className="hud-row">
          <button
            type="button"
            className="hud-btn"
            aria-pressed={cameraOn}
            onClick={toggleGestures}
            disabled={camera === "starting"}
          >
            {camera === "starting" ? "INITIALIZING…" : cameraOn ? "GESTURES ON" : "GESTURES OFF"}
          </button>
        </div>
        <div className="hud-row">
          <button type="button" className="hud-btn" onClick={() => sceneRef.current?.zoomIn()} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="hud-btn" onClick={() => sceneRef.current?.zoomOut()} aria-label="Zoom out">
            −
          </button>
          <button type="button" className="hud-btn" onClick={() => sceneRef.current?.resetView()}>
            RESET
          </button>
        </div>
              <div className="hud-row">
  <button
    type="button"
    className="hud-btn"
    onClick={startListening}
>
    {listening ? "LISTENING..." : "LISTEN"}
</button>
<button
  type="button"
  className="hud-btn"
  onClick={startScreenShare}
>
  {sharingScreen ? "SHARING SCREEN" : "SHARE SCREEN"}
</button>
</div>

</div>

</>  
  );
}