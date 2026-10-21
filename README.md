# Little Hafiz Quest

A fun, picture-and-gesture adventure that helps young children (around age 4–7) **memorize Juz ‘Amma**, sūrahs 78 to 114, by heart.

A grown-up who reads Arabic recites each āyah; the child listens, repeats and does a hand action. Every āyah has its own picture and movement, so the picture brings back the words. Step by step, the clues fade until the child recites with no help at all.

Your child's own little explorer starts in a meadow at An-Nās and climbs, sūrah by sūrah, through a forest, a beach, a desert canyon, starry hills and cloud cliffs to the top of the mountain at An-Naba’. Every memorized sūrah gives the explorer a gift to wear or keep: a cap, boots, a cape, a pet buddy, a golden staff.

**Play it:** https://akstudios.github.io/little-hafiz-quest/

Free, no ads, no accounts, no tracking. It works on iPhone, iPad, Android, and computers, and keeps working without internet once it's been opened.

<table>
  <tr>
    <td align="center"><img src="screenshots/splash.png" width="200" alt="Start screen: the explorer, seen from behind, looks out at the path to the mountain top"></td>
    <td align="center"><img src="screenshots/map.png" width="200" alt="The quest map: a winding path of sūrahs through the meadow, memorized ones shown in green"></td>
    <td align="center"><img src="screenshots/surah.png" width="200" alt="Inside a sūrah: numbered quest steps, with the next step glowing"></td>
    <td align="center"><img src="screenshots/explorer.png" width="200" alt="My Explorer: dress up the explorer with the treasures found so far"></td>
  </tr>
  <tr>
    <td align="center">Begin the quest</td>
    <td align="center">Climb the map</td>
    <td align="center">Follow the steps</td>
    <td align="center">Collect and dress up</td>
  </tr>
</table>

> [!IMPORTANT]
> This is a free helper for parents, not an authority on the Qur'an. The text and recitation come from public sources and are **not guaranteed to be free of mistakes**. Please check each āyah against a trusted muṣḥaf or teacher before teaching it. See the [Disclaimer](#disclaimer).

---

## How to play (for the grown-up)

1. **Make an explorer.** Tap **Begin**, pick a name, skin and hair (or hijab). Each child can have their own explorer, with their own stars and treasures (tap the name on the start screen).
2. **Walk the map.** Start at 🚩 An-Nās at the bottom and climb. Tap a sūrah: the explorer walks there and the lesson opens. The world list on the side jumps between worlds. You can go back to any sūrah at any time to revise.
3. **Follow the glowing step** in each sūrah:
   1. **👀 Look & Repeat.** Read the āyah. Your child repeats it three times while doing the action (pop a bubble each time), then says it with only the picture showing. After each new āyah, chain from the first āyah up to the new one.
   2. **Word Steps.** Build the āyah one word at a time, always going back to the first word. Tap any word to hear just that word. Then your child says it all while you reveal each word.
   3. **🐸 Stepping Stones.** Your child says each āyah and taps the frog to hop. Level 1 shows the picture and first word, Level 2 only the picture, and Level 3 no picture at all. **Grown-up help** shows you the āyah if you need it. Level 3 means it's memorized, and the sūrah's gift appears.
   4. **Review games:** 🧩 Picture Puzzle and 🔮 What Comes Next.
4. **Hearts.** Once a part has been learned, the review games (and Stepping Stones) have 3 hearts. A wrong pick, or the grown-up tapping **Not quite**, costs a heart. Losing all three drops the explorer's newest treasure at that sūrah on the map; finishing a game there brings it back. You can switch hearts off in the Grown-up Corner.
5. **Gifts.** Memorizing a sūrah gives its own treasure (they get shinier higher up the mountain). The first game finished each day gives a sticker. Open **My Explorer** (the backpack) to dress up and see the collection.

Longer sūrahs are split into checkpoints of a few āyāt; finish the checkpoints, then the 🏁 whole sūrah. Each sūrah also has a **tip for grown-ups**, sometimes with a toy to tap along (a bell, a drum, a clap).

Five to ten minutes a day is plenty. Stop while it's still fun.

The orange **Listen** button at the top plays the recitation of what's on screen. In the Grown-up Corner (⚙️) you can choose the reciter (Mishary Alafasy, Al-Husary's slow teaching recitation, Al-Minshawi or Abdul Basit), a dim night theme, simple meanings or transliteration, repeat or slow down the recitation, and manage explorers and stars.

## Versions

The newest version opens by default. Tap the version badge on the start screen (or Grown-up Corner → Version) to switch to the classic **v1**, which keeps the original island list. The choice is remembered on that device, and you can switch back the same way. If something goes wrong, opening https://akstudios.github.io/little-hafiz-quest/?latest always brings back the newest version.

## Put it on a phone like an app

**iPhone or iPad**
1. Open the link in **Safari**.
2. Tap **Share** → **Add to Home Screen**.
3. Open the game from the new Home Screen icon from now on. On iPhone, the Home Screen app keeps its own stars, separate from Safari.
4. For full offline use, go to ⚙️ Grown-up Corner → Offline → **Save all recitations** (about 21–35 MB for the chosen reciter, once).

**Android**
1. Open the link in **Chrome**.
2. Tap **⋮** → **Add to Home screen** (or **Install app**).
3. For full offline use: ⚙️ → Offline → **Save all recitations**.

**Computer**: just open the link. Chrome and Edge also offer an "Install" button in the address bar.

> Opening the `index.html` file straight from Files, WhatsApp or email on an iPhone shows a preview that can't run games. Always share the **link**.

## Privacy

- No accounts, analytics, ads or trackers.
- The game never contacts any other website. Every file it uses is in this repository.
- Stars and settings are stored only on the device (browser cookies and storage). Nothing is uploaded.

## Browser support

Safari on iOS and iPadOS 15 or later, Chrome, Edge, Firefox and Samsung Internet, on phones, tablets and computers.

---

## For developers

No build step and no dependencies: plain HTML, CSS and JavaScript.

```
index.html                 page shell, security policy, Home Screen metadata
css/game.css               styles (light and dim themes, screens, animations)
css/art.css                animations for the drawings (explorer walk, sparkles, swaying grass…)
js/boot.js                 opens the version a family chose (runs first)
js/data.js                 all content: Arabic text, memory cues and tips, checkpoints
js/art.js                  every drawing, as SVG: explorer, outfits, gifts, stickers, worlds, splash
js/map.js                  the quest map: winding path, worlds, curved-world scrolling, walking
js/game.js                 game logic: screens, explorers, gifts, hearts, recitation player
sw.js                      service worker: offline support
manifest.webmanifest       Home Screen app details
versions.json              the versions offered in the version chooser
audio/reciters.json        the reciters offered in the Grown-up Corner
audio/<reciter>/NNN.mp3    recitation, one file per sūrah (plus 001.mp3 for the Basmalah)
audio/<reciter>/timings.json  where each āyah and each word sits in those files
fonts/                     Amiri Quran and Baloo 2, with their licences
icons/                     app icons
tools/serve.py             local preview server
tools/build_audio.py       rebuilds the recitation files and timings (see below)
tools/art-gallery.html     every drawing on one page, for checking art changes
.github/workflows/         publishing to GitHub Pages
screenshots/               README pictures (not used by the game)
```

**Preview locally**

```
python3 tools/serve.py
```

Then open http://localhost:8000/. Use this rather than `python3 -m http.server`, because the audio player needs "Range" requests to jump to each āyah.

**Change a picture, action or meaning:** edit that āyah's line in `js/data.js`. Each āyah has `scene` (1–3 emoji), `hook`, `gesture`, `kid` (simple meaning) and `anim`. Keep scenes different within a sūrah.

**Change a tip for grown-ups:** edit the sūrah's `pattern` in `js/data.js`. An optional `toy` (for example `["🔔", "bell"]`) adds a button to tap along.

**Add or rebuild a reciter:** `python3 tools/build_audio.py --list` shows the reciters it knows; `python3 tools/build_audio.py minshawi` builds one. It needs `ffmpeg` (the script explains how to get one without installing anything system-wide). The script downloads each āyah from EveryAyah.com with Quran.com's word timings, joins them into one file per sūrah and writes `timings.json` and `audio/reciters.json`.

**Change a drawing or add a gift:** see the notes at the top of `js/art.js`, and check the result in `tools/art-gallery.html`.

**After any change:** bump `VERSION` in `sw.js` (and in `js/game.js`, which is shown in settings). Installed copies then pick up the new version on their next visit.

**Branches and deploy:** `main` is the newest version; `v1` is the classic version, kept on its own branch so it can still get fixes. The workflow in `.github/workflows/pages.yml` publishes `main` at the site root and `v1` in the `v1/` folder (GitHub Pages source: *GitHub Actions*). Pushing to either branch republishes the site within a few minutes. To add a version later, add its branch to the workflow and to `versions.json`; to retire one, remove it from both.

## Disclaimer

Little Hafiz Quest is a free tool, made only to help parents and other grown-ups teach young children. It is provided **"as is", without any warranty**.

- **No guarantee of correctness.** The Arabic text, recitation audio, āyah timings, simple meanings and transliterations come from public sources and were put together with care, but their accuracy and completeness are not guaranteed.
- **You are responsible for checking.** The grown-up using the game is responsible for making sure every āyah and recitation is correct before teaching it, by checking against a trusted muṣḥaf or a qualified teacher.
- **Not a replacement for a teacher.** The simple meanings are written for young children and are not a translation or tafsīr. The game supports, but does not replace, learning with a qualified Qur'an teacher.
- **No liability.** The author accepts no responsibility or liability for errors in the content, for anything a child learns incorrectly, or for any problem, loss or harm arising from using this game. Use it at your own risk.

See also the warranty and liability terms in [LICENSE](LICENSE).

## Credits and licences

- **Code and drawings** (`index.html`, `css/`, `js/boot.js`, `js/game.js`, `js/map.js`, `js/art.js`, `sw.js`, `tools/`, `manifest.webmanifest`, `icons/`): MIT, see [LICENSE](LICENSE).
- **Qur'an text** in `js/data.js`: from [quran-json](https://github.com/risan/quran-json) by Risan Bagja Pradana (Uthmani text from [The Noble Qur'an Encyclopedia](https://quranenc.com)), licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). `js/data.js` adapts it (open tanwīn marks converted to standard Unicode, memory cues added) and is shared under CC BY-SA 4.0 as well.
- **Memory cues, simple meanings and transliterations** in `js/data.js`: written for this project, CC BY-SA 4.0. The simple meanings are written for young children and are not a translation; see a full tafsīr for detail.
- **Recitation** in `audio/`: Sheikh Mishary Rashid Alafasy, Sheikh Mahmoud Khalil Al-Husary (Muallim), Sheikh Mohamed Siddiq Al-Minshawi and Sheikh Abdul Basit Abdul Samad, from [EveryAyah.com](https://everyayah.com), joined into one file per sūrah. Word timings from [Quran.com](https://quran.com). Included for free, non-commercial educational use; all rights to the recordings remain with their owners.
- **Fonts**: [Amiri Quran](https://github.com/aliftype/amiri) by Khaled Hosny and [Baloo 2](https://github.com/EkType/Baloo2) by Ek Type, both under the SIL Open Font License 1.1 (see `fonts/`).
- **Āyah pictures** are the device's own emoji, so they look slightly different on each phone. The explorer, gifts and worlds are drawn for this project (`js/art.js`).
