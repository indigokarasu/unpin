# Unpin

Downloads every image on the Pinterest board you have open, at original resolution, with a folder for each section.

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and pick this folder

## Use

1. Open a board, e.g. `pinterest.com/username/board-name/` (a section URL downloads just that section)
2. Click the Unpin icon. A panel opens over the page (Escape or clicking the page closes it). It shows the board, its sections and pin counts. Click **Download board**
3. Files are saved using the board's real name and its sections:

   ```
   Downloads/Pinterest/
     Home Decor/            pins not in any section
       Kitchen/             one folder per section, named after it
       Living Room/
   ```

   On a section's URL, only that section downloads, to `Pinterest/<Board>/<Section>/`.

   Each file is named from what Pinterest knows about the pin, plus a short code:

   ```
   Men's Blazers - zara.com - 3d5e50a1.jpg
   There is a belt on the back of a man's pants that he wears - a00ad7c2.jpg
   Pinned 2026-04-22 - 04ed394e.jpg
   ```

   The name uses the pin's title, the linked page's title, its description, or Pinterest's automatic
   description of the image, in that order, plus the site it came from. A pin with none of those
   is named by the date it was saved. The 8-character code identifies the image, so two pins with
   the same title never clash.

## How it works

- It asks Pinterest's own web endpoints for the board's pins, logged in as you, so private
  boards you can see work too. 
- If that fails, it scrolls the board and grabs the images as they appear.
- **Duplicates are skipped.** Pinterest names each image file after a hash of the image, so the
  same picture pinned twice, or in two sections, downloads once, into the first section that
  has it. Files end in part of that hash, so anything Unpin already downloaded into the same
  folder is skipped, even if the pin's title has changed since. Running it again on a board
  that has grown only gets the new pins.
- It tries each image's `/originals/` file first. If that's missing, it uses the 736px version.
- Downloads run in the background, 4 at a time, so you can close the popup.

## Icon

The icons in `icons/` are drawn in code. To change them, edit `tools/icon.swift` and run
`swift tools/icon.swift icons` on a Mac.
