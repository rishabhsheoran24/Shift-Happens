import { useState, useEffect } from "react";
export const MAX_ELIXIR = 10;

export function useElixir() {
  const [elixir, setElixir] = useState(5);
  useEffect(() => {
    const t = setInterval(() => setElixir((e) => Math.min(MAX_ELIXIR, e + 1)), 5000);
    return () => clearInterval(t);
  }, []);
  function spend(cost) {
    if (elixir < cost) return false;
    setElixir((e) => e - cost);
    return true;
  }
  return { elixir, spend };
}