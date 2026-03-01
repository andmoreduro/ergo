{
  description = "Tauri v2 + React + pnpm development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };

        # System dependencies required by Tauri v2
        libraries = with pkgs;[
          atk
          cairo
          dbus
          gdk-pixbuf
          glib
          glib-networking     # Required for TLS / fetching https endpoints
          gtk3
          libGL
          librsvg
          libsoup_3           # Tauri v2 requires libsoup_3
          openssl
          pango
          webkitgtk_4_1       # Tauri v2 requires webkitgtk_4_1
          libX11
        ];

      in
      {
        devShells.default = pkgs.mkShell {
          name = "ergo";
          # Tools needed at build time
          nativeBuildInputs = with pkgs;[
            pkg-config
            gobject-introspection

            # Node ecosystem
            nodejs
            pnpm

            # Rust ecosystem
            cargo
            rustc
            rustfmt
            clippy
            rust-analyzer
            cargo-tauri

            fish
          ];

          # Libraries needed at runtime and link time
          buildInputs = libraries;

          shellHook = ''
            # Make sure Rust tools and bundlers can find the dynamic libraries
            export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath libraries}:$LD_LIBRARY_PATH

            # Ensure GTK can find its schemas to prevent crashes (e.g. file dialogs)
            export XDG_DATA_DIRS=${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:$XDG_DATA_DIRS

            # Required for fetch requests to https endpoints (TLS support)
            export GIO_MODULE_DIR=${pkgs.glib-networking}/lib/gio/modules/

            # Workarounds for NixOS WebKit blank screen / rendering issues
            export WEBKIT_DISABLE_COMPOSITING_MODE=1
            export WEBKIT_DISABLE_DMABUF_RENDERER=1

            if [[ $- == *i* ]]; then
                # 1. Clear Bash-specific prompt variables so they don't leak into Zed/subshells
                unset PS1
                unset PROMPT_COMMAND

                # 2. Tell Zed (and other tools) to use fish as the default shell inside this environment
                export SHELL=${pkgs.fish}/bin/fish

                # 3. Start fish
                exec fish
            fi
          '';
        };
      }
    );
}
