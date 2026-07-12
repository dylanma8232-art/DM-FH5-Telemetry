import { stateManager as s1 } from './server/src/services/state-manager.js';
import { stateManager as s2 } from './server/src/routes/../services/state-manager.js';
console.log(s1 === s2);
