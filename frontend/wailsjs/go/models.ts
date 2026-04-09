export namespace inventory {
	
	export class Host {
	    id: string;
	    name: string;
	    host: string;
	    user: string;
	    port: number;
	    bastion_id: string;
	    identity_file: string;
	    tags: string[];
	
	    static createFrom(source: any = {}) {
	        return new Host(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.user = source["user"];
	        this.port = source["port"];
	        this.bastion_id = source["bastion_id"];
	        this.identity_file = source["identity_file"];
	        this.tags = source["tags"];
	    }
	}
	export class HostDefaults {
	    user: string;
	    port: number;
	    identity_file: string;
	
	    static createFrom(source: any = {}) {
	        return new HostDefaults(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.user = source["user"];
	        this.port = source["port"];
	        this.identity_file = source["identity_file"];
	    }
	}
	export class HostGroup {
	    id: string;
	    name: string;
	    host_ids: string[];
	    tags: string[];
	
	    static createFrom(source: any = {}) {
	        return new HostGroup(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.host_ids = source["host_ids"];
	        this.tags = source["tags"];
	    }
	}
	export class Inventory {
	    version: number;
	    defaults: HostDefaults;
	    hosts: Host[];
	    groups: HostGroup[];
	
	    static createFrom(source: any = {}) {
	        return new Inventory(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.defaults = this.convertValues(source["defaults"], HostDefaults);
	        this.hosts = this.convertValues(source["hosts"], Host);
	        this.groups = this.convertValues(source["groups"], HostGroup);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace profile {
	
	export class Profile {
	    id: string;
	    name: string;
	    description: string;
	    color: string;
	    env_vars: Record<string, string>;
	    secret_keys: string[];
	    // Go type: time
	    created_at: any;
	
	    static createFrom(source: any = {}) {
	        return new Profile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.color = source["color"];
	        this.env_vars = source["env_vars"];
	        this.secret_keys = source["secret_keys"];
	        this.created_at = this.convertValues(source["created_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace session {
	
	export class SessionStatus {
	    id: string;
	    name: string;
	    profile_id: string;
	    backend_id?: string;
	    tmux_session_name: string;
	    command: string;
	    run_mode?: string;
	    host_id?: string;
	    // Go type: time
	    created_at: any;
	    profile_name: string;
	    profile_color: string;
	    attached: boolean;
	    alive: boolean;
	    windows: number;
	
	    static createFrom(source: any = {}) {
	        return new SessionStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.profile_id = source["profile_id"];
	        this.backend_id = source["backend_id"];
	        this.tmux_session_name = source["tmux_session_name"];
	        this.command = source["command"];
	        this.run_mode = source["run_mode"];
	        this.host_id = source["host_id"];
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.profile_name = source["profile_name"];
	        this.profile_color = source["profile_color"];
	        this.attached = source["attached"];
	        this.alive = source["alive"];
	        this.windows = source["windows"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace terminal {
	
	export class TerminalApp {
	    ID: string;
	    Name: string;
	    BundleID: string;
	    AppPath: string;
	    ExecPath: string;
	    IsInstalled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new TerminalApp(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.Name = source["Name"];
	        this.BundleID = source["BundleID"];
	        this.AppPath = source["AppPath"];
	        this.ExecPath = source["ExecPath"];
	        this.IsInstalled = source["IsInstalled"];
	    }
	}

}

