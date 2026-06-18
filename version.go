package main

// Version is the application version, injected at build time via -ldflags
// (e.g. -X main.Version=0.1.16). Defaults to "dev" for unwrapped local
// builds such as `wails dev` or a plain `go run`.
var Version = "dev"
