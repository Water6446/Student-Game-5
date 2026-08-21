import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("components/host/CreateSessionForm.tsx", [
(
'''      {advanced ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {portfolio ? (''',
'''      {advanced && manager ? (
        <div className="mt-6">
          <ManagerSetup cfg={cfg} set={set} drafts={drafts} onDrafts={setDrafts} />
        </div>
      ) : null}

      {advanced && !manager ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {portfolio ? ('''
),
])
