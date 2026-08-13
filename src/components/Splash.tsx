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
        <svg viewBox="0 0 256 256" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="splashGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#e3f6ec"/>
              <stop offset="100%" stopColor="#bfe8d4"/>
            </linearGradient>
          </defs>
          <rect width="256" height="256" rx="56" fill="url(#splashGrad)" stroke="#0eab7f" strokeWidth="4"/>
          <text x="128" y="178" fontFamily="Poppins, Arial, sans-serif" fontSize="140" fontWeight="700" fill="#0eab7f" textAnchor="middle">M</text>
        </svg>
      </div>
      <div className="splash-text-group">
        <div className="splash-title">MMS</div>
        <div className="splash-sub">Minz Mahallu</div>
      </div>
      <div className="splash-progress">
        <i />
      </div>
      <div className="splash-status">{status}</div>
    </div>
  );
}
