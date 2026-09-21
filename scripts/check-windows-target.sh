#!/bin/bash
# Type-checks the desktop app for Windows from Linux (`cargo check`, no link).
# Build scripts that would compile C or embed Windows resources get stubs, so
# no MinGW toolchain is required; the Rust code, including `#[cfg(windows)]`
# paths and the Windows-only Tauri/WebView2 dependencies, is fully checked.
set -euo pipefail
cd "$(dirname "$0")/../src-tauri"
rustup target add x86_64-pc-windows-gnu >/dev/null
stubs="$(mktemp -d)"
trap 'rm -rf "$stubs"' EXIT
cat > "$stubs/x86_64-w64-mingw32-windres" <<'STUB'
#!/bin/bash
out=""; prev=""
for a in "$@"; do case "$prev" in --output|-o) out="$a";; esac; case "$a" in --output=*) out="${a#--output=}";; esac; prev="$a"; done
[ -n "$out" ] && : > "$out"
exit 0
STUB
cat > "$stubs/x86_64-w64-mingw32-ar" <<'STUB'
#!/bin/bash
for a in "$@"; do case "$a" in *.a|*.lib) : > "$a";; esac; done
exit 0
STUB
chmod +x "$stubs"/*
PATH="$stubs:$PATH" \
CC_x86_64_pc_windows_gnu=true AR_x86_64_pc_windows_gnu=true \
CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-target/xcheck}" \
cargo check -p ergo --target x86_64-pc-windows-gnu "$@"
