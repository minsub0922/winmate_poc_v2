"""Local, opt-in Winmate administration application."""
from pathlib import Path
import sys

# Optional document/image readers stay under the ignored admin directory.
_packages = Path(__file__).resolve().parent / 'runtime/python'
if _packages.is_dir():
    sys.path.insert(0, str(_packages))
