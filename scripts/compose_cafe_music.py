"""Render the original café loop to a stereo WAV for AAC encoding."""

import argparse
from array import array
from functools import lru_cache
import math
from pathlib import Path
import random
import wave

RATE = 32000
BEAT = 60 / 76
BARS = 32
FRAMES = round(RATE * BEAT * 4 * BARS)
TAU = math.tau

# Fmaj9, Am9, Dm9, G13, Gm9, C13, Fmaj9, C13sus. Voicings leave space for bass.
CHORDS = (
    (29, (57, 60, 64, 67)), (33, (55, 59, 60, 64)),
    (38, (53, 57, 60, 64)), (31, (53, 57, 59, 64)),
    (31, (53, 57, 58, 62)), (36, (52, 58, 62, 69)),
    (29, (52, 55, 57, 60)), (36, (53, 58, 62, 67)),
)
MELODY = (
    ((1.57, 76), (2.25, 74), (3.08, 72)),
    ((0.57, 71), (1.57, 72), (2.87, 69)),
    ((1.05, 65), (1.76, 69), (3.02, 72), (3.57, 74)),
    ((0.07, 76), (1.63, 74), (2.55, 71)),
    ((0.08, 74), (1.50, 69), (2.22, 70), (3.60, 74)),
    ((0.10, 72), (1.66, 69), (3.12, 67)),
    ((0.15, 64), (0.68, 65), (2.17, 67), (3.57, 69)),
    ((0.15, 67), (1.50, 62)),
)


@lru_cache(maxsize=None)
def key(note, soft=False):
    omega = TAU * 440 * 2 ** ((note - 69) / 12)
    result = array("f")
    for frame in range(round(RATE * (2.2 if soft else 3.2))):
        t = frame / RATE
        attack = 1 - math.exp(-t * (115 if soft else 185))
        fade = min(1, ((2.2 if soft else 3.2) - t) * 7)
        phase = t * omega + 0.19 * math.sin(TAU * 0.48 * t + note * 0.2)
        tine = math.sin(phase + 0.48 * math.exp(-t * 3.6) * math.sin(phase * 2))
        lower = 0.22 * math.sin(phase * 0.998)
        overtone = 0.14 * math.sin(phase * 2.006) * math.exp(-t * 4.1)
        result.append((tine + lower + overtone) * attack * fade * math.exp(-t * (2.05 if soft else 1.62)))
    return result


@lru_cache(maxsize=None)
def bass(note, length):
    hz = 440 * 2 ** ((note - 69) / 12)
    result = array("f")
    for frame in range(round(RATE * length)):
        t = frame / RATE
        envelope = (1 - math.exp(-t * 105)) * math.exp(-t * 2.2) * min(1, (length - t) * 11)
        phase = TAU * hz * t + 0.16 * (1 - math.exp(-t * 26))
        result.append((math.sin(phase) + 0.28 * math.sin(phase * 2) +
                       0.08 * math.sin(phase * 3) * math.exp(-t * 9)) * envelope)
    return result


def drums():
    rng = random.Random(24)
    voices = [array("f"), array("f"), array("f"), array("f")]
    low = high = 0
    for frame in range(round(RATE * 0.44)):
        t = frame / RATE
        noise = rng.uniform(-1, 1)
        low += (noise - low) * 0.21
        high += (noise - high) * 0.59
        kick = math.sin(TAU * (47 * t + 2.4 * (1 - math.exp(-t * 24))))
        shell = math.sin(TAU * 176 * t) * math.exp(-t * 32)
        attack = min(1, t * 600)
        voices[0].append(kick * math.exp(-t * 17) * attack)
        voices[1].append((0.67 * (high - low * 0.65) * math.exp(-t * 21) + 0.21 * shell) * attack)
        voices[2].append((noise - high * 0.75) * math.exp(-t * 56) * attack)
        voices[3].append((high - low) * math.exp(-t * 11) * attack)
    return voices


def render(path):
    rng = random.Random(188)
    left = array("f", [0]) * FRAMES
    right = array("f", [0]) * FRAMES

    def mix(signal, time, level, pan, echo=0):
        start = round(time * RATE)
        gain_l = level * math.sqrt((1 - pan) / 2)
        gain_r = level * math.sqrt((1 + pan) / 2)
        for index, sample in enumerate(signal):
            cursor = (start + index) % FRAMES
            left[cursor] += sample * gain_l
            right[cursor] += sample * gain_r
        if echo:
            mix(signal, time + BEAT * 0.72, level * echo, -pan * 0.82)

    kick, brush, hat, soft_hat = drums()
    for bar in range(BARS):
        phrase, section = bar % 8, bar // 8
        root, chord = CHORDS[phrase]
        start = bar * 4 * BEAT
        piano = -0.28 if section % 2 == 0 else -0.17
        for beat, amount in ((0, 1), (1.63, 0.45), (2.53 if bar % 2 else 3.12, 0.65)):
            for index, note in enumerate(chord):
                mix(key(note), start + beat * BEAT + index * 0.013 + rng.uniform(-0.009, 0.009),
                    0.070 * amount * (0.89 + index * 0.07), piano + index * 0.14, 0.14)
        for beat, note, duration in ((0, root, 1.18), (1.63, root + 12, 0.42),
                                     (2.16, root + (7 if phrase != 4 else 12), 0.63),
                                     (3.57, CHORDS[(phrase + 1) % 8][0] - (1 if bar % 2 else -2), 0.28)):
            mix(bass(note, duration), start + beat * BEAT, 0.133 if beat == 0 else 0.091, 0)
        if section != 0 or phrase in (1, 3, 6, 7):
            for i, (beat, note) in enumerate(MELODY[phrase]):
                if section == 2 and i == 0:
                    continue
                mix(key(note, True), start + beat * BEAT, 0.095 if i == 0 else 0.073, 0.30, 0.23)
        for beat in (0, 1.61 if bar % 2 else 2.02, 2.66 if bar % 4 != 3 else 3.61):
            mix(kick, start + beat * BEAT, 0.22 if beat == 0 else 0.145, 0)
        for beat in (1.035, 3.034):
            mix(brush, start + beat * BEAT, 0.18, -0.16, 0.08)
        for beat in (0.02, 0.62, 1.17, 1.63, 2.03, 2.65, 3.13, 3.62):
            mix(soft_hat if beat in (1.63, 3.62) else hat, start + beat * BEAT,
                rng.uniform(0.024, 0.067), 0.43)
        if bar % 8 == 7:
            mix(brush, start + 3.67 * BEAT, 0.10, -0.12)

    samples = array("h")
    low = 0
    for i, (l, r) in enumerate(zip(left, right)):
        low += (rng.uniform(-1, 1) - low) * 0.045
        dust = low * 0.015 + rng.uniform(-0.0012, 0.0012)
        # A slow tape-level drift returns to the same value at the loop seam.
        drift = 1 + 0.033 * math.sin(i / FRAMES * TAU * 19)
        for value in (l, r):
            soft = math.tanh((value + dust) * 1.55) * drift * 0.79
            samples.append(round(soft * 32767))
    with wave.open(str(path), "wb") as out:
        out.setparams((2, 2, RATE, FRAMES, "NONE", "not compressed"))
        out.writeframes(samples.tobytes())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    render(parser.parse_args().output)
