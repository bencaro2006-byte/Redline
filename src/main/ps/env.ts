// Hardened environment for elevated child processes (pure, unit-tested).
// The elevated PowerShell child must not pick up user-controlled module paths, .NET profilers
// or a planted PATH entry, and the Windows directory must not come from a spoofed variable.

const DEFAULT_SYSTEM_ROOT = 'C:\\Windows'
const SYSTEM_ROOT_PATTERN = /^[A-Za-z]:\\Windows$/i
const STRIPPED = /^(COR_|CORECLR_|COMPLUS_|DOTNET_|PSMODULEANALYSISCACHEPATH$|PSMODULEPATH$|PATH$|PATHEXT$|SYSTEMROOT$|WINDIR$|COMSPEC$)/i

type Env = Readonly<Record<string, string | undefined>>

/** The Windows directory, accepted only in the standard "<drive>:\Windows" form. */
export function safeSystemRoot(env: Env = process.env): string {
  const candidate = env['SystemRoot'] ?? env['SYSTEMROOT'] ?? env['windir']
  return candidate !== undefined && SYSTEM_ROOT_PATTERN.test(candidate) ? candidate : DEFAULT_SYSTEM_ROOT
}

/** process.env minus injection-prone variables, with module path and PATH pinned to System32. */
export function hardenedEnv(env: Env = process.env, systemRoot: string = safeSystemRoot(env)): Record<string, string> {
  const system32 = `${systemRoot}\\System32`
  const kept = Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined && !STRIPPED.test(entry[0]))
  return {
    ...Object.fromEntries(kept),
    SystemRoot: systemRoot,
    windir: systemRoot,
    ComSpec: `${system32}\\cmd.exe`,
    Path: [system32, systemRoot, `${system32}\\Wbem`, `${system32}\\WindowsPowerShell\\v1.0`].join(';'),
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
    PSModulePath: `${system32}\\WindowsPowerShell\\v1.0\\Modules`,
  }
}
