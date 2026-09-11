import os
import subprocess
import wave
import requests
import sounddevice as sd
import numpy as np

SAMPLE_RATE = 16000
CHANNELS = 1
INPUT_DEVICE = 0

PROJECT_DIR = "/home/franckyal24/ultron-by-sagar-builds"
ENV_FILE = os.path.join(PROJECT_DIR, ".env.local")
WAV_FILE = "/tmp/ultron-command.wav"

CHAT_URL = "http://localhost:3000/api/chat"

CHUNK_SECONDS = 0.1
SILENCE_SECONDS = 1.2
MAX_RECORD_SECONDS = 10
START_TIMEOUT_SECONDS = 5

# Microphone sensitivity.
# Lower = easier to trigger.
SPEECH_THRESHOLD = 0  # Automatically calibrated when recording starts


def load_groq_key():
    with open(ENV_FILE, "r") as f:
        for line in f:
            if line.startswith("GROQ_API_KEY="):
                return line.strip().split("=", 1)[1]

    raise RuntimeError("GROQ_API_KEY not found")


def speak(text):
    print(f"\n🔊 ULTRON: {text}")

    wav_file = "/tmp/ultron-response.wav"

    subprocess.run(
        [
            "espeak-ng",
            "-v", "en-us",
            "-s", "155",
            "-p", "35",
            "-w", wav_file,
            text,
        ],
        check=False,
    )

    subprocess.run(
        [
            "aplay",
            "-D", "hw:0,0",
            wav_file,
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )

def record_command():
    print("\n🎤 ULTRON IS LISTENING...")
    print("Stay quiet for 1 second, then speak your command.")

    chunk_size = int(SAMPLE_RATE * CHUNK_SECONDS)

    # --- Calibrate microphone noise floor ---
    calibration_frames = []

    with sd.InputStream(
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        dtype="int16",
        device=INPUT_DEVICE,
        blocksize=chunk_size,
    ) as stream:

        print("🔧 Calibrating microphone...")

        for _ in range(10):  # 1 second
            try:
                audio, overflowed = stream.read(chunk_size)
            except Exception as e:
                print("❌ Microphone read error:", e)
                return False

            if overflowed:
                print("⚠️ Calibration audio overflow")

            audio = audio[:, 0].astype(np.float32)
            calibration_frames.append(
                float(np.sqrt(np.mean(audio * audio)))
            )

        noise_floor = float(np.median(calibration_frames))

        # Speech must be substantially louder than the measured room noise.
        threshold = max(noise_floor * 1.6, noise_floor + 150)

        print(f"🔧 Noise floor: {noise_floor:.1f}")
        print(f"🔧 Speech threshold: {threshold:.1f}")
        print("🎤 Speak now.")

        frames = []
        started = False
        silence_time = 0.0
        elapsed = 0.0

        pre_roll = []
        PRE_ROLL_CHUNKS = 5

        while elapsed < MAX_RECORD_SECONDS:
            try:
                audio, overflowed = stream.read(chunk_size)
            except Exception as e:
                print("❌ Microphone read error:", e)
                return False

            if overflowed:
                print("⚠️ Audio overflow — continuing")

            audio = audio[:, 0].astype(np.int16)
            rms = float(np.sqrt(np.mean(audio.astype(np.float32) ** 2)))

            elapsed += CHUNK_SECONDS

            if not started:
                pre_roll.append(audio.copy())

                if len(pre_roll) > PRE_ROLL_CHUNKS:
                    pre_roll.pop(0)

            if rms >= threshold:
                if not started:
                    print("🎤 Speech detected.")
                    frames.extend(pre_roll)
                    pre_roll.clear()

                started = True
                silence_time = 0.0
                frames.append(audio.copy())

            elif started:
                frames.append(audio.copy())
                silence_time += CHUNK_SECONDS

                if silence_time >= SILENCE_SECONDS:
                    break

            elif elapsed >= START_TIMEOUT_SECONDS:
                print("⚠️ No speech detected.")
                return False

    if not frames:
        print("⚠️ No audio captured.")
        return False

    audio_data = np.concatenate(frames).astype(np.int16)

    with wave.open(WAV_FILE, "wb") as f:
        f.setnchannels(CHANNELS)
        f.setsampwidth(2)
        f.setframerate(SAMPLE_RATE)
        f.writeframes(audio_data.tobytes())

    duration = len(audio_data) / SAMPLE_RATE
    print(f"🎤 Recording finished. ({duration:.1f}s)")

    return True

def transcribe(groq_key):
    print("🧠 Converting speech to text...")

    with open(WAV_FILE, "rb") as audio_file:
        response = requests.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={
                "Authorization": f"Bearer {groq_key}",
            },
            files={
                "file": (
                    "ultron-command.wav",
                    audio_file,
                    "audio/wav",
                ),
            },
            data={
                "model": "whisper-large-v3-turbo",
                "language": "en",
            },
            timeout=30,
        )

    if not response.ok:
        print("❌ TRANSCRIPTION ERROR:", response.text)
        return None

    text = response.json().get("text", "").strip()

    print("📝 YOU SAID:", text)

    return text


def send_browser_command(command):
    try:
        command_lower = command.lower().strip()

        websites = {
            "youtube": "https://www.youtube.com",
            "instagram": "https://www.instagram.com",
            "facebook": "https://www.facebook.com",
            "twitter": "https://x.com",
            "x": "https://x.com",
            "github": "https://github.com",
            "chatgpt": "https://chatgpt.com",
            "google": "https://www.google.com",
            "bing": "https://www.bing.com",
        }

        cleaned = command_lower
        for phrase in (
            "hey jarvis",
            "hey jervis",
            "jarvis",
            "jervis",
            "ultron",
        ):
            cleaned = cleaned.replace(phrase, " ")

        cleaned = cleaned.strip(" .,!?")

        for name, url in websites.items():
            patterns = (
                f"open {name}",
                f"launch {name}",
                f"go to {name}",
                f"visit {name}",
            )

            if any(pattern in cleaned for pattern in patterns):
                print("🌐 BROWSER COMMAND DETECTED:", command)
                print("🚀 OPENING:", url)

                subprocess.Popen(
                    ["xdg-open", url],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )

                return True

        return False

    except Exception as e:
        print("❌ Could not execute browser command:", e)
        return False

def ask_ultron(message):
    print("🧠 Asking ULTRON...")

    response = requests.post(
        CHAT_URL,
        json={
            "message": message,
        },
        timeout=60,
    )

    if not response.ok:
        print("❌ ULTRON API ERROR:", response.text)
        return None

    data = response.json()

    return data.get("reply", "").strip()


def main():
    groq_key = load_groq_key()

    print("==============================")
    print("ULTRON VOICE LOOP")
    print("==============================")
    print("Speak naturally.")
    print("ULTRON stops recording after silence.")
    print("Press Ctrl+C to stop.")
    print("==============================")

    while True:
        recorded = record_command()

        if not recorded:
            continue

        command = transcribe(groq_key)

        if not command:
            print("⚠️ No command detected.")
            continue

        browser_handled = send_browser_command(command)

        if browser_handled:
            reply = ask_ultron(
                f"The user asked you to: {command}\n"
                "The browser action has already been executed successfully. "
                "Respond briefly and naturally. Do not say you cannot open websites."
            )

            if not reply:
                print("⚠️ ULTRON returned no response.")
                continue

            speak(reply)

        else:
            print("🌐 Sending command to browser for ULTRON processing...")

            try:
                response = requests.post(
                    "http://localhost:3000/api/wake",
                    json={"command": command},
                    timeout=5,
                )

                if not response.ok:
                    print("❌ Browser command handoff failed:", response.text)
                    continue

                print("✅ Command handed to browser.")

            except Exception as e:
                print("❌ Could not send command to browser:", e)
                continue

        print("\n✅ ULTRON RESPONSE COMPLETE")
        print("👂 Returning control to wake listener...")
        break


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nStopping ULTRON voice loop.")
