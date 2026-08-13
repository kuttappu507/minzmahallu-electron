import { useEffect, useState } from "react";

export function Splash({ onDone }: { onDone: () => void }) {
  const [out, setOut] = useState(false);
  const [status, setStatus] = useState("Initializing database...");

  useEffect(() => {
    const steps = [
      "Initializing database...",
      "Loading schema...",
      "Applying migrations...",
      "Loading controllers...",
      "Almost ready...",
    ];
    let i = 0;
    const interval = setInterval(() => {
      i++;
      if (i < steps.length) setStatus(steps[i]);
      else clearInterval(interval);
    }, 350);

    const timer = setTimeout(() => {
      setOut(true);
      setTimeout(onDone, 400);
    }, 1900);

    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [onDone]);

  return (
    <div className={`splash-box-only ${out ? "out" : ""}`}>
      <div className="splash-logo">
        <b>M</b>
      </div>
      <div className="splash-text-group">
        <div className="splash-title">MMS</div>
        <div className="splash-sub">Minz Mahallu</div>
      </div>
      <div className="splash-progress">
        <i />
      </div>
      <div className="splash-status">{status}</div>
      <div className="splash-credit">Made by MinZ</div>
    </div>
  );
}
