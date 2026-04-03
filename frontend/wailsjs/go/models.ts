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
	    tmux_session_name: string;
	    command: string;
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
	        this.tmux_session_name = source["tmux_session_name"];
	        this.command = source["command"];
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

