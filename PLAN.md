# Worship — plan v3 (rebuild)

Supersedes v1/v2. The visual design is fixed by the approved mockup: https://claude.ai/artifact/U1EMbnc9RakBu8VPKhpQDm (local copies of its artboards: /home/claude/design/project/*.dc.html — Main = Transcribe, Practice, Listen, Live, Keys; the notation renderer that drew it: /home/claude/design/notation.py). Match that look closely.

## Who
AJ: classically and jazz-college trained pianist; keys + music director at church. Professional band: lots of tuttis (kicks, stops, unison lines, voiced stabs), chords often land on upbeats, not one chord per bar. Uses only iPhone and iPad (Safari, home-screen web app). Sometimes carries a mini keyboard or mini MIDI controller.

## Four use cases (all in v1)
1. **Transcribe** (iPad mostly): get chords AND tutti exactly right, written as a real lead sheet.
2. **Practice**: loop a section/bars, slow down, speed ramp, play in the service key.
3. **Listen**: play a set or song on repeat during the day, screen locked, offline.
4. **Live**: lead sheet + setlist + notes on the keyboard stand.
Plus **Keys on the go**: on-screen piano, mic check of what he plays, Web MIDI input when available.

## Look (from mockup)
- Light "paper" theme: bg #FBFAF7, ink #16181D, muted #5E626B, lines #E4E1D9, cards #FFFFFF, accent blue #2348D8 (soft #E9EEFD), tutti/articulation orange #B5470B (soft #FBEDE4).
- Dark theme (Live default, user can pick dark everywhere): bg #0C0D10, ink #F3F1EC, muted #A3A7AF, lines #24262C, accent #8EAEFF, articulation #FFB86B.
- Fonts: Inter (UI), Inter Tight (titles, chord symbols). Load from Google Fonts with system fallbacks; app must still work offline (cache the CSS + font files in the service worker, or fall back to system-ui gracefully).
- Mode switcher (segmented: Transcribe · Practice · Listen · Live) at top of a song. Bottom tab bar on iPhone: Sets, Songs, Keys. Big touch targets (≥44px), safe areas, iPhone portrait + iPad portrait/landscape.
- All UI text English, short, plain.

## Data
Google Sheet "HQ Data" via AJ's existing Apps Script (same API as HQ: GET ?token&name=tab → {rows}; POST text/plain {token,name,rows} overwrites a tab). Existing tabs `wsongs`, `wsets` (keep all existing rows and columns; add new columns). Sync rules from the current CLAUDE.md stay (merge by id, newer `updated` wins, tombstones, GET-before-POST, pending + retry, plain status pill).

`wsongs` new columns: `sheet` (lead sheet JSON, below), `audio` (Drive file id), `audioName`, `grid` (JSON: bar start times in seconds, see Beat grid). Old `chart` column: keep; if a song has `chart` text but no `sheet`, convert it once into a sheet (sections → rehearsal marks, `|` bars → bars, chords evenly in the bar).

Audio files: AJ uploads one mp3/m4a per song to Drive folder "Worship Audio" himself. Apps Script endpoints (already deployed by AJ after this build):
- `GET ?token&name=_waudio` → `{rows:[{id,name,size,mime,ts}], folder}`
- `GET ?token&name=_file&id=<id>&part=<n>` → `{n, part, size, mime, data(base64)}`; files arrive in 3 MB parts; fetch all parts, join into a Blob.
Songs link to a file by id; auto-suggest by fuzzy name match. Downloaded audio is stored on the device (Cache Storage or IndexedDB) so it plays offline; "Download set for offline" button on a set; show per-song "On this device" state and storage used, with a way to free space. If `_waudio` returns an error (script not updated yet), say plainly: "Audio list not available. Update the Apps Script (see README)."

### Lead sheet JSON (`sheet`)
```
{ v:1, key:'E', mode:'major', time:'4/4', tempo:72, sub:8,
  bars:[ {
    mark:'A', label:'Intro',            // rehearsal mark starts here (optional)
    key:'F', time:'3/4', tempo:80,      // changes at this bar (optional)
    repStart:true, repEnd:true, times:2, ending:'1.'|'2.',
    segno:true, coda:true, ds:'D.S. al Coda'|'D.C. al Fine'|'To Coda', fine:true,
    double:true, final:true, dyn:'mp', hairpin:'<'|'>', fermata:true, text:'Band stop',
    ch:[ {at:0,c:'A'}, {at:3,c:'B'} ],  // chord symbols at subdivision positions (written key)
    ev:[ {at:0,d:3,k:'h',a:'>',tie:false},          // rhythm events; k: s=comp slash, h=rhythmic hit (slash head with stem), n=pitched notes, r=rest
         {at:3,d:1,k:'n',p:['D#5'],a:'>'} ]         // p: pitches (scientific, sharps/flats as written); a: '>' accent, '^' marcato, '.' staccato, '-' tenuto
  } ] }
```
- `sub` = subdivisions per bar for the grid (8 = eighths in 4/4; 16 = sixteenths). Positions/durations are in those units.
- A bar with no `ev` renders as one comp slash per beat. Chords and rhythm are independent (chord row vs band row in the editor).
- Transposing (set item key vs sheet key) shifts chords AND pitches; key signatures follow; spelling by target key.

## Notation rendering
Use **VexFlow 4.2.5** vendored at `vendor/vexflow-bravura.js` (copy from /tmp/vf/package/build/cjs/vexflow-bravura.js; it embeds the Bravura font; works offline; MIT — keep its license file in vendor/). Render: treble clef, key signature, time signature, slash noteheads for comping (VexFlow slash noteheads), rhythmic-notation hits (slash heads with stems), pitched notes with accidentals relative to the key signature, beams by beat, ties, rests, articulations, chord symbols above the beat positions (use VexFlow ChordSymbol or positioned text; superscript extensions, ♯/♭ glyphs, Δ for maj7 optional setting), rehearsal marks boxed, repeat barlines, volta brackets, segno/coda/D.S. text, dynamics and hairpins, fermatas, text cues in articulation colour. Lines of N bars (Live: 4 on iPad landscape, 2 on iPhone portrait; auto-fit). Theme colours applied (light/dark). If VexFlow fails to load, show a plain message and a simple chord-grid fallback — never a blank screen. Performance: render only visible lines; re-render on change debounced.

## Screens
### Sets
List upcoming/past. "New from WhatsApp" paste → editable preview (parser from current core.js: title, singer, key, X/Y modulation or alt key, Reff Only, cues like DOA→Prayer, YouTube links). Set view: items in order with key, singer, notes; "Download for offline", "Listen", "Live".

### Songs
Library with search; each row shows key, tempo, audio state (none / in Drive / on this device), transcription progress (bars done / total).

### Song → Transcribe (iPad first, works on iPhone with stacked layout)
As in mockup Main: header (title, key, tempo, time, progress, saved state, mode switcher); section strip; waveform with bar grid lines, loop region, playhead; bar numbers; one rendered lead-sheet line around the selected bar (tap a bar to select); **bar grid editor** for the selected bar: columns = subdivisions (1 & 2 & 3 & 4 &, or 16ths), rows CHORD / BAND (Comp, Hit, Rest, Tie, sustain) / ACCENT / NOTES; tap a cell to select it. Right panel: selected chord big with roman numeral analysis, "Heard" suggestions with confidence, diatonic palette for the key in force (I ii iii IV V vi ♭VII + inversions), quality/extension buttons (maj7 7 m7 sus add9 /bass ø ° 9 11 13 alt), band rhythm buttons (Comp, Hit, Rest, Tie, Accent >, Marcato ^, Fermata, Push = anticipation tie from previous). Bar-level controls: rehearsal mark/label, repeat start/end + times, endings, key/time/tempo change, dynamics, hairpins, text cue, D.S./Coda/Fine, add/insert/delete/duplicate bars, copy/paste bars or a section. Undo/redo.
Bottom: on-screen piano (2–3 octaves, scrollable), "Play" the selected chord/notes (simple Web Audio piano-ish synth: a few detuned sine/triangle partials with decay; must sound pleasant, no samples needed), "Check by mic". In NOTES mode tapping piano keys toggles pitches in the selected cell.
Transport: −5 s, play/pause, loop selected bar / section / A–B, speed 50/75/100 (+ fine slider 40–100%), current time.
Chord suggestions: run the existing audio analysis (core.js analyzeAudio: chroma, key, tempo, beats, chords) on the song audio aligned to the beat grid; per subdivision cell where the harmony changes, show suggestion with confidence (dashed, "?"); tap to accept.
**Beat grid**: per-song bar start times (`grid`). Create from analysis (tempo + first downbeat) and let AJ fix: "Set bar 1 here" at the playhead, tempo nudge, and "Tap downbeats" mode (tap on each bar 1 while it plays to record times; interpolate). Grid drives waveform lines, loop points, playhead bar highlighting in every mode.

### Practice (iPhone first)
As in mockup: section chips (from rehearsal marks), mini waveform with loop region, rendered lead sheet of the loop (current bar highlighted, follows playback), Speed card (40–100%, "+5% each loop until 100%" ramp option), Play-in key card (transposes sheet AND audio), count-in 1 bar (click), click track on/off (metronome from grid), loop counter, Keys button (opens Keys sheet).
Audio playback: HTMLAudioElement with preservesPitch for speed. **Key change of audio**: render a pitch-shifted copy offline (phase vocoder or WSOLA+resample in a Worker, chunked, progress shown, cancelable), cache it on the device per (file, semitones), then play it like the original. Say clearly it takes a moment the first time.

### Listen (iPhone)
As in mockup: set as queue (or one song), now-playing card (section + current chord from sheet + next chord), progress, prev/next, repeat one / repeat all, speed. Plays with screen locked via HTMLAudioElement + Media Session API (title, set name, artwork none or simple, prev/next handlers). Offline from device cache. Uses transposed copy if the set item key differs and one is prepared; otherwise plays original and notes it.

### Live (iPad landscape first; dark default)
As in mockup: left setlist rail (tap to jump; cues like Prayer shown italic), sound/patch card, "Into next" transition card; main: title, key (→ mod key), ♩ tempo, singer, rendered lead sheet in the set item key, fitted to the screen (scale/columns so a typical song fits without scrolling; if it can't, page turns, never scroll mid-song). "Chorus only" items show only marks labelled Chorus/Reff + Tag, with "Show full". Next/prev: edge tap zones, ArrowLeft/Right/PageUp/PageDown/Space (pedal), no swipe. Wake Lock (re-request on visibilitychange) with lock icon; hint to set Auto-Lock if unavailable. Optional: follow playback (highlight bar) when audio is playing — off by default in Live.

### Keys (on the go)
As in mockup Keys (phone landscape): loop control for current song/section, "Chart says" chord at the playhead, "You played" detected chord + chroma bars from the mic (getUserMedia, chroma from FFT, template match; single-note mode shows note name), match/miss state, 2-octave on-screen piano with chord tones highlighted. **Web MIDI**: if `navigator.requestMIDIAccess` exists, list inputs and use note-on/off as played notes (shows chord, sounds through the synth, and in Transcribe NOTES mode writes pitches into the selected cell). Safari has no Web MIDI: show a plain line "MIDI keyboards need a browser with Web MIDI, such as the Web MIDI Browser app. In Safari use the mic." Never silent.

## Practical
- Plain HTML/CSS/JS, no build step. Files may be split for sanity: index.html, css/app.css, js/*.js (plain scripts, no modules required), core.js (pure logic, Node-testable), vendor/vexflow-bravura.js. Service worker caches all app files (versioned), network-first for index.html.
- Keep working with local data when not connected; same connection rules as now (ws-conn, hq-sync, #connect=).
- Tests (Node, no deps): sheet transposition (chords + pitches + key signatures), chart→sheet conversion, grid math (time↔bar/position), WhatsApp parser (existing tests keep passing), merge, share encode/decode.
- No lyrics anywhere.
- Migration: the 4 seeded songs + PW Doa Puasa set must load and work.

---
## v3.1 — changes after goldfish review (override the above where they differ)
1. **Fast typed input is the main way to enter bars** (grid is for fixing). Each bar has a one-line text field; Enter/→ goes to the next bar, paste many bars at once. Syntax (document it in an in-app help sheet and CLAUDE.md), positions by beat with `.` holding: `| E . . ^B/D# |` = E on 1, B/D# pushed to the "and" of 3... Define precisely, e.g. tokens separated by spaces, one token per beat; a token may contain two halves split by `,` for eighths (`A,B`); `.` = continue; `r` = rest; `!` after a chord = hit; `^` before a chord = push (anticipation of the next beat by an eighth); `%` = repeat previous bar; `[A Intro]` before a bar = rehearsal mark. Pitched lines/voicings are entered via grid + piano/MIDI, not text. Parser and serializer round-trip; unit-tested.
2. **Live readability**: lead sheet stays the default (AJ wants staff notation for tutti), but with a **size slider** (bars per line 2–6, scale), chord symbols large, and a toggle **Chord grid view** (big chords with tutti marks above). **Road-map strip** of sections at the top (tap to jump). Repeat type **Vamp / till cue**. Page turn = half page (top half becomes the old bottom half) so the eye keeps its place.
3. Notation additions: **pickup bar** (`pickup:true`, shorter), **bar repeat %**, **instrument label** on a line (`who:'Bass+Gtr'`, `who:'All'`), **Nashville number toggle** for chord symbols, chord pushes stored as chord `at` plus a tie so the chord row and the rhythm row cannot drift. Two voices in one bar: v2 (not now).
4. **Chord symbols are drawn as their own layer** placed by tick position over the VexFlow staff (not attached to notes), so chords between rhythm events work. Load VexFlow only on screens that draw music. Measure bar content to choose bars per line.
5. **Storage**: audio Blobs in **IndexedDB**, played via blob URLs (never through the service worker). Call `navigator.storage.persist()`; show used/available from `storage.estimate()`. Treat the home-screen app as the main place (note in README that Safari and the home-screen app keep separate downloads).
6. **Download**: one 3 MB part at a time, retry each part 3×, store each decoded part as it arrives so a broken download resumes; verify total size at the end; progress bar; cancel.
7. **Sheet storage**: lead sheets go to their own tab **`wsheets`** (columns: id (=song id), part, data, updated, deleted). `data` = base64url of deflate-raw JSON (CompressionStream, fallback plain), split into parts of ≤40,000 chars. Check size before POST, plain message if too big. Debounced save (1.5 s after edits stop). Conflict: if the remote row's `updated` is newer than what this device last read AND this device has local edits, keep both: save the local version as a dated "conflict copy" of the sheet and tell AJ plainly.
8. **Listen** uses only the HTMLAudioElement (no Web Audio, no mic) so screen-locked playback keeps working; prepare the next item's blob URL ahead; re-apply speed after source change; Media Session metadata + prev/next/seek handlers. Speed floor 50%.
9. **Pitch-shifted copies**: ±1–6 semitones, processed one channel at a time in a Worker in streamed chunks with transferable buffers, written as 16-bit WAV pieces into IndexedDB; keep at most one shifted copy per (song,key) and offer to delete old ones. Progress + cancel + plain error if memory runs out.
10. **Mic** = "does what I play match the chart chord" (and single-note naming); show "Playback gets quieter while the mic is on. Headphones help." Set `navigator.audioSession.type` where available.
11. **Wake Lock**: listen for release, show state, fall back to the Auto-Lock hint. Click track re-aligns to audio currentTime every bar. Silent switch note if Web Audio is muted.
12. Fonts: Inter/Inter Tight cached by the service worker on first load; system-ui fallback so it never blocks.
