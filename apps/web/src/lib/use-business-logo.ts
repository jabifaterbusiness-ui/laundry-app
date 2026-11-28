import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBusinessLogo } from "./businesses-api.js";

export function useBusinessLogo(input: { accessToken: string | null; branchId?: string | null; hasLogo: boolean }) {
  const query = useQuery({
    queryKey: ["business-logo", input.branchId],
    queryFn: () => getBusinessLogo({ accessToken: input.accessToken }, input.branchId),
    enabled: Boolean(input.accessToken && input.branchId && input.hasLogo),
    retry: false,
  });
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!query.data) {
      setLogoUrl(null);
      return;
    }
    let active = true;
    const reader = new FileReader();
    reader.onload = () => {
      if (active) setLogoUrl(typeof reader.result === "string" ? reader.result : null);
    };
    reader.onerror = () => {
      if (active) setLogoUrl(null);
    };
    reader.readAsDataURL(query.data);
    return () => {
      active = false;
      reader.abort();
    };
  }, [query.data]);

  return { ...query, logoUrl };
}
