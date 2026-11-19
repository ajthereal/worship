# Worship: rules for Claude sessions

Chord chart and set list app for AJ (keys player and music director at his church). He uses only iPhone and iPad, touch only. GitHub Pages serves this repo at https://ajthereal.github.io/worship/ . The repo is public, so never put data, tokens or secrets in it.

## Hard rules

- No lyrics, ever. Charts are chords and roadmap only (copyright). Do not add lyrics to charts, notes or examples.
- All UI text in English, short and plain. No marketing tone, no colon-setup phrases.
- Plain HTML, CSS and JS. No framework, no build step, no external libraries except the YouTube IFrame API script (loaded only in Practice).
- Anything that can fail must say why in plain words. Never fail silently.
- Do the work, do not hand AJ multi-step setup. He is the only user.
- Tap targets at least 44 px. Respect safe areas. It must work on iPhone portrait and iPad portrait and landscape.

## Files

Plain scripts loaded by `index.html` in this order, all with `?v=N`. No build step.

- `core.js`: pure logic, no DOM. Works as a plain script (`window.WCore`) and in Node. Chords, transposing, Nashville, lead-sheet model, typed-bar parser and serializer, beat grid maths, sheet storage chunking, old chart text parser (kept for migration), WhatsApp parser, YouTube ids, merge-by-id, share encode/decode, FFT and audio analysis.
- `js/ui.js`: DOM helpers (`h`, `add`, icons, toast, bottom sheet, theme).
- `js/demo.js`: the local Demo song and Demo set. Never synced.
- `js/store.js`: state `WS.S`, connection, Apps Script calls, sync engine for `wsongs`, `wsets`, `wsheets`.
- `js/synth.js`: soft piano and click from partials, no samples.
- `js/edit.js`: pure editing operations on a lead sheet (cells, chords, band, bars, undo history).
- `js/notation.js`: VexFlow staves plus our own SVG layer for chord symbols, marks, voltas, dynamics. Also the chord grid fallback.
- `js/audio.js`: Drive list and download into IndexedDB, peaks, analysis, pitch-shifted copies.
- `js/pitch-worker.js`: streaming phase vocoder in a Web Worker.
- `js/app.js`: router, tab bar, Songs, song menu, audio sheet, help, connect, settings.
- `js/sets.js`: Sets, WhatsApp paste, set view, share link, share view, song mode dispatcher.
- `js/live.js`, `js/transcribe.js`, `js/practice.js` (Practice and Listen), `js/keys.js` (Keys, mic, MIDI), `js/piano.js`.
- `vendor/vexflow-bravura.js` (VexFlow 4.2.5, global `Vex`, MIT, license in `vendor/VEXFLOW-LICENSE`).
- `css/app.css`: all styles. Light "paper" and dark via `data-theme`.
- `sw.js`: service worker. Network-first for `index.html` (4 s timeout, then cache), versioned shell cache for every file above, fonts cached separately, Apps Script calls and audio never cached (audio lives in IndexedDB).
- `tests/core.test.js`: `node tests/core.test.js`, no dependencies. Run it after any change to `core.js`.

When any app file changes: raise `V` in `sw.js` and every `?v=` in `index.html` (they must match, and `SHELL` in `sw.js` must list every file).

## Data (Google Sheet "HQ Data", through AJ's Apps Script)

API: `GET url?token=T&name=<tab>` returns `{rows:[...]}` or `{error:'token'|'server'|...}`. `POST url` with `Content-Type: text/plain` and body `{token, name, rows}` overwrites the whole tab. An empty write over data is refused (`empty-refused`). All values are strings. Reference: the HQ app (`getTab`, `postTab`).

Tab `wsongs`, columns: `id, title, artist, key, bpm, time, chart, yt, marks, notes, patch, updated, deleted, audio, audioName, grid`
- `key` is the key the chart is written in. `time` like `4/4` (text). `yt` is one YouTube link per line, optional label after a space. `marks` is JSON, section name to seconds. `patch` is the keyboard sound. `updated` is ISO. `audio` is a Drive file id (the audio file itself never goes through the Sheet), `audioName` its name, `grid` is the beat grid JSON `{b:[bar start seconds], end}`. `chart` is the old text chart, kept only so old songs migrate into a lead sheet on first open. `deleted` is `1` for a tombstone.

Tab `wsets`, columns: `id, date, name, items, raw, updated, deleted`
- `date` is `yyyy-mm-dd`. `raw` is the pasted WhatsApp text. `items` is a JSON array:
  - `{t:'song', song:<songId>, title, key:'E', to:'F', alt:'F', note, singer, only:'chorus', trans}`
  - `{t:'cue', text:'Prayer', trans}`
  - `key` is the key to play in (the chart is transposed from the song key to it). `to` means the song modulates to that key. `alt` is an alternative key. `only:'chorus'` shows only Chorus and Tag. `trans` is a keyboard note into the next item.

Sync rules (do not weaken):
- Rows merge by `id`, the newer `updated` wins. Deleting a row means setting `deleted:'1'` and a new `updated`. Never remove rows.
- Before every POST the tab is read fresh (GET) and merged. If the GET fails the change stays pending and is retried (on `online`, on focus, every 30 s after an error). Never POST a tab that was not just read.
- The app works fully on local data (localStorage keys `ws-songs`, `ws-sets`, `ws-meta`) when not connected, with a "Not connected" pill that opens the Connect sheet.
- Connection: `ws-conn` (saved from the Connect form or `#connect=`), else `hq-sync` (HQ's `{url, token}`, same origin). `#connect=<encodeURIComponent(base64 JSON {url,token})>` is stored and removed from the URL.

Tab `wsheets` (lead sheets), columns: `id, part, data, updated, deleted`
- `id` is the song id. `data` is `z` plus base64url of deflate-raw lead-sheet JSON (or `r` plus plain JSON when compression is not available), cut into parts of at most 40,000 characters (one row per part, `part` = 0, 1, 2). Max 300,000 characters per sheet. The rows of one `id` and `updated` form one version; the group with the newer `updated` wins whole. If two devices changed the same song, the older version is kept as a dated "conflict copy" song so nothing is lost.
- Deleting a song sets `deleted:'1'` on its rows with a new `updated`. Never remove rows.

Audio endpoints on the same Apps Script (read only):
- `GET ?token=T&name=_waudio` returns `{rows:[{id,name,size,mime,ts}], folder}` for the Drive folder "Worship Audio".
- `GET ?token=T&name=_file&id=<fileId>&part=<n>` returns `{n, part, size, mime, data}`. `n` is the number of parts, `size` the total bytes, `data` base64. Parts are 3 MB. The app downloads part by part into IndexedDB, retries each part 3 times, resumes, and checks the final size.

## Writing to the Sheet as Claude

When you write `wsongs` or `wsets` through the Google Sheets connector:
- Use RAW input (`valueInputOption: RAW`), not USER_ENTERED. Otherwise `4/4` becomes a date and `2026-11-21` becomes a serial number. The Apps Script writes text format.
- Keep the header row exactly as above. Fill every column (use empty strings). Give every row a unique `id` and an ISO `updated`.
- Append or update by `id`, never overwrite the whole tab with fewer rows. Never delete rows, set `deleted` to `1`.
- Match songs to the library by fuzzy title before creating a new `wsongs` row.

## Claude workflows

1. Screenshot of a WhatsApp song list: parse it like the app does (`Title (singer) KEY` or `KEY1/KEY2`, `/ Reff Only` means `only:'chorus'`, lines like `DOA` become cues such as `Prayer`, up to 2 YouTube links per song). Write a `wsets` row and new `wsongs` stubs (title, key, links, empty chart) with RAW input.
2. "Transcribe <song>": you cannot listen to YouTube. Write the sheet only from a progression AJ confirms, or from an audio file he uploads to the chat. Chords and roadmap only, no lyrics. Claude cannot write a `wsheets` row by hand easily (it is compressed), so give AJ the typed bars to paste into Transcribe instead.

## Lead sheet

Stored in `wsheets` as JSON, edited in Transcribe, drawn by `js/notation.js`.

```
{v:1, key:'E', mode:'major', time:'4/4', tempo:72, sub:8,
 bars:[{mark, label, key, time, tempo, repStart, repEnd, times, ending, segno, coda, ds, fine,
        double, final, dyn, hairpin, ferm, text, who, vamp, pickup, units, rep:'%',
        ch:[{at, c}],
        ev:[{at, d, k:'s'|'h'|'n'|'r', a, tie, p}]}]}
```

- `sub` is units per whole note (8 = eighths, 16 = sixteenths). `at` and `d` are in units from the bar start. `ch` are chord symbols. `ev` is the band rhythm: `s` slash comp, `h` hit, `n` pitched note or voicing (`p` is a list like `['C4','E4']`), `r` rest. `a` is the accent: `>`, `^` (marcato) or `.`. `tie` ties into the next event. A push is a one-unit hit tied into the next beat, with the chord one unit early.
- `mark` is the rehearsal letter, `label` the section name. `ending` is `'1.'` or `'2.'`. `ds` is the jump text (D.S. al Coda and so on). `key`, `time`, `tempo` on a bar are changes from that bar on. Chords are stored in the key in force at that bar.
- Transposing shifts every chord, pitch and key change by the same number of semitones. Spelling follows the key in force (F, Bb, Eb, Ab, Db, Gb and their relative minors use flats, others sharps). Nashville numbers are relative to the key in force and do not change when transposing.
- Section names: Reff and Ref = Chorus, Bait = Verse, Pre-Reff = Pre-Chorus, Ending = Outro. Chorus-only items show the Chorus and Tag sections.

### Typed bar syntax

One token per beat, separated by spaces. Enter goes to the next bar. Many bars can be pasted at once.

- `E` chord with comp slashes. `E!` chord as a hit. `!` a hit with no new chord. `^B/D#` push (chord one unit early, tied). `.` hold (comp: a new slash on the beat, hit: lengthened). `r` rest. `A,B` splits a beat in two (four in 16ths). `%` repeat the previous bar. `N.C.` no chord.
- Bar lines `|`, `||`, `|:`, `:|`, `|]`. `[A Intro]` before a bar is a rehearsal mark with a name. `1.` and `2.` start endings. `(text)` is a cue under the bar and is never transposed.
- Pitched lines and voicings are not typed. They are added in the bar grid with the piano or a MIDI keyboard.

### Old text charts

Songs written before the lead sheet have `chart` text (`[Section] | E | B | C#m |` lines, `xN` repeats, `>> F` modulations). `chartToSheet` converts them when the song is first opened. The text is left in the Sheet untouched.

## Share link

`index.html#share=<data>`. Data is `z` plus base64url of deflate-raw JSON (CompressionStream), or `r` plus base64url of plain JSON if compression is not available. JSON keys: `v, n` (name), `d` (date), `m` (made at), `i` (items). Song item: `s` title, `k` key, `t` to-key, `b` bpm, `g` singer, `o` note, `y` chorus only, `r` roadmap list. Cue item: `c`. No chords. If the link is over about 2000 characters the cues are left out. Read-only view: no tab bar, no connect prompt.

## Audio analysis and pitch shift

In `core.js`: FFT written by hand, chroma (12 bins), key by Krumhansl-Schmuckler, tempo by onset-strength autocorrelation (60 to 180 BPM), beat tracking, one chord per bar by major/minor template matching with Viterbi smoothing, and `chordsForRanges` for per-cell guesses. It yields to the UI so the page never freezes. It is a guess and is labelled as one. The beat grid is linear (repeats are not unfolded). Pitch shift runs in `js/pitch-worker.js` (phase vocoder plus resample), writes a 16-bit WAV into IndexedDB, and keeps one copy per song.

## Deploy

GitHub Pages serves the `gh-pages` branch (Pages settings are not reachable from Claude's sessions). After every change, push to both: `git push origin main && git push origin main:gh-pages`. Bump `V` in `sw.js` and every `?v=` in `index.html` on each release. The Demo song and Demo set exist only on the device and are never written to the Sheet.
