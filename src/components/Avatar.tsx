import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useSpace } from "../lib/store";
import type { Profile } from "../lib/types";
export function Avatar({
  profile,
  green = false,
  large = false,
}: {
  profile: Profile;
  green?: boolean;
  large?: boolean;
}) {
  const { demo, userId } = useSpace();
  const [failed, setFailed] = useState("");
  const picture = useQuery({
    queryKey: ["profile-picture", userId, profile.avatar_path],
    enabled: !demo && !!profile.avatar_path && !!supabase,
    queryFn: async () => {
      const r = await supabase!.storage
        .from("profile-pictures")
        .createSignedUrl(profile.avatar_path!, 3600);
      if (r.error) throw r.error;
      return r.data.signedUrl;
    },
    staleTime: 45 * 60 * 1000,
    refetchInterval: 45 * 60 * 1000,
    retry: 1,
  });
  const url = demo ? profile.avatar_url : picture.data;
  return (
    <span
      className={`avatar ${green ? "green" : ""} ${large ? "avatar-large" : ""}`}
      aria-label={profile.name}
    >
      {url && url !== failed ? (
        <img src={url} alt="" onError={() => setFailed(url)} />
      ) : (
        profile.name.slice(0, 1)
      )}
    </span>
  );
}
