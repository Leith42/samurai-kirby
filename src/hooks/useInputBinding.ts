import { useEffect, useMemo, useState } from "react";

export type InputBinding =
  | { kind: "key"; code: string }
  | { kind: "mouse"; button: 0 | 1 | 2 };

const DEFAULT_BIND: InputBinding = { kind: "key", code: "Space" };

function readBinding(): InputBinding {
  const raw = localStorage.getItem("samurai.binding");
  if (!raw) return DEFAULT_BIND;

  const obj = JSON.parse(raw);
  if (obj && obj.kind === "key" && typeof obj.code === "string") {
    return { kind: "key", code: obj.code };
  }

  if (
    obj &&
    obj.kind === "mouse" &&
    (obj.button === 0 || obj.button === 1 || obj.button === 2)
  ) {
    return { kind: "mouse", button: obj.button };
  }
  return DEFAULT_BIND;
}

function formatBinding(b: InputBinding): string {
  if (b.kind === "mouse")
    return b.button === 0
      ? "Mouse Left"
      : b.button === 1
        ? "Mouse Middle"
        : "Mouse Right";
  const c = b.code;
  if (c.startsWith("Key") && c.length === 4) return c.slice(3);
  if (c.startsWith("Digit") && c.length === 6) return c.slice(5);
  return c.replace("Arrow", "Arrow ");
}

export default function useInputBinding() {
  const [binding, setBinding] = useState<InputBinding>(() => readBinding());
  const [listening, setListening] = useState(false);

  // Persist binding to localStorage
  useEffect(() => {
    localStorage.setItem("samurai.binding", JSON.stringify(binding));
  }, [binding]);

  // Rebinding capture: next key or mouse updates binding
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        setListening(false);
        return;
      }
      setBinding({ kind: "key", code: e.code });
      setListening(false);
    };
    const onMouse = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.button as 0 | 1 | 2;
      setBinding({ kind: "mouse", button: btn });
      setListening(false);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("mousedown", onMouse, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onMouse, true);
    };
  }, [listening]);

  // Prevent context menu if right mouse button is bound
  useEffect(() => {
    if (!(binding.kind === "mouse" && binding.button === 2)) return;
    const onCtx = (e: MouseEvent) => {
      e.preventDefault();
    };
    window.addEventListener("contextmenu", onCtx);
    return () => {
      window.removeEventListener("contextmenu", onCtx);
    };
  }, [binding]);

  const label = useMemo(() => formatBinding(binding), [binding]);

  return {
    binding,
    setBinding,
    listening,
    startListening: () => setListening(true),
    stopListening: () => setListening(false),
    label,
    formatBinding,
  } as const;
}
