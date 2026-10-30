import "./reader.css";
import { chapters, artwork } from "./content";

type ReaderOptions = {
  canRead: () => boolean;
  reducedMotion: boolean;
  initialChapter?: number;
  onClose?: () => void;
};

/** Own the album's chapter content and controls, independently of the camera. */
export function createReaderController(options: ReaderOptions) {
  const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const reader = el("reader"), book = el("book");
  const previous = el<HTMLButtonElement>("prev"), next = el<HTMLButtonElement>("next");
  const dots = el("chapter-dots"), top = reader.querySelector<HTMLElement>(".reader-top")!;
  let chapter = Number.isInteger(options.initialChapter)
    ? Math.max(0, Math.min(chapters.length - 1, options.initialChapter!)) : 0;
  let turning = false, version = 0, disposed = false, renderedContent = "";
  let swipe: { identifier: number; x: number; y: number } | undefined;
  const timers = new Map<number, () => void>();

  const contentsToggle = document.createElement("button");
  contentsToggle.type = "button";
  contentsToggle.id = "chapter-contents-toggle";
  contentsToggle.className = "text-button chapter-contents-toggle";
  contentsToggle.textContent = "章节目录";
  contentsToggle.setAttribute("aria-expanded", "false");
  contentsToggle.setAttribute("aria-controls", "chapter-contents");
  const contents = document.createElement("nav");
  contents.id = "chapter-contents";
  contents.className = "chapter-contents";
  contents.setAttribute("aria-label", "纪念册章节");
  contents.hidden = true;
  const list = document.createElement("ol");
  contents.append(list);
  top.insertBefore(contentsToggle, el("close-book"));
  top.append(contents);
  el("chapter-count").setAttribute("role", "status");
  el("chapter-count").setAttribute("aria-live", "polite");
  el("chapter-count").setAttribute("aria-atomic", "true");
  previous.title = "切换到上一章（←）";
  next.title = "切换到下一章（→）";
  const keyboardHint = reader.querySelector<HTMLElement>(".keyboard-hint");
  if (keyboardHint) keyboardHint.textContent = "← → 切换章节 · ESC 返回";

  function visible(element: HTMLElement) {
    return !element.closest("[hidden],.hidden,[inert]") && element.getClientRects().length > 0;
  }
  function closeContents(restoreFocus = false) {
    const wasOpen = !contents.hidden;
    contents.hidden = true;
    contentsToggle.setAttribute("aria-expanded", "false");
    if (wasOpen && restoreFocus && visible(contentsToggle)) contentsToggle.focus({ preventScroll: true });
  }
  function openContents() {
    if (!options.canRead() || turning || disposed) return;
    contents.hidden = false;
    contentsToggle.setAttribute("aria-expanded", "true");
    contents.querySelector<HTMLButtonElement>(`[data-chapter="${chapter}"]`)?.focus({ preventScroll: true });
  }
  function updateControls() {
    previous.disabled = turning || chapter === 0;
    next.disabled = turning || chapter === chapters.length - 1;
    contentsToggle.disabled = turning;
    dots.querySelectorAll<HTMLButtonElement>("button").forEach((button, index) => {
      button.disabled = turning;
      button.classList.toggle("selected", index === chapter);
      button.setAttribute("aria-current", String(index === chapter));
    });
    list.querySelectorAll<HTMLButtonElement>("button").forEach((button, index) => {
      button.disabled = turning;
      if (index === chapter) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }
  function makeControls() {
    if (dots.childElementCount !== chapters.length) {
      dots.replaceChildren(...chapters.map((item, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.page = String(index);
        button.setAttribute("aria-label", `跳到${item.date}`);
        button.title = `${item.date} · ${item.title}`;
        button.onclick = () => { void turn(index); };
        return button;
      }));
    }
    if (list.childElementCount !== chapters.length) {
      list.replaceChildren(...chapters.map((item, index) => {
        const entry = document.createElement("li"), button = document.createElement("button");
        button.type = "button";
        button.dataset.chapter = String(index);
        const date = document.createElement("span"), title = document.createElement("span");
        date.className = "contents-date";
        date.textContent = item.date;
        title.textContent = item.title;
        button.append(date, title);
        button.onclick = () => {
          closeContents(true);
          void turn(index);
        };
        entry.append(button);
        return entry;
      }));
    }
  }
  function render() {
    if (disposed) return;
    const item = chapters[chapter];
    const contentKey = JSON.stringify([chapter, chapters.length, item.date, item.subtitle, item.title,
      item.text, item.note, item.caption, item.scene, item.image]);
    if (renderedContent !== contentKey) {
      el("chapter-date").textContent = item.date;
      el("chapter-subtitle").textContent = item.subtitle;
      el("chapter-title").textContent = item.title;
      el("chapter-text").textContent = item.text;
      el("chapter-note").textContent = item.note;
      el("photo-caption").textContent = item.caption;
      const makeArtwork = () => {
        const image = artwork(item.scene);
        image.setAttribute("role", "img");
        image.setAttribute("aria-label", `${item.title}：${item.scene === "mountain" ? "层叠青山" : "海岸风景"}原创插画`);
        return image;
      };
      if (item.image) {
        const image = new Image();
        image.alt = item.caption;
        image.decoding = "async";
        image.onerror = () => {
          if (!disposed && renderedContent === contentKey && image.parentElement === el("art-holder"))
            el("art-holder").replaceChildren(makeArtwork());
        };
        image.src = item.image;
        el("art-holder").replaceChildren(image);
      } else el("art-holder").replaceChildren(makeArtwork());
      el("left-number").textContent = String(chapter * 2 + 1).padStart(2, "0");
      el("right-number").textContent = String(chapter * 2 + 2).padStart(2, "0");
      el("chapter-count").textContent = `${String(chapter + 1).padStart(2, "0")} / ${String(chapters.length).padStart(2, "0")} 章`;
      el("chapter-count").setAttribute("aria-label", `${item.date}，${item.title}。第 ${chapter + 1} 章，共 ${chapters.length} 章。`);
      renderedContent = contentKey;
    }
    makeControls();
    updateControls();
  }
  function wait(duration: number) {
    return new Promise<void>(resolve => {
      const id = window.setTimeout(() => { timers.delete(id); resolve(); }, duration);
      timers.set(id, resolve);
    });
  }
  function cleanTurn() {
    book.querySelectorAll(".turn-leaf").forEach(leaf => leaf.remove());
    book.classList.remove("turning");
    book.setAttribute("aria-busy", "false");
    turning = false;
    updateControls();
  }
  function cancelTurn() {
    ++version;
    for (const [id, resolve] of timers) { window.clearTimeout(id); resolve(); }
    timers.clear();
    swipe = undefined;
    cleanTurn();
    closeContents();
  }
  async function turn(target: number) {
    if (disposed || !options.canRead() || turning || target < 0 || target >= chapters.length || target === chapter) return;
    const focused = document.activeElement instanceof HTMLElement && reader.contains(document.activeElement)
      ? document.activeElement : null;
    closeContents();
    turning = true;
    const operation = ++version;
    updateControls();
    book.setAttribute("aria-busy", "true");
    const forward = target > chapter;
    if (innerWidth >= 760 && !options.reducedMotion) {
      const leaf = document.createElement("div"), front = document.createElement("div"), back = document.createElement("div");
      leaf.className = `turn-leaf ${forward ? "forward" : "backward"}`;
      leaf.setAttribute("aria-hidden", "true");
      front.className = "leaf-front";
      back.className = "leaf-back";
      const source = book.querySelector(forward ? ".page-right" : ".page-left")!;
      const clone = source.cloneNode(true) as HTMLElement;
      const originals = source.querySelectorAll("canvas");
      clone.querySelectorAll("canvas").forEach((canvas, index) => {
        canvas.getContext("2d")!.drawImage(originals[index], 0, 0);
      });
      clone.querySelectorAll("[id]").forEach(element => element.removeAttribute("id"));
      front.append(clone);
      leaf.append(front, back);
      book.append(leaf);
    } else book.classList.add("turning");
    await wait(options.reducedMotion ? 0 : 260);
    if (disposed || operation !== version || !options.canRead()) return;
    chapter = target;
    render();
    await wait(options.reducedMotion ? 0 : 340);
    if (disposed || operation !== version) return;
    cleanTurn();
    book.scrollTo({ top: 0, behavior: options.reducedMotion ? "instant" : "smooth" });
    if (focused && options.canRead()) {
      if (focused.isConnected && !focused.matches(":disabled") && visible(focused)) focused.focus({ preventScroll: true });
      else if (visible(contentsToggle)) contentsToggle.focus({ preventScroll: true });
    }
  }
  function onContentsToggle() { if (contents.hidden) openContents(); else closeContents(true); }
  function onOutsidePointer(event: PointerEvent) {
    if (!contents.hidden && event.target instanceof Node && !contents.contains(event.target) && !contentsToggle.contains(event.target))
      closeContents();
  }
  function onReaderKey(event: KeyboardEvent) {
    if (!options.canRead() || disposed) return;
    if (event.key === "Escape" && !contents.hidden) {
      event.preventDefault();
      event.stopPropagation();
      closeContents(true);
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(reader.querySelectorAll<HTMLElement>("button:not(:disabled),a[href],[tabindex='0']")).filter(visible);
    const first = controls[0], last = controls.at(-1);
    if (!first || !last) { event.preventDefault(); reader.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === reader)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === reader)) {
      event.preventDefault(); first.focus();
    }
  }
  function onWindowKey(event: KeyboardEvent) {
    if (!options.canRead() || disposed || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      void turn(chapter + (event.key === "ArrowRight" ? 1 : -1));
    } else if (event.key === "Escape") {
      event.preventDefault(); options.onClose?.();
    }
  }
  function onTouchStart(event: TouchEvent) {
    if (!options.canRead() || turning || event.touches.length !== 1) { swipe = undefined; return; }
    const touch = event.touches[0];
    swipe = { identifier: touch.identifier, x: touch.clientX, y: touch.clientY };
  }
  function onTouchMove(event: TouchEvent) { if (event.touches.length !== 1) swipe = undefined; }
  function onTouchEnd(event: TouchEvent) {
    const start = swipe;
    swipe = undefined;
    if (!start || event.touches.length) return;
    const touch = Array.from(event.changedTouches).find(item => item.identifier === start.identifier);
    if (!touch) return;
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.25) void turn(chapter + (dx < 0 ? 1 : -1));
  }
  function onTouchCancel() { swipe = undefined; }
  const onPrevious = () => { void turn(chapter - 1); }, onNext = () => { void turn(chapter + 1); };
  previous.addEventListener("click", onPrevious);
  next.addEventListener("click", onNext);
  contentsToggle.addEventListener("click", onContentsToggle);
  document.addEventListener("pointerdown", onOutsidePointer);
  reader.addEventListener("keydown", onReaderKey);
  window.addEventListener("keydown", onWindowKey);
  book.addEventListener("touchstart", onTouchStart, { passive: true });
  book.addEventListener("touchmove", onTouchMove, { passive: true });
  book.addEventListener("touchend", onTouchEnd, { passive: true });
  book.addEventListener("touchcancel", onTouchCancel, { passive: true });

  return {
    getChapter: () => chapter,
    render,
    cancelTurn,
    closeContents: () => closeContents(),
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelTurn();
      previous.removeEventListener("click", onPrevious);
      next.removeEventListener("click", onNext);
      contentsToggle.removeEventListener("click", onContentsToggle);
      document.removeEventListener("pointerdown", onOutsidePointer);
      reader.removeEventListener("keydown", onReaderKey);
      window.removeEventListener("keydown", onWindowKey);
      book.removeEventListener("touchstart", onTouchStart);
      book.removeEventListener("touchmove", onTouchMove);
      book.removeEventListener("touchend", onTouchEnd);
      book.removeEventListener("touchcancel", onTouchCancel);
      dots.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.onclick = null; });
      contentsToggle.remove();
      contents.remove();
    },
  };
}
