# Cat petting voice

`src/assets/cat-purr.mp3` contains a short purr, a quiet 160 ms pause, then **one** short meow. Both recordings are by **Joseph Sardin / BigSoundBank** and are identified as **CC0 / public-domain equivalent** in the source mirror's [pinned asset credits](https://github.com/druboni/find-the-cat/blob/0ee6eb153807ebff3c50cdff5778830b74e36b5a/CREDITS.md).

- **Purr:** [“Cat Purr” (#0436)](https://bigsoundbank.com/detail-0436-cat-purr.html), obtained from [purr_found.wav at the pinned commit](https://github.com/druboni/find-the-cat/blob/0ee6eb153807ebff3c50cdff5778830b74e36b5a/assets/audio/purr_found.wav).
- **Meow:** the complete 0.552-second [meow.ogg at the same pinned commit](https://github.com/druboni/find-the-cat/blob/0ee6eb153807ebff3c50cdff5778830b74e36b5a/assets/audio/meow.ogg). The mirror credits its two meow files collectively as BigSoundBank's “Little meow of a cat” #1 and #9; no unverified original item number is assigned to this file here.
- **CC0 legal text:** <https://creativecommons.org/publicdomain/zero/1.0/>. The mirror's MIT license applies to its game source, not to these recordings; its credits identify the audio separately as CC0.

The purr retains the 0.60–3.20 second excerpt, filtered below 22 Hz and above 1.8 kHz, lowered by 2 dB, with 100 ms / 400 ms fades. The complete meow follows after 160 ms of silence. It is filtered below 80 Hz and above 6 kHz, lowered by 7.5 dB, and given 15 ms / 70 ms fades; its recorded tail is retained. Neither vocalization is repeated or synthesized.

The combined asset is mono 44.1 kHz MP3 at 80 kb/s: **3.312 seconds decoded, 33,742 bytes**. The purr occupies 0–2.600 seconds, the pause 2.600–2.760 seconds, and the single meow 2.760–3.312 seconds. Vite emits a content-hashed filename; original recordings are not shipped. Both sounds share one prepared buffer and playback source, so muting or interrupting petting cancels the whole response without queuing a later meow.

The accompanying pose follows the same playback clock: gentle nuzzling during the purr, an anticipatory head lift around the meow, and a soft return to sleep by four seconds. Reduced-motion mode lowers the pose amplitude while preserving this timing. The clock belongs to that particular play and continues through the quiet settling tail after the recording ends; it cannot attach an old gesture to a newer sound. If audio is not ready or its device is still resuming, that gesture stays silent rather than starting the recording late. No sound file, model or morph buffer was enlarged for this timing adjustment.

Original recordings, the pinned credit evidence and processing measurements are retained in the local authoring workspace at `.work/cat-audio/` and `.work/cat-meow/`. No attribution obligation is added by this adaptation; the original author and provenance are retained here voluntarily.
