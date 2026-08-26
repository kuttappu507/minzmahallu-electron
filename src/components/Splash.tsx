import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";

export function Splash({ onDone }: { onDone: () => void }) {
  const { lang, t } = useI18n();
  const [out, setOut] = useState(false);
  const [status, setStatus] = useState(lang === "ml" ? "ഡാറ്റാബേസ് തുറക്കുന്നു..." : "Initializing database...");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const steps = lang === "ml" ? [
      { msg: "ഡാറ്റാബേസ് തുറക്കുന്നു...", pct: 18 },
      { msg: "സ്കീമ ലോഡ് ചെയ്യുന്നു...", pct: 38 },
      { msg: "മൈഗ്രേഷനുകൾ പ്രയോഗിക്കുന്നു...", pct: 60 },
      { msg: "കൺട്രോളറുകൾ ലോഡ് ചെയ്യുന്നു...", pct: 82 },
      { msg: "ഉടൻ തയ്യാറാകും...", pct: 96 },
    ] : [
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
    tick();
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
      <div className="splash-logo">
        <img src="./logo.png" alt="MMS" />
      </div>
      <div className="splash-text-group">
        <div className="splash-title">MMS</div>
        <div className="splash-sub">{t("app_name")}</div>
      </div>
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
