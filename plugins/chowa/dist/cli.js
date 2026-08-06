#!/usr/bin/env node
import { createRequire } from "node:module";
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name] = () => newValue
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/router/router.ts
var exports_router = {};
__export(exports_router, {
  resolveModelTier: () => resolveModelTier,
  resolve: () => resolve
});
function resolve(profile, policy, overrides) {
  if (overrides) {
    const exactOverride = overrides.get(profile.kind);
    if (exactOverride) {
      return {
        target: exactOverride,
        matchedRule: null,
        reason: `Override applied for task kind "${profile.kind}" → ${exactOverride.provider}/${exactOverride.model}`
      };
    }
    const globalOverride = overrides.get("*");
    if (globalOverride) {
      return {
        target: globalOverride,
        matchedRule: null,
        reason: `Global override applied → ${globalOverride.provider}/${globalOverride.model}`
      };
    }
  }
  const sortedRules = [...policy.rules].sort((a, b) => b.priority - a.priority);
  for (const rule of sortedRules) {
    if (matchesRule(profile, rule)) {
      return {
        target: rule.target,
        matchedRule: rule,
        reason: buildMatchReason(profile, rule)
      };
    }
  }
  return {
    target: policy.defaultTarget,
    matchedRule: null,
    reason: `No matching rule for ${profile.kind}/${profile.estimatedComplexity} — using default target ${policy.defaultTarget.provider}/${policy.defaultTarget.model}`
  };
}
function resolveModelTier(target, availableModels) {
  const modelStr = target.model;
  const isTier = modelStr === "fast" || modelStr === "balanced" || modelStr === "reasoning" || modelStr === "opus";
  if (!isTier || !availableModels || availableModels.length === 0) {
    return target;
  }
  const match = availableModels.find((m) => m.provider === target.provider && m.tier === modelStr) ?? availableModels.find((m) => m.tier === modelStr);
  if (match) {
    return {
      provider: match.provider,
      model: match.id,
      fallbacks: target.fallbacks
    };
  }
  return target;
}
function matchesRule(profile, rule) {
  if (rule.match.kind !== undefined && rule.match.kind !== profile.kind) {
    return false;
  }
  if (rule.match.estimatedComplexity !== undefined && rule.match.estimatedComplexity !== profile.estimatedComplexity) {
    return false;
  }
  return true;
}
function buildMatchReason(profile, rule) {
  const matchParts = [];
  if (rule.match.kind !== undefined) {
    matchParts.push(`kind=${rule.match.kind}`);
  }
  if (rule.match.estimatedComplexity !== undefined) {
    matchParts.push(`complexity=${rule.match.estimatedComplexity}`);
  }
  const matchDesc = matchParts.length > 0 ? matchParts.join(", ") : "wildcard (matches all)";
  const fallbacksDesc = rule.target.fallbacks && rule.target.fallbacks.length > 0 ? ` (fallbacks: ${rule.target.fallbacks.map((f) => `${f.provider}/${f.model}`).join(", ")})` : "";
  return `Rule [priority=${rule.priority}, ${matchDesc}] matched ${profile.kind}/${profile.estimatedComplexity} → ${rule.target.provider}/${rule.target.model}${fallbacksDesc}`;
}

// src/router/loadPolicy.ts
var exports_loadPolicy = {};
__export(exports_loadPolicy, {
  loadPolicy: () => loadPolicy,
  findConfigPath: () => findConfigPath,
  describeImportFailure: () => describeImportFailure,
  DEFAULT_POLICY: () => DEFAULT_POLICY,
  CONFIG_CANDIDATES: () => CONFIG_CANDIDATES
});
import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
function findConfigPath(cwd = process.cwd()) {
  for (const candidate of CONFIG_CANDIDATES) {
    const path = resolvePath(cwd, candidate);
    if (existsSync(path)) {
      return path;
    }
  }
  return;
}
async function loadPolicy(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const explicitPath = options.configPath;
  let resolvedPath;
  if (explicitPath) {
    resolvedPath = resolvePath(cwd, explicitPath);
    if (!existsSync(resolvedPath)) {
      throw new Error(`Config file not found at "${resolvedPath}" (from --config)`);
    }
  } else {
    const found = findConfigPath(cwd);
    if (!found) {
      return DEFAULT_POLICY;
    }
    resolvedPath = found;
  }
  let mod;
  try {
    mod = await import(pathToFileURL(resolvedPath).href);
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(describeImportFailure(cause, resolvedPath));
  }
  const config = mod.default;
  assertChowaConfig(config, resolvedPath);
  return config.routing;
}
function describeImportFailure(cause, path) {
  if (/Unknown file extension "\.ts"/.test(cause)) {
    return `Failed to load config file at "${path}": this runtime cannot import ` + `TypeScript directly. Either run Chōwa on Node >= 22.18 (or Bun), or ` + `rename the config to chowa.config.js.`;
  }
  return `Failed to load config file at "${path}": ${cause}`;
}
function assertChowaConfig(config, path) {
  if (!config || typeof config !== "object" || !("routing" in config)) {
    throw new Error(`Invalid Chōwa config at "${path}": expected a default export with a "routing" key.`);
  }
  const routing = config.routing;
  if (!routing || !Array.isArray(routing.rules) || !routing.defaultTarget) {
    throw new Error(`Invalid Chōwa config at "${path}": "routing" must have a "rules" array and a "defaultTarget".`);
  }
}
var DEFAULT_POLICY, CONFIG_CANDIDATES;
var init_loadPolicy = __esm(() => {
  DEFAULT_POLICY = {
    rules: [
      {
        match: { kind: "mechanical" },
        target: { provider: "gemini", model: "gemini-3.6-flash" },
        priority: 10
      },
      {
        match: { kind: "security" },
        target: { provider: "anthropic", model: "claude-opus-4.6" },
        priority: 100
      },
      {
        match: { kind: "architecture", estimatedComplexity: "high" },
        target: { provider: "anthropic", model: "claude-opus-4.6" },
        priority: 50
      }
    ],
    defaultTarget: { provider: "anthropic", model: "claude-sonnet-4.6" }
  };
  CONFIG_CANDIDATES = [
    "chowa.config.ts",
    "chowa.config.js",
    "chowa.config.mjs"
  ];
});

// src/integrations/install.ts
var exports_install = {};
__export(exports_install, {
  resolvePortableSkillPath: () => resolvePortableSkillPath,
  planInstall: () => planInstall,
  globalRulesContent: () => globalRulesContent,
  UnknownAgentError: () => UnknownAgentError,
  SkillSourceNotFoundError: () => SkillSourceNotFoundError,
  SUPPORTED_AGENTS: () => SUPPORTED_AGENTS,
  PORTABLE_SKILL_RELATIVE: () => PORTABLE_SKILL_RELATIVE,
  AGENT_TARGETS: () => AGENT_TARGETS
});
import { existsSync as existsSync2 } from "node:fs";
import { dirname, join, parse } from "node:path";
function resolvePortableSkillPath(startDirs, exists = existsSync2) {
  for (const start of startDirs) {
    let current = start;
    for (;; ) {
      const candidate = join(current, PORTABLE_SKILL_RELATIVE);
      if (exists(candidate))
        return candidate;
      const parent = dirname(current);
      if (parent === current || parent === parse(current).root)
        break;
      current = parent;
    }
  }
  return;
}
function globalRulesContent() {
  return `# Global Chōwa Workspace Rules

- These conventions apply **only** in projects set up for Chōwa: Chōwa's own
  source, a project with a \`chowa.config.ts\`, \`chowa.config.js\`, or
  \`chowa.config.mjs\` at its root, \`chowa\` listed as a project dependency,
  an existing \`specs/INDEX.md\` following Chōwa's spec convention, or (for
  every project you personally work in) \`chowa always-on on\`. In any
  other project, follow that
  project's own conventions instead — do not apply the rules below.
- In a Chōwa project, use the \`chowa\` skill for branching, commit, PR,
  routing, and quality conventions.
- Never push directly to \`main\` or \`master\`. Work on dedicated branches
  and ask before creating PRs.
`;
}
function planInstall(agent, homeDir, startDirs, exists = existsSync2) {
  const target = AGENT_TARGETS[agent];
  if (!target)
    throw new UnknownAgentError(agent);
  const skillSource = resolvePortableSkillPath(startDirs, exists);
  if (!skillSource)
    throw new SkillSourceNotFoundError(startDirs);
  const configDir = join(homeDir, ...target.configDir);
  return {
    skillSource,
    skillDestination: join(configDir, "skills", "chowa", "SKILL.md"),
    rulesDestination: join(configDir, "AGENTS.md")
  };
}
var AGENT_TARGETS, SUPPORTED_AGENTS, UnknownAgentError, SkillSourceNotFoundError, PORTABLE_SKILL_RELATIVE;
var init_install = __esm(() => {
  AGENT_TARGETS = {
    gemini: { configDir: [".gemini", "config"], label: "Gemini" }
  };
  SUPPORTED_AGENTS = Object.keys(AGENT_TARGETS);
  UnknownAgentError = class UnknownAgentError extends Error {
    constructor(agent) {
      super(`Unknown agent "${agent}". Supported: ${SUPPORTED_AGENTS.join(", ")}. ` + `Claude Code doesn't use this command — install the plugin instead: ` + `/plugin marketplace add franprince/chowa`);
      this.name = "UnknownAgentError";
    }
  };
  SkillSourceNotFoundError = class SkillSourceNotFoundError extends Error {
    constructor(searched) {
      super(`Could not find the portable skill (.agents/skills/chowa/SKILL.md). ` + `Searched upward from: ${searched.join(", ")}. ` + `This command needs a checkout of Chōwa's repository — the Claude Code ` + `plugin ships only the Claude Code skill.`);
      this.name = "SkillSourceNotFoundError";
    }
  };
  PORTABLE_SKILL_RELATIVE = join(".agents", "skills", "chowa", "SKILL.md");
});

// src/integrations/initConfig.ts
var exports_initConfig = {};
__export(exports_initConfig, {
  planInit: () => planInit,
  defaultConfigFileContents: () => defaultConfigFileContents,
  ConfigAlreadyExistsError: () => ConfigAlreadyExistsError
});
import { join as join2 } from "node:path";
function planInit(cwd = process.cwd()) {
  const existing = findConfigPath(cwd);
  if (existing) {
    throw new ConfigAlreadyExistsError(existing);
  }
  return { targetPath: join2(cwd, "chowa.config.js") };
}
function defaultConfigFileContents() {
  const routing = JSON.stringify(DEFAULT_POLICY, null, 2);
  return `/**
 * Chōwa routing policy — generated by \`chowa init\` from the built-in
 * default. Edit the rules below, or replace them entirely; see README.md
 * for the config shape (routing.rules[] + routing.defaultTarget).
 */

const config = {
  routing: ${routing},
};

export default config;
`;
}
var ConfigAlreadyExistsError;
var init_initConfig = __esm(() => {
  init_loadPolicy();
  ConfigAlreadyExistsError = class ConfigAlreadyExistsError extends Error {
    existingPath;
    constructor(existingPath) {
      super(`A Chōwa config already exists at "${existingPath}" — "chowa init" ` + `won't overwrite it. Edit it directly, or delete it first to start over.`);
      this.existingPath = existingPath;
      this.name = "ConfigAlreadyExistsError";
    }
  };
});

// src/integrations/preferences.ts
var exports_preferences = {};
__export(exports_preferences, {
  serializePreferences: () => serializePreferences,
  readPreferences: () => readPreferences,
  parsePreferences: () => parsePreferences,
  defaultPreferencesPath: () => defaultPreferencesPath,
  PREFERENCES_RELATIVE: () => PREFERENCES_RELATIVE,
  InvalidPreferencesError: () => InvalidPreferencesError
});
import { existsSync as existsSync3, readFileSync } from "node:fs";
import { join as join3 } from "node:path";
function defaultPreferencesPath(homeDir) {
  return join3(homeDir, PREFERENCES_RELATIVE);
}
function parsePreferences(raw, path) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidPreferencesError(path, "is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || typeof parsed.alwaysOn !== "boolean") {
    throw new InvalidPreferencesError(path, 'must be a JSON object with a boolean "alwaysOn" field.');
  }
  return { alwaysOn: parsed.alwaysOn };
}
function readPreferences(path, exists = existsSync3, readFile = (p, encoding) => readFileSync(p, encoding)) {
  if (!exists(path)) {
    return DEFAULT_PREFERENCES;
  }
  return parsePreferences(readFile(path, "utf-8"), path);
}
function serializePreferences(prefs) {
  return `${JSON.stringify(prefs, null, 2)}
`;
}
var DEFAULT_PREFERENCES, PREFERENCES_RELATIVE, InvalidPreferencesError;
var init_preferences = __esm(() => {
  DEFAULT_PREFERENCES = { alwaysOn: false };
  PREFERENCES_RELATIVE = join3(".chowa", "preferences.json");
  InvalidPreferencesError = class InvalidPreferencesError extends Error {
    constructor(path, reason) {
      super(`Chōwa preferences file at "${path}" ${reason}`);
      this.name = "InvalidPreferencesError";
    }
  };
});

// node_modules/ms/index.js
var require_ms = __commonJS((exports, module) => {
  var s = 1000;
  var m = s * 60;
  var h = m * 60;
  var d = h * 24;
  var w = d * 7;
  var y = d * 365.25;
  module.exports = function(val, options) {
    options = options || {};
    var type = typeof val;
    if (type === "string" && val.length > 0) {
      return parse2(val);
    } else if (type === "number" && isFinite(val)) {
      return options.long ? fmtLong(val) : fmtShort(val);
    }
    throw new Error("val is not a non-empty string or a valid number. val=" + JSON.stringify(val));
  };
  function parse2(str) {
    str = String(str);
    if (str.length > 100) {
      return;
    }
    var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(str);
    if (!match) {
      return;
    }
    var n = parseFloat(match[1]);
    var type = (match[2] || "ms").toLowerCase();
    switch (type) {
      case "years":
      case "year":
      case "yrs":
      case "yr":
      case "y":
        return n * y;
      case "weeks":
      case "week":
      case "w":
        return n * w;
      case "days":
      case "day":
      case "d":
        return n * d;
      case "hours":
      case "hour":
      case "hrs":
      case "hr":
      case "h":
        return n * h;
      case "minutes":
      case "minute":
      case "mins":
      case "min":
      case "m":
        return n * m;
      case "seconds":
      case "second":
      case "secs":
      case "sec":
      case "s":
        return n * s;
      case "milliseconds":
      case "millisecond":
      case "msecs":
      case "msec":
      case "ms":
        return n;
      default:
        return;
    }
  }
  function fmtShort(ms) {
    var msAbs = Math.abs(ms);
    if (msAbs >= d) {
      return Math.round(ms / d) + "d";
    }
    if (msAbs >= h) {
      return Math.round(ms / h) + "h";
    }
    if (msAbs >= m) {
      return Math.round(ms / m) + "m";
    }
    if (msAbs >= s) {
      return Math.round(ms / s) + "s";
    }
    return ms + "ms";
  }
  function fmtLong(ms) {
    var msAbs = Math.abs(ms);
    if (msAbs >= d) {
      return plural(ms, msAbs, d, "day");
    }
    if (msAbs >= h) {
      return plural(ms, msAbs, h, "hour");
    }
    if (msAbs >= m) {
      return plural(ms, msAbs, m, "minute");
    }
    if (msAbs >= s) {
      return plural(ms, msAbs, s, "second");
    }
    return ms + " ms";
  }
  function plural(ms, msAbs, n, name) {
    var isPlural = msAbs >= n * 1.5;
    return Math.round(ms / n) + " " + name + (isPlural ? "s" : "");
  }
});

// node_modules/debug/src/common.js
var require_common = __commonJS((exports, module) => {
  function setup(env) {
    createDebug.debug = createDebug;
    createDebug.default = createDebug;
    createDebug.coerce = coerce;
    createDebug.disable = disable;
    createDebug.enable = enable;
    createDebug.enabled = enabled;
    createDebug.humanize = require_ms();
    createDebug.destroy = destroy;
    Object.keys(env).forEach((key) => {
      createDebug[key] = env[key];
    });
    createDebug.names = [];
    createDebug.skips = [];
    createDebug.formatters = {};
    function selectColor(namespace) {
      let hash = 0;
      for (let i = 0;i < namespace.length; i++) {
        hash = (hash << 5) - hash + namespace.charCodeAt(i);
        hash |= 0;
      }
      return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
    }
    createDebug.selectColor = selectColor;
    function createDebug(namespace) {
      let prevTime;
      let enableOverride = null;
      let namespacesCache;
      let enabledCache;
      function debug(...args) {
        if (!debug.enabled) {
          return;
        }
        const self = debug;
        const curr = Number(new Date);
        const ms = curr - (prevTime || curr);
        self.diff = ms;
        self.prev = prevTime;
        self.curr = curr;
        prevTime = curr;
        args[0] = createDebug.coerce(args[0]);
        if (typeof args[0] !== "string") {
          args.unshift("%O");
        }
        let index = 0;
        args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
          if (match === "%%") {
            return "%";
          }
          index++;
          const formatter = createDebug.formatters[format];
          if (typeof formatter === "function") {
            const val = args[index];
            match = formatter.call(self, val);
            args.splice(index, 1);
            index--;
          }
          return match;
        });
        createDebug.formatArgs.call(self, args);
        const logFn = self.log || createDebug.log;
        logFn.apply(self, args);
      }
      debug.namespace = namespace;
      debug.useColors = createDebug.useColors();
      debug.color = createDebug.selectColor(namespace);
      debug.extend = extend;
      debug.destroy = createDebug.destroy;
      Object.defineProperty(debug, "enabled", {
        enumerable: true,
        configurable: false,
        get: () => {
          if (enableOverride !== null) {
            return enableOverride;
          }
          if (namespacesCache !== createDebug.namespaces) {
            namespacesCache = createDebug.namespaces;
            enabledCache = createDebug.enabled(namespace);
          }
          return enabledCache;
        },
        set: (v) => {
          enableOverride = v;
        }
      });
      if (typeof createDebug.init === "function") {
        createDebug.init(debug);
      }
      return debug;
    }
    function extend(namespace, delimiter) {
      const newDebug = createDebug(this.namespace + (typeof delimiter === "undefined" ? ":" : delimiter) + namespace);
      newDebug.log = this.log;
      return newDebug;
    }
    function enable(namespaces) {
      createDebug.save(namespaces);
      createDebug.namespaces = namespaces;
      createDebug.names = [];
      createDebug.skips = [];
      const split = (typeof namespaces === "string" ? namespaces : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
      for (const ns of split) {
        if (ns[0] === "-") {
          createDebug.skips.push(ns.slice(1));
        } else {
          createDebug.names.push(ns);
        }
      }
    }
    function matchesTemplate(search, template) {
      let searchIndex = 0;
      let templateIndex = 0;
      let starIndex = -1;
      let matchIndex = 0;
      while (searchIndex < search.length) {
        if (templateIndex < template.length && (template[templateIndex] === search[searchIndex] || template[templateIndex] === "*")) {
          if (template[templateIndex] === "*") {
            starIndex = templateIndex;
            matchIndex = searchIndex;
            templateIndex++;
          } else {
            searchIndex++;
            templateIndex++;
          }
        } else if (starIndex !== -1) {
          templateIndex = starIndex + 1;
          matchIndex++;
          searchIndex = matchIndex;
        } else {
          return false;
        }
      }
      while (templateIndex < template.length && template[templateIndex] === "*") {
        templateIndex++;
      }
      return templateIndex === template.length;
    }
    function disable() {
      const namespaces = [
        ...createDebug.names,
        ...createDebug.skips.map((namespace) => "-" + namespace)
      ].join(",");
      createDebug.enable("");
      return namespaces;
    }
    function enabled(name) {
      for (const skip of createDebug.skips) {
        if (matchesTemplate(name, skip)) {
          return false;
        }
      }
      for (const ns of createDebug.names) {
        if (matchesTemplate(name, ns)) {
          return true;
        }
      }
      return false;
    }
    function coerce(val) {
      if (val instanceof Error) {
        return val.stack || val.message;
      }
      return val;
    }
    function destroy() {
      console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
    }
    createDebug.enable(createDebug.load());
    return createDebug;
  }
  module.exports = setup;
});

// node_modules/debug/src/browser.js
var require_browser = __commonJS((exports, module) => {
  exports.formatArgs = formatArgs;
  exports.save = save;
  exports.load = load;
  exports.useColors = useColors;
  exports.storage = localstorage();
  exports.destroy = (() => {
    let warned = false;
    return () => {
      if (!warned) {
        warned = true;
        console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
      }
    };
  })();
  exports.colors = [
    "#0000CC",
    "#0000FF",
    "#0033CC",
    "#0033FF",
    "#0066CC",
    "#0066FF",
    "#0099CC",
    "#0099FF",
    "#00CC00",
    "#00CC33",
    "#00CC66",
    "#00CC99",
    "#00CCCC",
    "#00CCFF",
    "#3300CC",
    "#3300FF",
    "#3333CC",
    "#3333FF",
    "#3366CC",
    "#3366FF",
    "#3399CC",
    "#3399FF",
    "#33CC00",
    "#33CC33",
    "#33CC66",
    "#33CC99",
    "#33CCCC",
    "#33CCFF",
    "#6600CC",
    "#6600FF",
    "#6633CC",
    "#6633FF",
    "#66CC00",
    "#66CC33",
    "#9900CC",
    "#9900FF",
    "#9933CC",
    "#9933FF",
    "#99CC00",
    "#99CC33",
    "#CC0000",
    "#CC0033",
    "#CC0066",
    "#CC0099",
    "#CC00CC",
    "#CC00FF",
    "#CC3300",
    "#CC3333",
    "#CC3366",
    "#CC3399",
    "#CC33CC",
    "#CC33FF",
    "#CC6600",
    "#CC6633",
    "#CC9900",
    "#CC9933",
    "#CCCC00",
    "#CCCC33",
    "#FF0000",
    "#FF0033",
    "#FF0066",
    "#FF0099",
    "#FF00CC",
    "#FF00FF",
    "#FF3300",
    "#FF3333",
    "#FF3366",
    "#FF3399",
    "#FF33CC",
    "#FF33FF",
    "#FF6600",
    "#FF6633",
    "#FF9900",
    "#FF9933",
    "#FFCC00",
    "#FFCC33"
  ];
  function useColors() {
    if (typeof window !== "undefined" && window.process && (window.process.type === "renderer" || window.process.__nwjs)) {
      return true;
    }
    if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
      return false;
    }
    let m;
    return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || typeof navigator !== "undefined" && navigator.userAgent && (m = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m[1], 10) >= 31 || typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
  }
  function formatArgs(args) {
    args[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + args[0] + (this.useColors ? "%c " : " ") + "+" + module.exports.humanize(this.diff);
    if (!this.useColors) {
      return;
    }
    const c = "color: " + this.color;
    args.splice(1, 0, c, "color: inherit");
    let index = 0;
    let lastC = 0;
    args[0].replace(/%[a-zA-Z%]/g, (match) => {
      if (match === "%%") {
        return;
      }
      index++;
      if (match === "%c") {
        lastC = index;
      }
    });
    args.splice(lastC, 0, c);
  }
  exports.log = console.debug || console.log || (() => {});
  function save(namespaces) {
    try {
      if (namespaces) {
        exports.storage.setItem("debug", namespaces);
      } else {
        exports.storage.removeItem("debug");
      }
    } catch (error) {}
  }
  function load() {
    let r;
    try {
      r = exports.storage.getItem("debug") || exports.storage.getItem("DEBUG");
    } catch (error) {}
    if (!r && typeof process !== "undefined" && "env" in process) {
      r = process.env.DEBUG;
    }
    return r;
  }
  function localstorage() {
    try {
      return localStorage;
    } catch (error) {}
  }
  module.exports = require_common()(exports);
  var { formatters } = module.exports;
  formatters.j = function(v) {
    try {
      return JSON.stringify(v);
    } catch (error) {
      return "[UnexpectedJSONParseError]: " + error.message;
    }
  };
});

// node_modules/debug/src/node.js
var require_node = __commonJS((exports, module) => {
  var tty = __require("tty");
  var util = __require("util");
  exports.init = init;
  exports.log = log;
  exports.formatArgs = formatArgs;
  exports.save = save;
  exports.load = load;
  exports.useColors = useColors;
  exports.destroy = util.deprecate(() => {}, "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
  exports.colors = [6, 2, 3, 4, 5, 1];
  try {
    const supportsColor = (()=>{throw new Error("Cannot require module "+"supports-color");})();
    if (supportsColor && (supportsColor.stderr || supportsColor).level >= 2) {
      exports.colors = [
        20,
        21,
        26,
        27,
        32,
        33,
        38,
        39,
        40,
        41,
        42,
        43,
        44,
        45,
        56,
        57,
        62,
        63,
        68,
        69,
        74,
        75,
        76,
        77,
        78,
        79,
        80,
        81,
        92,
        93,
        98,
        99,
        112,
        113,
        128,
        129,
        134,
        135,
        148,
        149,
        160,
        161,
        162,
        163,
        164,
        165,
        166,
        167,
        168,
        169,
        170,
        171,
        172,
        173,
        178,
        179,
        184,
        185,
        196,
        197,
        198,
        199,
        200,
        201,
        202,
        203,
        204,
        205,
        206,
        207,
        208,
        209,
        214,
        215,
        220,
        221
      ];
    }
  } catch (error) {}
  exports.inspectOpts = Object.keys(process.env).filter((key) => {
    return /^debug_/i.test(key);
  }).reduce((obj, key) => {
    const prop = key.substring(6).toLowerCase().replace(/_([a-z])/g, (_, k) => {
      return k.toUpperCase();
    });
    let val = process.env[key];
    if (/^(yes|on|true|enabled)$/i.test(val)) {
      val = true;
    } else if (/^(no|off|false|disabled)$/i.test(val)) {
      val = false;
    } else if (val === "null") {
      val = null;
    } else {
      val = Number(val);
    }
    obj[prop] = val;
    return obj;
  }, {});
  function useColors() {
    return "colors" in exports.inspectOpts ? Boolean(exports.inspectOpts.colors) : tty.isatty(process.stderr.fd);
  }
  function formatArgs(args) {
    const { namespace: name, useColors: useColors2 } = this;
    if (useColors2) {
      const c = this.color;
      const colorCode = "\x1B[3" + (c < 8 ? c : "8;5;" + c);
      const prefix = `  ${colorCode};1m${name} \x1B[0m`;
      args[0] = prefix + args[0].split(`
`).join(`
` + prefix);
      args.push(colorCode + "m+" + module.exports.humanize(this.diff) + "\x1B[0m");
    } else {
      args[0] = getDate() + name + " " + args[0];
    }
  }
  function getDate() {
    if (exports.inspectOpts.hideDate) {
      return "";
    }
    return new Date().toISOString() + " ";
  }
  function log(...args) {
    return process.stderr.write(util.formatWithOptions(exports.inspectOpts, ...args) + `
`);
  }
  function save(namespaces) {
    if (namespaces) {
      process.env.DEBUG = namespaces;
    } else {
      delete process.env.DEBUG;
    }
  }
  function load() {
    return process.env.DEBUG;
  }
  function init(debug) {
    debug.inspectOpts = {};
    const keys = Object.keys(exports.inspectOpts);
    for (let i = 0;i < keys.length; i++) {
      debug.inspectOpts[keys[i]] = exports.inspectOpts[keys[i]];
    }
  }
  module.exports = require_common()(exports);
  var { formatters } = module.exports;
  formatters.o = function(v) {
    this.inspectOpts.colors = this.useColors;
    return util.inspect(v, this.inspectOpts).split(`
`).map((str) => str.trim()).join(" ");
  };
  formatters.O = function(v) {
    this.inspectOpts.colors = this.useColors;
    return util.inspect(v, this.inspectOpts);
  };
});

// node_modules/debug/src/index.js
var require_src = __commonJS((exports, module) => {
  if (typeof process === "undefined" || process.type === "renderer" || false || process.__nwjs) {
    module.exports = require_browser();
  } else {
    module.exports = require_node();
  }
});

// node_modules/@kwsites/file-exists/dist/src/index.js
var require_src2 = __commonJS((exports) => {
  var __importDefault = exports && exports.__importDefault || function(mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  var fs_1 = __require("fs");
  var debug_1 = __importDefault(require_src());
  var log = debug_1.default("@kwsites/file-exists");
  function check(path, isFile, isDirectory) {
    log(`checking %s`, path);
    try {
      const stat = fs_1.statSync(path);
      if (stat.isFile() && isFile) {
        log(`[OK] path represents a file`);
        return true;
      }
      if (stat.isDirectory() && isDirectory) {
        log(`[OK] path represents a directory`);
        return true;
      }
      log(`[FAIL] path represents something other than a file or directory`);
      return false;
    } catch (e) {
      if (e.code === "ENOENT") {
        log(`[FAIL] path is not accessible: %o`, e);
        return false;
      }
      log(`[FATAL] %o`, e);
      throw e;
    }
  }
  function exists(path, type = exports.READABLE) {
    return check(path, (type & exports.FILE) > 0, (type & exports.FOLDER) > 0);
  }
  exports.exists = exists;
  exports.FILE = 1;
  exports.FOLDER = 2;
  exports.READABLE = exports.FILE + exports.FOLDER;
});

// node_modules/@kwsites/file-exists/dist/index.js
var require_dist = __commonJS((exports) => {
  function __export2(m) {
    for (var p in m)
      if (!exports.hasOwnProperty(p))
        exports[p] = m[p];
  }
  Object.defineProperty(exports, "__esModule", { value: true });
  __export2(require_src2());
});

// node_modules/@simple-git/args-pathspec/dist/index.mjs
function c(...n) {
  const e = new String(n);
  return t.set(e, n), e;
}
function r(n) {
  return n instanceof String && t.has(n);
}
function o(n) {
  return t.get(n) ?? [];
}
var t;
var init_dist = __esm(() => {
  t = /* @__PURE__ */ new WeakMap;
});

// node_modules/@kwsites/promise-deferred/dist/index.js
var require_dist2 = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.createDeferred = exports.deferred = undefined;
  function deferred() {
    let done;
    let fail;
    let status = "pending";
    const promise = new Promise((_done, _fail) => {
      done = _done;
      fail = _fail;
    });
    return {
      promise,
      done(result) {
        if (status === "pending") {
          status = "resolved";
          done(result);
        }
      },
      fail(error) {
        if (status === "pending") {
          status = "rejected";
          fail(error);
        }
      },
      get fulfilled() {
        return status !== "pending";
      },
      get status() {
        return status;
      }
    };
  }
  exports.deferred = deferred;
  exports.createDeferred = deferred;
  exports.default = deferred;
});

// node_modules/@simple-git/argv-parser/dist/index.mjs
function* U(e, t2) {
  const n = t2 === "global";
  for (const o2 of e)
    o2.isGlobal === n && (yield o2);
}
function F(e, t2) {
  for (const { name: o2 } of U(e, "task")) {
    if (k.has(o2))
      return p(true, t2);
    if (S.has(o2))
      return p(false, t2);
  }
  const n = t2.at(0)?.toLowerCase();
  return n === undefined ? null : P.has(n) ? p(true, t2.slice(1)) : E.has(n) ? p(false, t2.slice(1)) : t2.length === 1 ? p(false, t2) : p(true, t2);
}
function p(e = false, t2 = []) {
  const n = t2.at(0)?.toLowerCase();
  return n === undefined ? null : {
    isWrite: e,
    isRead: !e,
    key: n,
    value: t2.at(1)
  };
}
function A(e, t2) {
  return t2.isWrite && t2.value !== undefined ? { key: t2.key, value: t2.value, scope: e } : { key: t2.key, scope: e };
}
function M(e) {
  const t2 = e?.indexOf("=") || -1;
  return !e || t2 < 0 ? null : {
    key: e.slice(0, t2).trim().toLowerCase(),
    value: e.slice(t2 + 1)
  };
}
function N(e) {
  for (const { name: t2 } of U(e, "task"))
    switch (t2) {
      case "--global":
        return "global";
      case "--system":
        return "system";
      case "--worktree":
        return "worktree";
      case "--local":
        return "local";
      case "--file":
      case "-f":
        return "file";
    }
  return "local";
}
function G({ name: e }) {
  if (e === "-c" || e === "--config")
    return "inline";
  if (e === "--config-env")
    return "env";
}
function* O(e) {
  for (const t2 of e) {
    const n = G(t2), o2 = n && M(t2.value);
    o2 && (yield {
      ...o2,
      scope: n
    });
  }
}
function L(e, t2, n) {
  const o2 = {
    read: [],
    write: [...O(t2)]
  };
  return e === "config" && $(o2, N(t2), F(t2, n)), o2;
}
function $(e, t2, n) {
  if (n === null)
    return;
  const o2 = A(t2, n);
  n.isWrite ? e.write.push(o2) : e.read.push(o2);
}
function I(e) {
  const t2 = R[e ?? ""] ?? T;
  return {
    short: new Map([...x.short.entries(), ...t2.short.entries()]),
    long: t2.long
  };
}
function b(e, t2 = D) {
  if (e.startsWith("--")) {
    const n = e.indexOf("=");
    if (n > 2)
      return [{ name: e.slice(0, n), value: e.slice(n + 1), needsNext: false }];
    const o2 = e.slice(2);
    return [{ name: e, needsNext: t2.long.has(o2) }];
  }
  if (e.length === 2) {
    const n = e.charAt(1), o2 = t2.short.get(n);
    return [{ name: e, needsNext: o2 === true }];
  }
  return W(e, t2.short);
}
function W(e, t2) {
  const n = e.slice(1).split(""), o2 = [];
  for (let s = 0;s < n.length; s++) {
    const r2 = n[s], l = t2.get(r2);
    if (l === undefined)
      return [{ name: e, needsNext: false }];
    if (l) {
      const a = n.slice(s + 1).join("");
      if (a && ![...a].every((w) => t2.has(w)))
        return o2.push({ name: `-${r2}`, value: a, needsNext: false }), o2;
    }
    o2.push({ name: `-${r2}`, needsNext: l });
  }
  return o2;
}
function j(e, t2 = []) {
  let n = 0;
  for (;n < e.length; ) {
    const o2 = String(e[n]);
    if (!o2.startsWith("-") || o2.length < 2)
      break;
    const s = b(o2);
    let r2 = n + 1;
    for (const l of s) {
      const a = {
        name: l.name,
        value: l.value,
        absorbedNext: false,
        isGlobal: true
      };
      l.needsNext && a.value === undefined && r2 < e.length && (a.value = String(e[r2]), a.absorbedNext = true, r2++), t2.push(a);
    }
    n = r2;
  }
  return { flags: t2, taskIndex: n };
}
function B(e, t2, n = []) {
  const o2 = I(t2), s = [], r2 = [];
  let l = 0;
  for (;l < e.length; ) {
    const a = e[l];
    if (r(a)) {
      r2.push(...o(a)), l++;
      continue;
    }
    const f = String(a);
    if (f === "--") {
      for (let g = l + 1;g < e.length; g++) {
        const u = e[g];
        r(u) ? r2.push(...o(u)) : r2.push(String(u));
      }
      break;
    }
    if (!f.startsWith("-") || f.length < 2) {
      s.push(f), l++;
      continue;
    }
    const w = b(f, o2);
    let d = l + 1;
    for (const g of w) {
      const u = {
        name: g.name,
        value: g.value,
        absorbedNext: false,
        isGlobal: false
      };
      g.needsNext && u.value === undefined && d < e.length && !r(e[d]) && (u.value = String(e[d]), u.absorbedNext = true, d++), n.push(u);
    }
    l = d;
  }
  return { flags: n, positionals: s, pathspecs: r2 };
}
function* V({
  write: e
}) {
  for (const t2 of e)
    for (const n of q) {
      const o2 = n(t2.key);
      o2 && (yield o2);
    }
}
function c2(e, t2, n = String(e)) {
  const o2 = typeof e == "string" ? new RegExp(`\\s*${e.toLowerCase()}`) : e;
  return function(r2) {
    if (o2.test(r2))
      return {
        category: t2,
        message: `Configuring ${n} is not permitted without enabling ${t2}`
      };
  };
}
function i(e, t2) {
  const n = new RegExp(`\\s*${e.toLowerCase().replace(/\./g, "(..+)?.")}`);
  return c2(n, t2, e);
}
function* K(e, t2) {
  for (const n of t2)
    for (const o2 of H) {
      const s = o2(e, n.name);
      s && (yield s);
    }
}
function h(e, t2, n, o2 = String(t2)) {
  const s = typeof t2 == "string" ? new RegExp(`\\s*${t2.toLowerCase()}`) : t2, r2 = `Use of ${e ? `${e} with option ` : ""}${o2} is not permitted without enabling ${n}`;
  return function(a, f) {
    if ((!e || a === e) && s.test(f))
      return {
        category: n,
        message: r2
      };
  };
}
function C(e, t2, n) {
  return [...K(e, t2), ...V(n)];
}
function Y(...e) {
  const { flags: t2, taskIndex: n } = j(e), o2 = n < e.length ? String(e[n]).toLowerCase() : null, s = o2 !== null ? e.slice(n + 1) : [], { positionals: r2, pathspecs: l } = B(s, o2, t2), a = L(o2, t2, r2);
  return {
    task: o2,
    flags: t2.map(J),
    paths: l,
    config: a,
    vulnerabilities: z(C(o2, t2, a))
  };
}
function z(e) {
  return Object.defineProperty(e, "vulnerabilities", {
    value: e
  });
}
function J({ value: e, name: t2 }) {
  return e !== undefined ? { name: t2, value: e } : { name: t2 };
}
function* Q(e) {
  const t2 = parseInt(e.git_config_count ?? "0", 10);
  for (let n = 0;n < t2; n++) {
    const o2 = e[`git_config_key_${n}`], s = e[`git_config_value_${n}`];
    o2 !== undefined && (yield { key: o2.toLowerCase().trim(), value: s, scope: "env" });
  }
}
function* X(e) {
  for (const t2 of Object.keys(e))
    if (_(t2)) {
      const n = y[t2];
      yield {
        category: n,
        message: `Use of "${t2.toUpperCase()}" is not permitted without enabling ${n}`
      };
    }
}
function _(e) {
  return Object.hasOwn(y, e);
}
function Z(e) {
  const t2 = {};
  for (const [n, o2] of Object.entries(e)) {
    const s = n.toLowerCase().trim();
    (_(s) || s.startsWith("git")) && (t2[s] = String(o2));
  }
  return t2;
}
function ee(e) {
  const t2 = Z(e), n = {
    read: [],
    write: [...Q(t2)]
  }, o2 = [
    ...X(t2),
    ...C(null, [], n)
  ];
  return {
    config: n,
    vulnerabilities: o2
  };
}
function ne(e, t2) {
  return [...Y(...e).vulnerabilities, ...ee(t2).vulnerabilities];
}
var k, S, P, E, x, D, R, T, q, H, y;
var init_dist2 = __esm(() => {
  init_dist();
  k = /* @__PURE__ */ new Set([
    "--add",
    "--edit",
    "--remove-section",
    "--rename-section",
    "--replace-all",
    "--unset",
    "--unset-all",
    "-e"
  ]);
  S = /* @__PURE__ */ new Set([
    "--get",
    "--get-all",
    "--get-color",
    "--get-colorbool",
    "--get-regexp",
    "--get-urlmatch",
    "--list",
    "-l"
  ]);
  P = /* @__PURE__ */ new Set([
    "edit",
    "remove-section",
    "rename-section",
    "set",
    "unset"
  ]);
  E = /* @__PURE__ */ new Set(["get", "get-color", "get-colorbool", "list"]);
  x = {
    short: /* @__PURE__ */ new Map([
      ["c", true]
    ])
  };
  D = {
    short: new Map([
      ["C", true],
      ["P", false],
      ["h", false],
      ["p", false],
      ["v", false],
      ...x.short.entries()
    ]),
    long: /* @__PURE__ */ new Set([
      "attr-source",
      "config-env",
      "exec-path",
      "git-dir",
      "list-cmds",
      "namespace",
      "super-prefix",
      "work-tree"
    ])
  };
  R = {
    clone: {
      short: /* @__PURE__ */ new Map([
        ["b", true],
        ["j", true],
        ["l", false],
        ["n", false],
        ["o", true],
        ["q", false],
        ["s", false],
        ["u", true]
      ]),
      long: /* @__PURE__ */ new Set(["branch", "config", "jobs", "origin", "upload-pack", "u", "template"])
    },
    commit: {
      short: /* @__PURE__ */ new Map([
        ["C", true],
        ["F", true],
        ["c", true],
        ["m", true],
        ["t", true]
      ]),
      long: /* @__PURE__ */ new Set(["file", "message", "reedit-message", "reuse-message", "template"])
    },
    config: {
      short: /* @__PURE__ */ new Map([
        ["e", false],
        ["f", true],
        ["l", false]
      ]),
      long: /* @__PURE__ */ new Set(["blob", "comment", "default", "file", "type", "value"])
    },
    fetch: {
      short: /* @__PURE__ */ new Map,
      long: /* @__PURE__ */ new Set(["upload-pack"])
    },
    init: {
      short: /* @__PURE__ */ new Map,
      long: /* @__PURE__ */ new Set(["template"])
    },
    pull: {
      short: /* @__PURE__ */ new Map,
      long: /* @__PURE__ */ new Set(["upload-pack"])
    },
    push: {
      short: /* @__PURE__ */ new Map,
      long: /* @__PURE__ */ new Set(["exec", "receive-pack"])
    }
  };
  T = { short: /* @__PURE__ */ new Map, long: /* @__PURE__ */ new Set };
  q = [
    c2("alias", "allowUnsafeAlias"),
    c2("core.askPass", "allowUnsafeAskPass"),
    c2("core.editor", "allowUnsafeEditor"),
    c2("core.fsmonitor", "allowUnsafeFsMonitor"),
    c2("core.gitProxy", "allowUnsafeGitProxy"),
    c2("core.hooksPath", "allowUnsafeHooksPath"),
    c2("core.pager", "allowUnsafePager"),
    c2("core.sshCommand", "allowUnsafeSshCommand"),
    i("credential.helper", "allowUnsafeCredentialHelper"),
    i("diff.command", "allowUnsafeDiffExternal"),
    c2("diff.external", "allowUnsafeDiffExternal"),
    i("diff.textconv", "allowUnsafeDiffTextConv"),
    i("filter.clean", "allowUnsafeFilter"),
    i("filter.smudge", "allowUnsafeFilter"),
    i("gpg.program", "allowUnsafeGpgProgram"),
    c2("init.templateDir", "allowUnsafeTemplateDir"),
    i("merge.driver", "allowUnsafeMergeDriver"),
    i("mergetool.path", "allowUnsafeMergeDriver"),
    i("mergetool.cmd", "allowUnsafeMergeDriver"),
    i("protocol.allow", "allowUnsafeProtocolOverride"),
    i("remote.receivepack", "allowUnsafePack"),
    i("remote.uploadpack", "allowUnsafePack"),
    c2("sequence.editor", "allowUnsafeEditor")
  ];
  H = [
    h(null, /--(upload|receive)-pack/, "allowUnsafePack", "--upload-pack or --receive-pack"),
    h("clone", /^-\w*u/, "allowUnsafePack"),
    h("clone", "--u", "allowUnsafePack"),
    h("push", "--exec", "allowUnsafePack"),
    h(null, "--template", "allowUnsafeTemplateDir")
  ];
  y = {
    editor: "allowUnsafeEditor",
    git_askpass: "allowUnsafeAskPass",
    git_config_global: "allowUnsafeConfigPaths",
    git_config_system: "allowUnsafeConfigPaths",
    git_config_count: "allowUnsafeConfigEnvCount",
    git_config: "allowUnsafeConfigPaths",
    git_editor: "allowUnsafeEditor",
    git_exec_path: "allowUnsafeConfigPaths",
    git_external_diff: "allowUnsafeDiffExternal",
    git_pager: "allowUnsafePager",
    git_proxy_command: "allowUnsafeGitProxy",
    git_template_dir: "allowUnsafeTemplateDir",
    git_sequence_editor: "allowUnsafeEditor",
    git_ssh: "allowUnsafeSshCommand",
    git_ssh_command: "allowUnsafeSshCommand",
    pager: "allowUnsafePager",
    prefix: "allowUnsafeConfigPaths",
    ssh_askpass: "allowUnsafeAskPass"
  };
});

// node_modules/simple-git/dist/esm/index.js
import { spawn } from "child_process";
import { normalize } from "node:path";
import { EventEmitter } from "node:events";
function asFunction(source) {
  if (typeof source !== "function") {
    return NOOP;
  }
  return source;
}
function isUserFunction(source) {
  return typeof source === "function" && source !== NOOP;
}
function splitOn(input, char) {
  const index = input.indexOf(char);
  if (index <= 0) {
    return [input, ""];
  }
  return [input.substr(0, index), input.substr(index + 1)];
}
function first(input, offset = 0) {
  return isArrayLike(input) && input.length > offset ? input[offset] : undefined;
}
function last(input, offset = 0) {
  if (isArrayLike(input) && input.length > offset) {
    return input[input.length - 1 - offset];
  }
}
function isArrayLike(input) {
  return filterHasLength(input);
}
function toLinesWithContent(input = "", trimmed2 = true, separator = `
`) {
  return input.split(separator).reduce((output, line) => {
    const lineContent = trimmed2 ? line.trim() : line;
    if (lineContent) {
      output.push(lineContent);
    }
    return output;
  }, []);
}
function forEachLineWithContent(input, callback) {
  return toLinesWithContent(input, true).map((line) => callback(line));
}
function folderExists(path) {
  return import_file_exists.exists(path, import_file_exists.FOLDER);
}
function append(target, item) {
  if (Array.isArray(target)) {
    if (!target.includes(item)) {
      target.push(item);
    }
  } else {
    target.add(item);
  }
  return item;
}
function including(target, item) {
  if (Array.isArray(target) && !target.includes(item)) {
    target.push(item);
  }
  return target;
}
function remove(target, item) {
  if (Array.isArray(target)) {
    const index = target.indexOf(item);
    if (index >= 0) {
      target.splice(index, 1);
    }
  } else {
    target.delete(item);
  }
  return item;
}
function asArray(source) {
  return Array.isArray(source) ? source : [source];
}
function asCamelCase(str) {
  return str.replace(/[\s-]+(.)/g, (_all, chr) => {
    return chr.toUpperCase();
  });
}
function asStringArray(source) {
  return asArray(source).map((item) => {
    return item instanceof String ? item : String(item);
  });
}
function asNumber(source, onNaN = 0) {
  if (source == null) {
    return onNaN;
  }
  const num = parseInt(source, 10);
  return Number.isNaN(num) ? onNaN : num;
}
function prefixedArray(input, prefix) {
  const output = [];
  for (let i2 = 0, max = input.length;i2 < max; i2++) {
    output.push(prefix, input[i2]);
  }
  return output;
}
function bufferToString(input) {
  return (Array.isArray(input) ? Buffer.concat(input) : input).toString("utf-8");
}
function pick(source, properties) {
  const out = {};
  properties.forEach((key) => {
    if (source[key] !== undefined) {
      out[key] = source[key];
    }
  });
  return out;
}
function delay(duration = 0) {
  return new Promise((done) => setTimeout(done, duration));
}
function orVoid(input) {
  if (input === false) {
    return;
  }
  return input;
}
function filterType(input, filter, def) {
  if (filter(input)) {
    return input;
  }
  return arguments.length > 2 ? def : undefined;
}
function filterPrimitives(input, omit) {
  const type = r(input) ? "string" : typeof input;
  return /number|string|boolean/.test(type) && (!omit || !omit.includes(type));
}
function filterPlainObject(input) {
  return !!input && objectToString(input) === "[object Object]";
}
function filterFunction(input) {
  return typeof input === "function";
}
function useMatchesDefault() {
  throw new Error(`LineParser:useMatches not implemented`);
}
function createInstanceConfig(...options) {
  const baseDir = process.cwd();
  const config = Object.assign({ baseDir, ...defaultOptions }, ...options.filter((o2) => typeof o2 === "object" && o2));
  config.baseDir = config.baseDir || baseDir;
  config.trimmed = config.trimmed === true;
  return config;
}
function appendTaskOptions(options, commands = []) {
  if (!filterPlainObject(options)) {
    return commands;
  }
  return Object.keys(options).reduce((commands2, key) => {
    const value = options[key];
    if (r(value)) {
      commands2.push(value);
    } else if (filterPrimitives(value, ["boolean"])) {
      commands2.push(key + "=" + value);
    } else if (Array.isArray(value)) {
      for (const v of value) {
        if (!filterPrimitives(v, ["string", "number"])) {
          commands2.push(key + "=" + v);
        }
      }
    } else {
      commands2.push(key);
    }
    return commands2;
  }, commands);
}
function getTrailingOptions(args, initialPrimitive = 0, objectOnly = false) {
  const command = [];
  for (let i2 = 0, max = initialPrimitive < 0 ? args.length : initialPrimitive;i2 < max; i2++) {
    if ("string|number".includes(typeof args[i2])) {
      command.push(String(args[i2]));
    }
  }
  appendTaskOptions(trailingOptionsArgument(args), command);
  if (!objectOnly) {
    command.push(...trailingArrayArgument(args));
  }
  return command;
}
function trailingArrayArgument(args) {
  const hasTrailingCallback = typeof last(args) === "function";
  return asStringArray(filterType(last(args, hasTrailingCallback ? 1 : 0), filterArray, []));
}
function trailingOptionsArgument(args) {
  const hasTrailingCallback = filterFunction(last(args));
  return filterType(last(args, hasTrailingCallback ? 1 : 0), filterPlainObject);
}
function trailingFunctionArgument(args, includeNoop = true) {
  const callback = asFunction(last(args));
  return includeNoop || isUserFunction(callback) ? callback : undefined;
}
function callTaskParser(parser4, streams) {
  return parser4(streams.stdOut, streams.stdErr);
}
function parseStringResponse(result, parsers12, texts, trim = true) {
  asArray(texts).forEach((text) => {
    for (let lines = toLinesWithContent(text, trim), i2 = 0, max = lines.length;i2 < max; i2++) {
      const line = (offset = 0) => {
        if (i2 + offset >= max) {
          return;
        }
        return lines[i2 + offset];
      };
      parsers12.some(({ parse: parse2 }) => parse2(line, result));
    }
  });
  return result;
}
function checkIsRepoTask(action) {
  switch (action) {
    case "bare":
      return checkIsBareRepoTask();
    case "root":
      return checkIsRepoRootTask();
  }
  const commands = ["rev-parse", "--is-inside-work-tree"];
  return {
    commands,
    format: "utf-8",
    onError,
    parser
  };
}
function checkIsRepoRootTask() {
  const commands = ["rev-parse", "--git-dir"];
  return {
    commands,
    format: "utf-8",
    onError,
    parser(path) {
      return /^\.(git)?$/.test(path.trim());
    }
  };
}
function checkIsBareRepoTask() {
  const commands = ["rev-parse", "--is-bare-repository"];
  return {
    commands,
    format: "utf-8",
    onError,
    parser
  };
}
function isNotRepoMessage(error) {
  return /(Not a git repository|Kein Git-Repository)/i.test(String(error));
}
function cleanSummaryParser(dryRun, text) {
  const summary = new CleanResponse(dryRun);
  const regexp = dryRun ? dryRunRemovalRegexp : removalRegexp;
  toLinesWithContent(text).forEach((line) => {
    const removed = line.replace(regexp, "");
    summary.paths.push(removed);
    (isFolderRegexp.test(removed) ? summary.folders : summary.files).push(removed);
  });
  return summary;
}
function adhocExecTask(parser4) {
  return {
    commands: EMPTY_COMMANDS,
    format: "empty",
    parser: parser4
  };
}
function configurationErrorTask(error) {
  return {
    commands: EMPTY_COMMANDS,
    format: "empty",
    parser() {
      throw typeof error === "string" ? new TaskConfigurationError(error) : error;
    }
  };
}
function straightThroughStringTask(commands, trimmed2 = false) {
  return {
    commands,
    format: "utf-8",
    parser(text) {
      return trimmed2 ? String(text).trim() : text;
    }
  };
}
function straightThroughBufferTask(commands) {
  return {
    commands,
    format: "buffer",
    parser(buffer) {
      return buffer;
    }
  };
}
function isBufferTask(task) {
  return task.format === "buffer";
}
function isEmptyTask(task) {
  return task.format === "empty" || !task.commands.length;
}
function cleanWithOptionsTask(mode, customArgs) {
  const { cleanMode, options, valid } = getCleanOptions(mode);
  if (!cleanMode) {
    return configurationErrorTask(CONFIG_ERROR_MODE_REQUIRED);
  }
  if (!valid.options) {
    return configurationErrorTask(CONFIG_ERROR_UNKNOWN_OPTION + JSON.stringify(mode));
  }
  options.push(...customArgs);
  if (options.some(isInteractiveMode)) {
    return configurationErrorTask(CONFIG_ERROR_INTERACTIVE_MODE);
  }
  return cleanTask(cleanMode, options);
}
function cleanTask(mode, customArgs) {
  const commands = ["clean", `-${mode}`, ...customArgs];
  return {
    commands,
    format: "utf-8",
    parser(text) {
      return cleanSummaryParser(mode === "n", text);
    }
  };
}
function isCleanOptionsArray(input) {
  return Array.isArray(input) && input.every((test) => CleanOptionValues.has(test));
}
function getCleanOptions(input) {
  let cleanMode;
  let options = [];
  let valid = { cleanMode: false, options: true };
  input.replace(/[^a-z]i/g, "").split("").forEach((char) => {
    if (isCleanMode(char)) {
      cleanMode = char;
      valid.cleanMode = true;
    } else {
      valid.options = valid.options && isKnownOption(options[options.length] = `-${char}`);
    }
  });
  return {
    cleanMode,
    options,
    valid
  };
}
function isCleanMode(cleanMode) {
  return cleanMode === "f" || cleanMode === "n";
}
function isKnownOption(option) {
  return /^-[a-z]$/i.test(option) && CleanOptionValues.has(option.charAt(1));
}
function isInteractiveMode(option) {
  if (/^-[^\-]/.test(option)) {
    return option.indexOf("i") > 0;
  }
  return option === "--interactive";
}
function configListParser(text) {
  const config = new ConfigList;
  for (const item of configParser(text)) {
    config.addValue(item.file, String(item.key), item.value);
  }
  return config;
}
function configGetParser(text, key) {
  let value = null;
  const values = [];
  const scopes = /* @__PURE__ */ new Map;
  for (const item of configParser(text, key)) {
    if (item.key !== key) {
      continue;
    }
    values.push(value = item.value);
    if (!scopes.has(item.file)) {
      scopes.set(item.file, []);
    }
    scopes.get(item.file).push(value);
  }
  return {
    key,
    paths: Array.from(scopes.keys()),
    scopes,
    value,
    values
  };
}
function configFilePath(filePath) {
  return filePath.replace(/^(file):/, "");
}
function* configParser(text, requestedKey = null) {
  const lines = text.split("\x00");
  for (let i2 = 0, max = lines.length - 1;i2 < max; ) {
    const file = configFilePath(lines[i2++]);
    let value = lines[i2++];
    let key = requestedKey;
    if (value.includes(`
`)) {
      const line = splitOn(value, `
`);
      key = line[0];
      value = line[1];
    }
    yield { file, key, value };
  }
}
function asConfigScope(scope, fallback) {
  if (typeof scope === "string" && Object.hasOwn(GitConfigScope, scope)) {
    return scope;
  }
  return fallback;
}
function addConfigTask(key, value, append2, scope) {
  const commands = ["config", `--${scope}`];
  if (append2) {
    commands.push("--add");
  }
  commands.push(key, value);
  return {
    commands,
    format: "utf-8",
    parser(text) {
      return text;
    }
  };
}
function getConfigTask(key, scope) {
  const commands = ["config", "--null", "--show-origin", "--get-all", key];
  if (scope) {
    commands.splice(1, 0, `--${scope}`);
  }
  return {
    commands,
    format: "utf-8",
    parser(text) {
      return configGetParser(text, key);
    }
  };
}
function listConfigTask(scope) {
  const commands = ["config", "--list", "--show-origin", "--null"];
  if (scope) {
    commands.push(`--${scope}`);
  }
  return {
    commands,
    format: "utf-8",
    parser(text) {
      return configListParser(text);
    }
  };
}
function config_default() {
  return {
    addConfig(key, value, ...rest) {
      return this._runTask(addConfigTask(key, value, rest[0] === true, asConfigScope(rest[1], "local")), trailingFunctionArgument(arguments));
    },
    getConfig(key, scope) {
      return this._runTask(getConfigTask(key, asConfigScope(scope, undefined)), trailingFunctionArgument(arguments));
    },
    listConfig(...rest) {
      return this._runTask(listConfigTask(asConfigScope(rest[0], undefined)), trailingFunctionArgument(arguments));
    }
  };
}
function isDiffNameStatus(input) {
  return diffNameStatus.has(input);
}
function grepQueryBuilder(...params) {
  return new GrepQuery().param(...params);
}
function parseGrep(grep) {
  const paths = /* @__PURE__ */ new Set;
  const results = {};
  forEachLineWithContent(grep, (input) => {
    const [path, line, preview] = input.split(NULL);
    paths.add(path);
    (results[path] = results[path] || []).push({
      line: asNumber(line),
      path,
      preview
    });
  });
  return {
    paths,
    results
  };
}
function grep_default() {
  return {
    grep(searchTerm) {
      const then = trailingFunctionArgument(arguments);
      const options = getTrailingOptions(arguments);
      for (const option of disallowedOptions) {
        if (options.includes(option)) {
          return this._runTask(configurationErrorTask(`git.grep: use of "${option}" is not supported.`), then);
        }
      }
      if (typeof searchTerm === "string") {
        searchTerm = grepQueryBuilder().param(searchTerm);
      }
      const commands = ["grep", "--null", "-n", "--full-name", ...options, ...searchTerm];
      return this._runTask({
        commands,
        format: "utf-8",
        parser(stdOut) {
          return parseGrep(stdOut);
        }
      }, then);
    }
  };
}
function resetTask(mode, customArgs) {
  const commands = ["reset"];
  if (isValidResetMode(mode)) {
    commands.push(`--${mode}`);
  }
  commands.push(...customArgs);
  return straightThroughStringTask(commands);
}
function getResetMode(mode) {
  if (isValidResetMode(mode)) {
    return mode;
  }
  switch (typeof mode) {
    case "string":
    case "undefined":
      return "soft";
  }
  return;
}
function isValidResetMode(mode) {
  return typeof mode === "string" && validResetModes.includes(mode);
}
function createLog() {
  return import_debug.default("simple-git");
}
function prefixedLogger(to, prefix, forward) {
  if (!prefix || !String(prefix).replace(/\s*/, "")) {
    return !forward ? to : (message, ...args) => {
      to(message, ...args);
      forward(message, ...args);
    };
  }
  return (message, ...args) => {
    to(`%s ${message}`, prefix, ...args);
    if (forward) {
      forward(message, ...args);
    }
  };
}
function childLoggerName(name, childDebugger, { namespace: parentNamespace }) {
  if (typeof name === "string") {
    return name;
  }
  const childNamespace = childDebugger && childDebugger.namespace || "";
  if (childNamespace.startsWith(parentNamespace)) {
    return childNamespace.substr(parentNamespace.length + 1);
  }
  return childNamespace || parentNamespace;
}
function createLogger(label, verbose, initialStep, infoDebugger = createLog()) {
  const labelPrefix = label && `[${label}]` || "";
  const spawned = [];
  const debugDebugger = typeof verbose === "string" ? infoDebugger.extend(verbose) : verbose;
  const key = childLoggerName(filterType(verbose, filterString), debugDebugger, infoDebugger);
  return step(initialStep);
  function sibling(name, initial) {
    return append(spawned, createLogger(label, key.replace(/^[^:]+/, name), initial, infoDebugger));
  }
  function step(phase) {
    const stepPrefix = phase && `[${phase}]` || "";
    const debug2 = debugDebugger && prefixedLogger(debugDebugger, stepPrefix) || NOOP;
    const info = prefixedLogger(infoDebugger, `${labelPrefix} ${stepPrefix}`, debug2);
    return Object.assign(debugDebugger ? debug2 : info, {
      label,
      sibling,
      info,
      step
    });
  }
}
function pluginContext(task, commands) {
  return {
    method: first(task.commands) || "",
    commands
  };
}
function onErrorReceived(target, logger) {
  return (err) => {
    logger(`[ERROR] child process exception %o`, err);
    target.push(Buffer.from(String(err.stack), "ascii"));
  };
}
function onDataReceived(target, name, logger, output) {
  return (buffer) => {
    logger(`%s received %L bytes`, name, buffer);
    output(`%B`, buffer);
    target.push(buffer);
  };
}
function taskCallback(task, response, callback = NOOP) {
  const onSuccess = (data) => {
    callback(null, data);
  };
  const onError2 = (err) => {
    if (err?.task === task) {
      callback(err instanceof GitResponseError ? addDeprecationNoticeToError(err) : err, undefined);
    }
  };
  response.then(onSuccess, onError2);
}
function addDeprecationNoticeToError(err) {
  let log = (name) => {
    console.warn(`simple-git deprecation notice: accessing GitResponseError.${name} should be GitResponseError.git.${name}, this will no longer be available in version 3`);
    log = NOOP;
  };
  return Object.create(err, Object.getOwnPropertyNames(err.git).reduce(descriptorReducer, {}));
  function descriptorReducer(all, name) {
    if (name in err) {
      return all;
    }
    all[name] = {
      enumerable: false,
      configurable: false,
      get() {
        log(name);
        return err.git[name];
      }
    };
    return all;
  }
}
function changeWorkingDirectoryTask(directory, root) {
  return adhocExecTask((instance) => {
    if (!folderExists(directory)) {
      throw new Error(`Git.cwd: cannot change to non-directory "${directory}"`);
    }
    return (root || instance).cwd = directory;
  });
}
function checkoutTask(args) {
  const commands = ["checkout", ...args];
  if (commands[1] === "-b" && commands.includes("-B")) {
    commands[1] = remove(commands, "-B");
  }
  return straightThroughStringTask(commands);
}
function checkout_default() {
  return {
    checkout() {
      return this._runTask(checkoutTask(getTrailingOptions(arguments, 1)), trailingFunctionArgument(arguments));
    },
    checkoutBranch(branchName, startPoint) {
      return this._runTask(checkoutTask(["-b", branchName, startPoint, ...getTrailingOptions(arguments)]), trailingFunctionArgument(arguments));
    },
    checkoutLocalBranch(branchName) {
      return this._runTask(checkoutTask(["-b", branchName, ...getTrailingOptions(arguments)]), trailingFunctionArgument(arguments));
    }
  };
}
function countObjectsResponse() {
  return {
    count: 0,
    garbage: 0,
    inPack: 0,
    packs: 0,
    prunePackable: 0,
    size: 0,
    sizeGarbage: 0,
    sizePack: 0
  };
}
function count_objects_default() {
  return {
    countObjects() {
      return this._runTask({
        commands: ["count-objects", "--verbose"],
        format: "utf-8",
        parser(stdOut) {
          return parseStringResponse(countObjectsResponse(), [parser2], stdOut);
        }
      });
    }
  };
}
function parseCommitResult(stdOut) {
  const result = {
    author: null,
    branch: "",
    commit: "",
    root: false,
    summary: {
      changes: 0,
      insertions: 0,
      deletions: 0
    }
  };
  return parseStringResponse(result, parsers, stdOut);
}
function commitTask(message, files, customArgs) {
  const commands = [
    "-c",
    "core.abbrev=40",
    "commit",
    ...prefixedArray(message, "-m"),
    ...files,
    ...customArgs
  ];
  return {
    commands,
    format: "utf-8",
    parser: parseCommitResult
  };
}
function commit_default() {
  return {
    commit(message, ...rest) {
      const next = trailingFunctionArgument(arguments);
      const task = rejectDeprecatedSignatures(message) || commitTask(asArray(message), asArray(filterType(rest[0], filterStringOrStringArray, [])), [
        ...asStringArray(filterType(rest[1], filterArray, [])),
        ...getTrailingOptions(arguments, 0, true)
      ]);
      return this._runTask(task, next);
    }
  };
  function rejectDeprecatedSignatures(message) {
    return !filterStringOrStringArray(message) && configurationErrorTask(`git.commit: requires the commit message to be supplied as a string/string[]`);
  }
}
function first_commit_default() {
  return {
    firstCommit() {
      return this._runTask(straightThroughStringTask(["rev-list", "--max-parents=0", "HEAD"], true), trailingFunctionArgument(arguments));
    }
  };
}
function hashObjectTask(filePath, write) {
  const commands = ["hash-object", filePath];
  if (write) {
    commands.push("-w");
  }
  return straightThroughStringTask(commands, true);
}
function parseInit(bare, path, text) {
  const response = String(text).trim();
  let result;
  if (result = initResponseRegex.exec(response)) {
    return new InitSummary(bare, path, false, result[1]);
  }
  if (result = reInitResponseRegex.exec(response)) {
    return new InitSummary(bare, path, true, result[1]);
  }
  let gitDir = "";
  const tokens = response.split(" ");
  while (tokens.length) {
    const token = tokens.shift();
    if (token === "in") {
      gitDir = tokens.join(" ");
      break;
    }
  }
  return new InitSummary(bare, path, /^re/i.test(response), gitDir);
}
function hasBareCommand(command) {
  return command.includes(bareCommand);
}
function initTask(bare = false, path, customArgs) {
  const commands = ["init", ...customArgs];
  if (bare && !hasBareCommand(commands)) {
    commands.splice(1, 0, bareCommand);
  }
  return {
    commands,
    format: "utf-8",
    parser(text) {
      return parseInit(commands.includes("--bare"), path, text);
    }
  };
}
function logFormatFromCommand(customArgs) {
  for (let i2 = 0;i2 < customArgs.length; i2++) {
    const format = logFormatRegex.exec(customArgs[i2]);
    if (format) {
      return `--${format[1]}`;
    }
  }
  return "";
}
function isLogFormat(customArg) {
  return logFormatRegex.test(customArg);
}
function getDiffParser(format = "") {
  const parser4 = diffSummaryParsers[format];
  return (stdOut) => parseStringResponse(new DiffSummary, parser4, stdOut, false);
}
function lineBuilder(tokens, fields) {
  return fields.reduce((line, field, index) => {
    line[field] = tokens[index] || "";
    return line;
  }, /* @__PURE__ */ Object.create({ diff: null }));
}
function createListLogSummaryParser(splitter = SPLITTER, fields = defaultFieldNames, logFormat = "") {
  const parseDiffResult = getDiffParser(logFormat);
  return function(stdOut) {
    const all = toLinesWithContent(stdOut.trim(), false, START_BOUNDARY).map(function(item) {
      const lineDetail = item.split(COMMIT_BOUNDARY);
      const listLogLine = lineBuilder(lineDetail[0].split(splitter), fields);
      if (lineDetail.length > 1 && !!lineDetail[1].trim()) {
        listLogLine.diff = parseDiffResult(lineDetail[1]);
      }
      return listLogLine;
    });
    return {
      all,
      latest: all.length && all[0] || null,
      total: all.length
    };
  };
}
function diffSummaryTask(customArgs) {
  let logFormat = logFormatFromCommand(customArgs);
  const commands = ["diff"];
  if (logFormat === "") {
    logFormat = "--stat";
    commands.push("--stat=4096");
  }
  commands.push(...customArgs);
  return validateLogFormatConfig(commands) || {
    commands,
    format: "utf-8",
    parser: getDiffParser(logFormat)
  };
}
function validateLogFormatConfig(customArgs) {
  const flags = customArgs.filter(isLogFormat);
  if (flags.length > 1) {
    return configurationErrorTask(`Summary flags are mutually exclusive - pick one of ${flags.join(",")}`);
  }
  if (flags.length && customArgs.includes("-z")) {
    return configurationErrorTask(`Summary flag ${flags} parsing is not compatible with null termination option '-z'`);
  }
}
function prettyFormat(format, splitter) {
  const fields = [];
  const formatStr = [];
  Object.keys(format).forEach((field) => {
    fields.push(field);
    formatStr.push(String(format[field]));
  });
  return [fields, formatStr.join(splitter)];
}
function userOptions(input) {
  return Object.keys(input).reduce((out, key) => {
    if (!(key in excludeOptions)) {
      out[key] = input[key];
    }
    return out;
  }, {});
}
function parseLogOptions(opt = {}, customArgs = []) {
  const splitter = filterType(opt.splitter, filterString, SPLITTER);
  const format = filterPlainObject(opt.format) ? opt.format : {
    hash: "%H",
    date: opt.strictDate === false ? "%ai" : "%aI",
    message: "%s",
    refs: "%D",
    body: opt.multiLine ? "%B" : "%b",
    author_name: opt.mailMap !== false ? "%aN" : "%an",
    author_email: opt.mailMap !== false ? "%aE" : "%ae"
  };
  const [fields, formatStr] = prettyFormat(format, splitter);
  const suffix = [];
  const command = [
    `--pretty=format:${START_BOUNDARY}${formatStr}${COMMIT_BOUNDARY}`,
    ...customArgs
  ];
  const maxCount = opt.n || opt["max-count"] || opt.maxCount;
  if (maxCount) {
    command.push(`--max-count=${maxCount}`);
  }
  if (opt.from || opt.to) {
    const rangeOperator = opt.symmetric !== false ? "..." : "..";
    suffix.push(`${opt.from || ""}${rangeOperator}${opt.to || ""}`);
  }
  if (filterString(opt.file)) {
    command.push("--follow", c(opt.file));
  }
  appendTaskOptions(userOptions(opt), command);
  return {
    fields,
    splitter,
    commands: [...command, ...suffix]
  };
}
function logTask(splitter, fields, customArgs) {
  const parser4 = createListLogSummaryParser(splitter, fields, logFormatFromCommand(customArgs));
  return {
    commands: ["log", ...customArgs],
    format: "utf-8",
    parser: parser4
  };
}
function log_default() {
  return {
    log(...rest) {
      const next = trailingFunctionArgument(arguments);
      const options = parseLogOptions(trailingOptionsArgument(arguments), asStringArray(filterType(arguments[0], filterArray, [])));
      const task = rejectDeprecatedSignatures(...rest) || validateLogFormatConfig(options.commands) || createLogTask(options);
      return this._runTask(task, next);
    }
  };
  function createLogTask(options) {
    return logTask(options.splitter, options.fields, options.commands);
  }
  function rejectDeprecatedSignatures(from, to) {
    return filterString(from) && filterString(to) && configurationErrorTask(`git.log(string, string) should be replaced with git.log({ from: string, to: string })`);
  }
}
function objectEnumerationResult(remoteMessages) {
  return remoteMessages.objects = remoteMessages.objects || {
    compressing: 0,
    counting: 0,
    enumerating: 0,
    packReused: 0,
    reused: { count: 0, delta: 0 },
    total: { count: 0, delta: 0 }
  };
}
function asObjectCount(source) {
  const count = /^\s*(\d+)/.exec(source);
  const delta = /delta (\d+)/i.exec(source);
  return {
    count: asNumber(count && count[1] || "0"),
    delta: asNumber(delta && delta[1] || "0")
  };
}
function parseRemoteMessages(_stdOut, stdErr) {
  return parseStringResponse({ remoteMessages: new RemoteMessageSummary }, parsers2, stdErr);
}
function parsePullErrorResult(stdOut, stdErr) {
  const pullError = parseStringResponse(new PullFailedSummary, errorParsers, [stdOut, stdErr]);
  return pullError.message && pullError;
}
function mergeTask(customArgs) {
  if (!customArgs.length) {
    return configurationErrorTask("Git.merge requires at least one option");
  }
  return {
    commands: ["merge", ...customArgs],
    format: "utf-8",
    parser(stdOut, stdErr) {
      const merge = parseMergeResult(stdOut, stdErr);
      if (merge.failed) {
        throw new GitResponseError(merge);
      }
      return merge;
    }
  };
}
function pushResultPushedItem(local, remote, status) {
  const deleted = status.includes("deleted");
  const tag = status.includes("tag") || /^refs\/tags/.test(local);
  const alreadyUpdated = !status.includes("new");
  return {
    deleted,
    tag,
    branch: !tag,
    new: !alreadyUpdated,
    alreadyUpdated,
    local,
    remote
  };
}
function pushTagsTask(ref = {}, customArgs) {
  append(customArgs, "--tags");
  return pushTask(ref, customArgs);
}
function pushTask(ref = {}, customArgs) {
  const commands = ["push", ...customArgs];
  if (ref.branch) {
    commands.splice(1, 0, ref.branch);
  }
  if (ref.remote) {
    commands.splice(1, 0, ref.remote);
  }
  remove(commands, "-v");
  append(commands, "--verbose");
  append(commands, "--porcelain");
  return {
    commands,
    format: "utf-8",
    parser: parsePushResult
  };
}
function show_default() {
  return {
    showBuffer() {
      const commands = ["show", ...getTrailingOptions(arguments, 1)];
      if (!commands.includes("--binary")) {
        commands.splice(1, 0, "--binary");
      }
      return this._runTask(straightThroughBufferTask(commands), trailingFunctionArgument(arguments));
    },
    show() {
      const commands = ["show", ...getTrailingOptions(arguments, 1)];
      return this._runTask(straightThroughStringTask(commands), trailingFunctionArgument(arguments));
    }
  };
}
function renamedFile(line) {
  const [to, from] = line.split(NULL);
  return {
    from: from || to,
    to
  };
}
function parser3(indexX, indexY, handler) {
  return [`${indexX}${indexY}`, handler];
}
function conflicts(indexX, ...indexY) {
  return indexY.map((y2) => parser3(indexX, y2, (result, file) => result.conflicted.push(file)));
}
function splitLine(result, lineStr) {
  const trimmed2 = lineStr.trim();
  switch (" ") {
    case trimmed2.charAt(2):
      return data(trimmed2.charAt(0), trimmed2.charAt(1), trimmed2.slice(3));
    case trimmed2.charAt(1):
      return data(" ", trimmed2.charAt(0), trimmed2.slice(2));
    default:
      return;
  }
  function data(index, workingDir, path) {
    const raw = `${index}${workingDir}`;
    const handler = parsers6.get(raw);
    if (handler) {
      handler(result, path);
    }
    if (raw !== "##" && raw !== "!!") {
      result.files.push(new FileStatusSummary(path, index, workingDir));
    }
  }
}
function statusTask(customArgs) {
  const commands = [
    "status",
    "--porcelain",
    "-b",
    "-u",
    "--null",
    ...customArgs.filter((arg) => !ignoredOptions.includes(arg))
  ];
  return {
    format: "utf-8",
    commands,
    parser(text) {
      return parseStatusSummary(text);
    }
  };
}
function versionResponse(major = 0, minor = 0, patch = 0, agent = "", installed = true) {
  return Object.defineProperty({
    major,
    minor,
    patch,
    agent,
    installed
  }, "toString", {
    value() {
      return `${this.major}.${this.minor}.${this.patch}`;
    },
    configurable: false,
    enumerable: false
  });
}
function notInstalledResponse() {
  return versionResponse(0, 0, 0, "", false);
}
function version_default() {
  return {
    version() {
      return this._runTask({
        commands: ["--version"],
        format: "utf-8",
        parser: versionParser,
        onError(result, error, done, fail) {
          if (result.exitCode === -2) {
            return done(Buffer.from(NOT_INSTALLED));
          }
          fail(error);
        }
      });
    }
  };
}
function versionParser(stdOut) {
  if (stdOut === NOT_INSTALLED) {
    return notInstalledResponse();
  }
  return parseStringResponse(versionResponse(0, 0, 0, stdOut), parsers7, stdOut);
}
function createCloneTask(api, task, repoPath, ...args) {
  if (!filterString(repoPath)) {
    return configurationErrorTask(`git.${api}() requires a string 'repoPath'`);
  }
  return task(repoPath, filterType(args[0], filterString), getTrailingOptions(arguments));
}
function clone_default() {
  return {
    clone(repo, ...rest) {
      return this._runTask(createCloneTask("clone", cloneTask, filterType(repo, filterString), ...rest), trailingFunctionArgument(arguments));
    },
    mirror(repo, ...rest) {
      return this._runTask(createCloneTask("mirror", cloneMirrorTask, filterType(repo, filterString), ...rest), trailingFunctionArgument(arguments));
    }
  };
}
function applyPatchTask(patches, customArgs) {
  return straightThroughStringTask(["apply", ...customArgs, ...patches]);
}
function branchDeletionSuccess(branch, hash) {
  return {
    branch,
    hash,
    success: true
  };
}
function branchDeletionFailure(branch) {
  return {
    branch,
    hash: null,
    success: false
  };
}
function hasBranchDeletionError(data, processExitCode) {
  return processExitCode === 1 && deleteErrorRegex.test(data);
}
function branchStatus(input) {
  return input ? input.charAt(0) : "";
}
function parseBranchSummary(stdOut, currentOnly = false) {
  return parseStringResponse(new BranchSummaryResult, currentOnly ? [currentBranchParser] : parsers9, stdOut);
}
function containsDeleteBranchCommand(commands) {
  const deleteCommands = ["-d", "-D", "--delete"];
  return commands.some((command) => deleteCommands.includes(command));
}
function branchTask(customArgs) {
  const isDelete = containsDeleteBranchCommand(customArgs);
  const isCurrentOnly = customArgs.includes("--show-current");
  const commands = ["branch", ...customArgs];
  if (commands.length === 1) {
    commands.push("-a");
  }
  if (!commands.includes("-v")) {
    commands.splice(1, 0, "-v");
  }
  return {
    format: "utf-8",
    commands,
    parser(stdOut, stdErr) {
      if (isDelete) {
        return parseBranchDeletions(stdOut, stdErr).all[0];
      }
      return parseBranchSummary(stdOut, isCurrentOnly);
    }
  };
}
function branchLocalTask() {
  return {
    format: "utf-8",
    commands: ["branch", "-v"],
    parser(stdOut) {
      return parseBranchSummary(stdOut);
    }
  };
}
function deleteBranchesTask(branches, forceDelete = false) {
  return {
    format: "utf-8",
    commands: ["branch", "-v", forceDelete ? "-D" : "-d", ...branches],
    parser(stdOut, stdErr) {
      return parseBranchDeletions(stdOut, stdErr);
    },
    onError({ exitCode, stdOut }, error, done, fail) {
      if (!hasBranchDeletionError(String(error), exitCode)) {
        return fail(error);
      }
      done(stdOut);
    }
  };
}
function deleteBranchTask(branch, forceDelete = false) {
  const task = {
    format: "utf-8",
    commands: ["branch", "-v", forceDelete ? "-D" : "-d", branch],
    parser(stdOut, stdErr) {
      return parseBranchDeletions(stdOut, stdErr).branches[branch];
    },
    onError({ exitCode, stdErr, stdOut }, error, _2, fail) {
      if (!hasBranchDeletionError(String(error), exitCode)) {
        return fail(error);
      }
      throw new GitResponseError(task.parser(bufferToString(stdOut), bufferToString(stdErr)), String(error));
    }
  };
  return task;
}
function toPath(input) {
  const path = input.trim().replace(/^["']|["']$/g, "");
  return path && normalize(path);
}
function checkIgnoreTask(paths) {
  return {
    commands: ["check-ignore", ...paths],
    format: "utf-8",
    parser: parseCheckIgnore
  };
}
function parseFetchResult(stdOut, stdErr) {
  const result = {
    raw: stdOut,
    remote: null,
    branches: [],
    tags: [],
    updated: [],
    deleted: []
  };
  return parseStringResponse(result, parsers10, [stdOut, stdErr]);
}
function disallowedCommand(command) {
  return /^--upload-pack(=|$)/.test(command);
}
function fetchTask(remote, branch, customArgs) {
  const commands = ["fetch", ...customArgs];
  if (remote && branch) {
    commands.push(remote, branch);
  }
  const banned = commands.find(disallowedCommand);
  if (banned) {
    return configurationErrorTask(`git.fetch: potential exploit argument blocked.`);
  }
  return {
    commands,
    format: "utf-8",
    parser: parseFetchResult
  };
}
function parseMoveResult(stdOut) {
  return parseStringResponse({ moves: [] }, parsers11, stdOut);
}
function moveTask(from, to) {
  return {
    commands: ["mv", "-v", ...asArray(from), to],
    format: "utf-8",
    parser: parseMoveResult
  };
}
function pullTask(remote, branch, customArgs) {
  const commands = ["pull", ...customArgs];
  if (remote && branch) {
    commands.splice(1, 0, remote, branch);
  }
  return {
    commands,
    format: "utf-8",
    parser(stdOut, stdErr) {
      return parsePullResult(stdOut, stdErr);
    },
    onError(result, _error, _done, fail) {
      const pullError = parsePullErrorResult(bufferToString(result.stdOut), bufferToString(result.stdErr));
      if (pullError) {
        return fail(new GitResponseError(pullError));
      }
      fail(_error);
    }
  };
}
function parseGetRemotes(text) {
  const remotes = {};
  forEach(text, ([name]) => remotes[name] = { name });
  return Object.values(remotes);
}
function parseGetRemotesVerbose(text) {
  const remotes = {};
  forEach(text, ([name, url, purpose]) => {
    if (!Object.hasOwn(remotes, name)) {
      remotes[name] = {
        name,
        refs: { fetch: "", push: "" }
      };
    }
    if (purpose && url) {
      remotes[name].refs[purpose.replace(/[^a-z]/g, "")] = url;
    }
  });
  return Object.values(remotes);
}
function forEach(text, handler) {
  forEachLineWithContent(text, (line) => handler(line.split(/\s+/)));
}
function addRemoteTask(remoteName, remoteRepo, customArgs) {
  return straightThroughStringTask(["remote", "add", ...customArgs, remoteName, remoteRepo]);
}
function getRemotesTask(verbose) {
  const commands = ["remote"];
  if (verbose) {
    commands.push("-v");
  }
  return {
    commands,
    format: "utf-8",
    parser: verbose ? parseGetRemotesVerbose : parseGetRemotes
  };
}
function listRemotesTask(customArgs) {
  const commands = [...customArgs];
  if (commands[0] !== "ls-remote") {
    commands.unshift("ls-remote");
  }
  return straightThroughStringTask(commands);
}
function remoteTask(customArgs) {
  const commands = [...customArgs];
  if (commands[0] !== "remote") {
    commands.unshift("remote");
  }
  return straightThroughStringTask(commands);
}
function removeRemoteTask(remoteName) {
  return straightThroughStringTask(["remote", "remove", remoteName]);
}
function stashListTask(opt = {}, customArgs) {
  const options = parseLogOptions(opt);
  const commands = ["stash", "list", ...options.commands, ...customArgs];
  const parser4 = createListLogSummaryParser(options.splitter, options.fields, logFormatFromCommand(commands));
  return validateLogFormatConfig(commands) || {
    commands,
    format: "utf-8",
    parser: parser4
  };
}
function addSubModuleTask(repo, path) {
  return subModuleTask(["add", repo, path]);
}
function initSubModuleTask(customArgs) {
  return subModuleTask(["init", ...customArgs]);
}
function subModuleTask(customArgs) {
  const commands = [...customArgs];
  if (commands[0] !== "submodule") {
    commands.unshift("submodule");
  }
  return straightThroughStringTask(commands);
}
function updateSubModuleTask(customArgs) {
  return subModuleTask(["update", ...customArgs]);
}
function singleSorted(a, b2) {
  const aIsNum = Number.isNaN(a);
  const bIsNum = Number.isNaN(b2);
  if (aIsNum !== bIsNum) {
    return aIsNum ? 1 : -1;
  }
  return aIsNum ? sorted(a, b2) : 0;
}
function sorted(a, b2) {
  return a === b2 ? 0 : a > b2 ? 1 : -1;
}
function trimmed(input) {
  return input.trim();
}
function toNumber(input) {
  if (typeof input === "string") {
    return parseInt(input.replace(/^\D+/g, ""), 10) || 0;
  }
  return 0;
}
function tagListTask(customArgs = []) {
  const hasCustomSort = customArgs.some((option) => /^--sort=/.test(option));
  return {
    format: "utf-8",
    commands: ["tag", "-l", ...customArgs],
    parser(text) {
      return parseTagList(text, hasCustomSort);
    }
  };
}
function addTagTask(name) {
  return {
    format: "utf-8",
    commands: ["tag", name],
    parser() {
      return { name };
    }
  };
}
function addAnnotatedTagTask(name, tagMessage) {
  return {
    format: "utf-8",
    commands: ["tag", "-a", "-m", tagMessage, name],
    parser() {
      return { name };
    }
  };
}
function abortPlugin(signal) {
  if (!signal) {
    return;
  }
  const onSpawnAfter = {
    type: "spawn.after",
    action(_data, context) {
      function kill() {
        context.kill(new GitPluginError(undefined, "abort", "Abort signal received"));
      }
      signal.addEventListener("abort", kill);
      context.spawned.on("close", () => signal.removeEventListener("abort", kill));
    }
  };
  const onSpawnBefore = {
    type: "spawn.before",
    action(_data, context) {
      if (signal.aborted) {
        context.kill(new GitPluginError(undefined, "abort", "Abort already signaled"));
      }
    }
  };
  return [onSpawnBefore, onSpawnAfter];
}
function blockUnsafeOperationsPlugin(options = {}) {
  return {
    type: "spawn.args",
    action(args, { env }) {
      for (const vulnerability of ne(args, env)) {
        if (options[vulnerability.category] !== true) {
          throw new GitPluginError(undefined, "unsafe", vulnerability.message);
        }
      }
      return args;
    }
  };
}
function commandConfigPrefixingPlugin(configuration) {
  const prefix = prefixedArray(configuration, "-c");
  return {
    type: "spawn.args",
    action(data) {
      return [...prefix, ...data];
    }
  };
}
function completionDetectionPlugin({
  onClose = true,
  onExit = 50
} = {}) {
  function createEvents() {
    let exitCode = -1;
    const events = {
      close: import_promise_deferred2.deferred(),
      closeTimeout: import_promise_deferred2.deferred(),
      exit: import_promise_deferred2.deferred(),
      exitTimeout: import_promise_deferred2.deferred()
    };
    const result = Promise.race([
      onClose === false ? never : events.closeTimeout.promise,
      onExit === false ? never : events.exitTimeout.promise
    ]);
    configureTimeout(onClose, events.close, events.closeTimeout);
    configureTimeout(onExit, events.exit, events.exitTimeout);
    return {
      close(code) {
        exitCode = code;
        events.close.done();
      },
      exit(code) {
        exitCode = code;
        events.exit.done();
      },
      get exitCode() {
        return exitCode;
      },
      result
    };
  }
  function configureTimeout(flag, event, timeout) {
    if (flag === false) {
      return;
    }
    (flag === true ? event.promise : event.promise.then(() => delay(flag))).then(timeout.done);
  }
  return {
    type: "spawn.after",
    async action(_data, { spawned, close }) {
      const events = createEvents();
      let deferClose = true;
      let quickClose = () => void (deferClose = false);
      spawned.stdout?.on("data", quickClose);
      spawned.stderr?.on("data", quickClose);
      spawned.on("error", quickClose);
      spawned.on("close", (code) => events.close(code));
      spawned.on("exit", (code) => events.exit(code));
      try {
        await events.result;
        if (deferClose) {
          await delay(50);
        }
        close(events.exitCode);
      } catch (err) {
        close(events.exitCode, err);
      }
    }
  };
}
function isBadArgument(arg) {
  return !arg || !/^([a-z]:)?([a-z0-9/.\\_~-]+)$/i.test(arg);
}
function toBinaryConfig(input, allowUnsafe) {
  if (input.length < 1 || input.length > 2) {
    throw new GitPluginError(undefined, "binary", WRONG_NUMBER_ERR);
  }
  const isBad = input.some(isBadArgument);
  if (isBad) {
    if (allowUnsafe) {
      console.warn(WRONG_CHARS_ERR);
    } else {
      throw new GitPluginError(undefined, "binary", WRONG_CHARS_ERR);
    }
  }
  const [binary, prefix] = input;
  return {
    binary,
    prefix
  };
}
function customBinaryPlugin(plugins, input = ["git"], allowUnsafe = false) {
  let config = toBinaryConfig(asArray(input), allowUnsafe);
  plugins.on("binary", (input2) => {
    config = toBinaryConfig(asArray(input2), allowUnsafe);
  });
  plugins.append("spawn.binary", () => {
    return config.binary;
  });
  plugins.append("spawn.args", (data) => {
    return config.prefix ? [config.prefix, ...data] : data;
  });
}
function isTaskError(result) {
  return !!(result.exitCode && result.stdErr.length);
}
function getErrorMessage(result) {
  return Buffer.concat([...result.stdOut, ...result.stdErr]);
}
function errorDetectionHandler(overwrite = false, isError = isTaskError, errorMessage = getErrorMessage) {
  return (error, result) => {
    if (!overwrite && error || !isError(result)) {
      return error;
    }
    return errorMessage(result);
  };
}
function errorDetectionPlugin(config) {
  return {
    type: "task.error",
    action(data, context) {
      const error = config(data.error, {
        stdErr: context.stdErr,
        stdOut: context.stdOut,
        exitCode: context.exitCode
      });
      if (Buffer.isBuffer(error)) {
        return { error: new GitError(undefined, error.toString("utf-8")) };
      }
      return {
        error
      };
    }
  };
}
function progressMonitorPlugin(progress) {
  const progressCommand = "--progress";
  const progressMethods = ["checkout", "clone", "fetch", "pull", "push"];
  const onProgress = {
    type: "spawn.after",
    action(_data, context) {
      if (!context.commands.includes(progressCommand)) {
        return;
      }
      context.spawned.stderr?.on("data", (chunk) => {
        const message = /^([\s\S]+?):\s*(\d+)% \((\d+)\/(\d+)\)/.exec(chunk.toString("utf8"));
        if (!message) {
          return;
        }
        progress({
          method: context.method,
          stage: progressEventStage(message[1]),
          progress: asNumber(message[2]),
          processed: asNumber(message[3]),
          total: asNumber(message[4])
        });
      });
    }
  };
  const onArgs = {
    type: "spawn.args",
    action(args, context) {
      if (!progressMethods.includes(context.method)) {
        return args;
      }
      return including(args, progressCommand);
    }
  };
  return [onArgs, onProgress];
}
function progressEventStage(input) {
  return String(input.toLowerCase().split(" ", 1)) || "unknown";
}
function spawnOptionsPlugin(spawnOptions) {
  const options = pick(spawnOptions, ["uid", "gid"]);
  return {
    type: "spawn.options",
    action(data) {
      return { ...options, ...data };
    }
  };
}
function timeoutPlugin({
  block,
  stdErr = true,
  stdOut = true
}) {
  if (block > 0) {
    return {
      type: "spawn.after",
      action(_data, context) {
        let timeout;
        function wait() {
          timeout && clearTimeout(timeout);
          timeout = setTimeout(kill, block);
        }
        function stop() {
          context.spawned.stdout?.off("data", wait);
          context.spawned.stderr?.off("data", wait);
          context.spawned.off("exit", stop);
          context.spawned.off("close", stop);
          timeout && clearTimeout(timeout);
        }
        function kill() {
          stop();
          context.kill(new GitPluginError(undefined, "timeout", `block timeout reached`));
        }
        stdOut && context.spawned.stdout?.on("data", wait);
        stdErr && context.spawned.stderr?.on("data", wait);
        context.spawned.on("exit", stop);
        context.spawned.on("close", stop);
        wait();
      }
    };
  }
}
function suffixPathsPlugin() {
  return {
    type: "spawn.args",
    action(data) {
      const prefix = [];
      let suffix;
      function append2(args) {
        (suffix = suffix || []).push(...args);
      }
      for (let i2 = 0;i2 < data.length; i2++) {
        const param = data[i2];
        if (r(param)) {
          append2(o(param));
          continue;
        }
        if (param === "--") {
          append2(data.slice(i2 + 1).flatMap((item) => r(item) && o(item) || item));
          break;
        }
        prefix.push(param);
      }
      return !suffix ? prefix : [...prefix, "--", ...suffix.map(String)];
    }
  };
}
function gitInstanceFactory(baseDir, options) {
  const plugins = new PluginStore;
  const config = createInstanceConfig(baseDir && (typeof baseDir === "string" ? { baseDir } : baseDir) || {}, options);
  if (!folderExists(config.baseDir)) {
    throw new GitConstructError(config, `Cannot use simple-git on a directory that does not exist`);
  }
  if (Array.isArray(config.config)) {
    plugins.add(commandConfigPrefixingPlugin(config.config));
  }
  plugins.add(blockUnsafeOperationsPlugin(config.unsafe));
  plugins.add(completionDetectionPlugin(config.completion));
  config.abort && plugins.add(abortPlugin(config.abort));
  config.progress && plugins.add(progressMonitorPlugin(config.progress));
  config.timeout && plugins.add(timeoutPlugin(config.timeout));
  config.spawnOptions && plugins.add(spawnOptionsPlugin(config.spawnOptions));
  plugins.add(suffixPathsPlugin());
  plugins.add(errorDetectionPlugin(errorDetectionHandler(true)));
  config.errors && plugins.add(errorDetectionPlugin(config.errors));
  customBinaryPlugin(plugins, config.binary, config.unsafe?.allowUnsafeCustomBinary);
  return new Git(config, plugins);
}
var import_file_exists, import_debug, import_promise_deferred, import_promise_deferred2, __defProp2, __getOwnPropDesc, __getOwnPropNames2, __hasOwnProp2, __esm2 = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames2(fn)[0]])(fn = 0)), res;
}, __commonJS2 = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames2(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
}, __export2 = (target, all) => {
  for (var name in all)
    __defProp2(target, name, { get: all[name], enumerable: true });
}, __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames2(from))
      if (!__hasOwnProp2.call(to, key) && key !== except)
        __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
}, __toCommonJS = (mod) => __copyProps(__defProp2({}, "__esModule", { value: true }), mod), GitError, init_git_error, GitResponseError, init_git_response_error, TaskConfigurationError, init_task_configuration_error, NULL, NOOP, objectToString, init_util, filterArray, filterNumber, filterString, filterStringOrStringArray, filterHasLength, init_argument_filters, ExitCodes, init_exit_codes, GitOutputStreams, init_git_output_streams, LineParser, RemoteLineParser, init_line_parser, defaultOptions, init_simple_git_options, init_task_options, init_task_parser, utils_exports, init_utils, check_is_repo_exports, CheckRepoActions, onError, parser, init_check_is_repo, CleanResponse, removalRegexp, dryRunRemovalRegexp, isFolderRegexp, init_CleanSummary, task_exports, EMPTY_COMMANDS, init_task, clean_exports, CONFIG_ERROR_INTERACTIVE_MODE, CONFIG_ERROR_MODE_REQUIRED, CONFIG_ERROR_UNKNOWN_OPTION, CleanOptions, CleanOptionValues, init_clean, ConfigList, init_ConfigList, GitConfigScope, init_config, DiffNameStatus, diffNameStatus, init_diff_name_status, disallowedOptions, Query, _a, GrepQuery, init_grep, reset_exports, ResetMode, validResetModes, init_reset, init_git_logger, TasksPendingQueue, init_tasks_pending_queue, GitExecutorChain, init_git_executor_chain, git_executor_exports, GitExecutor, init_git_executor, init_task_callback, init_change_working_directory, init_checkout, parser2, init_count_objects, parsers, init_parse_commit, init_commit, init_first_commit, init_hash_object, InitSummary, initResponseRegex, reInitResponseRegex, init_InitSummary, bareCommand, init_init, logFormatRegex, init_log_format, DiffSummary, init_DiffSummary, statParser, numStatParser, nameOnlyParser, nameStatusParser, diffSummaryParsers, init_parse_diff_summary, START_BOUNDARY, COMMIT_BOUNDARY, SPLITTER, defaultFieldNames, init_parse_list_log_summary, diff_exports, init_diff, excludeOptions, init_log, MergeSummaryConflict, MergeSummaryDetail, init_MergeSummary, PullSummary, PullFailedSummary, init_PullSummary, remoteMessagesObjectParsers, init_parse_remote_objects, parsers2, RemoteMessageSummary, init_parse_remote_messages, FILE_UPDATE_REGEX, SUMMARY_REGEX, ACTION_REGEX, parsers3, errorParsers, parsePullDetail, parsePullResult, init_parse_pull, parsers4, parseMergeResult, parseMergeDetail, init_parse_merge, init_merge, parsers5, parsePushResult, parsePushDetail, init_parse_push, push_exports, init_push, init_show, fromPathRegex, FileStatusSummary, init_FileStatusSummary, StatusSummary, parsers6, parseStatusSummary, init_StatusSummary, ignoredOptions, init_status, NOT_INSTALLED, parsers7, init_version, cloneTask, cloneMirrorTask, init_clone, simple_git_api_exports, SimpleGitApi, init_simple_git_api, scheduler_exports, createScheduledTask, Scheduler, init_scheduler, apply_patch_exports, init_apply_patch, BranchDeletionBatch, init_BranchDeleteSummary, deleteSuccessRegex, deleteErrorRegex, parsers8, parseBranchDeletions, init_parse_branch_delete, BranchSummaryResult, init_BranchSummary, parsers9, currentBranchParser, init_parse_branch, branch_exports, init_branch, parseCheckIgnore, init_CheckIgnore, check_ignore_exports, init_check_ignore, parsers10, init_parse_fetch, fetch_exports, init_fetch, parsers11, init_parse_move, move_exports, init_move, pull_exports, init_pull, init_GetRemoteSummary, remote_exports, init_remote, stash_list_exports, init_stash_list, sub_module_exports, init_sub_module, TagList, parseTagList, init_TagList, tag_exports, init_tag, require_git, GitConstructError, GitPluginError, never, WRONG_NUMBER_ERR = `Invalid value supplied for custom binary, requires a single string or an array containing either one or two strings`, WRONG_CHARS_ERR = `Invalid value supplied for custom binary, restricted characters must be removed or supply the unsafe.allowUnsafeCustomBinary option`, PluginStore = class {
  constructor() {
    this.plugins = /* @__PURE__ */ new Set;
    this.events = new EventEmitter;
  }
  on(type, listener) {
    this.events.on(type, listener);
  }
  reconfigure(type, data) {
    this.events.emit(type, data);
  }
  append(type, action) {
    const plugin = append(this.plugins, { type, action });
    return () => this.plugins.delete(plugin);
  }
  add(plugin) {
    const plugins = [];
    asArray(plugin).forEach((plugin2) => plugin2 && this.plugins.add(append(plugins, plugin2)));
    return () => {
      plugins.forEach((plugin2) => this.plugins.delete(plugin2));
    };
  }
  exec(type, data, context) {
    let output = data;
    const contextual = Object.freeze(Object.create(context));
    for (const plugin of this.plugins) {
      if (plugin.type === type) {
        output = plugin.action(output, contextual);
      }
    }
    return output;
  }
}, Git, simpleGit;
var init_esm = __esm(() => {
  init_dist();
  init_dist();
  init_dist();
  init_dist();
  init_dist();
  init_dist2();
  init_dist();
  import_file_exists = __toESM(require_dist(), 1);
  import_debug = __toESM(require_src(), 1);
  import_promise_deferred = __toESM(require_dist2(), 1);
  import_promise_deferred2 = __toESM(require_dist2(), 1);
  __defProp2 = Object.defineProperty;
  __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  __getOwnPropNames2 = Object.getOwnPropertyNames;
  __hasOwnProp2 = Object.prototype.hasOwnProperty;
  init_git_error = __esm2({
    "src/lib/errors/git-error.ts"() {
      GitError = class extends Error {
        constructor(task, message) {
          super(message);
          this.task = task;
          Object.setPrototypeOf(this, new.target.prototype);
        }
      };
    }
  });
  init_git_response_error = __esm2({
    "src/lib/errors/git-response-error.ts"() {
      init_git_error();
      GitResponseError = class extends GitError {
        constructor(git, message) {
          super(undefined, message || String(git));
          this.git = git;
        }
      };
    }
  });
  init_task_configuration_error = __esm2({
    "src/lib/errors/task-configuration-error.ts"() {
      init_git_error();
      TaskConfigurationError = class extends GitError {
        constructor(message) {
          super(undefined, message);
        }
      };
    }
  });
  init_util = __esm2({
    "src/lib/utils/util.ts"() {
      init_argument_filters();
      NULL = "\x00";
      NOOP = () => {};
      objectToString = Object.prototype.toString.call.bind(Object.prototype.toString);
    }
  });
  init_argument_filters = __esm2({
    "src/lib/utils/argument-filters.ts"() {
      init_util();
      filterArray = (input) => {
        return Array.isArray(input);
      };
      filterNumber = (input) => {
        return typeof input === "number";
      };
      filterString = (input) => {
        return typeof input === "string" || r(input);
      };
      filterStringOrStringArray = (input) => {
        return filterString(input) || Array.isArray(input) && input.every(filterString);
      };
      filterHasLength = (input) => {
        if (input == null || "number|boolean|function".includes(typeof input)) {
          return false;
        }
        return typeof input.length === "number";
      };
    }
  });
  init_exit_codes = __esm2({
    "src/lib/utils/exit-codes.ts"() {
      ExitCodes = /* @__PURE__ */ ((ExitCodes2) => {
        ExitCodes2[ExitCodes2["SUCCESS"] = 0] = "SUCCESS";
        ExitCodes2[ExitCodes2["ERROR"] = 1] = "ERROR";
        ExitCodes2[ExitCodes2["NOT_FOUND"] = -2] = "NOT_FOUND";
        ExitCodes2[ExitCodes2["UNCLEAN"] = 128] = "UNCLEAN";
        return ExitCodes2;
      })(ExitCodes || {});
    }
  });
  init_git_output_streams = __esm2({
    "src/lib/utils/git-output-streams.ts"() {
      GitOutputStreams = class _GitOutputStreams {
        constructor(stdOut, stdErr) {
          this.stdOut = stdOut;
          this.stdErr = stdErr;
        }
        asStrings() {
          return new _GitOutputStreams(this.stdOut.toString("utf8"), this.stdErr.toString("utf8"));
        }
      };
    }
  });
  init_line_parser = __esm2({
    "src/lib/utils/line-parser.ts"() {
      LineParser = class {
        constructor(regExp, useMatches) {
          this.matches = [];
          this.useMatches = useMatchesDefault;
          this.parse = (line, target) => {
            this.resetMatches();
            if (!this._regExp.every((reg, index) => this.addMatch(reg, index, line(index)))) {
              return false;
            }
            return this.useMatches(target, this.prepareMatches()) !== false;
          };
          this._regExp = Array.isArray(regExp) ? regExp : [regExp];
          if (useMatches) {
            this.useMatches = useMatches;
          }
        }
        resetMatches() {
          this.matches.length = 0;
        }
        prepareMatches() {
          return this.matches;
        }
        addMatch(reg, index, line) {
          const matched = line && reg.exec(line);
          if (matched) {
            this.pushMatch(index, matched);
          }
          return !!matched;
        }
        pushMatch(_index, matched) {
          this.matches.push(...matched.slice(1));
        }
      };
      RemoteLineParser = class extends LineParser {
        addMatch(reg, index, line) {
          return /^remote:\s/.test(String(line)) && super.addMatch(reg, index, line);
        }
        pushMatch(index, matched) {
          if (index > 0 || matched.length > 1) {
            super.pushMatch(index, matched);
          }
        }
      };
    }
  });
  init_simple_git_options = __esm2({
    "src/lib/utils/simple-git-options.ts"() {
      defaultOptions = {
        binary: "git",
        maxConcurrentProcesses: 5,
        config: [],
        trimmed: false
      };
    }
  });
  init_task_options = __esm2({
    "src/lib/utils/task-options.ts"() {
      init_argument_filters();
      init_util();
    }
  });
  init_task_parser = __esm2({
    "src/lib/utils/task-parser.ts"() {
      init_util();
    }
  });
  utils_exports = {};
  __export2(utils_exports, {
    ExitCodes: () => ExitCodes,
    GitOutputStreams: () => GitOutputStreams,
    LineParser: () => LineParser,
    NOOP: () => NOOP,
    NULL: () => NULL,
    RemoteLineParser: () => RemoteLineParser,
    append: () => append,
    appendTaskOptions: () => appendTaskOptions,
    asArray: () => asArray,
    asCamelCase: () => asCamelCase,
    asFunction: () => asFunction,
    asNumber: () => asNumber,
    asStringArray: () => asStringArray,
    bufferToString: () => bufferToString,
    callTaskParser: () => callTaskParser,
    createInstanceConfig: () => createInstanceConfig,
    delay: () => delay,
    filterArray: () => filterArray,
    filterFunction: () => filterFunction,
    filterHasLength: () => filterHasLength,
    filterNumber: () => filterNumber,
    filterPlainObject: () => filterPlainObject,
    filterPrimitives: () => filterPrimitives,
    filterString: () => filterString,
    filterStringOrStringArray: () => filterStringOrStringArray,
    filterType: () => filterType,
    first: () => first,
    folderExists: () => folderExists,
    forEachLineWithContent: () => forEachLineWithContent,
    getTrailingOptions: () => getTrailingOptions,
    including: () => including,
    isUserFunction: () => isUserFunction,
    last: () => last,
    objectToString: () => objectToString,
    orVoid: () => orVoid,
    parseStringResponse: () => parseStringResponse,
    pick: () => pick,
    prefixedArray: () => prefixedArray,
    remove: () => remove,
    splitOn: () => splitOn,
    toLinesWithContent: () => toLinesWithContent,
    trailingFunctionArgument: () => trailingFunctionArgument,
    trailingOptionsArgument: () => trailingOptionsArgument
  });
  init_utils = __esm2({
    "src/lib/utils/index.ts"() {
      init_argument_filters();
      init_exit_codes();
      init_git_output_streams();
      init_line_parser();
      init_simple_git_options();
      init_task_options();
      init_task_parser();
      init_util();
    }
  });
  check_is_repo_exports = {};
  __export2(check_is_repo_exports, {
    CheckRepoActions: () => CheckRepoActions,
    checkIsBareRepoTask: () => checkIsBareRepoTask,
    checkIsRepoRootTask: () => checkIsRepoRootTask,
    checkIsRepoTask: () => checkIsRepoTask
  });
  init_check_is_repo = __esm2({
    "src/lib/tasks/check-is-repo.ts"() {
      init_utils();
      CheckRepoActions = /* @__PURE__ */ ((CheckRepoActions2) => {
        CheckRepoActions2["BARE"] = "bare";
        CheckRepoActions2["IN_TREE"] = "tree";
        CheckRepoActions2["IS_REPO_ROOT"] = "root";
        return CheckRepoActions2;
      })(CheckRepoActions || {});
      onError = ({ exitCode }, error, done, fail) => {
        if (exitCode === 128 && isNotRepoMessage(error)) {
          return done(Buffer.from("false"));
        }
        fail(error);
      };
      parser = (text) => {
        return text.trim() === "true";
      };
    }
  });
  init_CleanSummary = __esm2({
    "src/lib/responses/CleanSummary.ts"() {
      init_utils();
      CleanResponse = class {
        constructor(dryRun) {
          this.dryRun = dryRun;
          this.paths = [];
          this.files = [];
          this.folders = [];
        }
      };
      removalRegexp = /^[a-z]+\s*/i;
      dryRunRemovalRegexp = /^[a-z]+\s+[a-z]+\s*/i;
      isFolderRegexp = /\/$/;
    }
  });
  task_exports = {};
  __export2(task_exports, {
    EMPTY_COMMANDS: () => EMPTY_COMMANDS,
    adhocExecTask: () => adhocExecTask,
    configurationErrorTask: () => configurationErrorTask,
    isBufferTask: () => isBufferTask,
    isEmptyTask: () => isEmptyTask,
    straightThroughBufferTask: () => straightThroughBufferTask,
    straightThroughStringTask: () => straightThroughStringTask
  });
  init_task = __esm2({
    "src/lib/tasks/task.ts"() {
      init_task_configuration_error();
      EMPTY_COMMANDS = [];
    }
  });
  clean_exports = {};
  __export2(clean_exports, {
    CONFIG_ERROR_INTERACTIVE_MODE: () => CONFIG_ERROR_INTERACTIVE_MODE,
    CONFIG_ERROR_MODE_REQUIRED: () => CONFIG_ERROR_MODE_REQUIRED,
    CONFIG_ERROR_UNKNOWN_OPTION: () => CONFIG_ERROR_UNKNOWN_OPTION,
    CleanOptions: () => CleanOptions,
    cleanTask: () => cleanTask,
    cleanWithOptionsTask: () => cleanWithOptionsTask,
    isCleanOptionsArray: () => isCleanOptionsArray
  });
  init_clean = __esm2({
    "src/lib/tasks/clean.ts"() {
      init_CleanSummary();
      init_utils();
      init_task();
      CONFIG_ERROR_INTERACTIVE_MODE = "Git clean interactive mode is not supported";
      CONFIG_ERROR_MODE_REQUIRED = 'Git clean mode parameter ("n" or "f") is required';
      CONFIG_ERROR_UNKNOWN_OPTION = "Git clean unknown option found in: ";
      CleanOptions = /* @__PURE__ */ ((CleanOptions2) => {
        CleanOptions2["DRY_RUN"] = "n";
        CleanOptions2["FORCE"] = "f";
        CleanOptions2["IGNORED_INCLUDED"] = "x";
        CleanOptions2["IGNORED_ONLY"] = "X";
        CleanOptions2["EXCLUDING"] = "e";
        CleanOptions2["QUIET"] = "q";
        CleanOptions2["RECURSIVE"] = "d";
        return CleanOptions2;
      })(CleanOptions || {});
      CleanOptionValues = /* @__PURE__ */ new Set([
        "i",
        ...asStringArray(Object.values(CleanOptions))
      ]);
    }
  });
  init_ConfigList = __esm2({
    "src/lib/responses/ConfigList.ts"() {
      init_utils();
      ConfigList = class {
        constructor() {
          this.files = [];
          this.values = /* @__PURE__ */ Object.create(null);
        }
        get all() {
          if (!this._all) {
            this._all = this.files.reduce((all, file) => {
              return Object.assign(all, this.values[file]);
            }, {});
          }
          return this._all;
        }
        addFile(file) {
          if (!(file in this.values)) {
            const latest = last(this.files);
            this.values[file] = latest ? Object.create(this.values[latest]) : {};
            this.files.push(file);
          }
          return this.values[file];
        }
        addValue(file, key, value) {
          const values = this.addFile(file);
          if (!Object.hasOwn(values, key)) {
            values[key] = value;
          } else if (Array.isArray(values[key])) {
            values[key].push(value);
          } else {
            values[key] = [values[key], value];
          }
          this._all = undefined;
        }
      };
    }
  });
  init_config = __esm2({
    "src/lib/tasks/config.ts"() {
      init_ConfigList();
      init_utils();
      GitConfigScope = /* @__PURE__ */ ((GitConfigScope2) => {
        GitConfigScope2["system"] = "system";
        GitConfigScope2["global"] = "global";
        GitConfigScope2["local"] = "local";
        GitConfigScope2["worktree"] = "worktree";
        return GitConfigScope2;
      })(GitConfigScope || {});
    }
  });
  init_diff_name_status = __esm2({
    "src/lib/tasks/diff-name-status.ts"() {
      DiffNameStatus = /* @__PURE__ */ ((DiffNameStatus2) => {
        DiffNameStatus2["ADDED"] = "A";
        DiffNameStatus2["COPIED"] = "C";
        DiffNameStatus2["DELETED"] = "D";
        DiffNameStatus2["MODIFIED"] = "M";
        DiffNameStatus2["RENAMED"] = "R";
        DiffNameStatus2["CHANGED"] = "T";
        DiffNameStatus2["UNMERGED"] = "U";
        DiffNameStatus2["UNKNOWN"] = "X";
        DiffNameStatus2["BROKEN"] = "B";
        return DiffNameStatus2;
      })(DiffNameStatus || {});
      diffNameStatus = new Set(Object.values(DiffNameStatus));
    }
  });
  init_grep = __esm2({
    "src/lib/tasks/grep.ts"() {
      init_utils();
      init_task();
      disallowedOptions = ["-h"];
      Query = Symbol("grepQuery");
      GrepQuery = class {
        constructor() {
          this[_a] = [];
        }
        *[(_a = Query, Symbol.iterator)]() {
          for (const query of this[Query]) {
            yield query;
          }
        }
        and(...and) {
          and.length && this[Query].push("--and", "(", ...prefixedArray(and, "-e"), ")");
          return this;
        }
        param(...param) {
          this[Query].push(...prefixedArray(param, "-e"));
          return this;
        }
      };
    }
  });
  reset_exports = {};
  __export2(reset_exports, {
    ResetMode: () => ResetMode,
    getResetMode: () => getResetMode,
    resetTask: () => resetTask
  });
  init_reset = __esm2({
    "src/lib/tasks/reset.ts"() {
      init_utils();
      init_task();
      ResetMode = /* @__PURE__ */ ((ResetMode2) => {
        ResetMode2["MIXED"] = "mixed";
        ResetMode2["SOFT"] = "soft";
        ResetMode2["HARD"] = "hard";
        ResetMode2["MERGE"] = "merge";
        ResetMode2["KEEP"] = "keep";
        return ResetMode2;
      })(ResetMode || {});
      validResetModes = asStringArray(Object.values(ResetMode));
    }
  });
  init_git_logger = __esm2({
    "src/lib/git-logger.ts"() {
      init_utils();
      import_debug.default.formatters.L = (value) => String(filterHasLength(value) ? value.length : "-");
      import_debug.default.formatters.B = (value) => {
        if (Buffer.isBuffer(value)) {
          return value.toString("utf8");
        }
        return objectToString(value);
      };
    }
  });
  init_tasks_pending_queue = __esm2({
    "src/lib/runners/tasks-pending-queue.ts"() {
      init_git_error();
      init_git_logger();
      TasksPendingQueue = class _TasksPendingQueue {
        constructor(logLabel = "GitExecutor") {
          this.logLabel = logLabel;
          this._queue = /* @__PURE__ */ new Map;
        }
        withProgress(task) {
          return this._queue.get(task);
        }
        createProgress(task) {
          const name = _TasksPendingQueue.getName(task.commands[0]);
          const logger = createLogger(this.logLabel, name);
          return {
            task,
            logger,
            name
          };
        }
        push(task) {
          const progress = this.createProgress(task);
          progress.logger("Adding task to the queue, commands = %o", task.commands);
          this._queue.set(task, progress);
          return progress;
        }
        fatal(err) {
          for (const [task, { logger }] of Array.from(this._queue.entries())) {
            if (task === err.task) {
              logger.info(`Failed %o`, err);
              logger(`Fatal exception, any as-yet un-started tasks run through this executor will not be attempted`);
            } else {
              logger.info(`A fatal exception occurred in a previous task, the queue has been purged: %o`, err.message);
            }
            this.complete(task);
          }
          if (this._queue.size !== 0) {
            throw new Error(`Queue size should be zero after fatal: ${this._queue.size}`);
          }
        }
        complete(task) {
          const progress = this.withProgress(task);
          if (progress) {
            this._queue.delete(task);
          }
        }
        attempt(task) {
          const progress = this.withProgress(task);
          if (!progress) {
            throw new GitError(undefined, "TasksPendingQueue: attempt called for an unknown task");
          }
          progress.logger("Starting task");
          return progress;
        }
        static getName(name = "empty") {
          return `task:${name}:${++_TasksPendingQueue.counter}`;
        }
        static {
          this.counter = 0;
        }
      };
    }
  });
  init_git_executor_chain = __esm2({
    "src/lib/runners/git-executor-chain.ts"() {
      init_git_error();
      init_task();
      init_utils();
      init_tasks_pending_queue();
      GitExecutorChain = class {
        constructor(_executor, _scheduler, _plugins) {
          this._executor = _executor;
          this._scheduler = _scheduler;
          this._plugins = _plugins;
          this._chain = Promise.resolve();
          this._queue = new TasksPendingQueue;
        }
        get cwd() {
          return this._cwd || this._executor.cwd;
        }
        set cwd(cwd) {
          this._cwd = cwd;
        }
        get env() {
          return this._executor.env;
        }
        get outputHandler() {
          return this._executor.outputHandler;
        }
        chain() {
          return this;
        }
        push(task) {
          this._queue.push(task);
          return this._chain = this._chain.then(() => this.attemptTask(task));
        }
        async attemptTask(task) {
          const onScheduleComplete = await this._scheduler.next();
          const onQueueComplete = () => this._queue.complete(task);
          try {
            const { logger } = this._queue.attempt(task);
            return await (isEmptyTask(task) ? this.attemptEmptyTask(task, logger) : this.attemptRemoteTask(task, logger));
          } catch (e) {
            throw this.onFatalException(task, e);
          } finally {
            onQueueComplete();
            onScheduleComplete();
          }
        }
        onFatalException(task, e) {
          const gitError = e instanceof GitError ? Object.assign(e, { task }) : new GitError(task, e && String(e));
          this._chain = Promise.resolve();
          this._queue.fatal(gitError);
          return gitError;
        }
        async attemptRemoteTask(task, logger) {
          const binary = this._plugins.exec("spawn.binary", "", pluginContext(task, task.commands));
          const args = this._plugins.exec("spawn.args", [...task.commands], {
            ...pluginContext(task, task.commands),
            env: { ...this.env }
          });
          const raw = await this.gitResponse(task, binary, args, this.outputHandler, logger.step("SPAWN"));
          const outputStreams = await this.handleTaskData(task, args, raw, logger.step("HANDLE"));
          logger(`passing response to task's parser as a %s`, task.format);
          if (isBufferTask(task)) {
            return callTaskParser(task.parser, outputStreams);
          }
          return callTaskParser(task.parser, outputStreams.asStrings());
        }
        async attemptEmptyTask(task, logger) {
          logger(`empty task bypassing child process to call to task's parser`);
          return task.parser(this);
        }
        handleTaskData(task, args, result, logger) {
          const { exitCode, rejection, stdOut, stdErr } = result;
          return new Promise((done, fail) => {
            logger(`Preparing to handle process response exitCode=%d stdOut=`, exitCode);
            const { error } = this._plugins.exec("task.error", { error: rejection }, {
              ...pluginContext(task, args),
              ...result
            });
            if (error && task.onError) {
              logger.info(`exitCode=%s handling with custom error handler`);
              return task.onError(result, error, (newStdOut) => {
                logger.info(`custom error handler treated as success`);
                logger(`custom error returned a %s`, objectToString(newStdOut));
                done(new GitOutputStreams(Array.isArray(newStdOut) ? Buffer.concat(newStdOut) : newStdOut, Buffer.concat(stdErr)));
              }, fail);
            }
            if (error) {
              logger.info(`handling as error: exitCode=%s stdErr=%s rejection=%o`, exitCode, stdErr.length, rejection);
              return fail(error);
            }
            logger.info(`retrieving task output complete`);
            done(new GitOutputStreams(Buffer.concat(stdOut), Buffer.concat(stdErr)));
          });
        }
        async gitResponse(task, command, args, outputHandler, logger) {
          const outputLogger = logger.sibling("output");
          const spawnOptions = this._plugins.exec("spawn.options", {
            cwd: this.cwd,
            env: this.env,
            windowsHide: true
          }, pluginContext(task, task.commands));
          return new Promise((done) => {
            const stdOut = [];
            const stdErr = [];
            logger.info(`%s %o`, command, args);
            logger("%O", spawnOptions);
            let rejection = this._beforeSpawn(task, args);
            if (rejection) {
              return done({
                stdOut,
                stdErr,
                exitCode: 9901,
                rejection
              });
            }
            this._plugins.exec("spawn.before", undefined, {
              ...pluginContext(task, args),
              kill(reason) {
                rejection = reason || rejection;
              }
            });
            const spawned = spawn(command, args, spawnOptions);
            spawned.stdout.on("data", onDataReceived(stdOut, "stdOut", logger, outputLogger.step("stdOut")));
            spawned.stderr.on("data", onDataReceived(stdErr, "stdErr", logger, outputLogger.step("stdErr")));
            spawned.on("error", onErrorReceived(stdErr, logger));
            if (outputHandler) {
              logger(`Passing child process stdOut/stdErr to custom outputHandler`);
              outputHandler(command, spawned.stdout, spawned.stderr, [...args]);
            }
            this._plugins.exec("spawn.after", undefined, {
              ...pluginContext(task, args),
              spawned,
              close(exitCode, reason) {
                done({
                  stdOut,
                  stdErr,
                  exitCode,
                  rejection: rejection || reason
                });
              },
              kill(reason) {
                if (spawned.killed) {
                  return;
                }
                rejection = reason;
                spawned.kill("SIGINT");
              }
            });
          });
        }
        _beforeSpawn(task, args) {
          let rejection;
          this._plugins.exec("spawn.before", undefined, {
            ...pluginContext(task, args),
            kill(reason) {
              rejection = reason || rejection;
            }
          });
          return rejection;
        }
      };
    }
  });
  git_executor_exports = {};
  __export2(git_executor_exports, {
    GitExecutor: () => GitExecutor
  });
  init_git_executor = __esm2({
    "src/lib/runners/git-executor.ts"() {
      init_git_executor_chain();
      GitExecutor = class {
        constructor(cwd, _scheduler, _plugins) {
          this.cwd = cwd;
          this._scheduler = _scheduler;
          this._plugins = _plugins;
          this._chain = new GitExecutorChain(this, this._scheduler, this._plugins);
        }
        chain() {
          return new GitExecutorChain(this, this._scheduler, this._plugins);
        }
        push(task) {
          return this._chain.push(task);
        }
      };
    }
  });
  init_task_callback = __esm2({
    "src/lib/task-callback.ts"() {
      init_git_response_error();
      init_utils();
    }
  });
  init_change_working_directory = __esm2({
    "src/lib/tasks/change-working-directory.ts"() {
      init_utils();
      init_task();
    }
  });
  init_checkout = __esm2({
    "src/lib/tasks/checkout.ts"() {
      init_utils();
      init_task();
    }
  });
  init_count_objects = __esm2({
    "src/lib/tasks/count-objects.ts"() {
      init_utils();
      parser2 = new LineParser(/([a-z-]+): (\d+)$/, (result, [key, value]) => {
        const property = asCamelCase(key);
        if (Object.hasOwn(result, property)) {
          result[property] = asNumber(value);
        }
      });
    }
  });
  init_parse_commit = __esm2({
    "src/lib/parsers/parse-commit.ts"() {
      init_utils();
      parsers = [
        new LineParser(/^\[([^\s]+)( \([^)]+\))? ([^\]]+)/, (result, [branch, root, commit]) => {
          result.branch = branch;
          result.commit = commit;
          result.root = !!root;
        }),
        new LineParser(/\s*Author:\s(.+)/i, (result, [author]) => {
          const parts = author.split("<");
          const email = parts.pop();
          if (!email || !email.includes("@")) {
            return;
          }
          result.author = {
            email: email.substr(0, email.length - 1),
            name: parts.join("<").trim()
          };
        }),
        new LineParser(/(\d+)[^,]*(?:,\s*(\d+)[^,]*)(?:,\s*(\d+))/g, (result, [changes, insertions, deletions]) => {
          result.summary.changes = parseInt(changes, 10) || 0;
          result.summary.insertions = parseInt(insertions, 10) || 0;
          result.summary.deletions = parseInt(deletions, 10) || 0;
        }),
        new LineParser(/^(\d+)[^,]*(?:,\s*(\d+)[^(]+\(([+-]))?/, (result, [changes, lines, direction]) => {
          result.summary.changes = parseInt(changes, 10) || 0;
          const count = parseInt(lines, 10) || 0;
          if (direction === "-") {
            result.summary.deletions = count;
          } else if (direction === "+") {
            result.summary.insertions = count;
          }
        })
      ];
    }
  });
  init_commit = __esm2({
    "src/lib/tasks/commit.ts"() {
      init_parse_commit();
      init_utils();
      init_task();
    }
  });
  init_first_commit = __esm2({
    "src/lib/tasks/first-commit.ts"() {
      init_utils();
      init_task();
    }
  });
  init_hash_object = __esm2({
    "src/lib/tasks/hash-object.ts"() {
      init_task();
    }
  });
  init_InitSummary = __esm2({
    "src/lib/responses/InitSummary.ts"() {
      InitSummary = class {
        constructor(bare, path, existing, gitDir) {
          this.bare = bare;
          this.path = path;
          this.existing = existing;
          this.gitDir = gitDir;
        }
      };
      initResponseRegex = /^Init.+ repository in (.+)$/;
      reInitResponseRegex = /^Rein.+ in (.+)$/;
    }
  });
  init_init = __esm2({
    "src/lib/tasks/init.ts"() {
      init_InitSummary();
      bareCommand = "--bare";
    }
  });
  init_log_format = __esm2({
    "src/lib/args/log-format.ts"() {
      logFormatRegex = /^--(stat|numstat|name-only|name-status)(=|$)/;
    }
  });
  init_DiffSummary = __esm2({
    "src/lib/responses/DiffSummary.ts"() {
      DiffSummary = class {
        constructor() {
          this.changed = 0;
          this.deletions = 0;
          this.insertions = 0;
          this.files = [];
        }
      };
    }
  });
  init_parse_diff_summary = __esm2({
    "src/lib/parsers/parse-diff-summary.ts"() {
      init_log_format();
      init_DiffSummary();
      init_diff_name_status();
      init_utils();
      statParser = [
        new LineParser(/^(.+)\s+\|\s+(\d+)(\s+[+\-]+)?$/, (result, [file, changes, alterations = ""]) => {
          result.files.push({
            file: file.trim(),
            changes: asNumber(changes),
            insertions: alterations.replace(/[^+]/g, "").length,
            deletions: alterations.replace(/[^-]/g, "").length,
            binary: false
          });
        }),
        new LineParser(/^(.+) \|\s+Bin ([0-9.]+) -> ([0-9.]+) ([a-z]+)/, (result, [file, before, after]) => {
          result.files.push({
            file: file.trim(),
            before: asNumber(before),
            after: asNumber(after),
            binary: true
          });
        }),
        new LineParser(/(\d+) files? changed\s*((?:, \d+ [^,]+){0,2})/, (result, [changed, summary]) => {
          const inserted = /(\d+) i/.exec(summary);
          const deleted = /(\d+) d/.exec(summary);
          result.changed = asNumber(changed);
          result.insertions = asNumber(inserted?.[1]);
          result.deletions = asNumber(deleted?.[1]);
        })
      ];
      numStatParser = [
        new LineParser(/(\d+)\t(\d+)\t(.+)$/, (result, [changesInsert, changesDelete, file]) => {
          const insertions = asNumber(changesInsert);
          const deletions = asNumber(changesDelete);
          result.changed++;
          result.insertions += insertions;
          result.deletions += deletions;
          result.files.push({
            file,
            changes: insertions + deletions,
            insertions,
            deletions,
            binary: false
          });
        }),
        new LineParser(/-\t-\t(.+)$/, (result, [file]) => {
          result.changed++;
          result.files.push({
            file,
            after: 0,
            before: 0,
            binary: true
          });
        })
      ];
      nameOnlyParser = [
        new LineParser(/(.+)$/, (result, [file]) => {
          result.changed++;
          result.files.push({
            file,
            changes: 0,
            insertions: 0,
            deletions: 0,
            binary: false
          });
        })
      ];
      nameStatusParser = [
        new LineParser(/([ACDMRTUXB])([0-9]{0,3})\t(.[^\t]*)(\t(.[^\t]*))?$/, (result, [status, similarity, from, _to, to]) => {
          result.changed++;
          result.files.push({
            file: to ?? from,
            changes: 0,
            insertions: 0,
            deletions: 0,
            binary: false,
            status: orVoid(isDiffNameStatus(status) && status),
            from: orVoid(!!to && from !== to && from),
            similarity: asNumber(similarity)
          });
        })
      ];
      diffSummaryParsers = {
        [""]: statParser,
        ["--stat"]: statParser,
        ["--numstat"]: numStatParser,
        ["--name-status"]: nameStatusParser,
        ["--name-only"]: nameOnlyParser
      };
    }
  });
  init_parse_list_log_summary = __esm2({
    "src/lib/parsers/parse-list-log-summary.ts"() {
      init_utils();
      init_parse_diff_summary();
      init_log_format();
      START_BOUNDARY = "òòòòòò ";
      COMMIT_BOUNDARY = " òò";
      SPLITTER = " ò ";
      defaultFieldNames = ["hash", "date", "message", "refs", "author_name", "author_email"];
    }
  });
  diff_exports = {};
  __export2(diff_exports, {
    diffSummaryTask: () => diffSummaryTask,
    validateLogFormatConfig: () => validateLogFormatConfig
  });
  init_diff = __esm2({
    "src/lib/tasks/diff.ts"() {
      init_log_format();
      init_parse_diff_summary();
      init_task();
    }
  });
  init_log = __esm2({
    "src/lib/tasks/log.ts"() {
      init_log_format();
      init_parse_list_log_summary();
      init_utils();
      init_task();
      init_diff();
      excludeOptions = /* @__PURE__ */ ((excludeOptions2) => {
        excludeOptions2[excludeOptions2["--pretty"] = 0] = "--pretty";
        excludeOptions2[excludeOptions2["max-count"] = 1] = "max-count";
        excludeOptions2[excludeOptions2["maxCount"] = 2] = "maxCount";
        excludeOptions2[excludeOptions2["n"] = 3] = "n";
        excludeOptions2[excludeOptions2["file"] = 4] = "file";
        excludeOptions2[excludeOptions2["format"] = 5] = "format";
        excludeOptions2[excludeOptions2["from"] = 6] = "from";
        excludeOptions2[excludeOptions2["to"] = 7] = "to";
        excludeOptions2[excludeOptions2["splitter"] = 8] = "splitter";
        excludeOptions2[excludeOptions2["symmetric"] = 9] = "symmetric";
        excludeOptions2[excludeOptions2["mailMap"] = 10] = "mailMap";
        excludeOptions2[excludeOptions2["multiLine"] = 11] = "multiLine";
        excludeOptions2[excludeOptions2["strictDate"] = 12] = "strictDate";
        return excludeOptions2;
      })(excludeOptions || {});
    }
  });
  init_MergeSummary = __esm2({
    "src/lib/responses/MergeSummary.ts"() {
      MergeSummaryConflict = class {
        constructor(reason, file = null, meta) {
          this.reason = reason;
          this.file = file;
          this.meta = meta;
        }
        toString() {
          return `${this.file}:${this.reason}`;
        }
      };
      MergeSummaryDetail = class {
        constructor() {
          this.conflicts = [];
          this.merges = [];
          this.result = "success";
        }
        get failed() {
          return this.conflicts.length > 0;
        }
        get reason() {
          return this.result;
        }
        toString() {
          if (this.conflicts.length) {
            return `CONFLICTS: ${this.conflicts.join(", ")}`;
          }
          return "OK";
        }
      };
    }
  });
  init_PullSummary = __esm2({
    "src/lib/responses/PullSummary.ts"() {
      PullSummary = class {
        constructor() {
          this.remoteMessages = {
            all: []
          };
          this.created = [];
          this.deleted = [];
          this.files = [];
          this.deletions = {};
          this.insertions = {};
          this.summary = {
            changes: 0,
            deletions: 0,
            insertions: 0
          };
        }
      };
      PullFailedSummary = class {
        constructor() {
          this.remote = "";
          this.hash = {
            local: "",
            remote: ""
          };
          this.branch = {
            local: "",
            remote: ""
          };
          this.message = "";
        }
        toString() {
          return this.message;
        }
      };
    }
  });
  init_parse_remote_objects = __esm2({
    "src/lib/parsers/parse-remote-objects.ts"() {
      init_utils();
      remoteMessagesObjectParsers = [
        new RemoteLineParser(/^remote:\s*(enumerating|counting|compressing) objects: (\d+),/i, (result, [action, count]) => {
          const key = action.toLowerCase();
          const enumeration = objectEnumerationResult(result.remoteMessages);
          Object.assign(enumeration, { [key]: asNumber(count) });
        }),
        new RemoteLineParser(/^remote:\s*(enumerating|counting|compressing) objects: \d+% \(\d+\/(\d+)\),/i, (result, [action, count]) => {
          const key = action.toLowerCase();
          const enumeration = objectEnumerationResult(result.remoteMessages);
          Object.assign(enumeration, { [key]: asNumber(count) });
        }),
        new RemoteLineParser(/total ([^,]+), reused ([^,]+), pack-reused (\d+)/i, (result, [total, reused, packReused]) => {
          const objects = objectEnumerationResult(result.remoteMessages);
          objects.total = asObjectCount(total);
          objects.reused = asObjectCount(reused);
          objects.packReused = asNumber(packReused);
        })
      ];
    }
  });
  init_parse_remote_messages = __esm2({
    "src/lib/parsers/parse-remote-messages.ts"() {
      init_utils();
      init_parse_remote_objects();
      parsers2 = [
        new RemoteLineParser(/^remote:\s*(.+)$/, (result, [text]) => {
          result.remoteMessages.all.push(text.trim());
          return false;
        }),
        ...remoteMessagesObjectParsers,
        new RemoteLineParser([/create a (?:pull|merge) request/i, /\s(https?:\/\/\S+)$/], (result, [pullRequestUrl]) => {
          result.remoteMessages.pullRequestUrl = pullRequestUrl;
        }),
        new RemoteLineParser([/found (\d+) vulnerabilities.+\(([^)]+)\)/i, /\s(https?:\/\/\S+)$/], (result, [count, summary, url]) => {
          result.remoteMessages.vulnerabilities = {
            count: asNumber(count),
            summary,
            url
          };
        })
      ];
      RemoteMessageSummary = class {
        constructor() {
          this.all = [];
        }
      };
    }
  });
  init_parse_pull = __esm2({
    "src/lib/parsers/parse-pull.ts"() {
      init_PullSummary();
      init_utils();
      init_parse_remote_messages();
      FILE_UPDATE_REGEX = /^\s*(.+?)\s+\|\s+\d+\s*(\+*)(-*)/;
      SUMMARY_REGEX = /(\d+)\D+((\d+)\D+\(\+\))?(\D+(\d+)\D+\(-\))?/;
      ACTION_REGEX = /^(create|delete) mode \d+ (.+)/;
      parsers3 = [
        new LineParser(FILE_UPDATE_REGEX, (result, [file, insertions, deletions]) => {
          result.files.push(file);
          if (insertions) {
            result.insertions[file] = insertions.length;
          }
          if (deletions) {
            result.deletions[file] = deletions.length;
          }
        }),
        new LineParser(SUMMARY_REGEX, (result, [changes, , insertions, , deletions]) => {
          if (insertions !== undefined || deletions !== undefined) {
            result.summary.changes = +changes || 0;
            result.summary.insertions = +insertions || 0;
            result.summary.deletions = +deletions || 0;
            return true;
          }
          return false;
        }),
        new LineParser(ACTION_REGEX, (result, [action, file]) => {
          append(result.files, file);
          append(action === "create" ? result.created : result.deleted, file);
        })
      ];
      errorParsers = [
        new LineParser(/^from\s(.+)$/i, (result, [remote]) => void (result.remote = remote)),
        new LineParser(/^fatal:\s(.+)$/, (result, [message]) => void (result.message = message)),
        new LineParser(/([a-z0-9]+)\.\.([a-z0-9]+)\s+(\S+)\s+->\s+(\S+)$/, (result, [hashLocal, hashRemote, branchLocal, branchRemote]) => {
          result.branch.local = branchLocal;
          result.hash.local = hashLocal;
          result.branch.remote = branchRemote;
          result.hash.remote = hashRemote;
        })
      ];
      parsePullDetail = (stdOut, stdErr) => {
        return parseStringResponse(new PullSummary, parsers3, [stdOut, stdErr]);
      };
      parsePullResult = (stdOut, stdErr) => {
        return Object.assign(new PullSummary, parsePullDetail(stdOut, stdErr), parseRemoteMessages(stdOut, stdErr));
      };
    }
  });
  init_parse_merge = __esm2({
    "src/lib/parsers/parse-merge.ts"() {
      init_MergeSummary();
      init_utils();
      init_parse_pull();
      parsers4 = [
        new LineParser(/^Auto-merging\s+(.+)$/, (summary, [autoMerge]) => {
          summary.merges.push(autoMerge);
        }),
        new LineParser(/^CONFLICT\s+\((.+)\): Merge conflict in (.+)$/, (summary, [reason, file]) => {
          summary.conflicts.push(new MergeSummaryConflict(reason, file));
        }),
        new LineParser(/^CONFLICT\s+\((.+\/delete)\): (.+) deleted in (.+) and/, (summary, [reason, file, deleteRef]) => {
          summary.conflicts.push(new MergeSummaryConflict(reason, file, { deleteRef }));
        }),
        new LineParser(/^CONFLICT\s+\((.+)\):/, (summary, [reason]) => {
          summary.conflicts.push(new MergeSummaryConflict(reason, null));
        }),
        new LineParser(/^Automatic merge failed;\s+(.+)$/, (summary, [result]) => {
          summary.result = result;
        })
      ];
      parseMergeResult = (stdOut, stdErr) => {
        return Object.assign(parseMergeDetail(stdOut, stdErr), parsePullResult(stdOut, stdErr));
      };
      parseMergeDetail = (stdOut) => {
        return parseStringResponse(new MergeSummaryDetail, parsers4, stdOut);
      };
    }
  });
  init_merge = __esm2({
    "src/lib/tasks/merge.ts"() {
      init_git_response_error();
      init_parse_merge();
      init_task();
    }
  });
  init_parse_push = __esm2({
    "src/lib/parsers/parse-push.ts"() {
      init_utils();
      init_parse_remote_messages();
      parsers5 = [
        new LineParser(/^Pushing to (.+)$/, (result, [repo]) => {
          result.repo = repo;
        }),
        new LineParser(/^updating local tracking ref '(.+)'/, (result, [local]) => {
          result.ref = {
            ...result.ref || {},
            local
          };
        }),
        new LineParser(/^[=*-]\s+([^:]+):(\S+)\s+\[(.+)]$/, (result, [local, remote, type]) => {
          result.pushed.push(pushResultPushedItem(local, remote, type));
        }),
        new LineParser(/^Branch '([^']+)' set up to track remote branch '([^']+)' from '([^']+)'/, (result, [local, remote, remoteName]) => {
          result.branch = {
            ...result.branch || {},
            local,
            remote,
            remoteName
          };
        }),
        new LineParser(/^([^:]+):(\S+)\s+([a-z0-9]+)\.\.([a-z0-9]+)$/, (result, [local, remote, from, to]) => {
          result.update = {
            head: {
              local,
              remote
            },
            hash: {
              from,
              to
            }
          };
        })
      ];
      parsePushResult = (stdOut, stdErr) => {
        const pushDetail = parsePushDetail(stdOut, stdErr);
        const responseDetail = parseRemoteMessages(stdOut, stdErr);
        return {
          ...pushDetail,
          ...responseDetail
        };
      };
      parsePushDetail = (stdOut, stdErr) => {
        return parseStringResponse({ pushed: [] }, parsers5, [stdOut, stdErr]);
      };
    }
  });
  push_exports = {};
  __export2(push_exports, {
    pushTagsTask: () => pushTagsTask,
    pushTask: () => pushTask
  });
  init_push = __esm2({
    "src/lib/tasks/push.ts"() {
      init_parse_push();
      init_utils();
    }
  });
  init_show = __esm2({
    "src/lib/tasks/show.ts"() {
      init_utils();
      init_task();
    }
  });
  init_FileStatusSummary = __esm2({
    "src/lib/responses/FileStatusSummary.ts"() {
      fromPathRegex = /^(.+)\0(.+)$/;
      FileStatusSummary = class {
        constructor(path, index, working_dir) {
          this.path = path;
          this.index = index;
          this.working_dir = working_dir;
          if (index === "R" || working_dir === "R") {
            const detail = fromPathRegex.exec(path) || [null, path, path];
            this.from = detail[2] || "";
            this.path = detail[1] || "";
          }
        }
      };
    }
  });
  init_StatusSummary = __esm2({
    "src/lib/responses/StatusSummary.ts"() {
      init_utils();
      init_FileStatusSummary();
      StatusSummary = class {
        constructor() {
          this.not_added = [];
          this.conflicted = [];
          this.created = [];
          this.deleted = [];
          this.ignored = undefined;
          this.modified = [];
          this.renamed = [];
          this.files = [];
          this.staged = [];
          this.ahead = 0;
          this.behind = 0;
          this.current = null;
          this.tracking = null;
          this.detached = false;
          this.isClean = () => {
            return !this.files.length;
          };
        }
      };
      parsers6 = new Map([
        parser3(" ", "A", (result, file) => result.created.push(file)),
        parser3(" ", "D", (result, file) => result.deleted.push(file)),
        parser3(" ", "M", (result, file) => result.modified.push(file)),
        parser3("A", " ", (result, file) => {
          result.created.push(file);
          result.staged.push(file);
        }),
        parser3("A", "M", (result, file) => {
          result.created.push(file);
          result.staged.push(file);
          result.modified.push(file);
        }),
        parser3("D", " ", (result, file) => {
          result.deleted.push(file);
          result.staged.push(file);
        }),
        parser3("M", " ", (result, file) => {
          result.modified.push(file);
          result.staged.push(file);
        }),
        parser3("M", "M", (result, file) => {
          result.modified.push(file);
          result.staged.push(file);
        }),
        parser3("R", " ", (result, file) => {
          result.renamed.push(renamedFile(file));
        }),
        parser3("R", "M", (result, file) => {
          const renamed = renamedFile(file);
          result.renamed.push(renamed);
          result.modified.push(renamed.to);
        }),
        parser3("!", "!", (_result, _file) => {
          (_result.ignored = _result.ignored || []).push(_file);
        }),
        parser3("?", "?", (result, file) => result.not_added.push(file)),
        ...conflicts("A", "A", "U"),
        ...conflicts("D", "D", "U"),
        ...conflicts("U", "A", "D", "U"),
        [
          "##",
          (result, line) => {
            const aheadReg = /ahead (\d+)/;
            const behindReg = /behind (\d+)/;
            const currentReg = /^(.+?(?=(?:\.{3}|\s|$)))/;
            const trackingReg = /\.{3}(\S*)/;
            const onEmptyBranchReg = /\son\s(\S+?)(?=\.{3}|$)/;
            let regexResult = aheadReg.exec(line);
            result.ahead = regexResult && +regexResult[1] || 0;
            regexResult = behindReg.exec(line);
            result.behind = regexResult && +regexResult[1] || 0;
            regexResult = currentReg.exec(line);
            result.current = filterType(regexResult?.[1], filterString, null);
            regexResult = trackingReg.exec(line);
            result.tracking = filterType(regexResult?.[1], filterString, null);
            regexResult = onEmptyBranchReg.exec(line);
            if (regexResult) {
              result.current = filterType(regexResult?.[1], filterString, result.current);
            }
            result.detached = /\(no branch\)/.test(line);
          }
        ]
      ]);
      parseStatusSummary = function(text) {
        const lines = text.split(NULL);
        const status = new StatusSummary;
        for (let i2 = 0, l = lines.length;i2 < l; ) {
          let line = lines[i2++].trim();
          if (!line) {
            continue;
          }
          if (line.charAt(0) === "R") {
            line += NULL + (lines[i2++] || "");
          }
          splitLine(status, line);
        }
        return status;
      };
    }
  });
  init_status = __esm2({
    "src/lib/tasks/status.ts"() {
      init_StatusSummary();
      ignoredOptions = ["--null", "-z"];
    }
  });
  init_version = __esm2({
    "src/lib/tasks/version.ts"() {
      init_utils();
      NOT_INSTALLED = "installed=false";
      parsers7 = [
        new LineParser(/version (\d+)\.(\d+)\.(\d+)(?:\s*\((.+)\))?/, (result, [major, minor, patch, agent = ""]) => {
          Object.assign(result, versionResponse(asNumber(major), asNumber(minor), asNumber(patch), agent));
        }),
        new LineParser(/version (\d+)\.(\d+)\.(\D+)(.+)?$/, (result, [major, minor, patch, agent = ""]) => {
          Object.assign(result, versionResponse(asNumber(major), asNumber(minor), patch, agent));
        })
      ];
    }
  });
  init_clone = __esm2({
    "src/lib/tasks/clone.ts"() {
      init_task();
      init_utils();
      cloneTask = (repo, directory, customArgs) => {
        const commands = ["clone", ...customArgs];
        filterString(repo) && commands.push(c(repo));
        filterString(directory) && commands.push(c(directory));
        return straightThroughStringTask(commands);
      };
      cloneMirrorTask = (repo, directory, customArgs) => {
        append(customArgs, "--mirror");
        return cloneTask(repo, directory, customArgs);
      };
    }
  });
  simple_git_api_exports = {};
  __export2(simple_git_api_exports, {
    SimpleGitApi: () => SimpleGitApi
  });
  init_simple_git_api = __esm2({
    "src/lib/simple-git-api.ts"() {
      init_task_callback();
      init_change_working_directory();
      init_checkout();
      init_count_objects();
      init_commit();
      init_config();
      init_first_commit();
      init_grep();
      init_hash_object();
      init_init();
      init_log();
      init_merge();
      init_push();
      init_show();
      init_status();
      init_task();
      init_version();
      init_utils();
      init_clone();
      SimpleGitApi = class {
        constructor(_executor) {
          this._executor = _executor;
        }
        _runTask(task, then) {
          const chain = this._executor.chain();
          const promise = chain.push(task);
          if (then) {
            taskCallback(task, promise, then);
          }
          return Object.create(this, {
            then: { value: promise.then.bind(promise) },
            catch: { value: promise.catch.bind(promise) },
            _executor: { value: chain }
          });
        }
        add(files) {
          return this._runTask(straightThroughStringTask(["add", ...asArray(files)]), trailingFunctionArgument(arguments));
        }
        cwd(directory) {
          const next = trailingFunctionArgument(arguments);
          if (typeof directory === "string") {
            return this._runTask(changeWorkingDirectoryTask(directory, this._executor), next);
          }
          if (typeof directory?.path === "string") {
            return this._runTask(changeWorkingDirectoryTask(directory.path, directory.root && this._executor || undefined), next);
          }
          return this._runTask(configurationErrorTask("Git.cwd: workingDirectory must be supplied as a string"), next);
        }
        hashObject(path, write) {
          return this._runTask(hashObjectTask(path, write === true), trailingFunctionArgument(arguments));
        }
        init(bare) {
          return this._runTask(initTask(bare === true, this._executor.cwd, getTrailingOptions(arguments)), trailingFunctionArgument(arguments));
        }
        merge() {
          return this._runTask(mergeTask(getTrailingOptions(arguments)), trailingFunctionArgument(arguments));
        }
        mergeFromTo(remote, branch) {
          if (!(filterString(remote) && filterString(branch))) {
            return this._runTask(configurationErrorTask(`Git.mergeFromTo requires that the 'remote' and 'branch' arguments are supplied as strings`));
          }
          return this._runTask(mergeTask([remote, branch, ...getTrailingOptions(arguments)]), trailingFunctionArgument(arguments, false));
        }
        outputHandler(handler) {
          this._executor.outputHandler = handler;
          return this;
        }
        push() {
          const task = pushTask({
            remote: filterType(arguments[0], filterString),
            branch: filterType(arguments[1], filterString)
          }, getTrailingOptions(arguments));
          return this._runTask(task, trailingFunctionArgument(arguments));
        }
        stash() {
          return this._runTask(straightThroughStringTask(["stash", ...getTrailingOptions(arguments)]), trailingFunctionArgument(arguments));
        }
        status() {
          return this._runTask(statusTask(getTrailingOptions(arguments)), trailingFunctionArgument(arguments));
        }
      };
      Object.assign(SimpleGitApi.prototype, checkout_default(), clone_default(), commit_default(), config_default(), count_objects_default(), first_commit_default(), grep_default(), log_default(), show_default(), version_default());
    }
  });
  scheduler_exports = {};
  __export2(scheduler_exports, {
    Scheduler: () => Scheduler
  });
  init_scheduler = __esm2({
    "src/lib/runners/scheduler.ts"() {
      init_utils();
      init_git_logger();
      createScheduledTask = /* @__PURE__ */ (() => {
        let id = 0;
        return () => {
          id++;
          const { promise, done } = import_promise_deferred.createDeferred();
          return {
            promise,
            done,
            id
          };
        };
      })();
      Scheduler = class {
        constructor(concurrency = 2) {
          this.concurrency = concurrency;
          this.logger = createLogger("", "scheduler");
          this.pending = [];
          this.running = [];
          this.logger(`Constructed, concurrency=%s`, concurrency);
        }
        schedule() {
          if (!this.pending.length || this.running.length >= this.concurrency) {
            this.logger(`Schedule attempt ignored, pending=%s running=%s concurrency=%s`, this.pending.length, this.running.length, this.concurrency);
            return;
          }
          const task = append(this.running, this.pending.shift());
          this.logger(`Attempting id=%s`, task.id);
          task.done(() => {
            this.logger(`Completing id=`, task.id);
            remove(this.running, task);
            this.schedule();
          });
        }
        next() {
          const { promise, id } = append(this.pending, createScheduledTask());
          this.logger(`Scheduling id=%s`, id);
          this.schedule();
          return promise;
        }
      };
    }
  });
  apply_patch_exports = {};
  __export2(apply_patch_exports, {
    applyPatchTask: () => applyPatchTask
  });
  init_apply_patch = __esm2({
    "src/lib/tasks/apply-patch.ts"() {
      init_task();
    }
  });
  init_BranchDeleteSummary = __esm2({
    "src/lib/responses/BranchDeleteSummary.ts"() {
      BranchDeletionBatch = class {
        constructor() {
          this.all = [];
          this.branches = {};
          this.errors = [];
        }
        get success() {
          return !this.errors.length;
        }
      };
    }
  });
  init_parse_branch_delete = __esm2({
    "src/lib/parsers/parse-branch-delete.ts"() {
      init_BranchDeleteSummary();
      init_utils();
      deleteSuccessRegex = /(\S+)\s+\(\S+\s([^)]+)\)/;
      deleteErrorRegex = /^error[^']+'([^']+)'/m;
      parsers8 = [
        new LineParser(deleteSuccessRegex, (result, [branch, hash]) => {
          const deletion = branchDeletionSuccess(branch, hash);
          result.all.push(deletion);
          result.branches[branch] = deletion;
        }),
        new LineParser(deleteErrorRegex, (result, [branch]) => {
          const deletion = branchDeletionFailure(branch);
          result.errors.push(deletion);
          result.all.push(deletion);
          result.branches[branch] = deletion;
        })
      ];
      parseBranchDeletions = (stdOut, stdErr) => {
        return parseStringResponse(new BranchDeletionBatch, parsers8, [stdOut, stdErr]);
      };
    }
  });
  init_BranchSummary = __esm2({
    "src/lib/responses/BranchSummary.ts"() {
      BranchSummaryResult = class {
        constructor() {
          this.all = [];
          this.branches = {};
          this.current = "";
          this.detached = false;
        }
        push(status, detached, name, commit, label) {
          if (status === "*") {
            this.detached = detached;
            this.current = name;
          }
          this.all.push(name);
          this.branches[name] = {
            current: status === "*",
            linkedWorkTree: status === "+",
            name,
            commit,
            label
          };
        }
      };
    }
  });
  init_parse_branch = __esm2({
    "src/lib/parsers/parse-branch.ts"() {
      init_BranchSummary();
      init_utils();
      parsers9 = [
        new LineParser(/^([*+]\s)?\((?:HEAD )?detached (?:from|at) (\S+)\)\s+([a-z0-9]+)\s(.*)$/, (result, [current, name, commit, label]) => {
          result.push(branchStatus(current), true, name, commit, label);
        }),
        new LineParser(/^([*+]\s)?(\S+)\s+([a-z0-9]+)\s?(.*)$/s, (result, [current, name, commit, label]) => {
          result.push(branchStatus(current), false, name, commit, label);
        })
      ];
      currentBranchParser = new LineParser(/^(\S+)$/s, (result, [name]) => {
        result.push("*", false, name, "", "");
      });
    }
  });
  branch_exports = {};
  __export2(branch_exports, {
    branchLocalTask: () => branchLocalTask,
    branchTask: () => branchTask,
    containsDeleteBranchCommand: () => containsDeleteBranchCommand,
    deleteBranchTask: () => deleteBranchTask,
    deleteBranchesTask: () => deleteBranchesTask
  });
  init_branch = __esm2({
    "src/lib/tasks/branch.ts"() {
      init_git_response_error();
      init_parse_branch_delete();
      init_parse_branch();
      init_utils();
    }
  });
  init_CheckIgnore = __esm2({
    "src/lib/responses/CheckIgnore.ts"() {
      parseCheckIgnore = (text) => {
        return text.split(/\n/g).map(toPath).filter(Boolean);
      };
    }
  });
  check_ignore_exports = {};
  __export2(check_ignore_exports, {
    checkIgnoreTask: () => checkIgnoreTask
  });
  init_check_ignore = __esm2({
    "src/lib/tasks/check-ignore.ts"() {
      init_CheckIgnore();
    }
  });
  init_parse_fetch = __esm2({
    "src/lib/parsers/parse-fetch.ts"() {
      init_utils();
      parsers10 = [
        new LineParser(/From (.+)$/, (result, [remote]) => {
          result.remote = remote;
        }),
        new LineParser(/\* \[new branch]\s+(\S+)\s*-> (.+)$/, (result, [name, tracking]) => {
          result.branches.push({
            name,
            tracking
          });
        }),
        new LineParser(/\* \[new tag]\s+(\S+)\s*-> (.+)$/, (result, [name, tracking]) => {
          result.tags.push({
            name,
            tracking
          });
        }),
        new LineParser(/- \[deleted]\s+\S+\s*-> (.+)$/, (result, [tracking]) => {
          result.deleted.push({
            tracking
          });
        }),
        new LineParser(/\s*([^.]+)\.\.(\S+)\s+(\S+)\s*-> (.+)$/, (result, [from, to, name, tracking]) => {
          result.updated.push({
            name,
            tracking,
            to,
            from
          });
        })
      ];
    }
  });
  fetch_exports = {};
  __export2(fetch_exports, {
    fetchTask: () => fetchTask
  });
  init_fetch = __esm2({
    "src/lib/tasks/fetch.ts"() {
      init_parse_fetch();
      init_task();
    }
  });
  init_parse_move = __esm2({
    "src/lib/parsers/parse-move.ts"() {
      init_utils();
      parsers11 = [
        new LineParser(/^Renaming (.+) to (.+)$/, (result, [from, to]) => {
          result.moves.push({ from, to });
        })
      ];
    }
  });
  move_exports = {};
  __export2(move_exports, {
    moveTask: () => moveTask
  });
  init_move = __esm2({
    "src/lib/tasks/move.ts"() {
      init_parse_move();
      init_utils();
    }
  });
  pull_exports = {};
  __export2(pull_exports, {
    pullTask: () => pullTask
  });
  init_pull = __esm2({
    "src/lib/tasks/pull.ts"() {
      init_git_response_error();
      init_parse_pull();
      init_utils();
    }
  });
  init_GetRemoteSummary = __esm2({
    "src/lib/responses/GetRemoteSummary.ts"() {
      init_utils();
    }
  });
  remote_exports = {};
  __export2(remote_exports, {
    addRemoteTask: () => addRemoteTask,
    getRemotesTask: () => getRemotesTask,
    listRemotesTask: () => listRemotesTask,
    remoteTask: () => remoteTask,
    removeRemoteTask: () => removeRemoteTask
  });
  init_remote = __esm2({
    "src/lib/tasks/remote.ts"() {
      init_GetRemoteSummary();
      init_task();
    }
  });
  stash_list_exports = {};
  __export2(stash_list_exports, {
    stashListTask: () => stashListTask
  });
  init_stash_list = __esm2({
    "src/lib/tasks/stash-list.ts"() {
      init_log_format();
      init_parse_list_log_summary();
      init_diff();
      init_log();
    }
  });
  sub_module_exports = {};
  __export2(sub_module_exports, {
    addSubModuleTask: () => addSubModuleTask,
    initSubModuleTask: () => initSubModuleTask,
    subModuleTask: () => subModuleTask,
    updateSubModuleTask: () => updateSubModuleTask
  });
  init_sub_module = __esm2({
    "src/lib/tasks/sub-module.ts"() {
      init_task();
    }
  });
  init_TagList = __esm2({
    "src/lib/responses/TagList.ts"() {
      TagList = class {
        constructor(all, latest) {
          this.all = all;
          this.latest = latest;
        }
      };
      parseTagList = function(data, customSort = false) {
        const tags = data.split(`
`).map(trimmed).filter(Boolean);
        if (!customSort) {
          tags.sort(function(tagA, tagB) {
            const partsA = tagA.split(".");
            const partsB = tagB.split(".");
            if (partsA.length === 1 || partsB.length === 1) {
              return singleSorted(toNumber(partsA[0]), toNumber(partsB[0]));
            }
            for (let i2 = 0, l = Math.max(partsA.length, partsB.length);i2 < l; i2++) {
              const diff = sorted(toNumber(partsA[i2]), toNumber(partsB[i2]));
              if (diff) {
                return diff;
              }
            }
            return 0;
          });
        }
        const latest = customSort ? tags[0] : [...tags].reverse().find((tag) => tag.indexOf(".") >= 0);
        return new TagList(tags, latest);
      };
    }
  });
  tag_exports = {};
  __export2(tag_exports, {
    addAnnotatedTagTask: () => addAnnotatedTagTask,
    addTagTask: () => addTagTask,
    tagListTask: () => tagListTask
  });
  init_tag = __esm2({
    "src/lib/tasks/tag.ts"() {
      init_TagList();
    }
  });
  require_git = __commonJS2({
    "src/git.js"(exports, module) {
      var { GitExecutor: GitExecutor2 } = (init_git_executor(), __toCommonJS(git_executor_exports));
      var { SimpleGitApi: SimpleGitApi2 } = (init_simple_git_api(), __toCommonJS(simple_git_api_exports));
      var { Scheduler: Scheduler2 } = (init_scheduler(), __toCommonJS(scheduler_exports));
      var { adhocExecTask: adhocExecTask2, configurationErrorTask: configurationErrorTask2 } = (init_task(), __toCommonJS(task_exports));
      var {
        asArray: asArray2,
        filterArray: filterArray2,
        filterPrimitives: filterPrimitives2,
        filterString: filterString2,
        filterStringOrStringArray: filterStringOrStringArray2,
        filterType: filterType2,
        getTrailingOptions: getTrailingOptions2,
        trailingFunctionArgument: trailingFunctionArgument2,
        trailingOptionsArgument: trailingOptionsArgument2
      } = (init_utils(), __toCommonJS(utils_exports));
      var { applyPatchTask: applyPatchTask2 } = (init_apply_patch(), __toCommonJS(apply_patch_exports));
      var {
        branchTask: branchTask2,
        branchLocalTask: branchLocalTask2,
        deleteBranchesTask: deleteBranchesTask2,
        deleteBranchTask: deleteBranchTask2
      } = (init_branch(), __toCommonJS(branch_exports));
      var { checkIgnoreTask: checkIgnoreTask2 } = (init_check_ignore(), __toCommonJS(check_ignore_exports));
      var { checkIsRepoTask: checkIsRepoTask2 } = (init_check_is_repo(), __toCommonJS(check_is_repo_exports));
      var { cleanWithOptionsTask: cleanWithOptionsTask2, isCleanOptionsArray: isCleanOptionsArray2 } = (init_clean(), __toCommonJS(clean_exports));
      var { diffSummaryTask: diffSummaryTask2 } = (init_diff(), __toCommonJS(diff_exports));
      var { fetchTask: fetchTask2 } = (init_fetch(), __toCommonJS(fetch_exports));
      var { moveTask: moveTask2 } = (init_move(), __toCommonJS(move_exports));
      var { pullTask: pullTask2 } = (init_pull(), __toCommonJS(pull_exports));
      var { pushTagsTask: pushTagsTask2 } = (init_push(), __toCommonJS(push_exports));
      var {
        addRemoteTask: addRemoteTask2,
        getRemotesTask: getRemotesTask2,
        listRemotesTask: listRemotesTask2,
        remoteTask: remoteTask2,
        removeRemoteTask: removeRemoteTask2
      } = (init_remote(), __toCommonJS(remote_exports));
      var { getResetMode: getResetMode2, resetTask: resetTask2 } = (init_reset(), __toCommonJS(reset_exports));
      var { stashListTask: stashListTask2 } = (init_stash_list(), __toCommonJS(stash_list_exports));
      var {
        addSubModuleTask: addSubModuleTask2,
        initSubModuleTask: initSubModuleTask2,
        subModuleTask: subModuleTask2,
        updateSubModuleTask: updateSubModuleTask2
      } = (init_sub_module(), __toCommonJS(sub_module_exports));
      var { addAnnotatedTagTask: addAnnotatedTagTask2, addTagTask: addTagTask2, tagListTask: tagListTask2 } = (init_tag(), __toCommonJS(tag_exports));
      var { straightThroughBufferTask: straightThroughBufferTask2, straightThroughStringTask: straightThroughStringTask2 } = (init_task(), __toCommonJS(task_exports));
      function Git2(options, plugins) {
        this._plugins = plugins;
        this._executor = new GitExecutor2(options.baseDir, new Scheduler2(options.maxConcurrentProcesses), plugins);
        this._trimmed = options.trimmed;
      }
      (Git2.prototype = Object.create(SimpleGitApi2.prototype)).constructor = Git2;
      Git2.prototype.customBinary = function(command) {
        this._plugins.reconfigure("binary", command);
        return this;
      };
      Git2.prototype.env = function(name, value) {
        if (arguments.length === 1 && typeof name === "object") {
          this._executor.env = name;
        } else {
          (this._executor.env = this._executor.env || {})[name] = value;
        }
        return this;
      };
      Git2.prototype.stashList = function(options) {
        return this._runTask(stashListTask2(trailingOptionsArgument2(arguments) || {}, filterArray2(options) && options || []), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.mv = function(from, to) {
        return this._runTask(moveTask2(from, to), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.checkoutLatestTag = function(then) {
        var git = this;
        return this.pull(function() {
          git.tags(function(err, tags) {
            git.checkout(tags.latest, then);
          });
        });
      };
      Git2.prototype.pull = function(remote, branch, options, then) {
        return this._runTask(pullTask2(filterType2(remote, filterString2), filterType2(branch, filterString2), getTrailingOptions2(arguments)), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.fetch = function(remote, branch) {
        return this._runTask(fetchTask2(filterType2(remote, filterString2), filterType2(branch, filterString2), getTrailingOptions2(arguments)), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.silent = function(silence) {
        return this._runTask(adhocExecTask2(() => console.warn("simple-git deprecation notice: git.silent: logging should be configured using the `debug` library / `DEBUG` environment variable, this method will be removed.")));
      };
      Git2.prototype.tags = function(options, then) {
        return this._runTask(tagListTask2(getTrailingOptions2(arguments)), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.rebase = function() {
        return this._runTask(straightThroughStringTask2(["rebase", ...getTrailingOptions2(arguments)]), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.reset = function(mode) {
        return this._runTask(resetTask2(getResetMode2(mode), getTrailingOptions2(arguments)), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.revert = function(commit) {
        const next = trailingFunctionArgument2(arguments);
        if (typeof commit !== "string") {
          return this._runTask(configurationErrorTask2("Commit must be a string"), next);
        }
        return this._runTask(straightThroughStringTask2(["revert", ...getTrailingOptions2(arguments, 0, true), commit]), next);
      };
      Git2.prototype.addTag = function(name) {
        const task = typeof name === "string" ? addTagTask2(name) : configurationErrorTask2("Git.addTag requires a tag name");
        return this._runTask(task, trailingFunctionArgument2(arguments));
      };
      Git2.prototype.addAnnotatedTag = function(tagName, tagMessage) {
        return this._runTask(addAnnotatedTagTask2(tagName, tagMessage), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.deleteLocalBranch = function(branchName, forceDelete, then) {
        return this._runTask(deleteBranchTask2(branchName, typeof forceDelete === "boolean" ? forceDelete : false), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.deleteLocalBranches = function(branchNames, forceDelete, then) {
        return this._runTask(deleteBranchesTask2(branchNames, typeof forceDelete === "boolean" ? forceDelete : false), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.branch = function(options, then) {
        return this._runTask(branchTask2(getTrailingOptions2(arguments)), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.branchLocal = function(then) {
        return this._runTask(branchLocalTask2(), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.raw = function(commands) {
        const createRestCommands = !Array.isArray(commands);
        const command = [].slice.call(createRestCommands ? arguments : commands, 0);
        for (let i2 = 0;i2 < command.length && createRestCommands; i2++) {
          if (!filterPrimitives2(command[i2])) {
            command.splice(i2, command.length - i2);
            break;
          }
        }
        command.push(...getTrailingOptions2(arguments, 0, true));
        var next = trailingFunctionArgument2(arguments);
        if (!command.length) {
          return this._runTask(configurationErrorTask2("Raw: must supply one or more command to execute"), next);
        }
        return this._runTask(straightThroughStringTask2(command, this._trimmed), next);
      };
      Git2.prototype.submoduleAdd = function(repo, path, then) {
        return this._runTask(addSubModuleTask2(repo, path), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.submoduleUpdate = function(args, then) {
        return this._runTask(updateSubModuleTask2(getTrailingOptions2(arguments, true)), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.submoduleInit = function(args, then) {
        return this._runTask(initSubModuleTask2(getTrailingOptions2(arguments, true)), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.subModule = function(options, then) {
        return this._runTask(subModuleTask2(getTrailingOptions2(arguments)), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.listRemote = function() {
        return this._runTask(listRemotesTask2(getTrailingOptions2(arguments)), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.addRemote = function(remoteName, remoteRepo, then) {
        return this._runTask(addRemoteTask2(remoteName, remoteRepo, getTrailingOptions2(arguments)), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.removeRemote = function(remoteName, then) {
        return this._runTask(removeRemoteTask2(remoteName), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.getRemotes = function(verbose, then) {
        return this._runTask(getRemotesTask2(verbose === true), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.remote = function(options, then) {
        return this._runTask(remoteTask2(getTrailingOptions2(arguments)), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.tag = function(options, then) {
        const command = getTrailingOptions2(arguments);
        if (command[0] !== "tag") {
          command.unshift("tag");
        }
        return this._runTask(straightThroughStringTask2(command), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.updateServerInfo = function(then) {
        return this._runTask(straightThroughStringTask2(["update-server-info"]), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.pushTags = function(remote, then) {
        const task = pushTagsTask2({ remote: filterType2(remote, filterString2) }, getTrailingOptions2(arguments));
        return this._runTask(task, trailingFunctionArgument2(arguments));
      };
      Git2.prototype.rm = function(files) {
        return this._runTask(straightThroughStringTask2(["rm", "-f", ...asArray2(files)]), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.rmKeepLocal = function(files) {
        return this._runTask(straightThroughStringTask2(["rm", "--cached", ...asArray2(files)]), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.catFile = function(options, then) {
        return this._catFile("utf-8", arguments);
      };
      Git2.prototype.binaryCatFile = function() {
        return this._catFile("buffer", arguments);
      };
      Git2.prototype._catFile = function(format, args) {
        var handler = trailingFunctionArgument2(args);
        var command = ["cat-file"];
        var options = args[0];
        if (typeof options === "string") {
          return this._runTask(configurationErrorTask2("Git.catFile: options must be supplied as an array of strings"), handler);
        }
        if (Array.isArray(options)) {
          command.push.apply(command, options);
        }
        const task = format === "buffer" ? straightThroughBufferTask2(command) : straightThroughStringTask2(command);
        return this._runTask(task, handler);
      };
      Git2.prototype.diff = function(options, then) {
        const task = filterString2(options) ? configurationErrorTask2("git.diff: supplying options as a single string is no longer supported, switch to an array of strings") : straightThroughStringTask2(["diff", ...getTrailingOptions2(arguments)]);
        return this._runTask(task, trailingFunctionArgument2(arguments));
      };
      Git2.prototype.diffSummary = function() {
        return this._runTask(diffSummaryTask2(getTrailingOptions2(arguments, 1)), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.applyPatch = function(patches) {
        const task = !filterStringOrStringArray2(patches) ? configurationErrorTask2(`git.applyPatch requires one or more string patches as the first argument`) : applyPatchTask2(asArray2(patches), getTrailingOptions2([].slice.call(arguments, 1)));
        return this._runTask(task, trailingFunctionArgument2(arguments));
      };
      Git2.prototype.revparse = function() {
        const commands = ["rev-parse", ...getTrailingOptions2(arguments, true)];
        return this._runTask(straightThroughStringTask2(commands, true), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.clean = function(mode, options, then) {
        const usingCleanOptionsArray = isCleanOptionsArray2(mode);
        const cleanMode = usingCleanOptionsArray && mode.join("") || filterType2(mode, filterString2) || "";
        const customArgs = getTrailingOptions2([].slice.call(arguments, usingCleanOptionsArray ? 1 : 0));
        return this._runTask(cleanWithOptionsTask2(cleanMode, customArgs), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.exec = function(then) {
        const task = {
          commands: [],
          format: "utf-8",
          parser() {
            if (typeof then === "function") {
              then();
            }
          }
        };
        return this._runTask(task);
      };
      Git2.prototype.clearQueue = function() {
        return this._runTask(adhocExecTask2(() => console.warn("simple-git deprecation notice: clearQueue() is deprecated and will be removed, switch to using the abortPlugin instead.")));
      };
      Git2.prototype.checkIgnore = function(pathnames, then) {
        return this._runTask(checkIgnoreTask2(asArray2(filterType2(pathnames, filterStringOrStringArray2, []))), trailingFunctionArgument2(arguments));
      };
      Git2.prototype.checkIsRepo = function(checkType, then) {
        return this._runTask(checkIsRepoTask2(filterType2(checkType, filterString2)), trailingFunctionArgument2(arguments));
      };
      module.exports = Git2;
    }
  });
  init_git_error();
  GitConstructError = class extends GitError {
    constructor(config, message) {
      super(undefined, message);
      this.config = config;
    }
  };
  init_git_error();
  init_git_error();
  GitPluginError = class extends GitError {
    constructor(task, plugin, message) {
      super(task, message);
      this.task = task;
      this.plugin = plugin;
      Object.setPrototypeOf(this, new.target.prototype);
    }
  };
  init_git_response_error();
  init_task_configuration_error();
  init_check_is_repo();
  init_clean();
  init_config();
  init_diff_name_status();
  init_grep();
  init_reset();
  init_utils();
  init_utils();
  never = import_promise_deferred2.deferred().promise;
  init_utils();
  init_git_error();
  init_utils();
  init_utils();
  init_utils();
  init_utils();
  Git = require_git();
  init_git_response_error();
  simpleGit = gitInstanceFactory;
});

// src/git/gitOps.ts
var exports_gitOps = {};
__export(exports_gitOps, {
  GitOps: () => GitOps
});

class GitOps {
  git;
  constructor(workingDir) {
    this.git = simpleGit(workingDir);
  }
  async getDiff() {
    return this.git.diff();
  }
  async getStagedDiff() {
    return this.git.diff(["--cached"]);
  }
  async getDiffAgainstBase(baseBranch) {
    try {
      return await this.git.diff([`${baseBranch}...HEAD`]);
    } catch {
      return await this.git.diff([`origin/${baseBranch}...HEAD`]);
    }
  }
  async stageFiles(files) {
    await this.git.add([...files]);
  }
  async commit(message) {
    const result = await this.git.commit(message);
    return result.commit;
  }
  async getCommitHistory(baseBranch) {
    let log;
    try {
      log = await this.git.log({ from: baseBranch, to: "HEAD" });
    } catch {
      log = await this.git.log({ from: `origin/${baseBranch}`, to: "HEAD" });
    }
    const commits = [];
    for (const entry of log.all) {
      const diff = await this.git.diff([`${entry.hash}^`, entry.hash]);
      commits.push({
        hash: entry.hash,
        message: entry.message,
        diff
      });
    }
    return commits.reverse();
  }
  async getCurrentBranch() {
    const result = await this.git.branch();
    return result.current;
  }
  async isClean() {
    const status = await this.git.status();
    return status.isClean();
  }
  async checkRemoteUpdates(remote = "origin", baseBranch) {
    const currentBranch = await this.getCurrentBranch();
    const targetRemoteBranch = `${remote}/${baseBranch ?? currentBranch}`;
    try {
      await this.git.fetch(remote);
      const revList = await this.git.raw([
        "rev-list",
        "--left-right",
        "--count",
        `HEAD...${targetRemoteBranch}`
      ]);
      const [aheadStr, behindStr] = revList.trim().split(/\s+/);
      return {
        aheadCount: parseInt(aheadStr ?? "0", 10),
        behindCount: parseInt(behindStr ?? "0", 10),
        remoteBranch: targetRemoteBranch
      };
    } catch {
      return {
        aheadCount: 0,
        behindCount: 0,
        remoteBranch: targetRemoteBranch
      };
    }
  }
}
var init_gitOps = __esm(() => {
  init_esm();
});

// src/git/diffSplitter.ts
var exports_diffSplitter = {};
__export(exports_diffSplitter, {
  splitDiff: () => splitDiff,
  parseDiff: () => parseDiff,
  FileBasedClusterStrategy: () => FileBasedClusterStrategy
});
function parseDiff(rawDiff) {
  const hunks = [];
  const lines = rawDiff.split(`
`);
  let currentFile = null;
  let hunkStart = -1;
  let hunkLines = [];
  let oldStart = 0;
  let oldLines = 0;
  let newStart = 0;
  let newLines = 0;
  for (let i2 = 0;i2 < lines.length; i2++) {
    const line = lines[i2];
    const diffMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (diffMatch) {
      if (currentFile && hunkStart >= 0 && hunkLines.length > 0) {
        hunks.push({
          filePath: currentFile,
          oldStart,
          oldLines,
          newStart,
          newLines,
          content: hunkLines.join(`
`)
        });
      }
      currentFile = diffMatch[2];
      hunkStart = -1;
      hunkLines = [];
      continue;
    }
    const minusMatch = line.match(/^--- (?:a\/)?(.+)$/);
    if (minusMatch && minusMatch[1] !== "/dev/null") {
      continue;
    }
    const plusMatch = line.match(/^\+\+\+ (?:b\/)?(.+)$/);
    if (plusMatch && plusMatch[1] !== "/dev/null") {
      currentFile = plusMatch[1];
      continue;
    }
    const hunkHeaderMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkHeaderMatch) {
      if (currentFile && hunkStart >= 0 && hunkLines.length > 0) {
        hunks.push({
          filePath: currentFile,
          oldStart,
          oldLines,
          newStart,
          newLines,
          content: hunkLines.join(`
`)
        });
      }
      oldStart = parseInt(hunkHeaderMatch[1], 10);
      oldLines = parseInt(hunkHeaderMatch[2] ?? "1", 10);
      newStart = parseInt(hunkHeaderMatch[3], 10);
      newLines = parseInt(hunkHeaderMatch[4] ?? "1", 10);
      hunkStart = i2;
      hunkLines = [line];
      continue;
    }
    if (hunkStart >= 0) {
      hunkLines.push(line);
    }
  }
  if (currentFile && hunkStart >= 0 && hunkLines.length > 0) {
    hunks.push({
      filePath: currentFile,
      oldStart,
      oldLines,
      newStart,
      newLines,
      content: hunkLines.join(`
`)
    });
  }
  return hunks;
}

class FileBasedClusterStrategy {
  name = "file-based";
  cluster(hunks) {
    const fileGroups = new Map;
    for (const hunk of hunks) {
      const existing = fileGroups.get(hunk.filePath);
      if (existing) {
        existing.push(hunk);
      } else {
        fileGroups.set(hunk.filePath, [hunk]);
      }
    }
    let clusterIndex = 0;
    const clusters = [];
    for (const [filePath, fileHunks] of fileGroups) {
      clusters.push({
        id: `cluster-${clusterIndex++}`,
        files: [filePath],
        hunks: fileHunks
      });
    }
    return clusters;
  }
}
function splitDiff(rawDiff, strategy = new FileBasedClusterStrategy) {
  if (!rawDiff.trim()) {
    return [];
  }
  const hunks = parseDiff(rawDiff);
  return strategy.cluster(hunks);
}

// src/git/commitMessage.ts
var exports_commitMessage = {};
__export(exports_commitMessage, {
  generateCommitMessage: () => generateCommitMessage,
  CONVENTIONAL_COMMIT_REGEX: () => CONVENTIONAL_COMMIT_REGEX
});
async function generateCommitMessage(cluster, client, policy) {
  const decision = resolve({ kind: "mechanical", estimatedComplexity: "low" }, policy);
  const diffContent = cluster.hunks.map((h2) => h2.content).join(`

`);
  const filesChanged = cluster.files.join(", ");
  const callOptions = {
    provider: decision.target.provider,
    model: decision.target.model,
    fallbacks: decision.target.fallbacks,
    tools: [],
    messages: [
      { role: "user", content: COMMIT_MESSAGE_SYSTEM_PROMPT },
      { role: "assistant", content: "I understand. Send me the diff and I will generate a commit message." },
      {
        role: "user",
        content: `Generate a commit message for the following changes:

Files changed: ${filesChanged}

Diff:
${diffContent}`
      }
    ]
  };
  const result = await client.call(callOptions);
  const message = result.text?.trim() ?? "";
  if (!CONVENTIONAL_COMMIT_REGEX.test(message)) {
    const lines = message.split(`
`);
    const firstLine = lines[0]?.trim() ?? "";
    if (CONVENTIONAL_COMMIT_REGEX.test(firstLine)) {
      return firstLine;
    }
    return `chore: update ${cluster.files[0] ?? "files"}`;
  }
  return message;
}
var CONVENTIONAL_COMMIT_REGEX, COMMIT_MESSAGE_SYSTEM_PROMPT = `You are a commit message generator. Given a diff, generate a single-line commit message in Conventional Commits format.

Rules:
1. Use one of these types: feat, fix, chore, docs, refactor, test, perf, ci, build, style, revert
2. Optionally include a scope in parentheses: feat(adapter): ...
3. Use imperative mood: "add" not "added" or "adds"
4. Keep the description concise (max 72 chars for the whole message)
5. Do NOT include a body or footer — just the single subject line
6. Respond with ONLY the commit message, nothing else

Examples:
- feat(adapter): add gemini tool decoding
- fix: handle malformed JSON in tool call arguments
- refactor(router): extract rule matching into separate function
- docs: update README with architecture diagram
- chore: update dependency versions`;
var init_commitMessage = __esm(() => {
  CONVENTIONAL_COMMIT_REGEX = /^(feat|fix|chore|docs|refactor|test|perf|ci|build|style|revert)(\(.+\))?!?: .+$/;
});

// src/core/errors.ts
var ChowaError, ValidationError, AdapterError;
var init_errors = __esm(() => {
  ChowaError = class ChowaError extends Error {
    code;
    constructor(message, code) {
      super(message);
      this.code = code;
      this.name = "ChowaError";
    }
  };
  ValidationError = class ValidationError extends ChowaError {
    toolName;
    issues;
    correctionMessage;
    constructor(toolName, issues, correctionMessage) {
      super(`Tool call "${toolName}" failed validation: ${issues.map((i2) => i2.message).join("; ")}`, "VALIDATION_ERROR");
      this.toolName = toolName;
      this.issues = issues;
      this.correctionMessage = correctionMessage;
      this.name = "ValidationError";
    }
  };
  AdapterError = class AdapterError extends ChowaError {
    providerId;
    phase;
    rawPayload;
    constructor(providerId, phase, message, rawPayload) {
      super(`[${providerId}] ${phase}: ${message}`, "ADAPTER_ERROR");
      this.providerId = providerId;
      this.phase = phase;
      this.rawPayload = rawPayload;
      this.name = "AdapterError";
    }
  };
});

// src/core/validate.ts
function validateToolCall(call, schema) {
  const result = schema.safeParse(call.arguments);
  if (result.success) {
    return { valid: true };
  }
  const issues = mapZodIssues(result.error);
  const correctionMessage = buildCorrectionMessage(call.name, result.error);
  return {
    valid: false,
    error: new ValidationError(call.name, issues, correctionMessage)
  };
}
function mapZodIssues(error) {
  return error.issues.map((issue) => ({
    path: issue.path,
    message: issue.message,
    expected: "expected" in issue ? String(issue.expected) : undefined,
    received: "received" in issue ? String(issue.received) : undefined
  }));
}
function buildCorrectionMessage(toolName, error) {
  const issueLines = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `  - ${path}: ${issue.message}`;
  });
  return [
    `Your last tool call to "${toolName}" didn't match the expected schema:`,
    ...issueLines,
    "",
    "Please retry with corrected arguments."
  ].join(`
`);
}
var init_validate = __esm(() => {
  init_errors();
});

// src/adapters/anthropic.ts
class AnthropicAdapter {
  providerId = "anthropic";
  encodeTools(tools) {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters
    }));
  }
  encodeMessages(messages) {
    const encoded = [];
    for (const message of messages) {
      if (message.role === "tool_result") {
        encoded.push(this.encodeToolResultMessage(message));
      } else if (message.role === "assistant") {
        encoded.push(this.encodeAssistantMessage(message));
      } else {
        encoded.push(this.encodeUserMessage(message));
      }
    }
    return this.mergeAdjacentUserMessages(encoded);
  }
  decodeToolCalls(response) {
    const anthropicResponse = this.assertAnthropicResponse(response);
    const toolUseBlocks = anthropicResponse.content.filter((block) => block.type === "tool_use");
    return toolUseBlocks.map((block) => ({
      id: block.id,
      name: block.name,
      arguments: block.input,
      raw: block
    }));
  }
  decodeTextContent(response) {
    const anthropicResponse = this.assertAnthropicResponse(response);
    const textBlocks = anthropicResponse.content.filter((block) => block.type === "text");
    if (textBlocks.length === 0) {
      return;
    }
    return textBlocks.map((block) => block.text).join(`
`);
  }
  encodeUserMessage(message) {
    if (typeof message.content === "string") {
      return { role: "user", content: message.content };
    }
    return {
      role: "user",
      content: this.encodeContentBlocks(message.content)
    };
  }
  encodeAssistantMessage(message) {
    if (typeof message.content === "string") {
      const blocks = [{ type: "text", text: message.content }];
      if (message.toolCalls && message.toolCalls.length > 0) {
        for (const toolCall of message.toolCalls) {
          blocks.push({
            type: "tool_use",
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.arguments
          });
        }
      }
      return { role: "assistant", content: blocks };
    }
    return {
      role: "assistant",
      content: this.encodeContentBlocks(message.content)
    };
  }
  encodeToolResultMessage(message) {
    const blocks = [];
    if (typeof message.content === "string") {
      if (message.toolCallId) {
        blocks.push({
          type: "tool_result",
          tool_use_id: message.toolCallId,
          content: message.content
        });
      } else {
        blocks.push({ type: "text", text: message.content });
      }
    } else {
      for (const block of message.content) {
        if (block.type === "tool_result") {
          blocks.push({
            type: "tool_result",
            tool_use_id: block.toolCallId,
            content: typeof block.result === "string" ? block.result : JSON.stringify(block.result),
            is_error: block.isError
          });
        }
      }
    }
    return { role: "user", content: blocks };
  }
  encodeContentBlocks(blocks) {
    return blocks.map((block) => {
      switch (block.type) {
        case "text":
          return { type: "text", text: block.text };
        case "tool_use":
          return {
            type: "tool_use",
            id: block.toolCall.id,
            name: block.toolCall.name,
            input: block.toolCall.arguments
          };
        case "tool_result":
          return {
            type: "tool_result",
            tool_use_id: block.toolCallId,
            content: typeof block.result === "string" ? block.result : JSON.stringify(block.result),
            is_error: block.isError
          };
      }
    });
  }
  mergeAdjacentUserMessages(messages) {
    const merged = [];
    for (const message of messages) {
      const last2 = merged[merged.length - 1];
      if (last2 && last2.role === "user" && message.role === "user") {
        const lastBlocks = this.toBlockArray(last2.content);
        const currentBlocks = this.toBlockArray(message.content);
        last2.content = [...lastBlocks, ...currentBlocks];
      } else {
        merged.push({ ...message });
      }
    }
    return merged;
  }
  toBlockArray(content) {
    if (typeof content === "string") {
      return [{ type: "text", text: content }];
    }
    return content;
  }
  assertAnthropicResponse(response) {
    if (typeof response !== "object" || response === null || !("content" in response) || !Array.isArray(response.content)) {
      throw new AdapterError(this.providerId, "decode", "Response does not match expected Anthropic format (missing content array)", response);
    }
    return response;
  }
}
var init_anthropic = __esm(() => {
  init_errors();
});

// src/adapters/openai.ts
class OpenAIAdapter {
  providerId = "openai";
  encodeTools(_tools) {
    throw new Error("OpenAI adapter not yet implemented — see TODO comments");
  }
  encodeMessages(_messages) {
    throw new Error("OpenAI adapter not yet implemented — see TODO comments");
  }
  decodeToolCalls(_response) {
    throw new Error("OpenAI adapter not yet implemented — see TODO comments");
  }
  decodeTextContent(_response) {
    throw new Error("OpenAI adapter not yet implemented — see TODO comments");
  }
}

// src/adapters/gemini.ts
import { createHash } from "node:crypto";

class GeminiAdapter {
  providerId = "gemini";
  encodeTools(tools) {
    return {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }))
    };
  }
  encodeMessages(messages) {
    const encoded = [];
    const toolCallIdToName = new Map;
    for (const message of messages) {
      if (message.role === "tool_result") {
        encoded.push(this.encodeToolResultMessage(message, toolCallIdToName));
      } else if (message.role === "assistant") {
        encoded.push(this.encodeAssistantMessage(message, toolCallIdToName));
      } else {
        encoded.push(this.encodeUserMessage(message, toolCallIdToName));
      }
    }
    return this.mergeAdjacentUserMessages(encoded);
  }
  decodeToolCalls(response, turnIndex = 0) {
    const geminiResponse = this.assertGeminiResponse(response);
    const parts = geminiResponse.candidates[0].content.parts ?? [];
    const functionCallParts = parts.filter((part) => Boolean(part.functionCall && typeof part.functionCall.name === "string"));
    return functionCallParts.map((part, position) => {
      const name = part.functionCall.name;
      const args = part.functionCall.args ?? {};
      const hashInput = `${name}:${turnIndex}:${position}`;
      const id = createHash("sha256").update(hashInput).digest("hex").slice(0, 24);
      return {
        id,
        name,
        arguments: args,
        raw: part
      };
    });
  }
  decodeTextContent(response) {
    const geminiResponse = this.assertGeminiResponse(response);
    const parts = geminiResponse.candidates[0].content.parts ?? [];
    const textParts = parts.filter((part) => typeof part.text === "string");
    if (textParts.length === 0) {
      return;
    }
    return textParts.map((part) => part.text).join(`
`);
  }
  encodeUserMessage(message, toolCallIdToName) {
    if (typeof message.content === "string") {
      return {
        role: "user",
        parts: [{ text: message.content }]
      };
    }
    return {
      role: "user",
      parts: this.encodeContentBlocks(message.content, toolCallIdToName)
    };
  }
  encodeAssistantMessage(message, toolCallIdToName) {
    const parts = [];
    if (typeof message.content === "string") {
      if (message.content.length > 0) {
        parts.push({ text: message.content });
      }
      if (message.toolCalls && message.toolCalls.length > 0) {
        for (const toolCall of message.toolCalls) {
          toolCallIdToName.set(toolCall.id, toolCall.name);
          parts.push({
            functionCall: {
              name: toolCall.name,
              args: toolCall.arguments
            }
          });
        }
      }
    } else {
      parts.push(...this.encodeContentBlocks(message.content, toolCallIdToName));
    }
    return {
      role: "model",
      parts
    };
  }
  encodeToolResultMessage(message, toolCallIdToName) {
    const parts = [];
    if (typeof message.content === "string") {
      if (message.toolCallId) {
        const name = toolCallIdToName.get(message.toolCallId) ?? "unknown";
        parts.push({
          functionResponse: {
            name,
            response: { output: message.content }
          }
        });
      } else {
        parts.push({ text: message.content });
      }
    } else {
      for (const block of message.content) {
        if (block.type === "tool_result") {
          const name = toolCallIdToName.get(block.toolCallId) ?? "unknown";
          const response = typeof block.result === "object" && block.result !== null && !Array.isArray(block.result) ? block.result : { output: block.result };
          parts.push({
            functionResponse: {
              name,
              response
            }
          });
        }
      }
    }
    return {
      role: "user",
      parts
    };
  }
  encodeContentBlocks(blocks, toolCallIdToName) {
    return blocks.map((block) => {
      switch (block.type) {
        case "text":
          return { text: block.text };
        case "tool_use":
          toolCallIdToName.set(block.toolCall.id, block.toolCall.name);
          return {
            functionCall: {
              name: block.toolCall.name,
              args: block.toolCall.arguments
            }
          };
        case "tool_result": {
          const name = toolCallIdToName.get(block.toolCallId) ?? "unknown";
          const response = typeof block.result === "object" && block.result !== null && !Array.isArray(block.result) ? block.result : { output: block.result };
          return {
            functionResponse: {
              name,
              response
            }
          };
        }
      }
    });
  }
  mergeAdjacentUserMessages(messages) {
    const merged = [];
    for (const message of messages) {
      const last2 = merged[merged.length - 1];
      if (last2 && last2.role === "user" && message.role === "user") {
        last2.parts = [...last2.parts, ...message.parts];
      } else {
        merged.push({
          role: message.role,
          parts: [...message.parts]
        });
      }
    }
    return merged;
  }
  assertGeminiResponse(response) {
    if (typeof response !== "object" || response === null || !("candidates" in response) || !Array.isArray(response.candidates) || response.candidates.length === 0 || !response.candidates[0]?.content?.parts) {
      throw new AdapterError(this.providerId, "decode", "Response does not match expected Gemini format (missing candidates[0].content.parts)", response);
    }
    return response;
  }
}
var init_gemini = __esm(() => {
  init_errors();
});

// src/adapters/local.ts
class LocalAdapter {
  providerId = "local";
  encodeTools(_tools) {
    throw new Error("Local adapter not yet implemented — see TODO comments");
  }
  encodeMessages(_messages) {
    throw new Error("Local adapter not yet implemented — see TODO comments");
  }
  decodeToolCalls(_response) {
    throw new Error("Local adapter not yet implemented — see TODO comments");
  }
  decodeTextContent(_response) {
    throw new Error("Local adapter not yet implemented — see TODO comments");
  }
}

// src/adapters/registry.ts
function getAdapter(providerId) {
  const cached = adapterCache.get(providerId);
  if (cached) {
    return cached;
  }
  const factory = customAdapters.get(providerId) ?? builtInAdapters[providerId];
  if (!factory) {
    const available = [
      ...Object.keys(builtInAdapters),
      ...customAdapters.keys()
    ].join(", ");
    throw new Error(`No adapter registered for provider "${providerId}". Available: ${available}`);
  }
  const adapter = factory();
  adapterCache.set(providerId, adapter);
  return adapter;
}
var builtInAdapters, adapterCache, customAdapters;
var init_registry = __esm(() => {
  init_anthropic();
  init_gemini();
  builtInAdapters = {
    anthropic: () => new AnthropicAdapter,
    openai: () => new OpenAIAdapter,
    gemini: () => new GeminiAdapter,
    local: () => new LocalAdapter
  };
  adapterCache = new Map;
  customAdapters = new Map;
});

// src/client.ts
var exports_client = {};
__export(exports_client, {
  ChowaClient: () => ChowaClient
});

class MockTransport {
  async send(request) {
    if (request.provider === "gemini") {
      return {
        data: {
          candidates: [
            {
              content: {
                role: "model",
                parts: []
              }
            }
          ]
        },
        status: 200
      };
    }
    return {
      data: { content: [] },
      status: 200
    };
  }
}

class ChowaClient {
  transport;
  constructor(transport) {
    this.transport = transport ?? new MockTransport;
  }
  getAvailableModels(provider) {
    const defaultModels = [
      { id: "gemini-3.6-flash", provider: "gemini", tier: "fast", displayName: "Gemini 3.6 Flash" },
      { id: "gemini-3.6-pro", provider: "gemini", tier: "balanced", displayName: "Gemini 3.6 Pro" },
      { id: "claude-haiku", provider: "anthropic", tier: "fast", displayName: "Claude Haiku" },
      { id: "claude-sonnet-4.6", provider: "anthropic", tier: "balanced", displayName: "Claude Sonnet 4.6" },
      { id: "claude-opus-4.6", provider: "anthropic", tier: "opus", displayName: "Claude Opus 4.6" }
    ];
    if (!provider)
      return defaultModels;
    return defaultModels.filter((m) => m.provider === provider);
  }
  async call(options) {
    const targets = [
      { provider: options.provider, model: options.model },
      ...options.fallbacks ?? []
    ];
    let lastError;
    let attemptCount = 0;
    for (let tIndex = 0;tIndex < targets.length; tIndex++) {
      const target = targets[tIndex];
      attemptCount++;
      try {
        const result = await this.executeCallWithTarget(target, options);
        return {
          ...result,
          usedFallback: tIndex > 0,
          attemptCount
        };
      } catch (error) {
        lastError = error;
        if (tIndex === targets.length - 1) {
          throw error;
        }
      }
    }
    throw lastError ?? new Error("All provider targets failed");
  }
  async executeCallWithTarget(target, options) {
    const {
      tools,
      messages,
      maxRetries = 2,
      toolSchemas
    } = options;
    const provider = target.provider;
    const model = target.model;
    const adapter = getAdapter(provider);
    const encodedTools = adapter.encodeTools(tools);
    let currentMessages = [...messages];
    let retriesUsed = 0;
    for (let attempt = 0;attempt <= maxRetries; attempt++) {
      const encodedMessages = adapter.encodeMessages(currentMessages);
      const response = await this.transport.send({
        provider,
        model,
        tools: encodedTools,
        messages: encodedMessages
      });
      const toolCalls = adapter.decodeToolCalls(response.data);
      const text = adapter.decodeTextContent(response.data);
      if (!toolSchemas || toolCalls.length === 0) {
        return { toolCalls, text, retriesUsed, provider, model };
      }
      const failures = this.findValidationFailures(toolCalls, toolSchemas);
      if (failures.length === 0) {
        return { toolCalls, text, retriesUsed, provider, model };
      }
      if (attempt === maxRetries) {
        return { toolCalls, text, retriesUsed, provider, model };
      }
      currentMessages = this.appendRetryMessages(currentMessages, toolCalls, text, failures);
      retriesUsed++;
    }
    return { toolCalls: [], retriesUsed, provider, model };
  }
  findValidationFailures(toolCalls, schemas) {
    const failures = [];
    for (const call of toolCalls) {
      const schema = schemas.get(call.name);
      if (!schema)
        continue;
      const result = validateToolCall(call, schema);
      if (!result.valid) {
        failures.push({
          call,
          correctionMessage: result.error.correctionMessage
        });
      }
    }
    return failures;
  }
  appendRetryMessages(messages, toolCalls, text, failures) {
    const updated = [...messages];
    const assistantContent = text ?? "";
    updated.push({
      role: "assistant",
      content: assistantContent,
      toolCalls
    });
    const correctionText = failures.map((f) => f.correctionMessage).join(`

`);
    updated.push({
      role: "user",
      content: correctionText
    });
    return updated;
  }
}
var init_client = __esm(() => {
  init_validate();
  init_registry();
});

// src/git/prDescription.ts
var exports_prDescription = {};
__export(exports_prDescription, {
  generatePRDescription: () => generatePRDescription,
  detectPRType: () => detectPRType
});
function detectPRType(branchName) {
  if (branchName.startsWith("release/") || branchName.startsWith("hotfix/")) {
    return "release";
  }
  if (branchName.startsWith("feat/")) {
    return "feature";
  }
  return "standard";
}
async function generatePRDescription(commits, baseBranchDiff, client, policy, branchName) {
  const prType = detectPRType(branchName);
  const changes = commits.map((commit) => commit.message);
  const decision = resolve({ kind: "mechanical", estimatedComplexity: "medium" }, policy);
  const commitList = commits.map((c3) => `- ${c3.message}`).join(`
`);
  const callOptions = {
    provider: decision.target.provider,
    model: decision.target.model,
    fallbacks: decision.target.fallbacks,
    tools: [],
    messages: [
      {
        role: "user",
        content: prType === "release" ? RELEASE_PR_SYSTEM_PROMPT : prType === "feature" ? FEATURE_PR_SYSTEM_PROMPT : STANDARD_PR_SYSTEM_PROMPT
      },
      {
        role: "assistant",
        content: "I understand. Send me the commits and diff."
      },
      {
        role: "user",
        content: [
          "Commits:",
          commitList,
          "",
          "Diff:",
          baseBranchDiff.slice(0, 8000)
        ].join(`
`)
      }
    ]
  };
  const result = await client.call(callOptions);
  const responseText = result.text?.trim() ?? "";
  const llmDescription = parseLLMResponse(responseText);
  return {
    type: prType,
    summary: llmDescription.summary,
    changes,
    testing: llmDescription.testing,
    breakingChanges: llmDescription.breakingChanges ?? undefined,
    rolloutNotes: prType === "feature" ? llmDescription.rolloutNotes ?? ROLLOUT_NOTES_FALLBACK : undefined,
    rolloutPlan: prType === "release" ? llmDescription.rolloutPlan ?? ROLLOUT_PLAN_FALLBACK : undefined
  };
}
function parseLLMResponse(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: typeof parsed["summary"] === "string" ? parsed["summary"] : "No summary generated",
        testing: typeof parsed["testing"] === "string" ? parsed["testing"] : "No testing notes generated",
        breakingChanges: typeof parsed["breakingChanges"] === "string" ? parsed["breakingChanges"] : null,
        rolloutNotes: typeof parsed["rolloutNotes"] === "string" ? parsed["rolloutNotes"] : null,
        rolloutPlan: typeof parsed["rolloutPlan"] === "string" ? parsed["rolloutPlan"] : null
      };
    }
  } catch {}
  return {
    summary: text || "No summary generated",
    testing: "Manual testing recommended",
    breakingChanges: null,
    rolloutNotes: null,
    rolloutPlan: null
  };
}
var STANDARD_PR_SYSTEM_PROMPT = `You are a PR description generator. Given a list of commit messages and a diff, generate a structured PR description.

You will receive:
1. A list of commit messages (already in Conventional Commits format)
2. The full diff against the base branch

Generate a JSON response with this exact structure:
{
  "summary": "A 2-3 sentence high-level summary of what this PR accomplishes",
  "testing": "Testing notes — what was tested, how to verify, any manual testing needed",
  "breakingChanges": "Description of breaking changes, or null if none"
}

Rules:
- The summary should explain the WHY, not just the WHAT
- Testing notes should be actionable and specific
- Only include breakingChanges if there are actual breaking changes (API changes, removed features, etc.)
- Respond with ONLY the JSON, no markdown fences or extra text`, RELEASE_PR_SYSTEM_PROMPT = `You are a PR description generator for a release/hotfix branch. Given a list of commit messages and a diff, generate a structured PR description.

You will receive:
1. A list of commit messages (already in Conventional Commits format)
2. The full diff against the base branch

Generate a JSON response with this exact structure:
{
  "summary": "A 2-3 sentence high-level summary of what this PR accomplishes",
  "testing": "Testing notes — what was tested, how to verify, any manual testing needed",
  "breakingChanges": "Description of breaking changes, or null if none",
  "rolloutPlan": "How this release/hotfix will be rolled out, and if something goes wrong, how to roll it back — required, never null"
}

Rules:
- The summary should explain the WHY, not just the WHAT
- Testing notes should be actionable and specific
- Only include breakingChanges if there are actual breaking changes (API changes, removed features, etc.)
- rolloutPlan is required — always provide concrete rollout and rollback steps
- Respond with ONLY the JSON, no markdown fences or extra text`, FEATURE_PR_SYSTEM_PROMPT = `You are a PR description generator for a new-feature branch. Given a list of commit messages and a diff, generate a structured PR description.

You will receive:
1. A list of commit messages (already in Conventional Commits format)
2. The full diff against the base branch

Generate a JSON response with this exact structure:
{
  "summary": "A 2-3 sentence high-level summary explaining why this capability exists and who it's for, not just what changed",
  "testing": "Testing notes — what was tested, how to verify, any manual testing needed",
  "breakingChanges": "Description of breaking changes, or null if none",
  "rolloutNotes": "How this capability reaches users — is it behind a flag, rolled out gradually, does documentation need updating — required, never null"
}

Rules:
- The summary should explain the motivation and user impact, not just the WHAT
- Testing notes should be actionable and specific
- Only include breakingChanges if there are actual breaking changes (API changes, removed features, etc.)
- rolloutNotes is required — always describe how the feature reaches users
- Respond with ONLY the JSON, no markdown fences or extra text`, ROLLOUT_PLAN_FALLBACK = "Rollout/rollback plan not generated — document manually before merging.", ROLLOUT_NOTES_FALLBACK = "Rollout notes not generated — document manually before merging.";
var init_prDescription = () => {};

// src/integrations/antigravity/bridge.ts
var exports_bridge = {};
__export(exports_bridge, {
  AntigravityBridge: () => AntigravityBridge
});

class AntigravityBridge {
  client;
  policy;
  constructor(client, policy) {
    this.client = client;
    this.policy = policy;
  }
  async handle(request) {
    try {
      switch (request.action) {
        case "call":
          return await this.handleCall(request);
        case "route":
          return this.handleRoute(request);
        case "models":
          return this.handleModels(request);
        case "commit":
          return this.handleCommit();
        case "pr":
          return this.handlePR(request);
        default:
          return {
            success: false,
            action: request.action,
            error: `Unknown action: ${request.action}`
          };
      }
    } catch (error) {
      return {
        success: false,
        action: request.action,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  handleModels(request) {
    const models = this.client.getAvailableModels(request.provider);
    return {
      success: true,
      action: "models",
      data: {
        models
      }
    };
  }
  async handleCall(request) {
    let provider = request.provider;
    let model = request.model;
    if (!provider || !model) {
      const profile = request.taskProfile ?? {
        kind: "mechanical",
        estimatedComplexity: "low"
      };
      const decision = resolve(profile, this.policy);
      provider = provider ?? decision.target.provider;
      model = model ?? decision.target.model;
    }
    const result = await this.client.call({
      provider,
      model,
      tools: request.tools ?? [],
      messages: request.messages ?? []
    });
    return {
      success: true,
      action: "call",
      data: result
    };
  }
  handleRoute(request) {
    const profile = request.taskProfile ?? {
      kind: "mechanical",
      estimatedComplexity: "low"
    };
    const decision = resolve(profile, this.policy);
    return {
      success: true,
      action: "route",
      data: {
        target: decision.target,
        matchedRule: decision.matchedRule,
        reason: decision.reason
      }
    };
  }
  async handleCommit() {
    const { GitOps: GitOps2 } = await Promise.resolve().then(() => (init_gitOps(), exports_gitOps));
    const { splitDiff: splitDiff2 } = await Promise.resolve().then(() => exports_diffSplitter);
    const { generateCommitMessage: generateCommitMessage2 } = await Promise.resolve().then(() => (init_commitMessage(), exports_commitMessage));
    const gitOps = new GitOps2;
    const diff = await gitOps.getDiff() || await gitOps.getStagedDiff();
    if (!diff.trim()) {
      return {
        success: true,
        action: "commit",
        data: {
          message: "No uncommitted changes detected.",
          clusters: []
        }
      };
    }
    const clusters = splitDiff2(diff);
    const results = [];
    for (const cluster of clusters) {
      const message = await generateCommitMessage2(cluster, this.client, this.policy);
      results.push({
        id: cluster.id,
        files: cluster.files,
        message
      });
    }
    return {
      success: true,
      action: "commit",
      data: {
        clusters: results
      }
    };
  }
  async handlePR(request) {
    const { GitOps: GitOps2 } = await Promise.resolve().then(() => (init_gitOps(), exports_gitOps));
    const { generatePRDescription: generatePRDescription2 } = await Promise.resolve().then(() => (init_prDescription(), exports_prDescription));
    const baseBranch = request.baseBranch ?? "main";
    const gitOps = new GitOps2;
    const currentBranch = await gitOps.getCurrentBranch();
    const commits = await gitOps.getCommitHistory(baseBranch);
    const baseBranchDiff = await gitOps.getDiffAgainstBase(baseBranch);
    const prDescription = await generatePRDescription2(commits, baseBranchDiff, this.client, this.policy, currentBranch);
    return {
      success: true,
      action: "pr",
      data: {
        baseBranch,
        prDescription
      }
    };
  }
}
var init_bridge = () => {};

// src/ledger/types.ts
var EMPTY_LEDGER;
var init_types = __esm(() => {
  EMPTY_LEDGER = { entries: {} };
});

// node_modules/zod/v3/helpers/util.js
var util, objectUtil, ZodParsedType, getParsedType = (data) => {
  const t2 = typeof data;
  switch (t2) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};
var init_util2 = __esm(() => {
  (function(util2) {
    util2.assertEqual = (_2) => {};
    function assertIs(_arg) {}
    util2.assertIs = assertIs;
    function assertNever(_x) {
      throw new Error;
    }
    util2.assertNever = assertNever;
    util2.arrayToEnum = (items) => {
      const obj = {};
      for (const item of items) {
        obj[item] = item;
      }
      return obj;
    };
    util2.getValidEnumValues = (obj) => {
      const validKeys = util2.objectKeys(obj).filter((k2) => typeof obj[obj[k2]] !== "number");
      const filtered = {};
      for (const k2 of validKeys) {
        filtered[k2] = obj[k2];
      }
      return util2.objectValues(filtered);
    };
    util2.objectValues = (obj) => {
      return util2.objectKeys(obj).map(function(e) {
        return obj[e];
      });
    };
    util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
      const keys = [];
      for (const key in object) {
        if (Object.prototype.hasOwnProperty.call(object, key)) {
          keys.push(key);
        }
      }
      return keys;
    };
    util2.find = (arr, checker) => {
      for (const item of arr) {
        if (checker(item))
          return item;
      }
      return;
    };
    util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
    function joinValues(array, separator = " | ") {
      return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
    }
    util2.joinValues = joinValues;
    util2.jsonStringifyReplacer = (_2, value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      return value;
    };
  })(util || (util = {}));
  (function(objectUtil2) {
    objectUtil2.mergeShapes = (first2, second) => {
      return {
        ...first2,
        ...second
      };
    };
  })(objectUtil || (objectUtil = {}));
  ZodParsedType = util.arrayToEnum([
    "string",
    "nan",
    "number",
    "integer",
    "float",
    "boolean",
    "date",
    "bigint",
    "symbol",
    "function",
    "undefined",
    "null",
    "array",
    "object",
    "unknown",
    "promise",
    "void",
    "never",
    "map",
    "set"
  ]);
});

// node_modules/zod/v3/ZodError.js
var ZodIssueCode, quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
}, ZodError;
var init_ZodError = __esm(() => {
  init_util2();
  ZodIssueCode = util.arrayToEnum([
    "invalid_type",
    "invalid_literal",
    "custom",
    "invalid_union",
    "invalid_union_discriminator",
    "invalid_enum_value",
    "unrecognized_keys",
    "invalid_arguments",
    "invalid_return_type",
    "invalid_date",
    "invalid_string",
    "too_small",
    "too_big",
    "invalid_intersection_types",
    "not_multiple_of",
    "not_finite"
  ]);
  ZodError = class ZodError extends Error {
    get errors() {
      return this.issues;
    }
    constructor(issues) {
      super();
      this.issues = [];
      this.addIssue = (sub) => {
        this.issues = [...this.issues, sub];
      };
      this.addIssues = (subs = []) => {
        this.issues = [...this.issues, ...subs];
      };
      const actualProto = new.target.prototype;
      if (Object.setPrototypeOf) {
        Object.setPrototypeOf(this, actualProto);
      } else {
        this.__proto__ = actualProto;
      }
      this.name = "ZodError";
      this.issues = issues;
    }
    format(_mapper) {
      const mapper = _mapper || function(issue) {
        return issue.message;
      };
      const fieldErrors = { _errors: [] };
      const processError = (error) => {
        for (const issue of error.issues) {
          if (issue.code === "invalid_union") {
            issue.unionErrors.map(processError);
          } else if (issue.code === "invalid_return_type") {
            processError(issue.returnTypeError);
          } else if (issue.code === "invalid_arguments") {
            processError(issue.argumentsError);
          } else if (issue.path.length === 0) {
            fieldErrors._errors.push(mapper(issue));
          } else {
            let curr = fieldErrors;
            let i2 = 0;
            while (i2 < issue.path.length) {
              const el = issue.path[i2];
              const terminal = i2 === issue.path.length - 1;
              if (!terminal) {
                curr[el] = curr[el] || { _errors: [] };
              } else {
                curr[el] = curr[el] || { _errors: [] };
                curr[el]._errors.push(mapper(issue));
              }
              curr = curr[el];
              i2++;
            }
          }
        }
      };
      processError(this);
      return fieldErrors;
    }
    static assert(value) {
      if (!(value instanceof ZodError)) {
        throw new Error(`Not a ZodError: ${value}`);
      }
    }
    toString() {
      return this.message;
    }
    get message() {
      return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
    }
    get isEmpty() {
      return this.issues.length === 0;
    }
    flatten(mapper = (issue) => issue.message) {
      const fieldErrors = {};
      const formErrors = [];
      for (const sub of this.issues) {
        if (sub.path.length > 0) {
          const firstEl = sub.path[0];
          fieldErrors[firstEl] = fieldErrors[firstEl] || [];
          fieldErrors[firstEl].push(mapper(sub));
        } else {
          formErrors.push(mapper(sub));
        }
      }
      return { formErrors, fieldErrors };
    }
    get formErrors() {
      return this.flatten();
    }
  };
  ZodError.create = (issues) => {
    const error = new ZodError(issues);
    return error;
  };
});

// node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
}, en_default;
var init_en = __esm(() => {
  init_ZodError();
  init_util2();
  en_default = errorMap;
});

// node_modules/zod/v3/errors.js
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}
var overrideErrorMap;
var init_errors2 = __esm(() => {
  init_en();
  overrideErrorMap = en_default;
});

// node_modules/zod/v3/helpers/parseUtil.js
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      ctx.schemaErrorMap,
      overrideMap,
      overrideMap === en_default ? undefined : en_default
    ].filter((x2) => !!x2)
  });
  ctx.common.issues.push(issue);
}

class ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
}
var makeIssue = (params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== undefined) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
}, EMPTY_PATH, INVALID, DIRTY = (value) => ({ status: "dirty", value }), OK = (value) => ({ status: "valid", value }), isAborted = (x2) => x2.status === "aborted", isDirty = (x2) => x2.status === "dirty", isValid = (x2) => x2.status === "valid", isAsync = (x2) => typeof Promise !== "undefined" && x2 instanceof Promise;
var init_parseUtil = __esm(() => {
  init_errors2();
  init_en();
  EMPTY_PATH = [];
  INVALID = Object.freeze({
    status: "aborted"
  });
});

// node_modules/zod/v3/helpers/typeAliases.js
var init_typeAliases = () => {};

// node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
var init_errorUtil = __esm(() => {
  (function(errorUtil2) {
    errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
    errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
  })(errorUtil || (errorUtil = {}));
});

// node_modules/zod/v3/types.js
class ParseInputLazyPath {
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
}
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}

class ZodType {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus,
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(undefined).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
}
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
function mergeValues(a, b2) {
  const aType = getParsedType(a);
  const bType = getParsedType(b2);
  if (a === b2) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b2);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b2 };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b2[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b2.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0;index < a.length; index++) {
      const itemA = a[index];
      const itemB = b2[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b2) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
function cleanParams(params, data) {
  const p2 = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p22 = typeof p2 === "string" ? { message: p2 } : p2;
  return p22;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r2 = check(data);
      if (r2 instanceof Promise) {
        return r2.then((r3) => {
          if (!r3) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r2) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
}, cuidRegex, cuid2Regex, ulidRegex, uuidRegex, nanoidRegex, jwtRegex, durationRegex, emailRegex, _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`, emojiRegex, ipv4Regex, ipv4CidrRegex, ipv6Regex, ipv6CidrRegex, base64Regex, base64urlRegex, dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`, dateRegex, ZodString, ZodNumber, ZodBigInt, ZodBoolean, ZodDate, ZodSymbol, ZodUndefined, ZodNull, ZodAny, ZodUnknown, ZodNever, ZodVoid, ZodArray, ZodObject, ZodUnion, getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [undefined];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [undefined, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
}, ZodDiscriminatedUnion, ZodIntersection, ZodTuple, ZodRecord, ZodMap, ZodSet, ZodFunction, ZodLazy, ZodLiteral, ZodEnum, ZodNativeEnum, ZodPromise, ZodEffects, ZodOptional, ZodNullable, ZodDefault, ZodCatch, ZodNaN, BRAND, ZodBranded, ZodPipeline, ZodReadonly, late, ZodFirstPartyTypeKind, instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params), stringType, numberType, nanType, bigIntType, booleanType, dateType, symbolType, undefinedType, nullType, anyType, unknownType, neverType, voidType, arrayType, objectType, strictObjectType, unionType, discriminatedUnionType, intersectionType, tupleType, recordType, mapType, setType, functionType, lazyType, literalType, enumType, nativeEnumType, promiseType, effectsType, optionalType, nullableType, preprocessType, pipelineType, ostring = () => stringType().optional(), onumber = () => numberType().optional(), oboolean = () => booleanType().optional(), coerce, NEVER;
var init_types2 = __esm(() => {
  init_ZodError();
  init_errors2();
  init_errorUtil();
  init_parseUtil();
  init_util2();
  cuidRegex = /^c[^\s-]{8,}$/i;
  cuid2Regex = /^[0-9a-z]+$/;
  ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
  uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
  nanoidRegex = /^[a-z0-9_-]{21}$/i;
  jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
  durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
  emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
  ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
  ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
  ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
  ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
  base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
  base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
  dateRegex = new RegExp(`^${dateRegexSource}$`);
  ZodString = class ZodString extends ZodType {
    _parse(input) {
      if (this._def.coerce) {
        input.data = String(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.string) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.string,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      const status = new ParseStatus;
      let ctx = undefined;
      for (const check of this._def.checks) {
        if (check.kind === "min") {
          if (input.data.length < check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          if (input.data.length > check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "length") {
          const tooBig = input.data.length > check.value;
          const tooSmall = input.data.length < check.value;
          if (tooBig || tooSmall) {
            ctx = this._getOrReturnCtx(input, ctx);
            if (tooBig) {
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_big,
                maximum: check.value,
                type: "string",
                inclusive: true,
                exact: true,
                message: check.message
              });
            } else if (tooSmall) {
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_small,
                minimum: check.value,
                type: "string",
                inclusive: true,
                exact: true,
                message: check.message
              });
            }
            status.dirty();
          }
        } else if (check.kind === "email") {
          if (!emailRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "email",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "emoji") {
          if (!emojiRegex) {
            emojiRegex = new RegExp(_emojiRegex, "u");
          }
          if (!emojiRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "emoji",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "uuid") {
          if (!uuidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "uuid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "nanoid") {
          if (!nanoidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "nanoid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "cuid") {
          if (!cuidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "cuid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "cuid2") {
          if (!cuid2Regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "cuid2",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "ulid") {
          if (!ulidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "ulid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "url") {
          try {
            new URL(input.data);
          } catch {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "url",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "regex") {
          check.regex.lastIndex = 0;
          const testResult = check.regex.test(input.data);
          if (!testResult) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "regex",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "trim") {
          input.data = input.data.trim();
        } else if (check.kind === "includes") {
          if (!input.data.includes(check.value, check.position)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: { includes: check.value, position: check.position },
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "toLowerCase") {
          input.data = input.data.toLowerCase();
        } else if (check.kind === "toUpperCase") {
          input.data = input.data.toUpperCase();
        } else if (check.kind === "startsWith") {
          if (!input.data.startsWith(check.value)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: { startsWith: check.value },
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "endsWith") {
          if (!input.data.endsWith(check.value)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: { endsWith: check.value },
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "datetime") {
          const regex = datetimeRegex(check);
          if (!regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: "datetime",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "date") {
          const regex = dateRegex;
          if (!regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: "date",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "time") {
          const regex = timeRegex(check);
          if (!regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: "time",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "duration") {
          if (!durationRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "duration",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "ip") {
          if (!isValidIP(input.data, check.version)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "ip",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "jwt") {
          if (!isValidJWT(input.data, check.alg)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "jwt",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "cidr") {
          if (!isValidCidr(input.data, check.version)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "cidr",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "base64") {
          if (!base64Regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "base64",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "base64url") {
          if (!base64urlRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "base64url",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return { status: status.value, value: input.data };
    }
    _regex(regex, validation, message) {
      return this.refinement((data) => regex.test(data), {
        validation,
        code: ZodIssueCode.invalid_string,
        ...errorUtil.errToObj(message)
      });
    }
    _addCheck(check) {
      return new ZodString({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    email(message) {
      return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
    }
    url(message) {
      return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
    }
    emoji(message) {
      return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
    }
    uuid(message) {
      return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
    }
    nanoid(message) {
      return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
    }
    cuid(message) {
      return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
    }
    cuid2(message) {
      return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
    }
    ulid(message) {
      return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
    }
    base64(message) {
      return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
    }
    base64url(message) {
      return this._addCheck({
        kind: "base64url",
        ...errorUtil.errToObj(message)
      });
    }
    jwt(options) {
      return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
    }
    ip(options) {
      return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
    }
    cidr(options) {
      return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
    }
    datetime(options) {
      if (typeof options === "string") {
        return this._addCheck({
          kind: "datetime",
          precision: null,
          offset: false,
          local: false,
          message: options
        });
      }
      return this._addCheck({
        kind: "datetime",
        precision: typeof options?.precision === "undefined" ? null : options?.precision,
        offset: options?.offset ?? false,
        local: options?.local ?? false,
        ...errorUtil.errToObj(options?.message)
      });
    }
    date(message) {
      return this._addCheck({ kind: "date", message });
    }
    time(options) {
      if (typeof options === "string") {
        return this._addCheck({
          kind: "time",
          precision: null,
          message: options
        });
      }
      return this._addCheck({
        kind: "time",
        precision: typeof options?.precision === "undefined" ? null : options?.precision,
        ...errorUtil.errToObj(options?.message)
      });
    }
    duration(message) {
      return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
    }
    regex(regex, message) {
      return this._addCheck({
        kind: "regex",
        regex,
        ...errorUtil.errToObj(message)
      });
    }
    includes(value, options) {
      return this._addCheck({
        kind: "includes",
        value,
        position: options?.position,
        ...errorUtil.errToObj(options?.message)
      });
    }
    startsWith(value, message) {
      return this._addCheck({
        kind: "startsWith",
        value,
        ...errorUtil.errToObj(message)
      });
    }
    endsWith(value, message) {
      return this._addCheck({
        kind: "endsWith",
        value,
        ...errorUtil.errToObj(message)
      });
    }
    min(minLength, message) {
      return this._addCheck({
        kind: "min",
        value: minLength,
        ...errorUtil.errToObj(message)
      });
    }
    max(maxLength, message) {
      return this._addCheck({
        kind: "max",
        value: maxLength,
        ...errorUtil.errToObj(message)
      });
    }
    length(len, message) {
      return this._addCheck({
        kind: "length",
        value: len,
        ...errorUtil.errToObj(message)
      });
    }
    nonempty(message) {
      return this.min(1, errorUtil.errToObj(message));
    }
    trim() {
      return new ZodString({
        ...this._def,
        checks: [...this._def.checks, { kind: "trim" }]
      });
    }
    toLowerCase() {
      return new ZodString({
        ...this._def,
        checks: [...this._def.checks, { kind: "toLowerCase" }]
      });
    }
    toUpperCase() {
      return new ZodString({
        ...this._def,
        checks: [...this._def.checks, { kind: "toUpperCase" }]
      });
    }
    get isDatetime() {
      return !!this._def.checks.find((ch) => ch.kind === "datetime");
    }
    get isDate() {
      return !!this._def.checks.find((ch) => ch.kind === "date");
    }
    get isTime() {
      return !!this._def.checks.find((ch) => ch.kind === "time");
    }
    get isDuration() {
      return !!this._def.checks.find((ch) => ch.kind === "duration");
    }
    get isEmail() {
      return !!this._def.checks.find((ch) => ch.kind === "email");
    }
    get isURL() {
      return !!this._def.checks.find((ch) => ch.kind === "url");
    }
    get isEmoji() {
      return !!this._def.checks.find((ch) => ch.kind === "emoji");
    }
    get isUUID() {
      return !!this._def.checks.find((ch) => ch.kind === "uuid");
    }
    get isNANOID() {
      return !!this._def.checks.find((ch) => ch.kind === "nanoid");
    }
    get isCUID() {
      return !!this._def.checks.find((ch) => ch.kind === "cuid");
    }
    get isCUID2() {
      return !!this._def.checks.find((ch) => ch.kind === "cuid2");
    }
    get isULID() {
      return !!this._def.checks.find((ch) => ch.kind === "ulid");
    }
    get isIP() {
      return !!this._def.checks.find((ch) => ch.kind === "ip");
    }
    get isCIDR() {
      return !!this._def.checks.find((ch) => ch.kind === "cidr");
    }
    get isBase64() {
      return !!this._def.checks.find((ch) => ch.kind === "base64");
    }
    get isBase64url() {
      return !!this._def.checks.find((ch) => ch.kind === "base64url");
    }
    get minLength() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min;
    }
    get maxLength() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max;
    }
  };
  ZodString.create = (params) => {
    return new ZodString({
      checks: [],
      typeName: ZodFirstPartyTypeKind.ZodString,
      coerce: params?.coerce ?? false,
      ...processCreateParams(params)
    });
  };
  ZodNumber = class ZodNumber extends ZodType {
    constructor() {
      super(...arguments);
      this.min = this.gte;
      this.max = this.lte;
      this.step = this.multipleOf;
    }
    _parse(input) {
      if (this._def.coerce) {
        input.data = Number(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.number) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.number,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      let ctx = undefined;
      const status = new ParseStatus;
      for (const check of this._def.checks) {
        if (check.kind === "int") {
          if (!util.isInteger(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_type,
              expected: "integer",
              received: "float",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "min") {
          const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
          if (tooSmall) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "number",
              inclusive: check.inclusive,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
          if (tooBig) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "number",
              inclusive: check.inclusive,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "multipleOf") {
          if (floatSafeRemainder(input.data, check.value) !== 0) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.not_multiple_of,
              multipleOf: check.value,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "finite") {
          if (!Number.isFinite(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.not_finite,
              message: check.message
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return { status: status.value, value: input.data };
    }
    gte(value, message) {
      return this.setLimit("min", value, true, errorUtil.toString(message));
    }
    gt(value, message) {
      return this.setLimit("min", value, false, errorUtil.toString(message));
    }
    lte(value, message) {
      return this.setLimit("max", value, true, errorUtil.toString(message));
    }
    lt(value, message) {
      return this.setLimit("max", value, false, errorUtil.toString(message));
    }
    setLimit(kind, value, inclusive, message) {
      return new ZodNumber({
        ...this._def,
        checks: [
          ...this._def.checks,
          {
            kind,
            value,
            inclusive,
            message: errorUtil.toString(message)
          }
        ]
      });
    }
    _addCheck(check) {
      return new ZodNumber({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    int(message) {
      return this._addCheck({
        kind: "int",
        message: errorUtil.toString(message)
      });
    }
    positive(message) {
      return this._addCheck({
        kind: "min",
        value: 0,
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    negative(message) {
      return this._addCheck({
        kind: "max",
        value: 0,
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    nonpositive(message) {
      return this._addCheck({
        kind: "max",
        value: 0,
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    nonnegative(message) {
      return this._addCheck({
        kind: "min",
        value: 0,
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    multipleOf(value, message) {
      return this._addCheck({
        kind: "multipleOf",
        value,
        message: errorUtil.toString(message)
      });
    }
    finite(message) {
      return this._addCheck({
        kind: "finite",
        message: errorUtil.toString(message)
      });
    }
    safe(message) {
      return this._addCheck({
        kind: "min",
        inclusive: true,
        value: Number.MIN_SAFE_INTEGER,
        message: errorUtil.toString(message)
      })._addCheck({
        kind: "max",
        inclusive: true,
        value: Number.MAX_SAFE_INTEGER,
        message: errorUtil.toString(message)
      });
    }
    get minValue() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min;
    }
    get maxValue() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max;
    }
    get isInt() {
      return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
    }
    get isFinite() {
      let max = null;
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
          return true;
        } else if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        } else if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return Number.isFinite(min) && Number.isFinite(max);
    }
  };
  ZodNumber.create = (params) => {
    return new ZodNumber({
      checks: [],
      typeName: ZodFirstPartyTypeKind.ZodNumber,
      coerce: params?.coerce || false,
      ...processCreateParams(params)
    });
  };
  ZodBigInt = class ZodBigInt extends ZodType {
    constructor() {
      super(...arguments);
      this.min = this.gte;
      this.max = this.lte;
    }
    _parse(input) {
      if (this._def.coerce) {
        try {
          input.data = BigInt(input.data);
        } catch {
          return this._getInvalidInput(input);
        }
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.bigint) {
        return this._getInvalidInput(input);
      }
      let ctx = undefined;
      const status = new ParseStatus;
      for (const check of this._def.checks) {
        if (check.kind === "min") {
          const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
          if (tooSmall) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              type: "bigint",
              minimum: check.value,
              inclusive: check.inclusive,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
          if (tooBig) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              type: "bigint",
              maximum: check.value,
              inclusive: check.inclusive,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "multipleOf") {
          if (input.data % check.value !== BigInt(0)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.not_multiple_of,
              multipleOf: check.value,
              message: check.message
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return { status: status.value, value: input.data };
    }
    _getInvalidInput(input) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.bigint,
        received: ctx.parsedType
      });
      return INVALID;
    }
    gte(value, message) {
      return this.setLimit("min", value, true, errorUtil.toString(message));
    }
    gt(value, message) {
      return this.setLimit("min", value, false, errorUtil.toString(message));
    }
    lte(value, message) {
      return this.setLimit("max", value, true, errorUtil.toString(message));
    }
    lt(value, message) {
      return this.setLimit("max", value, false, errorUtil.toString(message));
    }
    setLimit(kind, value, inclusive, message) {
      return new ZodBigInt({
        ...this._def,
        checks: [
          ...this._def.checks,
          {
            kind,
            value,
            inclusive,
            message: errorUtil.toString(message)
          }
        ]
      });
    }
    _addCheck(check) {
      return new ZodBigInt({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    positive(message) {
      return this._addCheck({
        kind: "min",
        value: BigInt(0),
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    negative(message) {
      return this._addCheck({
        kind: "max",
        value: BigInt(0),
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    nonpositive(message) {
      return this._addCheck({
        kind: "max",
        value: BigInt(0),
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    nonnegative(message) {
      return this._addCheck({
        kind: "min",
        value: BigInt(0),
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    multipleOf(value, message) {
      return this._addCheck({
        kind: "multipleOf",
        value,
        message: errorUtil.toString(message)
      });
    }
    get minValue() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min;
    }
    get maxValue() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max;
    }
  };
  ZodBigInt.create = (params) => {
    return new ZodBigInt({
      checks: [],
      typeName: ZodFirstPartyTypeKind.ZodBigInt,
      coerce: params?.coerce ?? false,
      ...processCreateParams(params)
    });
  };
  ZodBoolean = class ZodBoolean extends ZodType {
    _parse(input) {
      if (this._def.coerce) {
        input.data = Boolean(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.boolean) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.boolean,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodBoolean.create = (params) => {
    return new ZodBoolean({
      typeName: ZodFirstPartyTypeKind.ZodBoolean,
      coerce: params?.coerce || false,
      ...processCreateParams(params)
    });
  };
  ZodDate = class ZodDate extends ZodType {
    _parse(input) {
      if (this._def.coerce) {
        input.data = new Date(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.date) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.date,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      if (Number.isNaN(input.data.getTime())) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_date
        });
        return INVALID;
      }
      const status = new ParseStatus;
      let ctx = undefined;
      for (const check of this._def.checks) {
        if (check.kind === "min") {
          if (input.data.getTime() < check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              message: check.message,
              inclusive: true,
              exact: false,
              minimum: check.value,
              type: "date"
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          if (input.data.getTime() > check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              message: check.message,
              inclusive: true,
              exact: false,
              maximum: check.value,
              type: "date"
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return {
        status: status.value,
        value: new Date(input.data.getTime())
      };
    }
    _addCheck(check) {
      return new ZodDate({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    min(minDate, message) {
      return this._addCheck({
        kind: "min",
        value: minDate.getTime(),
        message: errorUtil.toString(message)
      });
    }
    max(maxDate, message) {
      return this._addCheck({
        kind: "max",
        value: maxDate.getTime(),
        message: errorUtil.toString(message)
      });
    }
    get minDate() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min != null ? new Date(min) : null;
    }
    get maxDate() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max != null ? new Date(max) : null;
    }
  };
  ZodDate.create = (params) => {
    return new ZodDate({
      checks: [],
      coerce: params?.coerce || false,
      typeName: ZodFirstPartyTypeKind.ZodDate,
      ...processCreateParams(params)
    });
  };
  ZodSymbol = class ZodSymbol extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.symbol) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.symbol,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodSymbol.create = (params) => {
    return new ZodSymbol({
      typeName: ZodFirstPartyTypeKind.ZodSymbol,
      ...processCreateParams(params)
    });
  };
  ZodUndefined = class ZodUndefined extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.undefined) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.undefined,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodUndefined.create = (params) => {
    return new ZodUndefined({
      typeName: ZodFirstPartyTypeKind.ZodUndefined,
      ...processCreateParams(params)
    });
  };
  ZodNull = class ZodNull extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.null) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.null,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodNull.create = (params) => {
    return new ZodNull({
      typeName: ZodFirstPartyTypeKind.ZodNull,
      ...processCreateParams(params)
    });
  };
  ZodAny = class ZodAny extends ZodType {
    constructor() {
      super(...arguments);
      this._any = true;
    }
    _parse(input) {
      return OK(input.data);
    }
  };
  ZodAny.create = (params) => {
    return new ZodAny({
      typeName: ZodFirstPartyTypeKind.ZodAny,
      ...processCreateParams(params)
    });
  };
  ZodUnknown = class ZodUnknown extends ZodType {
    constructor() {
      super(...arguments);
      this._unknown = true;
    }
    _parse(input) {
      return OK(input.data);
    }
  };
  ZodUnknown.create = (params) => {
    return new ZodUnknown({
      typeName: ZodFirstPartyTypeKind.ZodUnknown,
      ...processCreateParams(params)
    });
  };
  ZodNever = class ZodNever extends ZodType {
    _parse(input) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.never,
        received: ctx.parsedType
      });
      return INVALID;
    }
  };
  ZodNever.create = (params) => {
    return new ZodNever({
      typeName: ZodFirstPartyTypeKind.ZodNever,
      ...processCreateParams(params)
    });
  };
  ZodVoid = class ZodVoid extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.undefined) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.void,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodVoid.create = (params) => {
    return new ZodVoid({
      typeName: ZodFirstPartyTypeKind.ZodVoid,
      ...processCreateParams(params)
    });
  };
  ZodArray = class ZodArray extends ZodType {
    _parse(input) {
      const { ctx, status } = this._processInputParams(input);
      const def = this._def;
      if (ctx.parsedType !== ZodParsedType.array) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.array,
          received: ctx.parsedType
        });
        return INVALID;
      }
      if (def.exactLength !== null) {
        const tooBig = ctx.data.length > def.exactLength.value;
        const tooSmall = ctx.data.length < def.exactLength.value;
        if (tooBig || tooSmall) {
          addIssueToContext(ctx, {
            code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
            minimum: tooSmall ? def.exactLength.value : undefined,
            maximum: tooBig ? def.exactLength.value : undefined,
            type: "array",
            inclusive: true,
            exact: true,
            message: def.exactLength.message
          });
          status.dirty();
        }
      }
      if (def.minLength !== null) {
        if (ctx.data.length < def.minLength.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: def.minLength.value,
            type: "array",
            inclusive: true,
            exact: false,
            message: def.minLength.message
          });
          status.dirty();
        }
      }
      if (def.maxLength !== null) {
        if (ctx.data.length > def.maxLength.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: def.maxLength.value,
            type: "array",
            inclusive: true,
            exact: false,
            message: def.maxLength.message
          });
          status.dirty();
        }
      }
      if (ctx.common.async) {
        return Promise.all([...ctx.data].map((item, i2) => {
          return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i2));
        })).then((result2) => {
          return ParseStatus.mergeArray(status, result2);
        });
      }
      const result = [...ctx.data].map((item, i2) => {
        return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i2));
      });
      return ParseStatus.mergeArray(status, result);
    }
    get element() {
      return this._def.type;
    }
    min(minLength, message) {
      return new ZodArray({
        ...this._def,
        minLength: { value: minLength, message: errorUtil.toString(message) }
      });
    }
    max(maxLength, message) {
      return new ZodArray({
        ...this._def,
        maxLength: { value: maxLength, message: errorUtil.toString(message) }
      });
    }
    length(len, message) {
      return new ZodArray({
        ...this._def,
        exactLength: { value: len, message: errorUtil.toString(message) }
      });
    }
    nonempty(message) {
      return this.min(1, message);
    }
  };
  ZodArray.create = (schema, params) => {
    return new ZodArray({
      type: schema,
      minLength: null,
      maxLength: null,
      exactLength: null,
      typeName: ZodFirstPartyTypeKind.ZodArray,
      ...processCreateParams(params)
    });
  };
  ZodObject = class ZodObject extends ZodType {
    constructor() {
      super(...arguments);
      this._cached = null;
      this.nonstrict = this.passthrough;
      this.augment = this.extend;
    }
    _getCached() {
      if (this._cached !== null)
        return this._cached;
      const shape = this._def.shape();
      const keys = util.objectKeys(shape);
      this._cached = { shape, keys };
      return this._cached;
    }
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.object) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.object,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      const { status, ctx } = this._processInputParams(input);
      const { shape, keys: shapeKeys } = this._getCached();
      const extraKeys = [];
      if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
        for (const key in ctx.data) {
          if (!shapeKeys.includes(key)) {
            extraKeys.push(key);
          }
        }
      }
      const pairs = [];
      for (const key of shapeKeys) {
        const keyValidator = shape[key];
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
          alwaysSet: key in ctx.data
        });
      }
      if (this._def.catchall instanceof ZodNever) {
        const unknownKeys = this._def.unknownKeys;
        if (unknownKeys === "passthrough") {
          for (const key of extraKeys) {
            pairs.push({
              key: { status: "valid", value: key },
              value: { status: "valid", value: ctx.data[key] }
            });
          }
        } else if (unknownKeys === "strict") {
          if (extraKeys.length > 0) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.unrecognized_keys,
              keys: extraKeys
            });
            status.dirty();
          }
        } else if (unknownKeys === "strip") {} else {
          throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
        }
      } else {
        const catchall = this._def.catchall;
        for (const key of extraKeys) {
          const value = ctx.data[key];
          pairs.push({
            key: { status: "valid", value: key },
            value: catchall._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
            alwaysSet: key in ctx.data
          });
        }
      }
      if (ctx.common.async) {
        return Promise.resolve().then(async () => {
          const syncPairs = [];
          for (const pair of pairs) {
            const key = await pair.key;
            const value = await pair.value;
            syncPairs.push({
              key,
              value,
              alwaysSet: pair.alwaysSet
            });
          }
          return syncPairs;
        }).then((syncPairs) => {
          return ParseStatus.mergeObjectSync(status, syncPairs);
        });
      } else {
        return ParseStatus.mergeObjectSync(status, pairs);
      }
    }
    get shape() {
      return this._def.shape();
    }
    strict(message) {
      errorUtil.errToObj;
      return new ZodObject({
        ...this._def,
        unknownKeys: "strict",
        ...message !== undefined ? {
          errorMap: (issue, ctx) => {
            const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
            if (issue.code === "unrecognized_keys")
              return {
                message: errorUtil.errToObj(message).message ?? defaultError
              };
            return {
              message: defaultError
            };
          }
        } : {}
      });
    }
    strip() {
      return new ZodObject({
        ...this._def,
        unknownKeys: "strip"
      });
    }
    passthrough() {
      return new ZodObject({
        ...this._def,
        unknownKeys: "passthrough"
      });
    }
    extend(augmentation) {
      return new ZodObject({
        ...this._def,
        shape: () => ({
          ...this._def.shape(),
          ...augmentation
        })
      });
    }
    merge(merging) {
      const merged = new ZodObject({
        unknownKeys: merging._def.unknownKeys,
        catchall: merging._def.catchall,
        shape: () => ({
          ...this._def.shape(),
          ...merging._def.shape()
        }),
        typeName: ZodFirstPartyTypeKind.ZodObject
      });
      return merged;
    }
    setKey(key, schema) {
      return this.augment({ [key]: schema });
    }
    catchall(index) {
      return new ZodObject({
        ...this._def,
        catchall: index
      });
    }
    pick(mask) {
      const shape = {};
      for (const key of util.objectKeys(mask)) {
        if (mask[key] && this.shape[key]) {
          shape[key] = this.shape[key];
        }
      }
      return new ZodObject({
        ...this._def,
        shape: () => shape
      });
    }
    omit(mask) {
      const shape = {};
      for (const key of util.objectKeys(this.shape)) {
        if (!mask[key]) {
          shape[key] = this.shape[key];
        }
      }
      return new ZodObject({
        ...this._def,
        shape: () => shape
      });
    }
    deepPartial() {
      return deepPartialify(this);
    }
    partial(mask) {
      const newShape = {};
      for (const key of util.objectKeys(this.shape)) {
        const fieldSchema = this.shape[key];
        if (mask && !mask[key]) {
          newShape[key] = fieldSchema;
        } else {
          newShape[key] = fieldSchema.optional();
        }
      }
      return new ZodObject({
        ...this._def,
        shape: () => newShape
      });
    }
    required(mask) {
      const newShape = {};
      for (const key of util.objectKeys(this.shape)) {
        if (mask && !mask[key]) {
          newShape[key] = this.shape[key];
        } else {
          const fieldSchema = this.shape[key];
          let newField = fieldSchema;
          while (newField instanceof ZodOptional) {
            newField = newField._def.innerType;
          }
          newShape[key] = newField;
        }
      }
      return new ZodObject({
        ...this._def,
        shape: () => newShape
      });
    }
    keyof() {
      return createZodEnum(util.objectKeys(this.shape));
    }
  };
  ZodObject.create = (shape, params) => {
    return new ZodObject({
      shape: () => shape,
      unknownKeys: "strip",
      catchall: ZodNever.create(),
      typeName: ZodFirstPartyTypeKind.ZodObject,
      ...processCreateParams(params)
    });
  };
  ZodObject.strictCreate = (shape, params) => {
    return new ZodObject({
      shape: () => shape,
      unknownKeys: "strict",
      catchall: ZodNever.create(),
      typeName: ZodFirstPartyTypeKind.ZodObject,
      ...processCreateParams(params)
    });
  };
  ZodObject.lazycreate = (shape, params) => {
    return new ZodObject({
      shape,
      unknownKeys: "strip",
      catchall: ZodNever.create(),
      typeName: ZodFirstPartyTypeKind.ZodObject,
      ...processCreateParams(params)
    });
  };
  ZodUnion = class ZodUnion extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const options = this._def.options;
      function handleResults(results) {
        for (const result of results) {
          if (result.result.status === "valid") {
            return result.result;
          }
        }
        for (const result of results) {
          if (result.result.status === "dirty") {
            ctx.common.issues.push(...result.ctx.common.issues);
            return result.result;
          }
        }
        const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_union,
          unionErrors
        });
        return INVALID;
      }
      if (ctx.common.async) {
        return Promise.all(options.map(async (option) => {
          const childCtx = {
            ...ctx,
            common: {
              ...ctx.common,
              issues: []
            },
            parent: null
          };
          return {
            result: await option._parseAsync({
              data: ctx.data,
              path: ctx.path,
              parent: childCtx
            }),
            ctx: childCtx
          };
        })).then(handleResults);
      } else {
        let dirty = undefined;
        const issues = [];
        for (const option of options) {
          const childCtx = {
            ...ctx,
            common: {
              ...ctx.common,
              issues: []
            },
            parent: null
          };
          const result = option._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          });
          if (result.status === "valid") {
            return result;
          } else if (result.status === "dirty" && !dirty) {
            dirty = { result, ctx: childCtx };
          }
          if (childCtx.common.issues.length) {
            issues.push(childCtx.common.issues);
          }
        }
        if (dirty) {
          ctx.common.issues.push(...dirty.ctx.common.issues);
          return dirty.result;
        }
        const unionErrors = issues.map((issues2) => new ZodError(issues2));
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_union,
          unionErrors
        });
        return INVALID;
      }
    }
    get options() {
      return this._def.options;
    }
  };
  ZodUnion.create = (types, params) => {
    return new ZodUnion({
      options: types,
      typeName: ZodFirstPartyTypeKind.ZodUnion,
      ...processCreateParams(params)
    });
  };
  ZodDiscriminatedUnion = class ZodDiscriminatedUnion extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.object) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.object,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const discriminator = this.discriminator;
      const discriminatorValue = ctx.data[discriminator];
      const option = this.optionsMap.get(discriminatorValue);
      if (!option) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_union_discriminator,
          options: Array.from(this.optionsMap.keys()),
          path: [discriminator]
        });
        return INVALID;
      }
      if (ctx.common.async) {
        return option._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
      } else {
        return option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
      }
    }
    get discriminator() {
      return this._def.discriminator;
    }
    get options() {
      return this._def.options;
    }
    get optionsMap() {
      return this._def.optionsMap;
    }
    static create(discriminator, options, params) {
      const optionsMap = new Map;
      for (const type of options) {
        const discriminatorValues = getDiscriminator(type.shape[discriminator]);
        if (!discriminatorValues.length) {
          throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
        }
        for (const value of discriminatorValues) {
          if (optionsMap.has(value)) {
            throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
          }
          optionsMap.set(value, type);
        }
      }
      return new ZodDiscriminatedUnion({
        typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
        discriminator,
        options,
        optionsMap,
        ...processCreateParams(params)
      });
    }
  };
  ZodIntersection = class ZodIntersection extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      const handleParsed = (parsedLeft, parsedRight) => {
        if (isAborted(parsedLeft) || isAborted(parsedRight)) {
          return INVALID;
        }
        const merged = mergeValues(parsedLeft.value, parsedRight.value);
        if (!merged.valid) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_intersection_types
          });
          return INVALID;
        }
        if (isDirty(parsedLeft) || isDirty(parsedRight)) {
          status.dirty();
        }
        return { status: status.value, value: merged.data };
      };
      if (ctx.common.async) {
        return Promise.all([
          this._def.left._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          }),
          this._def.right._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          })
        ]).then(([left, right]) => handleParsed(left, right));
      } else {
        return handleParsed(this._def.left._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }), this._def.right._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }));
      }
    }
  };
  ZodIntersection.create = (left, right, params) => {
    return new ZodIntersection({
      left,
      right,
      typeName: ZodFirstPartyTypeKind.ZodIntersection,
      ...processCreateParams(params)
    });
  };
  ZodTuple = class ZodTuple extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.array) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.array,
          received: ctx.parsedType
        });
        return INVALID;
      }
      if (ctx.data.length < this._def.items.length) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: this._def.items.length,
          inclusive: true,
          exact: false,
          type: "array"
        });
        return INVALID;
      }
      const rest = this._def.rest;
      if (!rest && ctx.data.length > this._def.items.length) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: this._def.items.length,
          inclusive: true,
          exact: false,
          type: "array"
        });
        status.dirty();
      }
      const items = [...ctx.data].map((item, itemIndex) => {
        const schema = this._def.items[itemIndex] || this._def.rest;
        if (!schema)
          return null;
        return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
      }).filter((x2) => !!x2);
      if (ctx.common.async) {
        return Promise.all(items).then((results) => {
          return ParseStatus.mergeArray(status, results);
        });
      } else {
        return ParseStatus.mergeArray(status, items);
      }
    }
    get items() {
      return this._def.items;
    }
    rest(rest) {
      return new ZodTuple({
        ...this._def,
        rest
      });
    }
  };
  ZodTuple.create = (schemas, params) => {
    if (!Array.isArray(schemas)) {
      throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
    }
    return new ZodTuple({
      items: schemas,
      typeName: ZodFirstPartyTypeKind.ZodTuple,
      rest: null,
      ...processCreateParams(params)
    });
  };
  ZodRecord = class ZodRecord extends ZodType {
    get keySchema() {
      return this._def.keyType;
    }
    get valueSchema() {
      return this._def.valueType;
    }
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.object) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.object,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const pairs = [];
      const keyType = this._def.keyType;
      const valueType = this._def.valueType;
      for (const key in ctx.data) {
        pairs.push({
          key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
          value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
          alwaysSet: key in ctx.data
        });
      }
      if (ctx.common.async) {
        return ParseStatus.mergeObjectAsync(status, pairs);
      } else {
        return ParseStatus.mergeObjectSync(status, pairs);
      }
    }
    get element() {
      return this._def.valueType;
    }
    static create(first2, second, third) {
      if (second instanceof ZodType) {
        return new ZodRecord({
          keyType: first2,
          valueType: second,
          typeName: ZodFirstPartyTypeKind.ZodRecord,
          ...processCreateParams(third)
        });
      }
      return new ZodRecord({
        keyType: ZodString.create(),
        valueType: first2,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(second)
      });
    }
  };
  ZodMap = class ZodMap extends ZodType {
    get keySchema() {
      return this._def.keyType;
    }
    get valueSchema() {
      return this._def.valueType;
    }
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.map) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.map,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const keyType = this._def.keyType;
      const valueType = this._def.valueType;
      const pairs = [...ctx.data.entries()].map(([key, value], index) => {
        return {
          key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
          value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
        };
      });
      if (ctx.common.async) {
        const finalMap = new Map;
        return Promise.resolve().then(async () => {
          for (const pair of pairs) {
            const key = await pair.key;
            const value = await pair.value;
            if (key.status === "aborted" || value.status === "aborted") {
              return INVALID;
            }
            if (key.status === "dirty" || value.status === "dirty") {
              status.dirty();
            }
            finalMap.set(key.value, value.value);
          }
          return { status: status.value, value: finalMap };
        });
      } else {
        const finalMap = new Map;
        for (const pair of pairs) {
          const key = pair.key;
          const value = pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      }
    }
  };
  ZodMap.create = (keyType, valueType, params) => {
    return new ZodMap({
      valueType,
      keyType,
      typeName: ZodFirstPartyTypeKind.ZodMap,
      ...processCreateParams(params)
    });
  };
  ZodSet = class ZodSet extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.set) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.set,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const def = this._def;
      if (def.minSize !== null) {
        if (ctx.data.size < def.minSize.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: def.minSize.value,
            type: "set",
            inclusive: true,
            exact: false,
            message: def.minSize.message
          });
          status.dirty();
        }
      }
      if (def.maxSize !== null) {
        if (ctx.data.size > def.maxSize.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: def.maxSize.value,
            type: "set",
            inclusive: true,
            exact: false,
            message: def.maxSize.message
          });
          status.dirty();
        }
      }
      const valueType = this._def.valueType;
      function finalizeSet(elements2) {
        const parsedSet = new Set;
        for (const element of elements2) {
          if (element.status === "aborted")
            return INVALID;
          if (element.status === "dirty")
            status.dirty();
          parsedSet.add(element.value);
        }
        return { status: status.value, value: parsedSet };
      }
      const elements = [...ctx.data.values()].map((item, i2) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i2)));
      if (ctx.common.async) {
        return Promise.all(elements).then((elements2) => finalizeSet(elements2));
      } else {
        return finalizeSet(elements);
      }
    }
    min(minSize, message) {
      return new ZodSet({
        ...this._def,
        minSize: { value: minSize, message: errorUtil.toString(message) }
      });
    }
    max(maxSize, message) {
      return new ZodSet({
        ...this._def,
        maxSize: { value: maxSize, message: errorUtil.toString(message) }
      });
    }
    size(size, message) {
      return this.min(size, message).max(size, message);
    }
    nonempty(message) {
      return this.min(1, message);
    }
  };
  ZodSet.create = (valueType, params) => {
    return new ZodSet({
      valueType,
      minSize: null,
      maxSize: null,
      typeName: ZodFirstPartyTypeKind.ZodSet,
      ...processCreateParams(params)
    });
  };
  ZodFunction = class ZodFunction extends ZodType {
    constructor() {
      super(...arguments);
      this.validate = this.implement;
    }
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.function) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.function,
          received: ctx.parsedType
        });
        return INVALID;
      }
      function makeArgsIssue(args, error) {
        return makeIssue({
          data: args,
          path: ctx.path,
          errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x2) => !!x2),
          issueData: {
            code: ZodIssueCode.invalid_arguments,
            argumentsError: error
          }
        });
      }
      function makeReturnsIssue(returns, error) {
        return makeIssue({
          data: returns,
          path: ctx.path,
          errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x2) => !!x2),
          issueData: {
            code: ZodIssueCode.invalid_return_type,
            returnTypeError: error
          }
        });
      }
      const params = { errorMap: ctx.common.contextualErrorMap };
      const fn = ctx.data;
      if (this._def.returns instanceof ZodPromise) {
        const me = this;
        return OK(async function(...args) {
          const error = new ZodError([]);
          const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
            error.addIssue(makeArgsIssue(args, e));
            throw error;
          });
          const result = await Reflect.apply(fn, this, parsedArgs);
          const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
            error.addIssue(makeReturnsIssue(result, e));
            throw error;
          });
          return parsedReturns;
        });
      } else {
        const me = this;
        return OK(function(...args) {
          const parsedArgs = me._def.args.safeParse(args, params);
          if (!parsedArgs.success) {
            throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
          }
          const result = Reflect.apply(fn, this, parsedArgs.data);
          const parsedReturns = me._def.returns.safeParse(result, params);
          if (!parsedReturns.success) {
            throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
          }
          return parsedReturns.data;
        });
      }
    }
    parameters() {
      return this._def.args;
    }
    returnType() {
      return this._def.returns;
    }
    args(...items) {
      return new ZodFunction({
        ...this._def,
        args: ZodTuple.create(items).rest(ZodUnknown.create())
      });
    }
    returns(returnType) {
      return new ZodFunction({
        ...this._def,
        returns: returnType
      });
    }
    implement(func) {
      const validatedFunc = this.parse(func);
      return validatedFunc;
    }
    strictImplement(func) {
      const validatedFunc = this.parse(func);
      return validatedFunc;
    }
    static create(args, returns, params) {
      return new ZodFunction({
        args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
        returns: returns || ZodUnknown.create(),
        typeName: ZodFirstPartyTypeKind.ZodFunction,
        ...processCreateParams(params)
      });
    }
  };
  ZodLazy = class ZodLazy extends ZodType {
    get schema() {
      return this._def.getter();
    }
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const lazySchema = this._def.getter();
      return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
    }
  };
  ZodLazy.create = (getter, params) => {
    return new ZodLazy({
      getter,
      typeName: ZodFirstPartyTypeKind.ZodLazy,
      ...processCreateParams(params)
    });
  };
  ZodLiteral = class ZodLiteral extends ZodType {
    _parse(input) {
      if (input.data !== this._def.value) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          received: ctx.data,
          code: ZodIssueCode.invalid_literal,
          expected: this._def.value
        });
        return INVALID;
      }
      return { status: "valid", value: input.data };
    }
    get value() {
      return this._def.value;
    }
  };
  ZodLiteral.create = (value, params) => {
    return new ZodLiteral({
      value,
      typeName: ZodFirstPartyTypeKind.ZodLiteral,
      ...processCreateParams(params)
    });
  };
  ZodEnum = class ZodEnum extends ZodType {
    _parse(input) {
      if (typeof input.data !== "string") {
        const ctx = this._getOrReturnCtx(input);
        const expectedValues = this._def.values;
        addIssueToContext(ctx, {
          expected: util.joinValues(expectedValues),
          received: ctx.parsedType,
          code: ZodIssueCode.invalid_type
        });
        return INVALID;
      }
      if (!this._cache) {
        this._cache = new Set(this._def.values);
      }
      if (!this._cache.has(input.data)) {
        const ctx = this._getOrReturnCtx(input);
        const expectedValues = this._def.values;
        addIssueToContext(ctx, {
          received: ctx.data,
          code: ZodIssueCode.invalid_enum_value,
          options: expectedValues
        });
        return INVALID;
      }
      return OK(input.data);
    }
    get options() {
      return this._def.values;
    }
    get enum() {
      const enumValues = {};
      for (const val of this._def.values) {
        enumValues[val] = val;
      }
      return enumValues;
    }
    get Values() {
      const enumValues = {};
      for (const val of this._def.values) {
        enumValues[val] = val;
      }
      return enumValues;
    }
    get Enum() {
      const enumValues = {};
      for (const val of this._def.values) {
        enumValues[val] = val;
      }
      return enumValues;
    }
    extract(values, newDef = this._def) {
      return ZodEnum.create(values, {
        ...this._def,
        ...newDef
      });
    }
    exclude(values, newDef = this._def) {
      return ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
        ...this._def,
        ...newDef
      });
    }
  };
  ZodEnum.create = createZodEnum;
  ZodNativeEnum = class ZodNativeEnum extends ZodType {
    _parse(input) {
      const nativeEnumValues = util.getValidEnumValues(this._def.values);
      const ctx = this._getOrReturnCtx(input);
      if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
        const expectedValues = util.objectValues(nativeEnumValues);
        addIssueToContext(ctx, {
          expected: util.joinValues(expectedValues),
          received: ctx.parsedType,
          code: ZodIssueCode.invalid_type
        });
        return INVALID;
      }
      if (!this._cache) {
        this._cache = new Set(util.getValidEnumValues(this._def.values));
      }
      if (!this._cache.has(input.data)) {
        const expectedValues = util.objectValues(nativeEnumValues);
        addIssueToContext(ctx, {
          received: ctx.data,
          code: ZodIssueCode.invalid_enum_value,
          options: expectedValues
        });
        return INVALID;
      }
      return OK(input.data);
    }
    get enum() {
      return this._def.values;
    }
  };
  ZodNativeEnum.create = (values, params) => {
    return new ZodNativeEnum({
      values,
      typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
      ...processCreateParams(params)
    });
  };
  ZodPromise = class ZodPromise extends ZodType {
    unwrap() {
      return this._def.type;
    }
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.promise,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
      return OK(promisified.then((data) => {
        return this._def.type.parseAsync(data, {
          path: ctx.path,
          errorMap: ctx.common.contextualErrorMap
        });
      }));
    }
  };
  ZodPromise.create = (schema, params) => {
    return new ZodPromise({
      type: schema,
      typeName: ZodFirstPartyTypeKind.ZodPromise,
      ...processCreateParams(params)
    });
  };
  ZodEffects = class ZodEffects extends ZodType {
    innerType() {
      return this._def.schema;
    }
    sourceType() {
      return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
    }
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      const effect = this._def.effect || null;
      const checkCtx = {
        addIssue: (arg) => {
          addIssueToContext(ctx, arg);
          if (arg.fatal) {
            status.abort();
          } else {
            status.dirty();
          }
        },
        get path() {
          return ctx.path;
        }
      };
      checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
      if (effect.type === "preprocess") {
        const processed = effect.transform(ctx.data, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(processed).then(async (processed2) => {
            if (status.value === "aborted")
              return INVALID;
            const result = await this._def.schema._parseAsync({
              data: processed2,
              path: ctx.path,
              parent: ctx
            });
            if (result.status === "aborted")
              return INVALID;
            if (result.status === "dirty")
              return DIRTY(result.value);
            if (status.value === "dirty")
              return DIRTY(result.value);
            return result;
          });
        } else {
          if (status.value === "aborted")
            return INVALID;
          const result = this._def.schema._parseSync({
            data: processed,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        }
      }
      if (effect.type === "refinement") {
        const executeRefinement = (acc) => {
          const result = effect.refinement(acc, checkCtx);
          if (ctx.common.async) {
            return Promise.resolve(result);
          }
          if (result instanceof Promise) {
            throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
          }
          return acc;
        };
        if (ctx.common.async === false) {
          const inner = this._def.schema._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          executeRefinement(inner.value);
          return { status: status.value, value: inner.value };
        } else {
          return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
            if (inner.status === "aborted")
              return INVALID;
            if (inner.status === "dirty")
              status.dirty();
            return executeRefinement(inner.value).then(() => {
              return { status: status.value, value: inner.value };
            });
          });
        }
      }
      if (effect.type === "transform") {
        if (ctx.common.async === false) {
          const base = this._def.schema._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
          if (!isValid(base))
            return INVALID;
          const result = effect.transform(base.value, checkCtx);
          if (result instanceof Promise) {
            throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
          }
          return { status: status.value, value: result };
        } else {
          return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
            if (!isValid(base))
              return INVALID;
            return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
              status: status.value,
              value: result
            }));
          });
        }
      }
      util.assertNever(effect);
    }
  };
  ZodEffects.create = (schema, effect, params) => {
    return new ZodEffects({
      schema,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect,
      ...processCreateParams(params)
    });
  };
  ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
    return new ZodEffects({
      schema,
      effect: { type: "preprocess", transform: preprocess },
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      ...processCreateParams(params)
    });
  };
  ZodOptional = class ZodOptional extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType === ZodParsedType.undefined) {
        return OK(undefined);
      }
      return this._def.innerType._parse(input);
    }
    unwrap() {
      return this._def.innerType;
    }
  };
  ZodOptional.create = (type, params) => {
    return new ZodOptional({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodOptional,
      ...processCreateParams(params)
    });
  };
  ZodNullable = class ZodNullable extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType === ZodParsedType.null) {
        return OK(null);
      }
      return this._def.innerType._parse(input);
    }
    unwrap() {
      return this._def.innerType;
    }
  };
  ZodNullable.create = (type, params) => {
    return new ZodNullable({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodNullable,
      ...processCreateParams(params)
    });
  };
  ZodDefault = class ZodDefault extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      let data = ctx.data;
      if (ctx.parsedType === ZodParsedType.undefined) {
        data = this._def.defaultValue();
      }
      return this._def.innerType._parse({
        data,
        path: ctx.path,
        parent: ctx
      });
    }
    removeDefault() {
      return this._def.innerType;
    }
  };
  ZodDefault.create = (type, params) => {
    return new ZodDefault({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodDefault,
      defaultValue: typeof params.default === "function" ? params.default : () => params.default,
      ...processCreateParams(params)
    });
  };
  ZodCatch = class ZodCatch extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const newCtx = {
        ...ctx,
        common: {
          ...ctx.common,
          issues: []
        }
      };
      const result = this._def.innerType._parse({
        data: newCtx.data,
        path: newCtx.path,
        parent: {
          ...newCtx
        }
      });
      if (isAsync(result)) {
        return result.then((result2) => {
          return {
            status: "valid",
            value: result2.status === "valid" ? result2.value : this._def.catchValue({
              get error() {
                return new ZodError(newCtx.common.issues);
              },
              input: newCtx.data
            })
          };
        });
      } else {
        return {
          status: "valid",
          value: result.status === "valid" ? result.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      }
    }
    removeCatch() {
      return this._def.innerType;
    }
  };
  ZodCatch.create = (type, params) => {
    return new ZodCatch({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodCatch,
      catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
      ...processCreateParams(params)
    });
  };
  ZodNaN = class ZodNaN extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.nan) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.nan,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return { status: "valid", value: input.data };
    }
  };
  ZodNaN.create = (params) => {
    return new ZodNaN({
      typeName: ZodFirstPartyTypeKind.ZodNaN,
      ...processCreateParams(params)
    });
  };
  BRAND = Symbol("zod_brand");
  ZodBranded = class ZodBranded extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const data = ctx.data;
      return this._def.type._parse({
        data,
        path: ctx.path,
        parent: ctx
      });
    }
    unwrap() {
      return this._def.type;
    }
  };
  ZodPipeline = class ZodPipeline extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.common.async) {
        const handleAsync = async () => {
          const inResult = await this._def.in._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
          if (inResult.status === "aborted")
            return INVALID;
          if (inResult.status === "dirty") {
            status.dirty();
            return DIRTY(inResult.value);
          } else {
            return this._def.out._parseAsync({
              data: inResult.value,
              path: ctx.path,
              parent: ctx
            });
          }
        };
        return handleAsync();
      } else {
        const inResult = this._def.in._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return {
            status: "dirty",
            value: inResult.value
          };
        } else {
          return this._def.out._parseSync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      }
    }
    static create(a, b2) {
      return new ZodPipeline({
        in: a,
        out: b2,
        typeName: ZodFirstPartyTypeKind.ZodPipeline
      });
    }
  };
  ZodReadonly = class ZodReadonly extends ZodType {
    _parse(input) {
      const result = this._def.innerType._parse(input);
      const freeze = (data) => {
        if (isValid(data)) {
          data.value = Object.freeze(data.value);
        }
        return data;
      };
      return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
    }
    unwrap() {
      return this._def.innerType;
    }
  };
  ZodReadonly.create = (type, params) => {
    return new ZodReadonly({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodReadonly,
      ...processCreateParams(params)
    });
  };
  late = {
    object: ZodObject.lazycreate
  };
  (function(ZodFirstPartyTypeKind2) {
    ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
    ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
    ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
    ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
    ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
    ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
    ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
    ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
    ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
    ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
    ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
    ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
    ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
    ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
    ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
    ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
    ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
    ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
    ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
    ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
    ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
    ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
    ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
    ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
    ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
    ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
    ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
    ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
    ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
    ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
    ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
    ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
    ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
    ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
    ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
    ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
  })(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
  stringType = ZodString.create;
  numberType = ZodNumber.create;
  nanType = ZodNaN.create;
  bigIntType = ZodBigInt.create;
  booleanType = ZodBoolean.create;
  dateType = ZodDate.create;
  symbolType = ZodSymbol.create;
  undefinedType = ZodUndefined.create;
  nullType = ZodNull.create;
  anyType = ZodAny.create;
  unknownType = ZodUnknown.create;
  neverType = ZodNever.create;
  voidType = ZodVoid.create;
  arrayType = ZodArray.create;
  objectType = ZodObject.create;
  strictObjectType = ZodObject.strictCreate;
  unionType = ZodUnion.create;
  discriminatedUnionType = ZodDiscriminatedUnion.create;
  intersectionType = ZodIntersection.create;
  tupleType = ZodTuple.create;
  recordType = ZodRecord.create;
  mapType = ZodMap.create;
  setType = ZodSet.create;
  functionType = ZodFunction.create;
  lazyType = ZodLazy.create;
  literalType = ZodLiteral.create;
  enumType = ZodEnum.create;
  nativeEnumType = ZodNativeEnum.create;
  promiseType = ZodPromise.create;
  effectsType = ZodEffects.create;
  optionalType = ZodOptional.create;
  nullableType = ZodNullable.create;
  preprocessType = ZodEffects.createWithPreprocess;
  pipelineType = ZodPipeline.create;
  coerce = {
    string: (arg) => ZodString.create({ ...arg, coerce: true }),
    number: (arg) => ZodNumber.create({ ...arg, coerce: true }),
    boolean: (arg) => ZodBoolean.create({
      ...arg,
      coerce: true
    }),
    bigint: (arg) => ZodBigInt.create({ ...arg, coerce: true }),
    date: (arg) => ZodDate.create({ ...arg, coerce: true })
  };
  NEVER = INVALID;
});

// node_modules/zod/v3/external.js
var exports_external = {};
__export(exports_external, {
  void: () => voidType,
  util: () => util,
  unknown: () => unknownType,
  union: () => unionType,
  undefined: () => undefinedType,
  tuple: () => tupleType,
  transformer: () => effectsType,
  symbol: () => symbolType,
  string: () => stringType,
  strictObject: () => strictObjectType,
  setErrorMap: () => setErrorMap,
  set: () => setType,
  record: () => recordType,
  quotelessJson: () => quotelessJson,
  promise: () => promiseType,
  preprocess: () => preprocessType,
  pipeline: () => pipelineType,
  ostring: () => ostring,
  optional: () => optionalType,
  onumber: () => onumber,
  oboolean: () => oboolean,
  objectUtil: () => objectUtil,
  object: () => objectType,
  number: () => numberType,
  nullable: () => nullableType,
  null: () => nullType,
  never: () => neverType,
  nativeEnum: () => nativeEnumType,
  nan: () => nanType,
  map: () => mapType,
  makeIssue: () => makeIssue,
  literal: () => literalType,
  lazy: () => lazyType,
  late: () => late,
  isValid: () => isValid,
  isDirty: () => isDirty,
  isAsync: () => isAsync,
  isAborted: () => isAborted,
  intersection: () => intersectionType,
  instanceof: () => instanceOfType,
  getParsedType: () => getParsedType,
  getErrorMap: () => getErrorMap,
  function: () => functionType,
  enum: () => enumType,
  effect: () => effectsType,
  discriminatedUnion: () => discriminatedUnionType,
  defaultErrorMap: () => en_default,
  datetimeRegex: () => datetimeRegex,
  date: () => dateType,
  custom: () => custom,
  coerce: () => coerce,
  boolean: () => booleanType,
  bigint: () => bigIntType,
  array: () => arrayType,
  any: () => anyType,
  addIssueToContext: () => addIssueToContext,
  ZodVoid: () => ZodVoid,
  ZodUnknown: () => ZodUnknown,
  ZodUnion: () => ZodUnion,
  ZodUndefined: () => ZodUndefined,
  ZodType: () => ZodType,
  ZodTuple: () => ZodTuple,
  ZodTransformer: () => ZodEffects,
  ZodSymbol: () => ZodSymbol,
  ZodString: () => ZodString,
  ZodSet: () => ZodSet,
  ZodSchema: () => ZodType,
  ZodRecord: () => ZodRecord,
  ZodReadonly: () => ZodReadonly,
  ZodPromise: () => ZodPromise,
  ZodPipeline: () => ZodPipeline,
  ZodParsedType: () => ZodParsedType,
  ZodOptional: () => ZodOptional,
  ZodObject: () => ZodObject,
  ZodNumber: () => ZodNumber,
  ZodNullable: () => ZodNullable,
  ZodNull: () => ZodNull,
  ZodNever: () => ZodNever,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNaN: () => ZodNaN,
  ZodMap: () => ZodMap,
  ZodLiteral: () => ZodLiteral,
  ZodLazy: () => ZodLazy,
  ZodIssueCode: () => ZodIssueCode,
  ZodIntersection: () => ZodIntersection,
  ZodFunction: () => ZodFunction,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodError: () => ZodError,
  ZodEnum: () => ZodEnum,
  ZodEffects: () => ZodEffects,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodDefault: () => ZodDefault,
  ZodDate: () => ZodDate,
  ZodCatch: () => ZodCatch,
  ZodBranded: () => ZodBranded,
  ZodBoolean: () => ZodBoolean,
  ZodBigInt: () => ZodBigInt,
  ZodArray: () => ZodArray,
  ZodAny: () => ZodAny,
  Schema: () => ZodType,
  ParseStatus: () => ParseStatus,
  OK: () => OK,
  NEVER: () => NEVER,
  INVALID: () => INVALID,
  EMPTY_PATH: () => EMPTY_PATH,
  DIRTY: () => DIRTY,
  BRAND: () => BRAND
});
var init_external = __esm(() => {
  init_errors2();
  init_parseUtil();
  init_typeAliases();
  init_util2();
  init_types2();
  init_ZodError();
});

// node_modules/zod/index.js
var init_zod = __esm(() => {
  init_external();
  init_external();
});

// src/ledger/store.ts
import { existsSync as existsSync4, mkdirSync, readFileSync as readFileSync2, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname as dirname2, join as join4 } from "node:path";
function defaultLedgerPath() {
  return join4(homedir(), ".chowa", "sessions.json");
}
function readLedger(options = {}) {
  const path = options.path ?? defaultLedgerPath();
  if (!existsSync4(path)) {
    return EMPTY_LEDGER;
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync2(path, "utf-8"));
  } catch (error) {
    throw new Error(`Ledger at "${path}" is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const result = ledgerSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Ledger at "${path}" does not match the expected shape: ${result.error.message}`);
  }
  return result.data;
}
function writeLedger(ledger, options = {}) {
  const path = options.path ?? defaultLedgerPath();
  const dir = dirname2(path);
  mkdirSync(dir, { recursive: true });
  const tempPath = join4(dir, `.sessions.json.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tempPath, JSON.stringify(ledger, null, 2), "utf-8");
  renameSync(tempPath, path);
}
function ledgerKey(repoPath, branch) {
  return `${repoPath}#${branch}`;
}
var ledgerEntrySchema, ledgerSchema;
var init_store = __esm(() => {
  init_zod();
  init_types();
  ledgerEntrySchema = exports_external.object({
    sessionId: exports_external.string(),
    repoPath: exports_external.string(),
    branch: exports_external.string(),
    sessionName: exports_external.string().optional(),
    taskDescription: exports_external.string().optional(),
    startedAt: exports_external.string(),
    status: exports_external.enum(["open", "quota_blocked", "abandoned", "resumed"]),
    blockedWindow: exports_external.enum(["five_hour", "seven_day"]).optional(),
    resetsAt: exports_external.string().optional(),
    stampedAt: exports_external.string().optional(),
    abandonReason: exports_external.string().optional(),
    resumeAttempts: exports_external.number().int().nonnegative()
  });
  ledgerSchema = exports_external.object({
    entries: exports_external.record(exports_external.string(), ledgerEntrySchema)
  });
});

// src/ledger/operations.ts
function withEntry(ledger, key, entry) {
  return { entries: { ...ledger.entries, [key]: entry } };
}
function openEntry(ledger, entry) {
  const key = ledgerKey(entry.repoPath, entry.branch);
  return withEntry(ledger, key, {
    ...entry,
    status: "open",
    resumeAttempts: 0
  });
}
function stampQuota(ledger, key, window2, resetsAt, stampedAt = new Date().toISOString(), taskDescription) {
  const existing = ledger.entries[key];
  if (!existing)
    return ledger;
  return withEntry(ledger, key, {
    ...existing,
    status: "quota_blocked",
    blockedWindow: window2,
    resetsAt,
    stampedAt,
    taskDescription: taskDescription ?? existing.taskDescription
  });
}
function abandonEntry(ledger, key, reason) {
  const existing = ledger.entries[key];
  if (!existing)
    return ledger;
  return withEntry(ledger, key, {
    ...existing,
    status: "abandoned",
    abandonReason: reason
  });
}
function markResumed(ledger, key) {
  const existing = ledger.entries[key];
  if (!existing)
    return ledger;
  return withEntry(ledger, key, {
    ...existing,
    status: "resumed",
    resumeAttempts: existing.resumeAttempts + 1
  });
}
function eligibleForSweep(ledger, window2, now = new Date) {
  return Object.values(ledger.entries).filter((entry) => entry.status === "quota_blocked" && entry.blockedWindow === window2 && entry.resetsAt !== undefined && new Date(entry.resetsAt).getTime() <= now.getTime() && entry.resumeAttempts < MAX_RESUME_ATTEMPTS);
}
var MAX_RESUME_ATTEMPTS = 3;
var init_operations = __esm(() => {
  init_store();
});

// src/ledger/index.ts
var exports_ledger = {};
__export(exports_ledger, {
  writeLedger: () => writeLedger,
  stampQuota: () => stampQuota,
  readLedger: () => readLedger,
  openEntry: () => openEntry,
  markResumed: () => markResumed,
  ledgerKey: () => ledgerKey,
  eligibleForSweep: () => eligibleForSweep,
  defaultLedgerPath: () => defaultLedgerPath,
  abandonEntry: () => abandonEntry,
  MAX_RESUME_ATTEMPTS: () => MAX_RESUME_ATTEMPTS,
  EMPTY_LEDGER: () => EMPTY_LEDGER
});
var init_ledger = __esm(() => {
  init_types();
  init_store();
  init_operations();
});

// src/integrations/claude-code/sweep.ts
var exports_sweep = {};
__export(exports_sweep, {
  tmuxSessionName: () => tmuxSessionName,
  sweep: () => sweep,
  dispatchResume: () => dispatchResume,
  buildDispatch: () => buildDispatch,
  FALLBACK_RESUME_MESSAGE: () => FALLBACK_RESUME_MESSAGE
});
import { spawn as spawn2 } from "node:child_process";
import { createHash as createHash2 } from "node:crypto";
function tmuxSessionName(entry) {
  const hash = createHash2("sha1").update(ledgerKey(entry.repoPath, entry.branch)).digest("hex").slice(0, 12);
  return `chowa-resume-${hash}`;
}
function buildDispatch(entry) {
  const sessionName = tmuxSessionName(entry);
  const message = entry.taskDescription ?? FALLBACK_RESUME_MESSAGE;
  return {
    sessionName,
    cwd: entry.repoPath,
    newSessionArgs: ["new-session", "-d", "-s", sessionName, "claude", "--resume", entry.sessionId],
    sendKeysArgs: ["send-keys", "-t", sessionName, message, "Enter"]
  };
}
function runTmux(args, cwd) {
  return new Promise((resolve2, reject) => {
    const child = spawn2("tmux", [...args], { cwd, stdio: "ignore" });
    child.on("error", (error) => reject(new Error(`Failed to spawn tmux: ${error.message}`)));
    child.on("exit", (code) => {
      if (code === 0)
        resolve2();
      else
        reject(new Error(`tmux ${args[0]} exited with code ${code}`));
    });
  });
}
async function dispatchResume(entry) {
  const dispatch = buildDispatch(entry);
  await runTmux(dispatch.newSessionArgs, dispatch.cwd);
  await new Promise((resolve2) => setTimeout(resolve2, 1000));
  await runTmux(dispatch.sendKeysArgs, dispatch.cwd);
}
async function sweep(deps = {}) {
  const now = deps.now ?? new Date;
  const dispatch = deps.dispatch ?? dispatchResume;
  let ledger = readLedger(deps.ledgerOptions);
  const resumed = [];
  const failed = [];
  for (const window2 of WINDOWS) {
    for (const entry of eligibleForSweep(ledger, window2, now)) {
      try {
        await dispatch(entry);
        const key = ledgerKey(entry.repoPath, entry.branch);
        ledger = markResumed(ledger, key);
        resumed.push(ledger.entries[key]);
      } catch (error) {
        failed.push({ entry, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  writeLedger(ledger, deps.ledgerOptions);
  return { resumed, failed };
}
var WINDOWS, FALLBACK_RESUME_MESSAGE = "Resuming a session interrupted by a quota limit. No task description was captured — check the transcript for what was in flight before continuing.";
var init_sweep = __esm(() => {
  init_ledger();
  WINDOWS = ["five_hour", "seven_day"];
});

// src/integrations/systemd/timer.ts
var exports_timer = {};
__export(exports_timer, {
  planTimerInstall: () => planTimerInstall
});
import { join as join5 } from "node:path";
function planTimerInstall(options) {
  const interval = options.intervalMinutes ?? 5;
  const unitDir = join5(options.homeDir, ".config", "systemd", "user");
  const serviceUnitContent = [
    "[Unit]",
    "Description=Chōwa quota-aware session auto-resume sweep",
    "",
    "[Service]",
    "Type=oneshot",
    `ExecStart=${options.execCommand}`,
    ""
  ].join(`
`);
  const timerUnitContent = [
    "[Unit]",
    "Description=Periodically run the Chōwa auto-resume sweep",
    "",
    "[Timer]",
    `OnBootSec=${interval}min`,
    `OnUnitActiveSec=${interval}min`,
    "Persistent=true",
    "",
    "[Install]",
    "WantedBy=timers.target",
    ""
  ].join(`
`);
  return {
    serviceUnitPath: join5(unitDir, `${UNIT_NAME}.service`),
    timerUnitPath: join5(unitDir, `${UNIT_NAME}.timer`),
    serviceUnitContent,
    timerUnitContent,
    postInstallCommands: [
      ["systemctl", "--user", "daemon-reload"],
      ["systemctl", "--user", "enable", "--now", `${UNIT_NAME}.timer`]
    ]
  };
}
var UNIT_NAME = "chowa-resume-sweep";
var init_timer = () => {};

// src/integrations/claude-code/bridge.ts
var exports_bridge2 = {};
__export(exports_bridge2, {
  ClaudeCodeBridge: () => ClaudeCodeBridge
});

class ClaudeCodeBridge {
  client;
  policy;
  constructor(client, policy) {
    this.client = client;
    this.policy = policy;
  }
  async handle(request) {
    try {
      switch (request.action) {
        case "call":
          return await this.handleCall(request);
        case "route":
          return this.handleRoute(request);
        case "models":
          return this.handleModels(request);
        case "commit":
          return await this.handleCommit();
        case "pr":
          return await this.handlePR(request);
        default:
          return {
            success: false,
            action: request.action,
            error: `Unknown action: ${request.action}`
          };
      }
    } catch (error) {
      return {
        success: false,
        action: request.action,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  handleModels(request) {
    const models = this.client.getAvailableModels(request.provider);
    return {
      success: true,
      action: "models",
      data: {
        models
      }
    };
  }
  handleRoute(request) {
    const profile = request.taskProfile ?? {
      kind: "mechanical",
      estimatedComplexity: "low"
    };
    const decision = resolve(profile, this.policy);
    const availableModels = this.client.getAvailableModels();
    const resolvedTarget = resolveModelTier(decision.target, availableModels);
    return {
      success: true,
      action: "route",
      data: {
        target: resolvedTarget,
        originalTarget: decision.target,
        matchedRule: decision.matchedRule,
        reason: decision.reason
      }
    };
  }
  async handleCall(request) {
    let provider = request.provider;
    let model = request.model;
    if (!provider || !model) {
      const profile = request.taskProfile ?? {
        kind: "mechanical",
        estimatedComplexity: "low"
      };
      const decision = resolve(profile, this.policy);
      const availableModels = this.client.getAvailableModels();
      const resolvedTarget = resolveModelTier(decision.target, availableModels);
      provider = provider ?? resolvedTarget.provider;
      model = model ?? resolvedTarget.model;
    }
    const result = await this.client.call({
      provider,
      model,
      tools: request.tools ?? [],
      messages: request.messages ?? []
    });
    return {
      success: true,
      action: "call",
      data: result
    };
  }
  async handleCommit() {
    const { GitOps: GitOps2 } = await Promise.resolve().then(() => (init_gitOps(), exports_gitOps));
    const { splitDiff: splitDiff2 } = await Promise.resolve().then(() => exports_diffSplitter);
    const { generateCommitMessage: generateCommitMessage2 } = await Promise.resolve().then(() => (init_commitMessage(), exports_commitMessage));
    const gitOps = new GitOps2;
    const diff = await gitOps.getDiff() || await gitOps.getStagedDiff();
    if (!diff.trim()) {
      return {
        success: true,
        action: "commit",
        data: {
          message: "No uncommitted changes detected.",
          clusters: []
        }
      };
    }
    const clusters = splitDiff2(diff);
    const results = [];
    for (const cluster of clusters) {
      const message = await generateCommitMessage2(cluster, this.client, this.policy);
      results.push({
        id: cluster.id,
        files: cluster.files,
        message
      });
    }
    return {
      success: true,
      action: "commit",
      data: {
        clusters: results
      }
    };
  }
  async handlePR(request) {
    const { GitOps: GitOps2 } = await Promise.resolve().then(() => (init_gitOps(), exports_gitOps));
    const { generatePRDescription: generatePRDescription2 } = await Promise.resolve().then(() => (init_prDescription(), exports_prDescription));
    const baseBranch = request.baseBranch ?? "main";
    const gitOps = new GitOps2;
    const currentBranch = await gitOps.getCurrentBranch();
    const commits = await gitOps.getCommitHistory(baseBranch);
    const baseBranchDiff = await gitOps.getDiffAgainstBase(baseBranch);
    const prDescription = await generatePRDescription2(commits, baseBranchDiff, this.client, this.policy, currentBranch);
    return {
      success: true,
      action: "pr",
      data: {
        baseBranch,
        prDescription
      }
    };
  }
}
var init_bridge2 = () => {};

// src/cli.ts
import { parseArgs } from "node:util";
import { copyFileSync, mkdirSync as mkdirSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname as dirname3 } from "node:path";
import { homedir as homedir2 } from "node:os";
function printHelp() {
  console.log(`
chowa — LLM coding harness

Usage:
  chowa <command> [options]

Commands:
  call       Make a tool-calling LLM request through the normalization layer
  route      Resolve a task profile to a provider/model
  commit     Split diff into atomic commits with Conventional Commits messages
  pr         Generate a PR description from branch history
  init       Scaffold a chowa.config.js for this project
  always-on  Apply (or stop applying) Chōwa's workflow to every project [on|off]
  install    Install the chowa skill for a harness with no plugin system
  abandon    Stop tracking the current branch's session for auto-resume
  ledger     Session auto-resume ledger: status | sweep | install
  help       Show this help message

Options:
  --provider <id>       Provider ID (anthropic, openai, gemini, local)
  --model <id>          Model identifier
  --kind <type>         Task kind (mechanical, refactor, architecture, security, debug)
  --complexity <level>  Task complexity (low, medium, high)
  --base <branch>       Base branch for PR description (default: main)
  --config <path>       Path to chowa.config.{ts,js,mjs} (default: probed in cwd)
  --agent <harness>     Target harness for "install" (gemini)
  --reason <text>       Reason for "abandon"
  --help                Show this help message

Examples:
  chowa route --kind architecture --complexity high
  chowa commit
  chowa pr --base main
  chowa init
  chowa always-on on
  chowa install --agent gemini
  chowa abandon --reason "switched approach"
  chowa ledger status
  chowa ledger sweep
  chowa ledger install

Claude Code doesn't need "install" — it gets Chōwa as a plugin:
  /plugin marketplace add franprince/chowa
  /plugin install chowa@chowa
`);
}
async function handleRoute(kind, complexity, configPath) {
  const { resolve: resolve2 } = await Promise.resolve().then(() => exports_router);
  const { loadPolicy: loadPolicy2 } = await Promise.resolve().then(() => (init_loadPolicy(), exports_loadPolicy));
  const policy = await loadPolicy2({ configPath });
  const decision = resolve2({
    kind,
    estimatedComplexity: complexity
  }, policy);
  console.log(JSON.stringify(decision, null, 2));
}
async function handleInstall(agent) {
  const { planInstall: planInstall2, SUPPORTED_AGENTS: SUPPORTED_AGENTS2, AGENT_TARGETS: AGENT_TARGETS2 } = await Promise.resolve().then(() => (init_install(), exports_install));
  if (!agent) {
    console.error(`chowa install requires --agent <harness>. Supported: ${SUPPORTED_AGENTS2.join(", ")}.
` + `Claude Code doesn't use this command — install the plugin instead:
` + `  /plugin marketplace add franprince/chowa
  /plugin install chowa@chowa`);
    process.exitCode = 1;
    return;
  }
  try {
    const plan = planInstall2(agent, homedir2(), [import.meta.dirname, process.cwd()]);
    mkdirSync2(dirname3(plan.skillDestination), { recursive: true });
    copyFileSync(plan.skillSource, plan.skillDestination);
    console.log(`✅ Installed the chowa skill to ${plan.skillDestination}`);
    const { globalRulesContent: globalRulesContent2 } = await Promise.resolve().then(() => (init_install(), exports_install));
    writeFileSync2(plan.rulesDestination, globalRulesContent2(), "utf-8");
    console.log(`✅ Wrote workspace rules to ${plan.rulesDestination}`);
    console.log(`
${AGENT_TARGETS2[agent].label} will pick these up on its next session.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
async function handleInit() {
  const { planInit: planInit2, defaultConfigFileContents: defaultConfigFileContents2 } = await Promise.resolve().then(() => (init_initConfig(), exports_initConfig));
  try {
    const plan = planInit2();
    writeFileSync2(plan.targetPath, defaultConfigFileContents2(), "utf-8");
    console.log(`✅ Wrote ${plan.targetPath}`);
    console.log(`
Edit routing.rules in ${plan.targetPath} to customize model routing.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
async function handleAlwaysOn(arg) {
  const { defaultPreferencesPath: defaultPreferencesPath2, readPreferences: readPreferences2, serializePreferences: serializePreferences2 } = await Promise.resolve().then(() => (init_preferences(), exports_preferences));
  const path = defaultPreferencesPath2(homedir2());
  if (arg !== undefined && arg !== "on" && arg !== "off") {
    console.error(`Unknown argument "${arg}" for "chowa always-on". Use "on", "off", or omit it to check status.`);
    process.exitCode = 1;
    return;
  }
  if (arg === "on" || arg === "off") {
    mkdirSync2(dirname3(path), { recursive: true });
    writeFileSync2(path, serializePreferences2({ alwaysOn: arg === "on" }), "utf-8");
    console.log(arg === "on" ? `✅ Chōwa's workflow now applies to every project you work in (${path}).` : `✅ Chōwa's workflow now only applies to projects that opt in.`);
    return;
  }
  const prefs = readPreferences2(path);
  console.log(`Always-on: ${prefs.alwaysOn ? "enabled" : "disabled"}`);
}
async function handleCheckUpdate(baseBranch) {
  const { GitOps: GitOps2 } = await Promise.resolve().then(() => (init_gitOps(), exports_gitOps));
  const gitOps = new GitOps2;
  const status = await gitOps.checkRemoteUpdates("origin", baseBranch);
  if (status.behindCount > 0) {
    console.log(`
⚠️  Local repository is BEHIND ${status.remoteBranch} by ${status.behindCount} commit(s).`);
    console.log(`   Run 'git pull origin ${baseBranch ?? await gitOps.getCurrentBranch()}' to pull remote updates.
`);
  } else {
    console.log(`
✅ Local repository is up to date with ${status.remoteBranch}.
`);
  }
}
async function handleCommit(configPath) {
  const { splitDiff: splitDiff2 } = await Promise.resolve().then(() => exports_diffSplitter);
  const { generateCommitMessage: generateCommitMessage2 } = await Promise.resolve().then(() => (init_commitMessage(), exports_commitMessage));
  const { GitOps: GitOps2 } = await Promise.resolve().then(() => (init_gitOps(), exports_gitOps));
  const { ChowaClient: ChowaClient2 } = await Promise.resolve().then(() => (init_client(), exports_client));
  const { loadPolicy: loadPolicy2 } = await Promise.resolve().then(() => (init_loadPolicy(), exports_loadPolicy));
  const gitOps = new GitOps2;
  await handleCheckUpdate();
  const diff = await gitOps.getDiff() || await gitOps.getStagedDiff();
  if (!diff.trim()) {
    console.log("No uncommitted changes detected.");
    return;
  }
  const clusters = splitDiff2(diff);
  console.log(`Found ${clusters.length} logical change cluster(s):
`);
  const client = new ChowaClient2;
  const policy = await loadPolicy2({ configPath });
  for (const cluster of clusters) {
    console.log(`\uD83D\uDCE6 Cluster ${cluster.id} [${cluster.files.join(", ")}]:`);
    const message = await generateCommitMessage2(cluster, client, policy);
    console.log(`   Suggested commit: "${message}"
`);
  }
}
async function handlePR(baseBranch, configPath) {
  const { GitOps: GitOps2 } = await Promise.resolve().then(() => (init_gitOps(), exports_gitOps));
  const { generatePRDescription: generatePRDescription2 } = await Promise.resolve().then(() => (init_prDescription(), exports_prDescription));
  const { ChowaClient: ChowaClient2 } = await Promise.resolve().then(() => (init_client(), exports_client));
  const { loadPolicy: loadPolicy2 } = await Promise.resolve().then(() => (init_loadPolicy(), exports_loadPolicy));
  const gitOps = new GitOps2;
  await handleCheckUpdate(baseBranch);
  const currentBranch = await gitOps.getCurrentBranch();
  console.log(`Generating PR description for ${currentBranch} → ${baseBranch}...
`);
  const commits = await gitOps.getCommitHistory(baseBranch);
  const diff = await gitOps.getDiffAgainstBase(baseBranch);
  const client = new ChowaClient2;
  const policy = await loadPolicy2({ configPath });
  const pr = await generatePRDescription2(commits, diff, client, policy, currentBranch);
  console.log(`# PR Description: ${currentBranch} → ${baseBranch}
`);
  console.log(`## Summary
${pr.summary}
`);
  console.log(`## Changes
${pr.changes.map((c3) => `- ${c3}`).join(`
`)}
`);
  console.log(`## Testing Notes
${pr.testing}
`);
  if (pr.breakingChanges) {
    console.log(`## ⚠️ Breaking Changes
${pr.breakingChanges}
`);
  }
  if (pr.type === "feature" && pr.rolloutNotes) {
    console.log(`## Rollout Notes
${pr.rolloutNotes}
`);
  }
  if (pr.type === "release" && pr.rolloutPlan) {
    console.log(`## Rollout / Rollback Plan
${pr.rolloutPlan}
`);
  }
}
async function handleAntigravityBridge(configPath) {
  const { AntigravityBridge: AntigravityBridge2 } = await Promise.resolve().then(() => (init_bridge(), exports_bridge));
  const { ChowaClient: ChowaClient2 } = await Promise.resolve().then(() => (init_client(), exports_client));
  const { loadPolicy: loadPolicy2 } = await Promise.resolve().then(() => (init_loadPolicy(), exports_loadPolicy));
  const client = new ChowaClient2;
  const policy = await loadPolicy2({ configPath });
  const bridge = new AntigravityBridge2(client, policy);
  let input = "";
  process.stdin.setEncoding("utf-8");
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  if (!input.trim()) {
    console.log(JSON.stringify({
      success: false,
      action: "bridge",
      error: "Empty request input provided on stdin"
    }));
    return;
  }
  try {
    const request = JSON.parse(input.trim());
    const response = await bridge.handle(request);
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      success: false,
      action: "bridge",
      error: error instanceof Error ? error.message : String(error)
    }));
  }
}
async function handleModels(provider) {
  const { ChowaClient: ChowaClient2 } = await Promise.resolve().then(() => (init_client(), exports_client));
  const client = new ChowaClient2;
  const models = client.getAvailableModels(provider);
  console.log(JSON.stringify(models, null, 2));
}
async function handleAbandon(reason) {
  const { GitOps: GitOps2 } = await Promise.resolve().then(() => (init_gitOps(), exports_gitOps));
  const { ledgerKey: ledgerKey2, readLedger: readLedger2, writeLedger: writeLedger2, abandonEntry: abandonEntry2 } = await Promise.resolve().then(() => (init_ledger(), exports_ledger));
  const gitOps = new GitOps2;
  const branch = await gitOps.getCurrentBranch();
  const key = ledgerKey2(process.cwd(), branch);
  const ledger = readLedger2();
  if (!ledger.entries[key]) {
    console.error(`No ledger entry for ${key} — nothing to abandon.`);
    process.exitCode = 1;
    return;
  }
  writeLedger2(abandonEntry2(ledger, key, reason));
  console.log(`✅ Abandoned the ledger entry for ${branch} — it will not be auto-resumed.`);
}
async function handleLedgerStatus() {
  const { readLedger: readLedger2 } = await Promise.resolve().then(() => (init_ledger(), exports_ledger));
  const entries = Object.entries(readLedger2().entries);
  if (entries.length === 0) {
    console.log("No ledger entries.");
    return;
  }
  for (const [key, entry] of entries) {
    console.log(key);
    console.log(`  session:  ${entry.sessionId}`);
    console.log(`  status:   ${entry.status}`);
    if (entry.blockedWindow) {
      console.log(`  blocked:  ${entry.blockedWindow} window, resets ${entry.resetsAt}`);
    }
    console.log(`  attempts: ${entry.resumeAttempts}`);
    console.log("");
  }
}
async function handleLedgerSweep() {
  const { sweep: sweep2 } = await Promise.resolve().then(() => (init_sweep(), exports_sweep));
  const result = await sweep2();
  console.log(`Resumed ${result.resumed.length} session(s).`);
  for (const entry of result.resumed) {
    console.log(`  ✅ ${entry.repoPath}#${entry.branch} (${entry.sessionId})`);
  }
  if (result.failed.length > 0) {
    console.log(`Failed to dispatch ${result.failed.length} entry(ies) — left for the next sweep:`);
    for (const { entry, error } of result.failed) {
      console.log(`  ❌ ${entry.repoPath}#${entry.branch}: ${error}`);
    }
  }
}
async function handleLedgerInstall() {
  if (process.platform !== "linux") {
    console.error("chowa ledger install currently only supports Linux (systemd user timers).");
    process.exitCode = 1;
    return;
  }
  const { planTimerInstall: planTimerInstall2 } = await Promise.resolve().then(() => (init_timer(), exports_timer));
  const { execFileSync } = await import("node:child_process");
  const execCommand = `"${process.execPath}" "${process.argv[1]}" ledger sweep`;
  const plan = planTimerInstall2({ homeDir: homedir2(), execCommand });
  try {
    mkdirSync2(dirname3(plan.serviceUnitPath), { recursive: true });
    writeFileSync2(plan.serviceUnitPath, plan.serviceUnitContent, "utf-8");
    writeFileSync2(plan.timerUnitPath, plan.timerUnitContent, "utf-8");
    console.log(`✅ Wrote ${plan.serviceUnitPath}`);
    console.log(`✅ Wrote ${plan.timerUnitPath}`);
    for (const command of plan.postInstallCommands) {
      execFileSync(command[0], command.slice(1), { stdio: "inherit" });
    }
    console.log("✅ Enabled chowa-resume-sweep.timer — check: systemctl --user list-timers");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
async function handleClaudeCodeBridge(configPath) {
  const { ClaudeCodeBridge: ClaudeCodeBridge2 } = await Promise.resolve().then(() => (init_bridge2(), exports_bridge2));
  const { ChowaClient: ChowaClient2 } = await Promise.resolve().then(() => (init_client(), exports_client));
  const { loadPolicy: loadPolicy2 } = await Promise.resolve().then(() => (init_loadPolicy(), exports_loadPolicy));
  const client = new ChowaClient2;
  const policy = await loadPolicy2({ configPath });
  const bridge = new ClaudeCodeBridge2(client, policy);
  let input = "";
  process.stdin.setEncoding("utf-8");
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  if (!input.trim()) {
    console.log(JSON.stringify({
      success: false,
      action: "bridge",
      error: "Empty request input provided on stdin"
    }));
    return;
  }
  try {
    const request = JSON.parse(input.trim());
    const response = await bridge.handle(request);
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      success: false,
      action: "bridge",
      error: error instanceof Error ? error.message : String(error)
    }));
  }
}
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      provider: { type: "string" },
      model: { type: "string" },
      kind: { type: "string", default: "mechanical" },
      complexity: { type: "string", default: "low" },
      base: { type: "string", default: "main" },
      config: { type: "string" },
      agent: { type: "string" },
      reason: { type: "string" },
      help: { type: "boolean", default: false }
    }
  });
  const command = positionals[0];
  if (values.help || !command || command === "help") {
    printHelp();
    return;
  }
  switch (command) {
    case "route":
      await handleRoute(values.kind ?? "mechanical", values.complexity ?? "low", values.config);
      break;
    case "models":
      await handleModels(values.provider);
      break;
    case "commit":
      await handleCommit(values.config);
      break;
    case "pr":
      await handlePR(values.base ?? "main", values.config);
      break;
    case "check-update":
    case "update-check":
      await handleCheckUpdate(values.base);
      break;
    case "init":
      await handleInit();
      break;
    case "always-on":
      await handleAlwaysOn(positionals[1]);
      break;
    case "install":
      await handleInstall(values.agent);
      break;
    case "abandon":
      await handleAbandon(values.reason);
      break;
    case "ledger":
      switch (positionals[1]) {
        case "status":
          await handleLedgerStatus();
          break;
        case "sweep":
          await handleLedgerSweep();
          break;
        case "install":
          await handleLedgerInstall();
          break;
        default:
          console.error(`Unknown "chowa ledger" subcommand: ${positionals[1] ?? "(none)"}. Use status, sweep, or install.`);
          process.exitCode = 1;
      }
      break;
    case "sync-global":
      console.warn(`⚠️  "chowa sync-global" is deprecated — use "chowa install --agent gemini".
` + `   It still works and will be removed in a future release.
`);
      await handleInstall(values.agent ?? "gemini");
      break;
    case "call":
      console.log("Direct call requires provider, model, and tool configuration.");
      console.log("Use the library API for programmatic access.");
      break;
    case "antigravity-bridge":
      await handleAntigravityBridge(values.config);
      break;
    case "claude-code-bridge":
      await handleClaudeCodeBridge(values.config);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exitCode = 1;
  }
}
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exitCode = 1;
});
