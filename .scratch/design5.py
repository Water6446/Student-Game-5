import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("DESIGN.md", [
(
'''components/host/ManagerReveal.tsx the end-of-game truth: true alpha vs. what was delivered''',
'''components/host/ManagerReveal.tsx the end-of-game truth: true alpha vs. what was delivered
components/host/ManagerSetup.tsx  host-only manager editor (presets, per-manager alpha/beta/fees)'''
),
])
