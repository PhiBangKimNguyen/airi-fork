"""Verify local speech through HTTP and compare an optional approved J audio fixture.

Run with the installed VOICEVOX Python and --audit-dir pointing at speech-prosody.
The test server uses an ephemeral loopback port and never writes speech text or plans.
"""

import argparse
import importlib.util
import io
import json
import math
import threading
import unittest
import wave
from pathlib import Path
from http.client import HTTPConnection

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("local_voicevox", ROOT / "scripts" / "voicevox-local-server.py")
voicevox = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(voicevox)
AUDIT = None


class ProsodyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.voice = voicevox.LocalVoicevox(ROOT / ".local" / "voicevox" / "runtime")

    def test_metadata_never_becomes_speech(self):
        clean, tone, focus = voicevox.read_prosody("[prosody tone=sassy focus=ジャズ]急にジャズっぽくなったね。")
        self.assertEqual(clean, "急にジャズっぽくなったね。")
        self.assertEqual(tone, "sassy")
        self.assertEqual(focus, "ジャズ")
        for tag in ("[prosody tone=invalid]", "[prosody tone=soft focus=こんにちは]"):
            self.assertEqual(voicevox.read_prosody(tag + "こんにちは。"), ("こんにちは。", "plain", None))
        self.assertEqual(voicevox.read_prosody("[prosody tone=sassy"), ("", "plain", None))

    def test_focus_uses_the_named_phrase(self):
        line = "急にジャズっぽくなって、ずるくない？"
        default, _, _ = voicevox.shape_plan(self.voice.synthesizer, line, 8, self.voice.ranges[8], voicevox.EndingVariety())
        marked, kind, _ = voicevox.shape_plan(self.voice.synthesizer, line, 8, self.voice.ranges[8], voicevox.EndingVariety(), "curious", "ジャズ")
        self.assertEqual(kind, "curious")
        same_tone, _, _ = voicevox.shape_plan(self.voice.synthesizer, line, 8, self.voice.ranges[8], voicevox.EndingVariety(), "curious")
        self.assertNotEqual([m.pitch for m in voicevox.voiced(same_tone)], [m.pitch for m in voicevox.voiced(marked)])
        # Unknown focus words cannot modify the approved heuristic.
        missing, _, _ = voicevox.shape_plan(self.voice.synthesizer, line, 8, self.voice.ranges[8], voicevox.EndingVariety(), focus="不存在")
        self.assertEqual([m.pitch for m in voicevox.voiced(default)], [m.pitch for m in voicevox.voiced(missing)])

    def test_rotation_and_range(self):
        variety = voicevox.EndingVariety()
        contours = []
        for _ in range(8):
            plan, kind, contour = voicevox.shape_plan(self.voice.synthesizer, "その切り替えはずるくない？", 8, self.voice.ranges[8], variety)
            voiced = voicevox.voiced(plan)
            self.assertEqual(kind, "sassy")
            self.assertLessEqual(max(m.pitch for m in voiced), self.voice.ranges[8][1])
            self.assertGreater(voiced[-1].pitch, voiced[-2].pitch)
            contours.append(contour)
        self.assertTrue(all(a != b for a, b in zip(contours, contours[1:])))
        self.assertEqual(contours[:4], contours[4:])

    def test_question_rise_with_statement_tags(self):
        for tone in ('cheeky', 'plain'):
            plan, kind, _ = voicevox.shape_plan(self.voice.synthesizer, "ずるくない？", 8, self.voice.ranges[8], voicevox.EndingVariety(), tone)
            voiced = voicevox.voiced(plan)
            self.assertEqual(kind, 'curious')
            self.assertGreater(voiced[-1].pitch, voiced[-2].pitch)

    def test_calibrated_ranges(self):
        # The startup calibration must reproduce the approved Tsumugi range.
        self.assertEqual(self.voice.ranges[8], (6.074, 6.154))
        for style in self.voice.styles:
            soft, cap = self.voice.ranges[style]
            self.assertTrue(math.isfinite(soft) and math.isfinite(cap), style)
            self.assertLessEqual(soft, cap)
        for style in (58, 60):
            if style not in self.voice.ranges:
                continue
            plan, _, _ = voicevox.shape_plan(self.voice.synthesizer, "ずるくない？", style, self.voice.ranges[style], voicevox.EndingVariety())
            plan.validate()
            self.assertLessEqual(max(m.pitch for m in voicevox.voiced(plan)), self.voice.ranges[style][1])

    def shy(self, text):
        plan = voicevox.shape_shy_plan(self.voice.synthesizer, text, 60, self.voice.ranges[60])
        plan.validate()
        return plan

    @staticmethod
    def moras(plan):
        return [m for ph in plan.accent_phrases for m in ph.moras]

    @staticmethod
    def pauses(plan):
        return [ph.pause_mora["vowel_length"] for ph in plan.accent_phrases if ph.pause_mora is not None]

    def test_shy_profile_is_slower_lower_and_narrower(self):
        line = "ごめんなさい、知らない人と話すのは、まだ少し緊張しちゃって。"
        native, shy = self.voice.synthesizer.create_audio_query(line, 60), self.shy(line)
        length = lambda plan: sum((m.consonant_length or 0) + m.vowel_length for m in self.moras(plan))
        pitches = lambda plan: [m.pitch for m in voicevox.voiced(plan)]
        spread = lambda ps: max(ps) - min(ps)
        self.assertGreater(length(shy), length(native) * 1.1)
        self.assertLess(sum(pitches(shy)) / len(pitches(shy)), sum(pitches(native)) / len(pitches(native)) - 0.03)
        # The resets after each break keep the spread near native. The teasing J rules widen it by about half.
        teasing, _, _ = voicevox.shape_plan(self.voice.synthesizer, line, 60, self.voice.ranges[60], voicevox.EndingVariety())
        self.assertLess(spread(pitches(shy)), spread(pitches(teasing)) * 0.8)
        self.assertLess(spread(pitches(shy)), spread(pitches(native)) * 1.1)
        # Two comma pauses, and one soft break in each of the two long clauses.
        self.assertEqual(sorted(self.pauses(shy)), [voicevox.SHY_SOFT_BREAK] * 2 + [voicevox.SHY_PAUSE] * 2)

    def test_shy_hesitation_and_ellipsis_pauses(self):
        pauses = self.pauses(self.shy("あの、えっと……今日はちょっと寒いですね。"))
        self.assertGreaterEqual(pauses[0], voicevox.SHY_HESITATION)
        self.assertGreaterEqual(pauses[1], voicevox.SHY_ELLIPSIS)
        stutter = self.pauses(self.shy("そ、そんなに見つめられると、恥ずかしいです……"))
        self.assertGreaterEqual(stutter[0], voicevox.SHY_HESITATION)

    def test_shy_endings(self):
        for line in ("どうしたの？", "それって、ずるくない？", "ほんと～？", "一緒にお茶でも飲みませんか？"):
            voiced = voicevox.voiced(self.shy(line))
            self.assertAlmostEqual(voiced[-1].pitch - voiced[-2].pitch, voicevox.SHY_RISE_TAIL - voicevox.SHY_RISE_PREV, msg=line)
        # A wave dash becomes a held vowel. The engine would drop it.
        self.assertEqual([m.text for m in self.moras(self.shy("ほんと～？"))], ["ホ", "ン", "ト", "オ"])
        # A held exclamation falls on the held vowel instead of staying at its peak.
        for line in ("わぁ、すごい～！", "やった～！"):
            voiced = voicevox.voiced(self.shy(line))
            self.assertLess(voiced[-1].pitch, voiced[-2].pitch - 0.05, line)
        for line in ("ほんと～？", "ありがとう！", "わぁ、すごい～！"):
            soft, cap = self.voice.ranges[60]
            self.assertLessEqual(max(m.pitch for m in voicevox.voiced(self.shy(line))), cap + 1e-9, line)

    def test_shy_standalone_laugh_keeps_only_the_laugh(self):
        self.assertEqual([m.text for m in self.moras(self.shy("へへ～"))], ["ヘ", "ヘ", "エ"])
        self.assertEqual([m.text for m in self.moras(self.shy("えへへ～"))], ["エ", "ヘ", "ヘ", "エ"])
        laugh = self.shy("ふふ～")
        self.assertEqual([m.text for m in self.moras(laugh)], ["フ", "フ", "ウ"])
        self.assertIsNone(laugh.accent_phrases[-1].pause_mora)

    def test_shy_standalone_hum_is_a_breathy_glide(self):
        for line, post in (("ん～", voicevox.SHY_POST_PHONEME), ("ん～…", voicevox.SHY_ELLIPSIS_POST)):
            plan = self.shy(line)
            moras = self.moras(plan)
            self.assertEqual(moras[0].pitch, 0, line)
            hum = voicevox.voiced(plan)
            self.assertEqual(len(hum), 13, line)
            self.assertLess(max(abs(a.pitch - b.pitch) for a, b in zip(hum, hum[1:])), 0.02, line)
            self.assertLess(hum[-1].pitch, hum[0].pitch, line)
            self.assertEqual(plan.post_phoneme_length, post, line)
        self.assertNotEqual(self.moras(self.shy("ん。"))[0].pitch, 0)

    def test_song_styles_are_not_speaking_voices(self):
        for style in (voicevox.HUM_TEACHER, 3058, voicevox.HUM_STYLE):
            self.assertNotIn(style, self.voice.styles)
        self.assertIn(60, self.voice.styles)

    def test_only_an_exact_hum_caption_in_the_shy_voice_is_sung(self):
        caption = next(iter(voicevox.HUM_TEXTS))
        try:
            for text, style in ((caption + "ねえ", 60), (caption, 8)):
                body = self.voice.create_plan(text, style)
                self.assertEqual(self.voice.plans.pop(body["localPlanId"])[2], "j", text)
        finally:
            self.voice.after_hum_until = 0.0

    def test_hum_sings_then_eases_the_next_shy_line_once(self):
        if not self.voice.can_hum:
            self.skipTest("The song pack is not installed.")
        line = "ふう、静かだね。"
        try:
            self.voice.after_hum_until = 0.0
            baseline = self.voice.create_plan(line, 60)
            self.assertNotIn(baseline["localPlanId"], self.voice.bridged)
            plain = [m.pitch for m in voicevox.voiced(self.voice.plans[baseline["localPlanId"]][1])]
            hum = self.voice.create_plan(" " + next(iter(voicevox.HUM_TEXTS)) + chr(10), 60)
            self.assertEqual(self.voice.plans[hum["localPlanId"]][2], "hum")
            with wave.open(io.BytesIO(self.voice.synthesize(hum, 60))) as clip:
                self.assertGreater(clip.getnframes() / clip.getframerate(), 3.0)
            eased_body = self.voice.create_plan(line, 60)
            eased = [m.pitch for m in voicevox.voiced(self.voice.plans[eased_body["localPlanId"]][1])]
            for index, drop in enumerate(voicevox.HUM_EASE_IN):
                self.assertAlmostEqual(plain[index] - eased[index], drop * voicevox.LOG_SEMITONE, places=6)
            self.assertEqual(plain[2:], eased[2:])
            with wave.open(io.BytesIO(self.voice.synthesize(baseline, 60))) as clip:
                plain_seconds = clip.getnframes() / clip.getframerate()
            with wave.open(io.BytesIO(self.voice.synthesize(eased_body, 60))) as clip:
                bridged_seconds = clip.getnframes() / clip.getframerate()
            bridge = voicevox.HUM_BRIDGE_BEFORE + voicevox.HUM_INHALE + voicevox.HUM_BRIDGE_AFTER
            self.assertAlmostEqual(bridged_seconds - plain_seconds, bridge, places=2)
            again = self.voice.create_plan(line, 60)
            self.assertNotIn(again["localPlanId"], self.voice.bridged)
        finally:
            self.voice.after_hum_until = 0.0

    def test_shy_style_skips_teasing_rotation(self):
        self.voice.variety = voicevox.EndingVariety()
        body = self.voice.create_plan("[prosody tone=sassy focus=切り替え]その切り替えはずるくない？", 60)
        _, plan, mode = self.voice.plans.pop(body["localPlanId"])
        self.assertEqual(mode, "j")
        self.assertEqual(self.voice.variety.turn, 0)
        expected = self.shy("その切り替えはずるくない？")
        self.assertEqual([m.pitch for m in voicevox.voiced(plan)], [m.pitch for m in voicevox.voiced(expected)])
        self.voice.synthesizer.synthesis(plan, 60, enable_interrogative_upspeak=False)

    def test_unknown_english_becomes_katakana_without_word_pauses(self):
        foreign = self.voice.foreign
        line = "「Can't take my eyes off you」っていい曲だね。"
        spoken = foreign.speakable(line)
        self.assertEqual(spoken, "「キャントテイクマイアイズオフユウ」っていい曲だね。")
        # The native plan pauses after every word. The katakana phrase pauses only at the closing quote.
        native = self.voice.synthesizer.create_audio_query(line, 60).accent_phrases
        planned = self.voice.synthesizer.create_audio_query(spoken, 60).accent_phrases
        self.assertEqual(sum(ph.pause_mora is not None for ph in native[:7]), 7)
        cut = next(i for i, ph in enumerate(planned) if ph.pause_mora is not None)
        self.assertEqual("".join(m.text for ph in planned[:cut + 1] for m in ph.moras), "キャントテイクマイアイズオフユウ")
        # Words that OpenJTalk reads, and letter names that it already spells, keep their text.
        for line in ("このBGM、Jazzっぽいね。", "YouTubeで聴いたよ。", "ずるくない？"):
            self.assertEqual(foreign.speakable(line), line)
        self.assertEqual(foreign.speakable("caféで"), "カフェで")
        self.assertEqual(foreign.speakable("Ｊａｚｚ"), "ジャズ")
        self.assertEqual(voicevox.english_to_katakana("VOICE"), "ブイオーアイシーイー")
        convert = lambda word: voicevox.kanalizer.convert(word, on_incomplete="ignore")
        self.assertEqual(voicevox.english_to_katakana("VoiceVox"), convert("voice") + convert("vox"))
        self.assertEqual(voicevox.english_to_katakana("iPhone"), "アイ" + convert("phone"))

    def test_cyrillic_becomes_katakana(self):
        cases = {
            "Спасибо": "スパシボ", "Иван": "イヴァン", "Москва": "モスクヴァ",
            # Soft vowels after a consonant palatalize it. At a syllable start they add the y glide.
            "яма": "ヤマ", "его": "イェゴ", "ёлка": "ヨルカ", "юг": "ユグ",
            "люблю": "リュブリュ", "дядя": "ジャジャ", "тётя": "チョチャ", "нет": "ネト",
            "йога": "ヨガ", "чай": "チャイ",
            "мать": "マチ", "Ольга": "オリガ", "семья": "セミヤ", "объём": "オブヨム",
            "Анна": "アンナ", "Россия": "ロッシヤ",
        }
        for word, kana in cases.items():
            self.assertEqual(voicevox.cyrillic_to_katakana(word), kana, word)
        self.assertEqual(self.voice.foreign.speakable("Спасибо、ありがとう。"), "スパシボ、ありがとう。")
        self.assertEqual(self.voice.foreign.speakable("Спасибо большое！"), "スパシボボリショイェ！")

    def test_foreign_text_is_planned_in_both_modes(self):
        # OpenJTalk rejects a line with only Cyrillic. Both modes and the shy profile plan its katakana.
        line, spoken = "Спасибо большое！", "スパシボボリショイェ！"
        self.voice.variety = voicevox.EndingVariety()
        for style, mode, expected in (
            (60, "original", self.voice.synthesizer.create_audio_query(spoken, 60)),
            (60, "j", self.shy(spoken)),
            (8, "original", self.voice.synthesizer.create_audio_query(spoken, 8)),
            (8, "j", voicevox.shape_plan(self.voice.synthesizer, spoken, 8, self.voice.ranges[8], voicevox.EndingVariety())[0]),
        ):
            body = self.voice.create_plan(line, style, mode)
            _, plan, _ = self.voice.plans[body["localPlanId"]]
            self.assertEqual([(m.text, m.pitch) for m in self.moras(plan)], [(m.text, m.pitch) for m in self.moras(expected)], (style, mode))
            self.assertTrue(self.voice.synthesize(body, style).startswith(b"RIFF"))

    def test_http_modes_keep_their_plan_when_requests_overlap(self):
        from urllib.parse import urlencode
        server = voicevox.ThreadingHTTPServer(("127.0.0.1", 0), voicevox.AiriVoicevoxHandler)
        server.voice = self.voice
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        connection = HTTPConnection("127.0.0.1", server.server_port, timeout=30)
        text = "その切り替えはずるくない？"
        self.voice.variety = voicevox.EndingVariety()
        bodies = {}
        expected = {}
        try:
            for mode in ("original", "j"):
                connection.request("POST", "/audio_query?" + urlencode({
                    "speaker": 8, "text": "[prosody tone=sassy focus=切り替え]" + text, "airi_prosody": mode,
                }))
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                body = json.loads(response.read())
                _, plan, cached_mode = self.voice.plans[body["localPlanId"]]
                self.assertEqual(cached_mode, mode)
                if mode == "original":
                    native = self.voice.synthesizer.create_audio_query(text, 8)
                    self.assertEqual([m.pitch for m in voicevox.voiced(plan)], [m.pitch for m in voicevox.voiced(native)])
                    self.assertEqual(plan.pre_phoneme_length, native.pre_phoneme_length)
                    self.assertEqual(plan.post_phoneme_length, native.post_phoneme_length)
                    self.assertEqual(self.voice.variety.turn, 0)
                else:
                    self.assertNotEqual([m.pitch for m in voicevox.voiced(plan)], [m.pitch for m in voicevox.voiced(native)])
                    self.assertEqual(self.voice.variety.turn, 1)
                body.update(speedScale=0.9, pitchScale=0, intonationScale=1, volumeScale=1)
                plan.speed_scale, plan.pitch_scale, plan.intonation_scale, plan.volume_scale = 0.9, 0, 1, 1
                expected[mode] = self.voice.synthesizer.synthesis(plan, 8, enable_interrogative_upspeak=mode == "original")
                bodies[mode] = body
            for mode in ("j", "original"):
                connection.request("POST", "/synthesis?speaker=8", body=json.dumps(bodies[mode]), headers={"Content-Type": "application/json"})
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                self.assertEqual(response.read(), expected[mode])
            for mode in ("invalid", ""):
                connection.request("POST", "/audio_query?" + urlencode({"speaker": 8, "text": text, "airi_prosody": mode}))
                response = connection.getresponse()
                self.assertEqual(response.status, 400)
                response.read()
        finally:
            connection.close()
            server.shutdown()
            server.server_close()
            thread.join()

    def test_http_golden_parity(self):
        if AUDIT is None:
            self.skipTest("Pass --audit-dir for approved audio parity")
        lines = [item["line"] for item in json.loads((AUDIT / "chunks.json").read_text(encoding="utf-8"))]
        self.voice.variety = voicevox.EndingVariety()
        server = voicevox.ThreadingHTTPServer(("127.0.0.1", 0), voicevox.AiriVoicevoxHandler)
        server.voice = self.voice
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        clips = []
        last_contour = {}
        expected_variety = voicevox.EndingVariety()
        connection = HTTPConnection("127.0.0.1", server.server_port, timeout=30)
        try:
            from urllib.parse import urlencode
            for line in lines:
                connection.request("POST", "/audio_query?" + urlencode({"speaker": 8, "text": line}))
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                body = json.loads(response.read())
                self.assertEqual(body["speedScale"], 0.9)
                self.assertEqual(body["intonationScale"], 1.0)
                _, plan, _ = self.voice.plans[body["localPlanId"]]
                voiced = voicevox.voiced(plan)
                self.assertLessEqual(max(m.pitch for m in voiced), self.voice.ranges[8][1])
                if line.endswith(("？", "?")):
                    self.assertGreater(voiced[-1].pitch, voiced[-2].pitch)
                kind = voicevox.ending_kind(line)
                contour = expected_variety.pick(kind)
                if contour:
                    self.assertNotEqual(last_contour.get(kind), contour[0])
                    last_contour[kind] = contour[0]
                body.update(speedScale=0.9, pitchScale=0, intonationScale=1.0, volumeScale=1)
                connection.request("POST", "/synthesis?speaker=8", body=json.dumps(body), headers={"Content-Type": "application/json"})
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                clips.append(response.read())
        finally:
            connection.close()
            server.shutdown()
            server.server_close()
            thread.join()
        frames = b""
        params = None
        for clip in clips:
            with wave.open(io.BytesIO(clip)) as wav:
                params = wav.getparams()
                frames += wav.readframes(wav.getnframes())
                frames += bytes(int(0.9 * wav.getframerate()) * wav.getsampwidth())
        with wave.open(str(AUDIT / "reels-round5" / "reel-J-full-rotated.wav")) as golden:
            self.assertEqual(params.framerate, golden.getframerate())
            self.assertEqual(params.sampwidth, golden.getsampwidth())
            self.assertEqual(params.nchannels, golden.getnchannels())
            expected = golden.readframes(golden.getnframes())
        self.assertEqual(len(frames), len(expected))
        # Byte equality gives a maximum sample difference of zero.
        self.assertTrue(frames == expected, "Approved J samples differ")
        print(f"J parity: {len(frames) // params.sampwidth} samples, maximum difference 0")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit-dir", type=Path)
    args = parser.parse_args()
    AUDIT = args.audit_dir
    unittest.main(argv=[__file__], verbosity=2)
