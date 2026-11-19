# Worship

Chord charts and set lists for the worship team. Runs in Safari on iPhone and iPad, and as a home-screen app.

Open: https://ajthereal.github.io/worship/

## Every week

1. Copy the song list message from the WhatsApp group.
2. Sets tab, New from WhatsApp, paste, Read the list.
3. Check the date, the keys and the links. If a line says E/F, choose Modulates (the song changes key) or Alt key (two options for the singer). Save set.
4. Open the set and tap Stage. Tap the right edge or press the pedal to go to the next song.

## Stage

- The chart shrinks to fit the screen, so there is no scrolling.
- Left and right edges, and the keys Left, Right, Page Up, Page Down, Space, move between songs. A Bluetooth page-turner works.
- A B C or 1 4 5 switches chord letters and Nashville numbers. The minus and plus change the key for that song in this set.
- A song marked Chorus only shows just the Chorus and Tag. Tap Show full for the rest.
- The screen stays awake. If it still turns off, set Auto-Lock to Never in Settings.

## Songs and Practice

- Songs holds the library. Write a chart in the text box, use the buttons above it to add sections and chords. The preview updates as you type.
- Practice plays the YouTube video slower, loops A to B, jumps back 5 seconds, and remembers where each section starts (Mark section).
- Analyse an audio file: pick an mp3 or m4a and the app guesses key, tempo and one chord per bar. It is a guess. Use as draft puts it in the chart for you to fix.

## Share with the team

In a set, tap Share. The link opens a read-only page with the order, keys, BPM and the roadmap. No chords, no login. Share a new link after you change the set.

## Your Google Sheet

The pill at the top shows the state. Not connected means everything is kept on this device only.

To connect, use Open Worship in HQ (it passes the connection over), or tap the pill and paste the Apps Script address and code. Sets and songs are saved to the tabs `wsongs` and `wsets` in HQ Data. Before every save the app reads the tab and merges, so the iPhone and the iPad do not overwrite each other.

Without internet the app still works from the saved copy, and saves go to the Sheet when you are back online.

## Updating the app

Edit the files in the repo and push. After a change to `index.html` or `core.js`, raise the version number in `sw.js` (`const V`) and in the `core.js?v=` line of `index.html` so devices pick up the new files.

`node tests/core.test.js` checks the chord, WhatsApp and merge logic.
