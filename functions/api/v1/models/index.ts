/**
 * rcan.dev — /api/v1/models (RMN, Registry Model Number)
 * AI models + versions: LLM / VLA / perception / control. Sibling of robots/ (RRN);
 * logic lives in _registry-core. Identity = provider + model + version.
 */
import { makeOnRequest, MODELS } from "../_registry-core.js";
export const onRequest = makeOnRequest(MODELS);
