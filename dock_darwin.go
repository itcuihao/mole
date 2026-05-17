//go:build darwin && cgo

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework AppKit

#import <AppKit/AppKit.h>

static void hideDockIcon(void) {
	[NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
}

static void showDockIcon(void) {
	[NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
}
*/
import "C"

func hideDockIcon() {
	C.hideDockIcon()
}

func showDockIcon() {
	C.showDockIcon()
}
