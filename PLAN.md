# Worship — plan (v1)

## Who and why
AJ: keyboardist and music director in his church's worship team (Indonesia). Trained pianist (music degree). Uses only iPhone and iPad, touch only, no computer. Every week a coordinator posts the song list in a WhatsApp group, e.g.:

```
Shalomm..

Berikut list lagu Doa Puasa

Allah Sanggup (Fero) E/F
https://youtube.com/watch?v=J9zNq2vV2WQ&si=10LSDR-JZZIRCaKmr

I will Run to You (Jess) E/F
https://youtu.be/8Q6FTjogqE0?si=TBRpdFpnFKmXDYyt

Kau Tetap Allah (betapa dahsyat) F/G

DOA

Saatku MenyembahMu / Reff Only (Fero) F
https://youtube.com/watch?v=-wc5MUdvrV4&si=gf3hOhdPO0eh-pFIM
https://youtube.com/watch?v=GS4hVB-Jmql&si=AxYEo4Hcux070NfH
```
Meaning: "Title (singer) KEY" or "KEY1/KEY2" = starts in KEY1 and modulates to KEY2. Lines like "DOA" (prayer) are non-song moments in the flow. "/ Reff Only" = play only the chorus. One song can have 2 reference videos. Group name holds the event + date ("PW Doa Puasa - 21 Nove...").

He wants: (1) a "cheat sheet" playlist per service he can read on an iPad on the keyboard stand, (2) an easier way to transcribe and learn each song.

Interview answers:
- Role: keys + music director.
- Cheat sheet: chords + short roadmap (Intro, V1, Chorus x2, Bridge, Tag + cues). NO lyrics (copyright; he chose chords + roadmap only).
- Transcribe: loop + slow down the YouTube reference; app guesses key/BPM/chords from an uploaded audio file; and Claude (in chat) can fill charts for him.
- Stage: iPad on the stand. Share with team: roadmap/cue view for singers/band.
- Setlist input: paste the WhatsApp message into the app; or he sends a screenshot to Claude, who writes it into the Sheet.

## Constraints
- Plain HTML/CSS/JS, one `index.html` (+ `sw.js`, `manifest.webmanifest`, icons), no build step, no framework. GitHub Pages at `ajthereal.github.io/worship/`. Public repo, so no data or secrets in it.
- All UI text in English.
- Data: his existing Google Sheet "HQ Data" through his existing Apps Script web app (same one his HQ app uses). API: `GET url?token=T&name=<tab>` → `{rows:[{col:val,...}]}` (all values strings); `POST url` body `{token, name, rows}` (Content-Type text/plain) overwrites the whole tab → `{ok:true}`; refuses an empty write over data (`{error:'empty-refused'}`); errors come back as `{error:...}`. Script keeps automatic backup copies of tabs.
- Connection: HQ (same origin `ajthereal.github.io`) stores `{url, token}` in localStorage key `hq-sync`. Worship reads that key first. If missing (home-screen web apps on iOS have separate storage), it accepts `#connect=<base64 JSON {url,token}>` in the URL (HQ's Sync screen will get an "Open Worship" link that passes it), and as a last resort a Connect form (paste address + code).
- Anything that can fail must say why in plain words (never fail silently). Must work offline at church: cache the app and the last data on the device.

## Data (two new tabs in HQ Data)
`wsongs`: id, title, artist, key (original/default key), bpm, time (e.g. 4/4), chart (text, format below), yt (YouTube links, one per line, optional label after a space), marks (JSON: section name → seconds in video), notes, updated (ISO).
`wsets`: id, date (yyyy-mm-dd), name, items (JSON array), raw (pasted WA text), updated.
items: `{t:'song', song:<id>, key:'E', to:'F', note:'Chorus only', singer:'Fero'}` or `{t:'cue', text:'Prayer'}`.

## Chart format (plain text, easy for him to edit and for Claude to write)
```
[Intro] | E | B/D# | C#m | A |  (keys only)
[Verse 1] | E | B | C#m | A | x2  (soft)
[Chorus] | A | B | C#m | B/D# | x2  (all in)
[Bridge] | A | B | C#m | C#m |
>> F
[Chorus] | Bb | C | Dm | C/E |  (big)
[Tag] | Bb | C | F |
```
- `[Section]` starts a line. Chord tokens are transposed; `|` bars; `xN` repeat; `(text)` cue shown in accent color; `>> F` = modulation marker: chords AFTER it are written in the new key (stored as written).
- Display key: the set item key ('E') vs the song's stored key → transpose by the difference. For a modulating item (E/F), the part after `>>` is shifted by the same interval, so the relationship is kept.
- Toggle: letters / Nashville numbers (relative to the key in force on that line). Flats vs sharps chosen by the target key.

## Screens (bottom tab bar: Sets, Songs, Practice)
1. **Sets**: upcoming services (next first), past below. "New from WhatsApp": a big text box to paste the message → preview: name, date (from text, else next date, editable), each line parsed into song (title, singer, key, to-key, note, links) or cue; songs matched to the library by fuzzy title, unmatched become new song stubs (title, key, links). Confirm → saved. Also add/remove/reorder items manually and change an item's key.
2. **Set view / Stage mode**: one item per screen, swipe or big edge buttons for prev/next, top strip with all items (tap to jump), footer "Next: <title> (<key>)". Big high-contrast type, dark by default, Screen Wake Lock while open. Each song shows key (and → mod key), BPM, singer, note ("Chorus only" highlighted), roadmap with chords, letters/numbers toggle, quick ± transpose for this item. Cue items show full-screen (e.g. "PRAYER — pad under").
3. **Songs**: library with search; song editor (title, artist, key, BPM via tap tempo, time sig, chart text with live preview, links, notes).
4. **Practice** (per song, opened from a song or set item): 
   - YouTube player (IFrame API, playsinline) with switcher between links; speed 0.5 / 0.75 / 0.9 / 1; A–B loop (set A, set B, clear); back 5 s; "Mark" button: saves current time against the section you pick so tapping a section in the chart jumps the video there.
   - Chord pad to write the chart fast by touch: section buttons (Intro, Verse, Pre, Chorus, Bridge, Tag, Interlude, Outro), the 7 diatonic chords of the key plus common extras (bVII, IV/1, V/7 slash, sus, 2), bar, xN, cue text, undo. Writes into the chart text.
   - Tap tempo.
   - **Analyze audio file**: pick an audio file (mp3/m4a from Files). In-browser: decode (Web Audio), estimate BPM (onset envelope autocorrelation), key (chroma + Krumhansl profiles), and chord per beat/bar (chroma template matching, major/minor, smoothed). Show the suggestion as a bar-by-bar chord timeline with confidence; play the file with loop and speed (pitch preserved); "Use as draft" puts suggested chords into the chart for him to correct. Clearly labeled as a guess.
5. **Share**: from a set, "Share with team" makes a link containing the set's roadmap compressed into the URL hash (no server, no token): order, keys (with mod), BPM, roadmap sections and cues; chords hidden by default with a "Show chords" toggle; read-only, works for anyone. Shared via iOS share sheet (WhatsApp).

## Claude workflow (documented in CLAUDE.md)
- Screenshot of WA list → Claude parses and writes `wsets` (+ new `wsongs` stubs) via the Google Sheets connector into HQ Data.
- "Transcribe <song>": Claude cannot listen to YouTube; it can write charts from known chord progressions he confirms, or analyze an audio file he uploads to the chat. No lyrics, ever.

## Sync rules
- Load from cache instantly, then pull both tabs; show a small status (Synced / Offline, showing saved copy / Error: <reason>).
- Saves: update local cache immediately, debounce 800 ms, POST whole tab; on failure keep a "pending" flag and retry when online; never push a tab that was never successfully loaded (avoid wiping the Sheet with an empty or stale copy).

## Seed
Seed the 21 Nov 2026 "PW Doa Puasa" set from the message above (song stubs with keys and links, empty charts).

---
## v2 changes after goldfish review (these override v1 above)
1. **Stage mode**: each item auto-fits the screen (scale font down so the whole chart fits, no scrolling; if still too long at the minimum size, then two columns on iPad landscape). No swipe. Big tap zones on the left and right edges (prev/next). Keyboard keys ArrowLeft/ArrowRight/PageUp/PageDown/Space go prev/next, so a Bluetooth page-turner pedal works. Wake Lock requested again on `visibilitychange`; small lock icon when it's on; if it isn't available, a one-time hint "Set Auto-Lock to Never in Settings".
2. **Paste preview**: every X/Y key shows a choice "Modulates" (default) / "Alt key"; the saved item is whichever is picked. Parentheses: a short one-word name = singer; anything else (e.g. "(betapa dahsyat)") = alt title kept in the note. "/ Reff Only" → note "Chorus only" and `only:'chorus'`. Read the key from the last token(s) of the line. Clean `*bold*`, `_`, emoji, NBSP, zero-width characters, list numbers first. YouTube: youtube.com/watch, youtu.be, m.youtube, music.youtube, /shorts; validate 11-char ids and flag bad ones in the preview.
3. **"Chorus only"**: stage mode shows only Reff/Chorus sections (plus Tag) with a "Show full" toggle.
4. **Sync = merge, not overwrite**: before every push, GET the tab, merge rows by `id` keeping the newer `updated`; deletions are tombstones (`deleted:'1'`) never removed rows; then POST. If the GET fails, keep the change pending (shown) and retry later; never POST a tab that was not just read. Status pill: Synced / Saving / Offline – saved on this iPad / Error: <plain reason>.
5. **Offline**: service worker: network-first for index.html (4 s timeout then cache), versioned cache for the rest; Apps Script calls never cached. Badge on each set: "Ready offline · data from <time>".
6. **Connection**: (a) localStorage `hq-sync`; (b) `#connect=<encodeURIComponent(base64 JSON)>` from HQ's new "Open Worship (connected)" button, stored then removed from the URL with `history.replaceState`; (c) Connect form (address + code, same as HQ's). Plain error messages (wrong code, address cannot be opened).
7. **YouTube practice**: speed buttons built from `getAvailablePlaybackRates()`; A–B loop checked every 200 ms; −5 s; errors 2/5/100/101/150 explained in plain words with an "Open in YouTube" button; note "YouTube can't change pitch: play along in the original key or use the transposed chart". Keep the simple "Mark section" (saves seconds into `marks`; tapping a section in Practice jumps there).
8. **Chord entry**: text editor is primary (live preview). Above it, one row of section buttons (Intro, Verse, Pre-Chorus, Chorus, Bridge, Interlude, Tag, Outro; Reff/Bait accepted when typed) and one row of the 7 diatonic chords for the song key + `|` + `>>`. Inserts at the cursor.
9. **Chart format additions**: several chords in one bar `| E B |`; `!` after a chord = hit, `^` before = push, `N.C.` allowed, `/` slash chords. Chord tokens are recognized only by a strict chord regex; anything else is shown as-is. Section name aliases: Reff=Chorus, Bait=Verse, Pre-Reff=Pre-Chorus.
10. **Transpose rules**: shift = item.key − song.key (semitones), applied to every chord including after `>>` markers (which also shift). If item.to is set and the chart has no `>>`, show "→ F" in the header. Spelling by target key (flat keys F Bb Eb Ab Db Gb use flats, others sharps; minor keys by their relative major); slash bass spelled the same way. Nashville numbers relative to the key in force on that line. Unit-tested.
11. **Keyboard notes**: song field `patch` (sounds, e.g. "Piano + warm pad"); set item field `trans` (transition into next, e.g. "keep pad, go to F"). Both shown in stage mode.
12. **Audio analysis (kept, he asked for it, lean)**: file input `accept="audio/*,.mp3,.m4a"`; decode, mix to mono and resample to ~11 kHz via OfflineAudioContext; process in chunks yielding to the UI with a progress bar; BPM + key + bar-by-bar chord guess with confidence; plays via an `<audio>` element (preservesPitch) with speed + A–B loop; "Use as draft" inserts into the chart; labeled "Guess — check by ear". DRM files fail with a plain message.
13. **Share (kept, lean)**: roadmap + cues + keys + BPM only (no chords) so the link stays small; deflate-raw via CompressionStream + base64url; if over ~2 KB, drop cues. Shows "Made <date time>" so a stale link is visible. Uses the iOS share sheet.
14. **Sheet text**: Apps Script already writes text format. When Claude writes via the Sheets connector it must use RAW input so "4/4" and dates stay text.
