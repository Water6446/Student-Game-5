import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("DESIGN.md", [
(
'''components/ManagerProspectus.tsx  manager cards: fees, 10-yr track record, inline SVG sparkline''',
'''components/ManagerProspectus.tsx  manager cards: fees, 10-yr track record, inline SVG sparkline
components/host/ManagerReveal.tsx the end-of-game truth: true alpha vs. what was delivered
components/use-manager-truth.ts   get_manager_truth() — the only route to the real parameters'''
),
])
