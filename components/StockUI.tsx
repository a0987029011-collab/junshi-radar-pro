import type { Classification } from "../lib/types";

export function ClassificationBadge({
  classification
}: {
  classification: Classification;
}) {
  const labels: Record<Classification, string> = {
    S: "S 狙擊",
    A: "A 突破",
    "A+": "A+ 整理",
    Seed: "SEED",
    Watch: "觀察"
  };
  const classes: Record<Classification, string> = {
    S: "badge-s",
    A: "badge-a",
    "A+": "badge-aplus",
    Seed: "badge-seed",
    Watch: "badge-watch"
  };
  return (
    <span className={`badge ${classes[classification]}`}>
      {labels[classification]}
    </span>
  );
}

export function MaturityBar({ value }: { value: number }) {
  return (
    <div className="maturity" aria-label={`成熟度 ${value}%`}>
      <div className="maturity-track">
        <div className="maturity-fill" style={{ width: `${value}%` }} />
      </div>
      <strong>{value}%</strong>
    </div>
  );
}

export function formatPrice(value: number) {
  return value >= 100 ? value.toFixed(1) : value.toFixed(2);
}
