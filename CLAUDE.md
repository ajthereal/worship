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

- `index.html`: UI, CSS and app code (one IIFE). Screens: Sets, Set view, Stage, Songs, Song editor, Practice, Paste preview, Connect sheet, Share view.
- `core.js`: pure logic with no DOM. Works as a plain script (`window.WCore`) and in Node (`require`). Chord parsing and transposing, Nashville numbers, chart parser, WhatsApp parser, YouTube ids, merge-by-id, share encode/decode, FFT and audio analysis.
- `sw.js`: service worker. Network-first for index.html (4 s timeout, then cache), versioned cache for the rest. Apps Script calls are never cached.
- `tests/core.test.js`: `node tests/core.test.js`, no dependencies. Run it after any change to `core.js`.

When `index.html` or `core.js` change: raise `V` in `sw.js` and the `?v=` on the `core.js` script tag in `index.html` (they must match).

## Data (Google Sheet "HQ Data", through AJ's Apps Script)

API: `GET url?token=T&name=<tab>` returns `{rows:[...]}` or `{error:'token'|'server'|...}`. `POST url` with `Content-Type: text/plain` and body `{token, name, rows}` overwrites the whole tab. An empty write over data is refused (`empty-refused`). All values are strings. Reference: the HQ app (`getTab`, `postTab`).

Tab `wsongs`, columns: `id, title, artist, key, bpm, time, chart, yt, marks, notes, patch, updated, deleted`
- `key` is the key the chart is written in. `time` like `4/4` (text). `yt` is one YouTube link per line, optional label after a space. `marks` is JSON, section name to seconds. `patch` is the keyboard sound. `updated` is ISO. `deleted` is `1` for a tombstone.

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

## Writing to the Sheet as Claude

When you write `wsongs` or `wsets` through the Google Sheets connector:
- Use RAW input (`valueInputOption: RAW`), not USER_ENTERED. Otherwise `4/4` becomes a date and `2026-11-21` becomes a serial number. The Apps Script writes text format.
- Keep the header row exactly as above. Fill every column (use empty strings). Give every row a unique `id` and an ISO `updated`.
- Append or update by `id`, never overwrite the whole tab with fewer rows. Never delete rows, set `deleted` to `1`.
- Match songs to the library by fuzzy title before creating a new `wsongs` row.

## Claude workflows

1. Screenshot of a WhatsApp song list: parse it like the app does (`Title (singer) KEY` or `KEY1/KEY2`, `/ Reff Only` means `only:'chorus'`, lines like `DOA` become cues such as `Prayer`, up to 2 YouTube links per song). Write a `wsets` row and new `wsongs` stubs (title, key, links, empty chart) with RAW input.
2. "Transcribe <song>": you cannot listen to YouTube. Write the chart only from a progression AJ confirms, or from an audio file he uploads to the chat. Chords and roadmap only, no lyrics.

## Chart format

Plain text, one section per line.

```
[Intro] | E | B/D# | C#m | A |  (keys only)
[Verse 1] | E | B | C#m | A | x2  (soft)
[Chorus] | A | B | C#m | B/D# | x2  (all in)
[Bridge] | A | B | C#m | C#m |
>> F
[Chorus] | Bb | C | Dm | C/E |  (big)
[Tag] | Bb | C | F |
```

- `[Section]` starts a line. Aliases: Reff and Ref = Chorus, Bait = Verse, Pre-Reff = Pre-Chorus, Ending = Outro.
- `|` separates bars. Several chords in one bar: `| E B |`. `xN` (or `Nx`) is a repeat. `(text)` is a cue shown in the accent colour, never transposed.
- `!` after a chord is a hit (`E!`). `^` before a chord is a push (`^A`). `N.C.` is no chord. `/` is a slash chord.
- Chord tokens are recognised by a strict regex. Anything else on the line is shown as-is.
- `>> F` is a modulation marker. Chords after it are written in the new key (stored as written). `>> +2` means up 2 semitones from the key in force.
- Transposing: shift = item key minus song key in semitones, applied to every chord including the key after `>>`. Spelling follows the key in force (F, Bb, Eb, Ab, Db, Gb and their relative minors use flats, others sharps, an accidental typed in the key wins). Nashville numbers are relative to the key in force on that line (minor keys use the relative major, so Am chord in key Am is 6m). Numbers do not change when transposing.

## Share link

`index.html#share=<data>`. Data is `z` plus base64url of deflate-raw JSON (CompressionStream), or `r` plus base64url of plain JSON if compression is not available. JSON keys: `v, n` (name), `d` (date), `m` (made at), `i` (items). Song item: `s` title, `k` key, `t` to-key, `b` bpm, `g` singer, `o` note, `y` chorus only, `r` roadmap list. Cue item: `c`. No chords. If the link is over about 2000 characters the cues are left out. Read-only view: no tab bar, no connect prompt.

## Audio analysis

In `core.js`: FFT written by hand, chroma (12 bins), key by Krumhansl-Schmuckler, tempo by onset-strength autocorrelation (60 to 180 BPM), beat tracking, one chord per bar by major/minor template matching with Viterbi smoothing. It yields to the UI so the page never freezes. It is a guess and is labelled as one.
