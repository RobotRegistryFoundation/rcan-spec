/**
 * rcan.dev — /api/v1/components (RCN, Registry Component Number)
 * Physical parts/components: servos, cameras, compute, end-effectors, firmware.
 * Sibling of the robots/ (RRN) registry; logic lives in _registry-core.
 */
import { makeOnRequest, COMPONENTS } from "../_registry-core.js";
export const onRequest = makeOnRequest(COMPONENTS);
