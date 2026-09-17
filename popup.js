const $ = (id) => document.getElementById(id);
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const isMac = navigator.userAgent.includes("Mac");
// Inside the floating panel rather than Chrome's popup window.
const embedded = new URLSearchParams(location.search).has("embedded");

function closePanel() {
  if (embedded) parent.postMessage({ unpin: "close" }, "*");
  else window.close();
}

if (embedded) {
  document.documentElement.classList.add("embedded");
  // The panel sizes itself to whatever this view currently needs.
  new ResizeObserver(() => {
    parent.postMessage({ unpin: "height", height: Math.ceil(document.body.getBoundingClientRect().height) }, "*");
  }).observe(document.body);
  addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });
}

function show(view) {
  document.body.dataset.view = view;
}

// Runs inside the Pinterest tab when the popup opens: just enough to show the
// board before anything is downloaded. Self-contained, like collectBoardImages.
async function boardInfo() {
  const parts = location.pathname.split("/").filter(Boolean);
  const reserved = new Set(["pin", "search", "ideas", "today", "settings", "business", "_", "videos", "shopping"]);
  if (parts.length < 2 || reserved.has(parts[0]) || parts[1].startsWith("_")) return { board: false };
  const [username, slug, sectionSlug] = parts;
  const boardUrl = `/${username}/${slug}/`;
  const get = async (name, options) => {
    const params = new URLSearchParams({ source_url: boardUrl, data: JSON.stringify({ options, context: {} }) });
    const res = await fetch(`/resource/${name}/get/?${params}`, {
      credentials: "include",
      headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest", "X-Pinterest-PWS-Handler": "www/[username]/[slug].js" },
    });
    let body = null;
    try { body = (await res.json()).resource_response; } catch (_) {}
    if (!res.ok || !body || body.error) throw new Error(body && body.error ? body.error.message_detail || body.error.message : `HTTP ${res.status}`);
    return body;
  };
  try {
    const board = (await get("BoardResource", { username, slug, field_set_key: "detailed" })).data;
    const sections = [];
    let bookmark = null;
    const seenBookmarks = new Set();
    do {
      const opts = { board_id: board.id, page_size: 50 };
      if (bookmark) opts.bookmarks = [bookmark];
      const r = await get("BoardSectionsResource", opts);
      sections.push(...(r.data || []).map((x) => ({ title: x.title, slug: x.slug, count: x.pin_count || 0 })));
      bookmark = r.bookmark;
      if (bookmark) {
        if (seenBookmarks.has(bookmark)) break;
        seenBookmarks.add(bookmark);
      }
    } while (bookmark && bookmark !== "-end-");
    const section = sectionSlug ? sections.find((x) => x.slug === sectionSlug) : null;
    return {
      board: true,
      url: boardUrl + (sectionSlug ? `${sectionSlug}/` : ""),
      name: board.name,
      // Pinterest's board tile: the cover pin large, two more pins beside it.
      covers: (() => {
        const out = [];
        const cp = board.cover_pin && board.cover_pin.image_url;
        if (cp) out.push(cp.replace(/\/\d+x\//, "/736x/"));
        const sig = board.cover_pin && board.cover_pin.image_signature;
        for (const img of (board.images && board.images["474x"]) || []) {
          if (out.length >= 3) break;
          if (!sig || !img.url.includes(sig)) out.push(img.url);
        }
        if (!out.length && board.image_cover_url) out.push(board.image_cover_url);
        return out;
      })(),
      pinCount: section ? section.count : board.pin_count || 0,
      section: section ? section.title : null,
      sections: section ? [] : sections,
    };
  } catch (e) {
    // Signed out, private, or a user profile rather than a board.
    const h1 = document.querySelector("h1");
    return { board: true, url: location.pathname, name: h1 ? h1.textContent.trim() : slug, covers: [], sections: [], pinCount: 0, unreadable: e.message };
  }
}

// Runs inside the Pinterest tab. Must be self-contained: it is serialized by
// chrome.scripting.executeScript, so it cannot reference anything outside itself.
async function collectBoardImages() {
  const parts = location.pathname.split("/").filter(Boolean);
  const reserved = new Set(["pin", "search", "ideas", "today", "settings", "business", "_", "videos", "shopping"]);
  if (parts.length < 2 || reserved.has(parts[0]) || parts[1].startsWith("_")) {
    return { error: "Open a board first (a URL like pinterest.com/username/board-name/)." };
  }
  const [username, slug, sectionSlug] = parts;
  const boardUrl = `/${username}/${slug}/`;

  async function resource(name, options) {
    const params = new URLSearchParams({
      source_url: boardUrl,
      data: JSON.stringify({ options, context: {} }),
    });
    const res = await fetch(`/resource/${name}/get/?${params}`, {
      credentials: "include",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "X-Pinterest-PWS-Handler": "www/[username]/[slug].js",
      },
    });
    let body = null;
    try { body = (await res.json()).resource_response; } catch (_) {}
    if (!res.ok || !body || body.error) {
      const detail = body && body.error && (body.error.message_detail || body.error.message);
      throw new Error(`${name}: ${detail || `HTTP ${res.status}`}`);
    }
    return body;
  }

  async function paginate(name, options) {
    const out = [];
    let bookmark = null;
    const seenBookmarks = new Set();
    for (let page = 0; page < 500; page++) {
      // Pinterest rejects page_size above 50 on section pins ("250 > 50"),
      // and a rejected page aborts the whole board.
      const opts = { ...options, page_size: 50 };
      if (bookmark) opts.bookmarks = [bookmark];
      const r = await resource(name, opts);
      if (Array.isArray(r.data)) out.push(...r.data);
      bookmark = r.bookmark;
      if (!bookmark || bookmark === "-end-" || seenBookmarks.has(bookmark)) break;
      seenBookmarks.add(bookmark);
    }
    return out;
  }

  function bestUrl(pin) {
    const imgs = pin && pin.images;
    if (!imgs) return null;
    const pick = imgs.orig || imgs["originals"] || imgs["1200x"] || imgs["736x"] || imgs["474x"] || imgs["236x"];
    return pick && pick.url;
  }

  // Pinterest names every image file by a hash of the image, and the same hash
  // is used at every size. So one key catches repins of the same picture, the
  // same pin in two sections, and an original vs. its 736px copy.
  const imageKey = (url) => url.split("?")[0].split("/").pop().replace(/\.[a-z0-9]+$/i, "").toLowerCase();

  const seen = new Set();
  const seenPins = new Set();
  const items = []; // { url, key, section } -- section is "" for the board root
  let dupes = 0;
  // A readable name for a pin's file, from the best text Pinterest has for it:
  // its title, the linked page's title, its description, then Pinterest's
  // automatic description of the image, followed by the site it came from.
  // Over a third of pins have none of that, so the last resort is the date it
  // was saved. The file name is finished (and made safe) in background.js.
  function describePin(pin) {
    const junk = /^(instagram|pinterest|facebook|tiktok|twitter|x|photo|image|picture|untitled|pin|home|shop)$/i;
    const tidy = (t) => {
      if (!t) return "";
      t = String(t).normalize("NFC")
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/(^|\s)[#@][\p{L}\p{N}_]+/gu, " ")   // hashtags and handles
        .replace(/^\s*\(\d+\)\s*/, "")              // "(2) Instagram": an unread count
        .replace(/\s+/g, " ")
        .trim();
      t = t.split(/\s[|•·–—]\s|\s-\s(?=[A-Z])/)[0];  // "Vestes pour homme | ZARA France"
      t = t.split(/(?<=[\p{Ll})])[.!?](?:\s|$)|\n/u)[0]; // first sentence; "8.0" is not a full stop
      t = t.replace(/[^\p{L}\p{N}\p{M} '&,().+-]/gu, " ").replace(/\s+/g, " ").replace(/^[\s.,'&+-]+|[\s.,'&+-]+$/g, "");
      const letters = t.replace(/[^\p{L}]/gu, "");
      if (letters.length < 3 || junk.test(t)) return "";
      if (letters === letters.toUpperCase()) t = t.toLowerCase();
      return t.charAt(0).toUpperCase() + t.slice(1);
    };
    const clip = (t, max) => {
      if (t.length <= max) return t;
      const cut = t.slice(0, max);
      const space = cut.lastIndexOf(" ");
      return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.&+(-]+$/, "");
    };
    const text =
      tidy(pin.title) || tidy(pin.grid_title) || tidy(pin.rich_summary && pin.rich_summary.display_name) ||
      tidy(pin.description) || tidy(pin.auto_alt_text) || tidy(pin.alt);
    const domain = pin.domain && !/uploaded by/i.test(pin.domain) ? pin.domain.replace(/^www\./i, "").toLowerCase() : "";
    // "zara.com" adds nothing to "ZARA France", but "us.shein.com" is not "us".
    const site = domain.split(".").slice(-2)[0] || "";
    const parts = [];
    if (text) parts.push(clip(text, 60));
    if (domain && !text.toLowerCase().includes(site)) parts.push(domain);
    if (!parts.length) {
      const date = pin.created_at && new Date(pin.created_at);
      parts.push(date && !isNaN(date.getTime()) ? `Pinned ${date.toISOString().slice(0, 10)}` : "Pin");
    }
    return parts.join(" - ");
  }

  const add = (section) => (pin) => {
    if (!pin || pin.type !== "pin") return;
    // The same pin coming back from the board feed after its section is not a
    // duplicate image, just the same pin listed twice.
    if (pin.id && seenPins.has(pin.id)) return;
    if (pin.id) seenPins.add(pin.id);
    const url = bestUrl(pin);
    if (!url) return;
    const key = imageKey(url);
    if (seen.has(key)) { dupes++; return; }
    seen.add(key);
    items.push({ url, key, section, name: describePin(pin) });
  };

  const pageTitle = () => {
    const h1 = document.querySelector("h1");
    return (h1 && h1.textContent.trim()) || slug.replace(/-/g, " ");
  };

  let boardName = pageTitle();
  let apiError = null;
  try {
    const board = await resource("BoardResource", { username, slug, field_set_key: "detailed" });
    const boardId = board.data.id;
    boardName = board.data.name || boardName;

    const sections = await paginate("BoardSectionsResource", { board_id: boardId });
    const wanted = sectionSlug ? sections.filter((s) => s.slug === sectionSlug) : sections;
    if (sectionSlug && !wanted.length) throw new Error(`Section "${sectionSlug}" not found`);

    // Sections first, so a pin that lives in a section is filed there even if
    // the board-wide feed also returns it.
    for (const section of wanted) {
      const title = section.title || section.slug || "Untitled section";
      (await paginate("BoardSectionPinsResource", { section_id: section.id, field_set_key: "grid_item" })).forEach(add(title));
    }
    if (!sectionSlug) {
      (await paginate("BoardFeedResource", { board_id: boardId, board_url: boardUrl, field_set_key: "grid_item" }))
        .forEach(add(""));
    }
    if (items.length > 0) {
      return { boardName, sectionCount: wanted.length, items, dupes, method: "api", onlySection: !!sectionSlug };
    }
  } catch (e) {
    apiError = e.message;
    console.warn("[board downloader] API path failed, falling back to scrolling:", e);
    // Reset state before fallback so partially collected items don't pollute scroll harvesting
    items.length = 0;
    seen.clear();
    seenPins.clear();
    dupes = 0;
  }

  // Fallback: scroll the page and harvest what the grid renders. The grid is
  // virtualized, so images must be collected while scrolling, not at the end.
  // This path cannot see sections: everything visible goes in one folder.
  const toOriginal = (src) => src.replace(/\/\d+x(\d+)?\//, "/originals/");
  let section = "";
  if (sectionSlug) {
    // On a section page the h1 is the section; the board name is the slug.
    section = pageTitle();
    boardName = slug.replace(/-/g, " ");
  }
  const harvest = () => {
    // Stop at Pinterest's "More ideas" recommendations below the board.
    const grid = document.querySelector('[data-test-id="board-feed"]') || document;
    grid.querySelectorAll('[data-grid-item] img[src*="i.pinimg.com"]').forEach((img) => {
      const src = (img.srcset && img.srcset.split(",").pop().trim().split(" ")[0]) || img.src;
      add(section)({ type: "pin", alt: img.alt, images: { orig: { url: toOriginal(src) } } });
    });
  };
  let lastCount = -1, stale = 0;
  while (stale < 6) {
    harvest();
    window.scrollBy(0, window.innerHeight * 0.9);
    await new Promise((r) => setTimeout(r, 900));
    if (items.length === lastCount) stale++; else { stale = 0; lastCount = items.length; }
  }
  window.scrollTo(0, 0);
  // A board whose pins are all in sections shows only section tiles, so
  // scrolling finds nothing; the API's reason is the useful message then.
  if (!items.length && apiError) return { error: `Couldn't read the board from Pinterest (${apiError}).` };
  return { boardName, sectionCount: 0, items, dupes, method: "scroll", onlySection: !!sectionSlug };
}

let tab = null;
let info = null;
let polling = false;

function showBoard() {
  show("board");
  $("board-name").textContent = info.section || info.name;
  const covers = info.covers || [];
  $("cover").hidden = !covers.length;
  $("cover").dataset.count = Math.min(covers.length, 3);
  $("cover").replaceChildren(
    ...covers.slice(0, 3).map((url) => {
      const div = document.createElement("div");
      div.style.backgroundImage = `url("${url}")`;
      return div;
    })
  );

  const meta = [];
  if (info.section) meta.push(`Section of ${info.name}`);
  if (info.pinCount) meta.push(plural(info.pinCount, "pin"));
  if (info.sections.length) meta.push(plural(info.sections.length, "section"));
  $("board-meta").textContent = meta.join(" · ");

  $("sections").replaceChildren(
    ...info.sections.map((sec) => {
      const li = document.createElement("li");
      li.textContent = sec.title;
      const n = document.createElement("span");
      n.textContent = sec.count;
      li.append(n);
      return li;
    })
  );
  setIdle();
}

function setIdle() {
  $("progress").hidden = true;
  $("stop").hidden = true;
  $("download").hidden = false;
  $("download").disabled = false;
  // The pin count is in the line above; duplicates make the image count lower
  // than that, so the button promises the board rather than a number.
  $("download").textContent = info.section ? "Download section" : "Download board";
}

function showError(message) {
  $("error").textContent = message;
  $("error").hidden = false;
}

function renderProgress(state) {
  const settled = state.done + state.failed + state.skipped;
  $("download").hidden = true;
  $("stop").hidden = false;
  $("stop").style.flex = "1";
  $("progress").hidden = false;
  renderTrack(state.segments || [{ name: state.boardName, total: state.total, settled }]);

  const current = (state.segments || []).find((seg) => seg.settled < seg.total);
  const where = current && state.segments.length > 1 ? `${current.name} · ` : "";
  $("progress-text").textContent = `${where}${settled.toLocaleString()} of ${plural(state.total, "image")}`;
}

// One stretch of the bar per section, sized by its image count, each filling on
// its own. The gaps between stretches are the section marks.
function renderTrack(segments) {
  const track = $("track");
  if (track.children.length !== segments.length) {
    track.replaceChildren(
      ...segments.map(() => {
        const seg = document.createElement("div");
        seg.className = "segment";
        seg.append(Object.assign(document.createElement("div"), { className: "fill" }));
        return seg;
      })
    );
  }
  segments.forEach((s, i) => {
    const el = track.children[i];
    el.style.flexGrow = s.total;
    el.title = `${s.name}: ${s.settled} of ${s.total}`;
    el.classList.toggle("complete", s.settled >= s.total);
    el.firstChild.style.width = `${s.total ? (100 * s.settled) / s.total : 0}%`;
  });
}

function renderDone(state) {
  show("done");
  const { done, skipped, failed, dupes, total } = state;
  $("done-title").textContent = state.stopped
    ? "Stopped"
    : failed
      ? `${(done + skipped).toLocaleString()} of ${total.toLocaleString()} saved`
      : done
        ? "All saved"
        : "Already saved";

  const detail = [];
  if (done) detail.push(`${plural(done, "image")} downloaded`);
  if (skipped) detail.push(`${plural(skipped, "image")} you already had`);
  if (dupes) detail.push(`${plural(dupes, "duplicate")} left out`);
  if (failed) detail.push(`${plural(failed, "image")} couldn’t be downloaded`);
  $("done-detail").textContent = detail.join("\n");

  $("done-path").textContent = `Downloads/${state.folder}`;
  $("reveal").textContent = isMac ? "Show in Finder" : "Show in folder";
  $("reveal").hidden = false;
}

async function poll() {
  if (polling) return;
  polling = true;
  try {
    for (;;) {
      const state = await chrome.runtime.sendMessage({ type: "status" });
      if (!state || !state.total) return;
      if (state.running) renderProgress(state);
      else return renderDone(state);
      await new Promise((r) => setTimeout(r, 400));
    }
  } finally {
    polling = false;
  }
}

$("download").addEventListener("click", async () => {
  $("error").hidden = true;
  $("download").disabled = true;
  $("download").textContent = "Finding pins…";
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectBoardImages });
    if (!result || result.error) throw new Error(result ? result.error : "Pinterest didn’t respond. Reload the page and try again.");
    if (!result.items.length) throw new Error("This board has no images to download.");
    await chrome.runtime.sendMessage({ type: "download", boardUrl: info.url, info, ...result });
    poll();
  } catch (e) {
    showError(e.message);
    setIdle();
  }
});

$("stop").addEventListener("click", () => chrome.runtime.sendMessage({ type: "stop" }));
$("reveal").addEventListener("click", () => chrome.runtime.sendMessage({ type: "reveal" }));
$("again").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "clear" });
  if (info && info.board) showBoard();
  else closePanel();
});

(async function start() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // The square popup is only a fallback for pages the panel can't open on;
  // unset it so the next click on a normal page gets the panel again.
  if (!embedded && tab) chrome.action.setPopup({ tabId: tab.id, popup: "" });

  // A download already under way takes precedence over whatever tab this is.
  const state = await chrome.runtime.sendMessage({ type: "status" });
  const onPinterest = tab && /^https:\/\/([a-z]+\.)?pinterest\.[a-z.]+\//.test(tab.url || "");

  if (onPinterest) {
    try {
      [{ result: info }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: boardInfo });
    } catch (_) {
      info = null;
    }
  }

  if (state && state.total && (state.running || (info && state.boardUrl === info.url))) {
    // Show the board being downloaded, which may not be the one in this tab.
    info = state.info || info;
    showBoard();
    if (state.running) {
      poll();
    } else {
      renderDone(state);
    }
    return;
  }

  if (!onPinterest) {
    $("nowhere-title").textContent = "Open a Pinterest board";
    $("nowhere-body").textContent = "Unpin downloads every image on a board, with a folder for each section.";
    return show("nowhere");
  }
  if (!info || !info.board) {
    $("nowhere-title").textContent = "This isn’t a board";
    $("nowhere-body").textContent = "Go to one of your boards, or anyone’s, then open Unpin again.";
    return show("nowhere");
  }
  showBoard();
  if (info.unreadable) showError("Pinterest wouldn’t share this board’s details. You can still try downloading it.");
})();
