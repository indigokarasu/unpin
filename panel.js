// Injected into the Pinterest tab when the toolbar icon is clicked. Chrome's
// own popup window is square and sits flush against the toolbar, and nothing
// inside it can change that, so Unpin floats its panel over the page instead:
// dropped 5px below the toolbar, with real rounded corners and a shadow.
// Clicking the icon again, pressing Escape or clicking the page closes it.
(() => {
  const ID = "unpin-panel-host";
  const existing = document.getElementById(ID);
  if (existing) {
    existing.dispatchEvent(new Event("unpin-close"));
    return;
  }

  const host = document.createElement("div");
  host.id = ID;
  // A shadow root keeps Pinterest's CSS from reaching the frame, and ours from
  // reaching Pinterest.
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .frame {
        position: fixed;
        top: 5px;
        right: 12px;
        z-index: 2147483647;
        width: 340px;
        height: 200px;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06), 0 8px 32px rgba(0, 0, 0, 0.24);
        opacity: 0;
        transform: translateY(-4px);
        transition: opacity 140ms ease, transform 140ms ease, height 160ms ease;
      }
      .frame.open { opacity: 1; transform: none; }
      iframe { display: block; width: 100%; height: 100%; border: 0; background: transparent; }
      @media (prefers-reduced-motion: reduce) { .frame { transition: none; } }
    </style>
    <div class="frame"><iframe allowtransparency="true"></iframe></div>`;
  const frame = root.querySelector(".frame");
  const iframe = root.querySelector("iframe");
  iframe.src = chrome.runtime.getURL("popup.html?embedded=1");

  const origin = new URL(iframe.src).origin;
  const close = () => {
    removeEventListener("message", onMessage);
    removeEventListener("keydown", onKey, true);
    removeEventListener("mousedown", onOutside, true);
    frame.classList.remove("open");
    setTimeout(() => host.remove(), 150);
  };
  const onMessage = (e) => {
    if (e.origin !== origin || !e.data || typeof e.data !== "object") return;
    if (e.data.unpin === "height") {
      frame.style.height = `${Math.min(e.data.height, innerHeight - 10)}px`;
      frame.classList.add("open");
    } else if (e.data.unpin === "close") {
      close();
    }
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  const onOutside = (e) => { if (!e.composedPath().includes(host)) close(); };

  host.addEventListener("unpin-close", close);
  addEventListener("message", onMessage);
  addEventListener("keydown", onKey, true);
  addEventListener("mousedown", onOutside, true);
  document.documentElement.append(host);
})();
