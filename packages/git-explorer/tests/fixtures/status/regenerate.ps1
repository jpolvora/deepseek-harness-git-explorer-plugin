#Requires -Version 7.0
<#
.SYNOPSIS
    Regenerates the raw `git status --porcelain=v2 -z` fixtures for the git-explorer tests.

.DESCRIPTION
    Every fixture is produced by driving a real git binary inside a throwaway repository under
    `<repo>/.tools/scratch/status-repo/<scenario>/`, then capturing the *bytes* of
    `git -c core.quotepath=false status --porcelain=v2 -z --branch --untracked-files=all`
    straight off the child process's stdout pipe. Nothing is decoded, re-encoded or
    line-split on the way to disk, so the NUL bytes that `-z` uses are preserved exactly.

    For each scenario the script writes:
        <scenario>.bin         raw stdout bytes (plus <scenario>.stderr.bin for `not-a-repo`)
        <scenario>.json        scenario metadata: command, git version, committed files, notes

    Determinism: the run environment is scrubbed so neither the user's global nor the system
    git config can influence the result, and every commit is stamped with a fixed timestamp,
    which makes the recorded commit hashes (`# branch.oid`) reproducible too. The only
    remaining variable is the git build, whose version is recorded in each `.json`.

.PARAMETER ScratchRoot
    Where the throwaway repositories are created. Defaults to
    `<repo>/.tools/scratch/status-repo`. The directory is wiped per scenario.

.PARAMETER FixtureRoot
    Where the `.bin`/`.json` files are written. Defaults to this script's own directory.

.EXAMPLE
    pwsh -File ./regenerate.ps1

.EXAMPLE
    pwsh -File ./regenerate.ps1 -ScratchRoot D:\tmp\status-repo
#>
[CmdletBinding()]
param(
    [string] $ScratchRoot,
    [string] $FixtureRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $FixtureRoot) { $FixtureRoot = $PSScriptRoot }
$FixtureRoot = (Resolve-Path -LiteralPath $FixtureRoot).Path
if (-not $ScratchRoot) {
    $repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..\..\..')).Path
    $ScratchRoot = Join-Path $repoRoot '.tools\scratch\status-repo'
}
$ScratchRoot = [System.IO.Path]::GetFullPath($ScratchRoot)

$script:Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$script:GitExe = 'git'

# --- the exact command whose stdout becomes <scenario>.bin -------------------------------
# Kept verbatim in the JSON `command` field, so a test can assert on it.
$script:StatusConfig = @('-c', 'core.quotepath=false')
$script:StatusArgs = @('status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all')
$script:StatusCommandText = 'git ' + (($script:StatusConfig + $script:StatusArgs) -join ' ')

# --- config forced onto every mutating command ------------------------------------------
# Identity and signing are pinned per the fixture contract; the rest neutralise ambient
# configuration so the committed trees (and therefore the recorded hashes) stay stable.
$script:WriteConfig = @(
    '-c', 'core.quotepath=false'
    '-c', 'core.autocrlf=false'
    '-c', 'status.renames=true'
    '-c', 'commit.gpgsign=false'
    '-c', 'user.name=Fixture'
    '-c', 'user.email=fixture@example.invalid'
)

# --- a fixed clock keeps `# branch.oid` reproducible -------------------------------------
$script:GitBaseEnv = [ordered]@{
    GIT_CONFIG_NOSYSTEM   = '1'
    GIT_CONFIG_GLOBAL     = (Join-Path $ScratchRoot 'empty.gitconfig')
    GIT_AUTHOR_DATE       = '2024-01-01T00:00:00+00:00'
    GIT_COMMITTER_DATE    = '2024-01-01T00:00:00+00:00'
    GIT_TERMINAL_PROMPT   = '0'
    LC_ALL                = 'C'
}

$script:GitVersion = ''

# ---------------------------------------------------------------------------------------
# process plumbing
# ---------------------------------------------------------------------------------------

function New-GitStartInfo {
    <#
    .SYNOPSIS
        Build a ProcessStartInfo for git with the ambient GIT_* environment scrubbed.
    #>
    param(
        [Parameter(Mandatory)][string] $WorkDir,
        [Parameter(Mandatory)][string[]] $Arguments,
        [hashtable] $Environment = @{}
    )

    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $script:GitExe
    $psi.WorkingDirectory = $WorkDir
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    foreach ($argument in $Arguments) { [void] $psi.ArgumentList.Add($argument) }

    # Drop anything the parent shell may carry (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...)
    # so the child sees exactly the environment this script defines.
    foreach ($key in @($psi.Environment.Keys)) {
        if ($key -like 'GIT_*') { [void] $psi.Environment.Remove($key) }
    }
    foreach ($key in $script:GitBaseEnv.Keys) { $psi.Environment[$key] = $script:GitBaseEnv[$key] }
    foreach ($key in $Environment.Keys) { $psi.Environment[$key] = $Environment[$key] }
    return $psi
}

function Invoke-Git {
    <#
    .SYNOPSIS
        Run git and return its raw stdout/stderr bytes plus the exit code.
    #>
    param(
        [Parameter(Mandatory)][string] $WorkDir,
        [Parameter(Mandatory)][string[]] $Arguments,
        [hashtable] $Environment = @{},
        [switch] $AllowFailure
    )

    $psi = New-GitStartInfo -WorkDir $WorkDir -Arguments $Arguments -Environment $Environment
    $stdout = [System.IO.MemoryStream]::new()
    $stderr = [System.IO.MemoryStream]::new()
    $process = [System.Diagnostics.Process]::Start($psi)
    try {
        # Copy the *base streams* (bytes, not decoded text) so NUL and any non-UTF-8 path
        # bytes survive untouched. Both copies are async to avoid pipe-buffer deadlocks.
        $stdoutCopy = $process.StandardOutput.BaseStream.CopyToAsync($stdout)
        $stderrCopy = $process.StandardError.BaseStream.CopyToAsync($stderr)
        $process.WaitForExit()
        [void] $stdoutCopy.GetAwaiter().GetResult()
        [void] $stderrCopy.GetAwaiter().GetResult()
        $result = [pscustomobject]@{
            ExitCode = $process.ExitCode
            Stdout   = $stdout.ToArray()
            Stderr   = $stderr.ToArray()
        }
    }
    finally {
        $process.Dispose()
        $stdout.Dispose()
        $stderr.Dispose()
    }

    if (-not $AllowFailure -and $result.ExitCode -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $($result.ExitCode) in '$WorkDir': $([System.Text.Encoding]::UTF8.GetString($result.Stderr))"
    }
    return $result
}

function Invoke-RepoGit {
    <#
    .SYNOPSIS
        Run a mutating git command inside a scratch repository, with pinned config.
    #>
    param(
        [Parameter(Mandatory)][string] $RepoDir,
        [Parameter(Mandatory)][string[]] $Arguments,
        [switch] $AllowFailure
    )

    return Invoke-Git -WorkDir $RepoDir -Arguments ($script:WriteConfig + $Arguments) -AllowFailure:$AllowFailure
}

function Write-RepoFile {
    <#
    .SYNOPSIS
        Write a repository file with LF endings and no BOM, creating parent directories.
    #>
    param(
        [Parameter(Mandatory)][string] $RepoDir,
        [Parameter(Mandatory)][string] $RelativePath,
        [Parameter(Mandatory)][string] $Content
    )

    $full = Join-Path $RepoDir $RelativePath
    $parent = Split-Path -Parent $full
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
        [void] (New-Item -ItemType Directory -Path $parent -Force)
    }
    [System.IO.File]::WriteAllText($full, $Content, $script:Utf8NoBom)
}

# ---------------------------------------------------------------------------------------
# fixture plumbing
# ---------------------------------------------------------------------------------------

function New-ScenarioRepo {
    <#
    .SYNOPSIS
        Delete and recreate one scratch repository, initialised on branch `main`.
    #>
    param([Parameter(Mandatory)][string] $Name)

    $dir = Join-Path $ScratchRoot $Name
    if (Test-Path -LiteralPath $dir) { Remove-Item -LiteralPath $dir -Recurse -Force }
    [void] (New-Item -ItemType Directory -Path $dir -Force)
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('init', '--quiet', '-b', 'main'))
    return $dir
}

function New-BaselineCommit {
    <#
    .SYNOPSIS
        Commit the shared two-file baseline (README.md + src/app.js) and return those paths.
    #>
    param([Parameter(Mandatory)][string] $RepoDir)

    Write-RepoFile -RepoDir $RepoDir -RelativePath 'README.md' -Content "# Fixture repository`n`nScratch repository used to generate the git-explorer status fixtures.`n"
    Write-RepoFile -RepoDir $RepoDir -RelativePath 'src/app.js' -Content "export function main() {`n  return 42`n}`n"
    [void] (Invoke-RepoGit -RepoDir $RepoDir -Arguments @('add', '--all'))
    [void] (Invoke-RepoGit -RepoDir $RepoDir -Arguments @('commit', '--quiet', '-m', 'baseline'))
    return @('README.md', 'src/app.js')
}

function Get-StatusRecords {
    <#
    .SYNOPSIS
        Split a captured porcelain stream into its NUL-separated records, minus the trailing one.
    #>
    param([AllowEmptyString()][Parameter(Mandatory)][string] $Text)

    return @($Text -split "`0" | Where-Object { $_ -ne '' })
}

function Assert-True {
    <#
    .SYNOPSIS
        Fail the run when a fixture does not look the way the scenario promises.
    #>
    param(
        [Parameter(Mandatory)][bool] $Condition,
        [Parameter(Mandatory)][string] $Message
    )

    if (-not $Condition) { throw "fixture assertion failed: $Message" }
}

function Write-StatusFixture {
    <#
    .SYNOPSIS
        Capture the status command in one repo and write `<name>.bin` / `<name>.json`.
    #>
    param(
        [Parameter(Mandatory)][string] $Name,
        [Parameter(Mandatory)][string] $RepoDir,
        [AllowEmptyCollection()][string[]] $RepoFiles = @(),
        [Parameter(Mandatory)][string] $Notes,
        [hashtable] $Environment = @{},
        [switch] $AllowFailure,
        [string[]] $StderrFor = @()
    )

    $result = Invoke-Git -WorkDir $RepoDir -Arguments ($script:StatusConfig + $script:StatusArgs) `
        -Environment $Environment -AllowFailure:$AllowFailure

    $text = [System.Text.Encoding]::UTF8.GetString($result.Stdout)
    $stderrText = [System.Text.Encoding]::UTF8.GetString($result.Stderr)

    if (-not $AllowFailure) {
        Assert-True -Condition ($result.Stderr.Length -eq 0) -Message "$Name wrote to stderr: $stderrText"
        Assert-True -Condition ($result.Stdout.Length -gt 0) -Message "$Name produced no stdout"
    }

    [System.IO.File]::WriteAllBytes((Join-Path $FixtureRoot "$Name.bin"), $result.Stdout)
    if ($StderrFor -contains 'stderr') {
        [System.IO.File]::WriteAllBytes((Join-Path $FixtureRoot "$Name.stderr.bin"), $result.Stderr)
    }

    $json = [ordered]@{
        scenario   = $Name
        command    = $script:StatusCommandText
        gitVersion = $script:GitVersion
        repoFiles  = @($RepoFiles)
        notes      = $Notes
    } | ConvertTo-Json -Depth 4
    $json = ($json -replace "`r`n", "`n").TrimEnd("`n") + "`n"
    [System.IO.File]::WriteAllText((Join-Path $FixtureRoot "$Name.json"), $json, $script:Utf8NoBom)

    $extra = if ($StderrFor -contains 'stderr') { " (+$Name.stderr.bin, $($result.Stderr.Length) B, exit $($result.ExitCode))" } else { '' }
    Write-Host ("  {0,-18} {1,5} B stdout, {2,2} record(s){3}" -f "$Name.bin", $result.Stdout.Length, @(Get-StatusRecords $text).Count, $extra)
    return $text
}

# ---------------------------------------------------------------------------------------
# scenarios
# ---------------------------------------------------------------------------------------

function New-CleanFixture {
    $dir = New-ScenarioRepo 'clean'
    $files = New-BaselineCommit $dir
    $text = Write-StatusFixture -Name 'clean' -RepoDir $dir -RepoFiles $files `
        -Notes 'One commit and a pristine working tree: only the branch headers appear, with no file records at all. Exercises the empty-status path and the branch.oid/branch.head header pair.'
    $records = Get-StatusRecords $text
    Assert-True -Condition ($records.Count -eq 2) -Message "clean expected 2 headers, saw $($records.Count) records"
    Assert-True -Condition ($records[1] -eq '# branch.head main') -Message 'clean expected branch.head main'
}

function New-StagedModifiedFixture {
    $dir = New-ScenarioRepo 'staged-modified'
    $files = New-BaselineCommit $dir
    Write-RepoFile -RepoDir $dir -RelativePath 'src/app.js' -Content "export function main() {`n  return 43`n}`n"
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('add', '--', 'src/app.js'))
    $text = Write-StatusFixture -Name 'staged-modified' -RepoDir $dir -RepoFiles $files `
        -Notes 'A tracked file is edited and staged, so the index letter is M and the worktree letter is a dot (XY = M.). Exercises the staged-only classification in group `staged`.'
    Assert-True -Condition (($text -split "`0")[2] -like '1 M.* src/app.js') -Message 'staged-modified expected a `1 M.` record for src/app.js'
}

function New-UnstagedModifiedFixture {
    $dir = New-ScenarioRepo 'unstaged-modified'
    $files = New-BaselineCommit $dir
    Write-RepoFile -RepoDir $dir -RelativePath 'src/app.js' -Content "export function main() {`n  return 44`n}`n"
    $text = Write-StatusFixture -Name 'unstaged-modified' -RepoDir $dir -RepoFiles $files `
        -Notes 'A tracked file is edited but not staged (XY = .M), which is the worktree-only case the panel shows under `Changes`. Exercises worktree mtimes against the index.'
    Assert-True -Condition (($text -split "`0")[2] -like '1 .M* src/app.js') -Message 'unstaged-modified expected a `1 .M` record for src/app.js'
}

function New-PartiallyStagedFixture {
    $dir = New-ScenarioRepo 'partially-staged'
    $files = New-BaselineCommit $dir
    Write-RepoFile -RepoDir $dir -RelativePath 'src/app.js' -Content "export function main() {`n  return 45`n}`n"
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('add', '--', 'src/app.js'))
    Write-RepoFile -RepoDir $dir -RelativePath 'src/app.js' -Content "export function main() {`n  return 46`n}`n"
    $text = Write-StatusFixture -Name 'partially-staged' -RepoDir $dir -RepoFiles $files `
        -Notes 'A file is staged and then edited again, so one record carries MM and must be listed in both the staged and the unstaged group. Exercises the split-staging case where a parser must not drop the entry from either group.'
    Assert-True -Condition (($text -split "`0")[2] -like '1 MM* src/app.js') -Message 'partially-staged expected a `1 MM` record for src/app.js'
}

function New-UntrackedFixture {
    $dir = New-ScenarioRepo 'untracked'
    $files = New-BaselineCommit $dir
    Write-RepoFile -RepoDir $dir -RelativePath 'new.txt' -Content "never added`n"
    Write-RepoFile -RepoDir $dir -RelativePath 'dir/new.txt' -Content "nested never added`n"
    $text = Write-StatusFixture -Name 'untracked' -RepoDir $dir -RepoFiles $files `
        -Notes 'A top-level file and a file inside a new directory are both never added, so --untracked-files=all lists the nested file individually instead of collapsing `dir/`. Exercises `?` records for untracked paths at two depths.'
    $records = Get-StatusRecords $text
    Assert-True -Condition (@($records | Where-Object { $_ -eq '? dir/new.txt' }).Count -eq 1) -Message 'untracked expected the nested file as its own record'
    Assert-True -Condition (@($records | Where-Object { $_ -eq '? new.txt' }).Count -eq 1) -Message 'untracked expected the top-level file as its own record'
}

function New-DeletedStagedFixture {
    $dir = New-ScenarioRepo 'deleted-staged'
    $files = New-BaselineCommit $dir
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('rm', '--quiet', '--', 'README.md'))
    $text = Write-StatusFixture -Name 'deleted-staged' -RepoDir $dir -RepoFiles $files `
        -Notes 'git rm removes README.md from the index and the worktree, so the record is `1 D.` with the index and worktree modes both zeroed (only the head side still has a real object id). Exercises a staged deletion, where the path no longer exists on disk and must come from the record and not from the filesystem.'
    Assert-True -Condition (($text -split "`0")[2] -like '1 D. N... 100644 000000 000000 * README.md') -Message 'deleted-staged expected D. with a zeroed index and worktree mode'
}

function New-DeletedUnstagedFixture {
    $dir = New-ScenarioRepo 'deleted-unstaged'
    $files = New-BaselineCommit $dir
    Remove-Item -LiteralPath (Join-Path $dir 'README.md') -Force
    $text = Write-StatusFixture -Name 'deleted-unstaged' -RepoDir $dir -RepoFiles $files `
        -Notes 'A plain filesystem delete leaves the index untouched, so the record is `1 .D` with a zeroed worktree mode and a real index object id. Exercises the unstaged deletion that git only notices as a missing worktree file.'
    Assert-True -Condition (($text -split "`0")[2] -like '1 .D N... 100644 100644 000000 * README.md') -Message 'deleted-unstaged expected .D with a zeroed worktree mode'
}

function New-RenamedStagedFixture {
    $dir = New-ScenarioRepo 'renamed-staged'
    Write-RepoFile -RepoDir $dir -RelativePath 'README.md' -Content "# Fixture repository`n`nScratch repository used to generate the git-explorer status fixtures.`n"
    Write-RepoFile -RepoDir $dir -RelativePath 'old.txt' -Content "line one`nline two`nline three`nline four`n"
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('add', '--all'))
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('commit', '--quiet', '-m', 'baseline'))
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('mv', '--', 'old.txt', 'new.txt'))
    $text = Write-StatusFixture -Name 'renamed-staged' -RepoDir $dir -RepoFiles @('README.md', 'old.txt') `
        -Notes 'git mv renames a tracked file, producing a `2` record whose own token holds the new path while the original path arrives as the next NUL-separated token (the split that only exists in -z). Exercises rename-score parsing (R100) and the separate original-path field.'
    $records = Get-StatusRecords $text
    $renameIndex = [array]::IndexOf($records, ($records | Where-Object { $_ -like '2 R.* new.txt' } | Select-Object -First 1))
    Assert-True -Condition ($renameIndex -ge 0) -Message 'renamed-staged expected a `2 R.` record ending in new.txt'
    Assert-True -Condition ($records[$renameIndex] -like '2 R.* R100 new.txt') -Message 'renamed-staged expected an R100 score on the rename record'
    Assert-True -Condition ($renameIndex + 1 -lt $records.Count -and $records[$renameIndex + 1] -eq 'old.txt') -Message 'renamed-staged expected old.txt in the token after the rename record'
}

function New-AddedStagedFixture {
    $dir = New-ScenarioRepo 'added-staged'
    $files = New-BaselineCommit $dir
    Write-RepoFile -RepoDir $dir -RelativePath 'added.txt' -Content "brand new file`n"
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('add', '--', 'added.txt'))
    $text = Write-StatusFixture -Name 'added-staged' -RepoDir $dir -RepoFiles $files `
        -Notes 'A brand-new file is staged, so the record is `1 A.` with zeroed head mode and head object id. Exercises the added-file record, whose old-side identity fields are all zeros rather than a hash.'
    Assert-True -Condition (($text -split "`0")[2] -like '1 A. N... 000000 100644 100644 0000000000000000000000000000000000000000 * added.txt') -Message 'added-staged expected A. with zeroed head fields'
}

function New-AheadBehindFixture {
    $dir = New-ScenarioRepo 'ahead-behind'
    $files = New-BaselineCommit $dir
    Write-RepoFile -RepoDir $dir -RelativePath 'src/app.js' -Content "export function main() {`n  return 100`n}`n"
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('commit', '--quiet', '-am', 'second commit'))

    # A real upstream: bare clone -> wire it as origin -> publish a divergent commit from a peer.
    $upstream = Join-Path $ScratchRoot 'ahead-behind-upstream.git'
    $peer = Join-Path $ScratchRoot 'ahead-behind-peer'
    foreach ($path in @($upstream, $peer)) {
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
    }
    [void] (Invoke-Git -WorkDir $ScratchRoot -Arguments ($script:WriteConfig + @('clone', '--quiet', '--bare', $dir, $upstream)))
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('remote', 'add', 'origin', $upstream))
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('fetch', '--quiet', 'origin'))
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('branch', '--quiet', '--set-upstream-to=origin/main', 'main'))

    [void] (Invoke-Git -WorkDir $ScratchRoot -Arguments ($script:WriteConfig + @('clone', '--quiet', $upstream, $peer)))
    Write-RepoFile -RepoDir $peer -RelativePath 'peer.txt' -Content "committed only in the peer clone`n"
    [void] (Invoke-RepoGit -RepoDir $peer -Arguments @('add', '--all'))
    [void] (Invoke-RepoGit -RepoDir $peer -Arguments @('commit', '--quiet', '-m', 'peer commit'))
    [void] (Invoke-RepoGit -RepoDir $peer -Arguments @('push', '--quiet', 'origin', 'main'))

    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('fetch', '--quiet', 'origin'))
    Write-RepoFile -RepoDir $dir -RelativePath 'local.txt' -Content "committed only in the fixture repo`n"
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('add', '--all'))
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('commit', '--quiet', '-m', 'local commit'))

    $text = Write-StatusFixture -Name 'ahead-behind' -RepoDir $dir -RepoFiles @($files + 'local.txt') `
        -Notes 'Two commits live in the fixture repo and two in its upstream (a bare clone published by a peer clone), so the branch has diverged by one commit in each direction and the working tree is clean. Exercises the `# branch.upstream` and `# branch.ab +1 -1` headers, whose numbers exist only once an upstream ref is known. (peer.txt is committed in the peer clone, not in the fixture repo.)'
    $records = Get-StatusRecords $text
    Assert-True -Condition ($records -contains '# branch.upstream origin/main') -Message 'ahead-behind expected # branch.upstream origin/main'
    Assert-True -Condition ($records -contains '# branch.ab +1 -1') -Message 'ahead-behind expected # branch.ab +1 -1'
    Assert-True -Condition (@($records | Where-Object { $_ -match '^[12u?] ' }).Count -eq 0) -Message 'ahead-behind expected a clean tree (headers only)'
}

function New-DetachedFixture {
    $dir = New-ScenarioRepo 'detached'
    $files = New-BaselineCommit $dir
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('checkout', '--quiet', '--detach', 'HEAD'))
    $text = Write-StatusFixture -Name 'detached' -RepoDir $dir -RepoFiles $files `
        -Notes 'HEAD is detached at the single commit, so branch.head reports the sentinel `(detached)` and no upstream or ahead/behind headers are emitted. Exercises the detached state a parser must map to a null branch name instead of the literal string.'
    $records = Get-StatusRecords $text
    Assert-True -Condition ($records -contains '# branch.head (detached)') -Message 'detached expected # branch.head (detached)'
    Assert-True -Condition (@($records | Where-Object { $_ -like '# branch.upstream*' }).Count -eq 0) -Message 'detached should not report an upstream'
}

function New-UnbornFixture {
    $dir = New-ScenarioRepo 'unborn'
    Write-RepoFile -RepoDir $dir -RelativePath 'staged.txt' -Content "staged before the first commit`n"
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('add', '--', 'staged.txt'))
    $text = Write-StatusFixture -Name 'unborn' -RepoDir $dir -RepoFiles @() `
        -Notes 'A repository with a staged file and no commit yet, so branch.oid reports the sentinel `(initial)` while the index still yields a normal `1 A.` record with a zeroed head object id. Exercises the unborn-HEAD header, where there is no commit hash to report.'
    $records = Get-StatusRecords $text
    Assert-True -Condition ($records -contains '# branch.oid (initial)') -Message 'unborn expected # branch.oid (initial)'
    Assert-True -Condition ($records -contains '# branch.head main') -Message 'unborn expected # branch.head main'
    Assert-True -Condition (@($records | Where-Object { $_ -like '1 A. N... 000000 100644 100644 000* staged.txt' }).Count -eq 1) -Message 'unborn expected a staged-add record for staged.txt'
}

function New-ConflictFixture {
    $dir = New-ScenarioRepo 'conflict'
    Write-RepoFile -RepoDir $dir -RelativePath 'conflict.txt' -Content "line one`nline two`nline three`n"
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('add', '--all'))
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('commit', '--quiet', '-m', 'base'))

    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('checkout', '--quiet', '-b', 'feature'))
    Write-RepoFile -RepoDir $dir -RelativePath 'conflict.txt' -Content "line one`nfeature change`nline three`n"
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('commit', '--quiet', '-am', 'feature change'))

    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('checkout', '--quiet', 'main'))
    Write-RepoFile -RepoDir $dir -RelativePath 'conflict.txt' -Content "line one`nmain change`nline three`n"
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('commit', '--quiet', '-am', 'main change'))

    # The merge is expected to stop with exit code 1 and leave conflict markers in the file.
    $merge = Invoke-RepoGit -RepoDir $dir -Arguments @('merge', '--no-ff', '--no-edit', 'feature') -AllowFailure
    Assert-True -Condition ($merge.ExitCode -eq 1) -Message "conflict expected the merge to exit 1, saw $($merge.ExitCode)"

    $text = Write-StatusFixture -Name 'conflict' -RepoDir $dir -RepoFiles @('conflict.txt') `
        -Notes 'Two branches edit the same line of conflict.txt and the merge is left unresolved, so the file is reported as a `u` record with a UU pair and three distinct stage object ids. Exercises the unmerged record shape, which carries two extra object ids compared with `1`/`2` records.'
    Assert-True -Condition (@((Get-StatusRecords $text) | Where-Object { $_ -like 'u UU * conflict.txt' }).Count -eq 1) -Message 'conflict expected a `u UU` record for conflict.txt'
}

function New-PathWithSpacesFixture {
    $dir = New-ScenarioRepo 'path-with-spaces'
    Write-RepoFile -RepoDir $dir -RelativePath 'README.md' -Content "# Fixture repository`n`nScratch repository used to generate the git-explorer status fixtures.`n"
    Write-RepoFile -RepoDir $dir -RelativePath 'docs/my notes file.txt' -Content "first revision`n"
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('add', '--all'))
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('commit', '--quiet', '-m', 'baseline'))

    Write-RepoFile -RepoDir $dir -RelativePath 'docs/my notes file.txt' -Content "second revision`n"
    Write-RepoFile -RepoDir $dir -RelativePath 'staged file.txt' -Content "staged new file with spaces in its name`n"
    [void] (Invoke-RepoGit -RepoDir $dir -Arguments @('add', '--', 'staged file.txt'))
    Write-RepoFile -RepoDir $dir -RelativePath 'loose file.txt' -Content "untracked file with spaces in its name`n"

    $text = Write-StatusFixture -Name 'path-with-spaces' -RepoDir $dir -RepoFiles @('README.md', 'docs/my notes file.txt') `
        -Notes 'Three records carry paths containing spaces: a modified tracked file (docs/my notes file.txt), a staged addition (staged file.txt) and an untracked file (loose file.txt). Exercises path extraction, since the path is the whole remainder of the record and a parser that splits on spaces would truncate or mis-split every one of them.'
    $records = Get-StatusRecords $text
    Assert-True -Condition (@($records | Where-Object { $_ -like '1 .M N... * docs/my notes file.txt' }).Count -eq 1) -Message 'path-with-spaces expected the modified record to end with the full spaced path'
    Assert-True -Condition ($records -contains '? loose file.txt') -Message 'path-with-spaces expected the full untracked path'
    Assert-True -Condition (@($records | Where-Object { $_ -like '1 A. N... * staged file.txt' }).Count -eq 1) -Message 'path-with-spaces expected the staged addition path'
}

function New-NotARepoFixture {
    $dir = Join-Path $ScratchRoot 'not-a-repo'
    if (Test-Path -LiteralPath $dir) { Remove-Item -LiteralPath $dir -Recurse -Force }
    [void] (New-Item -ItemType Directory -Path $dir -Force)
    Write-RepoFile -RepoDir $dir -RelativePath 'plain.txt' -Content "not a git repository`n"

    # GIT_CEILING_DIRECTORIES stops git's upward search for `.git` at the scratch root, so the
    # enclosing project checkout cannot turn this into a success.
    $text = Write-StatusFixture -Name 'not-a-repo' -RepoDir $dir -RepoFiles @() -AllowFailure -StderrFor @('stderr') `
        -Environment @{ GIT_CEILING_DIRECTORIES = $ScratchRoot } `
        -Notes 'A directory that is not a git repository at all: git exits 128, writes nothing to stdout and explains itself on stderr, which is captured verbatim in not-a-repo.stderr.bin. GIT_CEILING_DIRECTORIES is set to the scratch root for this run so the search for a .git directory cannot escape upward into the enclosing project checkout.'
    Assert-True -Condition ($text.Length -eq 0) -Message 'not-a-repo expected an empty stdout'
}

# ---------------------------------------------------------------------------------------
# run
# ---------------------------------------------------------------------------------------

[void] (New-Item -ItemType Directory -Path $ScratchRoot -Force)
if (-not (Test-Path -LiteralPath $script:GitBaseEnv.GIT_CONFIG_GLOBAL)) {
    [System.IO.File]::WriteAllText($script:GitBaseEnv.GIT_CONFIG_GLOBAL, '', $script:Utf8NoBom)
}

$versionBytes = (Invoke-Git -WorkDir $ScratchRoot -Arguments @('--version')).Stdout
$script:GitVersion = [System.Text.Encoding]::UTF8.GetString($versionBytes).Trim()

Write-Host "git-explorer status fixtures"
Write-Host "  git          : $($script:GitVersion)"
Write-Host "  fixtures     : $FixtureRoot"
Write-Host "  scratch      : $ScratchRoot"
Write-Host "  command      : $($script:StatusCommandText)"
Write-Host ''

New-CleanFixture
New-StagedModifiedFixture
New-UnstagedModifiedFixture
New-PartiallyStagedFixture
New-UntrackedFixture
New-DeletedStagedFixture
New-DeletedUnstagedFixture
New-RenamedStagedFixture
New-AddedStagedFixture
New-AheadBehindFixture
New-DetachedFixture
New-UnbornFixture
New-ConflictFixture
New-PathWithSpacesFixture
New-NotARepoFixture

Write-Host ''
Write-Host 'written:'
Get-ChildItem -LiteralPath $FixtureRoot -File |
    Where-Object { $_.Extension -in @('.bin', '.json') } |
    Sort-Object Name |
    ForEach-Object { Write-Host ("  {0,-32} {1,5} B" -f $_.Name, $_.Length) }
