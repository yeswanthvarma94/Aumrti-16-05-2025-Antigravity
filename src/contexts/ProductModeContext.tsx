import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useHospitalContext } from "./HospitalContext";

interface ProductModeContextValue {
  productMode: string;
  enabledModules: string[] | null; // null = all modules (no config saved yet)
  loadingMode: boolean;
  isModuleEnabled: (key: string) => boolean;
  refreshMode: () => void;
}

const ProductModeContext = createContext<ProductModeContextValue>({
  productMode: "hospital",
  enabledModules: null,
  loadingMode: false,
  isModuleEnabled: () => true,
  refreshMode: () => undefined,
});

const CACHE_PREFIX = "hms_pmode_";

export const ProductModeProvider = ({ children }: { children: React.ReactNode }) => {
  const { hospitalId, loading: ctxLoading } = useHospitalContext();
  const [productMode, setProductMode] = useState("hospital");
  const [enabledModules, setEnabledModules] = useState<string[] | null>(null);
  const [loadingMode, setLoadingMode] = useState(true);

  const fetchMode = async (hid: string) => {
    const cacheKey = CACHE_PREFIX + hid;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { mode, modules } = JSON.parse(cached);
        setProductMode(mode || "hospital");
        setEnabledModules(modules ?? null);
        setLoadingMode(false);
        return;
      } catch { /* ignore */ }
    }
    const { data } = await (supabase as any)
      .from("product_modes")
      .select("mode, enabled_modules")
      .eq("hospital_id", hid)
      .maybeSingle();
    const mode = data?.mode || "hospital";
    const modules: string[] | null = data?.enabled_modules ?? null;
    setProductMode(mode);
    setEnabledModules(modules);
    setLoadingMode(false);
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ mode, modules })); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (ctxLoading) return;
    if (!hospitalId) { setLoadingMode(false); return; }
    fetchMode(hospitalId);
  }, [hospitalId, ctxLoading]);

  const refreshMode = () => {
    if (!hospitalId) return;
    try { sessionStorage.removeItem(CACHE_PREFIX + hospitalId); } catch { /* ignore */ }
    fetchMode(hospitalId);
  };

  const isModuleEnabled = (key: string) =>
    !enabledModules || enabledModules.includes(key);

  return (
    <ProductModeContext.Provider value={{ productMode, enabledModules, loadingMode, isModuleEnabled, refreshMode }}>
      {children}
    </ProductModeContext.Provider>
  );
};

export const useProductMode = () => useContext(ProductModeContext);
