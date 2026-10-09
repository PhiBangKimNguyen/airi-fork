"""Generate local VOICEVOX previews without changing AIRI's selected voice."""

from pathlib import Path

from voicevox_core.blocking import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / ".local" / "voicevox" / "runtime"
runtime_library = next((RUNTIME / "onnxruntime").rglob("voicevox_onnxruntime.dll"))
dictionary = next((RUNTIME / "dict").glob("open_jtalk_dic*"))
onnxruntime = Onnxruntime.load_once(filename=str(runtime_library))
synthesizer = Synthesizer(onnxruntime, OpenJtalk(str(dictionary)), acceleration_mode="CPU", cpu_num_threads=4)
with VoiceModelFile.open(RUNTIME / "models" / "vvms" / "0.vvm") as model:
    synthesizer.load_voice_model(model)

text = "おかえり！待ってたよ。今日は何をしようか？ちょっと疲れたら、休憩しようね。ずっとそばにいるよ。"
for voice_id, filename, credit in [
    (3, "zundamon-normal", "VOICEVOX:ずんだもん"),
    (1, "zundamon-sweet", "VOICEVOX:ずんだもん"),
    (2, "metan-normal", "VOICEVOX:四国めたん"),
    (0, "metan-sweet", "VOICEVOX:四国めたん"),
]:
    query = synthesizer.create_audio_query(text, voice_id)
    query.speed_scale = 1.06
    wav = synthesizer.synthesis(query, voice_id)
    output = ROOT / ".local" / f"voice-{filename}.wav"
    output.write_bytes(wav)
    print(f"{filename}: {len(wav)} bytes; {credit}")
