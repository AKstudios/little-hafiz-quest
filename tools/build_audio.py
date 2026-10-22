#!/usr/bin/env python3
"""Build the recitation audio for Little Hafiz Quest (one MP3 per sūrah, per reciter).

Usage (from the project folder):
    python3 tools/build_audio.py alafasy minshawi      # build these reciters
    python3 tools/build_audio.py --all                 # build every reciter in RECITERS
    python3 tools/build_audio.py --list                # show the reciters you can build
    python3 tools/build_audio.py --index-only          # only rewrite audio/reciters.json

Options:
    --ffmpeg PATH   the ffmpeg program (default: $FFMPEG, else `ffmpeg` on your PATH).
                    No ffmpeg? `python3 -m venv v && v/bin/pip install imageio-ffmpeg` ships one:
                    v/bin/python -c "import imageio_ffmpeg as i; print(i.get_ffmpeg_exe())"
    --cache DIR     where downloads are kept between runs (default: $LHQ_AUDIO_CACHE,
                    else ~/.cache/little-hafiz-quest-audio). Re-runs never re-download.

What it makes, for each reciter <slug>:
    audio/<slug>/NNN.mp3       one file per sūrah: 078 … 114, and 001 for the Basmalah.
                               Layout: 0.25 s silence, āyah 1, 0.45 s silence, āyah 2, …,
                               last āyah, 0.3 s silence. Mono, 44.1 kHz, CBR 48 kbps.
    audio/<slug>/timings.json  {"reciter", "name", "kbps", "surahs": {"78": [[start, end,
                               [[wordStart, wordEnd], …]], …], …}}: one entry per āyah, one
                               word range per *game* word (see words_of below), in seconds.
And audio/reciters.json, the list of reciters the game offers (rebuilt from what exists).

Why build our own files instead of linking to a recitation site? The game must work offline
(it is installed as a PWA) and must play a single āyah, or even a single word, on demand. So we
take the per-āyah recordings from EveryAyah.com together with the word timings Quran.com
publishes for exactly those recordings, and join them into one file per sūrah. Every āyah is
decoded to raw PCM, the PCM is joined, and the result is encoded to MP3 once; all offsets are
computed from exact sample counts, so the word timings line up with the final file.

Game words vs Quran.com words: the game splits the Arabic text in js/data.js on spaces (and glues
a lone pause mark onto the word before it). Quran.com's text follows a slightly different
spelling in a few places, so the word counts can differ. Where they match, timings map 1:1.
Where they don't, both texts are reduced to bare letters and lined up letter by letter; each
game word then takes the time span of its letters (time inside a Quran.com word is shared out in
proportion to letter count). Every such āyah is printed during the build.

Only the Python standard library is used, plus the ffmpeg program.
"""
import argparse
import concurrent.futures
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_DIR = os.path.join(ROOT, 'audio')
DATA_JS = os.path.join(ROOT, 'js', 'data.js')

# slug: (Quran.com recitation id, display name, short note for the reciter picker)
# These are EveryAyah.com āyah-by-āyah recordings for which Quran.com has word timings.
# To add a reciter: add one line here, then run `python3 tools/build_audio.py <slug>`.
RECITERS = {
    'alafasy':        (7,  'Mishary Rashid Alafasy', 'Clear and melodic'),
    'husary-muallim': (12, 'Mahmoud Khalil Al-Husary (Muallim, teaching style)',
                       'Slow teaching style, made for learners'),
    'minshawi':       (9,  'Mohamed Siddiq Al-Minshawi (Murattal)', 'Classic, clear and steady'),
    'abdulbasit':     (2,  'Abdul Basit Abdul Samad (Murattal)', 'Beloved classic voice, unhurried'),
    # Also available (Quran.com recitations with word segments):
    # 'abdulbasit-mujawwad': (1,  'Abdul Basit Abdul Samad (Mujawwad)', '...'),
    # 'sudais':              (3,  'Abdur-Rahman as-Sudais', '...'),
    # 'shatri':              (4,  'Abu Bakr al-Shatri', '...'),
    # 'rifai':               (5,  'Hani ar-Rifai', '...'),
    # 'husary':              (6,  'Mahmoud Khalil Al-Husary', '...'),
    # 'minshawi-mujawwad':   (8,  'Mohamed Siddiq Al-Minshawi (Mujawwad)', '...'),
    # 'shuraym':             (10, 'Saud ash-Shuraym', '...'),
    # 'tablawi':             (11, 'Mohamed al-Tablawi', '...'),
}
SOURCE = 'EveryAyah.com via Quran.com'

SURAHS = [1] + list(range(78, 115))      # 1 = the Basmalah (Sūrah 1, āyah 1 only)
API = 'https://api.quran.com/api/v4'
RATE = 44100                             # samples per second, mono
KBPS = 48
LEAD, GAP, TAIL = 0.25, 0.45, 0.3        # seconds of silence: before, between, after the āyāt
# Seconds to move every word boundary later (not the first word's start). 0 keeps Quran.com's
# times exactly. Measured on all four reciters, the quietest point between two words sits on
# average 40-70 ms *after* Quran.com's boundary (boundaries are placed where a word's closure
# begins), so ~0.05 gives cleaner cuts when a single word is played. Kept at 0 so the data is
# Quran.com's own; change it here and rebuild if single words sound clipped.
WORD_SHIFT = 0.0
MAX_PARALLEL = 4                         # downloads at once (be kind to the servers)
USER_AGENT = 'LittleHafizQuest-audio-builder/2 (+https://github.com/akramali/little-hafiz-quest)'


# ---------------------------------------------------------------- game text (js/data.js)

# Copied from js/game.js (AR_LETTER and wordsOf) so the word lists here are the game's words.
AR_LETTER = re.compile('[ء-يٮ-ۓۺ-ۼ]')


def words_of(ar):
    out = []
    for t in re.split(r'\s+', ar):
        if not t:
            continue
        if AR_LETTER.search(t) or not out:
            out.append(t)
        else:
            out[-1] += ' ' + t
    return out


def load_game_text():
    """Return {sūrah number: [āyah Arabic text, …]} from js/data.js, with 1 = the Basmalah.

    data.js is plain data with one āyah object (valid JSON) per line, so we read it line by line
    instead of running it as JavaScript."""
    text = {}
    current = None
    with open(DATA_JS, encoding='utf-8') as f:
        for line in f:
            s = line.strip()
            m = re.match(r'bismillah:\s*(".*")\s*,?$', s)
            if m:
                text[1] = [json.loads(m.group(1))]
                continue
            m = re.match(r'n:\s*(\d+)\s*,', s)
            if m:
                current = int(m.group(1))
                text[current] = []
                continue
            if s.startswith('{"ar":') and current is not None:
                text[current].append(json.loads(s.rstrip(','))['ar'])
    missing = [n for n in SURAHS if not text.get(n)]
    if missing:
        sys.exit(f'Could not read the Arabic text of sūrah(s) {missing} from {DATA_JS}')
    return text


# ---------------------------------------------------------------- downloads (cached)

def fetch(url, dest, check=None):
    """Download url to dest unless dest already exists. Retries with growing pauses."""
    if os.path.exists(dest):
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
            if check:
                check(body)
            tmp = dest + '.part'
            with open(tmp, 'wb') as f:
                f.write(body)
            os.replace(tmp, dest)
            return dest
        except (urllib.error.URLError, OSError, ValueError) as e:
            if isinstance(e, urllib.error.HTTPError) and e.code == 404:
                raise
            wait = 2 ** attempt
            print(f'    retry in {wait}s ({e}): {url}', file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f'Download failed: {url}')


def check_json(body):
    json.loads(body)


def check_mp3(body):
    # An MP3 starts with an ID3 tag or an MPEG frame sync. Anything else (an HTML error page…)
    # is rejected so it never lands in the cache.
    if len(body) < 1000 or not (body[:3] == b'ID3' or (body[0] == 0xFF and body[1] & 0xE0 == 0xE0)):
        raise ValueError('not an MP3 file')


def api_verses(cache, rid, surah):
    """All verses of a sūrah (or just 1:1 for the Basmalah) with audio URL, segments and words."""
    folder = os.path.join(cache, 'api', str(rid))
    if surah == 1:
        url = f'{API}/verses/by_key/1:1?audio={rid}&words=true&word_fields=text_uthmani'
        path = fetch(url, os.path.join(folder, '001.json'), check_json)
        with open(path, encoding='utf-8') as f:
            return [json.load(f)['verse']]
    verses, page = [], 1
    while page:
        url = (f'{API}/verses/by_chapter/{surah}?audio={rid}&per_page=50&page={page}'
               f'&words=true&word_fields=text_uthmani')
        path = fetch(url, os.path.join(folder, f'{surah:03d}_p{page}.json'), check_json)
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        verses += data['verses']
        page = data.get('pagination', {}).get('next_page')
    return verses


def audio_url(raw):
    if raw.startswith('//'):
        return 'https:' + raw
    if raw.startswith('http'):
        return raw
    return 'https://verses.quran.com/' + raw.lstrip('/')


def mp3_cache_path(cache, rid, url):
    # Keep the readable file name, plus a short hash of the full URL so two URLs never collide.
    name = re.sub(r'[^A-Za-z0-9._-]', '_', url.rsplit('/', 1)[-1])
    return os.path.join(cache, 'mp3', str(rid), hashlib.sha1(url.encode()).hexdigest()[:8] + '_' + name)


# ---------------------------------------------------------------- audio (ffmpeg)

def decode(ffmpeg, path):
    """Decode any audio file to raw 16-bit mono PCM at RATE. Returns bytes."""
    r = subprocess.run([ffmpeg, '-v', 'error', '-nostdin', '-i', path, '-vn', '-ac', '1',
                        '-ar', str(RATE), '-f', 's16le', '-acodec', 'pcm_s16le', '-'],
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if r.returncode != 0 or not r.stdout:
        raise RuntimeError(f'ffmpeg could not decode {path}: {r.stderr.decode(errors="replace")}')
    return r.stdout


def encode(ffmpeg, pcm, dest):
    tmp = dest + '.part.mp3'
    r = subprocess.run([ffmpeg, '-v', 'error', '-y', '-f', 's16le', '-ar', str(RATE), '-ac', '1',
                        '-i', '-', '-c:a', 'libmp3lame', '-b:a', f'{KBPS}k', '-ar', str(RATE),
                        '-ac', '1', '-map_metadata', '-1', tmp],
                       input=pcm, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if r.returncode != 0:
        raise RuntimeError(f'ffmpeg could not encode {dest}: {r.stderr.decode(errors="replace")}')
    os.replace(tmp, dest)


def silence(seconds):
    return b'\x00\x00' * round(seconds * RATE)


# ---------------------------------------------------------------- word timings

def letters(word):
    """The bare letters of a word, so different spelling conventions compare equal."""
    s = ''.join(AR_LETTER.findall(word)).replace('ـ', '')    # drop tatweel
    return re.sub('[أإآٱ]', 'ا', s).replace('ى', 'ي')


def word_times(verse, length):
    """Quran.com's word timings for one verse, relative to the start of the verse's own file.

    Returns (words, spans, raw): the verse's words (char_type "word"), one (start, end) in seconds
    per word or None where unknown, and every parsed segment as (start, end) for repairs.
    Segments are [index, wordPosition, startMs, endMs]; numbers may come as strings. A few
    entries have start and end swapped (e.g. Abdul Basit 96:7 [750, 400] before a word starting
    at 760), so a backwards entry is swapped when that fits between its neighbours."""
    words = [w for w in verse.get('words', []) if w.get('char_type_name') == 'word']
    raw = []
    for seg in verse.get('audio', {}).get('segments') or []:
        try:
            pos, a, b = int(seg[1]), float(seg[2]) / 1000, float(seg[3]) / 1000
        except (TypeError, ValueError, IndexError):
            continue
        raw.append((pos, max(0.0, min(a, length)), max(0.0, min(b, length))))
    times = {}
    for k, (pos, a, b) in enumerate(raw):
        if b < a:
            prev_end = max([y for _, x, y in raw[:k] if y > x] or [0.0])
            next_start = min([x for _, x, y in raw[k + 1:] if y > x] or [length])
            if b >= prev_end - 0.02 and a <= next_start + 0.02:
                a, b = b, a
        if b > a and pos not in times:            # first entry wins if a word is repeated
            times[pos] = (a, b)
    return words, [times.get(w['position']) for w in words], [(a, b) for _, a, b in raw]


def rhythm(verse, count):
    """Where the word boundaries fall in a complete verse, as fractions of its speech (0..1).
    None if this verse's segments are incomplete."""
    words, spans, _ = word_times(verse, 1e9)
    if len(words) != count or None in spans or any(spans[k][0] < spans[k - 1][1] - 0.02
                                                   for k in range(1, count)):
        return None
    lo, hi = spans[0][0], spans[-1][1]
    return [((spans[k][1] + spans[k + 1][0]) / 2 - lo) / (hi - lo) for k in range(count - 1)]


def repair(raw, refs, count, length):
    """Word spans for a verse whose segments are incomplete, using the rhythm of other reciters.

    Missing segments usually come with wrong neighbours (Minshawi 105:4 has 3 segments for 4
    words, and its third word, a short "min", gets 0.9 s), so instead of trusting what is left we
    spread the words over this verse's speech the way the other reciters do (tajwīd lengths make
    that rhythm very similar between murattal reciters), then snap each boundary to a nearby
    boundary from the segments that do exist."""
    lo = min(min(a, b) for a, b in raw)
    hi = max(max(a, b) for a, b in raw)
    fracs = [sum(r[k] for r in refs) / len(refs) for k in range(count - 1)]
    known = [(raw[k][1] + raw[k + 1][0]) / 2 for k in range(len(raw) - 1)
             if raw[k][0] < raw[k][1] <= raw[k + 1][0] < raw[k][1] + 0.1]
    cuts = []
    for f in fracs:
        t = lo + f * (hi - lo)
        near = [c for c in known if abs(c - t) < 0.3 and c > (cuts[-1] if cuts else lo) + 0.05]
        cuts.append(min(near, key=lambda c: abs(c - t)) if near else t)
    edges = [lo] + cuts + [hi]
    return [(edges[k] + (0.005 if k else 0), edges[k + 1] - (0.005 if k < count - 1 else 0))
            for k in range(count)]


def fill_gaps(spans, weights, length):
    """Give every word without a range (None) one, using its neighbours.

    A run of unknown words between two known ones normally shares the gap between them, by
    weight (letter count). But a missing segment usually means the neighbouring segment already
    covers the missing word(s) (e.g. Minshawi 81:21 has one segment spanning all 3 words), and
    the start/end of a file is silence. So when the gap is too short for speech, or the run is
    at the start/end of the āyah, the run is merged with its neighbour (the one that is longest
    for its letters) and that combined time is shared out by weight."""
    n = len(spans)
    out = list(spans)
    w = [x or 1 for x in weights]
    i = 0
    while i < n:
        if out[i] is not None:
            i += 1
            continue
        j = i
        while j < n and out[j] is None:
            j += 1
        left, right = (i - 1 if i > 0 else None), (j if j < n else None)
        if left is None and right is None:                       # nothing known at all
            first, last, lo, hi = i, j - 1, 0.0, length
        elif left is not None and right is not None and \
                out[right][0] - out[left][1] >= 0.12 * (j - i):  # a real gap: use it
            first, last, lo, hi = i, j - 1, out[left][1], out[right][0]
        else:
            pace = lambda k: (out[k][1] - out[k][0]) / w[k]
            if right is None or (left is not None and pace(left) >= pace(right)):
                first, last, lo, hi = left, j - 1, out[left][0], out[left][1]
            else:
                first, last, lo, hi = i, right, out[right][0], out[right][1]
        total = sum(w[first:last + 1])
        t = lo
        for k in range(first, last + 1):
            step = (hi - lo) * w[k] / total
            out[k] = (t, t + step)
            t += step
        i = last + 1
    return out


def align(game_words, qc_letters, qc_spans):
    """Map Quran.com word spans onto game words via their letters (see the docstring at top)."""
    # One time per letter edge: letter k of Quran.com word w spans a slice of w's time range.
    q_text, q_start, q_end = '', [], []
    for lt, (a, b) in zip(qc_letters, qc_spans):
        lt = lt or '?'
        for k in range(len(lt)):
            q_start.append(a + (b - a) * k / len(lt))
            q_end.append(a + (b - a) * (k + 1) / len(lt))
        q_text += lt
    g_letters = [letters(w) or '?' for w in game_words]
    g_text = ''.join(g_letters)
    # Map each game letter index to a Quran.com letter index.
    to_q = [None] * len(g_text)
    for blk in difflib.SequenceMatcher(None, g_text, q_text, autojunk=False).get_matching_blocks():
        for k in range(blk.size):
            to_q[blk.a + k] = blk.b + k
    spans, pos = [], 0
    for lt in g_letters:
        idx = [to_q[k] for k in range(pos, pos + len(lt)) if to_q[k] is not None]
        spans.append((q_start[min(idx)], q_end[max(idx)]) if idx else None)
        pos += len(lt)
    return spans


def tidy(spans, window_start, window_end):
    """Round to whole milliseconds and make the ranges valid: start < end, in order, no overlap,
    inside the āyah window. Real data almost never needs more than the rounding."""
    lo, hi = round(window_start * 1000), round(window_end * 1000)
    out, prev, n = [], lo, len(spans)
    for i, (a, b) in enumerate(spans):
        a = min(max(round(a * 1000), prev), hi - 2 * (n - i))        # leave 2 ms per word to come
        b = min(max(round(b * 1000), a + 1), hi - 2 * (n - i - 1))
        out.append([a / 1000, b / 1000])
        prev = b
    return out


# ---------------------------------------------------------------- building one reciter

def reference_verses(cache, rid, surah, index):
    """The same verse from the other reciters in RECITERS (used only to repair broken timings)."""
    out = []
    for other, _name, _note in RECITERS.values():
        if other != rid:
            verses = api_verses(cache, other, surah)
            if index < len(verses):
                out.append(verses[index])
    return out


def build_reciter(slug, ffmpeg, cache, game):
    rid, name, _note = RECITERS[slug]
    print(f'\n== {slug} (Quran.com recitation {rid}): {name}')
    out_dir = os.path.join(AUDIO_DIR, slug)
    os.makedirs(out_dir, exist_ok=True)

    verses = {n: api_verses(cache, rid, n) for n in SURAHS}
    for n in SURAHS:
        if len(verses[n]) != len(game[n]):
            sys.exit(f'Sūrah {n}: Quran.com has {len(verses[n])} āyāt, data.js has {len(game[n])}')

    jobs = []
    for n in SURAHS:
        for v in verses[n]:
            url = audio_url(v['audio']['url'])
            jobs.append((url, mp3_cache_path(cache, rid, url)))
    todo = [j for j in jobs if not os.path.exists(j[1])]
    print(f'   {len(jobs)} āyah files, {len(todo)} to download')
    with concurrent.futures.ThreadPoolExecutor(MAX_PARALLEL) as pool:
        for k, _ in enumerate(pool.map(lambda j: fetch(j[0], j[1], check_mp3), todo), 1):
            if k % 50 == 0:
                print(f'   … {k}/{len(todo)}')

    timings, mismatches = {}, []
    for n in SURAHS:
        pcm, pos, ayat = [silence(LEAD)], round(LEAD * RATE), []    # pos counts samples
        for i, v in enumerate(verses[n]):
            url = audio_url(v['audio']['url'])
            data = decode(ffmpeg, mp3_cache_path(cache, rid, url))
            if i:
                pcm.append(silence(GAP))
                pos += round(GAP * RATE)
            pcm.append(data)
            length = (len(data) // 2) / RATE
            start, end = pos / RATE, (pos + len(data) // 2) / RATE
            pos += len(data) // 2

            game_words = words_of(game[n][i])
            qc_words, qc_spans, raw = word_times(v, length)
            qc_letters = [letters(w.get('text_uthmani') or w.get('text') or '') for w in qc_words]
            note = None
            if None in qc_spans:
                bad = sum(s is None for s in qc_spans)
                refs = [r for r in (rhythm(rv, len(qc_words))
                                    for rv in reference_verses(cache, rid, n, i)) if r]
                if refs and raw:
                    qc_spans = repair(raw, refs, len(qc_words), length)
                    note = (f'{bad} of {len(qc_words)} words without a usable segment: rebuilt '
                            f'from the rhythm of {len(refs)} other reciter(s)')
                else:
                    qc_spans = fill_gaps(qc_spans, [len(x) for x in qc_letters], length)
                    note = f'{bad} word(s) without a usable segment, interpolated'
            if len(qc_words) == len(game_words):
                spans = qc_spans
            else:
                spans = align(game_words, qc_letters, qc_spans)
                missing = sum(s is None for s in spans)
                spans = fill_gaps(spans, [len(letters(w)) for w in game_words], length)
                note = (f'{len(qc_words)} Quran.com words vs {len(game_words)} game words, '
                        f'aligned by letters' + (f' ({missing} interpolated)' if missing else '')
                        + (f'; {note}' if note else ''))
            if note:
                mismatches.append((n, i + 1, note,
                                   ' | '.join(w.get('text_uthmani', '') for w in qc_words),
                                   ' | '.join(game_words)))
            if WORD_SHIFT:
                spans = [(a + (WORD_SHIFT if k else 0), min(length, b + WORD_SHIFT))
                         for k, (a, b) in enumerate(spans)]
            wspans = tidy([(start + a, start + b) for a, b in spans], round(start, 3), round(end, 3))
            ayat.append([round(start, 3), round(end, 3), wspans])
        pcm.append(silence(TAIL))
        pos += round(TAIL * RATE)
        encode(ffmpeg, b''.join(pcm), os.path.join(out_dir, f'{n:03d}.mp3'))
        timings[str(n)] = ayat
        print(f'   {n:03d}.mp3  {len(ayat)} āyāt, {pos / RATE:.1f} s')

    with open(os.path.join(out_dir, 'timings.json'), 'w', encoding='utf-8') as f:
        json.dump({'reciter': slug, 'name': name, 'kbps': KBPS, 'surahs': timings}, f,
                  separators=(',', ':'), ensure_ascii=False)
        f.write('\n')
    if mismatches:
        print(f'   Āyāt needing special handling ({len(mismatches)}):')
        for n, a, note, qc, gm in mismatches:
            print(f'     {n}:{a}  {note}\n         quran.com: {qc}\n         game:      {gm}')
    return mismatches


def write_index():
    """Rewrite audio/reciters.json from the reciter folders that are complete."""
    index = []
    for slug, (_rid, name, note) in RECITERS.items():
        folder = os.path.join(AUDIO_DIR, slug)
        needed = ['timings.json'] + [f'{n:03d}.mp3' for n in SURAHS]
        if not all(os.path.isfile(os.path.join(folder, x)) for x in needed):
            continue
        size = sum(os.path.getsize(os.path.join(folder, x)) for x in os.listdir(folder)
                   if os.path.isfile(os.path.join(folder, x)))
        index.append({'id': slug, 'name': name, 'note': note,
                      'mb': round(size / 1e6, 1), 'source': SOURCE})
    with open(os.path.join(AUDIO_DIR, 'reciters.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print(f'\naudio/reciters.json: {", ".join(r["id"] + " " + str(r["mb"]) + " MB" for r in index)}')


if __name__ == '__main__':
    p = argparse.ArgumentParser(description='Build per-sūrah recitation MP3s and word timings.')
    p.add_argument('reciters', nargs='*', help='reciter slugs (see --list)')
    p.add_argument('--all', action='store_true', help='build every reciter in RECITERS')
    p.add_argument('--list', action='store_true', help='list the reciters and exit')
    p.add_argument('--index-only', action='store_true', help='only rewrite audio/reciters.json')
    p.add_argument('--ffmpeg', default=os.environ.get('FFMPEG', 'ffmpeg'))
    p.add_argument('--cache', default=os.environ.get('LHQ_AUDIO_CACHE', os.path.join(
        os.path.expanduser('~'), '.cache', 'little-hafiz-quest-audio')))
    args = p.parse_args()

    if args.list:
        for slug, (rid, name, _) in RECITERS.items():
            print(f'{slug:16} {rid:3}  {name}')
        sys.exit()
    slugs = list(RECITERS) if args.all else args.reciters
    unknown = [s for s in slugs if s not in RECITERS]
    if unknown:
        sys.exit(f'Unknown reciter(s): {", ".join(unknown)}. Try --list.')
    if not slugs and not args.index_only:
        p.error('name at least one reciter, or use --all')
    if slugs:
        ffmpeg = shutil.which(args.ffmpeg) or args.ffmpeg
        if not os.path.isfile(ffmpeg):
            sys.exit(f'ffmpeg not found ({args.ffmpeg}). Use --ffmpeg PATH or set FFMPEG.')
        game = load_game_text()
        for slug in slugs:
            build_reciter(slug, ffmpeg, os.path.abspath(args.cache), game)
    write_index()
