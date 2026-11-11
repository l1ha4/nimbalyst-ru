# Nimbalyst RU — Russian translation for Windows

[Русская инструкция](README.md) · [Download installer](https://github.com/l1ha4/nimbalyst-ru/releases/latest) · [Report an issue](https://github.com/l1ha4/nimbalyst-ru/issues)

Unofficial, reinstallable Russian language mod / localization patch for **Nimbalyst**. Tested with **Nimbalyst 0.83.0** on Windows. This project is not affiliated with or endorsed by Nimbalyst.

## Quick start

1. Download `Nimbalyst-RU-Setup-1.2.0.exe` from Releases.
2. Close Nimbalyst, including its tray process.
3. Run the installer and click **Установить** (Install). Accept Windows elevation if requested for Program Files.
4. Start Nimbalyst normally.

The installer targets Windows 10/11 x64, uses the built-in .NET Framework, and includes official Node.js 24.22.2. No separate Node.js installation or internet connection is needed during installation. The installer is not code-signed; its source and SHA-256 checksums are published here.

Run the same installer after Nimbalyst updates. Unknown versions require an explicit trial checkbox and must still pass structural and translation-coverage checks. Compatibility with future versions is not guaranteed.

Version 1.2.0 also upgrades an older version of the mod in one click, building from verified originals before replacing installed files and retaining the original backups.

Use **Удалить перевод** to restore the original files, **Диагностика** for reports, or **Восстановить** to recover an interrupted operation. Backups are stored outside the application under `%LOCALAPPDATA%\Nimbalyst-RU`. User documents, chat history, API keys and security settings are not translated or uploaded.

## Scope and limitations

The mod parses packaged JavaScript with Acorn, translating selected UI string contexts and rebuilding ASAR with integrity metadata. It also uses Excalidraw's built-in Russian locale. Approximately 10,000 string occurrences are translated in the tested build. This is **not** a claim of complete UI coverage.

The dictionary is based on machine translation of static public UI strings with manual corrections. Dynamic/server text, Marketplace, external tools and third-party extensions may remain in English. Contributions correcting terminology and supporting newer releases are welcome.

The 1.2.0 update adds 187 manually translated skill, command and extension descriptions, including all 11 bundled skill descriptions. A display-only dictionary handles command menus, tooltips and extension cards; original SKILL.md files, manifests, command IDs and prompts remain unchanged. Unknown custom/third-party descriptions fall back to their original text. It also fixes command group headings, welcome-action labels and relative dates.

## Development

Run `node --test tests/mod.test.cjs`. To build the standalone installer on Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File installer/build.ps1
```

The build downloads a pinned official Node.js archive and verifies its SHA-256 and Authenticode signature. Output is placed in `dist/`. Pass `-NodeArchive <path>` to use an existing verified archive. Build inputs and dependencies are pinned; binary reproducibility is not claimed because ZIP and compiler timestamps can differ.

The small source ZIP uses `Install.cmd` and requires a separately installed Node.js 20+ (a maintained LTS release is recommended). To verify the bundled installer without modifying Nimbalyst, run `Nimbalyst-RU-Setup-1.2.0.exe --self-test <empty-output-directory>` and inspect its exit code and `self-test.log`.

MIT license. Acorn and Nimbalyst notices are in `vendor/`; the official Node.js license and third-party notices are embedded in the installer's `runtime/NODE-LICENSE` resource. Nimbalyst binaries and personal diagnostics are not distributed.
