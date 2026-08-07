/**
 * Cross-module bootstrap-phase timing accumulator.
 *
 * The document-sync loop (useDocumentCompilerSync) runs the bootstrap phases
 * (template-package IPC, mitex-package IPC, AST transform, worker bootstrap
 * compile) but the per-phase timing needs to reach the harness report, which
 * lives in usePerfReplay. This module is the bridge: the sync loop records
 * phase timestamps here; the harness reads them into the report.
 *
 * Reset on each new bootstrap so a reopened project's phases don't accumulate
 * the prior session's. Outside the debug/harness path this stays empty and
 * costs nothing.
 */
export interface BootstrapPhaseTimings {
    /** IPC round-trip for TauriApi.loadTemplatePackageFiles (template pkg files). */
    templatePackageLoadMs?: number;
    /** IPC round-trip for TauriApi.loadPackageFiles (mitex). */
    dependencyPackageLoadMs?: number;
    /** documentAstForCompile transform duration. */
    astTransformMs?: number;
    /** Worker round-trip for CompilerClient.bootstrap (VFS write + sync + compile). */
    workerBootstrapMs?: number;
}

let timings: BootstrapPhaseTimings = {};

export const setBootstrapPhase = (phase: keyof BootstrapPhaseTimings, ms: number): void => {
    timings[phase] = ms;
};

export const getBootstrapPhases = (): BootstrapPhaseTimings => timings;

export const resetBootstrapPhases = (): void => {
    timings = {};
};
