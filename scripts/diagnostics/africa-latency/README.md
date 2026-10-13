# Bounded Africa diagnostic

Approved maximum: unchanged desktop control once; measured replay once only if the control fails specifically at Africa's unchanged 2500ms acceptance assertion. No third execution, mobile, broad suite, deployment or feature correction.

The push-only workflow targets codex/africa-latency-diagnostic. Release gate ignores that exact branch. Netlify settings must be freshly checked before push; only main/staging are admitted and no PR is created.

Both copies come from ef44beef72c44cccf65dcf5544805aba4db294f6, with exact base archive, lockfile, source, build and environment records. Control changes only post-case evidence collection in the test harness. The selected journey body/assertions are unchanged. Measurement probes wrap original bodies in synchronous begin/finally-end records without additional awaits; no scheduling or persistence behavior is changed. Storage wrappers preserve calls/arguments/returns/exceptions; instrumentation and CPU sampling have overhead and are diagnostic only.

The generated source copies, manifests, test logs, Playwright failure traces, long tasks, Chrome timeline/CPU profile, server CPU profile and app spans are uploaded for seven days. No promises of attribution from overlapping network durations alone. If reproduction/collection fails, stop and report inconclusive. Original whole-file CI ordering differs from this isolated desktop diagnostic and must remain explicit.
