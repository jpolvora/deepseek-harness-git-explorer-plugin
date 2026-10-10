/**
 * The panel's words, in English and Chinese.
 *
 * The namespace is registered with the client locale service and named on every slot
 * registration, which is how a body receives its `t`. Git's own output — branch names,
 * paths, `git`'s error lines — is never translated: it is data, not copy.
 */

/** The locale namespace this plugin registers. */
export const NS = 'gitExplorer'

/** The English dictionary; its keys define the namespace's shape. */
export const en = {
  'type.label': 'Git',
  'guide.title': 'Git',
  'guide.description': 'Stage, commit and review working-tree changes.',
  'panel.refresh': 'Refresh',
  'panel.reading': 'Reading the working tree…',
  'panel.notRepo': 'Not a git repository.',
  'panel.clean': 'No changes — the working tree is clean.',
  'panel.conflicted': 'conflicted file(s) need resolution',
  'panel.detached': '(detached HEAD)',
  'panel.unborn': '(no commits yet)',
  'panel.unknownBranch': '(unknown)',
  'group.staged': 'Staged changes',
  'group.unstaged': 'Changes',
  'group.untracked': 'Untracked',
  'group.conflicted': 'Conflicted',
  'action.stage': 'Stage',
  'action.unstage': 'Unstage',
  'action.discardTracked': 'Discard changes',
  'action.discardUntracked': 'Delete file',
  'action.discard': 'Discard',
  'action.cancel': 'Cancel',
  'action.stageAll': 'Stage all',
  'action.unstageAll': 'Unstage all',
  'action.openFile': 'Open file',
  'commit.placeholder': 'Message (Ctrl+Enter to commit)',
  'commit.aria': 'Commit message',
  'commit.button': 'Commit',
  'commit.amendButton': 'Amend',
  'commit.busy': 'Committing…',
  'commit.amend': 'amend',
  'commit.hint': 'Ctrl+Enter',
  'discard.confirm': 'Discard {count} change(s)? This cannot be undone.',
  'diff.reading': 'Reading the diff…',
  'diff.noFile': 'this diff tab has no file to compare',
  'diff.stagedLabel': 'index vs HEAD',
  'diff.unstagedLabel': 'working tree vs index',
  'diff.binary': 'A binary file has no text diff.',
  'diff.oversized': 'One side is larger than the read cap, so no diff is shown.',
  'diagnostics.session': 'session',
  'diagnostics.workspace': 'workspace',
  'diagnostics.unknown': '(unknown to the panel)',
  'diagnostics.rootSource': 'root source',
  'diagnostics.git': 'git',
  'diagnostics.notFound': '(not found)',
  'diagnostics.note': 'note',
  'diagnostics.probe': 'probe',
  'diagnostics.build': 'plugin build',
  'diagnostics.tabHost': 'tab host',
  'diagnostics.hostPanel': 'panel host',
  'diagnostics.hostOpener': 'sidebar opener only',
  'diagnostics.hostNone': 'unavailable',
  'panel.operation': '{operation} in progress',
  'panel.failed': 'The Git panel failed to render: {message}',
  'opener.missing': 'this panel was given neither a tab host nor the sidebar opener',
  'opener.failed': 'opening the comparison failed: {message}',
}
/** The namespace's key set, so a dictionary cannot silently miss a key. */
export type MessageKey = keyof typeof en

/** The Chinese dictionary. */
export const zh: Record<MessageKey, string> = {
  'type.label': 'Git',
  'guide.title': 'Git',
  'guide.description': '在右侧边栏暂存、提交并审阅工作区改动。',
  'panel.refresh': '刷新',
  'panel.reading': '正在读取工作区…',
  'panel.notRepo': '不是 Git 仓库。',
  'panel.clean': '没有改动 — 工作区是干净的。',
  'panel.conflicted': '个冲突文件需要处理',
  'panel.detached': '（游离 HEAD）',
  'panel.unborn': '（尚无提交）',
  'panel.unknownBranch': '（未知）',
  'group.staged': '已暂存的更改',
  'group.unstaged': '更改',
  'group.untracked': '未跟踪',
  'group.conflicted': '冲突',
  'action.stage': '暂存',
  'action.unstage': '取消暂存',
  'action.discardTracked': '放弃更改',
  'action.discardUntracked': '删除文件',
  'action.discard': '放弃',
  'action.cancel': '取消',
  'action.stageAll': '全部暂存',
  'action.unstageAll': '全部取消暂存',
  'action.openFile': '打开文件',
  'commit.placeholder': '提交信息（Ctrl+Enter 提交）',
  'commit.aria': '提交信息',
  'commit.button': '提交',
  'commit.amendButton': '修补',
  'commit.busy': '正在提交…',
  'commit.amend': '修补上次提交',
  'commit.hint': 'Ctrl+Enter',
  'discard.confirm': '放弃 {count} 处更改？此操作无法撤销。',
  'diff.reading': '正在读取差异…',
  'diff.noFile': '此差异标签页没有要比较的文件',
  'diff.stagedLabel': '索引 对比 HEAD',
  'diff.unstagedLabel': '工作区 对比 索引',
  'diff.binary': '二进制文件没有文本差异。',
  'diff.oversized': '其中一侧超过读取上限，因此不显示差异。',
  'diagnostics.session': '会话',
  'diagnostics.workspace': '工作目录',
  'diagnostics.unknown': '（面板未知）',
  'diagnostics.rootSource': '目录来源',
  'diagnostics.git': 'git',
  'diagnostics.notFound': '（未找到）',
  'diagnostics.note': '说明',
  'diagnostics.probe': '探测',
  'diagnostics.build': '插件构建',
  'diagnostics.tabHost': '标签宿主',
  'diagnostics.hostPanel': '面板宿主',
  'diagnostics.hostOpener': '仅侧边栏打开器',
  'diagnostics.hostNone': '不可用',
  'panel.operation': '{operation} 进行中',
  'panel.failed': 'Git 面板渲染失败：{message}',
  'opener.missing': '此面板既没有标签宿主，也没有侧边栏打开器',
  'opener.failed': '打开比较视图失败：{message}',
}

/** The framework's translate function, when the slot registration named a namespace. */
export type Translate = (key: MessageKey, values?: Record<string, string>) => string

/**
 * The panel's translator: the framework's `t`, or the English dictionary when a body was
 * rendered without one (a test, or a slot that named no namespace).
 *
 * @param t - the framework's translate function, if any.
 * @returns a translator that never returns an empty string.
 */
export function translator(t: Translate | undefined): Translate {
  return (key, values) => {
    const text = t?.(key) ?? en[key]
    return values === undefined ? text : fill(text, values)
  }
}

/** Substitute `{name}` placeholders in one message. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? `{${key}}`)
}
