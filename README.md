# Worship

Chord charts and set lists for the worship team. Runs in Safari on iPhone and iPad, and as a home-screen app.

Open: https://ajthereal.github.io/worship/

## Every week

1. Copy the song list message from the WhatsApp group.
2. Sets tab, New from WhatsApp, paste, Read the list.
3. Check the date, the keys and the links. If a line says E/F, choose Modulates (the song changes key) or Alt key (two options for the singer). Save set.
4. Open the set and tap Live. Tap the right edge or press the pedal to go to the next song.

## Live

- The lead sheet is fitted to the screen. Tap the right edge or press the pedal to turn half a page, then to the next song. Left edge goes back.
- Bars per line, Size, Chord grid and 1 4 5 are under the sheet. The roadmap strip jumps to a section.
- A song marked Chorus only shows the Chorus and Tag. Tap Show full for the rest.
- The screen stays awake. If it still turns off, set Auto-Lock to Never in Settings.

## Transcribe, Practice, Listen, Keys

- Transcribe: type bars (one word per beat, Help shows the syntax), tap a cell in the bar grid, add notes with the piano. With an audio file linked, the waveform has the bar grid on it. Make beat grid finds the bars, Set bar here and Tap bars fix them. Suggest chords is a guess from the sound.
- Practice: loop a section, slow it down (optionally +5% each loop), play in another key (the chart moves at once, the audio is shifted by a copy made on the phone), count-in and click.
- Listen: audio only, plays the whole set, keeps playing with the screen locked.
- Keys: shows the chord the chart wants and what you play, from the mic or a MIDI keyboard. MIDI needs a browser with Web MIDI, such as the Web MIDI Browser app. In Safari use the mic.
- The Demo song is only on this device. It is never saved to the Sheet.

## Audio files

Put one mp3 or m4a per song in the Drive folder "Worship Audio". In a song, More, Audio file, choose it, then download it to the phone. Safari and the home-screen app keep separate downloads, so download again in the one you use on stage.

## Share with the team

In a set, tap Share. The link opens a read-only page with the order, keys, BPM and the roadmap. No chords, no login. Share a new link after you change the set.

## Your Google Sheet

The pill at the top shows the state. Not connected means everything is kept on this device only.

To connect, use Open Worship in HQ (it passes the connection over), or tap the pill and paste the Apps Script address and code. Sets, songs and lead sheets are saved to the tabs `wsets`, `wsongs` and `wsheets` in HQ Data. Before every save the app reads the tab and merges, so the iPhone and the iPad do not overwrite each other.

Without internet the app still works from the saved copy, and saves go to the Sheet when you are back online.

## Updating the app

Edit the files in the repo and push to both branches: `git push origin main && git push origin main:gh-pages`. After a change to any app file, raise `const V` in `sw.js` and every `?v=` in `index.html` so devices pick up the new files.

Audio needs two small additions to the Apps Script (`_waudio` lists the Drive folder, `_file` returns a file in 3 MB parts). They are described in `CLAUDE.md`. Until they are added, everything else works and the Audio file sheet says the audio list is not available.

`node tests/core.test.js` checks the chord, WhatsApp and merge logic.
