#!/usr/bin/env python3
"""Build an installable ZIP from an explicit list of public runtime files."""
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent.parent


def build_package():
    manifest = json.loads((ROOT / "plugin.json").read_text())
    version = manifest["version"]
    if not version or any(c not in "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-" for c in version):
        raise ValueError("Invalid plugin version")
    # Never recurse over the checkout: local .env files, backups, logs, and Git
    # metadata must not enter a distributable, even if they are untracked.
    files = [
        ROOT / name for name in (
            "plugin.json", ".claude-plugin/plugin.json", "README.md", "LICENSE",
            "package.json", "server.mjs", "index.html", "reset-onboarding.sh",
            "scripts/start-plugin.mjs", "skills/start/SKILL.md", "assets/styles.css",
        )
    ]
    files += sorted((ROOT / "lib").glob("*.mjs"))
    files += sorted((ROOT / "assets" / "icons").glob("*.svg"))
    files += sorted((ROOT / "assets" / "icons").glob("*.png"))
    files += sorted((ROOT / "assets" / "gif").glob("*.gif"))
    for file in files:
        if not file.is_file() or file.is_symlink() or not file.resolve().is_relative_to(ROOT):
            raise ValueError(f"Missing or unsafe package file: {file.relative_to(ROOT)}")
    output = ROOT / "dist" / f"moss-tracker-{version}.zip"
    output.parent.mkdir(exist_ok=True)
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        for file in files:
            archive.write(file, file.relative_to(ROOT).as_posix())
    print(output)
    return output


if __name__ == "__main__":
    build_package()
