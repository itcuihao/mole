//go:build darwin && cgo

package statusbar

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa -framework AppKit -framework Foundation -framework UniformTypeIdentifiers

#import <Cocoa/Cocoa.h>
#import <objc/runtime.h>
#include <stdlib.h>

// Go //export prototypes
extern void statusBarBuildMenu(void);
extern void statusBarOpenDashboard(void);
extern void statusBarQuitApp(void);
extern void statusBarAttachSession(char *sessionID);

// ============================================================
// Target method implementations (plain C functions)
// ============================================================
static void sb_openDashboard(id self, SEL _cmd, id sender) {
	(void)self; (void)_cmd; (void)sender;
	[NSApp activateIgnoringOtherApps:YES];
	statusBarOpenDashboard();
}

static void sb_quitApp(id self, SEL _cmd, id sender) {
	(void)self; (void)_cmd; (void)sender;
	statusBarQuitApp();
}

static void sb_attachSession(id self, SEL _cmd, id sender) {
	(void)self; (void)_cmd;
	NSString *sid = [sender representedObject];
	if (sid.length > 0) statusBarAttachSession((char *)[sid UTF8String]);
}

static void sb_menuNeedsUpdate(id self, SEL _cmd, NSMenu *menu) {
	(void)self; (void)_cmd; (void)menu;
	statusBarBuildMenu();
}

static void registerStatusBarClasses(void);

// ============================================================
// Globals
// ============================================================
static NSStatusItem *globalStatusItem  = nil;
static NSMenu       *globalStatusMenu  = nil;
static id            globalTarget      = nil;
static id            globalDelegate    = nil;

// ============================================================
// Rebuild menu from JSON
// ============================================================
static void doRebuildMenu(const char *jsonData) {
	NSString *json = [NSString stringWithUTF8String:jsonData];
	dispatch_async(dispatch_get_main_queue(), ^{
		NSMenu *menu = globalStatusMenu;
		if (!menu) return;
		[menu removeAllItems];

		NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
		NSArray *sessions = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];

		if (sessions && [sessions isKindOfClass:[NSArray class]]) {
			for (NSDictionary *sess in sessions) {
				NSString *name = sess[@"name"] ?: @"Unnamed";
				NSString *den  = sess[@"den"]  ?: @"—";
				NSString *sid  = sess[@"id"]   ?: @"";

				NSString *label = [NSString stringWithFormat:@"%@   [Den: %@]", name, den];
				NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:label
				                                              action:@selector(sb_attachSession:)
				                                       keyEquivalent:@""];
				item.target  = globalTarget;
				item.enabled = YES;
				item.representedObject = sid;
				[menu addItem:item];
			}
			if (sessions.count > 0) [menu addItem:[NSMenuItem separatorItem]];
		}

		NSMenuItem *openItem = [[NSMenuItem alloc] initWithTitle:@"Open Dashboard"
		                                                  action:@selector(sb_openDashboard:)
		                                           keyEquivalent:@""];
		openItem.target  = globalTarget;
		openItem.enabled = YES;
		[menu addItem:openItem];

		NSMenuItem *quitItem = [[NSMenuItem alloc] initWithTitle:@"Quit Mole"
		                                                  action:@selector(sb_quitApp:)
		                                           keyEquivalent:@""];
		quitItem.target  = globalTarget;
		quitItem.enabled = YES;
		[menu addItem:quitItem];
	});
}

// ============================================================
// Create NSStatusItem
// ============================================================
static void doCreateStatusBar(void) {
	dispatch_async(dispatch_get_main_queue(), ^{
		fprintf(stderr, "[Mole] doCreateStatusBar on main thread\n");
		[NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];

		NSStatusBar *bar = [NSStatusBar systemStatusBar];
		globalStatusItem = [bar statusItemWithLength:NSSquareStatusItemLength];
		if (@available(macOS 11.0, *)) {
			globalStatusItem.autosaveName = @"com.mole.statusbar";
		}
		fprintf(stderr, "[Mole] NSStatusItem created: %p\n", (void *)globalStatusItem);

		// Draw "M" icon
		NSSize sz = NSMakeSize(22, 22);
		NSImage *icon = [[NSImage alloc] initWithSize:sz];
		[icon lockFocus];
		[@"M" drawAtPoint:NSMakePoint(4, 2)
		   withAttributes:@{
			NSFontAttributeName: [NSFont monospacedDigitSystemFontOfSize:14 weight:NSFontWeightBold],
			NSForegroundColorAttributeName: [NSColor labelColor]
		}];
		[icon unlockFocus];
		icon.template = YES;

		NSButton *button = globalStatusItem.button;
		if (button) {
			button.image = icon;
			button.imagePosition = NSImageOnly;
			button.toolTip = @"Mole";
		}

		registerStatusBarClasses();
		fprintf(stderr, "[Mole] NSStatusItem setup complete\n");
	});
}

// ============================================================
// Register Obj-C classes at runtime (avoids compile-time symbols that Go 1.24 cgo duplicates)
// ============================================================
static void registerStatusBarClasses(void) {
	// StatusBarTarget
	Class targetCls = objc_allocateClassPair([NSObject class], "StatusBarTarget", 0);
	class_addMethod(targetCls, sel_registerName("sb_openDashboard:"), (IMP)sb_openDashboard, "v@:@");
	class_addMethod(targetCls, sel_registerName("sb_quitApp:"),      (IMP)sb_quitApp,      "v@:@");
	class_addMethod(targetCls, sel_registerName("sb_attachSession:"),(IMP)sb_attachSession, "v@:@");
	objc_registerClassPair(targetCls);

	// StatusBarMenuDelegate
	Class delegateCls = objc_allocateClassPair([NSObject class], "StatusBarMenuDelegate", 0);
	Protocol *menuDelegate = objc_getProtocol("NSMenuDelegate");
	class_addProtocol(delegateCls, menuDelegate);
	class_addMethod(delegateCls, sel_registerName("menuNeedsUpdate:"), (IMP)sb_menuNeedsUpdate, "v@:@");
	objc_registerClassPair(delegateCls);

	globalTarget   = [[targetCls alloc] init];
	globalDelegate = [[delegateCls alloc] init];

	globalStatusMenu = [[NSMenu alloc] initWithTitle:@"Mole"];
	globalStatusMenu.autoenablesItems = NO;
	[globalStatusMenu setDelegate:globalDelegate];

	NSMenuItem *pl = [[NSMenuItem alloc] initWithTitle:@"Loading..." action:nil keyEquivalent:@""];
	pl.enabled = NO;
	[globalStatusMenu addItem:pl];

	globalStatusItem.menu = globalStatusMenu;

	fprintf(stderr, "[Mole] NSStatusItem setup complete\n");
}

// ============================================================
// Single entry point — Go calls this.
// __attribute__((weak)) avoids Go 1.24 cgo duplicate-symbol linker errors.
// ============================================================
__attribute__((weak))
void statusBarCmd(int cmd, const char *data) {
	switch (cmd) {
	case 1: doCreateStatusBar(); break;
	case 2: doRebuildMenu(data);  break;
	}
}
*/
import "C"
import (
	"encoding/json"
	"sort"
	"unsafe"
)

// ============================================================
// Callbacks
// ============================================================

var (
	onBuildMenu     func() []SessionItem
	onOpenDashboard func()
	onQuitApp       func()
	onAttachSession func(sessionID string)
)

type SessionItem struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Den  string `json:"den"`
}

func Init(buildMenu func() []SessionItem, openDashboard func(), quitApp func(), attachSession func(sessionID string)) {
	onBuildMenu = buildMenu
	onOpenDashboard = openDashboard
	onQuitApp = quitApp
	onAttachSession = attachSession
	C.statusBarCmd(1, nil)
}

func buildMenuJSON() {
	if onBuildMenu == nil {
		return
	}
	items := onBuildMenu()
	sort.Slice(items, func(i, j int) bool {
		return items[i].Name < items[j].Name
	})
	jsonBytes, _ := json.Marshal(items)
	cs := C.CString(string(jsonBytes))
	C.statusBarCmd(2, cs)
	C.free(unsafe.Pointer(cs))
}

func doOpenDashboard() {
	if onOpenDashboard != nil {
		onOpenDashboard()
	}
}

func doQuitApp() {
	if onQuitApp != nil {
		onQuitApp()
	}
}

func doAttachSession(sessionID string) {
	if onAttachSession != nil {
		onAttachSession(sessionID)
	}
}

//export statusBarBuildMenu
func statusBarBuildMenu() { buildMenuJSON() }

//export statusBarOpenDashboard
func statusBarOpenDashboard() { doOpenDashboard() }

//export statusBarQuitApp
func statusBarQuitApp() { doQuitApp() }

//export statusBarAttachSession
func statusBarAttachSession(cSessionID *C.char) { doAttachSession(C.GoString(cSessionID)) }
