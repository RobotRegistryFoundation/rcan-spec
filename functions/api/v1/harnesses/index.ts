/**
 * rcan.dev — /api/v1/harnesses (RHN, Registry Harness Number)
 * Runtime/harness builds: OpenCastor, robot-md-gateway, agent orchestrators,
 * Claude Code builds. Sibling of robots/ (RRN); logic lives in _registry-core.
 * Identity = name + version.
 */
import { makeOnRequest, HARNESSES } from "../_registry-core.js";
export const onRequest = makeOnRequest(HARNESSES);
