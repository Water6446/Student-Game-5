import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("components/host/CreateSessionForm.tsx", [
(
'''import { ArrowLeft, Coins, TrendUp, Trophy } from "@/components/icons";''',
'''import { ArrowLeft, Coins, TrendUp, Trophy } from "@/components/icons";
import { ManagerSetup } from "@/components/host/ManagerSetup";
import { MANAGER_PRESETS, type ManagerDraft } from "@/lib/game/manager";'''
),
(
'''  const [advanced, setAdvanced] = useState(false);
  const [customAssets, setCustomAssets] = useState(false);''',
'''  const [advanced, setAdvanced] = useState(false);
  const [customAssets, setCustomAssets] = useState(false);
  // The editable manager line-up. Only sent when the host has actually opened
  // Advanced — otherwise the server builds the preset itself, so there is one
  // source of truth for an untouched game.
  const [drafts, setDrafts] = useState<ManagerDraft[]>(() =>
    MANAGER_PRESETS.default.map((m) => ({ ...m })),
  );'''
),
(
'''      // The manager line-up is built SERVER-side from the preset: alpha never
      // travels through the client, and the skill shuffle has to happen in the
      // same transaction that writes session_secrets.
      ...(manager ? {} : { managers: undefined, num_managers: undefined }),''',
'''      // Untouched, the line-up is built SERVER-side from the preset name. Once
      // the host opens Advanced they are authoring alpha, so the full line-up
      // travels — validated server-side, and still split into public config and
      // session_secrets in the same transaction.
      ...(manager
        ? advanced
          ? { managers: drafts as unknown as SessionConfig["managers"], num_managers: drafts.length }
          : { managers: undefined, num_managers: drafts.length }
        : { managers: undefined, num_managers: undefined }),'''
),
(
'''        {/* The manager game's advanced panel (per-manager beta/alpha/fees) is
            Stage 5; until then the calibrated default preset is the only setup. */}
        {manager ? null : (
          <Toggle
            label="Advanced setup (change all settings)"
            checked={advanced}
            onChange={setAdvanced}
          />
        )}''',
'''        <Toggle
          label="Advanced setup (change all settings)"
          checked={advanced}
          onChange={setAdvanced}
        />'''
),
])
