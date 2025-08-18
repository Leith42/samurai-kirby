import { useEffect } from "react";
import type { InputBinding } from "./useInputBinding";

/**
 * Sets up global listeners for the configured binding and invokes onTrigger when matched.
 * Suppressed while `listening` is true (during rebind capture).
 */
export default function useBoundAction(
  binding: InputBinding,
  listening: boolean,
  onTrigger: () => void,
) {
  useEffect(() => {
    if (listening) return;

    const onKey = (e: KeyboardEvent) => {
      if (listening) return; // double-check
      if (binding.kind === "key" && e.code === binding.code) {
        e.preventDefault();
        onTrigger();
      }
    };

    const onMouse = (e: MouseEvent) => {
      if (listening) return; // double-check
      if (binding.kind === "mouse" && e.button === binding.button) {
        e.preventDefault();
        onTrigger();
      }
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onMouse);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onMouse);
    };
  }, [binding, listening, onTrigger]);
}
