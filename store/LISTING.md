# Chrome Web Store listing

Everything the submission form asks for. Character limits in brackets.

## Name [45]

    Unpin — Pinterest board downloader

## Summary [132]

    Save every image on a Pinterest board to your computer at full size, in a folder for each section.

## Description [16,000]

Unpin saves a whole Pinterest board to your computer.

Open a board and click Unpin. A panel opens over the page with the board, its sections and
how many pins each one holds. Press Download board and the images start arriving in your
Downloads folder at full size, not the small previews the page shows you.

Each section becomes a folder. Pins that aren't in a section stay in the board's folder.

File names come from the pin itself: its title, or the title of the page it links to, or
its description, or Pinterest's own description of the picture, plus the site it came from.
Pins that have none of that are named by the date you saved them. So you get
"Wide celadon bowl - studio-tsuki.com - 3d5e50a1.jpg" rather than a string of digits.

The same picture pinned twice, or saved in two sections, downloads once. Come back to a
board months later and Unpin fetches only what you don't already have.

While it runs, the progress bar is cut into one mark per section, each as wide as its share
of the images, so you can see where it has got to. Stop whenever you like. Close the panel
and carry on browsing if you prefer; the downloads keep going.

There is no account to make and no server behind Unpin, and nothing in it tracks you. It
reads the board you are looking at, signed in as you, and writes files to your Downloads
folder. Nothing goes anywhere else.
Chrome limits it to pinterest.com and its regional sites, and it only wakes up when you
click the icon.

It works on your own boards, secret ones included, and on any board you can open. Open a
single section and it downloads just that section.

Unpin is free and open source: https://github.com/indigokarasu/unpin

## Category

Productivity  (alternative: Workflow & Planning)

## Language

English (United States)

## Single purpose [why Chrome asks: one purpose per extension]

    Unpin downloads the images from a Pinterest board to the user's computer, sorted into
    folders that match the board's sections.

## Permission justifications

**host permission `https://*.pinterest.com/*`**

    Unpin reads the board the user is looking at to get its list of pins and the address of
    each full-size image. It asks Pinterest's own web endpoints from the Pinterest page,
    using the session the user is already signed in with, and it draws its panel on that
    page. This is as narrow as Pinterest gets: the regional sites (pinterest.co.uk,
    pinterest.de and the rest) all redirect to a subdomain of pinterest.com. Unpin asks for
    no other site.

**`scripting`**

    Unpin runs two scripts in the user's Pinterest tab after they click the toolbar icon.
    One draws the panel on the page. The other collects the board's pins and image
    addresses. Both ship inside the extension; no code is fetched from anywhere else.

**`downloads`**

    Saving the images is what the extension is for. It writes them into a folder per
    section and skips ones it has already downloaded.

**`storage`**

    Unpin keeps the state of a download in chrome.storage.session: the queue of
    images still to fetch, how many have finished, failed or were skipped, and which
    section each belongs to. Chrome shuts an extension's background worker down
    whenever it looks idle, which happens easily during a download of several hundred
    images. Without this, a board would stop partway through and the panel would show
    the wrong progress. Session storage is cleared when the browser closes and never
    leaves the computer. Unpin stores nothing else, and nothing about the user.

## Data use disclosures

    Does this extension collect user data?  No.

All the work happens on the user's computer. Unpin sends nothing to the developer or to
anyone else, uses nothing for any other purpose, sells nothing, and has nothing to do with
credit or lending.

There is a privacy policy in PRIVACY.md in the repository. If the form wants a URL, use
GitHub's page for that file.

## Are you using remote code?

    No. I am not using remote code.

Everything Unpin runs ships inside the package: background.js, panel.js, popup.js,
popup.css, popup.html and the icons. There is no eval, no new Function, no
importScripts, and no script or stylesheet loaded from a URL. popup.html references only
files inside the extension.

Unpin does make network requests, and none of them are code. It asks Pinterest's own web
endpoints for the board's pins and gets JSON back, which it reads as data: image
addresses and the text used to name files. It then hands those image addresses to
Chrome's downloads API, so the pictures are written to disk and never executed. The
panel's cover images are the board's own thumbnails, loaded as images.

## Images to upload

| Asset | Size | File |
|---|---|---|
| Store icon | 128×128 | `assets/store-icon-128.png` |
| Screenshot 1 | 1280×800 | `assets/screenshot-1-board.png` |
| Screenshot 2 | 1280×800 | `assets/screenshot-2-folders.png` |
| Screenshot 3 | 1280×800 | `assets/screenshot-3-progress.png` |
| Screenshot 4 | 1280×800 | `assets/screenshot-4-privacy.png` |
| Small promo tile | 440×280 | `assets/promo-tile-440x280.png` |
| Marquee promo tile | 1400×560 | `assets/marquee-1400x560.png` |

The screenshots use a made-up board called Ceramics, drawn with plain colour tiles, so
nobody else's photographs end up in the listing.

## Rebuilding the images

The images are rendered from the HTML in this folder against the extension's own
`popup.css`, so they can't drift away from what the extension actually looks like:

    swift tools/shot.swift store/shot-1.html store/assets/screenshot-1-board.png 1280 800
