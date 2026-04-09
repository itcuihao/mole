package main

import _ "embed"

//go:embed assets/appicon.png
var appIconData []byte

var runtimeAppIconSetter = func([]byte) {}

func setApplicationIcon(icon []byte) {
	runtimeAppIconSetter(icon)
}
