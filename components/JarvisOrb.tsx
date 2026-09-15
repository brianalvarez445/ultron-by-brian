"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createOrbScene, type OrbSceneApi } from "@/lib/orbScene";
import { HandTracker, type TrackerStatus } from "@/lib/handTracker";
import { parseBrowserCommand } from "@/lib/commands";
import { executeBrowserAction } from "@/lib/browser";

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
const awaitingCommandRef = useRef(false);
const [sharingScreen, setSharingScreen] = useState(false);
const sharingScreenRef = useRef(false);

const sentinelActiveRef = useRef(false);
const sentinelTimerRef = useRef<number | null>(null);
const sentinelBusyRef = useRef(false);
const sentinelLastSignatureRef = useRef<string | null>(null);
const sentinelLastAlertRef = useRef(0);
const sentinelInstructionRef = useRef("Watch my screen and warn me only when you detect a clear, high-confidence mistake.");

const recognitionRef = useRef<any>(null);
const speechVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
const autoListenRef = useRef(true);

useEffect(() => {
  const loadSpeechVoice = () => {
    const voices = window.speechSynthesis.getVoices();

    if (voices.length > 0 && !speechVoiceRef.current) {
      speechVoiceRef.current = voices[0];
      console.log("SPEECH VOICE READY:", voices[0].name);
    }
  };

  loadSpeechVoice();
  window.speechSynthesis.addEventListener("voiceschanged", loadSpeechVoice);

  return () => {
    window.speechSynthesis.removeEventListener("voiceschanged", loadSpeechVoice);
  };
}, []);

const speak = useCallback((text: string, onEnd?: () => void) => {
  console.log("SPEAK CALLED", text);

  const synth = window.speechSynthesis;

  synth.cancel();

  const voice = new SpeechSynthesisUtterance(text);

  if (speechVoiceRef.current) {
    voice.voice = speechVoiceRef.current;
  }

  voice.rate = 1;
  voice.pitch = 0.8;
  voice.volume = 1;

  voice.onstart = () => console.log("VOICE STARTED");

  voice.onend = () => {
    console.log("VOICE FINISHED");

    if (onEnd) {
      onEnd();
    }
  };

  voice.onerror = (e) => console.log("VOICE ERROR", e);

  synth.speak(voice);
}, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scene = createOrbScene(container);
    sceneRef.current = scene;
    return () => {
      stopSentinel();
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

const getScreenSignature = (): string | null => {
  const video = screenVideoRef.current;

  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 18;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, 32, 18);

  const pixels = ctx.getImageData(0, 0, 32, 18).data;
  let signature = "";

  for (let i = 0; i < pixels.length; i += 16) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const brightness = Math.round((r + g + b) / 3 / 32);
    signature += brightness.toString(16);
  }

  return signature;
};

const screenChangedMeaningfully = (
  previous: string | null,
  current: string,
): boolean => {
  if (!previous) return true;

  const length = Math.min(previous.length, current.length);
  if (!length) return true;

  let different = 0;

  for (let i = 0; i < length; i++) {
    if (previous[i] !== current[i]) {
      different++;
    }
  }

  return different / length >= 0.08;
};

const stopSentinel = useCallback(() => {
  sentinelActiveRef.current = false;
  sentinelBusyRef.current = false;
  sentinelLastSignatureRef.current = null;

  if (sentinelTimerRef.current !== null) {
    window.clearInterval(sentinelTimerRef.current);
    sentinelTimerRef.current = null;
  }

  console.log("🛑 ULTRON SENTINEL STOPPED");
}, []);

const sentinelLastAlertTextRef = useRef<string | null>(null);

const analyzeSentinelFrame = useCallback(async (image: string) => {
  if (sentinelBusyRef.current) return;

  sentinelBusyRef.current = true;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "sentinel",
        message: sentinelInstructionRef.current,
        image,
      }),
    });

    if (!response.ok) {
      throw new Error(`Sentinel request failed: ${response.status}`);
    }

    const data = await response.json();

    const reply = String(data.reply || "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();

    console.log("🛡️ SENTINEL CLEAN RESULT:", reply);

    if (!reply || reply === "NO_ALERT") {
      sentinelLastAlertTextRef.current = null;
      console.log("🛡️ SENTINEL: no problem detected.");
      return;
    }

    const alertText = reply.replace(/^ALERT:\s*/i, "").trim();

    if (alertText === sentinelLastAlertTextRef.current) {
      console.log("🛡️ SAME ALERT — NOT REPEATING");
      return;
    }

    sentinelLastAlertTextRef.current = alertText;
    speak(alertText);
  } catch (error) {
    console.error("❌ SENTINEL ANALYSIS FAILED:", error);
  } finally {
    sentinelBusyRef.current = false;
  }
}, [speak]);

const startSentinel = useCallback(async (instruction?: string) => {
  if (!sharingScreenRef.current || !screenStreamRef.current) {
    console.log("🛡️ SENTINEL: screen sharing inactive — requesting it now.");

    try {
      await startScreenShare();
    } catch (error) {
      console.error("❌ SENTINEL COULD NOT START SCREEN SHARE:", error);
      speak("I could not start screen sharing.");
      return;
    }

    if (!sharingScreenRef.current || !screenStreamRef.current) {
      console.log("🛑 SENTINEL: screen sharing was not established.");
      return;
    }
  }

  if (sentinelTimerRef.current !== null) {
    window.clearInterval(sentinelTimerRef.current);
  }

  sentinelActiveRef.current = true;
  sentinelBusyRef.current = false;
  sentinelLastAlertTextRef.current = null;

  sentinelInstructionRef.current =
    `Watch my screen and tell me whether I'm doing everything correctly. ` +
    `Do not read the screen aloud. Do not summarize it. ` +
    `Only identify a clear, visible, actionable mistake or confirm that everything looks good. ` +
    `${instruction?.trim() || ""}`;

  console.log("🛡️ ULTRON SENTINEL ACTIVE");

  speak("Sentinel active. I will check your screen every 15 seconds.");

  sentinelTimerRef.current = window.setInterval(() => {
    if (!sentinelActiveRef.current || !sharingScreenRef.current) {
      stopSentinel();
      return;
    }

    const image = captureScreen();

    if (!image) {
      console.log("🛡️ SENTINEL: no screen image available");
      return;
    }

    console.log("🛡️ SENTINEL 15-SECOND CHECK");
    void analyzeSentinelFrame(image);
  }, 15000);
}, [analyzeSentinelFrame, speak, stopSentinel]);

const talkToUltron = async (message: string) => {
  console.log("ULTRON received:", message);

  console.time("ULTRON");

  try {
  const needsVision =
    sharingScreen &&
    (
      message.toLowerCase().includes("screen") ||
      message.toLowerCase().includes("see") ||
      message.toLowerCase().includes("look")
    );

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      image: needsVision ? captureScreen() : null,
    }),
  });

    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }
    const data = await res.json();

    console.timeEnd("ULTRON");

    const cleanReply = data.reply.replace(
  /<think>[\s\S]*?<\/think>/g,
  ""
);

speak(cleanReply);
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
    sharingScreenRef.current = true;


    stream.getVideoTracks()[0].onended = () => {
      stopSentinel();
      setSharingScreen(false);
      sharingScreenRef.current = false;
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

  if (!SpeechRecognition) {
    alert("Speech Recognition is not supported in this browser.");
    return;
  }

  if (recognitionRef.current) {
    try {
      recognitionRef.current.stop();
    } catch {}
    recognitionRef.current = null;
  }

  const recognition = new SpeechRecognition();
  recognitionRef.current = recognition;

  const commandMode = awaitingCommandRef.current;

  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.maxAlternatives = 3;

  recognition.onstart = () => {
    console.log(
      commandMode
        ? "🎤 COMMAND LISTENING..."
        : "👂 ULTRON WAKE LISTENING..."
    );
    setListening(true);
  };

  recognition.onresult = (event: any) => {
    const transcript = event.results[0][0].transcript;
    const command = transcript.toLowerCase().trim();

    console.log("RAW TRANSCRIPT:", transcript);
    console.log("LOWERCASE:", command);

    if (!commandMode) {
      const wakeWords = ["ultron", "voldron", "voltron"];

      const heardWakeWord =
        wakeWords.some((word) => command === word) ||
        wakeWords.some((word) => command.startsWith(word + " "));

      if (!heardWakeWord) {
        console.log("💤 Not the wake word");
        return;
      }

      awaitingCommandRef.current = true;
      console.log("🟢 ULTRON WAKE WORD DETECTED");

      speak("Yes?", () => {
        console.log("🟢 ULTRON READY FOR COMMAND");

        setTimeout(() => {
          if (awaitingCommandRef.current) {
            startListening();
          }
        }, 250);
      });

      return;
    }

    awaitingCommandRef.current = false;

    const browserAction = parseBrowserCommand(transcript);

    if (browserAction) {
      console.log("BROWSER ACTION:", browserAction);

      executeBrowserAction(browserAction);

      if (browserAction.type === "search") {
        speak(
          `Searching ${browserAction.engine} for ${browserAction.query}`
        );
      } else {
        speak(`Opening ${browserAction.target}`);
      }

      return;
    }

    talkToUltron(transcript);
  };

  recognition.onerror = (event: any) => {
    console.error("Speech recognition error:", event.error);
    setListening(false);
  };

  recognition.onend = () => {
    console.log("🛑 Listening stopped");
    setListening(false);
    recognitionRef.current = null;

    return;
  };

  try {
    recognition.start();
  } catch (err) {
    console.error("Could not start speech recognition:", err);
    recognitionRef.current = null;
    setListening(false);
  }
};

  useEffect(() => {
    let lastWakeTimestamp = 0;
    let lastCommandTimestamp = 0;
    let stopped = false;

    const checkForWake = async () => {
      try {
        const res = await fetch("/api/wake", {
          cache: "no-store",
        });

        if (!res.ok || stopped) return;

        const data = await res.json();

        if (
          data.wake === true &&
          Number(data.timestamp) > lastWakeTimestamp
        ) {
          lastWakeTimestamp = Number(data.timestamp);

          console.log("🔥 PYTHON WAKE DETECTED");
          console.log("🟢 ULTRON STARTING LISTENING");

          console.log("🎤 PYTHON OWNS MICROPHONE — BROWSER LISTENER SKIPPED");
        }

        if (
          data.command &&
          Number(data.commandTimestamp) > lastCommandTimestamp
        ) {
          lastCommandTimestamp = Number(data.commandTimestamp);

          console.log("🌐 PYTHON COMMAND RECEIVED:", data.command);

          const normalizedCommand = data.command.toLowerCase().trim();

          if (
            normalizedCommand.includes("stop watching") ||
            normalizedCommand.includes("stop monitoring") ||
            normalizedCommand.includes("stop sentinel")
          ) {
            stopSentinel();
            speak("Sentinel monitoring stopped.");
            return;
          }

          if (
            normalizedCommand.includes("watch my screen") ||
            normalizedCommand.includes("monitor my screen") ||
            normalizedCommand.includes("watch this screen") ||
            normalizedCommand.includes("monitor this screen")
          ) {
            void startSentinel(data.command);
            return;
          }

          const action = parseBrowserCommand(data.command);

          console.log("🧪 PARSED PYTHON COMMAND:", action);

          if (action) {
            console.log("🌐 EXECUTING BROWSER ACTION:", action);
            executeBrowserAction(action);
          } else {
            console.log("🧠 NORMAL COMMAND — SENDING TO ULTRON:", data.command);

            const needsVision = sharingScreenRef.current;

const screenImage = needsVision ? captureScreen() : null;

            console.log("👁️ PYTHON COMMAND NEEDS VISION:", needsVision);
            console.log("🖼️ SCREEN IMAGE CAPTURED:", !!screenImage);

            try {
              console.log("👁️ SENDING SCREEN IMAGE TO /api/chat:", {
                command: data.command,
                hasImage: !!screenImage,
                imageLength: screenImage ? screenImage.length : 0,
              });

              const visionResponse = await fetch("/api/chat", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  message: data.command,
                  image: screenImage,
                }),
              });

              if (!visionResponse.ok) {
                throw new Error(`Vision request failed: ${visionResponse.status}`);
              }

              const visionData = await visionResponse.json();
              const cleanReply = visionData.reply.replace(
                /<think>[\s\S]*?<\/think>/g,
                ""
              );

              speak(cleanReply);
            } catch (visionError) {
              console.error("❌ PYTHON → VISION FAILED:", visionError);
            }
          }
        }
      } catch (error) {
        if (!stopped) {
          console.error("Wake bridge error:", error);
        }
      }
    };

    checkForWake();

    const interval = setInterval(checkForWake, 500);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, []);

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
