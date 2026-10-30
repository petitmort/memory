# Cat reaction voices

The room pairs six prepared voice profiles with six matching movement profiles. The labels describe the interaction's expression (content, curious, affectionate, sleepy, playful and stretching), rather than identifying a recorded animal's emotional state. All calls come from two actual cat recordings by **Joseph Sardin / BigSoundBank**, identified as **CC0 / public-domain equivalent** in the source mirror's [pinned asset credits](https://github.com/druboni/find-the-cat/blob/0ee6eb153807ebff3c50cdff5778830b74e36b5a/CREDITS.md). No generated meow, movie or music recording was added for these reactions.

## Source recordings

- **Purr:** [“Cat Purr” (#0436)](https://bigsoundbank.com/detail-0436-cat-purr.html), obtained from [purr_found.wav at the pinned commit](https://github.com/druboni/find-the-cat/blob/0ee6eb153807ebff3c50cdff5778830b74e36b5a/assets/audio/purr_found.wav). SHA-256 `5369107ebb93ed4ef4e88f41f91b8a89c35994f135ed655652e514f28791af20`.
- **Call A:** the complete 0.552-second [meow.ogg at the same pinned commit](https://github.com/druboni/find-the-cat/blob/0ee6eb153807ebff3c50cdff5778830b74e36b5a/assets/audio/meow.ogg). SHA-256 `4f542f766a47b36d9424125796c837ecedc22fd159972188c17e5e581425cc64`.
- **Call B:** the complete 0.758667-second [meow2.ogg at the same pinned commit](https://github.com/druboni/find-the-cat/blob/0ee6eb153807ebff3c50cdff5778830b74e36b5a/assets/audio/meow2.ogg). SHA-256 `5d10312029da24309775277657c9bc561ab237c3f1cd5034ff447a77e10eb47d`.
- The mirror credits its two meow files collectively as BigSoundBank's “Little meow of a cat” #1 and #9. No unverified original item number is assigned to either individual file.
- **CC0 legal text:** <https://creativecommons.org/publicdomain/zero/1.0/>. The mirror's MIT license applies to its game source, not these recordings; its credits identify the audio separately as CC0.

## Timing and processing

Each profile is one mono 44.1 kHz MP3 at 80 kb/s, including its purr, silence and all meows. Times below refer to the decoded sample timeline; encoded MP3 padding is excluded. Call tails remain intact. There are no independently scheduled trailing sounds that could continue after cancellation.

| Profile | Local asset | Purr end | Call windows, seconds | Decoded duration | Bytes |
| --- | --- | ---: | --- | ---: | ---: |
| Content | `src/assets/cat-purr.mp3` | 2.600 | A: 2.760000–3.312018 | 3.312018 s | 33,742 |
| Curious | `src/assets/cat-curious.mp3` | 0.850 | A: 1.200000–1.730794 | 1.730794 s | 18,069 |
| Affectionate | `src/assets/cat-affectionate.mp3` | 1.450 | A: 1.650000–2.202018; A: 2.380000–2.943288 | 2.943288 s | 30,085 |
| Sleepy | `src/assets/cat-sleepy.mp3` | 2.200 | B: 2.400000–3.207120 | 3.207120 s | 32,697 |
| Playful | `src/assets/cat-playful.mp3` | 0.750 | A: 1.100000–1.620771; B: 1.950000–2.679524 | 2.679524 s | 27,473 |
| Stretch | `src/assets/cat-stretch.mp3` | 2.500 | B: 2.720000–3.478685 | 3.478685 s | 35,571 |

The original content profile is unchanged (SHA-256 `3a2eaf194631cf421c307326408db67407fd020987b960b3973d9fdfe2523cc1`). It retains the 0.60–3.20 second purr excerpt, 22 Hz high-pass / 1.8 kHz low-pass, −2 dB gain and 100 ms / 400 ms fades. Its complete call A follows after 160 ms of silence, with 80 Hz / 6 kHz filtering, −7.5 dB gain and 15 ms / 70 ms fades.

New profiles use shorter excerpts of that same filtered purr, with 100 ms fade-in and up to 300 ms fade-out. Both calls retain their full recorded tails and use 80 Hz / 6 kHz filtering with 15 ms / 70 ms fades. Call A's base gain is −7.5 dB; call B's is −10 dB to keep the louder recording gentle. The curious call runs at 1.04× speed (+0.5 dB); affectionate uses A at 1.00× then 0.98× (second call −1 dB); sleepy uses B at 0.94× (−1.5 dB); playful uses A at 1.06× and B at 1.04× (B −0.5 dB); stretch uses B at 1.00× (−0.75 dB). These small offline speed changes alter pitch and duration together, preserving the recorded voice rather than synthesizing another cat.

All six assets total **177,637 bytes**. Their mono decoded sample buffers total **3,060,792 bytes**; preparation is independent of scene readiness and uses the existing room AudioContext. Decoded waveform checks found no clipping. These checks establish timing and signal limits; no subjective listening claim is made.

## Playback and synchronization

A reaction selects one profile once. The voice controller plays that exact profile using a single BufferSource; the animation samples a clock captured from the same source start. The quiet settling motion can continue after the voice ends, and a later interaction cannot rebind that old clock. Reduced-motion mode preserves the sound timing and lowers movement amplitude.

Each recording fetches and decodes once. A missing or late profile remains silent for that gesture; it does not substitute a differently timed meow or start a queued voice later. Other prepared profiles remain usable. Muting, reading, hiding the page, interrupting the audio device or disposal cancels the complete active recording, including any second call, without autoplay on return. No extra AudioContext or overlap is introduced.

Original recordings, pinned credit evidence, the deterministic composition script and decoded sample metrics are retained in `.work/cat-audio/`, `.work/cat-meow/` and `.work/cat-random-audio/` in the authoring workspace. Original unprocessed recordings are not shipped. CC0 adds no attribution obligation; the provenance is retained voluntarily.
