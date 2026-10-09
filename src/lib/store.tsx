import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { loadSnapshot } from "./repository";
import { supabase } from "./supabase";
import { emptySnapshot } from "./types";
import type { Snapshot } from "./types";
type Store = {
  data: Snapshot;
  userId: string;
  demo: boolean;
  busy: boolean;
  loading: boolean;
  error: string;
  notice: string;
  run: (fn: () => Promise<unknown>, message?: string) => Promise<boolean>;
  notify: (message: string) => void;
  refresh: () => void;
};
const Context = createContext<Store | null>(null);
export function SpaceProvider({
  children,
  userId,
  demo,
}: {
  children: ReactNode;
  userId: string;
  demo: boolean;
}) {
  const queryClient = useQueryClient();
  const key = ["space", demo, userId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => loadSnapshot(demo, userId),
    refetchOnWindowFocus: true,
    refetchInterval: demo ? false : 30000,
    retry: 1,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["space", demo, userId] });
  };
  useEffect(() => {
    if (demo || !supabase) return;
    const channel = supabase
      .channel("shared-space-" + userId)
      .on("postgres_changes", { event: "*", schema: "public" }, refresh)
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR")
          setNotice("Live updates paused. We’ll keep checking for changes.");
      });
    const focus = () => refresh();
    window.addEventListener("online", focus);
    return () => {
      void supabase?.removeChannel(channel);
      window.removeEventListener("online", focus);
    };
  }, [demo, userId]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function run(fn: () => Promise<unknown>, message = "Saved") {
    setBusy(true);
    setError("");
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: key });
      setNotice(message);
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : (e as { message?: string })?.message ||
              "Could not save. Please try again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <Context.Provider
      value={{
        data: query.data || emptySnapshot,
        userId,
        demo,
        busy,
        loading: query.isLoading,
        error: error || (query.error?.message ?? ""),
        notice,
        run,
        notify: setNotice,
        refresh,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSpace() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("SpaceProvider missing");
  return ctx;
}
