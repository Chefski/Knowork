import { useEffect, useState } from 'react';
import { getHealth } from '../api.js';

export function DemoBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getHealth()
      .then((info) => {
        if (!cancelled && info.demo_banner) setShow(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;
  return (
    <div className="bg-amber-100 px-6 py-2 text-center text-xs text-amber-900">
      Demo only — self-host for real use; data may be wiped without notice.
    </div>
  );
}
