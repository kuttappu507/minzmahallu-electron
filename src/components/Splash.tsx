import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";

export function Splash({ onDone }: { onDone: () => void }) {
  const { lang, t } = useI18n();
  const [out, setOut] = useState(false);
  const [status, setStatus] = useState("Initializing database...");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const steps = [
      { msg: "Initializing database...", pct: 18 },
      { msg: "Loading schema...", pct: 38 },
      { msg: "Applying migrations...", pct: 60 },
      { msg: "Loading controllers...", pct: 82 },
      { msg: "Almost ready...", pct: 96 },
    ];
    let i = 0;
    const tick = () => {
      if (i < steps.length) {
        setStatus(steps[i].msg);
        setProgress(steps[i].pct);
        i++;
      } else {
        clearInterval(interval);
      }
    };
    tick(); // first step immediately
    const interval = setInterval(tick, 350);
    const timer = setTimeout(() => {
      setProgress(100);
      setStatus(lang === "ml" ? "തയ്യാറാണ്" : "Ready");
      setOut(true);
      setTimeout(onDone, 450);
    }, 1900);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [onDone, lang]);

  return (
    <div className={`splash-box-only ${out ? "out" : ""}`} aria-label="Minz Mahallu Management System">
      {/* Ambient glow behind the logo */}
      <div className="splash-glow" aria-hidden="true" />
      {/* Logo in a tinted tile with animated ring */}
      <div className="splash-logo">
        <div className="splash-logo-ring" aria-hidden="true" />
        <img src="./logo.png" alt="MMS" />
      </div>
      <div className="splash-text-group">
        <div className="splash-title">MMS</div>
        <div className="splash-sub">{t("app_name")}</div>
      </div>
      {/* Progress bar with percentage label */}
      <div className="splash-progress-wrap">
        <div className="splash-progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
        <div className="splash-progress-meta">
          <span className="splash-status">{status}</span>
          <span className="splash-pct">{progress}%</span>
        </div>
      </div>
      <div className="splash-credit">{lang === "ml" ? "MinZ വികസിപ്പിച്ചത്" : "Developed by MinZ"}</div>
    </div>
  );
}
