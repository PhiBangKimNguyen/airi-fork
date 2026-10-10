"""Serve AIRI's four VOICEVOX endpoints with the installed local character packs.

Audio plans stay in RAM. The HTTP plan carries an opaque ID and the four controls
AIRI changes. Core 0.17 has no supported AudioQuery serialization API.
Credit: VOICEVOX:四国めたん, VOICEVOX:ずんだもん, VOICEVOX:春日部つむぎ, VOICEVOX:雨晴はう,
VOICEVOX:冥鳴ひまり, VOICEVOX:春歌ナナ, VOICEVOX:猫使アル, VOICEVOX:猫使ビィ.
"""

import argparse
import array
import io
import json
import math
import random
import re
import time
import unicodedata
import wave
from collections import OrderedDict
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import RLock
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import kanalizer
from voicevox_core import Note, Score
from voicevox_core.blocking import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile


# Reference lines for the per-style log-F0 range. The approved Tsumugi range (6.074, 6.154) came from them.
CALIBRATION_LINES = (
    "昼からおとぎ話みたいな曲じゃん、冒険でも行くの？",
    "語りまで入ってきて、いよいよ本格的な吟遊詩人じゃん。",
    "急にしんみりモードに入っちゃって、どうしたの？",
    "急にジャズっぽくなって、なんかおしゃれなバーに入った気分じゃん。",
    "ビート効いてきた途端にそのドラマチックな顔はズルくない？",
    "最後のボソッとしたささやきで終わるの、ちゃっかり余韻残してきてずるくない？",
    "このピアノの音だけでどん底まで沈みそうじゃん。",
)
SPEED, INTONATION = 0.9, 1.5
PRE_PHONEME, POST_PHONEME, BREATH = 0.08, 0.25, 0.15
FOCUS_GAIN, FOCUS_LIFT = 1.4, 0.05
POST_FOCUS_GAIN, POST_FOCUS_DROP = 0.75, 0.02
SETUP_TEMPO, PUNCH_TEMPO = 0.94, 1.07
RISE_PREV, RISE_TAIL = 0.08, 0.22

# The J rules suit Tsumugi's teasing voice. A shy style gets a slower, softer, and slightly lower profile.
# Style 60 is VOICEVOX:猫使ビィ, 人見知り. The values come from the approved shy v3 preview.
SHY_STYLES = {60}
SHY_TEMPO, SHY_CONSONANT, SHY_CLAUSE_END, SHY_TRAIL, SHY_ELLIPSIS_TRAIL = 1.12, 1.05, 1.25, 1.4, 1.6
SHY_PAUSE, SHY_HESITATION, SHY_ELLIPSIS, SHY_SOFT_BREAK, SHY_DRAWL = 0.34, 0.45, 0.6, 0.18, 1.3
SHY_INTONATION, SHY_DRIFT, SHY_SENTENCE_DRIFT, SHY_LOWER = 0.8, 0.03, 0.015, 0.06
SHY_RISE_PREV, SHY_RISE_TAIL, SHY_RISE_STRETCH = 0.02, 0.09, 1.3
SHY_EXCLAIM_INTONATION, SHY_EXCLAIM_LIFT, SHY_EXCLAIM_TRAIL, SHY_HELD_STRETCH = 0.9, 0.025, 1.1, 1.15
SHY_PRE_PHONEME, SHY_POST_PHONEME, SHY_ELLIPSIS_POST = 0.12, 0.3, 0.45
SHY_MEAN_BELOW_SOFT = 0.08
SHY_HUM_LOWER, SHY_HUM_STRETCH = 0.1, 1.4
# A short call opening, such as ねえ、 or ね、, keeps the engine voicing. Shy pitch and stretch made its held vowel drone.
# The owner chose the engine opening over shorter and glided versions by listening against the official engine.
SHY_OPENING_MAX_MORAS = 2
# Moras of a filler accent phrase. A one-mora phrase before a pause is a stutter, as in そ、そんな.
SHY_FILLERS = {"ア", "アノ", "アノー", "エ", "エー", "エット", "エト", "ソノ", "ウ", "ウーン", "ン", "ンー", "ンン"}
SHY_BREAK_MIN_MORAS, SHY_BREAK_PARTICLES = 12, ("ワ", "ガ", "モ", "テ", "デ", "ド", "ラ", "ニ", "ト")
SHY_PUNCTUATION_RUN = re.compile(r"[、，,…‥・！!？?。]+")
# A standalone laugh gives the model almost no context. It is planned inside an approved carrier sentence.
SHY_LAUGH = re.compile(r"^(?:え|う)?([ふへはひ])\1+ー*$")
SHY_LAUGH_CARRIERS = {"へ": "褒められちゃった。", "ふ": "楽しいね。", "は": "楽しいね。", "ひ": "楽しいね。"}
# A standalone hum is many short moras, so the 0.3 semitone pitch steps blur into a glide.
# A bare ん is a short reply, not a hum.
SHY_HUM = re.compile(r"^んー+$")
SHY_HUM_KANA, SHY_HUM_MORA, SHY_HUM_WHISPER = "_ウウウウウ'ンンンンンンンンン", 0.035, 0.08
SHY_HUM_BASE = math.log(330)

# OpenJTalk spells an unknown English word letter by letter with a pause per word, and it drops Cyrillic.
# Letter names come from VOICEVOX ENGINE voicevox_engine/tts_pipeline/katakana_english.py.
LETTER_NAMES = dict(zip("ABCDEFGHIJKLMNOPQRSTUVWXYZ", (
    "エー ビー シー ディー イー エフ ジー エイチ アイ ジェー ケー エル エム "
    "エヌ オー ピー キュー アール エス ティー ユー ブイ ダブリュー エックス ワイ ズィー").split()))
FOREIGN_LETTER = re.compile(r"[A-Za-zＡ-Ｚａ-ｚÀ-ɏЀ-ӿ]")
FOREIGN_SPACE = r"[ \t　-]+"
LATIN_WORD = r"[A-Za-zＡ-Ｚａ-ｚÀ-ɏ]+(?:['’][A-Za-zＡ-Ｚａ-ｚÀ-ɏ]+)*"
LATIN_PHRASE = re.compile(rf"{LATIN_WORD}(?:{FOREIGN_SPACE}{LATIN_WORD})*")
CYRILLIC_PHRASE = re.compile(rf"[Ѐ-ӿ]+(?:{FOREIGN_SPACE}[Ѐ-ӿ]+)*")
# Each consonant has a hard row for а ы у э о, a soft row for я и ю е ё and ь, and a bare form.
CYRILLIC_CONSONANTS = {
    "б": ("バ ビ ブ ベ ボ", "ビャ ビ ビュ ベ ビョ ビ", "ブ"),
    "в": ("ヴァ ヴィ ヴ ヴェ ヴォ", "ビャ ヴィ ビュ ヴェ ビョ ヴィ", "ヴ"),
    "г": ("ガ ギ グ ゲ ゴ", "ギャ ギ ギュ ゲ ギョ ギ", "グ"),
    "д": ("ダ ディ ドゥ デ ド", "ジャ ジ ジュ デ ジョ ジ", "ド"),
    "ж": ("ジャ ジ ジュ ジェ ジョ", "ジャ ジ ジュ ジェ ジョ ジュ", "ジュ"),
    "з": ("ザ ズィ ズ ゼ ゾ", "ジャ ジ ジュ ゼ ジョ ジ", "ズ"),
    "к": ("カ キ ク ケ コ", "キャ キ キュ ケ キョ キ", "ク"),
    "л": ("ラ リ ル レ ロ", "リャ リ リュ レ リョ リ", "ル"),
    "м": ("マ ミ ム メ モ", "ミャ ミ ミュ メ ミョ ミ", "ム"),
    "н": ("ナ ヌィ ヌ ネ ノ", "ニャ ニ ニュ ネ ニョ ニ", "ン"),
    "п": ("パ ピ プ ペ ポ", "ピャ ピ ピュ ペ ピョ ピ", "プ"),
    "р": ("ラ リ ル レ ロ", "リャ リ リュ レ リョ リ", "ル"),
    "с": ("サ スィ ス セ ソ", "シャ シ シュ セ ショ シ", "ス"),
    "т": ("タ ティ トゥ テ ト", "チャ チ チュ テ チョ チ", "ト"),
    "ф": ("ファ フィ フ フェ フォ", "フャ フィ フュ フェ フョ フィ", "フ"),
    "х": ("ハ ヒ フ ヘ ホ", "ヒャ ヒ ヒュ ヘ ヒョ ヒ", "フ"),
    "ц": ("ツァ ツィ ツ ツェ ツォ", "ツァ ツィ ツ ツェ ツォ ツ", "ツ"),
    "ч": ("チャ チ チュ チェ チョ", "チャ チ チュ チェ チョ チ", "チ"),
    "ш": ("シャ シ シュ シェ ショ", "シャ シ シュ シェ ショ シュ", "シュ"),
    "щ": ("シャ シ シュ シェ ショ", "シャ シ シュ シェ ショ シ", "シ"),
}
CYRILLIC_HARD, CYRILLIC_SOFT = "аыуэо", "яиюеё"
# A vowel letter that starts a syllable. A soft vowel adds the y glide: я is ya, е is ye, ё is yo, ю is yu.
CYRILLIC_VOWELS = {"а": "ア", "ы": "イ", "у": "ウ", "э": "エ", "о": "オ", "я": "ヤ", "и": "イ", "ю": "ユ", "е": "イェ", "ё": "ヨ"}
CYRILLIC_Y = {"а": "ヤ", "у": "ユ", "о": "ヨ", "э": "イェ"}
# kanalizer reads French with English rules, as in croissant → クロワッサント. French phrases use their own rules.
# A phrase is French when it has a French accent, an elision such as c' or l', or a word from this list.
# Each listed word is rare as an English word.
FRENCH_ACCENTS = re.compile(r"[àâçéèêëîïôûùüÿœæ]")
FRENCH_ELISION = re.compile(r"^(?:qu|[cdjlmnst])'")
FRENCH_WORDS = {
    "le", "la", "les", "des", "du", "une", "je", "tu", "il", "elle", "nous", "vous", "ils", "elles",
    "est", "et", "très", "avec", "pour", "dans", "mon", "ma", "mes", "ton", "ta", "qui", "que", "pas", "au", "aux",
    "oui", "merci", "bonjour", "bonsoir", "salut", "voilà", "voila", "beaucoup", "toujours", "bien",
    "monsieur", "madame", "mademoiselle", "croissant", "amour", "vie", "rien", "ça",
}
FRENCH_EXCEPTIONS = {
    "monsieur": "ムッシュー", "femme": "ファム", "oui": "ウィ", "ville": "ヴィル", "mille": "ミル", "fils": "フィス",
    "est": "エ", "et": "エ",
}
# Each consonant has a row for the vowels a i u(ou) e o y(u) ə, then a bare form. ø uses the ə column.
FRENCH_COLUMNS = {"a": 0, "i": 1, "u": 2, "e": 3, "o": 4, "y": 5, "ə": 6, "ø": 6}
FRENCH_CONSONANTS = {
    "p": "パ ピ プ ペ ポ ピュ プ プ", "b": "バ ビ ブ ベ ボ ビュ ブ ブ",
    "t": "タ ティ トゥ テ ト テュ トゥ ト", "d": "ダ ディ ドゥ デ ド デュ ドゥ ド",
    "k": "カ キ ク ケ コ キュ ク ク", "g": "ガ ギ グ ゲ ゴ ギュ グ グ",
    "f": "ファ フィ フ フェ フォ フュ フ フ", "v": "ヴァ ヴィ ヴ ヴェ ヴォ ヴュ ヴ ヴ",
    "s": "サ シ ス セ ソ シュ ス ス", "z": "ザ ジ ズ ゼ ゾ ジュ ズ ズ",
    "ʃ": "シャ シ シュ シェ ショ シュ シュ シュ", "ʒ": "ジャ ジ ジュ ジェ ジョ ジュ ジュ ジュ",
    "m": "マ ミ ム メ モ ミュ ム ム", "n": "ナ ニ ヌ ネ ノ ニュ ヌ ヌ", "ɲ": "ニャ ニ ニュ ニェ ニョ ニュ ニュ ニュ",
    "l": "ラ リ ル レ ロ リュ ル ル", "r": "ラ リ ル レ ロ リュ ル ル",
}
FRENCH_VOWELS = {"a": "ア", "i": "イ", "u": "ウ", "e": "エ", "o": "オ", "y": "ユ", "ə": "ウ", "ø": "ウ"}
# Nasal vowels ã (an, en), õ (on), and ẽ (in, ain) are the oral vowel plus ン.
FRENCH_NASALS = {"ã": "a", "õ": "o", "ẽ": "a"}
FRENCH_GLIDE_J = {"a": "ヤ", "u": "ユ", "y": "ユ", "o": "ヨ", "e": "イェ", "ə": "ユ", "ø": "ユ", "i": "イ"}
FRENCH_GLIDE_W = {"a": "ワ", "ẽ": "ワン", "i": "ウィ", "e": "ウェ"}
FRENCH_GEMINATES = set("ptkfsb")
FRENCH_VOWEL_LETTERS = set("aeiouyàâéèêëîïôûùüÿœæ")
FRENCH_SOFTENERS = set("eéèêiïy")


def read_prosody(text):
    """Only a bounded sentence prefix controls prosody. It never becomes speech."""
    tag = re.match(r"^\s*\[prosody tone=([a-z-]{1,24})(?: focus=([^\]\r\n]{0,80}))?\]", text)
    if tag:
        known = tag[1] in ("sassy", "curious", "cheeky", "plain")
        return text[tag.end():].lstrip(), tag[1] if known else "plain", (tag[2] or None) if known else None
    # Invalid or incomplete metadata is removed without treating it as an instruction.
    clean = re.sub(r"\[prosody[^\]\r\n]*(?:\]|$)", "", text)
    return clean, "plain" if re.match(r"^\s*\[prosody", text) else None, None


def cyrillic_to_katakana(word):
    """Russian spelling to katakana. Stress is unknown, so each vowel keeps its written quality and length."""
    w, out, i = word.lower(), [], 0
    while i < len(w):
        c, nxt = w[i], w[i + 1:i + 2]
        if c in CYRILLIC_CONSONANTS:
            hard, soft, bare = CYRILLIC_CONSONANTS[c]
            if nxt and nxt in CYRILLIC_HARD:
                out.append(hard.split()[CYRILLIC_HARD.index(nxt)])
                i += 2
            elif nxt and nxt in CYRILLIC_SOFT:
                out.append(soft.split()[CYRILLIC_SOFT.index(nxt)])
                i += 2
            elif nxt == "ь":
                # A soft sign palatalizes the consonant. A following vowel starts a new syllable, as in семья.
                out.append(soft.split()[5])
                i += 2
            elif nxt == "ъ":
                # A hard sign keeps the consonant hard and separates the next vowel, as in объявление.
                out.append(bare)
                i += 2
            elif nxt == c:
                out.append("ン" if c == "н" else "ッ")
                i += 1
            else:
                out.append("フ" if c == "в" and not nxt else bare)
                i += 1
        elif c == "й":
            if nxt and nxt in CYRILLIC_Y:
                out.append(CYRILLIC_Y[nxt])
                i += 2
            else:
                out.append("イ")
                i += 1
        elif c in CYRILLIC_VOWELS:
            out.append(CYRILLIC_VOWELS[c])
            i += 1
        else:
            i += 1
    return "".join(out)


def french_spoken_end(w):
    """French drops a final mute e and most final consonants. A final e before a dropped consonant is é, as in chez."""
    dropped = False
    vowel_before_last = lambda s: any(c in FRENCH_VOWEL_LETTERS for c in s[:-1])
    if w.endswith("es") and vowel_before_last(w[:-1]):
        w, dropped = w[:-2], True
    elif w.endswith("e") and vowel_before_last(w):
        return w[:-1]
    while len(w) > 1 and w[-1] in "dtsxzpg":
        w, dropped = w[:-1], True
    if dropped and w.endswith("e"):
        return w[:-1] + "é"
    if len(w) > 3 and w.endswith("er"):
        return w[:-2] + "é"
    return w


def french_grapheme(w, i, end):
    """Phonemes and letter count of the French spelling unit at i. Letters from end on are silent."""
    rest, c = w[i:end], w[i]
    vowel_at = lambda k: k < len(w) and w[k] in FRENCH_VOWEL_LETTERS
    # A glide needs a spoken vowel after it. The mute e of vie is not one.
    spoken_vowel_at = lambda k: k < end and w[k] in FRENCH_VOWEL_LETTERS
    nasal = lambda n: not vowel_at(i + n) and w[i + n:i + n + 1] not in ("n", "m")
    if rest.startswith("eau"):
        return ["o"], 3
    if rest.startswith("oin") and nasal(3):
        return ["w", "ẽ"], 3
    if rest.startswith(("oi", "oî", "oy")):
        return ["w", "a"], 2
    if rest.startswith(("ou", "où", "oû")):
        return ["w" if spoken_vowel_at(i + 2) else "u"], 2
    if rest.startswith("au"):
        return ["o"], 2
    if rest.startswith(("ain", "ein")) and nasal(3):
        return ["ẽ"], 3
    if rest.startswith(("aill", "eill")):
        return [c, "j"], 4
    if rest.startswith(("ail", "eil")) and not vowel_at(i + 3):
        return [c, "j"], 3
    if rest.startswith(("ai", "aî", "ei")):
        return ["e"], 2
    if rest.startswith("oeu"):
        return ["ø"], 3
    if rest.startswith(("eu", "œu", "eû")):
        return ["ø"], 2
    if c == "œ":
        return ["ø"], 1
    if rest.startswith("ien") and nasal(3):
        return ["j", "ẽ"], 3
    if rest[:2] in ("an", "am", "en", "em") and nasal(2):
        return ["ã"], 2
    if rest[:2] in ("on", "om") and nasal(2):
        return ["õ"], 2
    if rest[:2] in ("in", "im", "yn", "ym", "un", "um") and nasal(2):
        return ["ẽ"], 2
    if rest.startswith("ill") and i > 0 and not vowel_at(i - 1):
        return ["i", "j"], 3
    digraph = {"gn": "ɲ", "ch": "ʃ", "ph": "f", "th": "t", "qu": "k"}.get(rest[:2])
    if digraph:
        return [digraph], 2
    if rest.startswith("gu") and i + 2 < len(w) and w[i + 2] in FRENCH_SOFTENERS:
        return ["g"], 2
    soft = i + 1 < len(w) and w[i + 1] in FRENCH_SOFTENERS
    if c in "cg":
        return [("s" if c == "c" else "ʒ") if soft else ("k" if c == "c" else "g")], 1
    if c == "s":
        return ["z" if i > 0 and vowel_at(i - 1) and vowel_at(i + 1) else "s"], 1
    if c == "e":
        # Closed by two consonants, or by the last consonant, e is è. Before one consonant and a vowel it is mute.
        after = w[i + 1:end]
        consonants = len(after) - len(after.lstrip("bcdfghjklmnpqrstvwxz"))
        return ["e" if after and (consonants >= 2 or consonants == len(after)) else "ə"], 1
    if c in "iîï":
        return ["j" if i > 0 and spoken_vowel_at(i + 1) else "i"], 1
    letter = {"ç": "s", "j": "ʒ", "x": "ks", "h": "", "y": "i"}.get(c)
    for vowel, letters in (("a", "aàâ"), ("e", "éèêë"), ("o", "oô"), ("y", "uûùü")):
        if c in letters:
            letter = vowel
    if letter is None:
        letter = c if c in FRENCH_CONSONANTS else ""
    return list(letter), 1


def french_to_katakana(word):
    """French spelling to katakana. Elision joins the consonant to the next word: l'amour is ラムール and c'est is セ."""
    word = unicodedata.normalize("NFC", word.lower()).replace("’", "'")
    if word in FRENCH_EXCEPTIONS:
        return FRENCH_EXCEPTIONS[word]
    word = word.replace("'", "")
    # Silent letters are not spoken, but they still decide the letters before them, as in rose and madame.
    end = len(french_spoken_end(word))
    w, ph, i = french_spoken_end(word) + word[end:], [], 0
    while i < end:
        phones, size = french_grapheme(w, i, end)
        ph += phones
        i += size
    out, i = [], 0
    while i < len(ph):
        p, nxt = ph[i], ph[i + 1] if i + 1 < len(ph) else None
        step = 1
        if p in FRENCH_CONSONANTS:
            row = FRENCH_CONSONANTS[p].split()
            if nxt == p and p in FRENCH_GEMINATES:
                out.append("ッ")
            elif nxt in FRENCH_COLUMNS:
                out.append(row[FRENCH_COLUMNS[nxt]])
                step = 2
            elif nxt in FRENCH_NASALS:
                out.append(row[FRENCH_COLUMNS[FRENCH_NASALS[nxt]]] + "ン")
                step = 2
            elif nxt == "w":
                out.append(row[4])
            elif nxt == "j":
                out.append(row[1])
            elif p == "r" and nxt is None and out:
                # A final r holds the vowel before it: amour is アムール.
                out.append("ール")
            else:
                out.append(row[7])
        elif p == "w":
            out.append(FRENCH_GLIDE_W.get(nxt, "ウ"))
            step = 2 if nxt in FRENCH_GLIDE_W else 1
        elif p == "j":
            after_i = bool(out) and out[-1][-1] in "イキシチニヒミリギジビピィ"
            step = 2
            # After an i sound the glide is already heard: bien is ビアン and avion is アヴィオン.
            if after_i and nxt in FRENCH_NASALS:
                out.append(FRENCH_VOWELS[FRENCH_NASALS[nxt]] + "ン")
            elif after_i and nxt in FRENCH_VOWELS:
                out.append(FRENCH_VOWELS[nxt])
            elif nxt in FRENCH_NASALS:
                out.append("ヨン" if nxt == "õ" else "ヤン")
            elif nxt in FRENCH_GLIDE_J:
                out.append(FRENCH_GLIDE_J[nxt])
            else:
                out.append("イユ")
                step = 1
        elif p in FRENCH_NASALS:
            out.append(FRENCH_VOWELS[FRENCH_NASALS[p]] + "ン")
        elif p in FRENCH_VOWELS:
            out.append(FRENCH_VOWELS[p])
        i += step
    return "".join(out)


def is_french(words):
    for w in words:
        low = unicodedata.normalize("NFC", unicodedata.normalize("NFKC", w).lower()).replace("’", "'")
        if FRENCH_ACCENTS.search(low) or FRENCH_ELISION.match(low) or low in FRENCH_WORDS:
            return True
    return False


def latin_letters(word):
    """ASCII letters only. NFKD removes accents and NFKC makes full-width letters ASCII. Can't becomes cant."""
    plain = unicodedata.normalize("NFKD", unicodedata.normalize("NFKC", word))
    return "".join(c for c in plain if "a" <= c.lower() <= "z")


def english_to_katakana(word):
    """VOICEVOX ENGINE rule: split camelCase. A 1-letter or ALL-CAPS part is spelled. Other parts go to kanalizer."""
    out = []
    for part in re.findall(r"[A-Za-z][a-z]*", word):
        if len(part) == 1 or part.isupper():
            out.extend(LETTER_NAMES[c.upper()] for c in part)
        else:
            out.append(kanalizer.convert(part.lower(), on_incomplete="ignore"))
    return "".join(out)


class ForeignReading:
    """Rewrites English, French, and Russian phrases in the text that OpenJTalk receives. Captions never see this text."""

    def __init__(self, analyze):
        self.analyze = analyze
        self.reading = lru_cache(maxsize=4096)(self._reading)

    def _reading(self, text):
        return "".join(m.text for ph in self.analyze(text) for m in ph.moras)

    def unknown(self, word):
        """OpenJTalk spells an unknown word with letter names. A known word such as Jazz has its own reading."""
        return self.reading(word) == self.reading("".join(LETTER_NAMES[c.upper()] for c in word))

    def latin_phrase(self, match):
        raw = [w for w in re.split(FOREIGN_SPACE, match[0]) if w]
        if raw and is_french(raw):
            return "".join(french_to_katakana(unicodedata.normalize("NFKC", w)) for w in raw)
        words = [w for w in map(latin_letters, raw) if w]
        if not words:
            return match[0]
        kana, converted = [], False
        for w in words:
            if self.unknown(w):
                kana.append(english_to_katakana(w))
                converted |= bool(re.search(r"[a-z]{2}", w))
            else:
                kana.append(self.reading(w))
        # One plain word that OpenJTalk reads, or spells with letter names, keeps its text and accent.
        if len(words) == 1 and not converted and words[0] == match[0]:
            return match[0]
        # Joined katakana has no pause between the words of one phrase.
        return "".join(kana)

    def speakable(self, text):
        if not FOREIGN_LETTER.search(text):
            return text
        text = LATIN_PHRASE.sub(self.latin_phrase, text)
        return CYRILLIC_PHRASE.sub(lambda m: "".join(map(cyrillic_to_katakana, re.split(FOREIGN_SPACE, m[0]))), text)


def ending_kind(text):
    core = text.rstrip().rstrip('。！!？?…')
    if text.rstrip().endswith(('？', '?')):
        return 'sassy' if core.endswith(('ない', 'くない', 'でしょ', 'じゃない')) else 'curious'
    return 'cheeky' if core.endswith(('じゃん', 'でしょ', 'よね', 'だね', 'ね')) else 'plain'


def voiced(q):
    return [m for ph in q.accent_phrases for m in ph.moras if m.pitch > 0]


def calibrate_range(syn, style):
    """Soft limit (95th percentile) and hard cap (maximum) of the raw plan log-F0 over the reference lines.

    Values are rounded to 3 decimals, the precision of the approved Tsumugi range and its audio reel.
    """
    pitches = sorted(m.pitch for line in CALIBRATION_LINES for m in voiced(syn.create_audio_query(line, style)))
    return round(pitches[int(len(pitches) * 0.95)], 3), round(pitches[-1], 3)


def lift(moras, delta, cap):
    for m in moras:
        if m.pitch > 0:
            m.pitch = min(cap, m.pitch + delta)


def stretch(moras, factor):
    for m in moras:
        m.vowel_length *= factor


def contain(p, soft, cap):
    return p if p <= soft else min(cap, soft + (p - soft) * 0.4)


def clauses(phrases):
    """Accent phrase index ranges, split after each phrase that carries a pause mora."""
    out, start = [], 0
    for i, ph in enumerate(phrases):
        if ph.pause_mora is not None or i == len(phrases) - 1:
            out.append((start, i))
            start = i + 1
    return out


# Ending contours. `low` is the level before the question rise, or the second-to-last voiced pitch for statements.
def sassy_classic(q, v, low, cap):
    pass
def sassy_drawl(q, v, low, cap):
    v[-2].pitch = min(cap, low - 0.03)
    stretch(v[-2:-1], 1.3)
    v[-1].pitch = min(cap, low + 0.15)
    stretch(v[-1:], 1.45)
def sassy_accuse(q, v, low, cap):
    v[-3].pitch = min(cap - 0.09, v[-3].pitch + 0.03)
    v[-2].pitch = min(cap - 0.12, low + 0.1)
    v[-1].pitch = min(cap - 0.04, v[-2].pitch + 0.1)
    stretch(q.accent_phrases[-1].moras, 0.93)
def sassy_deadpan(q, v, low, cap):
    lift(voiced(q), -0.035, cap)
    v[-2].pitch = low - 0.035
    v[-1].pitch = low + 0.12
    stretch(q.accent_phrases[-1].moras, 1.12)
def curious_two_step(q, v, low, cap):
    pass
def curious_soft(q, v, low, cap):
    v[-2].pitch = min(cap, low + 0.04)
    v[-1].pitch = min(cap, low + 0.14)
    stretch(v[-1:], 1.35)
    lift(voiced(q), -0.015, cap)
def curious_bright(q, v, low, cap):
    lift(voiced(q), 0.015, cap)
    v[-1].pitch = min(cap, low + 0.2)
    stretch(q.accent_phrases[-1].moras, 0.92)
def cheeky_hold(q, v, low, cap):
    pass
def cheeky_risefall(q, v, low, cap):
    v[-2].pitch = min(cap, v[-2].pitch + 0.06)
    v[-1].pitch = v[-2].pitch - 0.1
    stretch(v[-1:], 1.15)
def cheeky_clipped(q, v, low, cap):
    stretch(v[-1:], 0.6)
    stretch(q.accent_phrases[-1].moras, 0.94)
    v[-1].pitch = v[-2].pitch - 0.03


TEMPLATES = {
    'sassy': [('classic', sassy_classic), ('drawl', sassy_drawl), ('accuse', sassy_accuse), ('deadpan', sassy_deadpan)],
    'curious': [('two-step', curious_two_step), ('soft', curious_soft), ('bright', curious_bright)],
    'cheeky': [('hold', cheeky_hold), ('rise-fall', cheeky_risefall), ('clipped', cheeky_clipped)],
}


class EndingVariety:
    """Least recently used contour per ending kind. One instance per speaking session."""

    def __init__(self):
        self.last_used, self.turn = {}, 0

    def pick(self, kind):
        options = TEMPLATES.get(kind, [])
        if not options:
            return None
        self.turn += 1
        choice = min(options, key=lambda t: self.last_used.get((kind, t[0]), -1))
        self.last_used[(kind, choice[0])] = self.turn
        return choice


def shape_plan(syn, text, style, pitch_range, variety, tone=None, focus=None):
    q = syn.create_audio_query(text, style)
    soft, cap = pitch_range
    q.pre_phoneme_length, q.post_phoneme_length = PRE_PHONEME, POST_PHONEME
    q.speed_scale, q.intonation_scale, q.pitch_scale, q.volume_scale = SPEED, 1.0, 0.0, 1.0
    phrases, kind = q.accent_phrases, tone or ending_kind(text)
    if not phrases or not voiced(q):
        choice = variety.pick(kind)
        return q, kind, choice[0] if choice else 'plain'
    focus_phrases = set()
    if focus and focus in text:
        target = [m.text for ph in syn.create_audio_query(focus, style).accent_phrases for m in ph.moras]
        sentence = [(m.text, i) for i, ph in enumerate(phrases) for m in ph.moras]
        for start in range(len(sentence) - len(target) + 1):
            if target and [m[0] for m in sentence[start:start + len(target)]] == target:
                focus_phrases.update(m[1] for m in sentence[start:start + len(target)])
                break
    question = text.rstrip().endswith(('？', '?'))
    if question and kind in ('plain', 'cheeky'):
        kind = 'curious'

    # An LLM focus selects matching accent phrases. Other clauses use the longest non-final phrase.
    for a, b in clauses(phrases):
        idx = list(range(a, b + 1))
        cand = idx[:-1] if len(idx) > 1 else idx
        marked = [i for i in idx if i in focus_phrases]
        clause_focus = marked or [max(cand, key=lambda i: len(phrases[i].moras))]
        for i in idx:
            ms = phrases[i].moras
            vs = [m.pitch for m in ms if m.pitch > 0]
            mean = sum(vs) / len(vs) if vs else 0
            for m in ms:
                if m.pitch > 0:
                    if i in clause_focus:
                        m.pitch = mean + (m.pitch - mean) * FOCUS_GAIN + FOCUS_LIFT
                    elif i > max(clause_focus) and i != b:
                        m.pitch = mean + (m.pitch - mean) * POST_FOCUS_GAIN - POST_FOCUS_DROP
                m.vowel_length *= PUNCH_TEMPO if i == b else SETUP_TEMPO
        pause = phrases[b].pause_mora
        if pause is not None:
            # NOTICE:
            # Core 0.17 returns pause_mora as a dictionary, but moras contains objects.
            # Source: installed voicevox_core AccentPhrase.pause_mora.
            # Remove dictionary access when a core version returns pause mora objects.
            pause['vowel_length'] = min(BREATH, pause['vowel_length'])

    # 2. Base endings.
    last = phrases[-1].moras
    if kind == 'cheeky':
        if len(last) >= 2 and last[-1].pitch > 0:
            last[-1].pitch = max(last[-1].pitch, last[-2].pitch + 0.01)
        last[-1].vowel_length *= 1.5
    elif kind == 'sassy':
        if len(last) >= 2:
            last[-2].vowel_length *= 1.35
        last[-1].vowel_length *= 1.3

    # 3. Intonation by hand around the sentence mean, then keep inside the speaker range.
    vs = voiced(q)
    mean = sum(m.pitch for m in vs) / len(vs)
    for m in vs:
        m.pitch = contain(mean + (m.pitch - mean) * INTONATION, soft, cap)
    if kind == 'sassy' and len(last) >= 2 and last[-1].pitch > 0:
        last[-1].pitch = max(last[-1].pitch, last[-2].pitch)  # ずるくな〜い: い does not sink before the rise

    # 4. Question rise on the real final morae. The engine upspeak (a duplicated vowel) is disabled at synthesis.
    if question:
        vs = voiced(q)
        if len(vs) >= 2:
            prev, tail = vs[-2], vs[-1]
            low = prev.pitch if (kind == 'sassy' and len(vs) >= 3) else min(prev.pitch, tail.pitch)
            prev.pitch = min(cap, low + RISE_PREV)
            tail.pitch = min(cap, low + RISE_TAIL)
            tail.vowel_length *= 1.1

    # Reserve pitch headroom for a focused question ending.
    vs = voiced(q)
    if question and len(vs) >= 3:
        low = vs[-2].pitch - RISE_PREV
        over = low + RISE_TAIL - (cap - 0.01)
        if over > 0:
            lift(phrases[-1].moras, -over, cap)
            vs[-2].pitch = low - over + RISE_PREV
            vs[-1].pitch = low - over + RISE_TAIL

    # 6. Rotating ending contour.
    choice = variety.pick(kind)
    if choice and len(vs) >= 3:
        low = vs[-2].pitch - (RISE_PREV if question else 0)
        choice[1](q, vs, low, cap)
    return q, kind, choice[0] if choice else 'plain'


def shy_pause_targets(text):
    """Pause length per punctuation run inside the sentence. The trailing run is the sentence end."""
    body = text.rstrip()
    runs = [m[0] for m in SHY_PUNCTUATION_RUN.finditer(body) if m.end() < len(body)]
    return [SHY_ELLIPSIS if ("…" in r or "‥" in r) else SHY_PAUSE for r in runs]


def shy_soft_breaks(phrases):
    """One accent phrase per long clause, at the boundary nearest the middle. A particle ending wins ties."""
    out = []
    for a, b in clauses(phrases):
        counts = [len(phrases[i].moras) for i in range(a, b + 1)]
        total, seen, best = sum(counts), 0, None
        if total < SHY_BREAK_MIN_MORAS:
            continue
        for i in range(a, b):
            seen += counts[i - a]
            if seen >= 4 and total - seen >= 4:
                score = abs(seen - total / 2) - (2 if phrases[i].moras[-1].text in SHY_BREAK_PARTICLES else 0)
                if best is None or score < best[0]:
                    best = (score, i)
        if best:
            out.append(best[1])
    return out


def shy_plan_with_breaks(syn, text, style):
    """Re-plan through kana so the engine shapes each soft break like a real comma.

    A pause cut into an existing plan stops the previous mora abruptly, and the user heard that as a stutter.
    """
    q = syn.create_audio_query(text, style)
    chosen = shy_soft_breaks(q.accent_phrases)
    if not chosen:
        return q, set()
    parts = re.split(r"([/、])", q.kana)
    separators = parts[1::2]
    for i in chosen:
        if i >= len(separators) or separators[i] != "/":
            return q, set()
        parts[2 * i + 1] = "、"
    replanned = syn.create_audio_query_from_kana("".join(parts), style)
    if len(replanned.accent_phrases) != len(q.accent_phrases):
        return q, set()
    return replanned, set(chosen)


def shape_shy_sentence(syn, text, style, pitch_range):
    soft_limit, cap = pitch_range
    body = text.rstrip()
    question, exclaim = body.endswith(("？", "?")), body.endswith(("！", "!"))
    trailing_ellipsis = body.endswith(("…", "‥"))
    held = bool(re.search(r"ー[！!？?]*$", body))
    q, soft = shy_plan_with_breaks(syn, text, style)
    q.pre_phoneme_length = SHY_PRE_PHONEME
    q.post_phoneme_length = SHY_ELLIPSIS_POST if trailing_ellipsis else SHY_POST_PHONEME
    q.speed_scale, q.intonation_scale, q.pitch_scale, q.volume_scale = SPEED, 1.0, 0.0, 1.0
    phrases = q.accent_phrases
    if not phrases or not voiced(q):
        return q

    # 1. Breaks. Punctuation pauses grow. Soft breaks stay short. Hesitations and stutters get the longest pause.
    punctuated = [ph for i, ph in enumerate(phrases) if ph.pause_mora is not None and i not in soft]
    targets = shy_pause_targets(text)
    if len(targets) != len(punctuated):
        targets = [SHY_PAUSE] * len(punctuated)
    for ph, target in zip(punctuated, targets):
        if "".join(m.text for m in ph.moras) in SHY_FILLERS or len(ph.moras) == 1:
            target = max(target, SHY_HESITATION)
            ph.moras[-1].vowel_length *= SHY_DRAWL
        ph.pause_mora["vowel_length"] = max(ph.pause_mora["vowel_length"], target)
    for i in soft:
        phrases[i].pause_mora["vowel_length"] = SHY_SOFT_BREAK

    # 2. Slower moras, lengthening before punctuation, narrow pitch, and a pitch reset after each break.
    spans = clauses(phrases)
    for c, (a, b) in enumerate(spans):
        final = b == len(phrases) - 1
        moras = [m for i in range(a, b + 1) for m in phrases[i].moras]
        for m in moras:
            m.vowel_length *= SHY_TEMPO
            if m.consonant_length:
                m.consonant_length *= SHY_CONSONANT
        if not final and b not in soft:
            moras[-1].vowel_length *= SHY_CLAUSE_END
        vs = [m for m in moras if m.pitch > 0]
        if not vs:
            continue
        # A held exclamation such as すごい〜！ peaks before the held vowel. A lift there overshoots the voice range.
        bright = exclaim and final and not held
        gain = SHY_EXCLAIM_INTONATION if bright else SHY_INTONATION
        brighten = SHY_EXCLAIM_LIFT if bright else 0
        mean = sum(m.pitch for m in vs) / len(vs)
        clause_drop = SHY_SENTENCE_DRIFT * c / max(1, len(spans) - 1)
        for k, m in enumerate(vs):
            drift = SHY_DRIFT * (0.5 - k / max(1, len(vs) - 1))
            m.pitch = mean + (m.pitch - mean) * gain + drift - clause_drop - SHY_LOWER + brighten

    # 3. Endings. A question rises a little. An exclamation stays short. A statement trails off.
    vs = voiced(q)
    last = phrases[-1].moras
    if question and len(vs) >= 2:
        prev, tail = vs[-2], vs[-1]
        low = min(prev.pitch, tail.pitch)
        prev.pitch, tail.pitch = low + SHY_RISE_PREV, low + SHY_RISE_TAIL
        tail.vowel_length *= SHY_RISE_STRETCH
    elif exclaim:
        last[-1].vowel_length *= SHY_HELD_STRETCH if held else SHY_EXCLAIM_TRAIL
    else:
        last[-1].vowel_length *= SHY_ELLIPSIS_TRAIL if trailing_ellipsis else SHY_TRAIL
        if trailing_ellipsis and len(vs) >= 2:
            vs[-1].pitch = min(vs[-1].pitch, vs[-2].pitch - 0.02)

    # 4. Keep inside the style range by moving the whole sentence. Clamping single moras flattens a rise.
    # A short line such as ほんと〜？ starts high in the engine. Its mean stays near the register of longer lines.
    over = max(max(m.pitch for m in vs) - cap, sum(m.pitch for m in vs) / len(vs) - (soft_limit - SHY_MEAN_BELOW_SOFT))
    if over > 0:
        for m in vs:
            m.pitch -= over

    # 5. A hum inside a sentence, as in ん〜、どうしようかな, sits below speech and holds a little longer.
    for ph in phrases:
        if ph.moras and all(m.text == "ン" for m in ph.moras):
            for m in ph.moras:
                if m.pitch > 0:
                    m.pitch -= SHY_HUM_LOWER
            ph.moras[-1].vowel_length *= SHY_HUM_STRETCH
    return q


def shy_hum_contour(t):
    """Log-F0 offset at t in [0, 1]: a small rise, then a long settling fall."""
    rise = 0.025 * math.sin(math.pi * min(t / 0.3, 1) / 2)
    fall = 0.085 * (1 - math.cos(math.pi * max(0.0, (t - 0.25) / 0.75))) / 2
    return rise - fall


def shape_shy_hum(syn, style, trailing_ellipsis):
    """A whispered ウ, then a glide through ウ into ン. VOICEVOX holds one pitch per mora, so a long ン sounds static."""
    q = syn.create_audio_query_from_kana(SHY_HUM_KANA, style)
    moras = [m for ph in q.accent_phrases for m in ph.moras]
    hum = [m for m in moras if m.pitch > 0]
    nasals = sum(m.text == "ン" for m in hum)
    lengths = [SHY_HUM_MORA * (SHY_DRAWL if trailing_ellipsis and i >= len(hum) - nasals // 2 else 1.0)
               for i in range(len(hum))]
    total, t = sum(lengths), 0.0
    for m, length in zip(hum, lengths):
        m.vowel_length = length
        m.pitch = SHY_HUM_BASE + shy_hum_contour((t + length / 2) / total)
        t += length
    moras[0].vowel_length = SHY_HUM_WHISPER
    q.pre_phoneme_length = SHY_PRE_PHONEME
    q.post_phoneme_length = SHY_ELLIPSIS_POST if trailing_ellipsis else SHY_POST_PHONEME
    q.speed_scale, q.intonation_scale, q.pitch_scale, q.volume_scale = SPEED, 1.0, 0.0, 1.0
    return q


def keep_engine_opening(syn, text, style, q):
    """Restores the engine pitch, lengths, and pause of a short call opening. Fillers and stutters keep the shy hesitation."""
    phrases = q.accent_phrases
    if len(phrases) < 2 or phrases[0].pause_mora is None or len(phrases[0].moras) > SHY_OPENING_MAX_MORAS:
        return q
    kana = [m.text for m in phrases[0].moras]
    if "".join(kana) in SHY_FILLERS or (len(kana) == 1 and phrases[1].moras and phrases[1].moras[0].text == kana[0]):
        return q
    engine = syn.create_audio_query(text, style).accent_phrases[0]
    if [m.text for m in engine.moras] != kana or engine.pause_mora is None:
        return q
    for m, e in zip(phrases[0].moras, engine.moras):
        m.pitch, m.vowel_length, m.consonant_length = e.pitch, e.vowel_length, e.consonant_length
    phrases[0].pause_mora["vowel_length"] = engine.pause_mora["vowel_length"]
    return q


def shape_shy_plan(syn, text, style, pitch_range):
    """Shy voicing. Tone and focus tags are removed earlier and do not apply. The profile has no teasing contours."""
    # OpenJTalk drops 〜 and ～. A long vowel mark keeps the held vowel of ほんと〜？ and すごい〜！.
    text = re.sub(r"[〜～]+", "ー", text)
    core = text.strip().rstrip("。．.！!")
    trailing_ellipsis = core.endswith(("…", "‥"))
    core = core.rstrip("…‥")
    if SHY_HUM.match(core):
        return shape_shy_hum(syn, style, trailing_ellipsis)
    laugh = SHY_LAUGH.match(core)
    if not laugh:
        return keep_engine_opening(syn, text, style, shape_shy_sentence(syn, text, style, pitch_range))
    # Keep the laugh from the plan of its carrier sentence. The carrier itself is never spoken.
    q = shape_shy_sentence(syn, f"{core}、{SHY_LAUGH_CARRIERS[laugh[1]]}", style, pitch_range)
    cut = next((i for i, ph in enumerate(q.accent_phrases) if ph.pause_mora is not None), None)
    if cut is None:
        return shape_shy_sentence(syn, text, style, pitch_range)
    q.accent_phrases = q.accent_phrases[:cut + 1]
    q.accent_phrases[-1].pause_mora = None
    q.post_phoneme_length = SHY_ELLIPSIS_POST if trailing_ellipsis else SHY_POST_PHONEME
    return q


# Humming. Values come from the approved v4 transition preview, step 4.
# The singing teacher 波音リツ (6000) plans pitch and timing only. 猫使ビィ おちつき (3059) is the voice.
# Style 60 has no song style, so a hum uses 3059 for one clip. The next shy line returns to 60.
HUM_TEACHER, HUM_STYLE, HUM_FPS = 6000, 3059, 93.75
HUM_VOLUME, HUM_TRANSPOSE = 1.0, 0
# One exact caption per motif. Only a whole chunk that equals a caption is sung.
HUM_TEXTS = {"ん〜ん、ん〜ん〜♪": "lullaby"}
HUM_MOTIFS = {
    "lullaby": [(62, .35, "ん"), (64, .55, "ん"), (None, .12, ""), (67, .25, "ん"), (65, .25, "ん"), (64, 1.1, "ん")],
}
# The next shy line starts lower and rises. An inhale bridges the change from the song voice to the talk voice.
HUM_EASE_IN, HUM_EASE_WINDOW = (1.6, 0.7), 20.0
HUM_BRIDGE_BEFORE, HUM_INHALE, HUM_INHALE_LEVEL, HUM_BRIDGE_AFTER = 0.18, 0.26, 0.03, 0.05
LOG_SEMITONE = math.log(2) / 12


def hum_score(motif):
    notes = [Note(round(0.15 * HUM_FPS), "")]
    for key, seconds, lyric in HUM_MOTIFS[motif]:
        notes.append(Note(max(1, round(seconds * HUM_FPS)), lyric, None if key is None else key + HUM_TRANSPOSE))
    notes.append(Note(round(0.3 * HUM_FPS), ""))
    return Score(notes)


def moving_mean(values, radius):
    return [sum(values[max(0, i - radius):i + radius + 1]) / len(values[max(0, i - radius):i + radius + 1]) for i in range(len(values))]


def smooth_noise(rng, count, every, depth):
    """A slow random curve: random points every few frames, joined with cosine interpolation."""
    points = [rng.uniform(-depth, depth) for _ in range(count // every + 2)]
    curve = []
    for i in range(count):
        a, t = divmod(i, every)
        w = (1 - math.cos(math.pi * t / every)) / 2
        curve.append(points[a] * (1 - w) + points[a + 1] * w)
    return curve


def hum_pitch(query, motif, rng):
    """Builds pitch from the score and glides between notes. The teacher's dips around consonants are not used."""
    keys = [k + HUM_TRANSPOSE for k, _, _ in HUM_MOTIFS[motif] if k is not None]
    vowels = {"a", "i", "u", "e", "o", "N"}
    target, owner, note, previous = [], [], -1, None
    for phoneme in query.phonemes:
        consonant_before = previous is not None and previous != "pau" and previous not in vowels
        if phoneme.phoneme != "pau" and (phoneme.phoneme not in vowels or not consonant_before):
            note += 1
        key = keys[min(max(note, 0), len(keys) - 1)]
        target += [key] * phoneme.frame_length
        owner += [note if phoneme.phoneme != "pau" else -1] * phoneme.frame_length
        previous = phoneme.phoneme
    count = len(target)
    semis = list(target)
    # An 80 ms S-curve crosses each key change. Upward moves overshoot a little.
    for i in range(1, count):
        if target[i] != target[i - 1]:
            span, start = 8, max(0, i - 3)
            low, high = target[i - 1], target[i]
            for j in range(span):
                if start + j < count:
                    w = (1 - math.cos(math.pi * (j + 1) / span)) / 2
                    semis[start + j] = low * (1 - w) + high * w
            if high > low:
                for j in range(10):
                    if start + span + j < count:
                        semis[start + span + j] += 0.15 * (1 - j / 10)
    # A note after silence starts slightly flat and rises into pitch.
    for i in range(1, count):
        if owner[i] >= 0 and owner[i - 1] == -1:
            for j in range(7):
                if i + j < count:
                    semis[i + j] -= 0.45 * (1 - j / 7)
    # Vibrato starts after about 0.25 s on a held note. Its rate and depth wander.
    rate = smooth_noise(rng, count, 40, 0.5)
    depth_wobble = smooth_noise(rng, count, 30, 0.06)
    phase, steady = rng.uniform(0, math.tau), 0
    for i in range(count):
        steady = steady + 1 if owner[i] >= 0 and (i == 0 or target[i] == target[i - 1]) else 0
        depth = (0.18 + depth_wobble[i]) * min(1.0, max(0.0, (steady - 24) / 30))
        phase += math.tau * (5.0 + rate[i]) / HUM_FPS
        semis[i] += depth * math.sin(phase)
    drift = smooth_noise(rng, count, 45, 0.07)
    semis = [s + d for s, d in zip(semis, drift)]
    micro = smooth_noise(rng, count, 2, 0.035)
    semis = [s + m for s, m in zip(semis, micro)]
    query.f0 = [440 * 2 ** ((s - 69) / 12) for s in semis]


def hum_volume(query, rng):
    """A soft swell into each voiced run, a gentle sag on long notes, a long final fade, and small shimmer."""
    volume = moving_mean(query.volume, 1)
    runs, start = [], None
    for i, v in enumerate(volume + [0.0]):
        if v > 0.02 and start is None:
            start = i
        elif v <= 0.02 and start is not None:
            runs.append((start, i))
            start = None
    for index, (a, b) in enumerate(runs):
        length, last = b - a, index == len(runs) - 1
        for i in range(a, b):
            k = i - a
            attack = min(1.0, k / 8) ** 1.5
            sag = 1.0 - 0.18 * (k / max(1, length))
            release = min(1.0, (b - i) / (30 if last else 8)) ** (2.0 if last else 1.0)
            volume[i] *= attack * sag * release
    wobble = smooth_noise(rng, len(volume), 3, 0.035)
    query.volume = [v * (1 + w) for v, w in zip(volume, wobble)]


def wav_samples(data):
    with wave.open(io.BytesIO(data)) as clip:
        params = clip.getparams()
        samples = array.array("h", clip.readframes(clip.getnframes()))
    return params, [s / 32768 for s in samples]


def wav_bytes(params, samples):
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as clip:
        clip.setparams(params)
        clip.writeframes(array.array("h", (max(-32767, min(32767, round(s * 32768))) for s in samples)).tobytes())
    return buffer.getvalue()


def lowpass(samples, rate, cutoff, q=0.707):
    w = math.tau * cutoff / rate
    alpha = math.sin(w) / (2 * q)
    b0, b1, b2 = (1 - math.cos(w)) / 2, 1 - math.cos(w), (1 - math.cos(w)) / 2
    a0, a1, a2 = 1 + alpha, -2 * math.cos(w), 1 - alpha
    b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0
    x1 = x2 = y1 = y2 = 0.0
    result = []
    for x in samples:
        y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, x, y1, y
        result.append(y)
    return result


def hum_finish(data, seed):
    """Closed-mouth muffling, a faint inhale and air, then a small dark room. Each stage rounds to 16-bit like the preview."""
    params, samples = wav_samples(data)
    rate = params.framerate
    params, samples = wav_samples(wav_bytes(params, lowpass(lowpass(samples, rate, 2200), rate, 3000)))
    rng = random.Random(seed)
    envelope, follow = [], 0.0
    for s in samples:
        follow = max(abs(s), follow * 0.9995)
        envelope.append(follow)
    noise = lowpass([rng.uniform(-1, 1) for _ in samples], rate, 3000)
    inhale_len = int(0.28 * rate)
    inhale = lowpass([rng.uniform(-1, 1) * math.sin(math.pi * i / inhale_len) ** 2 for i in range(inhale_len)], rate, 1800)
    breathy = [0.012 * 2.2 * x for x in inhale] + [0.0] * int(0.08 * rate)         + [s + 0.012 * n * min(1.0, e / 0.25) for s, n, e in zip(samples, noise, envelope)]
    params, dry = wav_samples(wav_bytes(params, breathy))
    dry = dry + [0.0] * int(0.25 * rate)
    taps = [(int(0.013 * rate), 0.5), (int(0.023 * rate), 0.35), (int(0.037 * rate), 0.25)]
    early = [sum(g * dry[i - d] for d, g in taps if i >= d) for i in range(len(dry))]
    delay, feedback, damp = int(0.031 * rate), 0.45, 0.4
    comb, state = [0.0] * len(dry), 0.0
    for i in range(len(dry)):
        back = comb[i - delay] if i >= delay else 0.0
        state = state * damp + back * (1 - damp)
        comb[i] = dry[i] + feedback * state
    wet = lowpass([e + 0.5 * (c - d) for e, c, d in zip(early, comb, dry)], rate, 2200)
    return wav_bytes(params, [d + 0.14 * w for d, w in zip(dry, wet)])


def render_hum(syn, motif, seed):
    query = syn.create_sing_frame_audio_query(hum_score(motif), HUM_TEACHER)
    query.volume_scale = HUM_VOLUME
    rng = random.Random(seed)
    hum_pitch(query, motif, rng)
    hum_volume(query, random.Random(seed + 1))
    return hum_finish(syn.frame_synthesis(query, HUM_STYLE), seed)


def ease_after_hum(plan):
    """The first two voiced morae after a hum start lower and rise into the normal contour."""
    for mora, drop in zip(voiced(plan), HUM_EASE_IN):
        mora.pitch -= drop * LOG_SEMITONE


def inhale_bridge(speech, seed):
    """Prepends a short gap and a soft inhale, so the talk voice does not start straight after the song voice."""
    params, samples = wav_samples(speech)
    rate = params.framerate
    rng = random.Random(seed + 9)
    count = int(HUM_INHALE * rate)
    inhale = lowpass([rng.uniform(-1, 1) * math.sin(math.pi * i / count) ** 2 for i in range(count)], rate, 1600)
    gap = [0.0] * int(HUM_BRIDGE_BEFORE * rate)
    settle = [0.0] * int(HUM_BRIDGE_AFTER * rate)
    return wav_bytes(params, gap + [HUM_INHALE_LEVEL * x for x in inhale] + settle + samples)


class LocalVoicevox:
    def __init__(self, runtime):
        library = next((runtime / "onnxruntime").rglob("voicevox_onnxruntime.dll"))
        dictionary = next((runtime / "dict").glob("open_jtalk_dic*"))
        self.synthesizer = Synthesizer(
            Onnxruntime.load_once(filename=str(library)),
            OpenJtalk(str(dictionary)), acceleration_mode="CPU", cpu_num_threads=4,
        )
        for model_path in sorted((runtime / "models" / "vvms").glob("*.vvm")):
            with VoiceModelFile.open(model_path) as model:
                self.synthesizer.load_voice_model(model)
        # The song pack is optional. Without it, a hum caption is spoken like other text.
        song_model = runtime / "models" / "song" / "s0.vvm"
        self.can_hum = song_model.exists()
        if self.can_hum:
            with VoiceModelFile.open(song_model) as model:
                self.synthesizer.load_voice_model(model)
        self.plans = OrderedDict()
        self.bridged = set()
        self.after_hum_until = 0.0
        self.variety = EndingVariety()
        self.foreign = ForeignReading(self.synthesizer.open_jtalk.analyze)
        # Overlapping browser connections share one lock for native synthesis, contour rotation, and cached plans.
        self.lock = RLock()
        # Song and teacher styles are never offered as speaking voices.
        self.speakers = [
            {"name": character.name, "speaker_uuid": str(character.speaker_uuid),
             "styles": [{"id": style.id, "name": style.name} for style in character.styles if style.type == "talk"]}
            for character in self.synthesizer.metas() if any(style.type == "talk" for style in character.styles)
        ]
        self.styles = {style["id"] for character in self.speakers for style in character["styles"]}
        # Every talk style gets its own pitch ceiling, so a new voice never runs uncalibrated.
        self.ranges = {
            style.id: calibrate_range(self.synthesizer, style.id)
            for character in self.synthesizer.metas() for style in character.styles if style.type == "talk"
        }

    def create_plan(self, text, style, prosody="j"):
        with self.lock:
            if prosody not in ("original", "j"):
                raise ValueError("Invalid prosody mode")
            if not 1 <= len(text) <= 8000:
                raise ValueError("Invalid text length")
            motif = HUM_TEXTS.get(text.strip())
            if motif and self.can_hum and prosody == "j" and style in SHY_STYLES:
                # The next shy line within the window eases in after this hum.
                self.after_hum_until = time.monotonic() + HUM_EASE_WINDOW
                return self.store_plan(style, (motif, random.randrange(1 << 30)), "hum", 1.0, 0.0, 1.0, 1.0)
            text, tone, focus = read_prosody(text)
            # Both modes and the shy profile plan the katakana reading of foreign words.
            text, focus = self.foreign.speakable(text), focus and self.foreign.speakable(focus)
            if not text.strip():
                raise ValueError("Empty speech")
            if prosody == "j" and style in SHY_STYLES:
                plan = shape_shy_plan(self.synthesizer, text, style, self.ranges[style])
            elif prosody == "j":
                plan, _, _ = shape_plan(self.synthesizer, text, style, self.ranges[style], self.variety, tone, focus)
            else:
                plan = self.synthesizer.create_audio_query(text, style)
            bridged = prosody == "j" and style in SHY_STYLES and time.monotonic() < self.after_hum_until
            if bridged:
                ease_after_hum(plan)
                self.after_hum_until = 0.0
            body = self.store_plan(style, plan, prosody, plan.speed_scale, plan.pitch_scale, plan.intonation_scale, plan.volume_scale)
            if bridged:
                self.bridged.add(body["localPlanId"])
            return body

    def store_plan(self, style, plan, prosody, speed, pitch, intonation, volume):
        plan_id = str(uuid4())
        self.plans[plan_id] = (style, plan, prosody)
        while len(self.plans) > 32:
            expired, _ = self.plans.popitem(last=False)
            self.bridged.discard(expired)
        return {"localPlanId": plan_id, "speedScale": speed, "pitchScale": pitch,
                "intonationScale": intonation, "volumeScale": volume}

    def synthesize(self, body, style):
        with self.lock:
            expected_style, plan, prosody = self.plans.pop(body["localPlanId"])
            bridged = body["localPlanId"] in self.bridged
            self.bridged.discard(body["localPlanId"])
            if expected_style != style:
                raise ValueError("Voice does not match the plan")
            controls = {}
            for field, attribute, lower, upper in [
                ("speedScale", "speed_scale", 0.25, 4),
                ("pitchScale", "pitch_scale", -0.15, 0.15),
                ("intonationScale", "intonation_scale", 0, 2),
                ("volumeScale", "volume_scale", 0, 2),
            ]:
                value = float(body[field])
                if not math.isfinite(value) or not lower <= value <= upper:
                    raise ValueError("Invalid voice control")
                controls[attribute] = value
            if prosody == "hum":
                # The approved hum fixes its own tempo, key, and loudness. Speech controls do not apply.
                motif, seed = plan
                return render_hum(self.synthesizer, motif, seed)
            for attribute, value in controls.items():
                setattr(plan, attribute, value)
            plan.validate()
            wav = self.synthesizer.synthesis(plan, style, enable_interrogative_upspeak=prosody == "original")
            return inhale_bridge(wav, random.randrange(1 << 30)) if bridged else wav


class AiriVoicevoxHandler(BaseHTTPRequestHandler):
    # Persistent HTTP connections avoid truncated large WAV transfers in the desktop browser.
    protocol_version = "HTTP/1.1"

    def log_message(self, *_):
        # Requests contain private speech text. Do not log URLs or payloads.
        pass

    def do_OPTIONS(self):
        self.handle_request()

    def do_GET(self):
        self.handle_request()

    def do_POST(self):
        self.handle_request()

    def handle_request(self):
        origin = self.headers.get("Origin")
        if origin and origin != "null" and not re.fullmatch(r"http://(?:localhost|127\.0\.0\.1):\d+", origin):
            self.respond(403, {"error": "Origin denied"})
            return
        if self.command == "OPTIONS":
            self.respond(204, None, origin=origin)
            return
        route = urlsplit(self.path)
        try:
            if route.path == "/version" and self.command == "GET":
                self.respond(200, "airi-local-core-0.17.0", origin=origin)
                return
            if route.path == "/speakers" and self.command == "GET":
                self.respond(200, self.server.voice.speakers, origin=origin)
                return
            if self.command != "POST" or route.path not in {"/audio_query", "/synthesis"}:
                self.respond(404, {"error": "Unknown local speech endpoint"}, origin=origin)
                return
            query = parse_qs(route.query, keep_blank_values=True)
            style = int(query["speaker"][0])
            if style not in self.server.voice.styles:
                raise ValueError("Unknown voice")
            if route.path == "/audio_query":
                prosody = query.get("airi_prosody", ["j"])[0]
                self.respond(200, self.server.voice.create_plan(query["text"][0], style, prosody), origin=origin)
                return
            size = int(self.headers.get("Content-Length", "0"))
            if not 1 <= size <= 32768:
                raise ValueError("Invalid plan size")
            body = json.loads(self.rfile.read(size))
            wav = self.server.voice.synthesize(body, style)
            self.respond(200, wav, content_type="audio/wav", origin=origin)
        except (ValueError, KeyError, TypeError):
            self.respond(400, {"error": "Invalid or expired local speech plan"}, origin=origin)
        except Exception:
            self.respond(502, {"error": "Local Japanese speech failed. No fallback was attempted."}, origin=origin)

    def respond(self, status, value, content_type="application/json", origin=None):
        payload = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)) if status != 204 else "0")
        self.send_header("Cache-Control", "no-store")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()
        if status != 204:
            self.wfile.write(payload)
            self.wfile.flush()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=50021)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    # Browsers open idle sockets. ThreadingHTTPServer keeps these sockets from blocking speech requests.
    server = ThreadingHTTPServer(("127.0.0.1", args.port), AiriVoicevoxHandler)
    server.voice = LocalVoicevox(root / ".local" / "voicevox" / "runtime")
    print(f"AIRI local VOICEVOX ready on 127.0.0.1:{args.port}", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
