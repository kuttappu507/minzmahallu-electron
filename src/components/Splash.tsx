import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";

export function Splash({ onDone }: { onDone: () => void }) {
  const { lang, t } = useI18n();
  const [out, setOut] = useState(false);
  const [status, setStatus] = useState("Initializing database...");

  useEffect(() => {
    const steps = ["Initializing database...", "Loading schema...", "Applying migrations...", "Loading controllers...", "Almost ready..."];
    let i = 0;
    const interval = setInterval(() => { i++; if (i < steps.length) setStatus(steps[i]); else clearInterval(interval); }, 350);
    const timer = setTimeout(() => { setOut(true); setTimeout(onDone, 400); }, 1900);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [onDone]);

  return (
    <div className={`splash-box-only ${out ? "out" : ""}`} aria-label="Minz Mahallu Management System">
      <div className="splash-logo"><img src="./logo.png" alt="MMS" /></div>
      <div className="splash-text-group">
        <div className="splash-title">MMS</div>
        <div className="splash-sub">{t("app_name")}</div>
      </div>
      <div className="splash-progress" aria-hidden="true"><i /></div>
      <div className="splash-status">{status}</div>
      <div className="splash-credit">{lang === "ml" ? "MinZ വികസിപ്പിച്ചത്" : "Developed by MinZ"}</div>
    </div>
  );
}
