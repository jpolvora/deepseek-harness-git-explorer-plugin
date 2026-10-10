import z from "@deepseek-ai/schemastery";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region lib/types/git/commands.js
/** Read the structural subprocess face off a host context. */
function subprocessOf(ctx) {
	return ctx.subprocess;
}
/**
* Run one git command and collect its output.
*
* @param ctx - host context carrying `subprocess`.
* @param limits - the service's configured caps.
* @param options - the command and where it runs.
* @returns the exit code and captured output.
*/
async function runGit(ctx, limits, options) {
	const timeout = AbortSignal.timeout(limits.timeoutMs);
	const signal = options.signal === void 0 ? timeout : AbortSignal.any([options.signal, timeout]);
	const handle = subprocessOf(ctx).spawn({
		argv: [limits.gitPath, ...options.args],
		cwd: options.cwd,
		stdio: {
			stdin: options.stdin === void 0 ? "ignore" : { data: options.stdin },
			stdout: { maxBytes: limits.outputMaxBytes },
			stderr: { maxBytes: 16384 }
		},
		graceMs: 2e3,
		signal,
		env: {
			GIT_CONFIG_COUNT: "0",
			GIT_TERMINAL_PROMPT: "0",
			GIT_OPTIONAL_LOCKS: "0",
			LC_ALL: "C"
		}
	});
	const outcome = await handle.done;
	const stdout = handle.collected.stdout?.readFrom(0);
	const stderr = handle.collected.stderr?.readFrom(0);
	if (process.env.DSH_GIT_EXPLORER_DEBUG === "1") {
		console.error(`[git-explorer] cwd=${options.cwd} $ git ${options.args.join(" ")} -> ${String(outcome.exitCode ?? -1)}`);
		if (stderr?.text !== void 0 && stderr.text.trim() !== "") console.error(`[git-explorer] stderr: ${stderr.text.trim()}`);
	}
	return {
		exitCode: outcome.exitCode ?? -1,
		stdout: stdout?.text ?? "",
		stderr: stderr?.text ?? "",
		stdoutLossy: stdout?.lossy ?? false
	};
}
//#endregion
//#region lib/types/git/repo.js
/**
* Resolve the directory git runs in for one Session.
*
* @param ctx - the host context carrying the Session store and friends.
* @param sessionId - the Session identity received on the wire.
* @param requestRoot - the working directory the panel offered, if any.
* @returns the resolved root and which link supplied it.
*/
async function resolveRoot(ctx, sessionId, requestRoot) {
	const host = ctx;
	const live = (host.sessions ?? host.get?.("sessions"))?.get(sessionId);
	const sessionFound = live !== void 0;
	const headerRoot = live?.header?.cwd;
	if (headerRoot !== void 0 && headerRoot !== "") return {
		root: headerRoot,
		source: "header",
		sessionFound,
		note: ""
	};
	const persistence = host.get?.("sessionPersistence");
	if (persistence !== void 0) try {
		const storedRoot = (await persistence.stat(sessionId))?.header?.cwd;
		if (storedRoot !== void 0 && storedRoot !== "") return {
			root: storedRoot,
			source: "persistence",
			sessionFound,
			note: ""
		};
	} catch {}
	if (requestRoot !== "") return {
		root: requestRoot,
		source: "request",
		sessionFound,
		note: ""
	};
	const policy = host.get?.("sandboxPolicy");
	if (typeof policy?.workspaceRoot === "string" && policy.workspaceRoot !== "") return {
		root: policy.workspaceRoot,
		source: "sandboxPolicy",
		sessionFound,
		note: ""
	};
	return {
		root: null,
		source: "none",
		sessionFound,
		note: sessionFound ? "this Session has no working directory" : "the host could not resolve this Session or its working directory"
	};
}
//#endregion
//#region lib/types/git/status.js
/**
* Map one porcelain status letter to the panel's status vocabulary.
*
* @param letter - `X` or `Y` from a `1`/`2` record, or a `u` record's pair.
* @param untracked - whether the record is a `?` record.
* @returns the status the row shows.
*/
function statusFor(letter, untracked = false) {
	if (untracked) return "untracked";
	switch (letter) {
		case "M": return "modified";
		case "A": return "added";
		case "D": return "deleted";
		case "R": return "renamed";
		case "C": return "copied";
		case "T": return "typechange";
		case "U": return "conflicted";
		default: return "modified";
	}
}
/**
* Parse one porcelain v2 stream.
*
* @param output - the raw stdout of `git status --porcelain=v2 -z --branch`.
* @param limits - the entry cap.
* @returns the parsed status, with entries grouped for the panel.
*/
function parsePorcelainV2(output, limits) {
	const tokens = output.split("\0");
	const summary = {
		branch: null,
		detached: false,
		unborn: false,
		upstream: null,
		ahead: 0,
		behind: 0,
		commits: {
			staged: [],
			unstaged: [],
			untracked: [],
			conflicted: []
		},
		truncated: false,
		skipped: []
	};
	let kept = 0;
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token === void 0 || token === "") continue;
		if (token.startsWith("# ")) {
			const [key, ...rest] = token.slice(2).split(" ");
			const value = rest.join(" ");
			if (key === "branch.oid") summary.unborn = value === "(initial)";
			else if (key === "branch.head") {
				summary.detached = value === "(detached)";
				summary.branch = summary.detached ? null : value;
			} else if (key === "branch.upstream") summary.upstream = value;
			else if (key === "branch.ab") {
				const match = /^\+(-?\d+) -(-?\d+)$/.exec(value);
				if (match !== null) {
					summary.ahead = Number(match[1]);
					summary.behind = Number(match[2]);
				}
			}
			continue;
		}
		const kind = token[0];
		if (kind !== "1" && kind !== "2" && kind !== "u" && kind !== "?" && kind !== "!") {
			summary.skipped.push(token.slice(0, 120));
			continue;
		}
		const fields = token.split(" ");
		let path;
		let origPath;
		let indexLetter = ".";
		let worktreeLetter = ".";
		if (kind === "?") path = token.slice(2);
		else if (kind === "!") path = token.slice(2);
		else if (kind === "u") {
			indexLetter = fields[1]?.[0] ?? "U";
			worktreeLetter = fields[1]?.[1] ?? "U";
			path = fields.slice(10).join(" ");
		} else if (kind === "1") {
			indexLetter = fields[1]?.[0] ?? ".";
			worktreeLetter = fields[1]?.[1] ?? ".";
			path = fields.slice(8).join(" ");
		} else {
			indexLetter = fields[1]?.[0] ?? ".";
			worktreeLetter = fields[1]?.[1] ?? ".";
			path = fields.slice(9).join(" ");
			const next = tokens[index + 1];
			if (next !== void 0 && next !== "") {
				origPath = next;
				index += 1;
			}
		}
		if (path === void 0 || path === "") {
			summary.skipped.push(token.slice(0, 120));
			continue;
		}
		const change = {
			path,
			status: kind === "?" ? "untracked" : kind === "u" ? "conflicted" : statusFor(indexLetter !== "." ? indexLetter : worktreeLetter),
			index: kind === "?" ? "?" : indexLetter,
			worktree: kind === "?" ? "?" : worktreeLetter,
			staged: kind === "1" || kind === "2" ? indexLetter !== "." : false
		};
		if (origPath !== void 0) change.origPath = origPath;
		if (kind === "2") {
			const score = fields[8]?.slice(1);
			if (score !== void 0 && score !== "") change.renameScore = Number(score);
		}
		if (kept >= limits.maxFiles) {
			summary.truncated = true;
			continue;
		}
		kept += 1;
		if (kind === "?") summary.commits.untracked.push(change);
		else if (kind === "u") summary.commits.conflicted.push(change);
		else if (kind === "!") continue;
		else {
			if (indexLetter !== ".") summary.commits.staged.push(change);
			if (worktreeLetter !== ".") summary.commits.unstaged.push(change);
		}
	}
	return summary;
}
/**
* Project the parsed status onto the wire summary the panel renders.
*
* @param parsed - the parser's output.
* @param extra - repository identity and notes the service resolved.
* @returns the wire payload.
*/
function toStatusSummary(parsed, extra) {
	return {
		...extra,
		branch: parsed.branch,
		detached: parsed.detached,
		unborn: parsed.unborn,
		upstream: parsed.upstream,
		ahead: parsed.ahead,
		behind: parsed.behind,
		staged: parsed.commits.staged,
		unstaged: parsed.commits.unstaged,
		untracked: parsed.commits.untracked,
		conflicted: parsed.commits.conflicted,
		truncated: parsed.truncated,
		skipped: parsed.skipped
	};
}
//#endregion
//#region lib/types/git/mutations.js
/** Stage the given paths. */
function stageArgs(paths) {
	return [
		"add",
		"--",
		...paths
	];
}
/** Unstage the given paths, leaving the work tree untouched. */
function unstageArgs(paths) {
	return [
		"restore",
		"--staged",
		"--",
		...paths
	];
}
/** Restore tracked paths from the index, discarding their work-tree edits. */
function discardTrackedArgs(paths) {
	return [
		"restore",
		"--",
		...paths
	];
}
/** Remove untracked paths from the work tree. */
function discardUntrackedArgs(paths) {
	return [
		"clean",
		"-f",
		"--",
		...paths
	];
}
/** Commit the index; the message travels on stdin so quoting cannot bite. */
function commitArgs(options) {
	return options.amend ? [
		"commit",
		"--amend",
		"-F",
		"-"
	] : [
		"commit",
		"-F",
		"-"
	];
}
/** The first non-empty line of a git refusal. */
function firstLine(text, fallback) {
	return (text.trim().split("\n").map((candidate) => candidate.trim()).find((candidate) => candidate !== "") ?? fallback).slice(0, 300);
}
/**
* Run one mutating command.
*
* @param ctx - the injected host scope.
* @param limits - the configured runner limits.
* @param options - the argv, the directory, optional stdin, and cancellation.
* @returns the outcome the panel reports.
*/
async function runMutation(ctx, limits, options) {
	try {
		const result = await runGit(ctx, limits, {
			cwd: options.cwd,
			args: options.args,
			...options.stdin === void 0 ? {} : { stdin: options.stdin },
			signal: options.signal
		});
		if (result.exitCode === 0) return {
			ok: true,
			detail: firstLine(result.stdout, "done")
		};
		return {
			ok: false,
			detail: firstLine(result.stderr, `git exited ${String(result.exitCode)}`)
		};
	} catch (error) {
		return {
			ok: false,
			detail: error instanceof Error ? error.message : String(error)
		};
	}
}
//#endregion
//#region lib/types/git/diff.js
/** Decode UTF-8 and refuse anything that reads as binary. */
function decodeText(bytes) {
	if (bytes.includes(0)) return null;
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return null;
	}
}
/** Read one git object as text. */
async function readObject(ctx, limits, options) {
	const result = await runGit(ctx, limits, {
		cwd: options.root,
		args: ["show", options.revision],
		signal: options.signal
	});
	if (result.exitCode !== 0) return {
		text: null,
		missing: true,
		lossy: false
	};
	return {
		text: result.stdout,
		missing: false,
		lossy: result.stdoutLossy
	};
}
/**
* Read both sides of one changed file.
*
* @param ctx - the injected host scope.
* @param limits - the configured runner limits.
* @param options - which file, which comparison, and the caps.
* @returns the two sides plus the flags the panel renders.
*/
async function readFileDiff(ctx, limits, options) {
	const { root, path, staged, untracked, maxFileBytes, signal } = options;
	const base = {
		path,
		root,
		staged,
		oldText: "",
		newText: "",
		binary: false,
		oversized: false,
		note: ""
	};
	let oldText = "";
	if (!untracked) {
		const oldSide = await readObject(ctx, limits, {
			root,
			revision: staged ? `HEAD:${path}` : `:${path}`,
			signal
		});
		if (oldSide.text !== null && decodeText(new TextEncoder().encode(oldSide.text)) === null) return {
			...base,
			binary: true,
			note: "the previous version is not text"
		};
		if (oldSide.lossy) return {
			...base,
			oversized: true,
			note: "the previous version exceeded the output cap"
		};
		oldText = oldSide.text ?? "";
	}
	let newText = "";
	if (staged) {
		const newSide = await readObject(ctx, limits, {
			root,
			revision: `:${path}`,
			signal
		});
		if (newSide.lossy) return {
			...base,
			oversized: true,
			note: "the staged version exceeded the output cap"
		};
		newText = newSide.text ?? "";
	} else {
		const fs = ctx.get?.("fs");
		if (fs === void 0) return {
			...base,
			oldText,
			note: "the filesystem service is unavailable, so the working copy could not be read"
		};
		try {
			const target = await fs.resolve(path, {
				cwd: root,
				signal
			});
			const decoded = decodeText(await fs.readBytes(target, signal, maxFileBytes));
			if (decoded === null) return {
				...base,
				oldText,
				binary: true,
				note: "the working copy is not text"
			};
			newText = decoded;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (/too-large|maxFileBytes|larger than/i.test(message)) return {
				...base,
				oldText,
				oversized: true,
				note: "the working copy exceeds the read cap"
			};
			if (/not-found|ENOENT|no such file/i.test(message)) return {
				path,
				root,
				staged,
				oldText,
				newText: "",
				binary: false,
				oversized: false,
				note: "the file is deleted in the working tree"
			};
			return {
				...base,
				oldText,
				note: message.slice(0, 200)
			};
		}
	}
	return {
		path,
		root,
		staged,
		oldText,
		newText,
		binary: false,
		oversized: false,
		note: ""
	};
}
//#endregion
//#region lib/types/git/numstat.js
/** The two comparisons a panel row can belong to. */
const NUMSTAT_ARGS = {
	unstaged: [
		"diff",
		"--numstat",
		"-z",
		"--no-renames"
	],
	staged: [
		"diff",
		"--cached",
		"--numstat",
		"-z",
		"--no-renames"
	]
};
/**
* Parse one numstat stream.
*
* @param output - raw stdout of `git diff --numstat -z`.
* @param staged - which comparison these counts belong to.
* @returns one entry per changed path.
*/
function parseNumstat(output, staged) {
	const entries = [];
	for (const token of output.split("\0")) {
		if (token === "") continue;
		const firstTab = token.indexOf("	");
		const secondTab = firstTab === -1 ? -1 : token.indexOf("	", firstTab + 1);
		if (firstTab === -1 || secondTab === -1) continue;
		const added = token.slice(0, firstTab);
		const removed = token.slice(firstTab + 1, secondTab);
		const path = token.slice(secondTab + 1);
		if (path === "") continue;
		const binary = added === "-" || removed === "-";
		entries.push({
			path,
			staged,
			added: binary ? 0 : Number(added),
			removed: binary ? 0 : Number(removed),
			binary
		});
	}
	return entries;
}
/**
* Read the line counts for both comparisons.
*
* @param ctx - the injected host scope.
* @param limits - the configured runner limits.
* @param options - the repository root and cancellation.
* @returns the counts for the work tree and the index, in that order.
*/
async function readStats(ctx, limits, options) {
	const entries = [];
	for (const [key, args] of Object.entries(NUMSTAT_ARGS)) {
		const staged = key === "staged";
		try {
			const result = await runGit(ctx, limits, {
				cwd: options.root,
				args: [...args],
				signal: options.signal
			});
			if (result.exitCode === 0) entries.push(...parseNumstat(result.stdout, staged));
		} catch {}
	}
	return entries;
}
//#endregion
//#region lib/types/git/log.js
/** The field separator inside one record. */
const FIELD = "";
/** The record separator between commits. */
const RECORD = "\0";
/** The format string: hash, short hash, author, ISO date, subject. */
const LOG_FORMAT = [
	"%H",
	"%h",
	"%an",
	"%aI",
	"%s"
].join(FIELD);
/**
* Parse one log stream.
*
* @param output - raw stdout of `git log --format=<LOG_FORMAT> -z`.
* @returns one entry per commit, newest first.
*/
function parseLog(output) {
	const commits = [];
	for (const record of output.split(RECORD)) {
		const trimmed = record.replace(/^\n/, "");
		if (trimmed === "") continue;
		const [hash, short, author, date, subject] = trimmed.split(FIELD);
		if (hash === void 0 || short === void 0) continue;
		commits.push({
			hash,
			short,
			author: author ?? "",
			date: date ?? "",
			subject: subject ?? ""
		});
	}
	return commits;
}
/**
* Read the most recent commits on the current branch.
*
* @param ctx - the injected host scope.
* @param limits - the configured runner limits.
* @param options - the repository root, how many commits, and cancellation.
* @returns the parsed commits, newest first; an empty list when the branch has none.
*/
async function readLog(ctx, limits, options) {
	const args = [
		"log",
		`--format=${LOG_FORMAT}`,
		"-z",
		`--max-count=${String(options.limit)}`
	];
	if (options.path !== void 0 && options.path !== "") args.push("--", options.path);
	const result = await runGit(ctx, limits, {
		cwd: options.root,
		args,
		signal: options.signal
	});
	if (result.exitCode !== 0) return [];
	return parseLog(result.stdout);
}
//#endregion
//#region lib/types/tools.js
/**
* Wrap one tool's arguments into the JSON Schema the registry validates against.
*
* @param properties - the accepted properties.
* @param required - the ones a call must supply.
* @returns an object-rooted schema.
*/
function schema(properties, required) {
	return {
		type: "object",
		properties,
		required: [...required],
		additionalProperties: false
	};
}
/** The Session id a tool call belongs to, or undefined when it has none. */
function sessionOf(exec) {
	const id = exec.agent?.session?.id;
	return id === void 0 ? void 0 : String(id);
}
/** A positive integer argument, or the fallback when it is absent or unusable. */
function count(value, fallback, cap) {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), cap) : fallback;
}
/** One changed path, as a tool answer lists it. */
function listChanges(summary, maxFiles) {
	const trim = (entries) => entries.slice(0, maxFiles).map((entry) => entry.origPath === void 0 ? {
		path: entry.path,
		status: entry.status
	} : {
		path: entry.path,
		status: entry.status,
		from: entry.origPath
	});
	return {
		staged: trim(summary.staged),
		unstaged: trim(summary.unstaged),
		untracked: trim(summary.untracked),
		conflicted: trim(summary.conflicted),
		truncated: summary.truncated
	};
}
/** Every tool this plugin registers. */
function definitions(service) {
	return [
		{
			name: "git_status",
			description: "Report the working tree of the session workspace: branch, upstream drift, in-progress operation, and the staged, unstaged, untracked and conflicted paths. Read-only.",
			parameters: schema({ maxFiles: {
				type: "number",
				description: "Cap on paths listed per group; defaults to 100."
			} }, []),
			output: {
				schema: { type: "string" },
				render: (_args, value) => [{
					type: "text",
					text: value
				}]
			},
			async execute(args, exec) {
				const sessionId = sessionOf(exec);
				if (sessionId === void 0) return JSON.stringify({ error: "this call has no session" });
				const summary = await service.status(sessionId, "", exec.signal);
				return JSON.stringify({
					isRepo: summary.isRepo,
					root: summary.root,
					rootSource: summary.rootSource,
					branch: summary.branch,
					detached: summary.detached,
					unborn: summary.unborn,
					upstream: summary.upstream,
					ahead: summary.ahead,
					behind: summary.behind,
					operation: summary.operation,
					changes: listChanges(summary, count(args.maxFiles, 100, 5e3)),
					note: summary.note
				});
			}
		},
		{
			name: "git_diff",
			description: "Return the unified patch of one changed file in the session workspace: the work tree against the index by default, or the index against HEAD with staged. Read-only.",
			parameters: schema({
				path: {
					type: "string",
					description: "Path relative to the repository root, as git_status reports it."
				},
				staged: {
					type: "boolean",
					description: "True for the staged comparison (index against HEAD)."
				},
				untracked: {
					type: "boolean",
					description: "True when git does not track the path yet; the whole file is then reported as added."
				}
			}, ["path"]),
			output: {
				schema: { type: "string" },
				render: (_args, value) => [{
					type: "text",
					text: value
				}]
			},
			async execute(args, exec) {
				const sessionId = sessionOf(exec);
				if (sessionId === void 0) return JSON.stringify({ error: "this call has no session" });
				const path = typeof args.path === "string" ? args.path : "";
				if (path === "") return JSON.stringify({ error: "path is required" });
				const staged = args.staged === true;
				if (args.untracked === true) {
					const diff = await service.fileDiff(sessionId, "", path, staged, true, exec.signal);
					return JSON.stringify({
						path,
						staged,
						untracked: true,
						binary: diff.binary,
						oversized: diff.oversized,
						added: diff.newText,
						note: diff.note
					});
				}
				const patch = await service.patch(sessionId, "", path, staged, exec.signal);
				return JSON.stringify({
					path,
					staged,
					patch: patch.patch,
					note: patch.note
				});
			}
		},
		{
			name: "git_log",
			description: "List recent commits on the current branch of the session workspace, optionally restricted to one path. Read-only.",
			parameters: schema({
				limit: {
					type: "number",
					description: "How many commits to return; defaults to 20, capped at 200."
				},
				path: {
					type: "string",
					description: "Restrict the history to one path."
				}
			}, []),
			output: {
				schema: { type: "string" },
				render: (_args, value) => [{
					type: "text",
					text: value
				}]
			},
			async execute(args, exec) {
				const sessionId = sessionOf(exec);
				if (sessionId === void 0) return JSON.stringify({ error: "this call has no session" });
				const commits = await service.log(sessionId, "", count(args.limit, 20, 200), typeof args.path === "string" ? args.path : "", exec.signal);
				return JSON.stringify({ commits });
			}
		}
	];
}
/**
* Register the read-only git tools.
*
* @param ctx - the host context that carries the tools registry.
* @param service - the git service the tools read.
*/
function registerGitTools(ctx, service) {
	ctx.inject(["tools"], (scope) => {
		const registry = scope.tools;
		const disposers = definitions(service).map((definition) => registry.register(definition));
		return () => {
			for (const dispose of disposers.reverse()) dispose();
		};
	});
}
//#endregion
//#region lib/types/index.js
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) {
			if (kind === "field") initializers.unshift(_);
			else descriptor[key] = _;
		}
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/** The plugin's own version, reported to the panel so a build is identifiable. */
const PACKAGE_VERSION = "0.1.0-m5";
/** `rev-parse` output that locates the repository. */
const REV_PARSE_ARGS = [
	"rev-parse",
	"--show-toplevel",
	"--absolute-git-dir"
];
/** The status read: porcelain v2 is NUL-separated and never quotes paths. */
const STATUS_ARGS = [
	"status",
	"--porcelain=v2",
	"-z",
	"--branch",
	"--untracked-files=all"
];
/** Marker refs whose presence names the operation in progress, in precedence order. */
const OPERATION_REFS = [
	["MERGE_HEAD", "merge"],
	["REBASE_HEAD", "rebase"],
	["CHERRY_PICK_HEAD", "cherry-pick"],
	["REVERT_HEAD", "revert"]
];
let GitExplorerService = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _status_decorators;
	let _log_decorators;
	let _patch_decorators;
	let _fileStats_decorators;
	let _fileDiff_decorators;
	let _stage_decorators;
	let _unstage_decorators;
	let _discard_decorators;
	let _commit_decorators;
	let _ping_decorators;
	return class GitExplorerService extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_status_decorators = [Remote];
			_log_decorators = [Remote];
			_patch_decorators = [Remote];
			_fileStats_decorators = [Remote];
			_fileDiff_decorators = [Remote];
			_stage_decorators = [Remote];
			_unstage_decorators = [Remote];
			_discard_decorators = [Remote];
			_commit_decorators = [Remote];
			_ping_decorators = [Remote];
			__esDecorate(this, null, _status_decorators, {
				kind: "method",
				name: "status",
				static: false,
				private: false,
				access: {
					has: (obj) => "status" in obj,
					get: (obj) => obj.status
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _log_decorators, {
				kind: "method",
				name: "log",
				static: false,
				private: false,
				access: {
					has: (obj) => "log" in obj,
					get: (obj) => obj.log
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _patch_decorators, {
				kind: "method",
				name: "patch",
				static: false,
				private: false,
				access: {
					has: (obj) => "patch" in obj,
					get: (obj) => obj.patch
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _fileStats_decorators, {
				kind: "method",
				name: "fileStats",
				static: false,
				private: false,
				access: {
					has: (obj) => "fileStats" in obj,
					get: (obj) => obj.fileStats
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _fileDiff_decorators, {
				kind: "method",
				name: "fileDiff",
				static: false,
				private: false,
				access: {
					has: (obj) => "fileDiff" in obj,
					get: (obj) => obj.fileDiff
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _stage_decorators, {
				kind: "method",
				name: "stage",
				static: false,
				private: false,
				access: {
					has: (obj) => "stage" in obj,
					get: (obj) => obj.stage
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _unstage_decorators, {
				kind: "method",
				name: "unstage",
				static: false,
				private: false,
				access: {
					has: (obj) => "unstage" in obj,
					get: (obj) => obj.unstage
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _discard_decorators, {
				kind: "method",
				name: "discard",
				static: false,
				private: false,
				access: {
					has: (obj) => "discard" in obj,
					get: (obj) => obj.discard
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _commit_decorators, {
				kind: "method",
				name: "commit",
				static: false,
				private: false,
				access: {
					has: (obj) => "commit" in obj,
					get: (obj) => obj.commit
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _ping_decorators, {
				kind: "method",
				name: "ping",
				static: false,
				private: false,
				access: {
					has: (obj) => "ping" in obj,
					get: (obj) => obj.ping
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		/**
		* Services this half waits for before it applies.
		*
		* Declaring them is not what grants access: Cordis refuses a property read such as
		* `ctx.sessions` unless the read happens on a context that *injected* the service, so
		* the working scope is captured through `ctx.inject` below — the same shape the shipped
		* Remote services use. Without that scope the guard throws
		* `cannot get property "sessions" without inject` inside the Remote call.
		*/
		static inject = ["subprocess", "sessions"];
		static Config = z.object({
			gitPath: z.string().default("git"),
			timeoutMs: z.number().step(1).min(1).default(3e4),
			outputMaxBytes: z.number().step(1).min(1).default(8388608),
			maxFiles: z.number().step(1).min(1).default(2e3),
			maxFileBytes: z.number().step(1).min(1).default(2097152)
		});
		limits = __runInitializers(this, _instanceExtraInitializers);
		/** The injected scope every git read runs on; undefined until the services exist. */
		scope;
		/** `git --version`, probed once per process after the first successful read. */
		gitVersion;
		/**
		* @param ctx - host context carrying `subprocess` and the Session store.
		* @param config - how git is invoked and how much output is retained.
		*/
		constructor(ctx, config) {
			super(ctx, "git");
			this.limits = config;
			ctx.inject(["subprocess", "sessions"], (scope) => {
				this.scope = scope;
				return () => {
					this.scope = void 0;
				};
			});
			registerGitTools(ctx, this);
		}
		/**
		* Read the working-tree state for one Session.
		*
		* @param sessionId - the Session identity received on the wire.
		* @param requestRoot - the working directory the panel offers when the host's own
		*   Session lookup cannot answer; empty string when the panel has nothing to offer.
		* @param signal - the invocation's cancellation signal, injected by the gateway.
		* @returns the status summary the panel renders.
		*/
		async status(sessionId, requestRoot, signal) {
			const scope = this.scope;
			const resolved = scope === void 0 ? {
				root: requestRoot === "" ? null : requestRoot,
				source: requestRoot === "" ? "none" : "request",
				sessionFound: false,
				note: "the host git services are not available yet"
			} : await resolveRoot(scope, sessionId, requestRoot);
			const empty = (note, isRepo) => ({
				isRepo,
				root: resolved.root,
				rootSource: resolved.source,
				gitVersion: this.gitVersion ?? null,
				operation: null,
				branch: null,
				detached: false,
				unborn: false,
				upstream: null,
				ahead: 0,
				behind: 0,
				staged: [],
				unstaged: [],
				untracked: [],
				conflicted: [],
				truncated: false,
				skipped: [],
				note
			});
			if (scope === void 0) return empty(resolved.note, false);
			if (resolved.root === null) return empty(resolved.note, false);
			const version = await this.readGitVersion(scope, resolved.root, signal);
			if (version === null) return empty(resolved.note === "" ? "git could not be executed" : resolved.note, false);
			const located = await runGit(scope, this.limits, {
				cwd: resolved.root,
				args: [...REV_PARSE_ARGS],
				signal
			});
			if (located.exitCode !== 0) return empty((located.stderr.trim().split("\n")[0] ?? "git could not locate a repository").slice(0, 200), false);
			const [toplevel] = located.stdout.split("\n");
			const root = toplevel === void 0 || toplevel === "" ? resolved.root : toplevel;
			const read = await runGit(scope, this.limits, {
				cwd: root,
				args: [...STATUS_ARGS],
				signal
			});
			if (read.exitCode !== 0) return empty((read.stderr.trim().split("\n")[0] ?? "git status failed").slice(0, 200), true);
			const parsed = parsePorcelainV2(read.stdout, { maxFiles: this.limits.maxFiles });
			const note = parsed.truncated ? `listing cut at ${String(this.limits.maxFiles)} entries` : parsed.skipped.length > 0 ? `${String(parsed.skipped.length)} unrecognized record(s) ignored` : "";
			return toStatusSummary(parsed, {
				isRepo: true,
				root,
				rootSource: resolved.source,
				operation: await this.detectOperation(scope, root, signal),
				gitVersion: version,
				note
			});
		}
		/**
		* Read the most recent commits on the current branch.
		*
		* @param sessionId - the Session identity received on the wire.
		* @param requestRoot - the working directory the panel offers, if any.
		* @param limit - how many commits to return.
		* @param path - restrict the history to one path; empty string means the whole branch.
		* @param signal - the invocation's cancellation signal.
		* @returns the commits, newest first.
		*/
		async log(sessionId, requestRoot, limit, path, signal) {
			const root = await this.repositoryRoot(sessionId, requestRoot, signal);
			if (root === null) return [];
			const capped = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 20;
			return await readLog(this.scope ?? this.ctx, this.limits, {
				root,
				limit: capped,
				path,
				signal
			});
		}
		/**
		* Read the unified patch for one changed file, as the model reads diffs.
		*
		* @param sessionId - the Session identity received on the wire.
		* @param requestRoot - the working directory the panel offers, if any.
		* @param path - the repository-relative path.
		* @param staged - true to compare the index against HEAD.
		* @param signal - the invocation's cancellation signal.
		* @returns the patch text, or the reason there is none.
		*/
		async patch(sessionId, requestRoot, path, staged, signal) {
			const scope = this.scope;
			if (scope === void 0) return {
				path,
				patch: "",
				note: "the host git services are not available yet"
			};
			const root = await this.repositoryRoot(sessionId, requestRoot, signal);
			if (root === null) return {
				path,
				patch: "",
				note: "no repository resolved for this Session"
			};
			const args = staged ? [
				"diff",
				"--cached",
				"--no-color",
				"--no-ext-diff",
				"-U3",
				"--",
				path
			] : [
				"diff",
				"--no-color",
				"--no-ext-diff",
				"-U3",
				"--",
				path
			];
			const result = await runGit(scope, this.limits, {
				cwd: root,
				args,
				signal
			});
			if (result.exitCode !== 0) return {
				path,
				patch: "",
				note: (result.stderr.trim().split("\n")[0] ?? "git diff failed").slice(0, 200)
			};
			const note = result.stdoutLossy ? "the patch exceeded the output cap and was cut" : "";
			return {
				path,
				patch: result.stdout,
				note
			};
		}
		/**
		* Resolve the repository root for one Session, or null when there is none.
		*
		* @param sessionId - the Session identity received on the wire.
		* @param requestRoot - the working directory the panel offers, if any.
		* @param signal - caller cancellation.
		* @returns the repository's top level.
		*/
		async repositoryRoot(sessionId, requestRoot, signal) {
			const scope = this.scope;
			if (scope === void 0) return null;
			const resolved = await resolveRoot(scope, sessionId, requestRoot);
			if (resolved.root === null) return null;
			const located = await runGit(scope, this.limits, {
				cwd: resolved.root,
				args: [...REV_PARSE_ARGS],
				signal
			});
			if (located.exitCode !== 0) return null;
			const [toplevel] = located.stdout.split("\n");
			return toplevel === void 0 || toplevel === "" ? resolved.root : toplevel;
		}
		/**
		* Read the per-file line counts both comparisons report.
		*
		* @param sessionId - the Session identity received on the wire.
		* @param requestRoot - the working directory the panel offers, if any.
		* @param signal - the invocation's cancellation signal.
		* @returns one entry per changed path, or none when the repository cannot be read.
		*/
		async fileStats(sessionId, requestRoot, signal) {
			const scope = this.scope;
			if (scope === void 0) return [];
			const resolved = await resolveRoot(scope, sessionId, requestRoot);
			if (resolved.root === null) return [];
			const located = await runGit(scope, this.limits, {
				cwd: resolved.root,
				args: [...REV_PARSE_ARGS],
				signal
			});
			if (located.exitCode !== 0) return [];
			const [toplevel] = located.stdout.split("\n");
			const root = toplevel === void 0 || toplevel === "" ? resolved.root : toplevel;
			return await readStats(scope, this.limits, {
				root,
				signal
			});
		}
		/**
		* Read both sides of one changed file for the diff view.
		*
		* @param sessionId - the Session identity received on the wire.
		* @param requestRoot - the working directory the panel offers, if any.
		* @param path - the repository-relative path.
		* @param staged - true to compare the index against HEAD instead of the work tree.
		* @param untracked - true when git does not track the path yet (no old side).
		* @param signal - the invocation's cancellation signal.
		* @returns the two sides, or the flags explaining why they are not shown.
		*/
		async fileDiff(sessionId, requestRoot, path, staged, untracked, signal) {
			const empty = (note) => ({
				path,
				root: "",
				staged,
				oldText: "",
				newText: "",
				binary: false,
				oversized: false,
				note
			});
			const scope = this.scope;
			if (scope === void 0) return empty("the host git services are not available yet");
			const resolved = await resolveRoot(scope, sessionId, requestRoot);
			if (resolved.root === null) return empty(resolved.note);
			const located = await runGit(scope, this.limits, {
				cwd: resolved.root,
				args: [...REV_PARSE_ARGS],
				signal
			});
			if (located.exitCode !== 0) return empty((located.stderr.trim().split("\n")[0] ?? "not a git repository").slice(0, 200));
			const [toplevel] = located.stdout.split("\n");
			const root = toplevel === void 0 || toplevel === "" ? resolved.root : toplevel;
			return await readFileDiff(scope, this.limits, {
				root,
				path,
				staged,
				untracked,
				maxFileBytes: this.limits.maxFileBytes,
				signal
			});
		}
		/**
		* Stage the given paths.
		*
		* @param sessionId - the Session identity received on the wire.
		* @param requestRoot - the working directory the panel offers, if any.
		* @param paths - repository-relative paths, as the panel rendered them.
		* @param signal - the invocation's cancellation signal.
		* @returns what the mutation did.
		*/
		async stage(sessionId, requestRoot, paths, signal) {
			return await this.mutate(sessionId, requestRoot, signal, (cwd) => ({
				cwd,
				args: stageArgs(paths)
			}));
		}
		/**
		* Unstage the given paths, leaving the work tree untouched.
		*
		* @param sessionId - the Session identity received on the wire.
		* @param requestRoot - the working directory the panel offers, if any.
		* @param paths - repository-relative paths.
		* @param signal - the invocation's cancellation signal.
		* @returns what the mutation did.
		*/
		async unstage(sessionId, requestRoot, paths, signal) {
			return await this.mutate(sessionId, requestRoot, signal, (cwd) => ({
				cwd,
				args: unstageArgs(paths)
			}));
		}
		/**
		* Discard work-tree changes.
		*
		* Destructive, so the caller must pass `confirmed` after asking the person; without it
		* the call is refused rather than performed. Tracked paths are restored from the index
		* and untracked ones are removed, because git spells those two operations differently.
		*
		* @param sessionId - the Session identity received on the wire.
		* @param requestRoot - the working directory the panel offers, if any.
		* @param trackedPaths - paths git already tracks.
		* @param untrackedPaths - paths git does not track yet.
		* @param confirmed - true only after an explicit confirmation.
		* @param signal - the invocation's cancellation signal.
		* @returns what the mutations did.
		*/
		async discard(sessionId, requestRoot, trackedPaths, untrackedPaths, confirmed, signal) {
			if (!confirmed) return {
				ok: false,
				detail: "discarding changes requires an explicit confirmation"
			};
			const details = [];
			if (trackedPaths.length > 0) {
				const restored = await this.mutate(sessionId, requestRoot, signal, (cwd) => ({
					cwd,
					args: discardTrackedArgs(trackedPaths)
				}));
				if (!restored.ok) return restored;
				details.push(`restored ${String(trackedPaths.length)} tracked file(s)`);
			}
			if (untrackedPaths.length > 0) {
				const removed = await this.mutate(sessionId, requestRoot, signal, (cwd) => ({
					cwd,
					args: discardUntrackedArgs(untrackedPaths)
				}));
				if (!removed.ok) return removed;
				details.push(`removed ${String(untrackedPaths.length)} untracked file(s)`);
			}
			if (details.length === 0) return {
				ok: false,
				detail: "nothing to discard"
			};
			return {
				ok: true,
				detail: details.join("; ")
			};
		}
		/**
		* Commit the index.
		*
		* @param sessionId - the Session identity received on the wire.
		* @param requestRoot - the working directory the panel offers, if any.
		* @param message - the commit message; it travels on stdin.
		* @param amend - true to replace the previous commit.
		* @param signal - the invocation's cancellation signal.
		* @returns what the commit did, including git's own refusals (nothing staged, no identity).
		*/
		async commit(sessionId, requestRoot, message, amend, signal) {
			if (message.trim() === "") return {
				ok: false,
				detail: "a commit message is required"
			};
			return await this.mutate(sessionId, requestRoot, signal, (cwd) => ({
				cwd,
				args: commitArgs({ amend }),
				stdin: message
			}));
		}
		/**
		* Resolve the repository and run one mutation in it.
		*
		* @param sessionId - the Session identity received on the wire.
		* @param requestRoot - the working directory the panel offers, if any.
		* @param signal - caller cancellation.
		* @param build - how to spell the command once the directory is known.
		* @returns what the mutation did.
		*/
		async mutate(sessionId, requestRoot, signal, build) {
			const scope = this.scope;
			if (scope === void 0) return {
				ok: false,
				detail: "the host git services are not available yet"
			};
			const resolved = await resolveRoot(scope, sessionId, requestRoot);
			if (resolved.root === null) return {
				ok: false,
				detail: resolved.note
			};
			const located = await runGit(scope, this.limits, {
				cwd: resolved.root,
				args: [...REV_PARSE_ARGS],
				signal
			});
			if (located.exitCode !== 0) return {
				ok: false,
				detail: (located.stderr.trim().split("\n")[0] ?? "not a git repository").slice(0, 200)
			};
			const [toplevel] = located.stdout.split("\n");
			const command = build(toplevel === void 0 || toplevel === "" ? resolved.root : toplevel);
			return await runMutation(scope, this.limits, {
				cwd: command.cwd,
				args: command.args,
				...command.stdin === void 0 ? {} : { stdin: command.stdin },
				signal
			});
		}
		/**
		* Report what the host can see for this Session: the plugin build, git itself, and
		* the working directory the Session resolves to. Kept beside {@link status} as the
		* diagnostic entry point a panel shows when the repository read fails.
		*
		* @param sessionId - the Session whose working directory is inspected.
		* @param requestRoot - the working directory the panel offers, if any.
		* @param signal - the invocation's cancellation signal, injected by the gateway.
		* @returns the bridge probe result.
		*/
		async ping(sessionId, requestRoot, signal) {
			const scope = this.scope;
			const resolved = scope === void 0 ? {
				root: requestRoot === "" ? null : requestRoot,
				source: requestRoot === "" ? "none" : "request",
				sessionFound: false,
				note: "the host git services are not available yet"
			} : await resolveRoot(scope, sessionId, requestRoot);
			const gitVersion = scope === void 0 || resolved.root === null ? null : await this.readGitVersion(scope, resolved.root, signal);
			return {
				ok: true,
				packageVersion: PACKAGE_VERSION,
				gitVersion,
				cwd: resolved.root,
				remote: true,
				sessionFound: resolved.sessionFound,
				cwdSource: resolved.source,
				note: resolved.note
			};
		}
		/**
		* Probe `git --version` once and remember the answer for this process.
		*
		* @param scope - the injected host scope.
		* @param cwd - a directory to run the probe in.
		* @param signal - caller cancellation.
		* @returns the version line, or null when git could not run.
		*/
		async readGitVersion(scope, cwd, signal) {
			if (this.gitVersion !== void 0) return this.gitVersion;
			try {
				const result = await runGit(scope, this.limits, {
					cwd,
					args: ["--version"],
					signal
				});
				this.gitVersion = result.exitCode === 0 ? result.stdout.trim() : null;
			} catch {
				this.gitVersion = null;
			}
			return this.gitVersion;
		}
		/**
		* Name the operation in progress, read from git's marker refs.
		*
		* @param scope - the injected host scope.
		* @param root - the repository root.
		* @param signal - caller cancellation.
		* @returns the operation name, or null when the work tree is in a plain state.
		*/
		async detectOperation(scope, root, signal) {
			for (const [ref, operation] of OPERATION_REFS) try {
				if ((await runGit(scope, this.limits, {
					cwd: root,
					args: [
						"rev-parse",
						"-q",
						"--verify",
						ref
					],
					signal
				})).exitCode === 0) return operation;
			} catch {}
			return null;
		}
	};
})();
//#endregion
export { GitExplorerService, GitExplorerService as default };
