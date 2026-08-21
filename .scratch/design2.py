import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("DESIGN.md", [
(
'''components/ManagerYearResult.tsx  manager game: one year's market + every manager's return''',
'''components/ManagerYearResult.tsx  manager game: one year's market + every manager's return
components/FeeCounter.tsx         running fee total in loss tone, student + host'''
),
])
