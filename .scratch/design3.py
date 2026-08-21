import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("DESIGN.md", [
(
'''components/FeeCounter.tsx         running fee total in loss tone, student + host''',
'''components/FeeCounter.tsx         running fee total in loss tone, student + host
components/ManagerProspectus.tsx  manager cards: fees, 10-yr track record, inline SVG sparkline'''
),
])
