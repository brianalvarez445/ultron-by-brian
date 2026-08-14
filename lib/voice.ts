export function speak(text: string) {
  if (!("speechSynthesis" in window)) {
    alert("Speech not supported");
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);

  utterance.rate = 1;
  utterance.pitch = 0.8;
  utterance.volume = 1;

  window.speechSynthesis.speak(utterance);
}