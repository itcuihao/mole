export namespace codex {
	
	export class Config {
	    id: string;
	    name: string;
	    home_dir: string;
	    config_path: string;
	    auth_path: string;
	    auth_exists: boolean;
	    created_at: string;
	    updated_at: string;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.home_dir = source["home_dir"];
	        this.config_path = source["config_path"];
	        this.auth_path = source["auth_path"];
	        this.auth_exists = source["auth_exists"];
	        this.created_at = source["created_at"];
	        this.updated_at = source["updated_at"];
	    }
	}
	export class SaveRequest {
	    id: string;
	    name: string;
	    config_toml: string;
	    auth_json?: string;
	    replace_auth?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SaveRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.config_toml = source["config_toml"];
	        this.auth_json = source["auth_json"];
	        this.replace_auth = source["replace_auth"];
	    }
	}

}

export namespace docker {
	
	export class Config {
	    id: string;
	    name: string;
	    image: string;
	    created_at: string;
	    updated_at: string;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.image = source["image"];
	        this.created_at = source["created_at"];
	        this.updated_at = source["updated_at"];
	    }
	}
	export class SaveRequest {
	    id: string;
	    name: string;
	    image: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.image = source["image"];
	    }
	}

}

export namespace integration {
	
	export class IntegrationStatus {
	    id: string;
	    name: string;
	    supported: boolean;
	    installed: boolean;
	    plugin_ready: boolean;
	    brew_available: boolean;
	    plugin_dir: string;
	    template: string;
	    interval: number;
	    available_templates: string[];
	    available_intervals: number[];
	
	    static createFrom(source: any = {}) {
	        return new IntegrationStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.supported = source["supported"];
	        this.installed = source["installed"];
	        this.plugin_ready = source["plugin_ready"];
	        this.brew_available = source["brew_available"];
	        this.plugin_dir = source["plugin_dir"];
	        this.template = source["template"];
	        this.interval = source["interval"];
	        this.available_templates = source["available_templates"];
	        this.available_intervals = source["available_intervals"];
	    }
	}

}

export namespace inventory {
	
	export class Host {
	    id: string;
	    name: string;
	    source_alias?: string;
	    host: string;
	    user: string;
	    port: number;
	    bastion_id: string;
	    jump_host_ids?: string[];
	    identity_file: string;
	    tags: string[];
	    port_forwards?: string[];
	    enable_health_check?: boolean;
	    enable_alerts?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Host(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.source_alias = source["source_alias"];
	        this.host = source["host"];
	        this.user = source["user"];
	        this.port = source["port"];
	        this.bastion_id = source["bastion_id"];
	        this.jump_host_ids = source["jump_host_ids"];
	        this.identity_file = source["identity_file"];
	        this.tags = source["tags"];
	        this.port_forwards = source["port_forwards"];
	        this.enable_health_check = source["enable_health_check"];
	        this.enable_alerts = source["enable_alerts"];
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
	    bastion_id?: string;
	    host_ids: string[];
	    tags: string[];
	
	    static createFrom(source: any = {}) {
	        return new HostGroup(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.bastion_id = source["bastion_id"];
	        this.host_ids = source["host_ids"];
	        this.tags = source["tags"];
	    }
	}
	export class HostHealth {
	    host_id: string;
	    online: boolean;
	    latency_ms: number;
	    cpu_load: number;
	    memory_usage: number;
	    // Go type: time
	    last_checked: any;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new HostHealth(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.host_id = source["host_id"];
	        this.online = source["online"];
	        this.latency_ms = source["latency_ms"];
	        this.cpu_load = source["cpu_load"];
	        this.memory_usage = source["memory_usage"];
	        this.last_checked = this.convertValues(source["last_checked"], null);
	        this.error = source["error"];
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
	export class SSHConfigImportCandidate {
	    alias: string;
	    name: string;
	    host: string;
	    user?: string;
	    port?: number;
	    identity_file?: string;
	    jump_aliases?: string[];
	    importable: boolean;
	    blocked_reason?: string;
	    conflict_kind?: string;
	    conflict_host_id?: string;
	    conflict_host_name?: string;
	    warnings?: string[];
	
	    static createFrom(source: any = {}) {
	        return new SSHConfigImportCandidate(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.alias = source["alias"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.user = source["user"];
	        this.port = source["port"];
	        this.identity_file = source["identity_file"];
	        this.jump_aliases = source["jump_aliases"];
	        this.importable = source["importable"];
	        this.blocked_reason = source["blocked_reason"];
	        this.conflict_kind = source["conflict_kind"];
	        this.conflict_host_id = source["conflict_host_id"];
	        this.conflict_host_name = source["conflict_host_name"];
	        this.warnings = source["warnings"];
	    }
	}
	export class SSHConfigImportPreview {
	    path: string;
	    candidates: SSHConfigImportCandidate[];
	
	    static createFrom(source: any = {}) {
	        return new SSHConfigImportPreview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.candidates = this.convertValues(source["candidates"], SSHConfigImportCandidate);
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
	export class SSHConfigImportRequest {
	    path: string;
	    aliases: string[];
	    conflict_strategy: string;
	
	    static createFrom(source: any = {}) {
	        return new SSHConfigImportRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.aliases = source["aliases"];
	        this.conflict_strategy = source["conflict_strategy"];
	    }
	}

}

export namespace main {
	
	export class ProfileDeleteResult {
	    deleted: boolean;
	    code?: string;
	    message?: string;
	    references?: session.ProfileReference[];
	
	    static createFrom(source: any = {}) {
	        return new ProfileDeleteResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.deleted = source["deleted"];
	        this.code = source["code"];
	        this.message = source["message"];
	        this.references = this.convertValues(source["references"], session.ProfileReference);
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

export namespace pluginconfig {
	
	export class Config {
	    id: string;
	    name: string;
	    plugin_id: string;
	    settings?: Record<string, string>;
	    created_at: string;
	    updated_at: string;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.plugin_id = source["plugin_id"];
	        this.settings = source["settings"];
	        this.created_at = source["created_at"];
	        this.updated_at = source["updated_at"];
	    }
	}
	export class SaveRequest {
	    id: string;
	    name: string;
	    plugin_id: string;
	    settings?: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new SaveRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.plugin_id = source["plugin_id"];
	        this.settings = source["settings"];
	    }
	}

}

export namespace profile {
	
	export class Profile {
	    id: string;
	    name: string;
	    description: string;
	    color: string;
	    default_command?: string;
	    env_vars: Record<string, string>;
	    secret_keys: string[];
	    created_at: string;
	    updated_at?: string;
	
	    static createFrom(source: any = {}) {
	        return new Profile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.color = source["color"];
	        this.default_command = source["default_command"];
	        this.env_vars = source["env_vars"];
	        this.secret_keys = source["secret_keys"];
	        this.created_at = source["created_at"];
	        this.updated_at = source["updated_at"];
	    }
	}

}

export namespace provider {
	
	export class PresetEntry {
	    key: string;
	    value: string;
	    isSecret: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PresetEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.value = source["value"];
	        this.isSecret = source["isSecret"];
	    }
	}
	export class Preset {
	    id: string;
	    name: string;
	    descriptionEn: string;
	    descriptionZh: string;
	    link?: string;
	    entries: PresetEntry[];
	
	    static createFrom(source: any = {}) {
	        return new Preset(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.descriptionEn = source["descriptionEn"];
	        this.descriptionZh = source["descriptionZh"];
	        this.link = source["link"];
	        this.entries = this.convertValues(source["entries"], PresetEntry);
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

export namespace scriptcfg {
	
	export class CommandTestResult {
	    ok: boolean;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new CommandTestResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.message = source["message"];
	    }
	}
	export class Config {
	    id: string;
	    name: string;
	    description?: string;
	    platform?: string;
	    command: string;
	    builtin?: boolean;
	    created_at: string;
	    updated_at: string;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.platform = source["platform"];
	        this.command = source["command"];
	        this.builtin = source["builtin"];
	        this.created_at = source["created_at"];
	        this.updated_at = source["updated_at"];
	    }
	}
	export class SaveRequest {
	    id: string;
	    name: string;
	    description?: string;
	    platform?: string;
	    command: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.platform = source["platform"];
	        this.command = source["command"];
	    }
	}

}

export namespace session {
	
	export class OpenDenFailure {
	    session_id: string;
	    name: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new OpenDenFailure(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.session_id = source["session_id"];
	        this.name = source["name"];
	        this.error = source["error"];
	    }
	}
	export class OpenDenResult {
	    opened: string[];
	    skipped: string[];
	    failed: OpenDenFailure[];
	
	    static createFrom(source: any = {}) {
	        return new OpenDenResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.opened = source["opened"];
	        this.skipped = source["skipped"];
	        this.failed = this.convertValues(source["failed"], OpenDenFailure);
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
	export class PluginInfo {
	    id: string;
	    label_key: string;
	    hint_key: string;
	    requires_host: boolean;
	    requires_codex: boolean;
	    requires_command: boolean;
	    requires_plugin_config: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PluginInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label_key = source["label_key"];
	        this.hint_key = source["hint_key"];
	        this.requires_host = source["requires_host"];
	        this.requires_codex = source["requires_codex"];
	        this.requires_command = source["requires_command"];
	        this.requires_plugin_config = source["requires_plugin_config"];
	    }
	}
	export class ProfileReference {
	    session_id: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new ProfileReference(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.session_id = source["session_id"];
	        this.name = source["name"];
	    }
	}
	export class SessionLaunchRequest {
	    profile_id: string;
	    name: string;
	    backend_id?: string;
	    cwd?: string;
	    command?: string;
	    run_mode?: string;
	    host_id?: string;
	    script_id?: string;
	    codex_config_id?: string;
	    plugin_config_id?: string;
	    plugin_data?: Record<string, string>;
	    den?: string;
	
	    static createFrom(source: any = {}) {
	        return new SessionLaunchRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.profile_id = source["profile_id"];
	        this.name = source["name"];
	        this.backend_id = source["backend_id"];
	        this.cwd = source["cwd"];
	        this.command = source["command"];
	        this.run_mode = source["run_mode"];
	        this.host_id = source["host_id"];
	        this.script_id = source["script_id"];
	        this.codex_config_id = source["codex_config_id"];
	        this.plugin_config_id = source["plugin_config_id"];
	        this.plugin_data = source["plugin_data"];
	        this.den = source["den"];
	    }
	}
	export class SessionStatus {
	    id: string;
	    name: string;
	    profile_id: string;
	    profile_updated_at?: string;
	    backend_id?: string;
	    tmux_session_name: string;
	    cwd?: string;
	    command: string;
	    run_mode?: string;
	    host_id?: string;
	    script_id?: string;
	    codex_config_id?: string;
	    plugin_config_id?: string;
	    plugin_data?: Record<string, string>;
	    den?: string;
	    created_at: string;
	    open_count?: number;
	    last_opened_at?: string;
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
	        this.profile_updated_at = source["profile_updated_at"];
	        this.backend_id = source["backend_id"];
	        this.tmux_session_name = source["tmux_session_name"];
	        this.cwd = source["cwd"];
	        this.command = source["command"];
	        this.run_mode = source["run_mode"];
	        this.host_id = source["host_id"];
	        this.script_id = source["script_id"];
	        this.codex_config_id = source["codex_config_id"];
	        this.plugin_config_id = source["plugin_config_id"];
	        this.plugin_data = source["plugin_data"];
	        this.den = source["den"];
	        this.created_at = source["created_at"];
	        this.open_count = source["open_count"];
	        this.last_opened_at = source["last_opened_at"];
	        this.profile_name = source["profile_name"];
	        this.profile_color = source["profile_color"];
	        this.attached = source["attached"];
	        this.alive = source["alive"];
	        this.windows = source["windows"];
	    }
	}
	export class SessionUpdateRequest {
	    session_id: string;
	    profile_id: string;
	    backend_id?: string;
	    cwd?: string;
	    command?: string;
	    run_mode?: string;
	    host_id?: string;
	    script_id?: string;
	    codex_config_id?: string;
	    plugin_config_id?: string;
	    plugin_data?: Record<string, string>;
	    den?: string;
	
	    static createFrom(source: any = {}) {
	        return new SessionUpdateRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.session_id = source["session_id"];
	        this.profile_id = source["profile_id"];
	        this.backend_id = source["backend_id"];
	        this.cwd = source["cwd"];
	        this.command = source["command"];
	        this.run_mode = source["run_mode"];
	        this.host_id = source["host_id"];
	        this.script_id = source["script_id"];
	        this.codex_config_id = source["codex_config_id"];
	        this.plugin_config_id = source["plugin_config_id"];
	        this.plugin_data = source["plugin_data"];
	        this.den = source["den"];
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

export namespace workspace {
	
	export class ImportResult {
	    success: boolean;
	    message?: string;
	    failed_stage?: string;
	    rollback_triggered?: boolean;
	    rollback_success?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ImportResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.message = source["message"];
	        this.failed_stage = source["failed_stage"];
	        this.rollback_triggered = source["rollback_triggered"];
	        this.rollback_success = source["rollback_success"];
	    }
	}

}

