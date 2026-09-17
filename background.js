// Downloads run here, not in the popup, so closing the popup doesn't stop them.

const CONCURRENCY = 4;
const EMPTY = { boardName: "", folder: "", segments: [], total: 0, done: 0, failed: 0, skipped: 0, dupes: 0, sectionCount: 0, running: false };
let state = { ...EMPTY };
let queue = [];
let active = 0;
let generation = 0;
const pending = new Map(); // downloadId -> job

function saveState() {
  if (chrome.storage && chrome.storage.session) {
    chrome.storage.session.set({ state }).catch(() => {});
  }
}

// Restore persisted state if service worker restarted
if (chrome.storage && chrome.storage.session) {
  chrome.storage.session.get("state").then((res) => {
    if (res && res.state) {
      state = { ...res.state, running: false };
    }
  }).catch(() => {});
}

// Chrome rejects a download whose path has characters the OS forbids, a
// leading or trailing dot or space, or a Windows device name.
function safeName(s, fallback) {
  let out = String(s || "")
    .replace(/[\\/:*?"<>|~\x00-\x1f]+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 100)
    .replace(/[.\s]+$/, "");
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(out)) out = `_${out}`;
  return out || fallback;
}

function extOf(url) {
  const m = url.split("?")[0].match(/\.(jpe?g|png|gif|webp)$/i);
  return m ? m[1].toLowerCase() : "jpg";
}

// A file counts as already downloaded if its folder matches and its name ends
// in this image's short hash -- whatever the text in front of it, since a pin's
// title can change on Pinterest. It also matches files from earlier versions,
// which were named by the full hash alone.
async function alreadyOnDisk(job) {
  const hits = await chrome.downloads.search({ query: [job.short], state: "complete", exists: true });
  const folder = job.filename.slice(0, job.filename.lastIndexOf("/") + 1).toLowerCase();
  const named = new RegExp(`(^| - )${job.short}[0-9a-f]*\\.[a-z0-9]+$`, "i");
  return hits.some((h) => {
    const path = h.filename.replace(/\\/g, "/").toLowerCase();
    const cut = path.lastIndexOf("/") + 1;
    return path.slice(0, cut).endsWith(folder) && named.test(path.slice(cut));
  });
}

// "Men's Blazers - zara.com - 3d5e50a1.jpg". The hash keeps two pins with the
// same title apart and is how a re-run recognises what it already has.
function fileName(item) {
  const short = item.key.slice(0, 8);
  const name = safeName(item.name, "Pin").slice(0, 90).replace(/[\s.]+$/, "");
  return { short, base: `${name} - ${short}` };
}

async function start(job) {
  if (job.generation !== generation) {
    active--;
    settle();
    return;
  }
  const onDisk = await alreadyOnDisk(job);
  if (job.generation !== generation) {
    active--;
    settle();
    return;
  }
  if (onDisk) {
    active--;
    state.skipped++;
    tick(job);
    saveState();
    return pump();
  }
  chrome.downloads.download(
    { url: job.url, filename: job.filename, conflictAction: "uniquify", saveAs: false },
    (id) => {
      if (chrome.runtime.lastError || id === undefined) return finish(job, false);
      if (job.generation !== generation) {
        chrome.downloads.cancel(id);
        finish(job, false);
        return;
      }
      pending.set(id, job);
    }
  );
}

function pump() {
  while (active < CONCURRENCY && queue.length) {
    active++;
    start(queue.shift());
  }
  settle();
}

function finish(job, ok) {
  if (job.generation !== generation) return;
  active--;
  // Some pins have no /originals/ file; retry once at the largest standard size.
  if (!ok && !job.retried && /\/originals\//.test(job.url)) {
    const url = job.url.replace("/originals/", "/736x/").replace(/\.[a-z0-9]+(\?.*)?$/i, ".jpg");
    queue.unshift({ ...job, url, filename: job.filename.replace(/\.[a-z0-9]+$/i, `.${extOf(url)}`), retried: true });
  } else if (ok) {
    state.done++;
    tick(job);
  } else {
    state.failed++;
    tick(job);
  }
  pump();
}

// One image in a section has settled, whichever way it went.
function tick(job) {
  const seg = state.segments[job.segment];
  if (seg) seg.settled++;
}

function settle() {
  if (state.running && !queue.length && active === 0) state.running = false;
  saveState();
}

chrome.downloads.onChanged.addListener((delta) => {
  const job = pending.get(delta.id);
  if (!job || !delta.state) return;
  if (delta.state.current === "complete") {
    pending.delete(delta.id);
    state.lastId = delta.id;
    finish(job, true);
  } else if (delta.state.current === "interrupted") {
    pending.delete(delta.id);
    try {
      chrome.downloads.erase({ id: delta.id }, () => {
        if (chrome.runtime.lastError) {}
      });
    } catch (_) {}
    finish(job, false);
  }
});

// The icon opens Unpin's floating panel inside the page. Where a page can't
// be scripted (chrome:// pages, the Web Store) fall back to Chrome's popup,
// which only has to say "open a Pinterest board".
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["panel.js"] });
  } catch (_) {
    await chrome.action.setPopup({ tabId: tab.id, popup: "popup.html" });
    try {
      await chrome.action.openPopup();
    } catch (_) {
      // Older Chrome can't open it programmatically; the next click will.
    }
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === "status") {
    reply(state);
  } else if (msg.type === "stop") {
    generation++;
    queue = [];
    for (const id of pending.keys()) chrome.downloads.cancel(id);
    pending.clear();
    active = 0;
    state.running = false;
    state.stopped = true;
    saveState();
    reply({ ok: true });
  } else if (msg.type === "reveal") {
    if (state.lastId) chrome.downloads.show(state.lastId);
    else chrome.downloads.showDefaultFolder();
    reply({ ok: true });
  } else if (msg.type === "clear") {
    if (!state.running) {
      state = { ...EMPTY };
      saveState();
    }
    reply({ ok: true });
  } else if (msg.type === "download") {
    generation++;
    queue = [];
    for (const id of pending.keys()) chrome.downloads.cancel(id);
    pending.clear();
    active = 0;
    const board = safeName(msg.boardName, "Untitled board");
    const root = `Pinterest/${board}`;

    // Two section titles can sanitize to the same folder name; keep them apart.
    const folders = new Map();
    const used = new Set();
    const folderFor = (section) => {
      if (!folders.has(section)) {
        const base = safeName(section, "Untitled section");
        let name = base;
        for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})`;
        used.add(name.toLowerCase());
        folders.set(section, name);
      }
      return folders.get(section);
    };

    // Files are named by Pinterest's image hash, so running the extension
    // again on a board that has grown only fetches what is new.
    // Group by section, in the order sections first appear, so each section
    // downloads as one run and fills its own stretch of the progress bar.
    const segments = [];
    const segmentOf = new Map();
    for (const item of msg.items) {
      if (!segmentOf.has(item.section)) {
        segmentOf.set(item.section, segments.length);
        segments.push({ name: item.section || msg.boardName, total: 0, settled: 0 });
      }
      segments[segmentOf.get(item.section)].total++;
    }
    const ordered = [...msg.items].sort((a, b) => segmentOf.get(a.section) - segmentOf.get(b.section));

    queue = ordered.map((item) => ({
      url: item.url,
      key: item.key,
      short: fileName(item).short,
      segment: segmentOf.get(item.section),
      generation,
      filename: `${item.section ? `${root}/${folderFor(item.section)}` : root}/${fileName(item).base}.${extOf(item.url)}`,
    }));
    state = {
      boardName: msg.onlySection && msg.items[0] ? `${msg.boardName} › ${msg.items[0].section}` : msg.boardName,
      folder: msg.onlySection ? `${root}/${folderFor(msg.items[0].section)}` : root,
      total: queue.length,
      done: 0,
      failed: 0,
      skipped: 0,
      dupes: msg.dupes || 0,
      sectionCount: msg.onlySection ? 0 : folders.size,
      segments,
      boardUrl: msg.boardUrl,
      info: msg.info,
      running: queue.length > 0,
      stopped: false,
      lastId: null,
    };
    pump();
    reply({ ok: true });
  }
  return false;
});
