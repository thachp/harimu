"""Run every existing standalone SQL suite; filenames contain dots."""
from pathlib import Path
import subprocess
import sys

suites = sorted(Path('tests').glob('*.test.py'))
if not suites:
    raise SystemExit('No SQL suites found')
for suite in suites:
    result = subprocess.run([sys.executable, str(suite)])
    if result.returncode:
        raise SystemExit(result.returncode)
