
function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

export function installWebviewGuards(): void {
  const isDev = import.meta.env.DEV;

  document.addEventListener("contextmenu", (e) => e.preventDefault());

  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (!isDev) {
      if (e.key === "F12") return e.preventDefault();
      if (mod && e.shiftKey && (key === "i" || key === "j" || key === "c")) {
        return e.preventDefault();
      }
    }

    if (mod && !e.shiftKey && !e.altKey) {
      if (["f", "g", "p", "u", "s", "o", "=", "-", "+", "0"].includes(key)) {
        return e.preventDefault();
      }
    }
    if (mod && e.shiftKey && key === "g") return e.preventDefault();

    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      return e.preventDefault();
    }
    if (e.key === "Backspace" && !isEditable(e.target)) {
      return e.preventDefault();
    }
  });

  document.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  }, { passive: false });

  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => e.preventDefault());
}
