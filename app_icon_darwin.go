//go:build darwin && cgo

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework AppKit -framework Foundation -framework UniformTypeIdentifiers

#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>

static void setApplicationIcon(const void *bytes, int length) {
	@autoreleasepool {
		if (bytes == NULL || length <= 0) {
			return;
		}

		NSData *data = [NSData dataWithBytes:bytes length:(NSUInteger)length];
		if (data == nil) {
			return;
		}

		NSImage *image = [[NSImage alloc] initWithData:data];
		if (image == nil) {
			return;
		}

		[NSApp setApplicationIconImage:image];
	}
}
*/
import "C"

import "unsafe"

func init() {
	runtimeAppIconSetter = setApplicationIconDarwin
}

func setApplicationIconDarwin(icon []byte) {
	if len(icon) == 0 {
		return
	}

	C.setApplicationIcon(unsafe.Pointer(&icon[0]), C.int(len(icon)))
}
