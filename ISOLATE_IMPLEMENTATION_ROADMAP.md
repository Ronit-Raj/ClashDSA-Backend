# Isolated C++ Execution Server — Implementation Roadmap

> **Target Agent**: This document is a complete, self-contained specification. Implement every section in order. Do not skip environment setup steps — isolate will silently fail or behave incorrectly without them.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Host OS Requirements](#2-host-os-requirements)
3. [System Dependencies](#3-system-dependencies)
4. [Installing isolate](#4-installing-isolate)
5. [Installing g++](#5-installing-g)
6. [Project Structure](#6-project-structure)
7. [Environment Configuration](#7-environment-configuration)
8. [Core Concepts: How isolate Works](#8-core-concepts-how-isolate-works)
9. [Isolate Flag Reference](#9-isolate-flag-reference)
10. [Metadata File Reference](#10-metadata-file-reference)
11. [API Specification](#11-api-specification)
12. [Implementation: Execution Pipeline](#12-implementation-execution-pipeline)
13. [Implementation: Server Code](#13-implementation-server-code)
14. [Security Hardening](#14-security-hardening)
15. [Error Handling Reference](#15-error-handling-reference)
16. [Testing Checklist](#16-testing-checklist)

---

## 1. Architecture Overview

```
Client
  │
  │  POST /execute  { source_code, stdin, compiler_options, limits }
  ▼
Express HTTP Server (Node.js)
  │
  │  spawns child_process for each phase
  ▼
┌─────────────────────────────────────────┐
│              isolate sandbox            │
│                                         │
│  Phase 1 — COMPILE                      │
│    /bin/bash compile.sh                 │
│    → /usr/bin/g++ [options] main.cpp    │
│    → produces a.out                     │
│                                         │
│  Phase 2 — RUN (only if compile OK)     │
│    /bin/bash run.sh                     │
│    → ./a.out                            │
│    stdin piped in, stdout/stderr out    │
└─────────────────────────────────────────┘
  │
  │  returns { stdout, stderr, compile_output, time, memory, status }
  ▼
Client
```

Each submission gets its own **box ID** (an integer). The sandbox is initialised, used, and destroyed per request. Concurrency is managed by maintaining a pool of available box IDs.

---

## 2. Host OS Requirements

**isolate only runs on Linux.** It uses Linux-specific kernel features:

- **Linux namespaces** — PID, mount, network, IPC isolation
- **cgroups v1** — memory and CPU accounting/limiting
- **`setuid` root binary** — isolate itself must be owned by root with the setuid bit set

### Minimum kernel version

Linux **3.18+** is required for cgroup memory limiting. Linux 4.4+ is recommended.

### Verify cgroups are available

```bash
# Must exist and be writable by root
ls /sys/fs/cgroup/memory
ls /sys/fs/cgroup/cpuacct

# Mount cgroups if not present (add to /etc/fstab for persistence)
mount -t cgroup -o memory cgroup /sys/fs/cgroup/memory
mount -t cgroup -o cpuacct cgroup /sys/fs/cgroup/cpuacct
```

### Do NOT run on

- macOS (no Linux namespaces)
- Windows (even with WSL — cgroup support is incomplete)
- Docker **without** `--privileged` flag (isolate needs to create namespaces)

If deploying inside Docker, the container **must** be run with `--privileged: true`.

---

## 3. System Dependencies

Run the following on a fresh **Ubuntu 22.04 LTS** or **Debian 12** host:

```bash
apt-get update && apt-get install -y \
  git \
  build-essential \
  libcap-dev \
  pkg-config \
  g++ \
  curl \
  sudo \
  asciidoc \
  libasciidoc-perl \
  xsltproc
```

### Install Node.js (v20 LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node --version   # should print v20.x.x
```

---

## 4. Installing isolate

isolate is **not** available via apt. It must be compiled from source. This is mandatory — there is no alternative.

### Clone and build

```bash
git clone https://github.com/ioi/isolate.git /opt/isolate
cd /opt/isolate
make isolate
make install
```

`make install` does two critical things:
1. Copies the binary to `/usr/local/bin/isolate`
2. Sets its owner to `root` and applies the **setuid** bit (`chmod u+s`)

### Verify installation

```bash
which isolate               # /usr/local/bin/isolate
ls -la $(which isolate)     # must show -rwsr-xr-x root root
isolate --version
```

The `s` in `-rwsr-xr-x` is the setuid bit. **Without it, isolate cannot create namespaces and will fail.**

### Configure cgroup support in isolate

Edit `/usr/local/etc/isolate` (created by `make install`):

```
cg_root = /sys/fs/cgroup
```

Verify the cgroup root is writable:

```bash
isolate --cg -b 1 --init   # should print a path like /var/local/lib/isolate/1
isolate --cg -b 1 --cleanup
```

If this works without errors, isolate is correctly installed.

---

## 5. Installing g++

The g++ binary must exist at a **known, absolute path** that you will hardcode into the compile command. Do not rely on PATH inside the sandbox, as the sandbox has a restricted environment.

```bash
apt-get install -y g++
which g++           # note this path — typically /usr/bin/g++
g++ --version       # verify it works
```

If you want a specific version:

```bash
apt-get install -y g++-12
which g++-12        # /usr/bin/g++-12
```

Use whichever path `which` reports as your `COMPILE_CMD` (see Section 7).

---

## 6. Project Structure

```
cpp-runner/
├── src/
│   ├── server.js           # Express HTTP server, route definitions
│   ├── executor.js         # Core isolate orchestration logic
│   ├── boxPool.js          # Manages available box IDs, concurrency
│   ├── parseMetadata.js    # Parses isolate metadata file into an object
│   ├── sanitize.js         # Sanitizes compiler_options string
│   └── config.js           # Reads environment variables, exports constants
├── .env                    # Environment configuration (never commit this)
├── .env.example            # Template for .env
├── package.json
└── README.md
```

---

## 7. Environment Configuration

Create a `.env` file at the project root. The server reads all tuneable parameters from here — **nothing is hardcoded** in the source files except the `.env` path and the configuration keys.

```dotenv
# ─── Server ────────────────────────────────────────────────────────────────
PORT=3000

# ─── isolate ───────────────────────────────────────────────────────────────
# Absolute path to the isolate binary
ISOLATE_PATH=/usr/local/bin/isolate

# Directory isolate uses for sandbox boxes. Set by isolate's make install.
# Default: /var/local/lib/isolate
ISOLATE_BOX_ROOT=/var/local/lib/isolate

# How many concurrent sandboxes are allowed. Each request occupies one box ID.
# Box IDs will be allocated in the range [0, MAX_CONCURRENT_JOBS - 1]
MAX_CONCURRENT_JOBS=10

# ─── Compiler ──────────────────────────────────────────────────────────────
# Absolute path to the g++ binary. Use `which g++` to find yours.
COMPILE_CMD=/usr/bin/g++

# Source file name written inside the sandbox box directory
SOURCE_FILE=main.cpp

# Output binary name produced by the compiler
OUTPUT_BINARY=a.out

# ─── Compile-phase resource limits ─────────────────────────────────────────
# These are intentionally generous — compilation is trusted code (g++ itself),
# but we still cap it to prevent infinite-loop preprocessor abuse.
COMPILE_CPU_TIME_LIMIT=10
COMPILE_WALL_TIME_LIMIT=20
COMPILE_MEMORY_LIMIT=524288      # 512 MB in KB
COMPILE_STACK_LIMIT=131072       # 128 MB in KB
COMPILE_MAX_PROCESSES=60
COMPILE_MAX_FILE_SIZE=4096       # 4 MB in KB — size of a.out

# ─── Run-phase resource limits (defaults, overridable per request) ──────────
# CPU time in seconds (decimal allowed). Time the OS actually runs the process.
CPU_TIME_LIMIT=5
MAX_CPU_TIME_LIMIT=15

# Extra seconds to wait after CPU time expires before force-killing.
# Allows reporting the actual time even when TLE.
CPU_EXTRA_TIME=1
MAX_CPU_EXTRA_TIME=5

# Wall-clock time in seconds. Guards against sleep() / I/O blocking.
# Should be significantly larger than CPU_TIME_LIMIT.
WALL_TIME_LIMIT=10
MAX_WALL_TIME_LIMIT=20

# Address space limit in KB.
MEMORY_LIMIT=131072              # 128 MB
MAX_MEMORY_LIMIT=524288          # 512 MB

# Stack size limit in KB.
STACK_LIMIT=65536                # 64 MB
MAX_STACK_LIMIT=131072           # 128 MB

# Max number of processes/threads the submitted program can spawn.
MAX_PROCESSES_AND_OR_THREADS=60
MAX_MAX_PROCESSES_AND_OR_THREADS=120

# Max size of any file the program creates or modifies, in KB.
MAX_FILE_SIZE=1024               # 1 MB
MAX_MAX_FILE_SIZE=4096           # 4 MB

# ─── Behavior ──────────────────────────────────────────────────────────────
# Merge program's stderr into its stdout in the run phase.
REDIRECT_STDERR_TO_STDOUT=false

# Whether requesters can pass custom compiler_options.
ENABLE_COMPILER_OPTIONS=true

# Max length of the compiler_options string.
MAX_COMPILER_OPTIONS_LENGTH=512
```

---

## 8. Core Concepts: How isolate Works

Understanding isolate's lifecycle is essential before writing any code.

### Lifecycle of one submission

```
1. isolate --cg -b <box_id> --init
      Creates /var/local/lib/isolate/<box_id>/box/   ← the writable sandbox root
      Returns the path to workdir on stdout

2. Write files into <workdir>/box/:
      main.cpp       ← user source code
      compile.sh     ← shell script that invokes g++

3. isolate --cg -b <box_id> [limits] --run -- /bin/bash compile.sh > compile_output.txt
      Runs compile.sh inside the sandbox.
      g++ produces a.out inside box/ if successful.
      Exit code 0 = success.

4. (Only if step 3 succeeded)
   Write run.sh into <workdir>/box/
   isolate --cg -b <box_id> [limits] --run -- /bin/bash run.sh
      < stdin.txt > stdout.txt 2> stderr.txt
      Runs the compiled binary with user input.

5. isolate --cg -b <box_id> --cleanup
      Destroys the sandbox. ALWAYS run this, even on error.
```

### The workdir vs boxdir distinction

- **workdir** = `/var/local/lib/isolate/<box_id>/`  — the outer directory, visible to the host
- **boxdir** = `/var/local/lib/isolate/<box_id>/box/` — mapped to `/` inside the sandbox

Files you place in `boxdir` on the host appear at `/box/<filename>` inside the sandbox. The compile script and source file live in `boxdir`. The stdin, stdout, stderr, and metadata files live in `workdir` (one level up) and are referenced by their absolute host paths in the isolate command.

### Why a shell script wrapper?

isolate's `--run` takes a single binary to `execve()`. By wrapping the compiler call in `/bin/bash compile.sh`, you gain:
- Shell variable substitution for `LD_LIBRARY_PATH` etc.
- The ability to pass arbitrary compiler flags without re-invoking isolate with different argv
- Consistent behavior for the run phase too (`./a.out` with `LD_LIBRARY_PATH` prefix)

---

## 9. Isolate Flag Reference

These are every flag used in both the compile and run isolate commands. Understand each one before implementing.

| Flag | Type | Used In | Description |
|---|---|---|---|
| `--cg` | boolean | both | Enable cgroup-based resource tracking. Required for total (not per-process) memory and CPU limits. Always pass this. |
| `-s` | boolean | both | Silent mode. Suppress isolate's own progress messages on stderr. |
| `-b <id>` | integer | both | Box identifier. Must be unique among all currently-running sandboxes. Range: 0–999 typically. |
| `-M <file>` | path | both | Write execution metadata to this file after the run. Parse it to get time, memory, exit code, status. |
| `--stderr-to-stdout` | boolean | compile | Redirect the sandboxed process's stderr to its stdout. Used in compile so compiler errors appear in compile_output. Do NOT use in run unless `REDIRECT_STDERR_TO_STDOUT=true`. |
| `-i <file>` | path | compile | Redirect file as stdin to the sandboxed process. Use `/dev/null` for compilation (compiler reads source file directly, not stdin). |
| `-t <seconds>` | decimal | both | CPU time limit. Counts only time the OS schedules the process on a CPU. Does not count sleep or I/O wait. |
| `-x <seconds>` | decimal | run | Extra CPU time. After the limit is hit, isolate waits this many more seconds before killing. Allows accurate time reporting for TLE. |
| `-w <seconds>` | decimal | both | Wall-clock time limit. Counts real elapsed time including sleep and I/O wait. Set this higher than `-t` to catch sleeping programs. |
| `-k <KB>` | integer | both | Stack size limit in kilobytes. |
| `-p<n>` | integer | both | Maximum number of processes and threads (note: **no space** between `-p` and the number). |
| `--cg-timing` | boolean | both | Use cgroup-based CPU timing (measures total CPU across all processes, not per-process). Use this when `enable_per_process_and_thread_time_limit` is false. |
| `--no-cg-timing` | boolean | both | Use per-process CPU timing instead of cgroup total. Use only when per-process limits are intentionally enabled. |
| `--cg-mem=<KB>` | integer | both | Memory limit via cgroups (total across all processes). Use when `enable_per_process_and_thread_memory_limit` is false. |
| `-m <KB>` | integer | both | Per-process memory limit. Use only when per-process memory limits are intentionally enabled. |
| `-f <KB>` | integer | both | Limit the size of any file the program creates or modifies. Prevents disk exhaustion. |
| `-E <KEY>=<VALUE>` | string | both | Set an environment variable inside the sandbox. Sandbox starts with an empty environment by default — you must explicitly pass anything the program needs. |
| `-E <KEY>` | string | both | Pass through an environment variable from the host into the sandbox unchanged. |
| `-d <path>:<opts>` | string | both | Bind-mount a host directory inside the sandbox. `noexec` prevents executing binaries from it. Use `-d /etc:noexec` to give the sandbox access to `/etc` (needed for DNS, locale, etc.) without allowing execution of files in it. |
| `--run` | boolean | both | Actually execute the process. Must come before `--`. |
| `--` | separator | both | Separates isolate flags from the command to run inside the sandbox. Everything after `--` is the command + arguments. |
| `--init` | boolean | setup | Initialise a new sandbox box. Must be run before `--run`. Prints workdir path to stdout. |
| `--cleanup` | boolean | teardown | Destroy the sandbox. Always run this, even after errors. |

### Environment variables to set inside the sandbox

Always pass these with `-E`:

```
-E HOME=/tmp
-E PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
-E LANG
-E LANGUAGE
-E LC_ALL
```

`HOME=/tmp` is required because some programs (and g++ itself for cache directories) attempt to write to `$HOME`. `/tmp` is writable inside the sandbox.

---

## 10. Metadata File Reference

After each `--run`, isolate writes a metadata file to the path specified by `-M`. Parse this file to determine what happened.

### File format

The file is newline-separated `key:value` pairs:

```
time:0.123
time-wall:0.456
max-rss:8192
cg-mem:16384
exitcode:0
exitsig:
status:
message:
```

### Parsing logic

Split each line on the **first colon only** (values can contain colons, e.g. in `message`).

```
key   = line.split(':')[0]
value = line.split(':').slice(1).join(':').trim()
```

### Key reference

| Key | Type | Description |
|---|---|---|
| `time` | decimal string | CPU time used in seconds |
| `time-wall` | decimal string | Wall-clock time used in seconds |
| `max-rss` | integer string | Peak memory usage in KB (from kernel, per-process max RSS). Use when not using cgroups. |
| `cg-mem` | integer string | Peak memory usage in KB as measured by cgroups (total). Use this when `--cg` is passed. |
| `exitcode` | integer string | Exit code returned by the process. `0` means clean exit. |
| `exitsig` | integer string | Signal number if killed by a signal (e.g., `11` for SIGSEGV). Empty if not killed by signal. |
| `status` | string | Outcome code. See table below. Empty means clean exit. |
| `message` | string | Human-readable detail. May contain the signal name or error description. |

### Status codes

| Status | Meaning | Map to |
|---|---|---|
| _(empty)_ | Process exited cleanly | Check exit code: 0 = Accepted, non-zero = Runtime Error |
| `TO` | Time limit exceeded | TLE |
| `SG` | Killed by signal | Runtime Error (use `exitsig` to identify which signal) |
| `RE` | Runtime error — non-zero exit code | NZEC (Non-Zero Exit Code) |
| `XX` | Internal isolate error | Box Error — something is wrong with the isolate setup |

---

## 11. API Specification

### `POST /execute`

Submit C++ source code for compilation and execution.

#### Request Body (JSON)

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `source_code` | string | yes | — | The full C++ source code to compile and run |
| `stdin` | string | no | `""` | Data to pipe into the program's stdin during execution |
| `compiler_options` | string | no | `""` | Extra flags to pass to g++ (e.g. `-O2 -std=c++17`). Shell metacharacters are stripped. |
| `cpu_time_limit` | number | no | `CPU_TIME_LIMIT` | CPU time limit in seconds. Must be ≤ `MAX_CPU_TIME_LIMIT`. |
| `cpu_extra_time` | number | no | `CPU_EXTRA_TIME` | Extra time after limit before force-kill. Must be ≤ `MAX_CPU_EXTRA_TIME`. |
| `wall_time_limit` | number | no | `WALL_TIME_LIMIT` | Wall-clock time limit in seconds. Must be ≤ `MAX_WALL_TIME_LIMIT`. |
| `memory_limit` | number | no | `MEMORY_LIMIT` | Memory limit in KB. Must be between 2048 and `MAX_MEMORY_LIMIT`. |
| `stack_limit` | number | no | `STACK_LIMIT` | Stack size limit in KB. Must be ≤ `MAX_STACK_LIMIT`. |
| `max_processes` | number | no | `MAX_PROCESSES_AND_OR_THREADS` | Max processes/threads. Must be ≤ `MAX_MAX_PROCESSES_AND_OR_THREADS`. |
| `max_file_size` | number | no | `MAX_FILE_SIZE` | Max file size created by program in KB. Must be ≤ `MAX_MAX_FILE_SIZE`. |
| `redirect_stderr_to_stdout` | boolean | no | `false` | If true, program's stderr is merged into stdout. |

#### Response Body (JSON)

| Field | Type | Description |
|---|---|---|
| `status` | string | One of: `"Accepted"`, `"Wrong Answer"`, `"Time Limit Exceeded"`, `"Memory Limit Exceeded"`, `"Runtime Error"`, `"Compile Error"`, `"Box Error"` |
| `stdout` | string \| null | Program's stdout output. Null if compile failed. |
| `stderr` | string \| null | Program's stderr output. Null if compile failed or if merged into stdout. |
| `compile_output` | string \| null | Compiler's stdout+stderr output. Null if compilation succeeded with no output. |
| `time` | number \| null | CPU time used in seconds. Null if not run. |
| `wall_time` | number \| null | Wall-clock time used in seconds. Null if not run. |
| `memory` | number \| null | Peak memory used in KB. Null if not run. |
| `exit_code` | number \| null | Process exit code. Null if not run or killed by signal. |
| `exit_signal` | number \| null | Signal number if killed by signal. Null otherwise. |
| `message` | string \| null | Additional detail from isolate (e.g. signal name). |

#### HTTP Status Codes

| Code | Meaning |
|---|---|
| `200` | Execution completed (does not mean the program was correct — check `status`) |
| `400` | Invalid request parameters |
| `503` | All sandbox slots are in use — try again later |
| `500` | Internal server error |

---

## 12. Implementation: Execution Pipeline

Implement each step as a separate async function in `executor.js`. They are called sequentially.

### Step 1 — Acquire a box ID

Before doing anything with isolate, acquire a free box ID from the pool. If no IDs are available, return HTTP 503 immediately. Release the ID in a `finally` block no matter what happens.

```
boxPool.acquire()  →  integer (0 to MAX_CONCURRENT_JOBS - 1)
                       or throws if pool is exhausted
```

### Step 2 — Initialize the sandbox

```bash
isolate --cg -b <boxId> --init
```

- Capture stdout — it prints the workdir path (e.g. `/var/local/lib/isolate/3`)
- Strip the trailing newline with `.trim()`
- Derive paths:
  - `workdir` = stdout of `--init`
  - `boxdir`  = `workdir + '/box'`
  - `sourceFile`    = `boxdir + '/main.cpp'`
  - `compileScript` = `boxdir + '/compile.sh'`
  - `runScript`     = `boxdir + '/run.sh'`
  - `stdinFile`     = `workdir + '/stdin.txt'`
  - `stdoutFile`    = `workdir + '/stdout.txt'`
  - `stderrFile`    = `workdir + '/stderr.txt'`
  - `metadataFile`  = `workdir + '/metadata.txt'`
  - `compileOutputFile` = `workdir + '/compile_output.txt'`

### Step 3 — Write input files

Write all files **before** running any isolate command:

```
fs.writeFileSync(sourceFile,    submission.source_code)
fs.writeFileSync(stdinFile,     submission.stdin ?? '')
fs.writeFileSync(stdoutFile,    '')
fs.writeFileSync(stderrFile,    '')
fs.writeFileSync(metadataFile,  '')
fs.writeFileSync(compileOutputFile, '')
```

For `metadataFile`, `stdoutFile`, `stderrFile`, `compileOutputFile`: use `execSync('touch <file> && chown $(whoami): <file>')` if isolate requires specific ownership. On some setups plain `writeFileSync` is sufficient — test this on your host.

### Step 4 — Generate compile.sh

Sanitize `compiler_options` before interpolating:

```js
// Strip shell metacharacters that could break out of the script
const safeOptions = (compilerOptions ?? '')
  .trim()
  .replace(/[^a-zA-Z0-9 =+\-_.]/g, '')  // allowlist: alphanumeric and safe flag chars
  // OR use the judge0 denylist approach:
  // .replace(/[$&;<>|`]/g, '')

const compileCmd = `${COMPILE_CMD} ${safeOptions} ${SOURCE_FILE}`
fs.writeFileSync(compileScript, compileCmd)
```

The resulting `compile.sh` will contain exactly one line:

```
/usr/bin/g++ -O2 -std=c++17 main.cpp
```

### Step 5 — Run compile phase inside isolate

```bash
isolate --cg \
  -s \
  -b <boxId> \
  -M <metadataFile> \
  --stderr-to-stdout \
  -i /dev/null \
  -t <COMPILE_CPU_TIME_LIMIT> \
  -x 0 \
  -w <COMPILE_WALL_TIME_LIMIT> \
  -k <COMPILE_STACK_LIMIT> \
  -p<COMPILE_MAX_PROCESSES> \
  --cg-timing \
  --cg-mem=<COMPILE_MEMORY_LIMIT> \
  -f <COMPILE_MAX_FILE_SIZE> \
  -E HOME=/tmp \
  -E PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  -E LANG -E LANGUAGE -E LC_ALL \
  -d /etc:noexec \
  --run \
  -- /bin/bash compile.sh \
  > <compileOutputFile>
```

**Important implementation notes:**

- Use Node.js `child_process.spawnSync` (not `exec`) to avoid shell injection. Build the flags as an array and pass them as `args`.
- The `> <compileOutputFile>` redirection **cannot** be used with `spawnSync` directly. Instead, pass `{ stdio: ['ignore', compileOutputFd, compileOutputFd] }` using a file descriptor opened with `fs.openSync`.
- Capture the process exit code from `spawnSync`'s `.status` field.
- Read the metadata file after the run: `fs.readFileSync(metadataFile, 'utf8')` → parse with `parseMetadata()`.
- Reset (truncate) the metadata file after reading it so it's clean for the run phase.

**Compile failure logic:**

```
if process.status !== 0:
    compileOutput = readFile(compileOutputFile)  // compiler error messages
    if metadata.status === 'TO':
        compileOutput = 'Compilation time limit exceeded.'
    return { status: 'Compile Error', compile_output: compileOutput, ... nulls for runtime fields }
```

### Step 6 — Generate run.sh

```js
fs.writeFileSync(runScript, `./a.out`)
```

If the binary requires `LD_LIBRARY_PATH` (for non-system g++ installs), prefix it:

```js
fs.writeFileSync(runScript, `LD_LIBRARY_PATH=/usr/lib/gcc/x86_64-linux-gnu/12 ./a.out`)
```

For the standard system g++ (`/usr/bin/g++`), `LD_LIBRARY_PATH` is not needed.

### Step 7 — Run execution phase inside isolate

```bash
isolate --cg \
  -s \
  -b <boxId> \
  -M <metadataFile> \
  [--stderr-to-stdout if redirect_stderr_to_stdout=true] \
  -t <cpu_time_limit> \
  -x <cpu_extra_time> \
  -w <wall_time_limit> \
  -k <stack_limit> \
  -p<max_processes> \
  --cg-timing \
  --cg-mem=<memory_limit> \
  -f <max_file_size> \
  -E HOME=/tmp \
  -E PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  -E LANG -E LANGUAGE -E LC_ALL \
  -d /etc:noexec \
  --run \
  -- /bin/bash run.sh
```

- Pipe stdin: `{ input: fs.readFileSync(stdinFile) }` in spawnSync options, or open `stdinFile` as an fd
- Redirect stdout to `stdoutFile`, stderr to `stderrFile` (unless merging)
- Read and parse metadata after run

### Step 8 — Determine result status

```js
function determineStatus(metadata) {
  if (metadata.status === 'TO') return 'Time Limit Exceeded'
  if (metadata.status === 'XX') return 'Box Error'
  if (metadata.status === 'SG') {
    // exitsig 9 = SIGKILL (often OOM), 11 = SIGSEGV, etc.
    return `Runtime Error (Signal ${metadata.exitsig})`
  }
  if (metadata.status === 'RE') return 'Runtime Error (NZEC)'
  // Empty status = clean exit
  if (parseInt(metadata.exitcode) === 0) return 'Accepted'
  return 'Runtime Error (NZEC)'
}
```

### Step 9 — Cleanup

**Always run this**, whether the job succeeded or failed:

```bash
isolate --cg -b <boxId> --cleanup
```

Run it inside a `finally` block. If cleanup itself fails (workdir still exists), log a warning but do not throw — the caller already has their result.

Also delete temporary files outside the box:
```
compileOutputFile, stdinFile, stdoutFile, stderrFile, metadataFile
```

Release the box ID back to the pool in the same `finally` block.

---

## 13. Implementation: Server Code

### `src/config.js`

Read all environment variables here. Export a frozen config object. Apply defaults and validate ranges. This is the only file that touches `process.env`.

```js
// Key exports (not exhaustive — implement all .env variables):
export default Object.freeze({
  PORT: parseInt(process.env.PORT ?? '3000'),
  ISOLATE_PATH: process.env.ISOLATE_PATH ?? '/usr/local/bin/isolate',
  ISOLATE_BOX_ROOT: process.env.ISOLATE_BOX_ROOT ?? '/var/local/lib/isolate',
  MAX_CONCURRENT_JOBS: parseInt(process.env.MAX_CONCURRENT_JOBS ?? '10'),
  COMPILE_CMD: process.env.COMPILE_CMD ?? '/usr/bin/g++',
  SOURCE_FILE: process.env.SOURCE_FILE ?? 'main.cpp',
  // ... all other variables from Section 7
})
```

### `src/boxPool.js`

Manages a set of integer box IDs. Uses a simple semaphore pattern.

```js
// Interface:
class BoxPool {
  constructor(maxConcurrent)    // fills available IDs 0..maxConcurrent-1
  acquire()                     // returns a free ID, or throws if none available
  release(id)                   // returns ID to the pool
  get availableCount()          // how many IDs are currently free
}
```

Use an array and a mutex (or a simple counter with a Set of in-use IDs). Since Node.js is single-threaded, a plain Set is safe as long as you acquire before any `await` and release in `finally`.

### `src/parseMetadata.js`

```js
// Input:  raw string content of the metadata file
// Output: plain object with keys: time, timeWall, cgMem, maxRss,
//         exitcode, exitsig, status, message
function parseMetadata(raw) {
  const result = {}
  for (const line of raw.trim().split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()
    result[key] = value
  }
  return result
}
```

### `src/sanitize.js`

```js
// Strips characters that could escape the shell script context.
// Uses a denylist of known-dangerous shell metacharacters.
function sanitizeCompilerOptions(raw) {
  if (!raw) return ''
  return raw
    .trim()
    .slice(0, MAX_COMPILER_OPTIONS_LENGTH)   // from config
    .replace(/[$&;<>|`\\'"(){}[\]!#]/g, '')  // strip shell metacharacters
}
```

### `src/executor.js`

The core module. Exports a single async function:

```js
async function execute(submission) → result
```

Where `submission` is the validated request body and `result` is the response body object.

Internally calls Steps 1–9 from Section 12. Uses `child_process.spawnSync` with the isolate binary path and an args array for all isolate invocations. **Never pass the command as a shell string to `exec`.** Always use `spawnSync` with an array.

```js
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import config from './config.js'
import { BoxPool } from './boxPool.js'
import { parseMetadata } from './parseMetadata.js'
import { sanitizeCompilerOptions } from './sanitize.js'

const pool = new BoxPool(config.MAX_CONCURRENT_JOBS)

export async function execute(submission) {
  const boxId = pool.acquire()  // throws if exhausted → 503
  let workdir = null

  try {
    // Step 2: init
    const initResult = spawnSync(config.ISOLATE_PATH, ['--cg', '-b', boxId, '--init'])
    workdir = initResult.stdout.toString().trim()
    const boxdir = path.join(workdir, 'box')

    // Step 3: write files
    // ... (see Section 12, Step 3)

    // Step 4: generate compile.sh
    // ... (see Section 12, Step 4)

    // Step 5: compile
    const compileArgs = buildCompileArgs(boxId, workdir, compileOutputFd)
    const compileResult = spawnSync(config.ISOLATE_PATH, compileArgs, { stdio: [...] })
    const compileMeta = parseMetadata(fs.readFileSync(metadataFile, 'utf8'))
    resetFile(metadataFile)

    if (compileResult.status !== 0) {
      return buildCompileErrorResult(compileOutputFile, compileMeta)
    }

    // Step 6: generate run.sh
    // ...

    // Step 7: run
    const runArgs = buildRunArgs(boxId, workdir, submission)
    const runResult = spawnSync(config.ISOLATE_PATH, runArgs, { stdio: [...] })
    const runMeta = parseMetadata(fs.readFileSync(metadataFile, 'utf8'))

    // Step 8: determine result
    return buildRunResult(runMeta, stdoutFile, stderrFile, compileOutputFile, submission)

  } finally {
    // Step 9: cleanup — always
    spawnSync(config.ISOLATE_PATH, ['--cg', '-b', boxId, '--cleanup'])
    pool.release(boxId)
  }
}
```

### `src/server.js`

```js
import express from 'express'
import { execute } from './executor.js'
import config from './config.js'

const app = express()
app.use(express.json({ limit: '512kb' }))

app.post('/execute', async (req, res) => {
  // 1. Validate required fields
  if (!req.body.source_code || typeof req.body.source_code !== 'string') {
    return res.status(400).json({ error: 'source_code is required and must be a string' })
  }

  // 2. Clamp numeric limits to configured maximums
  const submission = {
    source_code: req.body.source_code,
    stdin: req.body.stdin ?? '',
    compiler_options: req.body.compiler_options ?? '',
    cpu_time_limit:   clamp(req.body.cpu_time_limit,  0.1, config.MAX_CPU_TIME_LIMIT,  config.CPU_TIME_LIMIT),
    cpu_extra_time:   clamp(req.body.cpu_extra_time,   0,   config.MAX_CPU_EXTRA_TIME,  config.CPU_EXTRA_TIME),
    wall_time_limit:  clamp(req.body.wall_time_limit,  1,   config.MAX_WALL_TIME_LIMIT, config.WALL_TIME_LIMIT),
    memory_limit:     clamp(req.body.memory_limit,  2048,   config.MAX_MEMORY_LIMIT,    config.MEMORY_LIMIT),
    stack_limit:      clamp(req.body.stack_limit,      0,   config.MAX_STACK_LIMIT,     config.STACK_LIMIT),
    max_processes:    clamp(req.body.max_processes,    1,   config.MAX_MAX_PROCESSES_AND_OR_THREADS, config.MAX_PROCESSES_AND_OR_THREADS),
    max_file_size:    clamp(req.body.max_file_size,    0,   config.MAX_MAX_FILE_SIZE,   config.MAX_FILE_SIZE),
    redirect_stderr_to_stdout: req.body.redirect_stderr_to_stdout === true,
  }

  try {
    const result = await execute(submission)
    res.status(200).json(result)
  } catch (err) {
    if (err.message === 'BOX_POOL_EXHAUSTED') {
      return res.status(503).json({ error: 'All execution slots are busy. Try again later.' })
    }
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

function clamp(value, min, max, defaultValue) {
  if (value == null || isNaN(Number(value))) return defaultValue
  return Math.min(Math.max(Number(value), min), max)
}

app.listen(config.PORT, () => {
  console.log(`cpp-runner listening on port ${config.PORT}`)
})
```

### `package.json`

```json
{
  "name": "cpp-runner",
  "version": "1.0.0",
  "type": "module",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js"
  },
  "dependencies": {
    "express": "^4.19.2"
  }
}
```

---

## 14. Security Hardening

### Mandatory

- **Never pass user input through a shell string** (`exec`, `execSync` with a string). Always use `spawnSync` with an argv array.
- **Sanitize `compiler_options`** before writing to `compile.sh`. If the string can escape the shell script, an attacker can execute arbitrary commands as the worker user.
- **The worker process must not run as root.** Create a dedicated unprivileged user (e.g. `judge0`) and run the Node.js server as that user. The isolate binary is setuid root and will escalate internally as needed.
- **Validate and clamp all numeric limits** on the server side. Never trust client-supplied limits — always enforce maximums from config.
- **Always run cleanup** in a `finally` block. A leaked sandbox box can be hijacked by subsequent requests with the same box ID.

### Strongly Recommended

- Set a **request body size limit** in Express (`express.json({ limit: '512kb' })`). Prevents source code larger than a threshold from being submitted.
- Add a **request timeout** at the HTTP level (e.g. using `server.timeout` in Node.js http server, or a middleware). Set it to `MAX_WALL_TIME_LIMIT + COMPILE_WALL_TIME_LIMIT + 5` seconds.
- **Do not expose this server directly to the internet.** Put it behind a reverse proxy (nginx) and apply rate limiting there.
- **Log every execution** with timestamp, box ID, status, time, and memory. Do not log source code — it may contain sensitive data.
- Run the server inside **Docker with `--privileged`** (required for isolate) but with all other capabilities dropped via `--cap-drop ALL --cap-add SYS_ADMIN`.

### Why `compile.sh` instead of passing g++ directly to isolate

If you passed g++ directly to isolate's `--run -- /usr/bin/g++ -O2 main.cpp`, the filename `main.cpp` and all compiler flags would be part of isolate's argv. This is actually safe for the compiler invocation itself but becomes problematic when you need to:
- Support `compiler_options` with spaces (the shell script handles word splitting correctly)
- Set `LD_LIBRARY_PATH` for run (requires shell evaluation)
- Support future languages that need shell features (pipes, command substitution)

The shell script wrapper is the safer, more extensible pattern.

---

## 15. Error Handling Reference

| Situation | Root Cause | How to Handle |
|---|---|---|
| `isolate --init` fails | Box ID already in use, or isolate not installed/setuid | Log and throw `Box Error`. Do not proceed. Always cleanup. |
| `compile.sh` exits non-zero, `metadata.status` empty | g++ returned non-zero (syntax error etc.) | Return `Compile Error` with `compile_output` containing g++ messages. |
| `compile.sh` exits non-zero, `metadata.status === 'TO'` | g++ took too long (rare — infinite template recursion etc.) | Return `Compile Error` with message `"Compilation time limit exceeded."` |
| `compile.sh` exits non-zero, `metadata.status === 'XX'` | isolate internal error | Return `Box Error`. Check isolate installation. |
| `a.out` not created after successful compile | Linker error produced non-zero exit even though isolate exited 0 | This should not happen — if compile exit code is 0, `a.out` exists. If it doesn't, treat as `Compile Error`. |
| Run exits, `metadata.status === 'TO'` | CPU time limit exceeded | Return `Time Limit Exceeded` |
| Run exits, `metadata.status === 'SG'`, `exitsig === 9` | SIGKILL — usually OOM | Return `Memory Limit Exceeded` or `Runtime Error` |
| Run exits, `metadata.status === 'SG'`, `exitsig === 11` | SIGSEGV — segmentation fault | Return `Runtime Error (SIGSEGV)` |
| Run exits, `metadata.status === 'RE'` | Non-zero exit code | Return `Runtime Error (NZEC)` |
| `spawnSync` returns `status === null` | The isolate process itself was killed by a signal | Return `Box Error` |
| Pool exhausted | Too many concurrent requests | Return HTTP 503 immediately, before touching isolate |
| Cleanup fails | Workdir still exists after `--cleanup` | Log warning, still release box ID — next `--init` will fail and surface a `Box Error` |

---

## 16. Testing Checklist

Verify each of the following manually before deploying:

### Environment

- [ ] `isolate --version` prints without error
- [ ] `ls -la $(which isolate)` shows setuid bit (`-rwsr-xr-x root root`)
- [ ] `isolate --cg -b 0 --init` succeeds and prints a workdir path
- [ ] `isolate --cg -b 0 --cleanup` succeeds and removes the workdir
- [ ] `/sys/fs/cgroup/memory` exists and is mounted
- [ ] `g++ --version` prints without error
- [ ] Node.js server starts with `npm start` without errors

### Happy Path

- [ ] `POST /execute` with `#include<iostream>\nint main(){std::cout<<"hello";return 0;}` returns `status: "Accepted"`, `stdout: "hello"`
- [ ] Submission with `stdin` data receives it correctly in the program
- [ ] `compiler_options: "-O2 -std=c++17"` is accepted and applied (verify by using a C++17 feature)
- [ ] Multiple concurrent requests all complete without box ID collision

### Resource Limits

- [ ] Infinite loop program returns `status: "Time Limit Exceeded"`
- [ ] Program allocating > `MEMORY_LIMIT` KB returns `status: "Memory Limit Exceeded"` or `"Runtime Error"`
- [ ] Program calling `exit(1)` returns `status: "Runtime Error (NZEC)"`, `exit_code: 1`
- [ ] Program causing SIGSEGV returns `exit_signal: 11`

### Compile Errors

- [ ] Submission with syntax error returns `status: "Compile Error"` and non-empty `compile_output`
- [ ] `compile_output` is null when compilation succeeds cleanly

### Security

- [ ] `compiler_options: "; rm -rf /"` is sanitized and does not execute the `rm` command
- [ ] `compiler_options: "$(cat /etc/passwd)"` is sanitized
- [ ] Source code that forks a large number of processes hits the process limit and returns `Runtime Error`
- [ ] Source code that writes a large file hits the file size limit
- [ ] After each request (including failures), the workdir `/var/local/lib/isolate/<id>` no longer exists

### Concurrency

- [ ] Sending `MAX_CONCURRENT_JOBS + 1` simultaneous requests causes the last one to receive HTTP 503
- [ ] After the concurrent requests complete, the pool is fully restored (subsequent requests succeed)