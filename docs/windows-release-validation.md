# Windows release 0.2.0 — 2026-10-16

- Repository: https://github.com/ntccong2468-lab/WO-Bast
- Source/tag: `3a00416098335914157f4bc5c920d5355a6a693b`, `v0.2.0`.
- GitHub Actions completed successfully: https://github.com/ntccong2468-lab/WO-Bast/actions/runs/38948789493
- Release: https://github.com/ntccong2468-lab/WO-Bast/releases/tag/v0.2.0
- Installer: `VN-Pochta-Setup-0.2.0-x64.exe`, 186,903,622 bytes.
- SHA256: `35082c0625bca252acfd766e7bb80873d6e61c6d27126ec9d4ffc7fc51093815`.

Downloaded the published installer from GitHub, verified its SHA256 against the published checksum and checked its NSIS archive with 7-Zip (`Everything is Ok`). Confirmed packaged executable, compiled main/preload code, Windows native modules and uninstaller are present.

Local source checks passed: 38 tests in 13 files, typecheck, Prettier and `git diff --check`. GitHub Actions independently ran typecheck, tests, application build, Windows packaging and NSIS compilation before uploading the EXE, portable ZIP and checksums.

The installer is per-user and creates Desktop/Start Menu shortcuts. Uninstallation preserves application userData outside the installation folder. The release is unsigned. Actual Windows installation, launch and live OpenAI API use remain unverified.
