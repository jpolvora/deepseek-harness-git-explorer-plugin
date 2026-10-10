/**
 * The panel's words, in English and Chinese.
 *
 * The namespace is registered with the client locale service and named on every slot
 * registration, which is how a body receives its `t`. Git's own output — branch names,
 * paths, `git`'s error lines — is never translated: it is data, not copy.
 */
/** The locale namespace this plugin registers. */
export declare const NS = "gitExplorer";
/** The English dictionary; its keys define the namespace's shape. */
export declare const en: {
    'type.label': string;
    'guide.title': string;
    'guide.description': string;
    'panel.refresh': string;
    'panel.reading': string;
    'panel.notRepo': string;
    'panel.clean': string;
    'panel.conflicted': string;
    'panel.detached': string;
    'panel.unborn': string;
    'panel.unknownBranch': string;
    'group.staged': string;
    'group.unstaged': string;
    'group.untracked': string;
    'group.conflicted': string;
    'action.stage': string;
    'action.unstage': string;
    'action.discardTracked': string;
    'action.discardUntracked': string;
    'action.discard': string;
    'action.cancel': string;
    'action.stageAll': string;
    'action.unstageAll': string;
    'action.openFile': string;
    'commit.placeholder': string;
    'commit.aria': string;
    'commit.button': string;
    'commit.amendButton': string;
    'commit.busy': string;
    'commit.amend': string;
    'commit.hint': string;
    'discard.confirm': string;
    'diff.reading': string;
    'diff.noFile': string;
    'diff.stagedLabel': string;
    'diff.unstagedLabel': string;
    'diff.binary': string;
    'diff.oversized': string;
    'diagnostics.session': string;
    'diagnostics.workspace': string;
    'diagnostics.unknown': string;
    'diagnostics.rootSource': string;
    'diagnostics.git': string;
    'diagnostics.notFound': string;
    'diagnostics.note': string;
    'diagnostics.probe': string;
    'diagnostics.build': string;
    'diagnostics.tabHost': string;
    'diagnostics.hostPanel': string;
    'diagnostics.hostOpener': string;
    'diagnostics.hostNone': string;
    'panel.operation': string;
    'panel.failed': string;
    'opener.missing': string;
    'opener.failed': string;
};
/** The namespace's key set, so a dictionary cannot silently miss a key. */
export type MessageKey = keyof typeof en;
/** The Chinese dictionary. */
export declare const zh: Record<MessageKey, string>;
/** The framework's translate function, when the slot registration named a namespace. */
export type Translate = (key: MessageKey, values?: Record<string, string>) => string;
/**
 * The panel's translator: the framework's `t`, or the English dictionary when a body was
 * rendered without one (a test, or a slot that named no namespace).
 *
 * @param t - the framework's translate function, if any.
 * @returns a translator that never returns an empty string.
 */
export declare function translator(t: Translate | undefined): Translate;
/** Substitute `{name}` placeholders in one message. */
export declare function fill(template: string, values: Record<string, string>): string;
