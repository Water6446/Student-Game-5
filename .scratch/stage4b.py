import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("components/student/StudentFinished.tsx", [
(
'''  const [manager Summary, setManagerSummary] = useState<{''',
'''  const [managerSummary, setManagerSummary] = useState<{'''
),
(
'''function CfRow({''',
'''/** One line of the index comparison: label left, money right. */
function SumRow({
  label,
  value,
  tone,
  bold,
}: {
  label: string;
  value: string;
  tone?: "gain" | "loss";
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd
        className={`shrink-0 ${bold ? "font-black" : "font-bold"} ${
          tone === "loss" ? "text-loss" : tone === "gain" ? "text-gain" : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function CfRow({'''
),
])
